import { useId } from 'react';

/**
 * 오늘의 예측 진행률 링. 숫자만 있는 것보다 "채워야 할 것"이 눈에 남는다.
 * 채워지는 애니메이션은 stroke-dashoffset 전환으로 처리한다.
 */
export function Ring({
  value,
  total,
  size = 44,
  stroke = 5,
}: { value: number; total: number; size?: number; stroke?: number }) {
  const id = useId();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  const done = total > 0 && value >= total;

  return (
    <div
      className="ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`오늘 ${total}경기 중 ${value}경기 예측함`}
    >
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={`ringgrad-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={done ? '#22c97e' : '#3a63ff'} />
            <stop offset="100%" stopColor={done ? '#0b8f57' : '#7b46f0'} />
          </linearGradient>
        </defs>
        <circle className="trk" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="prg"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          stroke={`url(#ringgrad-${id})`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <span className="lbl" style={done ? { color: 'var(--win)' } : undefined}>
        {value}/{total}
      </span>
    </div>
  );
}
