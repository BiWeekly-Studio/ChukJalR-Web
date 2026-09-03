/**
 * 축잘알 점수 엔진 — 기술 명세 2장의 공식을 그대로 옮긴 것.
 *
 * 이 파일의 계산은 "미리보기" 용도다. 실제 지수/포인트는 서버 정산이 진실의 원천이며,
 * 클라이언트 값은 결과가 오면 서버 값으로 덮어쓴다. (명세 11.1)
 */

export type Outcome = 'HOME' | 'DRAW' | 'AWAY';
export type Confidence = 1 | 2 | 3;

/** 결과 배열 인덱스 순서. 모든 확률 배열은 이 순서를 따른다. */
export const OUTCOMES: readonly Outcome[] = ['HOME', 'DRAW', 'AWAY'] as const;

/** 로그 스코어 배율. 경제 파라미터가 아니라 실력 측정 단위이므로 함부로 바꾸지 않는다. */
export const K = 40;
export const CLAMP_MIN = -60;
export const CLAMP_MAX = 90;

/** 확신도 → 기준선에서 내 픽 쪽으로 이동하는 비율 */
export const CONFIDENCE_SHIFT: Record<Confidence, number> = { 1: 0.15, 2: 0.35, 3: 0.6 };

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  1: '감이 와요',
  2: '꽤 확신해요',
  3: '이건 확실해요',
};

export type Distribution = [number, number, number];

export function outcomeIndex(o: Outcome): 0 | 1 | 2 {
  return OUTCOMES.indexOf(o) as 0 | 1 | 2;
}

/** 합이 1이 되도록 정규화하고 [0.03, 0.94]로 클램프한다. (명세 2.2) */
export function normalizeBaseline(raw: Distribution): Distribution {
  const clamped = raw.map((v) => Math.min(0.94, Math.max(0.03, v)));
  const sum = clamped.reduce((a, b) => a + b, 0);
  return clamped.map((v) => v / sum) as Distribution;
}

/**
 * 유저 확률분포. 확신도는 절대 확률이 아니라 기준선에서의 상대 이동으로 해석한다.
 * 이 설계 덕분에 "맞혔는데 점수가 깎이는" 경우가 생기지 않는다. (명세 2.3)
 */
export function userDistribution(
  baseline: Distribution,
  pick: Outcome,
  confidence: Confidence
): Distribution {
  const q = baseline;
  const i = outcomeIndex(pick);
  const p: number[] = [0, 0, 0];
  p[i] = q[i] + CONFIDENCE_SHIFT[confidence] * (1 - q[i]);

  const rest = 1 - p[i];
  const otherSum = q.reduce((acc, v, idx) => (idx === i ? acc : acc + v), 0);
  for (let j = 0; j < 3; j++) {
    if (j !== i) p[j] = (rest * q[j]) / otherSum;
  }
  return p as Distribution;
}

/** Δ지수 = round(K · log2(p(실제) / q(실제))), clamp 적용 (명세 2.4) */
export function deltaRating(
  baseline: Distribution,
  pick: Outcome,
  confidence: Confidence,
  actual: Outcome
): number {
  const p = userDistribution(baseline, pick, confidence);
  const a = outcomeIndex(actual);
  const raw = K * Math.log2(p[a] / baseline[a]);
  return Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, Math.round(raw)));
}

export interface ScorePreview {
  /** 내가 픽한 결과에 부여한 확률 */
  pPick: number;
  /** 맞았을 때 지수 변동 (양수) */
  ifCorrect: number;
  /** 틀렸을 때 지수 변동 (음수) — 어떤 오답이든 동일하다 (명세 2.5) */
  ifWrong: number;
  /** 맞았을 때 적립 포인트 */
  pointsIfCorrect: number;
  /** 틀렸을 때 적립 포인트 (참여 보너스만) */
  pointsIfWrong: number;
}

export const PARTICIPATION_POINTS = 3;

/** 스트릭 보너스 = min(연속적중, 10) × 2 (명세 2.8) */
export function streakBonus(streak: number): number {
  return Math.min(Math.max(streak, 0), 10) * 2;
}

export function previewScore(
  baseline: Distribution,
  pick: Outcome,
  confidence: Confidence,
  streak = 0
): ScorePreview {
  const p = userDistribution(baseline, pick, confidence);
  const i = outcomeIndex(pick);
  const wrong = OUTCOMES[(i + 1) % 3];

  const ifCorrect = deltaRating(baseline, pick, confidence, pick);
  const ifWrong = deltaRating(baseline, pick, confidence, wrong);

  return {
    pPick: p[i],
    ifCorrect,
    ifWrong,
    pointsIfCorrect: Math.max(0, ifCorrect) + PARTICIPATION_POINTS + streakBonus(streak),
    pointsIfWrong: PARTICIPATION_POINTS,
  };
}

/* ------------------------------------------------------------------ */
/* 레벨 · 티어                                                          */
/* ------------------------------------------------------------------ */

/** 레벨 L → L+1 에 필요한 포인트 */
export function pointsForNextLevel(level: number): number {
  return 100 + 25 * (level - 1);
}

/** 레벨 L 도달에 필요한 누적 포인트 = (L−1)(75 + 12.5L) */
export function cumulativePointsForLevel(level: number): number {
  return Math.round((level - 1) * (75 + 12.5 * level));
}

export const MAX_LEVEL = 50;

export interface LevelState {
  level: number;
  /** 현재 레벨 안에서 쌓은 포인트 */
  into: number;
  /** 다음 레벨까지 필요한 총량 */
  need: number;
  /** 0..1 */
  progress: number;
}

export function levelFromPoints(lifetimePoints: number): LevelState {
  let level = 1;
  while (level < MAX_LEVEL && cumulativePointsForLevel(level + 1) <= lifetimePoints) {
    level++;
  }
  const base = cumulativePointsForLevel(level);
  const need = level >= MAX_LEVEL ? 0 : pointsForNextLevel(level);
  const into = lifetimePoints - base;
  return { level, into, need, progress: need === 0 ? 1 : Math.min(1, into / need) };
}

export type Tier =
  | 'PLACEMENT'
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM'
  | 'DIAMOND'
  | 'MASTER'
  | 'GRANDMASTER';

export const TIER_LABEL: Record<Tier, string> = {
  PLACEMENT: '배치 중',
  BRONZE: '브론즈',
  SILVER: '실버',
  GOLD: '골드',
  PLATINUM: '플래티넘',
  DIAMOND: '다이아몬드',
  MASTER: '마스터',
  GRANDMASTER: '그랜드마스터',
};

export const PLACEMENT_MATCHES = 20;

/**
 * 백분위(상위 %)로 티어를 정한다. 유저가 늘어도 자동으로 균형이 맞는다. (명세 3.3)
 *
 * 배치를 마쳤는데 아직 순위표에 오르지 않았으면(= 다음 발표 전) 티어는 '없음'이다.
 * 이때 브론즈로 떨어뜨리면 실제로 받은 적 없는 등급을 보여주게 된다.
 */
export function tierFromPercentile(
  topPercent: number | null,
  settledMatches: number
): Tier | null {
  if (settledMatches < PLACEMENT_MATCHES) return 'PLACEMENT';
  if (topPercent == null) return null;
  if (topPercent <= 1) return 'GRANDMASTER';
  if (topPercent <= 5) return 'MASTER';
  if (topPercent <= 15) return 'DIAMOND';
  if (topPercent <= 30) return 'PLATINUM';
  if (topPercent <= 50) return 'GOLD';
  if (topPercent <= 75) return 'SILVER';
  return 'BRONZE';
}
