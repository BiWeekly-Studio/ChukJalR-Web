import type { TossAds, TossAdsAttachBannerResult } from '@apps-in-toss/web-framework';

type Ads = typeof TossAds;
type AdsSdk = Pick<typeof import('@apps-in-toss/web-framework'), 'TossAds' | 'isMinVersionSupported'>;

export const TEST_BANNER_ID = 'ait-ad-test-banner-id';

/** 테스트/운영은 빌드 시 명시적으로 선택한다. 자체 웹과 미설정 빌드에서는 요청하지 않는다. */
export function resolveBannerId(authMode: string, mode?: string, liveId?: string): string | null {
  if (authMode !== 'toss') return null;
  if (mode === 'test') return TEST_BANNER_ID;
  const id = liveId?.trim();
  if (mode !== 'live' || !id || id.startsWith('ait-ad-test-')) return null;
  return id;
}

export function createAdsLoader(loadSdk: () => Promise<AdsSdk> = () => import('@apps-in-toss/web-framework')) {
  let loading: Promise<Ads | null> | undefined;
  return () => {
    // StrictMode와 화면 재진입에서도 SDK 초기화는 한 번만 한다.
    loading ??= loadSdk().then(({ TossAds: ads, isMinVersionSupported }) => {
      if (!ads.initialize.isSupported() || !ads.attachBanner.isSupported()
        || !isMinVersionSupported({ android: '5.241.0', ios: '5.241.0' })) return null;
      return new Promise<Ads | null>((resolve) => {
        const timeout = setTimeout(() => resolve(null), 8000);
        const finish = (value: Ads | null) => { clearTimeout(timeout); resolve(value); };
        try {
          ads.initialize({ callbacks: {
            onInitialized: () => finish(ads),
            onInitializationFailed: () => finish(null),
          } });
        } catch { finish(null); }
      });
    }).catch(() => null);
    return loading;
  };
}

const loadAds = createAdsLoader();

/** 대기 중 화면을 떠나거나 광고가 없으면 슬롯을 정리한다. 별도 갱신/재시도는 하지 않는다. */
export function mountTossBanner(
  element: HTMLElement,
  adGroupId: string,
  onUnavailable: () => void,
  load: () => Promise<Ads | null> = loadAds,
): () => void {
  let stopped = false;
  let slot: TossAdsAttachBannerResult | undefined;
  const destroy = (value?: TossAdsAttachBannerResult) => {
    try { value?.destroy(); } catch { /* 광고 정리 실패가 화면 전환을 막지 않는다. */ }
  };
  const stop = () => { stopped = true; destroy(slot); slot = undefined; };
  const fail = () => {
    if (stopped) return;
    stop();
    onUnavailable();
  };
  void load().then((ads) => {
    if (stopped) return;
    if (!ads) { fail(); return; }
    const attached = ads.attachBanner(adGroupId, element, {
      theme: 'light', tone: 'grey', variant: 'expanded',
      callbacks: { onNoFill: fail, onAdFailedToRender: fail },
    });
    // attachBanner 안에서 동기적으로 실패 콜백을 부르는 경우도 정리한다.
    if (stopped) destroy(attached);
    else slot = attached;
  }).catch(fail);
  return stop;
}
