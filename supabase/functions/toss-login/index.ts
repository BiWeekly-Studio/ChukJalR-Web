/**
 * 토스 로그인 ↔ Supabase 세션 교환 (명세 14.5)
 *
 * 흐름
 *   1. 미니앱 클라이언트가 TossAuth.login() 으로 authorizationCode 를 받아 이리로 보낸다
 *   2. 여기서 토스에 그 코드를 accessToken 으로 교환한다
 *   3. accessToken 으로 사용자 정보를 조회해 userKey(고유 식별자)를 얻는다
 *   4. userKey 에 대응하는 Supabase 유저를 찾거나 만들고, 세션을 발급해 돌려준다
 *
 * 이 함수가 서버에 있어야 하는 이유: 토스 서버 API 는 mTLS 클라이언트 인증서로 호출 주체를
 * 확인한다. 인증서와 개인 키는 클라이언트에 절대 둘 수 없다.
 *
 * 필요한 시크릿 (supabase secrets set ...)
 *   TOSS_CLIENT_CERT   토스 콘솔에서 발급받은 클라이언트 인증서 (PEM)
 *   TOSS_CLIENT_KEY    그 개인 키 (PEM)
 *   TOSS_AUTH_PEPPER   userKey → Supabase 비밀번호 유도에 쓰는 서버 전용 비밀값
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (플랫폼이 자동 주입)
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOSS_API = 'https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/user/oauth2';

/** 합성 이메일의 도메인. 실제로 메일이 가지 않도록 예약 TLD(.invalid)를 쓴다 */
const SYNTHETIC_DOMAIN = 'toss.invalid';

interface TossTokenResponse {
  resultType: string;
  success?: { accessToken: string; expiresIn: number; refreshToken: string; tokenType: string };
  error?: unknown;
}

interface TossUserResponse {
  resultType: string;
  success?: { userKey: string; name?: string | null; email?: string | null };
  error?: unknown;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * userKey 에서 Supabase 비밀번호를 유도한다.
 *
 * 매번 같은 값이 나오므로 어디에도 저장할 필요가 없고, pepper 를 모르면 만들 수 없다.
 * 토스가 준 userKey 하나로 Supabase 세션까지 이어붙이기 위한 다리일 뿐,
 * 사용자가 입력하거나 보게 되는 값이 아니다.
 */
async function derivePassword(userKey: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userKey));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const cert = Deno.env.get('TOSS_CLIENT_CERT');
  const key = Deno.env.get('TOSS_CLIENT_KEY');
  const pepper = Deno.env.get('TOSS_AUTH_PEPPER');
  if (!cert || !key || !pepper) {
    console.error('토스 로그인 시크릿이 설정되지 않았습니다');
    return json({ error: 'SERVER_NOT_CONFIGURED' }, 500);
  }

  let body: { authorizationCode?: string; referrer?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'BAD_REQUEST' }, 400);
  }
  const { authorizationCode, referrer } = body;
  if (!authorizationCode || !referrer) return json({ error: 'MISSING_CODE' }, 400);

  // mTLS: 인증서는 TLS 수립 단계에서 쓰이므로 헤더에 나타나지 않는다.
  // Deno.createHttpClient 는 불안정 API 라, 없는 런타임이면 여기서 분명히 실패시킨다.
  const createHttpClient = (Deno as unknown as {
    createHttpClient?: (o: { cert: string; key: string }) => unknown;
  }).createHttpClient;
  if (typeof createHttpClient !== 'function') {
    console.error('이 런타임은 mTLS(Deno.createHttpClient)를 지원하지 않습니다');
    return json({ error: 'MTLS_UNSUPPORTED' }, 500);
  }
  const client = createHttpClient({ cert, key });

  try {
    // 1) 인가 코드 → accessToken
    const tokenRes = await fetch(`${TOSS_API}/generate-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizationCode, referrer }),
      client,
    } as RequestInit);
    const token = (await tokenRes.json()) as TossTokenResponse;
    if (!tokenRes.ok || token.resultType !== 'SUCCESS' || !token.success) {
      console.error('토스 토큰 교환 실패', tokenRes.status, token.error);
      return json({ error: 'TOSS_TOKEN_FAILED' }, 502);
    }

    // 2) accessToken → 사용자 정보 (userKey 가 우리가 필요한 전부다)
    const meRes = await fetch(`${TOSS_API}/login-me`, {
      headers: { Authorization: `Bearer ${token.success.accessToken}` },
      client,
    } as RequestInit);
    const me = (await meRes.json()) as TossUserResponse;
    if (!meRes.ok || me.resultType !== 'SUCCESS' || !me.success?.userKey) {
      console.error('토스 사용자 조회 실패', meRes.status, me.error);
      return json({ error: 'TOSS_USER_FAILED' }, 502);
    }

    const { userKey, name } = me.success;
    const email = `${userKey.toLowerCase()}@${SYNTHETIC_DOMAIN}`;
    const password = await derivePassword(userKey, pepper);

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 3) 처음 온 사람이면 만든다. handle 은 on_auth_user_created 트리거가 집어간다.
    let session = await admin.auth.signInWithPassword({ email, password });
    if (session.error) {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // 합성 주소라 확인 메일을 보낼 곳이 없다
        user_metadata: { toss_user_key: userKey, handle: name ?? undefined },
      });
      if (created.error) {
        console.error('Supabase 유저 생성 실패', created.error);
        return json({ error: 'USER_CREATE_FAILED' }, 500);
      }
      session = await admin.auth.signInWithPassword({ email, password });
    }

    if (session.error || !session.data.session) {
      console.error('세션 발급 실패', session.error);
      return json({ error: 'SESSION_FAILED' }, 500);
    }

    // 4) 클라이언트는 이 두 토큰으로 setSession 한다
    return json({
      access_token: session.data.session.access_token,
      refresh_token: session.data.session.refresh_token,
    });
  } catch (err) {
    console.error('토스 로그인 처리 중 오류', err);
    return json({ error: 'UNEXPECTED' }, 500);
  }
});
