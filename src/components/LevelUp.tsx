import { useEffect, useState } from 'react';
import { Burst } from './Burst';
import { TIER_LABEL } from '../lib/scoring';
import { haptic, useIncreased } from '../lib/anim';
import { useApp } from '../store';

/**
 * 레벨이 오른 순간에만 뜨는 축하 오버레이.
 * 앱을 켜자마자 터지면 안 되므로 useIncreased 가 첫 렌더를 건너뛴다.
 */
export function LevelUp() {
  const { level, tier } = useApp();
  const jumped = useIncreased(level.level, 3200);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!jumped) return;
    setOpen(true);
    haptic([14, 60, 22]);
  }, [jumped]);

  if (!open) return null;

  return (
    <div className="celebrate" onClick={() => setOpen(false)} role="dialog" aria-label="레벨 업">
      <div className="box">
        <div className="halo">
          <span>{level.level}</span>
          <Burst seed={level.level} label="LEVEL UP" />
        </div>
        <p className="h1" style={{ fontSize: 22 }}>레벨 업!</p>
        <p className="small muted" style={{ margin: '8px 0 18px' }}>
          Lv.{level.level}{tier ? ` ${TIER_LABEL[tier]}` : ''} 달성. 계속 이 감으로 가요.
        </p>
        <button className="cta" style={{ height: 48 }} onClick={() => setOpen(false)}>
          좋아요
        </button>
      </div>
    </div>
  );
}
