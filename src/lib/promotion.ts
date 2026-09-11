export interface FirstVisitReward {
  status: 'paid' | 'pending' | 'retry' | 'ended';
  amount: number;
  newlyPaid: boolean;
}
export const firstVisitPromotionOpen = () => Date.now() >= Date.parse('2026-09-07T00:00:00+09:00') && Date.now() < Date.parse('2026-09-22T00:00:00+09:00');
