import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { haptic } from '../lib/anim';

/**
 * 홈 화면 위에서 진행하는 첫 실행 안내.
 *
 * 별도 튜토리얼 화면을 두지 않는 이유: 축잘알의 규칙은 '보기를 누르면 확신도가 열린다'는
 * 손의 동작이라, 설명을 읽는 것보다 실제 카드에서 한 번 눌러보는 편이 빠르다.
 * 그래서 진짜 화면을 그대로 두고 그 위에 구멍을 뚫는다 — 강조된 부분은 실제로 눌린다.
 *
 * 각 단계는 data-tour 속성으로 대상을 찾는다. 대상이 없으면(예: 오늘 경기가 없어
 * 카드가 하나도 없을 때) 그 단계는 조용히 건너뛴다.
 */
const SEEN_KEY = 'chukjalal.tutorial.v1';

export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // 저장소를 막아둔 브라우저라면 매번 보여주는 편이 낫다
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* 저장 실패는 무시한다 */
  }
}

interface Step {
  /** data-tour 값 */
  key: string;
  title: string;
  body: string;
  /** 이 요소가 화면에 나타나면 자동으로 다음 단계로 넘어간다 (사용자가 실제로 눌렀다는 뜻) */
  waitFor?: string;
  /** 강조 영역 여백 */
  pad?: number;
}

const STEPS: Step[] = [
  {
    key: 'hud',
    title: '여기가 내 성적표예요',
    body: '레벨과 XP, 그리고 오늘 몇 경기를 예측했는지가 여기 모입니다.',
  },
  {
    key: 'options',
    title: '이길 팀을 고르세요',
    body: '홈 승 · 무승부 · 원정 승 중 하나. 지금 한번 눌러보세요.',
    waitFor: 'confidence',
    pad: 6,
  },
  {
    key: 'confidence',
    title: '얼마나 확신하세요?',
    body: '확신이 클수록 맞혔을 때 많이 얻고, 틀렸을 때 많이 잃어요. 여기가 축잘알의 핵심입니다.',
    pad: 6,
  },
  {
    key: 'nav',
    title: '매일 아침 8시에 순위 확정',
    body: '20경기를 채우면 순위표에 이름이 올라가요.',
  },
];

interface Box { top: number; left: number; width: number; height: number }

export function Coachmarks({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const step = STEPS[index];

  const finish = useCallback(() => {
    markSeen();
    onDone();
  }, [onDone]);

  /** 대상이 있는 다음 단계로. 남은 게 없으면 종료한다. */
  const advance = useCallback(
    (from: number) => {
      for (let i = from; i < STEPS.length; i++) {
        if (document.querySelector(`[data-tour="${STEPS[i].key}"]`)) {
          setIndex(i);
          return;
        }
      }
      finish();
    },
    [finish]
  );

  // 첫 단계도 대상이 있는 것부터 시작한다
  useEffect(() => {
    advance(0);
  }, [advance]);

  /** 대상 위치를 잰다. .app 기준 좌표로 바꿔서 오버레이 안에 올린다. */
  const measure = useCallback(() => {
    if (!step) return;
    const target = document.querySelector(`[data-tour="${step.key}"]`);
    const root = rootRef.current?.parentElement ?? document.querySelector('.app');
    if (!target || !root) {
      setBox(null);
      return;
    }
    const t = target.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    const pad = step.pad ?? 8;
    setBox({
      top: t.top - r.top - pad,
      left: t.left - r.left - pad,
      width: t.width + pad * 2,
      height: t.height + pad * 2,
    });
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    const target = document.querySelector(`[data-tour="${step.key}"]`);
    // smooth 로 옮기면 애니메이션이 끝나기 전에 재게 되어 구멍이 엉뚱한 곳에 뚫린다.
    // 즉시 이동시키고 다음 프레임에 잰다.
    target?.scrollIntoView({ block: 'center', behavior: 'auto' });
    const raf = requestAnimationFrame(measure);
    // 카드가 펼쳐지며 높이가 바뀌는 경우가 있어 한 번 더 확인한다
    const id = setTimeout(measure, 260);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(id);
    };
  }, [step, measure]);

  // 스크롤·리사이즈로 대상이 움직이면 구멍도 따라간다
  useEffect(() => {
    const scroller = document.querySelector('.scroll');
    window.addEventListener('resize', measure);
    scroller?.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      scroller?.removeEventListener('scroll', measure);
    };
  }, [measure]);

  // 사용자가 실제로 눌러서 다음 요소가 나타나면 자동으로 넘어간다
  useEffect(() => {
    if (!step?.waitFor) return;
    const id = setInterval(() => {
      if (document.querySelector(`[data-tour="${step.waitFor}"]`)) advance(index + 1);
    }, 250);
    return () => clearInterval(id);
  }, [step, index, advance]);

  const next = () => {
    haptic(10);
    advance(index + 1);
  };

  // 강조 영역 아래에 말풍선을 두되, 아래 공간이 부족하면 위로 올린다
  const rootH = rootRef.current?.parentElement?.getBoundingClientRect().height ?? 0;
  const below = box ? box.top + box.height + 14 : 0;
  const placeBelow = box ? rootH - below > 190 : true;

  return (
    <div ref={rootRef} className="coach">
      {step && box && (
        <>
      {/* 구멍을 뺀 네 조각으로 화면을 덮는다. 구멍 안은 그대로 눌린다 */}
      <div className="coach-mask" style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top) }} onClick={next} />
      <div className="coach-mask" style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }} onClick={next} />
      <div className="coach-mask" style={{ top: box.top, left: 0, width: Math.max(0, box.left), height: box.height }} onClick={next} />
      <div className="coach-mask" style={{ top: box.top, left: box.left + box.width, right: 0, height: box.height }} onClick={next} />

      <div className="coach-ring" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />

      <div
        className="coach-tip"
        style={placeBelow ? { top: below } : { bottom: rootH - box.top + 14 }}
      >
        <div className="coach-tip-head">
          <span className="chip solid" style={{ fontSize: 10 }}>
            {index + 1} / {STEPS.length}
          </span>
          <button className="tiny muted" onClick={finish} style={{ marginLeft: 'auto', padding: 4 }}>
            건너뛰기
          </button>
        </div>
        <p className="h3" style={{ fontSize: 15, marginTop: 10 }}>{step.title}</p>
        <p className="small muted" style={{ margin: '6px 0 0', lineHeight: 1.6 }}>{step.body}</p>
        <button className="cta" style={{ height: 44, marginTop: 14 }} onClick={next}>
          {index === STEPS.length - 1 ? '시작하기' : '다음'}
        </button>
      </div>
        </>
      )}
    </div>
  );
}
