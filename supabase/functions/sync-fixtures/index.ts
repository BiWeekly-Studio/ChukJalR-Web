/**
 * API-Football → Postgres 수집기 (명세 12.1, 14.1)
 *
 * 설계 목표는 하나다: **API 호출을 최소로 쓴다.**
 *
 *   ?mode=schedule   주 1회. 향후 1개월 일정을 리그별로 받아온다.        4회
 *   ?mode=teams      시즌 시작 및 월 1회. 팀 카탈로그.                  4회
 *   ?mode=results    10분마다. 단, 지금 열려 있고 아직 안 끝난 경기가
 *                    있을 때만 호출한다. 없으면 API를 아예 부르지 않는다. 0~2회
 *
 * results 모드는 폴링할 경기 id 를 DB 에서 먼저 뽑아 `?ids=` 로 정확히 그것만
 * 요청한다. 리그 전체나 날짜 전체를 훑지 않으므로 응답도 작고 호출도 적다.
 *
 * 주간 예산 (유럽 주말 기준)
 *   일정 4 + 팀 1 + 결과 폴링 약 220  ≈ 225회/주  ≈ 32회/일
 *   → 무료 플랜(100회/일)으로도 운영 가능하다.
 */

const API_BASE = 'https://v3.football.api-sports.io';
const LEAGUES = [39, 140, 78, 135]; // EPL, 라리가, 분데스리가, 세리에A
const SCHEDULE_DAYS = 30;
const IDS_PER_CALL = 20; // API-Football 의 ?ids= 상한

type State = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'VOID';

/** API-Football status.short → 우리 상태 */
function mapState(short: string): State {
  if (['NS', 'TBD'].includes(short)) return 'SCHEDULED';
  if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'].includes(short)) return 'LIVE';
  if (['FT', 'AET', 'PEN'].includes(short)) return 'FINISHED';
  return 'VOID'; // PST, CANC, ABD, AWD, WO
}

interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string }; venue: { name: string | null } };
  league: { id: number; season: number; round: string };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  score: { fulltime: { home: number | null; away: number | null } };
}

interface Api {
  get(path: string): Promise<{ response: unknown[]; paging?: { current: number; total: number } }>;
  calls: number;
}

function api(key: string): Api {
  const self: Api = {
    calls: 0,
    async get(path) {
      self.calls += 1;
      const res = await fetch(`${API_BASE}${path}`, { headers: { 'x-apisports-key': key } });
      if (!res.ok) throw new Error(`api-football ${res.status} on ${path}`);
      const body = await res.json();
      if (body.errors && Object.keys(body.errors).length > 0) {
        throw new Error(`api-football errors: ${JSON.stringify(body.errors)}`);
      }
      return body;
    },
  };
  return self;
}

function toRow(f: ApiFixture) {
  return {
    id: f.fixture.id,
    league_id: f.league.id,
    season: f.league.season,
    round: f.league.round,
    home_team_id: f.teams.home.id,
    away_team_id: f.teams.away.id,
    venue: f.fixture.venue.name,
    kickoff_at: f.fixture.date,
    state: mapState(f.fixture.status.short),
    status_short: f.fixture.status.short,
    // 정규 90분 결과만 쓴다. 연장·승부차기는 점수에 반영하지 않는다 (명세 9장)
    home_goals_ft: f.score.fulltime.home,
    away_goals_ft: f.score.fulltime.away,
  };
}

/** 팀 이름에서 3글자 약어를 만든다. API 가 code 를 주면 그것을 쓴다. */
function abbrOf(name: string, code: string | null): string {
  if (code) return code.toUpperCase();
  return name.replace(/[^A-Za-z ]/g, '').trim().slice(0, 3).toUpperCase();
}

/* ------------------------------------------------------------------ 모드 */

async function syncTeams(sb: Db, a: Api, season: number) {
  for (const leagueId of LEAGUES) {
    const { response } = await a.get(`/teams?league=${leagueId}&season=${season}`);
    const rows = (
      response as { team: { id: number; name: string; code: string | null; logo: string | null } }[]
    ).map((r) => ({
      id: r.team.id,
      league_id: leagueId,
      name: r.team.name,
      abbr: abbrOf(r.team.name, r.team.code),
      // 엠블럼은 API 가 준다. 간혹 비어 오는데, CDN 경로가 팀 id 로 결정되므로 규칙으로 채운다.
      // 한글명·색은 우리가 관리하므로 여기서 건드리지 않는다.
      logo_url: r.team.logo ?? `https://media.api-sports.io/football/teams/${r.team.id}.png`,
    }));
    if (rows.length) await sb.upsert('teams', rows);
  }
}

