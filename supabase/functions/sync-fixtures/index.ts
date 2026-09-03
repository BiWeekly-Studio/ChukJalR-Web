/**
 * API-Football → Postgres 수집기 (명세 12.1, 14.1)
 *
 * 설계 목표는 하나다: **API 호출을 최소로 쓴다.**
 *
 *   ?mode=schedule   주 1회. 향후 1개월 일정을 리그별로 받아온다.        4회
 *   ?mode=teams      시즌 시작 및 월 1회. 팀 카탈로그.                  4회
 *   ?mode=results    10분마다. 단, 지금 열려 있고 아직 안 끝난 경기가
 *                    있을 때만 호출한다. 없으면 API를 아예 부르지 않는다. 0~2회
 *   ?mode=priors     주 1회. 순위표로 팀 전력을 재고 경기별 기준 확률을 만든다. 4회
 *   ?mode=odds       하루 1회. 북메이커 배당 → 기준 확률. 모델보다 정확하다. 30~60회
 *   ?mode=live       1분마다. 진행 중 경기의 점수·경과. 점수가 바뀐 경기만
 *                    이벤트를 따로 받는다. 없으면 0회.                    0~3회
 *   ?mode=lineups    5분마다. 킥오프 75분 전부터, 아직 못 받은 경기만.    0~10회
 *   ?mode=h2h        하루 1회. 새로 들어온 경기의 상대 전적.              0~40회
 *   ?mode=stats      하루 1회. 끝난 경기의 점유율·슈팅.                   0~30회
 *   ?mode=status     수동. 요금제와 남은 호출량을 확인한다.               1회
 *
 * results 모드는 폴링할 경기 id 를 DB 에서 먼저 뽑아 `?ids=` 로 정확히 그것만
 * 요청한다. 리그 전체나 날짜 전체를 훑지 않으므로 응답도 작고 호출도 적다.
 *
 * 주간 예산 (유럽 주말 기준)
 *   일정 4 + 팀 1 + 기준확률 4 + 결과 폴링 약 200  ≈ 210회/주  ≈ 30회/일
 *
 * 지금 계정은 Pro(7,500회/일)라 이 정도는 여유가 많다. 그래도 필요 없는 호출은
 * 하지 않는다 — 남는 한도는 라이브 스코어나 배당 같은, 실제로 값을 더하는 쪽에 쓴다.
 * 요금제와 잔여량은 ?mode=status 로 확인한다.
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

/**
 * 요금제에는 하루 한도만 있는 게 아니라 분당 한도도 있다. 경기별 모드를 병렬로
 * 던지면 몇 초 만에 80건이 나가고, 하루 한도는 멀쩡한데 분당 한도에 걸린다
 * (실제로 "exceeded the limit of requests per minute" 를 받았다).
 * 요청 시작 간격을 벌려 초당 4건으로 묶는다.
 */
const MIN_REQUEST_GAP_MS = 250;

function api(key: string): Api {
  let nextSlot = 0;

  const self: Api = {
    calls: 0,
    async get(path) {
      const now = Date.now();
      const slot = Math.max(now, nextSlot);
      nextSlot = slot + MIN_REQUEST_GAP_MS;
      if (slot > now) await new Promise((r) => setTimeout(r, slot - now));

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
/**
 * 정해진 개수만큼만 동시에 굴린다.
 *
 * 경기별로 한 번씩 부르는 모드(배당·상대전적·통계)를 순서대로 돌리면 수십 초가 걸리고,
 * 크론을 태우는 pg_net 이 먼저 끊는다. 한꺼번에 다 던지면 API 쪽 레이트 리밋에 걸린다.
 * 그 사이를 잡는 값이다.
 */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      await fn(items[cursor++]);
    }
  });
  await Promise.all(workers);
}

const POOL = 6;

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

/* ------------------------------------------------------------------ 기준 확률 */

