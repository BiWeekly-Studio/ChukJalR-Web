import { useState } from 'react';
import { leagues as allLeagues, teams as allTeams } from '../data/catalog';
import { useApp } from '../store';
import { IconCheck } from '../components/icons';

/**
 * 온보딩: 리그 선택(순서가 곧 탭 순서) → 최애 팀 → 완료. (명세 5.1)
 * 앱인토스는 토스 로그인만 허용하므로 별도 계정 생성 단계는 두지 않는다.
 */
export function Onboarding() {
  const { completeOnboarding } = useApp();
  const LEAGUES = allLeagues();
  const TEAMS = allTeams();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [fav, setFav] = useState<number | null>(null);

  function toggleLeague(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function finish() {
    const rest = LEAGUES.map((l) => l.id).filter((id) => !picked.includes(id));
    completeOnboarding([...picked, ...rest], fav);
  }

  const favTeams = TEAMS.filter((t) => picked.includes(t.leagueId));

  return (
    <div className="app">
      <div className="scroll pad" style={{ paddingTop: 'calc(var(--safe-top) + 40px)' }}>
        {step === 0 && (
          <>
            <h1 className="h1" style={{ fontSize: 27 }}>
              어느 리그를
              <br />
              보시나요?
            </h1>
            <p className="small muted" style={{ marginTop: 10 }}>
              고른 순서대로 홈 화면 탭이 정렬돼요. 나중에 설정에서 바꿀 수 있어요.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 26 }}>
              {LEAGUES.map((l) => {
                const idx = picked.indexOf(l.id);
                const on = idx >= 0;
                return (
                  <button
                    key={l.id}
                    type="button"
                    className="card"
                    style={{
                      padding: '16px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      border: on ? '2px solid var(--accent)' : '1px solid transparent',
                    }}
                    aria-pressed={on}
                    onClick={() => toggleLeague(l.id)}
                  >
                    <span
                      style={{
                        width: 26, height: 26, borderRadius: 999, flexShrink: 0,
                        background: on ? 'var(--accent)' : 'var(--card-2)',
                        color: on ? '#fff' : 'var(--ink-3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--display)', fontWeight: 900, fontSize: 12,
                      }}
                    >
                      {on ? idx + 1 : ''}
                    </span>
                    <span style={{ textAlign: 'left' }}>
                      <span className="h3" style={{ display: 'block', fontSize: 15 }}>{l.name}</span>
                      <span className="tiny muted">{l.country}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="h1" style={{ fontSize: 27 }}>
              최애 팀이
              <br />
              있으세요?
            </h1>
            <p className="small muted" style={{ marginTop: 10 }}>
              내 팀 경기는 피드 맨 위에 따로 모아서 보여드려요. 점수 규칙은 똑같아요.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 26 }}>
              {favTeams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="pill"
                  aria-pressed={fav === t.id}
                  onClick={() => setFav((p) => (p === t.id ? null : t.id))}
                  style={fav === t.id ? { background: t.color, borderColor: t.color } : undefined}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="small muted"
              style={{ marginTop: 22, textDecoration: 'underline' }}
              onClick={() => { setFav(null); finish(); }}
            >
              지금은 건너뛸게요
            </button>
          </>
        )}
      </div>

      <div className="pad" style={{ paddingBottom: 'calc(20px + var(--safe-bottom))', paddingTop: 12 }}>
        {step === 0 ? (
          <button className="cta" disabled={picked.length === 0} onClick={() => setStep(1)}>
            {picked.length === 0 ? '리그를 하나 이상 골라주세요' : `${picked.length}개 리그로 시작하기`}
          </button>
        ) : (
          <button className="cta" onClick={finish}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <IconCheck size={16} />
              시작하기 · 300점 받기
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
