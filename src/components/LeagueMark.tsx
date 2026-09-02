import { useState } from 'react';
import { league } from '../data/catalog';

/**
 * 리그 엠블럼. 로고가 없거나 실패하면 아무것도 그리지 않는다 —
 * 리그 이름은 늘 옆에 있으므로 빈 자리 표시가 오히려 지저분하다.
 */
export function LeagueMark({ leagueId, size = 18 }: { leagueId: number; size?: number }) {
  const l = league(leagueId);
  const [failed, setFailed] = useState(false);
  if (!l.logoUrl || failed) return null;
  return (
    <img
      src={l.logoUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
    />
  );
}
