/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** 개발용: 토스 로그인 대신 Supabase 익명 로그인으로 세션을 만든다 */
  readonly VITE_DEV_ANON_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
