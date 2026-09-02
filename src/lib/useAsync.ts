import { useEffect, useState } from 'react';

/** 저장소에서 한 번 읽어오는 값. 실패하면 초깃값을 유지한다. */
export function useAsync<T>(load: () => Promise<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let cancelled = false;
    load()
      .then((v) => {
        if (!cancelled) setValue(v);
      })
      .catch(() => {
        /* 화면은 초깃값으로 계속 동작한다 */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}
