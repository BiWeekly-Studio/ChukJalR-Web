import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../lib/anim';

const COLORS = ['#3a63ff', '#7b46f0', '#ffc02e', '#ff7a1a', '#22c97e', '#ff5f2e'];
const COUNT = 14;

/** 조각 하나하나의 날아가는 방향. 매번 랜덤이면 튀므로 부채꼴로 고정한다. */
const PIECES = Array.from({ length: COUNT }, (_, i) => {
  const angle = (-160 + (140 / (COUNT - 1)) * i) * (Math.PI / 180);
  const dist = 62 + ((i * 37) % 46);
  return {
    dx: `${Math.round(Math.cos(angle) * dist)}px`,
    dy: `${Math.round(Math.sin(angle) * dist)}px`,
    rot: `${((i * 97) % 2 ? 1 : -1) * (180 + ((i * 53) % 240))}deg`,
    color: COLORS[i % COLORS.length],
    delay: `${(i % 5) * 22}ms`,
  };
});

/**
 * 예측을 확정한 순간 카드에서 터지는 색종이와 획득 점수.
 * seed 가 바뀔 때마다 한 번 재생되고 스스로 사라진다.
 */
export function Burst({ seed, label }: { seed: number; label: string }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (seed === 0 || prefersReducedMotion()) return;
    setOn(true);
    const id = setTimeout(() => setOn(false), 1200);
    return () => clearTimeout(id);
  }, [seed]);

  if (!on) return null;

  return (
    <div className="burst" aria-hidden key={seed}>
      {PIECES.map((p, i) => (
        <i
          key={i}
          style={{
            background: p.color,
            animationDelay: p.delay,
            ['--dx' as string]: p.dx,
            ['--dy' as string]: p.dy,
            ['--rot' as string]: p.rot,
          }}
        />
      ))}
      <span className="score">{label}</span>
    </div>
  );
}