/** 주 1회. 향후 1개월 일정. 리그당 한 번씩. */
async function syncSchedule(sb: Db, a: Api, season: number) {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + SCHEDULE_DAYS * 864e5).toISOString().slice(0, 10);

  let total = 0;
  for (const leagueId of LEAGUES) {
    const { response } = await a.get(
      `/fixtures?league=${leagueId}&season=${season}&from=${from}&to=${to}`
    );
    const rows = (response as ApiFixture[]).map(toRow);
    if (rows.length) await sb.upsert('fixtures', rows);
    total += rows.length;
  }
  return total;
}

/**
 * 10분마다. 지금 예측 창이 열려 있고 아직 끝나지 않은 경기만 정확히 조회한다.
 * 대상이 없으면 API 를 한 번도 부르지 않는다 — 하루 대부분의 시간이 여기에 해당한다.
 */
async function syncResults(sb: Db, a: Api) {
  const pending = await sb.pendingFixtureIds();
  if (pending.length === 0) return { updated: 0, skipped: true };

  let updated = 0;
  for (let i = 0; i < pending.length; i += IDS_PER_CALL) {
    const chunk = pending.slice(i, i + IDS_PER_CALL);
    const { response } = await a.get(`/fixtures?ids=${chunk.join('-')}`);
    const rows = (response as ApiFixture[]).map(toRow);
    if (rows.length) await sb.upsert('fixtures', rows);
    updated += rows.length;
  }
  return { updated, skipped: false };
}

/* ------------------------------------------------------------------ 데모 */

/**
 * 개발용. 실제로 끝난 과거 매치데이를 가져와 킥오프만 가까운 미래로 옮겨 심는다.
 * 팀·경기장·상대 조합이 전부 진짜라서 화면과 매치데이 로직을 실전에 가깝게 검증할 수 있고,
 * 결과를 이미 알고 있으므로 나중에 demo_finish 로 정산까지 돌려볼 수 있다.
 *
 * 결과는 여기서 넣지 않는다 — 넣으면 예측 전에 답이 보인다.
 */
async function seedDemo(sb: Db, a: Api, season: number, from: string) {
  const to = new Date(new Date(from).getTime() + 2 * 864e5).toISOString().slice(0, 10);
  const all: ApiFixture[] = [];

  for (const leagueId of LEAGUES) {
    const { response } = await a.get(
      `/fixtures?league=${leagueId}&season=${season}&from=${from}&to=${to}`
    );
    all.push(...(response as ApiFixture[]));
  }
  if (all.length === 0) return { fixtures: 0, note: 'no fixtures in range' };

  // 팀은 경기에 등장한 것만 만들어 둔다 (FK 충족용)
  const teams = new Map<number, { id: number; league_id: number; name: string; abbr: string }>();
  for (const f of all) {
    for (const side of ['home', 'away'] as const) {
      const t = f.teams[side];
      if (!teams.has(t.id)) {
        teams.set(t.id, {
          id: t.id, league_id: f.league.id, name: t.name, abbr: abbrOf(t.name, null),
        });
      }
    }
  }
  await sb.upsert('teams', [...teams.values()]);

  // 가장 이른 킥오프가 90분 뒤가 되도록 전체를 통째로 민다. 경기 간 간격은 그대로 유지된다.
  const earliest = Math.min(...all.map((f) => +new Date(f.fixture.date)));
  const offset = Date.now() + 90 * 60_000 - earliest;

  const rows = all.map((f) => ({
    ...toRow(f),
    kickoff_at: new Date(+new Date(f.fixture.date) + offset).toISOString(),
    state: 'SCHEDULED' as State,
    status_short: 'NS',
    home_goals_ft: null,
    away_goals_ft: null,
  }));
  await sb.upsert('fixtures', rows);
  return { fixtures: rows.length, teams: teams.size };
}

/** 데모 경기에 진짜 결과를 넣어 정산이 돌게 한다. */
async function finishDemo(sb: Db, a: Api, season: number) {
  const ids = await sb.demoFixtureIds();
  if (ids.length === 0) return 0;

  let n = 0;
  for (let i = 0; i < ids.length; i += IDS_PER_CALL) {
    const chunk = ids.slice(i, i + IDS_PER_CALL);
    const { response } = await a.get(`/fixtures?ids=${chunk.join('-')}`);
    const rows = (response as ApiFixture[])
      .filter((f) => f.score.fulltime.home !== null)
      .map((f) => ({
        id: f.fixture.id,
        state: 'FINISHED' as State,
        status_short: 'FT',
        home_goals_ft: f.score.fulltime.home,
        away_goals_ft: f.score.fulltime.away,
      }));
    if (rows.length) await sb.upsert('fixtures', rows);
    n += rows.length;
  }
  void season;
  return n;
}

