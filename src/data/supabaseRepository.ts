import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Catalog, MeSnapshot, Repository } from './repository';
import type {
  BadgeDef, ChatMessage, Fixture, MyStats, Prediction, RankRow, SettlementResult,
} from './types';
import type { Confidence, Outcome, Tier } from '../lib/scoring';

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
   * 세션 확보.
   * 프로덕션에서는 토스 로그인 브리지가 발급한 JWT 로 세션이 이미 서 있다 (명세 14.5).
   * 개발 중에는 토스 앱 밖이라 그 경로를 쓸 수 없으므로, 플래그가 켜져 있으면
   * Supabase 익명 로그인으로 세션을 만든다. 익명 유저도 auth.users 행이 생기므로
   * 프로필·ratings 트리거가 그대로 돈다.
   */
  let sessionReady: Promise<string | null> | null = null;

  async function ensureSession(): Promise<string | null> {
    const { data } = await sb.auth.getSession();
    if (data.session) return data.session.user.id;

    if (import.meta.env.VITE_DEV_ANON_AUTH === 'true') {
      const { data: signed, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      return signed.user?.id ?? null;
    }
    return null;
  }

  async function uid(): Promise<string | null> {
    if (!sessionReady) sessionReady = ensureSession();
    return sessionReady;
  }

  return {
    kind: 'supabase',

    async loadCatalog(): Promise<Catalog> {
      const horizon = new Date(Date.now() + 14 * 864e5).toISOString();
      const [leagues, teams, fixtures] = await Promise.all([
        sb.from('leagues').select('id, name, short_name, country'),
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
      const ids = fixtures.data.map((f) => f.id);
      const { data: baselines } = ids.length
        ? await sb.rpc('live_baselines', { p_fixture_ids: ids })
        : { data: [] as BaselineRow[] };
      const byId = new Map(
        ((baselines ?? []) as BaselineRow[]).map((b) => [b.fixture_id, b])
      );

      return {
        leagues: leagues.data.map((l) => ({
          id: l.id, name: l.name, short: l.short_name, country: l.country,
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
        topPercent: board.data?.top_percent ?? 100,
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
          target: mine?.target ?? 1,
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
        // 레이트 리밋은 트리거가 예외로 던진다 (명세 14.4)
        throw new Error(error.message.includes('RATE_LIMIT') ? 'RATE_LIMIT' : error.message);
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
            id: number; userId: string; handle: string;
            topPercent: number | null; tier: string; body: string; at: string;
          };
          onMessage({
            id: String(p.id),
            fixtureId,
            handle: p.handle,
            initial: p.handle.slice(0, 1),
            topPercent: p.topPercent ?? 100,
            tier: p.tier as Tier,
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
    round: Number(String(f.round ?? '').replace(/\D/g, '')) || 0,
    homeTeamId: f.home_team_id,
    awayTeamId: f.away_team_id,
    venue: f.venue ?? '',
    kickoffAt: f.kickoff_at,
    opensAt: f.opens_at,
    lockAt: f.lock_at,
    // 동결 전에는 live_baselines 가 계산해 준 값을 쓴다. 서버 정산과 같은 공식이다.
    baseline: b ? (b.q.map(Number) as [number, number, number]) : [0.45, 0.26, 0.29],
    participants: b?.n ?? 0,
    homeGoals: f.home_goals_ft,
    awayGoals: f.away_goals_ft,
    result: f.result,
    state: (f.state as Fixture['state']) ?? 'SCHEDULED',
  };
}

interface MessageRow {
  id: number; body: string; created_at: string;
  profiles: { handle: string } | { handle: string }[] | null;
}

function toMessage(m: MessageRow, fixtureId: number, mine: boolean): ChatMessage {
  const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
  const handle = profile?.handle ?? '익명';
  return {
    id: String(m.id),
    fixtureId,
    handle,
    initial: handle.slice(0, 1),
    topPercent: 100,
    tier: 'BRONZE' as Tier,
    body: m.body,
    at: new Date(m.created_at).toTimeString().slice(0, 5),
    mine,
  };
}
