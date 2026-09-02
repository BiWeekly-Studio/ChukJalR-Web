import { useState } from 'react';
import { team } from '../data/catalog';

/**
 * 팀 엠블럼. API-Football 이 주는 로고를 쓰고, 없거나 로딩에 실패하면
 * 팀 컬러 + 약어 모노그램으로 떨어진다. 실패해도 자리와 색은 유지된다.
 */
export function Crest({ teamId, size = 28 }: { teamId: number; size?: number }) {
  const t = team(teamId);
  const [failed, setFailed] = useState(false);

  if (t.logoUrl && !failed) {
    return (
      <img
        className="crest"
        src={t.logoUrl}
        alt={t.name}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{
          width: size,
          height: size,
          background: '#fff',
          objectFit: 'contain',
          padding: Math.max(1, Math.round(size * 0.08)),
        }}
      />
    );
  }

  return (
    <span
      className="crest"
      style={{
        width: size,
        height: size,
        background: t.tint,
        color: t.color,
        fontSize: size <= 30 ? 9 : Math.round(size * 0.28),
      }}
      aria-label={t.name}
    >
      {t.abbr}
    </span>
  );
}
