import { useEffect, useState } from 'react';
import { repository } from '../data';
import type { OAuthProvider } from '../data/repository';
import { haptic } from '../lib/anim';

const LABEL: Record<OAuthProvider, string> = {
  kakao: '카카오로 계속하기',
  google: 'Google로 계속하기',
  apple: 'Apple로 계속하기',
};

/**
 * 소셜 로그인 버튼.
 *
 * 어떤 제공자를 그릴지는 Supabase 프로젝트 설정에서 읽어온다 — 대시보드에서 켜면
 * 버튼이 저절로 생기고, 꺼져 있으면 아예 그리지 않는다. 눌러도 안 되는 버튼을
 * 띄우지 않으려는 것이다.
 *
 * 한국 서비스라 카카오를 맨 위에 둔다. iOS 앱으로 낼 거라면 다른 소셜 로그인을
 * 제공하는 순간 Apple 로그인도 함께 넣어야 심사를 통과한다.
 */
export function ProviderButtons({ onError }: { onError: (message: string) => void }) {
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [busy, setBusy] = useState<OAuthProvider | null>(null);

  useEffect(() => {
    let cancelled = false;
    repository.auth
      .listProviders()
      .then((list) => {
        if (!cancelled) setProviders(list);
      })
      .catch(() => {
        /* 목록을 못 받으면 소셜 버튼 없이 이메일 로그인만 남는다 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (providers.length === 0) return null;

  async function go(p: OAuthProvider) {
    setBusy(p);
    haptic(12);
    try {
      // 정상이면 제공자 페이지로 떠나므로 여기 아래는 실행되지 않는다
      await repository.auth.signInWithProvider(p);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {providers.map((p) => (
        <button
          key={p}
          className={`social ${p}`}
          disabled={busy != null}
          onClick={() => void go(p)}
        >
          <ProviderMark provider={p} />
          {busy === p ? '연결 중…' : LABEL[p]}
        </button>
      ))}
    </div>
  );
}

function ProviderMark({ provider }: { provider: OAuthProvider }) {
  if (provider === 'kakao') {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 3.2C6.94 3.2 2.84 6.4 2.84 10.35c0 2.55 1.7 4.79 4.26 6.05l-1.05 3.86c-.09.33.28.6.57.4l4.6-3.04c.26.02.52.03.78.03 5.06 0 9.16-3.2 9.16-7.15S17.06 3.2 12 3.2z" />
      </svg>
    );
  }
  if (provider === 'apple') {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M16.37 1.43c0 1.14-.42 2.2-1.14 3.02-.85.99-2.23 1.76-3.36 1.67-.14-1.1.4-2.26 1.07-3.01.75-.87 2.05-1.55 3.2-1.63.02.09.03.19.03.29zM20.9 17.2c-.55 1.27-.82 1.84-1.53 2.96-.99 1.56-2.39 3.5-4.12 3.51-1.54.02-1.93-1-4.02-.99-2.09.01-2.52 1.01-4.06.99-1.73-.02-3.06-1.77-4.05-3.33-2.77-4.36-3.06-9.48-1.35-12.2 1.21-1.93 3.13-3.06 4.93-3.06 1.83 0 2.98 1 4.5 1 1.47 0 2.36-1 4.48-1 1.6 0 3.3.87 4.51 2.38-3.96 2.17-3.32 7.82.71 9.74z" />
      </svg>
    );
  }
  // 구글은 네 가지 색이 브랜드 규정이라 단색으로 줄이지 않는다
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}
