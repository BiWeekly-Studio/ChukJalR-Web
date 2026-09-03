/**
 * 로그인 방식은 배포 대상에 따라 다르다.
 *
 *  toss       — 앱인토스 미니앱. 토스 로그인 브리지가 세션을 세워주므로 앱은 로그인 화면을
 *               그리지 않는다. 미니앱 안에 계정 생성·소셜 로그인 단계를 두면 심사에서
 *               반려된다 (README '앱인토스 제약' 표).
 *  standalone — 자체 웹/앱 배포. 소셜 로그인과 이메일 로그인이 정식 경로다.
 *
 * 기본값은 toss 다 — 플래그를 깜빡했을 때 심사에 걸리는 쪽이 아니라
 * 안전한 쪽으로 넘어져야 한다.
 */
export type AuthMode = 'toss' | 'standalone';

export const AUTH_MODE: AuthMode =
  import.meta.env.VITE_AUTH_MODE === 'standalone' ? 'standalone' : 'toss';

/**
 * 앱이 자체 로그인 화면을 그려도 되는지.
 * 로그인은 필수다 — 둘러보기용 익명 세션은 두지 않는다.
 */
export const SELF_AUTH = AUTH_MODE === 'standalone';
