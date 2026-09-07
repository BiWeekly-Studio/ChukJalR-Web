import { useState } from 'react';
import { Wordmark } from '../components/Logo';
import { repository } from '../data';
import { haptic } from '../lib/anim';

/**
 * 앱인토스 미니앱의 로그인 화면.
 *
 * 앱인토스는 미니앱 안에서 계정 생성·소셜 로그인을 허용하지 않으므로, 여기 있는 길은
 * 토스 로그인 하나뿐이다. 누르면 토스가 동의 시트를 띄우고, 받은 인가 코드를
 * Edge Function 이 세션으로 바꾼다 (명세 14.5).
 *
 * 자동으로 부르지 않고 버튼을 누르게 한 이유: 화면이 뜨자마자 동의 시트가 올라오면
 * 무엇에 동의하는지 모르는 채로 누르게 된다.
 */
export function TossLogin() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login() {
    setBusy(true);
    setError(null);
    haptic(12);
    try {
      await repository.auth.signInWithToss();
      // 성공하면 세션이 서고, store 의 onChange 가 앱으로 넘긴다
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="scroll pad screen" style={{ display: 'grid', placeItems: 'center', paddingTop: 'var(--safe-top)' }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <span className="brandhero">
            <Wordmark width={250} />
          </span>
          <p className="small muted" style={{ margin: '16px 0 0', lineHeight: 1.7 }}>
            축구 승부를 예측하고 내 실력을 확인해요.
            <br />
            토스 계정으로 바로 시작할 수 있어요.
          </p>

          {error && (
            <p className="autherror" role="alert" style={{ textAlign: 'left' }}>
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="pad" style={{ paddingBottom: 'calc(24px + var(--safe-bottom))' }}>
        <button className="cta" disabled={busy} onClick={login}>
          {busy ? '토스로 이동 중…' : '토스로 로그인'}
        </button>
        <p className="tiny muted" style={{ textAlign: 'center', margin: '12px 0 0', lineHeight: 1.6 }}>
          예측 기록과 순위는 토스로 로그인한 축잘알 계정에 저장돼요.
        </p>
        <p className="tiny muted" style={{textAlign:'center'}}><a href="./terms.html" target="_blank" rel="noreferrer">이용약관</a> · <a href="./privacy.html" target="_blank" rel="noreferrer">개인정보 처리방침</a></p>
      </div>
    </div>
  );
}