/**
 * 순위표 한 장으로 팀 전력을 재고, 경기별 승/무/패 기준 확률을 만든다.
 *
 * 왜 필요한가: 기준선이 없으면 모든 경기가 같은 값(0.45/0.26/0.29)을 쓴다.
 * 그러면 강팀의 홈 경기를 맞혀도, 약체의 원정 승을 맞혀도 점수가 같아진다 —
 * 로그 스코어가 실력을 재지 못한다.
 *
 * 모델은 독립 포아송이다. 팀마다 공격력·수비력을 리그 평균 대비 배수로 재고
 *   λ_home = 공격(홈) × 수비(원정) × 리그 홈 평균 득점
 *   λ_away = 공격(원정) × 수비(홈)  × 리그 원정 평균 득점
 * 두 포아송의 격자를 더해 P(승/무/패)를 얻는다.
 *
 * 시즌 초에는 표본이 서너 경기뿐이라 그대로 쓰면 튄다. 두 군데를 모두 끌어당겨야 한다.
 *
 * 1) 팀 배수 — 경기 수로 리그 평균(=1) 쪽에. 4경기 치른 팀은 배수의 40%만 반영된다.
 * 2) 리그 홈/원정 평균 — 이걸 빼먹으면 2라운드짜리 표본이 그대로 홈 어드밴티지가 된다.
 *    실제로 분데스리가가 홈 1.67골 / 원정 0.67골로 잡혀 홈 승률 87% 같은 값이 나왔다.
 *    팀 배수는 이 평균에 곱해지므로, 여기가 틀어지면 리그 전체가 같이 틀어진다.
 */
const PRIOR_SHRINK = 6;      // 이 경기 수에서 팀 고유값과 리그 평균이 반반 섞인다
const LEAGUE_SHRINK = 150;   // 리그 평균이 자리잡는 데 필요한 경기 수 (약 반 시즌)
const LEAGUE_BASE_HOME = 1.55;  // 유럽 5대 리그의 장기 평균 (경기당 홈 득점)
const LEAGUE_BASE_AWAY = 1.25;
const STRENGTH_MIN = 0.6;    // 표본이 적을 때 한 경기 대승이 배수를 튀게 하는 걸 막는다
const STRENGTH_MAX = 1.6;
const MAX_GOALS = 8;         // 포아송 격자 상한. 8골이면 꼬리는 무시해도 된다

interface StandingRow {
  team: { id: number };
  all: { played: number; goals: { for: number; against: number } };
  home: { played: number; goals: { for: number; against: number } };
  away: { played: number; goals: { for: number; against: number } };
}

interface Strength {
  attack: number;
  defence: number;
}

function poisson(lambda: number, k: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p = (p * lambda) / i;
  return p;
}

/** 두 포아송의 격자를 훑어 승/무/패 확률로 접는다 */
function outcomeProbabilities(lambdaHome: number, lambdaAway: number): [number, number, number] {
  const h = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poisson(lambdaHome, k));
  const a = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poisson(lambdaAway, k));
  let home = 0, draw = 0, away = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = h[i] * a[j];
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
    }
  }
  // 격자 밖으로 샌 확률을 비율대로 되돌린다
  const sum = home + draw + away;
  return [home / sum, draw / sum, away / sum];
}

/** [0.03, 0.94] 로 자르고 합이 1이 되게 맞춘다 (명세 2.2, DB 쪽과 같은 규칙) */
function normalize(q: [number, number, number]): [number, number, number] {
  const clamped = q.map((v) => Math.min(0.94, Math.max(0.03, v)));
  const sum = clamped[0] + clamped[1] + clamped[2];
  const out = clamped.map((v) => Number((v / sum).toFixed(6)));
  return [out[0], out[1], 1 - out[0] - out[1]];
}

