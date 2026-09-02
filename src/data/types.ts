import type { Confidence, Distribution, Outcome, Tier } from '../lib/scoring';

export interface League {
  id: number;
  name: string;
  short: string;
  country: string;
  logoUrl?: string | null;
  flagUrl?: string | null;
}

export interface Team {
  id: number;
  leagueId: number;
  /** 화면에 쓰는 이름. 한글명이 있으면 그것 */
  name: string;
  /** API 원본 영문명. 검색에서만 쓴다 */
  nameEn?: string;
  abbr: string;
  /** API-Football 이 주는 엠블럼. 없거나 로딩에 실패하면 모노그램으로 떨어진다 */
  logoUrl?: string | null;
  color: string;
  tint: string;
}

export interface Fixture {
  id: number;
  leagueId: number;
  round: number;
  homeTeamId: number;
  awayTeamId: number;
  venue: string;
  kickoffAt: string;
  /** 예측 창이 열리는 시각 = 킥오프가 속한 매치데이의 시작 (KST 06:00) */
  opensAt: string;
  lockAt: string;
  /** 마감 시점에 동결되는 기준선. 마감 전에는 잠정값이다. (명세 2.2) */
  baseline: Distribution;
  participants: number;
  state: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'VOID';
  /** 정규 90분 결과. 아직 안 끝났으면 null (명세 9장) */
  homeGoals: number | null;
  awayGoals: number | null;
  result: Outcome | null;
}

/** 정산된 내 예측의 결과 */
export interface SettlementResult {
  fixtureId: number;
  deltaRating: number;
  points: number;
}

export interface Prediction {
  fixtureId: number;
  pick: Outcome;
  confidence: Confidence;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  fixtureId: number;
  handle: string;
  initial: string;
  /** 발화자의 상위 % — 채팅에서 누구 말을 믿을지 판단하는 근거 (명세 10.2) */
  topPercent: number;
  tier: Tier;
  body: string;
  at: string;
  mine?: boolean;
}

export interface RankRow {
  rank: number;
  handle: string;
  initial: string;
  accuracy: number;
  /** 축잘알 지수 — 랭킹의 기준값 */
  rating: number;
  /** 직전 발표 대비 순위 변동. 양수면 올라갔다. 신규 진입은 null */
  change: number | null;
  isMe?: boolean;
}

/** 아직 배치를 못 마쳐 순위에 없는 상태 */
export interface PlacementState {
  settled: number;
  required: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  group: string;
  tier: 'bronze' | 'silver' | 'gold';
  condition: string;
  progress: number;
  target: number;
}

/** 내 기록 화면이 쓰는 집계값. 서버 my_stats() 의 응답 형태다. */
export interface MyStats {
  settled: number;
  hits: number;
  byLeague: { leagueId: number; n: number; accuracy: number }[];
  /** expected = 내가 건 평균 확률, actual = 실제 적중률 */
  calibration: { confidence: 1 | 2 | 3; n: number; expected: number; actual: number }[];
  fanBias: { teamIds: number[]; n: number; bias: number } | null;
  recent: { correct: boolean; delta: number }[];
}
