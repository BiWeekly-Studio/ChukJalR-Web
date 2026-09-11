import { useEffect, useRef, useState } from 'react';
import { AUTH_MODE } from '../lib/env';
import { mountTossBanner, resolveBannerId } from '../lib/tossBanner';

const adGroupId = resolveBannerId(
  AUTH_MODE, import.meta.env.VITE_TOSS_ADS_MODE, import.meta.env.VITE_TOSS_BANNER_AD_GROUP_ID,
);

export function TossBanner() {
  const target = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!adGroupId || !target.current || unavailable) return;
    return mountTossBanner(target.current, adGroupId, () => setUnavailable(true));
  }, [unavailable]);

  if (!adGroupId || unavailable) return null;
  return (
    <aside className="toss-banner" aria-label="광고">
      {/* SDK가 Ad 표기와 CTA를 그린다. 이 엘리먼트 내부는 비워둔다. */}
      <div ref={target} style={{ width: '100%', minHeight: 96 }} />
    </aside>
  );
}
