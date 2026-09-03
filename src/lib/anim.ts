import { useEffect, useRef, useState } from 'react';

/** 모션을 끈 사용자에게는 연출 대신 최종 상태만 보여준다. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * 숫자가 0에서 목표까지 굴러 올라간다. 게임 화면에서 숫자는 그냥 나타나면 안 된다.
 * ease-out quart — 처음엔 빠르게, 끝에서 부드럽게 멎는다.
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const from = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(origin + (target - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

/** 정수 카운트업. 표시용이라 반올림해서 돌려준다. */
export function useCountUpInt(target: number, duration = 900): number {
  return Math.round(useCountUp(target, duration));
}

/**
 * 값이 늘어난 순간에만 true 가 되는 플래그. 레벨업·연승 갱신 연출의 방아쇠다.
 * 첫 렌더에서는 켜지지 않는다 — 앱을 열자마자 축하가 터지면 안 된다.
 */
export function useIncreased<T extends number>(value: T, hold = 2600): boolean {
  const prev = useRef<T | null>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before == null || value <= before) return;
    setOn(true);
    const id = setTimeout(() => setOn(false), hold);
    return () => clearTimeout(id);
  }, [value, hold]);

  return on;
}

/** 토스 인앱에서도 안전한 짧은 진동. 지원하지 않으면 조용히 넘어간다. */
export function haptic(pattern: number | number[] = 12) {
  try {
    if (prefersReducedMotion()) return;
    navigator.vibrate?.(pattern);
  } catch {
    /* 진동은 있으면 좋은 것일 뿐이다 */
  }
}
