import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Auth, AuthUser, Catalog, MeSnapshot, OAuthProvider, Repository } from './repository';
import type {
  BadgeDef, ChatMessage, Fixture, MyStats, Prediction, RankRow, SettlementResult,
} from './types';
import type { Confidence, Outcome } from '../lib/scoring';

/**
 * 실제 백엔드 구현. 명세 14장의 스키마를 그대로 읽는다.
 *
 * 여기서 하지 않는 것:
 *  - 점수 계산 (서버 정산이 유일한 진실)
 *  - 마감 판정 (RLS 정책이 막는다. 클라이언트 시각은 표시용일 뿐)
 */
export function createSupabaseRepository(url: string, anonKey: string): Repository {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  /**
   * 지금 세션의 유저 id.
   * 프로덕션에서는 토스 로그인 브리지가 발급한 JWT 로 세션이 이미 서 있고 (명세 14.5),
   * 토스 앱 밖에서는 아래 auth 로 직접 가입/로그인한 세션이 선다.
   * 여기서 세션을 만들지는 않는다 — 로그인 화면이 그 책임을 진다.
   */
  async function uid(): Promise<string | null> {
    const { data } = await sb.auth.getSession();
    return data.session?.user.id ?? null;
  }

  const auth: Auth = {
    async current(): Promise<AuthUser | null> {
      const { data } = await sb.auth.getSession();
      return data.session ? toAuthUser(data.session.user) : null;
    },

    async signUp(email, password, handle) {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        // 트리거(handle_new_user)가 이 값을 프로필 닉네임으로 쓴다
        options: { data: { handle } },
      });
      if (error) throw new Error(authMessage(error.message));
      // 이메일 확인이 켜져 있으면 session 이 비어서 온다. 이때는 아직 로그인 전이다.
      return { needsConfirmation: !data.session };
    },

    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(authMessage(error.message));
    },

    /**
     * 토스 로그인.
     *
     * SDK 는 앱인토스 웹뷰 안에서만 뜻이 있고 680KB 짜리라, 정적으로 import 하면
     * 자체 배포 번들까지 끌고 들어간다. 그래서 누를 때 동적으로 불러온다.
     */
    async signInWithToss() {
      const { TossAuth } = await import('@apps-in-toss/web-framework');
      const { authorizationCode, referrer } = await TossAuth.login();

      // 인가 코드는 서버에서만 교환할 수 있다 (토스 서버 API 가 mTLS 를 요구한다)
      const res = await sb.functions.invoke('toss-login', {
        body: { authorizationCode, referrer },
      });
      if (res.error) throw new Error(tossMessage(res.error.message));

      const data = res.data as { access_token?: string; refresh_token?: string; error?: string };
      if (data.error || !data.access_token || !data.refresh_token) {
        throw new Error(tossMessage(data.error ?? 'SESSION_FAILED'));
      }

      const { error } = await sb.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (error) throw new Error(authMessage(error.message));
    },

    async signInWithProvider(provider) {
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: {
          // 돌아올 주소. Supabase 대시보드의 Redirect URLs 에 등록돼 있어야 한다.
          // 쿼리스트링을 떼는 이유: 여기 남은 값이 그대로 허용 목록 비교에 들어간다.
          redirectTo: window.location.origin + window.location.pathname,
        },
      });
      if (error) throw new Error(authMessage(error.message));
      // 정상이면 브라우저가 제공자 페이지로 떠난다. 여기 아래로는 오지 않는다.
    },

    async listProviders() {
      if (!providerCache) providerCache = fetchProviders(url, anonKey);
      return providerCache;
    },

    async signOut() {
      const { error } = await sb.auth.signOut();
      if (error) throw new Error(authMessage(error.message));
    },

    onChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        cb(session ? toAuthUser(session.user) : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };

  return {
    kind: 'supabase',
    auth,

    async loadCatalog(): Promise<Catalog> {
      const horizon = new Date(Date.now() + 14 * 864e5).toISOString();
      const [leagues, teams, fixtures] = await Promise.all([
        sb.from('leagues').select('id, name, short_name, country, logo_url, flag_url'),
        sb.from('teams').select('id, league_id, name, name_ko, abbr, color, tint, logo_url'),
        sb
          .from('fixtures')
          .select(
            'id, league_id, round, home_team_id, away_team_id, venue, kickoff_at, opens_at, lock_at, state, home_goals_ft, away_goals_ft, result'
          )
          .lte('kickoff_at', horizon)
          .gte('kickoff_at', new Date(Date.now() - 3 * 864e5).toISOString())
          .neq('state', 'VOID')
          .order('kickoff_at'),
      ]);

      if (leagues.error) throw leagues.error;
      if (teams.error) throw teams.error;
      if (fixtures.error) throw fixtures.error;

      // 기준선은 한 번의 RPC 로 몰아서 받는다. 경기마다 부르면 요청 수가 금방 는다.
      //
      // 여기서 error 를 무시하면 안 된다. 함수가 없거나(마이그레이션 미적용) 실패했을 때
      // 조용히 넘어가면 모든 경기가 기본값을 달고 나가서, 없는 여론을 있는 것처럼 보여주게 된다.
      // 실패는 실패대로 남기고, 기준선 없이(=null) 화면에 넘긴다.
      const ids = fixtures.data.map((f) => f.id);
      let byId = new Map<number, BaselineRow>();
      if (ids.length) {
        const { data, error } = await sb.rpc('live_baselines', { p_fixture_ids: ids });
        if (error) {
          // 경기 목록 자체는 보여줄 수 있으므로 던지지 않는다. 대신 눈에 띄게 남긴다.
          console.error('[축잘알] live_baselines 실패 — 여론 분포 없이 표시합니다', error);
        } else {
          byId = new Map((data as BaselineRow[]).map((b) => [b.fixture_id, b]));
        }
      }

      return {
        leagues: leagues.data.map((l) => ({
          id: l.id, name: l.name, short: l.short_name, country: l.country,
          logoUrl: l.logo_url, flagUrl: l.flag_url,
        })),
        teams: teams.data.map((t) => ({
          id: t.id, leagueId: t.league_id, name: t.name_ko ?? t.name, nameEn: t.name,
          abbr: t.abbr, logoUrl: t.logo_url,
          color: t.color, tint: t.tint,
        })),
        fixtures: fixtures.data.map((f) => toFixture(f, byId.get(f.id))),
      };
    },

    async loadMe(): Promise<MeSnapshot> {
      const userId = await uid();
      if (!userId) throw new Error('NOT_AUTHENTICATED');

      // auth.users 트리거가 프로필을 만드는 사이 첫 조회가 비어 올 수 있다.
      for (let i = 0; i < 5; i++) {
        const { count } = await sb
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('id', userId);
        if (count) break;
        await new Promise((r) => setTimeout(r, 200));
      }

      const [profile, rating, board, preds, settled] = await Promise.all([
        sb.from('profiles').select('handle, league_order, favorite_team_ids, onboarded_at')
          .eq('id', userId).single(),
        sb.from('ratings').select('rating, lifetime_points, balance, streak, settled_matches')
          .eq('user_id', userId).order('season', { ascending: false }).limit(1).single(),
        sb.from('leaderboard').select('top_percent').eq('user_id', userId).maybeSingle(),
        sb.from('predictions').select('fixture_id, pick, confidence, created_at')
          .eq('user_id', userId),
        sb.from('settlements').select('fixture_id, delta_rating, points')
          .eq('user_id', userId).order('settled_at', { ascending: false }).limit(100),
      ]);

      if (profile.error) throw profile.error;
      if (rating.error) throw rating.error;
      if (preds.error) throw preds.error;

      return {
        handle: profile.data.handle,
        leagueOrder: profile.data.league_order,
        favoriteTeamIds: profile.data.favorite_team_ids ?? [],
        onboarded: Boolean(profile.data.onboarded_at),
        rating: rating.data.rating,
        lifetimePoints: rating.data.lifetime_points,
        balance: rating.data.balance,
        streak: rating.data.streak,
        settledMatches: rating.data.settled_matches,
        // 순위표에 없으면 '상위 100%' 가 아니라 '아직 순위 없음' 이다
        topPercent: board.data?.top_percent ?? null,
        predictions: preds.data.map(
          (p): Prediction => ({
            fixtureId: p.fixture_id,
            pick: p.pick as Outcome,
            confidence: p.confidence as Confidence,
            createdAt: p.created_at,
          })
        ),
        settlements: (settled.data ?? []).map(
          (r): SettlementResult => ({
            fixtureId: r.fixture_id,
            deltaRating: r.delta_rating,
            points: r.points,
          })
        ),
      };
    },

    async saveOnboarding(leagueOrder, favoriteTeamIds) {
      const userId = await uid();
      if (!userId) throw new Error('NOT_AUTHENTICATED');
      const { error } = await sb
        .from('profiles')
        .update({
          league_order: leagueOrder,
          favorite_team_ids: favoriteTeamIds,
          onboarded_at: new Date().toISOString(),
        })
        .eq('id', userId);
      if (error) throw error;
    },

    async upsertPrediction(fixtureId, pick, confidence) {
      const userId = await uid();
      if (!userId) throw new Error('NOT_AUTHENTICATED');
      const { error } = await sb
        .from('predictions')
        .upsert(
          {
            user_id: userId, fixture_id: fixtureId, pick, confidence,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,fixture_id' }
        );
      // 마감 후에는 RLS 가 거부한다. 이건 버그가 아니라 설계다.
      if (error) throw new Error(error.code === '42501' ? 'PREDICTION_LOCKED' : error.message);
    },

    async loadRanking(): Promise<RankRow[]> {
      const me = await uid();
      const { data, error } = await sb
        .from('leaderboard')
        .select('user_id, rank, handle, rating, accuracy, prev_rank')
        .order('rank')
        .limit(50);
      if (error) throw error;
      return data.map((r) => toRankRow(r, me));
    },

    async loadMyRank(): Promise<RankRow | null> {
      const me = await uid();
      if (!me) return null;
      const { data, error } = await sb
        .from('leaderboard')
        .select('user_id, rank, handle, rating, accuracy, prev_rank')
        .eq('user_id', me)
        .maybeSingle();
      if (error) throw error;
      return data ? toRankRow(data, me) : null;
    },

    async loadBadges(): Promise<BadgeDef[]> {
      const userId = await uid();
      const { data, error } = await sb
        .from('badge_definitions')
        .select('id, name, grp, tier, rule, user_badges(progress, target)')
        .eq('active', true)
        .eq('user_badges.user_id', userId ?? '');
      if (error) throw error;
      return data.map((b) => {
        const mine = (b.user_badges as { progress: number; target: number }[])[0];
        return {
          id: b.id, name: b.name, group: b.grp,
          tier: b.tier as BadgeDef['tier'],
          condition: JSON.stringify(b.rule),
          progress: mine?.progress ?? 0,
          target: mine?.target ?? null,
        };
      });
    },

    async loadMyStats(): Promise<MyStats> {
      await uid();
      const { data, error } = await sb.rpc('my_stats');
      if (error) throw error;
      return (data as MyStats) ?? EMPTY_STATS;
    },

    async loadChat(fixtureId): Promise<ChatMessage[]> {
      const { data, error } = await sb
        .from('chat_messages')
        .select('id, body, created_at, user_id, profiles(handle)')
        .eq('channel', `match:${fixtureId}`)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const me = await uid();
      return data.reverse().map((m) => toMessage(m, fixtureId, m.user_id === me));
    },

    async sendChat(fixtureId, body) {
      const userId = await uid();
      if (!userId) throw new Error('NOT_AUTHENTICATED');
      const { error } = await sb.from('chat_messages').insert({
        channel: `match:${fixtureId}`, fixture_id: fixtureId, user_id: userId, body,
      });
      if (error) {
        // 레이트 리밋·필터는 트리거가 예외로 던진다 (명세 14.4, 10장)
        throw new Error(chatMessage(error.message));
      }
    },

    async reportMessage(messageId, reason) {
      const userId = await uid();
      if (!userId) throw new Error('NOT_AUTHENTICATED');
      const { error } = await sb
        .from('message_reports')
        .insert({ message_id: Number(messageId), reporter_id: userId, reason });
      if (error) {
        // 중복 신고는 기본 키가 막는다. 사용자에게는 이미 처리된 것으로 보여주면 된다.
        if (error.code === '23505') return;
        throw new Error('신고를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    },

    async blockUser(blockedId) {
      const userId = await uid();
      if (!userId) throw new Error('NOT_AUTHENTICATED');
      const { error } = await sb
        .from('user_blocks')
        .insert({ blocker_id: userId, blocked_id: blockedId });
      if (error && error.code !== '23505') {
        throw new Error('차단하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    },

    /** Postgres Changes 가 아니라 Broadcast 를 구독한다 (명세 14.4) */
    subscribeChat(fixtureId, onMessage, onPresence) {
      let me: string | null = null;
      void uid().then((id) => {
        me = id;
      });

      const channel = sb
        .channel(`match:${fixtureId}`, { config: { private: false, presence: { key: '' } } })
        .on('broadcast', { event: 'chat.message' }, (payload) => {
          const p = payload.payload as {
            id: number; userId: string; handle?: string; body: string; at: string;
          };
          // 트리거가 보내주는 것만 믿는다. 없는 필드를 그럴듯하게 채우지 않고,
          // 닉네임이 비어도 콜백이 죽지 않게 한다 — 죽으면 이후 메시지가 전부 안 붙는다.
          const handle = p.handle?.trim() || '알 수 없음';
          onMessage({
            id: String(p.id),
            fixtureId,
            userId: p.userId,
            handle,
            initial: handle.slice(0, 1),
            // 등급은 과거 메시지 경로도 채우지 않는다. 실시간에만 뱃지가 붙으면
            // 같은 사람의 말이 경로에 따라 다르게 보인다.
            topPercent: null,
            tier: null,
            body: p.body,
            at: new Date(p.at).toTimeString().slice(0, 5),
            mine: me != null && p.userId === me,
          });
        })
        .on('presence', { event: 'sync' }, () => {
          // 지금 이 경기 채팅을 열어둔 사람 수. 숫자를 지어내지 않는다.
          onPresence?.(Object.keys(channel.presenceState()).length);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            void channel.track({ at: Date.now() });
          }
        });

      return () => {
        void sb.removeChannel(channel);
      };
    },
  };
}

/** 채팅 트리거가 던지는 예외를 사람이 읽을 말로 바꾼다 (명세 10장) */
function chatMessage(raw: string): string {
  if (raw.includes('RATE_LIMIT')) return '너무 빠르게 보내고 있어요. 잠시 후 다시 시도해 주세요.';
  if (raw.includes('LINK_NOT_ALLOWED')) return '링크는 보낼 수 없어요.';
  if (raw.includes('BANNED_WORD')) return '보낼 수 없는 표현이 들어 있어요.';
  return raw;
}

/** Edge Function 이 돌려주는 실패 코드를 사람이 읽을 말로 바꾼다 */
function tossMessage(code: string): string {
  if (code.includes('SERVER_NOT_CONFIGURED')) return '토스 로그인이 아직 설정되지 않았어요.';
  if (code.includes('MTLS_UNSUPPORTED')) return '서버가 토스 인증서를 쓸 수 없는 상태예요.';
  if (code.includes('TOSS_TOKEN_FAILED') || code.includes('TOSS_USER_FAILED')) {
    return '토스 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.';
  }
  return '로그인에 실패했어요. 잠시 후 다시 시도해 주세요.';
}

/** 우리가 버튼을 그릴 수 있는 제공자만 추린다 */
const SUPPORTED_PROVIDERS: OAuthProvider[] = ['kakao', 'google', 'apple'];

/** 한 번만 물어보면 된다 — 대시보드 설정은 세션 중에 바뀌지 않는다 */
let providerCache: Promise<OAuthProvider[]> | null = null;

/**
 * /auth/v1/settings 는 anon 키로 읽을 수 있는 공개 엔드포인트다.
 * 켜진 provider 를 여기서 읽으면, 대시보드에서 켜는 즉시 버튼이 생긴다 —
 * 목록을 코드에 박아두면 둘이 어긋난다.
 */
async function fetchProviders(url: string, anonKey: string): Promise<OAuthProvider[]> {
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
    if (!res.ok) return [];
    const body = (await res.json()) as { external?: Record<string, boolean> };
    return SUPPORTED_PROVIDERS.filter((p) => body.external?.[p]);
  } catch {
    // 못 읽으면 소셜 버튼을 숨긴다. 눌러도 안 되는 버튼보다 없는 편이 낫다.
    return [];
  }
}

/** Supabase 유저 객체 → 화면이 아는 최소한의 형태 */
function toAuthUser(u: { id: string; email?: string | null }): AuthUser {
  return { id: u.id, email: u.email ?? null };
}

/**
 * GoTrue 는 영어로만 답한다. 유저가 실제로 마주치는 경우만 우리말로 바꾸고,
 * 나머지는 원문을 남긴다 — 못 보던 오류를 숨기면 디버깅이 더 어려워진다.
 */
function authMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('invalid login credentials')) return '이메일이나 비밀번호가 맞지 않아요.';
  if (m.includes('email not confirmed')) return '아직 이메일 확인을 안 하셨어요. 메일함을 확인해 주세요.';
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return '이미 가입된 이메일이에요. 로그인해 주세요.';
  }
  if (m.includes('password should be at least')) return '비밀번호는 6자 이상이어야 해요.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return '이메일 주소를 다시 확인해 주세요.';
  }
  if (m.includes('email rate limit') || m.includes('over_email_send_rate_limit')) {
    return '확인 메일을 너무 자주 보냈어요. 잠시 뒤에 다시 시도해 주세요.';
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return '지금은 가입이 막혀 있어요.';
  }
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) {
    return '이 소셜 로그인은 아직 켜져 있지 않아요.';
  }
  if (m.includes('redirect_to') || m.includes('redirect url')) {
    return '돌아올 주소가 허용 목록에 없어요. Supabase 의 Redirect URLs 를 확인해 주세요.';
  }
  return raw;
}

