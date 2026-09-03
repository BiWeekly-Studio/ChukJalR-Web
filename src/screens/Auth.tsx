import { useState } from 'react';
import { Wordmark } from '../components/Logo';
import { ProviderButtons } from '../components/ProviderButtons';
import { IconCheck, IconSparkle } from '../components/icons';
import { repository } from '../data';
import { haptic } from '../lib/anim';
import { AUTH_MODE } from '../lib/env';
import { checkPassword } from '../lib/password';

type Mode = 'signin' | 'signup';

const MAX_HANDLE = 12;

/**
 * 토스 앱 밖에서 직접 써 보기 위한 로그인 화면.
 *
 * 프로덕션(앱인토스)에서는 토스 로그인 브리지가 세션을 미리 세워주므로 이 화면은 뜨지 않는다.
 * 즉 여기 있는 이메일 가입은 "토스 밖에서 테스트하는 통로"이지, 정식 가입 경로가 아니다. (명세 14.5)
 */
export function Auth() {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const handleOk = mode === 'signin' || (handle.trim().length >= 2 && handle.trim().length <= MAX_HANDLE);
  // 로그인할 때는 규칙을 다시 따지지 않는다. 예전 규칙으로 만든 비밀번호를 막아버리게 된다.
  const pwCheck = checkPassword(password, { email, handle });
  const passwordOk = mode === 'signin' ? password.length > 0 : pwCheck.ok;
  const confirmOk = mode === 'signin' || (confirm.length > 0 && confirm === password);
  const canSubmit = emailOk && passwordOk && handleOk && confirmOk && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    haptic(12);
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await repository.auth.signUp(
          email.trim(),
          password,
          handle.trim()
        );
        // 확인 메일이 필요하면 아직 세션이 없다. 여기서 멈추고 안내한다.
        if (needsConfirmation) setSentTo(email.trim());
        // 확인이 꺼져 있으면 세션이 바로 서고, store 의 onChange 가 앱으로 넘긴다.
      } else {
        await repository.auth.signIn(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) return <ConfirmSent email={sentTo} onBack={() => { setSentTo(null); setMode('signin'); }} />;

  return (
    <div className="app">
      <div className="scroll pad screen" style={{ paddingTop: 'calc(var(--safe-top) + 44px)' }}>
        <div style={{ textAlign: 'center' }}>
          <span className="brandhero">
            <Wordmark width={260} />
          </span>
          <p className="small muted" style={{ margin: '14px 0 0' }}>
            찍는 게 아니라 읽는 사람들의 리그.
          </p>
          {AUTH_MODE === 'toss' && (
            <span className="chip plain" style={{ marginTop: 14, fontSize: 10.5 }}>
              개발용 로그인 · 토스 앱에서는 토스 계정으로 자동 로그인돼요
            </span>
          )}
        </div>

        <div style={{ marginTop: 28 }}>
          <ProviderButtons onError={setError} />
        </div>

        <div className="segmented" role="tablist" style={{ marginTop: 20 }}>
          {(['signup', 'signin'] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                haptic(8);
                setMode(m);
                setError(null);
                setConfirm('');
              }}
            >
              {m === 'signup' ? '회원가입' : '로그인'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          {mode === 'signup' && (
            <Field
              label="닉네임"
              hint={`랭킹과 채팅에 이 이름으로 보여요 · 최대 ${MAX_HANDLE}자`}
              value={handle}
              onChange={setHandle}
              placeholder="축잘알러"
              maxLength={MAX_HANDLE}
              autoComplete="nickname"
            />
          )}
          <Field
            label="이메일"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
            inputMode="email"
          />
          <Field
            label="비밀번호"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onEnter={mode === 'signin' ? submit : undefined}
          />

          {mode === 'signup' && password.length > 0 && <PasswordMeter check={pwCheck} />}

          {mode === 'signup' && (
            <Field
              label="비밀번호 확인"
              value={confirm}
              onChange={setConfirm}
              placeholder="한 번 더 입력해 주세요"
              type="password"
              autoComplete="new-password"
              onEnter={submit}
            />
          )}
          {mode === 'signup' && confirm.length > 0 && confirm !== password && (
            <p className="tiny" style={{ margin: '-2px 0 0 4px', color: 'var(--cool)', fontWeight: 600 }}>
              두 비밀번호가 달라요.
            </p>
          )}
        </div>

        {error && (
          <p className="autherror" role="alert">
            {error}
          </p>
        )}

        <button className="cta" style={{ marginTop: 18 }} disabled={!canSubmit} onClick={submit}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {!busy && <IconSparkle size={15} color="#fff" />}
            {busy ? '잠시만요…' : mode === 'signup' ? '가입하고 시작하기' : '로그인'}
          </span>
        </button>

        <div style={{ height: 'calc(28px + var(--safe-bottom))' }} />
      </div>
    </div>
  );
}

/** 가입은 됐지만 아직 메일 확인이 남은 상태. 여기서 뭘 더 누를 건 없다. */
function ConfirmSent({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="app">
      <div className="scroll pad screen" style={{ display: 'grid', placeItems: 'center', paddingTop: 'var(--safe-top)' }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <span
            className="authmark"
            style={{ background: 'linear-gradient(135deg, #22c97e, #0b8f57)', boxShadow: '0 8px 22px -10px rgba(15,169,104,.8)' }}
          >
            <IconCheck size={28} color="#fff" strokeWidth={3} />
          </span>
          <h1 className="h1" style={{ fontSize: 22, marginTop: 18 }}>메일함을 확인해 주세요</h1>
          <p className="small muted" style={{ margin: '10px 0 0', lineHeight: 1.7 }}>
            <b style={{ color: 'var(--ink-2)' }}>{email}</b> 으로 확인 메일을 보냈어요.
            <br />
            링크를 누르면 가입이 끝나고, 그다음 로그인하시면 됩니다.
          </p>
          <button className="ghostcta" style={{ marginTop: 24 }} onClick={onBack}>
            로그인으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

/** 규칙 통과 여부와 강도를 함께 보여준다. 규칙만 겨우 넘긴 비밀번호도 있기 때문이다. */
function PasswordMeter({ check }: { check: ReturnType<typeof checkPassword> }) {
  return (
    <div className="pwmeter">
      <div className="pwbars" role="img" aria-label={`비밀번호 강도: ${check.label}`}>
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i < check.score ? `on s${check.score}` : undefined} />
        ))}
      </div>
      <span className={`tiny pwlabel s${check.score}`}>{check.label}</span>
      <ul className="pwrules">
        {check.rules.map((r) => (
          <li key={r.id} className={r.pass ? 'pass' : undefined}>
            <span aria-hidden>{r.pass ? '✓' : '·'}</span>
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({
  label, hint, value, onChange, onEnter, ...rest
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <span className="tiny muted" style={{ fontWeight: 500 }}>{hint}</span>}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
        }}
      />
    </label>
  );
}