async function syncPriors(sb: Db, a: Api, season: number) {
  let written = 0;
  const leagues: number[] = [];

  for (const leagueId of LEAGUES) {
    const { response } = await a.get(`/standings?league=${leagueId}&season=${season}`);
    const groups = (response as { league: { standings: StandingRow[][] } }[])[0]
      ?.league?.standings ?? [];
    const table = groups.flat();
    // 순위표가 아직 없는 리그(시즌 시작 전)는 건너뛴다. 기본 기준선이 그대로 쓰인다.
    if (table.length === 0) continue;

    const totalPlayed = table.reduce((n, r) => n + r.all.played, 0);
    if (totalPlayed === 0) continue;

    // 리그 평균: 팀당 한 경기 득점. 홈/원정을 나눠야 홈 어드밴티지가 모델에 들어간다.
    const homePlayed = table.reduce((n, r) => n + r.home.played, 0);
    const awayPlayed = table.reduce((n, r) => n + r.away.played, 0);
    // 관측값을 장기 평균 쪽으로 끌어당긴다. 2라운드(18경기)면 관측이 11%만 반영된다.
    const lw = homePlayed / (homePlayed + LEAGUE_SHRINK);
    const homeObs = homePlayed > 0
      ? table.reduce((n, r) => n + r.home.goals.for, 0) / homePlayed : LEAGUE_BASE_HOME;
    const awayObs = awayPlayed > 0
      ? table.reduce((n, r) => n + r.away.goals.for, 0) / awayPlayed : LEAGUE_BASE_AWAY;
    const homeAvg = lw * homeObs + (1 - lw) * LEAGUE_BASE_HOME;
    const awayAvg = lw * awayObs + (1 - lw) * LEAGUE_BASE_AWAY;
    const leagueAvg = (homeAvg + awayAvg) / 2;

    const strength = new Map<number, Strength>();
    for (const r of table) {
      const played = r.all.played;
      if (played === 0) {
        strength.set(r.team.id, { attack: 1, defence: 1 });
        continue;
      }
      // 표본이 적을수록 리그 평균(=1) 쪽으로 끌어당긴다
      const w = played / (played + PRIOR_SHRINK);
      const clamp = (v: number) => Math.min(STRENGTH_MAX, Math.max(STRENGTH_MIN, v));
      strength.set(r.team.id, {
        attack: clamp(1 + (r.all.goals.for / played / leagueAvg - 1) * w),
        defence: clamp(1 + (r.all.goals.against / played / leagueAvg - 1) * w),
      });
    }

    const fixtures = await sb.upcomingFixtures(leagueId);
    // 배당에서 뽑은 기준선이 이미 있으면 건드리지 않는다. 모델이 덮어쓰면 더 나쁜
    // 기준선으로 되돌아간다 — 배당에는 부상·출전 정지까지 이미 반영돼 있다.
    const fromOdds = new Set(
      (await sb.select<{ fixture_id: number }>(
        'fixture_priors',
        `select=fixture_id&source=eq.odds&fixture_id=in.(${fixtures.map((f) => f.id).join(',') || 0})`
      )).map((r) => r.fixture_id)
    );

    const rows = fixtures.flatMap((f) => {
      if (fromOdds.has(f.id)) return [];
      const home = strength.get(f.home_team_id);
      const away = strength.get(f.away_team_id);
      // 순위표에 없는 팀(승격·컵 소속 등)은 지어내지 않고 건너뛴다
      if (!home || !away) return [];
      const q = normalize(outcomeProbabilities(
        home.attack * away.defence * homeAvg,
        away.attack * home.defence * awayAvg));
      return [{ fixture_id: f.id, q, source: 'model', updated_at: new Date().toISOString() }];
    });

    if (rows.length) {
      await sb.upsert('fixture_priors', rows, 'fixture_id');
      written += rows.length;
      leagues.push(leagueId);
    }
  }

  return { priors: written, leagues };
}

/* ------------------------------------------------------------------ 라이브 */

/**
 * 진행 중인 경기의 점수·경과 시간과 이벤트.
 *
 * 호출을 아끼는 방법: 점수는 `?ids=` 로 한 번에 20경기까지 묶어 1회로 받고,
 * 이벤트는 **점수가 바뀐 경기만** 따로 부른다. 매분 모든 경기의 이벤트를 훑으면
 * 라이브 한 시간에 수백 회가 나가지만, 이렇게 하면 득점이 난 순간에만 1회 더 든다.
 *
 * 정규 결과(_ft)는 여기서 건드리지 않는다 — 정산 근거는 results 모드가 채운다.
 */
interface ApiLiveFixture {
  fixture: { id: number; status: { short: string; elapsed: number | null } };
  goals: { home: number | null; away: number | null };
  teams: { home: { id: number }; away: { id: number } };
}