/* ------------------------------------------------------------------ DB */

interface Db {
  upsert(table: string, rows: unknown[]): Promise<void>;
  pendingFixtureIds(): Promise<number[]>;
  demoFixtureIds(): Promise<number[]>;
}

function db(url: string, serviceKey: string): Db {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  return {
    async upsert(table, rows) {
      const res = await fetch(`${url}/rest/v1/${table}?on_conflict=id`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      });
      if (!res.ok) throw new Error(`upsert ${table} ${res.status}: ${await res.text()}`);
    },

    /**
     * 폴링 대상: 이미 시작했고 아직 FINISHED/VOID 가 아닌 경기.
     *
     * 기준은 킥오프다. 예측 창이 열린 시각(opens_at, 매치데이 06:00)을 기준으로 잡으면
     * 새벽 경기를 22시간 전부터 10분마다 조회하게 된다 — 결과가 나올 리 없는 시간에
     * 하루 140회 넘게 API 를 태우고, 주당 예산(약 225회)을 하루 만에 넘긴다.
     *
     * 킥오프 6시간이 지나도 안 끝난 것은 API 문제일 가능성이 높으므로 대상에서 뺀다.
     */
    async pendingFixtureIds() {
      const now = new Date().toISOString();
      const floor = new Date(Date.now() - 6 * 3600e3).toISOString();
      const q =
        `select=id&state=in.(SCHEDULED,LIVE)&kickoff_at=lte.${now}` +
        `&kickoff_at=gte.${floor}&order=kickoff_at&limit=60`;
      const res = await fetch(`${url}/rest/v1/fixtures?${q}`, { headers });
      if (!res.ok) throw new Error(`pending ${res.status}: ${await res.text()}`);
      return ((await res.json()) as { id: number }[]).map((r) => r.id);
    },

    /** 데모로 심어둔, 아직 결과가 없는 경기 */
    async demoFixtureIds() {
      const q = 'select=id&state=in.(SCHEDULED,LIVE)&home_goals_ft=is.null&limit=60';
      const res = await fetch(`${url}/rest/v1/fixtures?${q}`, { headers });
      if (!res.ok) throw new Error(`demo ids ${res.status}: ${await res.text()}`);
      return ((await res.json()) as { id: number }[]).map((r) => r.id);
    },
  };
}

/* ------------------------------------------------------------------ 엔트리 */

Deno.serve(async (req: Request) => {
  try {
    const key = Deno.env.get('API_FOOTBALL_KEY');
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!key || !url || !serviceKey) {
      return Response.json({ error: 'missing env' }, { status: 500 });
    }

    const params = new URL(req.url).searchParams;
    // 이 함수는 JWT 검증 없이 배포된다 (cron 이 불러야 하므로).
    // 대신 공유 토큰을 요구한다 — 없으면 아무나 호출해 API 쿼터를 태울 수 있다.
    const syncToken = Deno.env.get('SYNC_TOKEN');
    if (syncToken && req.headers.get('x-sync-token') !== syncToken) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }

    const mode = params.get('mode') ?? 'results';
    const sb = db(url, serviceKey);
    const a = api(key);
    // 유럽 시즌 표기: 7월 이후는 그 해 연도를 쓴다.
    const now = new Date();
    // 무료 플랜은 2022~2024 시즌만 열린다. 개발 중에는 ?season= 으로 내려서 쓴다.
    const season = Number(params.get('season')) ||
      (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);

    if (mode === 'teams') {
      await syncTeams(sb, a, season);
      return Response.json({ ok: true, mode, season, apiCalls: a.calls });
    }

    if (mode === 'schedule') {
      const n = await syncSchedule(sb, a, season);
      return Response.json({ ok: true, mode, season, fixtures: n, apiCalls: a.calls });
    }

    if (mode === 'demo') {
      const r = await seedDemo(sb, a, season, params.get('from') ?? '2024-11-02');
      return Response.json({ ok: true, mode, season, ...r, apiCalls: a.calls });
    }

    if (mode === 'demo_finish') {
      const n = await finishDemo(sb, a, season);
      return Response.json({ ok: true, mode, finished: n, apiCalls: a.calls });
    }

    const r = await syncResults(sb, a);
    return Response.json({ ok: true, mode, ...r, apiCalls: a.calls });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
});

declare const Deno: {
  env: { get(k: string): string | undefined };
  serve(h: (req: Request) => Promise<Response>): void;
};
