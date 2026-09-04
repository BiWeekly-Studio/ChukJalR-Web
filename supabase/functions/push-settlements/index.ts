/**
 * 정산 결과 푸시 (명세 12.2)
 *
 * 마감·킥오프처럼 시각이 미리 정해진 알림은 기기가 스스로 예약한다. 정산은
 * 서버만 아는 시점이라 이것만 푸시로 보낸다.
 *
 * APNs 는 ES256 으로 서명한 JWT 로 인증한다. 토큰은 최대 1시간 쓸 수 있고 20분
 * 안에 다시 만들면 거절당하므로, 함수 인스턴스가 살아 있는 동안 재사용한다.
 *
 * 두 번 보내지 않는 방법: 보낸 것을 push_log 에 남기고, 다음 실행은 거기 없는 것만
 * 고른다. 발송이 중간에 끊겨도 다시 돌리면 안 보낸 것만 나간다.
 */

const APNS_HOST = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;

type Environment = keyof typeof APNS_HOST;

interface Pending {
  user_id: string;
  prediction_id: number;
  delta_rating: number;
  points: number;
  hit: boolean;
  home_name: string;
  away_name: string;
  tokens: string[];
}

/* ------------------------------------------------------------------ 인증 토큰 */

let cached: { jwt: string; madeAt: number } | null = null;

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** '-----BEGIN PRIVATE KEY-----' 로 감싼 .p8 을 CryptoKey 로 */
async function importKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function authToken(keyId: string, teamId: string, pem: string): Promise<string> {
  // 20분 안에 새로 만들면 APNs 가 TooManyProviderTokenUpdates 로 막는다
  if (cached && Date.now() - cached.madeAt < 30 * 60_000) return cached.jwt;

  const header = base64url(new TextEncoder().encode(
    JSON.stringify({ alg: 'ES256', kid: keyId })));
  const payload = base64url(new TextEncoder().encode(
    JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })));
  const signing = `${header}.${payload}`;

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await importKey(pem),
    new TextEncoder().encode(signing));

  const jwt = `${signing}.${base64url(new Uint8Array(signature))}`;
  cached = { jwt, madeAt: Date.now() };
  return jwt;
}

/* ------------------------------------------------------------------ 발송 */

interface SendResult { ok: boolean; gone: boolean; reason?: string }

async function send(
  host: string, token: string, jwt: string, topic: string, body: unknown
): Promise<SendResult> {
  const res = await fetch(`${host}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      // 결과 알림은 지금 봐야 의미가 있다. 절전 모드에서도 깨운다.
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true, gone: false };

  const text = await res.text();
  // 410 Gone / BadDeviceToken = 앱을 지웠거나 토큰이 죽었다. 지워야 한다.
  const gone = res.status === 410 || text.includes('BadDeviceToken')
    || text.includes('Unregistered');
  return { ok: false, gone, reason: `${res.status} ${text.slice(0, 120)}` };
}

function message(p: Pending): { title: string; body: string } {
  const match = `${p.home_name} vs ${p.away_name}`;
  const delta = p.delta_rating > 0 ? `+${p.delta_rating}` : `−${Math.abs(p.delta_rating)}`;
  return p.hit
    ? { title: '적중했어요', body: `${match} · 지수 ${delta} · +${p.points}점` }
    : { title: '아쉬웠어요', body: `${match} · 지수 ${delta}` };
}

/* ------------------------------------------------------------------ 엔트리 */

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const keyId = Deno.env.get('APNS_KEY_ID');
    const teamId = Deno.env.get('APNS_TEAM_ID');
    const pem = Deno.env.get('APNS_KEY');
    const topic = Deno.env.get('APNS_TOPIC');
    if (!url || !serviceKey || !keyId || !teamId || !pem || !topic) {
      return Response.json({ error: 'missing env' }, { status: 500 });
    }

    // 크론이 pg_net 으로 부르므로 Authorization 헤더를 실을 수 없다. 같은 토큰으로 막는다.
    const syncToken = Deno.env.get('SYNC_TOKEN');
    if (syncToken && req.headers.get('x-sync-token') !== syncToken) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }

    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    };
    const rpc = async (name: string, body: unknown) => {
      const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${name} ${res.status}: ${await res.text()}`);
      return res;
    };

    const minutes = Number(new URL(req.url).searchParams.get('minutes')) || 60;
    const pending: Pending[] = await (await rpc(
      'pending_settlement_pushes', { p_since_minutes: minutes })).json();

    if (pending.length === 0) {
      return Response.json({ ok: true, sent: 0, skipped: true });
    }

    const jwt = await authToken(keyId, teamId, pem);
    const environment = (Deno.env.get('APNS_ENV') ?? 'production') as Environment;
    const host = APNS_HOST[environment] ?? APNS_HOST.production;

    let sent = 0, dropped = 0;
    const failures: string[] = [];
    const logged: { user_id: string; kind: string; ref_id: number }[] = [];

    for (const p of pending) {
      const { title, body } = message(p);
      let anyDelivered = false;

      for (const token of p.tokens) {
        const r = await send(host, token, jwt, topic, {
          aps: { alert: { title, body }, sound: 'default' },
          // 알림을 누르면 그 경기로 들어간다
          predictionId: p.prediction_id,
        });
        if (r.ok) { sent += 1; anyDelivered = true; }
        else if (r.gone) { await rpc('drop_push_token', { p_token: token }); dropped += 1; }
        else if (r.reason) failures.push(r.reason);
      }

      // 한 기기라도 받았으면 보낸 것으로 친다. 아니면 다음 주기에 다시 시도한다.
      if (anyDelivered) {
        logged.push({ user_id: p.user_id, kind: 'settlement', ref_id: p.prediction_id });
      }
    }

    if (logged.length) {
      const res = await fetch(`${url}/rest/v1/push_log`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(logged),
      });
      if (!res.ok) throw new Error(`push_log ${res.status}: ${await res.text()}`);
    }

    return Response.json({
      ok: true, pending: pending.length, sent, dropped,
      failures: failures.slice(0, 3),
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
});