interface FixtureRow {
  id: number; league_id: number; round: string | null;
  home_team_id: number; away_team_id: number; venue: string | null;
  kickoff_at: string; opens_at: string; lock_at: string; state: string;
  home_goals_ft: number | null; away_goals_ft: number | null; result: Outcome | null;
}

const EMPTY_STATS: MyStats = {
  settled: 0, hits: 0, byLeague: [], calibration: [], fanBias: null, recent: [],
};

interface RankRowSource {
  user_id: string;
  rank: number;
  handle: string;
  rating: number;
  accuracy: string | number | null;
  prev_rank: number | null;
}

function toRankRow(r: RankRowSource, me: string | null): RankRow {
  return {
    rank: r.rank,
    handle: r.handle,
    initial: r.handle.slice(0, 1),
    accuracy: Number(r.accuracy ?? 0),
    rating: r.rating,
    // 직전 발표보다 순위가 올라가면 양수
    change: r.prev_rank == null ? null : r.prev_rank - r.rank,
    isMe: me != null && r.user_id === me,
  };
}

interface BaselineRow {
  fixture_id: number;
  q: [string | number, string | number, string | number];
  n: number;
}

function toFixture(f: FixtureRow, b?: BaselineRow): Fixture {
  return {
    id: f.id,
    leagueId: f.league_id,
    round: parseRound(f.round),
    homeTeamId: f.home_team_id,
    awayTeamId: f.away_team_id,
    venue: f.venue?.trim() || null,
    kickoffAt: f.kickoff_at,
    opensAt: f.opens_at,
    lockAt: f.lock_at,
    // 동결 전에는 live_baselines 가 계산해 준 값을 쓴다. 서버 정산과 같은 공식이다.
    // 못 받았으면 null 이다 — 여기에 그럴듯한 숫자를 채우면 그게 가짜 데이터가 된다.
    baseline: b ? (b.q.map(Number) as [number, number, number]) : null,
    participants: b ? b.n : null,
    homeGoals: f.home_goals_ft,
    awayGoals: f.away_goals_ft,
    result: f.result,
    state: (f.state as Fixture['state']) ?? 'SCHEDULED',
  };
}

interface MessageRow {
  id: number; body: string; created_at: string; user_id?: string | null;
  profiles: { handle: string } | { handle: string }[] | null;
}

/**
 * 지난 메시지를 불러올 때는 발화자의 등급을 함께 받지 않는다.
 * (Broadcast 로 들어오는 실시간 메시지에는 실려 온다 — 명세 14.4)
 * 모르는 값을 BRONZE·상위 100% 로 채우면 화면에 가짜 뱃지가 붙으므로 null 로 둔다.
 */
function toMessage(m: MessageRow, fixtureId: number, mine: boolean): ChatMessage {
  const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
  const handle = profile?.handle ?? '익명';
  return {
    id: String(m.id),
    fixtureId,
    userId: m.user_id ?? null,
    handle,
    initial: handle.slice(0, 1),
    topPercent: null,
    tier: null,
    body: m.body,
    at: new Date(m.created_at).toTimeString().slice(0, 5),
    mine,
  };
}

/** 'Regular Season - 6' → 6. 숫자가 없으면 null (0R 로 그리지 않기 위해) */
function parseRound(raw: string | null): number | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : null;
}