interface ApiEvent {
  time: { elapsed: number | null; extra: number | null };
  team: { id: number };
  player: { name: string | null };
  assist: { name: string | null };
  type: string;
  detail: string | null;
}

async function syncLive(sb: Db, a: Api) {
  // 킥오프했고 아직 안 끝난 경기. results 모드와 같은 조건이다.
  const now = new Date().toISOString();
  const floor = new Date(Date.now() - 6 * 3600e3).toISOString();
  const live = await sb.select<{ id: number; home_goals_live: number | null; away_goals_live: number | null }>(
    'fixtures',
    `select=id,home_goals_live,away_goals_live&state=in.(SCHEDULED,LIVE)` +
      `&kickoff_at=lte.${now}&kickoff_at=gte.${floor}&order=kickoff_at&limit=40`
  );
  if (live.length === 0) return { live: 0, changed: 0, events: 0, skipped: true };

  const before = new Map(live.map((f) => [f.id, `${f.home_goals_live}-${f.away_goals_live}`]));
  const changed: number[] = [];
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < live.length; i += IDS_PER_CALL) {
    const chunk = live.slice(i, i + IDS_PER_CALL).map((f) => f.id);
    const { response } = await a.get(`/fixtures?ids=${chunk.join('-')}`);
    for (const f of response as ApiLiveFixture[]) {
      const home = f.goals.home;
      const away = f.goals.away;
      rows.push({
        id: f.fixture.id,
        state: mapState(f.fixture.status.short),
        status_short: f.fixture.status.short,
        home_goals_live: home,
        away_goals_live: away,
        elapsed: f.fixture.status.elapsed,
      });
      if (before.get(f.fixture.id) !== `${home}-${away}`) changed.push(f.fixture.id);
    }
  }
  if (rows.length) await sb.upsert('fixtures', rows);

  // 점수가 바뀐 경기만 이벤트를 다시 받는다
  let events = 0;
  for (const fixtureId of changed) {
    events += await pullEvents(sb, a, fixtureId);
  }

  return { live: live.length, changed: changed.length, events, skipped: false };
}

async function pullEvents(sb: Db, a: Api, fixtureId: number) {
  const { response } = await a.get(`/fixtures/events?fixture=${fixtureId}`);
  const rows = (response as ApiEvent[]).map((e, seq) => ({
    fixture_id: fixtureId,
    seq,
    minute: e.time.elapsed,
    extra: e.time.extra,
    team_id: e.team.id,
    type: e.type,
    detail: e.detail,
    player: e.player.name,
    assist: e.assist?.name ?? null,
  }));
  if (rows.length) await sb.upsert('fixture_events', rows, 'fixture_id,seq');
  return rows.length;
}

/* ------------------------------------------------------------------ 선발 명단 */

/**
 * 킥오프 한 시간 전쯤 공개된다. 앱을 미리 열 이유가 되는 거의 유일한 데이터다.
 * 아직 안 받은 경기만 부르므로, 한 경기당 평생 한 번만 든다.
 */
const LINEUP_WINDOW_MIN = 75;

interface ApiLineup {
  team: { id: number };
  formation: string | null;
  coach: { name: string | null };
  startXI: { player: { name: string | null; number: number | null; pos: string | null } }[];
  substitutes: { player: { name: string | null; number: number | null; pos: string | null } }[];
}

