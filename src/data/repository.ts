import type {
  BadgeDef, ChatMessage, Fixture, League, MyStats, Prediction, RankRow,
  SettlementResult, Team,
} from './types';
import type { Confidence, Outcome } from '../lib/scoring';

export interface Catalog {
  leagues: League[];
  teams: Team[];
  fixtures: Fixture[];
}

export interface MeSnapshot {
  handle: string;
  leagueOrder: number[];
  favoriteTeamIds: number[];
  onboarded: boolean;
  rating: number;
  lifetimePoints: number;
  balance: number;
  streak: number;
  settledMatches: number;
  topPercent: number;
  predictions: Prediction[];
  /** 이미 정산된 예측의 결과. 피드에서 결과를 보여주는 데 쓴다 */
  settlements: SettlementResult[];
}

/**
 * 화면이 데이터를 얻는 유일한 통로.
 * 목업과 Supabase 구현이 이 인터페이스를 공유하므로, 백엔드가 붙어도 화면은 바뀌지 않는다.
 */
export interface Repository {
  readonly kind: 'mock' | 'supabase';
  loadCatalog(): Promise<Catalog>;
  loadMe(): Promise<MeSnapshot>;
  /** 최애 팀은 최대 5개 */
  saveOnboarding(leagueOrder: number[], favoriteTeamIds: number[]): Promise<void>;
  upsertPrediction(fixtureId: number, pick: Outcome, confidence: Confidence): Promise<void>;
  loadRanking(): Promise<RankRow[]>;
  /** 순위표에 오른 경우 내 행. 배치 중이면 null */
  loadMyRank(): Promise<RankRow | null>;
  loadBadges(): Promise<BadgeDef[]>;
  /** 프로필 화면 집계. 한 번의 호출로 전부 받는다 */
  loadMyStats(): Promise<MyStats>;
  loadChat(fixtureId: number): Promise<ChatMessage[]>;
  sendChat(fixtureId: number, body: string): Promise<void>;
  /**
   * 경기 채팅 구독. 반환값은 구독 해제 함수.
   * onPresence 는 지금 이 채널을 보고 있는 사람 수를 알려준다 (Realtime Presence).
   */
  subscribeChat(
    fixtureId: number,
    onMessage: (m: ChatMessage) => void,
    onPresence?: (count: number) => void
  ): () => void;
}
