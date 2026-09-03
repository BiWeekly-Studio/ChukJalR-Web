import { TIER_LABEL } from '../lib/scoring';
import type { Tier } from '../lib/scoring';

/**
 * 티어는 앱에서 가장 자주 보는 신분증이다. 등급마다 색이 확실히 달라야 한다.
 * 아직 티어가 없는 사람(순위 발표 전)에게는 아무것도 그리지 않는다.
 */
export function TierChip({ tier, children }: { tier: Tier | null; children?: React.ReactNode }) {
  if (!tier) return null;
  return (
    <span className="tierchip" data-tier={tier}>
      {TIER_LABEL[tier]}
      {children}
    </span>
  );
}
