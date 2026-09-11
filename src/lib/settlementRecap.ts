import type { Outcome } from './scoring';

export interface RecapItem {
  id: string;
  fixtureId: number;
  homeName: string;
  awayName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  pick: Outcome;
  actual: Outcome;
  correct: boolean;
  deltaRating: number;
  points: number;
  settledAt: string;
}
export interface Recap { items: RecapItem[]; remaining: number }
export const recapTotals = (items: RecapItem[]) => items.reduce((s, r) => ({
  correct: s.correct + Number(r.correct), delta: s.delta + r.deltaRating, points: s.points + r.points,
}), { correct: 0, delta: 0, points: 0 });
export const recapPick = (r: RecapItem) => r.pick === 'DRAW' ? '무승부' : `${r.pick === 'HOME' ? r.homeName : r.awayName} 승`;