async function syncLineups(sb: Db, a: Api) {
  const now = Date.now();
  const soon = new Date(now + LINEUP_WINDOW_MIN * 60e3).toISOString();
  const floor = new Date(now - 3 * 3600e3).toISOString();
  const candidates = await sb.select<{ id: number }>(
    'fixtures',
    `select=id&state=in.(SCHEDULED,LIVE)&kickoff_at=lte.${soon}&kickoff_at=gte.${floor}` +
      `&order=kickoff_at&limit=30`
  );
  if (candidates.length === 0) return { lineups: 0, skipped: true };

  const have = new Set(
    (await sb.select<{ fixture_id: number }>(
      'fixture_lineups',
      `select=fixture_id&fixture_id=in.(${candidates.map((f) => f.id).join(',')})`
    )).map((r) => r.fixture_id)
  );

  const rows: Record<string, unknown>[] = [];
  await pool(candidates.filter((f) => !have.has(f.id)), POOL, async (f) => {
    const { response } = await a.get(`/fixtures/lineups?fixture=${f.id}`);
    // 아직 발표 전이면 빈 배열이 온다. 그때는 쓰지 않고 다음 주기에 다시 본다.
    for (const l of response as ApiLineup[]) {
      rows.push({
        fixture_id: f.id,
        team_id: l.team.id,
        formation: l.formation,
        coach: l.coach?.name ?? null,
        starters: l.startXI.map((x) => ({ name: x.player.name, number: x.player.number, pos: x.player.pos })),
        bench: l.substitutes.map((x) => ({ name: x.player.name, number: x.player.number, pos: x.player.pos })),
        updated_at: new Date().toISOString(),
      });
    }
  });
  if (rows.length) await sb.upsert('fixture_lineups', rows, 'fixture_id,team_id');
  return { lineups: rows.length, skipped: false };
}

/* ------------------------------------------------------------------ 상대 전적 */

interface ApiH2H {
  fixture: { id: number; date: string };
  teams: { home: { id: number }; away: { id: number } };
  score: { fulltime: { home: number | null; away: number | null } };
}

/**
 * 두 팀의 최근 맞대결. 경기당 한 번만 받으면 되고, 예측 판단에 실제로 쓰이는 정보다.
 */
async function syncH2H(sb: Db, a: Api, limit = 40) {
  const now = new Date().toISOString();
  const fixtures = await sb.select<UpcomingFixture>(
    'fixtures',
    `select=id,home_team_id,away_team_id&state=eq.SCHEDULED&kickoff_at=gte.${now}` +
      `&order=kickoff_at&limit=${limit * 3}`
  );
  const have = new Set(
    (await sb.select<{ fixture_id: number }>(
      'fixture_h2h',
      `select=fixture_id&fixture_id=in.(${fixtures.map((f) => f.id).join(',') || 0})`
    )).map((r) => r.fixture_id)
  );

  const todo = fixtures.filter((f) => !have.has(f.id)).slice(0, limit);
  const rows: Record<string, unknown>[] = [];

  await pool(todo, POOL, async (f) => {
    const { response } = await a.get(
      `/fixtures/headtohead?h2h=${f.home_team_id}-${f.away_team_id}&last=10`
    );
    const past = (response as ApiH2H[]).filter(
      (m) => m.score.fulltime.home !== null && m.score.fulltime.away !== null
    );
    let homeWins = 0, draws = 0, awayWins = 0;
    for (const m of past) {
      const hg = m.score.fulltime.home!;
      const ag = m.score.fulltime.away!;
      // 홈/원정이 뒤바뀐 경기도 있으므로, 이 경기의 홈팀 기준으로 다시 센다
      const homeIsThisHome = m.teams.home.id === f.home_team_id;
      const forHome = homeIsThisHome ? hg : ag;
      const forAway = homeIsThisHome ? ag : hg;
      if (forHome > forAway) homeWins += 1;
      else if (forHome < forAway) awayWins += 1;
      else draws += 1;
    }
    rows.push({
      fixture_id: f.id,
      played: past.length,
      home_wins: homeWins,
      draws,
      away_wins: awayWins,
      recent: past.slice(0, 5).map((m) => ({
        date: m.fixture.date,
        home_id: m.teams.home.id,
        away_id: m.teams.away.id,
        hg: m.score.fulltime.home,
        ag: m.score.fulltime.away,
      })),
      updated_at: new Date().toISOString(),
    });
  });

  if (rows.length) await sb.upsert('fixture_h2h', rows, 'fixture_id');
  return { h2h: rows.length, considered: fixtures.length };
}

/* ------------------------------------------------------------------ 경기 통계 */

interface ApiStats {
  team: { id: number };
  statistics: { type: string; value: string | number | null }[];
}

