import type { Auth, AuthUser, Repository, Catalog, MeSnapshot } from './repository';
import type { ChatMessage, MyStats } from './types';
import {
  BADGES, CHAT_INCOMING, CHAT_SEED, FIXTURES, LEAGUES, RANKING, TEAMS,
} from './mock';

/**
 * 목업에는 계정이라는 개념이 없다. 백엔드 없이 화면을 보는 모드이므로
 * 언제나 같은 사람이 로그인해 있는 것처럼 굴고, 로그인/로그아웃은 아무 일도 하지 않는다.
 */
const MOCK_USER: AuthUser = { id: 'mock-user', email: 'mock@example.com' };

const mockAuth: Auth = {
  async current() { return MOCK_USER; },
  async signUp() { return { needsConfirmation: false }; },
  async signIn() {},
  async signInWithToss() {},
  async signInWithProvider() {},
  async listProviders() { return []; },
  async signOut() {},
  onChange() { return () => {}; },
};

/** 백엔드 없이 화면을 돌리기 위한 구현. 상태는 store 가 localStorage 에 보관한다. */
export const mockRepository: Repository = {
  kind: 'mock',
  auth: mockAuth,

  async loadCatalog(): Promise<Catalog> {
    return { leagues: LEAGUES, teams: TEAMS, fixtures: FIXTURES };
  },

  async loadMe(): Promise<MeSnapshot> {
    return {
      handle: '샤라포바',
      leagueOrder: LEAGUES.map((l) => l.id),
      favoriteTeamIds: [],
      onboarded: false,
      rating: 1240,
      lifetimePoints: 2610,
      balance: 1322,
      streak: 7,
      settledMatches: 50,
      topPercent: 3.1,
      predictions: [],
      settlements: [],
    };
  },

  async saveOnboarding() {},
  async upsertPrediction() {},
  async loadRanking() { return RANKING; },
  async loadMyRank() { return null; },
  async loadBadges() { return BADGES; },

  async loadMyStats(): Promise<MyStats> {
    return {
      settled: 50,
      hits: 34,
      byLeague: [
        { leagueId: 39, n: 22, accuracy: 0.74 },
        { leagueId: 140, n: 13, accuracy: 0.61 },
        { leagueId: 78, n: 9, accuracy: 0.55 },
        { leagueId: 135, n: 6, accuracy: 0.49 },
      ],
      calibration: [
        { confidence: 1, n: 22, expected: 0.55, actual: 0.58 },
        { confidence: 2, n: 18, expected: 0.71, actual: 0.74 },
        { confidence: 3, n: 14, expected: 0.82, actual: 0.69 },
      ],
      fanBias: { teamIds: [42], n: 12, bias: -12 },
      recent: [1, 1, 0, 1, 1, 0, 1, 1, 0, 1].map((c) => ({ correct: c === 1, delta: c ? 18 : -25 })),
    };
  },

  async loadChat(fixtureId: number) {
    return CHAT_SEED.filter((m) => m.fixtureId === fixtureId);
  },

  async sendChat() {},
  async reportMessage() {},
  async blockUser() {},

  /** 실제 구현에서는 Realtime Broadcast 구독. 여기서는 9초마다 가짜 메시지를 넣는다. */
  subscribeChat(
    fixtureId: number,
    onMessage: (m: ChatMessage) => void,
    onPresence?: (count: number) => void
  ) {
    onPresence?.(1);
    let i = 0;
    const timer = window.setInterval(() => {
      const src = CHAT_INCOMING[i % CHAT_INCOMING.length];
      i += 1;
      const d = new Date();
      onMessage({
        ...src,
        id: `in-${i}-${Date.now()}`,
        fixtureId,
        at: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      });
    }, 9000);
    return () => window.clearInterval(timer);
  },
};
