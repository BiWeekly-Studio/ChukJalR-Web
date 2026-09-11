import tokens from '../../design/system/tokens.json';
import { useId } from 'react';

/**
 * 축잘알 축구공 마크.
 *
 * 오각형 하나 + 다섯 갈래 이음선이라는 최소 구성이다. 하단 탭과 앱인토스 목록에서
 * 20px 안팎으로 줄어들기 때문에, 패널을 다 그리면 그 크기에서 뭉개진다.
 *
 * 좌표는 24 그리드 기준으로 중심 (12,12), 공 반지름 9, 오각형 반지름 4.2 에서 뽑았다.
 */
const PENTAGON = '12,7.8 15.99,10.7 14.47,15.4 9.53,15.4 8.01,10.7';
const SPOKES: [number, number, number, number][] = [
  [12, 7.8, 12, 3],
  [15.99, 10.7, 20.56, 9.22],
  [14.47, 15.4, 17.29, 19.28],
  [9.53, 15.4, 6.71, 19.28],
  [8.01, 10.7, 3.44, 9.22],
];

/** 선으로만 그린 공. 글자색을 그대로 따라간다 */
export function BallMark({
  size = 24,
  color = 'currentColor',
  strokeWidth = 1.8,
}: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} />
      <polygon points={PENTAGON} fill={color} />
      {SPOKES.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** 색이 채워진 공. 그라데이션 배경 위에 얹는 용도 */
export function BallSolid({ size = 24, ink = tokens.colors.accent }: { size?: number; ink?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.6" fill="#fff" />
      <polygon points={PENTAGON} fill={ink} />
      {SPOKES.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={ink} strokeWidth="1.9" strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/**
 * 앱 아이콘. 둥근 사각형 안에 공.
 * 앱인토스 목록에서는 이 형태로만 보이므로 여백을 넉넉히 둔다.
 */
export function LogoIcon({ size = 40, radius = 0.24 }: { size?: number; radius?: number }) {
  const shape = chuk();
  return <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="축잘알" style={{display:'block',flexShrink:0}}>
    <rect width={100} height={100} rx={radius*100} fill={tokens.colors.ink} />
    <g transform="translate(50 50) scale(0.447368421) rotate(-4) translate(-50 -50)">
      <rect x={-26} y={-15} width={152} height={152} rx={18} fill={tokens.colors['accent-deep']} stroke={tokens.colors.ink} strokeWidth={13} />
      <rect x={-26} y={-26} width={152} height={152} rx={18} fill={tokens.colors.lime} stroke={tokens.colors.ink} strokeWidth={13} />
      <g fill={tokens.colors.ink} stroke={tokens.colors.ink} strokeWidth={16} strokeLinejoin="round">
        {shape.rects.map(([x,y,w,h],i)=><rect key={i} x={x} y={y} width={w} height={h} />)}
        {shape.lines.map(([x1,y1,x2,y2],i)=><line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />)}
      </g>
      <Strokes shape={shape} fill={tokens.colors.ink} />
    </g>
  </svg>;
}

/* ------------------------------------------------------------------ */
/* 축잘알 로고                                                          */
/* ------------------------------------------------------------------ */

/**
 * 폰트가 아니라 획을 직접 쌓아 그린 글자다. 한 글자를 100x100 칸에 꽉 채우고,
 * 세 글자를 붙여 하나의 덩어리로 만든 뒤 판때기에 얹고 살짝 기울인다.
 * 두께는 두꺼운 외곽선 한 겹과 아래로 밀린 그림자 판때기로 낸다.
 *
 * 좌표는 ios/Sources/PlateLogo.swift 와 같다 — 한쪽만 고치면 두 앱이 갈라진다.
 * 원본 스케치는 design/wordmark-v2.html.
 */
const CELL = 100;
const GAP = 6;
const BLOCK_W = CELL * 3 + GAP * 2;
const PAD = 16;
const TILT = -4;
const BOX_W = BLOCK_W + 80;
const BOX_H = CELL + 92;

type Shape = { rects: [number, number, number, number][]; lines: [number, number, number, number, number][] };

function merge(...parts: Shape[]): Shape {
  return {
    rects: parts.flatMap((p) => p.rects),
    lines: parts.flatMap((p) => p.lines),
  };
}
const rect = (x: number, y: number, w: number, h: number): Shape => ({ rects: [[x, y, w, h]], lines: [] });
const line = (x1: number, y1: number, x2: number, y2: number, w: number): Shape => ({
  rects: [], lines: [[x1, y1, x2, y2, w]],
});

const chuk = (): Shape =>
  merge(
    rect(38, 0, 24, 8),
    rect(0, 11, 100, 13),
    line(50, 24, 13, 38, 14),
    line(50, 24, 87, 38, 14),
    rect(0, 45, 100, 12),
    rect(43, 57, 14, 11),
    rect(0, 76, 100, 12),
    rect(86, 88, 14, 12)
  );

const rieul = (top: number): Shape =>
  merge(
    rect(0, top, 100, 12),
    rect(88, top + 12, 12, 6),
    rect(0, top + 18, 100, 12),
    rect(0, top + 30, 12, 6),
    rect(0, top + 36, 100, 12)
  );

/** ㅏ — 칸 오른쪽 끝에 붙이지 않는다. 외곽선이 판때기를 넘어간다 */
const ah = (): Shape => merge(rect(71, 0, 14, 50), rect(85, 18, 11, 13));

const jal = (): Shape =>
  merge(rect(0, 4, 58, 13), line(29, 17, 4, 46, 14), line(29, 17, 54, 46, 14), ah(), rieul(52));

/** ㅇ 자리에 축구공이 들어간다 */
const BALL = { cx: 30, cy: 25, r: 25 };
const PANEL = BALL.r * 0.44;
const ANGLES = [-90, -18, 54, 126, 198];
const at = (a: number, radius: number) => {
  const t = (a * Math.PI) / 180;
  return [BALL.cx + Math.cos(t) * radius, BALL.cy + Math.sin(t) * radius] as const;
};
const PANEL_POINTS = ANGLES.map((a) => at(a, PANEL).map((n) => n.toFixed(1)).join(',')).join(' ');

function Strokes({ shape, fill, stroke }: { shape: Shape; fill: string; stroke?: string }) {
  // Paint touching bars in one compound path to avoid hairline raster seams.
  // The rectangle and butt-capped line geometry is unchanged.
  const d = [
    ...shape.rects.map(([x,y,w,h]) => `M${x} ${y}h${w}v${h}h${-w}Z`),
    ...shape.lines.map(([x1,y1,x2,y2,w]) => {
      const length = Math.hypot(x2-x1,y2-y1);
      const nx = -(y2-y1)/length*w/2, ny = (x2-x1)/length*w/2;
      return `M${x1-nx} ${y1-ny}L${x2-nx} ${y2-ny}L${x2+nx} ${y2+ny}L${x1+nx} ${y1+ny}Z`;
    }),
  ].join(' ');
  return (
    <path d={d} fill={fill} stroke={stroke ?? fill} strokeWidth={0} />
  );
}

export type LogoTone = 'onLight' | 'onDark';

const PALETTE: Record<LogoTone, { plate: string; shadow: string; inkA: string; inkB: string }> = {
  onLight: { plate: tokens.colors.ink, shadow: tokens.colors['accent-deep'], inkA: tokens.colors.card, inkB: tokens.colors.lime },
  onDark: { plate: tokens.colors.ink, shadow: tokens.colors['accent-deep'], inkA: tokens.colors.card, inkB: tokens.colors.lime },
};
const OUTLINE = tokens.colors.ink;
const BALL_INK = tokens.colors.ink;

/**
 * 로고. width 는 그림자·기울기까지 포함한 전체 폭이고, 높이는 비율로 따라온다.
 */
export function Wordmark({ width = 200, tone = 'onLight' }: { width?: number; tone?: LogoTone }) {
  const id = useId();
  const c = PALETTE[tone];
  const letters: Shape[] = [chuk(), jal(), merge(ah(), rieul(52))];

  const plate = (dy: number, fill: string) => (
    <rect
      x={-PAD} y={-PAD + dy} width={BLOCK_W + PAD * 2} height={CELL + PAD * 2} rx={18}
      fill={fill} stroke={tone === 'onDark' ? tokens.colors['line-strong'] : OUTLINE} strokeWidth={13}
    />
  );

  const shift = (i: number) => `translate(${i * (CELL + GAP)},0)`;

  return (
    <svg
      width={width}
      height={(width * BOX_H) / BOX_W}
      viewBox={`-40 -40 ${BOX_W} ${BOX_H}`}
      role="img"
      aria-label="축잘알"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <g transform={`rotate(${TILT},${BLOCK_W / 2},${CELL / 2})`} id={`lg-${id}`}>
        {plate(11, c.shadow)}
        {plate(0, c.plate)}

        {/* 외곽선은 한 겹 먼저. 그 위를 채움이 덮어 내부 이음매를 가린다 */}
        {[0, 1, 2].map((i) => (
          <g key={`o${i}`} transform={shift(i)} fill={OUTLINE} stroke={OUTLINE} strokeWidth={16} strokeLinejoin="round">
            {i === 2 && <circle cx={BALL.cx} cy={BALL.cy} r={BALL.r} />}
            {(() => {
              const s = letters[i];
              return (
                <>
                  {s.rects.map(([x, y, w, h], k) => (
                    <rect key={`r${k}`} x={x} y={y} width={w} height={h} />
                  ))}
                  {s.lines.map(([x1, y1, x2, y2], k) => (
                    <line key={`l${k}`} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={16} />
                  ))}
                </>
              );
            })()}
          </g>
        ))}

        {/* 채움 */}
        <g transform={shift(0)}>
          <Strokes shape={letters[0]} fill={c.inkA} />
        </g>
        <g transform={shift(1)}>
          <Strokes shape={letters[1]} fill={c.inkB} />
        </g>
        <g transform={shift(2)}>
          <circle cx={BALL.cx} cy={BALL.cy} r={BALL.r} fill="#ffffff" />
          <polygon points={PANEL_POINTS} fill={BALL_INK} />
          {ANGLES.map((a) => {
            const [x1, y1] = at(a, PANEL);
            const [x2, y2] = at(a, BALL.r * 0.88);
            return (
              <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke={BALL_INK} strokeWidth={5} strokeLinecap="round" />
            );
          })}
          <Strokes shape={letters[2]} fill={c.inkA} />
        </g>
      </g>
    </svg>
  );
}