/** 끝난 경기의 점유율·슈팅 등. 경기당 한 번. */
async function syncStats(sb: Db, a: Api) {
  const floor = new Date(Date.now() - 3 * 86400e3).toISOString();
  const finished = await sb.select<{ id: number }>(
    'fixtures',
    `select=id&state=eq.FINISHED&kickoff_at=gte.${floor}&order=kickoff_at.desc&limit=30`
  );
  if (finished.length === 0) return { stats: 0, skipped: true };

  const have = new Set(
    (await sb.select<{ fixture_id: number }>(
      'fixture_stats',
      `select=fixture_id&fixture_id=in.(${finished.map((f) => f.id).join(',')})`
    )).map((r) => r.fixture_id)
  );

  const rows: Record<string, unknown>[] = [];
  await pool(finished.filter((f) => !have.has(f.id)), POOL, async (f) => {
    const { response } = await a.get(`/fixtures/statistics?fixture=${f.id}`);
    for (const t of response as ApiStats[]) {
      rows.push({
        fixture_id: f.id,
        team_id: t.team.id,
        stats: Object.fromEntries(t.statistics.map((x) => [x.type, x.value])),
        updated_at: new Date().toISOString(),
      });
    }
  });
  if (rows.length) await sb.upsert('fixture_stats', rows, 'fixture_id,team_id');
  return { stats: rows.length, skipped: false };
}

/* ------------------------------------------------------------------ 배당 기준선 */

/**
 * 북메이커 배당에서 기준 확률을 뽑는다.
 *
 * 순위표 모델보다 정확하다 — 배당에는 부상·출전 정지·일정·분위기까지 이미 반영돼 있고,
 * 돈이 걸린 만큼 틀리면 손해를 보는 쪽이 매긴 값이다. 그래서 배당이 있으면 배당을 쓰고,
 * 없는 경기만 모델이 채운다 (fixture_priors.source 로 구분한다).
 *
 * 배당 자체는 절대 화면에 내보내지 않는다. 서버에서 기준선으로만 쓴다 —
 * 노출하면 이 앱이 도박처럼 읽히고, 앱인토스 심사에서도 문제가 된다.
 *
 * 배당 → 확률은 역수를 취한 뒤 합으로 나눈다. 합이 1을 넘는 만큼이 북메이커의
 * 마진(오버라운드)이고, 나누면 그게 걷힌다.
 */
const ODDS_HORIZON_DAYS = 3;   // 이보다 먼 경기는 배당이 아직 얇거나 없다
const ODDS_BET_MATCH_WINNER = 1;

interface ApiOdds {
  fixture: { id: number };
  bookmakers: {
    id: number;
    bets: { id: number; name: string; values: { value: string; odd: string }[] }[];
  }[];
}

/** 한 북메이커의 1X2 배당 → 마진을 걷어낸 확률 */
function impliedFromOdds(values: { value: string; odd: string }[]): [number, number, number] | null {
  const pick = (name: string) => {
    const v = values.find((x) => x.value.toLowerCase() === name);
    const odd = v ? Number(v.odd) : NaN;
    return Number.isFinite(odd) && odd > 1 ? 1 / odd : NaN;
  };
  const raw = [pick('home'), pick('draw'), pick('away')];
  if (raw.some((v) => !Number.isFinite(v))) return null;
  const sum = raw[0] + raw[1] + raw[2];
  // 마진이 비정상이면(합이 1 미만이거나 1.3 초과) 데이터가 이상한 것이다
  if (sum < 1 || sum > 1.3) return null;
  return [raw[0] / sum, raw[1] / sum, raw[2] / sum];
}

