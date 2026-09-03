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
  /** 라운드. 원본에 없으면 null — 0R 같은 지어낸 값을 만들지 않는다 */
  round: number | null;
  homeTeamId: number;
  awayTeamId: number;
  /** 경기장. 원본에 없으면 null */
  venue: string | null;
  kickoffAt: string;
  /** 예측 창이 열리는 시각 = 킥오프가 속한 매치데이의 시작 (KST 06:00) */
  opensAt: string;
  lockAt: string;
  /**
   * 마감 시점에 동결되는 기준선. 마감 전에는 잠정값이다. (명세 2.2)
   *
   * 지금까지 모인 사람들의 확률 분포.
   * 아직 아무도 예측하지 않았거나 집계를 못 받으면 null 이다 —
   * 이 자리에 기본값을 채워 넣으면 없는 여론을 지어내는 게 된다.
   */
  baseline: Distribution | null;
  /** 예측에 참여한 사람 수. 집계를 못 받았으면 null (0 과 다르다) */
  participants: number | null;
  state: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'VOID';
  /** 정규 90분 결과. 아직 안 끝났으면 null (명세 9장) */
  homeGoals: number | null;
  awayGoals: number | null;
  result: Outcome | null;
  /**
   * 진행 중 점수. 표시 전용이다 — 정산은 오직 homeGoals/awayGoals(정규 결과)만 본다.
   * 아직 시작 안 했으면 null.
   */
  liveHome: number | null;
  liveAway: number | null;
  /** 경과 분. 하프타임에는 45 에서 멈춘다 */
  elapsed: number | null;
}

/* ------------------------------------------------------------------ 경기 부가 정보 */

export type MatchEventType = 'Goal' | 'Card' | 'subst' | 'Var';

export interface MatchEvent {
  seq: number;
  minute: number | null;
  extra: number | null;
  teamId: number | null;
  type: string;
  detail: string | null;
  player: string | null;
  assist: string | null;
}

export interface LineupPlayer {
  name: string | null;
  number: number | null;
  pos: string | null;
}

export interface Lineup {
  teamId: number;
  formation: string | null;
  coach: string | null;
  starters: LineupPlayer[];
  bench: LineupPlayer[];
}

export interface H2HMatch {
  date: string;
  homeId: number;
  awayId: number;
  hg: number | null;
  ag: number | null;
}

export interface HeadToHead {
  played: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  recent: H2HMatch[];
}

/** 종료된 경기의 팀별 기록. API 가 주는 이름을 그대로 쓴다 */
export interface TeamStats {
  teamId: number;
  stats: Record<string, string | number | null>;
}

/** 경기 상세가 한 번에 받아오는 묶음. 없는 항목은 빈 값이다 */
export interface MatchDetailData {
  events: MatchEvent[];
  lineups: Lineup[];
  h2h: HeadToHead | null;
  stats: TeamStats[];
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

/** 신고 사유. 서버 check 제약과 같은 값이어야 한다 */
export type ReportReason = 'SPAM' | 'ABUSE' | 'SEXUAL' | 'ADVERT' | 'OTHER';

export interface ChatMessage {
  id: string;
  fixtureId: number;
  /** 발화자. 차단하려면 필요하다 */
  userId: string | null;
  handle: string;
  initial: string;
  /** 발화자의 상위 % — 채팅에서 누구 말을 믿을지 판단하는 근거 (명세 10.2) */
  /** 상위 몇 %. 아직 순위에 오르지 않았으면 null */
  topPercent: number | null;
  /** 티어. 순위가 없으면 null */
  tier: Tier | null;
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
  /**
   * 목표치는 user_badges 행에만 있다. 아직 시작하지 않은 뱃지는 그 행이 없어서
   * 알 수 없다 — 1 같은 그럴듯한 값을 넣으면 '0/1' 이라는 없는 진행도가 생긴다.
   */
  target: number | null;
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
