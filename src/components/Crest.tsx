import { team } from '../data/catalog';

/**
 * 팀 엠블럼 자리. 엠블럼 라이선스가 확정되기 전까지는
 * 팀 컬러 + 약어 모노그램 플레이스홀더를 쓴다. (명세 12.1)
 */
export function Crest({ teamId, size = 28 }: { teamId: number; size?: number }) {
  const t = team(teamId);
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
