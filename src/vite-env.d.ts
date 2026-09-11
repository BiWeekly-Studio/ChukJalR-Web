/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOSS_SUPPORTER_SKU?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** 'standalone' 이면 앱이 자체 로그인 화면을 그린다. 비우면 앱인토스(토스 로그인 전용) */
  readonly VITE_AUTH_MODE?: string;
  readonly VITE_TOSS_ADS_MODE?: 'off' | 'test' | 'live';
  readonly VITE_TOSS_BANNER_AD_GROUP_ID?: string;
  readonly VITE_TOSS_ANALYTICS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