/** 북메이커마다 조금씩 다르다. 중앙값을 쓰면 한 곳의 이상치에 흔들리지 않는다. */
function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function syncOdds(sb: Db, a: Api) {
  const now = new Date().toISOString();
  const horizon = new Date(Date.now() + ODDS_HORIZON_DAYS * 864e5).toISOString();
  // 아직 안 잠긴 경기만. 잠긴 뒤에 기준선을 바꾸면 정산 근거가 흔들린다.
  const fixtures = await sb.select<{ id: number }>(
    'fixtures',
    `select=id&state=eq.SCHEDULED&lock_at=gte.${now}&kickoff_at=lte.${horizon}` +
      `&order=kickoff_at&limit=60`
  );

  let missing = 0;
  const rows: Record<string, unknown>[] = [];

  await pool(fixtures, POOL, async (f) => {
    const { response } = await a.get(`/odds?fixture=${f.id}&bet=${ODDS_BET_MATCH_WINNER}`);
    const books = (response as ApiOdds[])[0]?.bookmakers ?? [];
    const probs = books
      .map((b) => b.bets.find((bet) => bet.id === ODDS_BET_MATCH_WINNER)?.values)
      .filter((v): v is { value: string; odd: string }[] => Array.isArray(v))
      .map(impliedFromOdds)
      .filter((q): q is [number, number, number] => q !== null);

    if (probs.length === 0) { missing += 1; return; }

    rows.push({
      fixture_id: f.id,
      q: normalize([
        median(probs.map((q) => q[0])),
        median(probs.map((q) => q[1])),
        median(probs.map((q) => q[2])),
      ]),
      source: 'odds',
      updated_at: new Date().toISOString(),
    });
  });

  if (rows.length) await sb.upsert('fixture_priors', rows, 'fixture_id');
  return { odds: rows.length, noOdds: missing, considered: fixtures.length };
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
  upsert(table: string, rows: unknown[], conflict?: string): Promise<void>;
  pendingFixtureIds(): Promise<number[]>;
  demoFixtureIds(): Promise<number[]>;
  upcomingFixtures(leagueId: number): Promise<UpcomingFixture[]>;
  /** PostgREST 쿼리를 그대로 던진다. 모드마다 조건이 달라 일일이 메서드를 만들지 않는다. */
  select<T>(table: string, query: string): Promise<T[]>;
}

interface UpcomingFixture {
  id: number;
  home_team_id: number;
  away_team_id: number;
}

function db(url: string, serviceKey: string): Db {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  return {
    async upsert(table, rows, conflict = 'id') {
      const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${conflict}`, {
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

    async select(table, query) {
      const res = await fetch(`${url}/rest/v1/${table}?${query}`, { headers });
      if (!res.ok) throw new Error(`select ${table} ${res.status}: ${await res.text()}`);
      return await res.json();
    },

    /** 아직 안 끝난 경기. 기준 확률을 다시 계산할 대상이다. */
    async upcomingFixtures(leagueId) {
      const q =
        `select=id,home_team_id,away_team_id&league_id=eq.${leagueId}` +
        `&state=in.(SCHEDULED,LIVE)&order=kickoff_at&limit=400`;
      const res = await fetch(`${url}/rest/v1/fixtures?${q}`, { headers });
      if (!res.ok) throw new Error(`upcoming ${res.status}: ${await res.text()}`);
      return (await res.json()) as UpcomingFixture[];
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

    // 요금제로 열리는 엔드포인트와 남은 호출량이 다르다. 추측하지 말고 물어본다.
    if (mode === 'status') {
      const { response } = await a.get('/status');
      return Response.json({ ok: true, mode, status: response, apiCalls: a.calls });
    }

    if (mode === 'live') {
      const r = await syncLive(sb, a);
      return Response.json({ ok: true, mode, ...r, apiCalls: a.calls });
    }

    if (mode === 'lineups') {
      const r = await syncLineups(sb, a);
      return Response.json({ ok: true, mode, ...r, apiCalls: a.calls });
    }

    if (mode === 'h2h') {
      const r = await syncH2H(sb, a, Number(params.get('limit')) || 40);
      return Response.json({ ok: true, mode, ...r, apiCalls: a.calls });
    }

    if (mode === 'stats') {
      const r = await syncStats(sb, a);
      return Response.json({ ok: true, mode, ...r, apiCalls: a.calls });
    }

    if (mode === 'odds') {
      const r = await syncOdds(sb, a);
      return Response.json({ ok: true, mode, ...r, apiCalls: a.calls });
    }

    if (mode === 'priors') {
      const r = await syncPriors(sb, a, season);
      return Response.json({ ok: true, mode, season, ...r, apiCalls: a.calls });
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
