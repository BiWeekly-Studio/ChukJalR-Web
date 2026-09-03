import { useState } from 'react';
import { LevelUp } from './components/LevelUp';
import { Wordmark } from './components/Logo';
import { Auth } from './screens/Auth';
import { SELF_AUTH } from './lib/env';
import { IconMe, IconPredict, IconRank } from './components/icons';
import { haptic } from './lib/anim';
import { MatchDetail } from './screens/MatchDetail';
import { Onboarding } from './screens/Onboarding';
import { TossLogin } from './screens/TossLogin';
import { Coachmarks, hasSeenTutorial } from './components/Coachmarks';
import { Predict } from './screens/Predict';
import { Profile } from './screens/Profile';
import { Ranking } from './screens/Ranking';
import { useApp } from './store';

type Tab = 'predict' | 'rank' | 'me';

const TABS: { id: Tab; label: string; Icon: typeof IconPredict }[] = [
  { id: 'predict', label: '예측', Icon: IconPredict },
  { id: 'rank', label: '랭킹', Icon: IconRank },
  { id: 'me', label: '나', Icon: IconMe },
];

export function App() {
  const { state, dispatch, todoCount, ready, authUser } = useApp();
  const [tab, setTab] = useState<Tab>('predict');
  const [openMatch, setOpenMatch] = useState<number | null>(null);
  // 규칙을 모르면 아무 버튼이나 누르게 된다 → 온보딩 직후 한 번 설명한다
  const [tutorialDone, setTutorialDone] = useState(hasSeenTutorial);

  // 세션 확인·카탈로그가 도착하기 전에는 아무것도 그리지 않는다.
  // 앱인토스는 10초 안에 첫 화면이 떠야 한다.
  if (!ready) return <Splash />;

  // 세션이 없으면 로그인부터. 미니앱 안에서는 토스 로그인만 허용된다.
  if (!authUser) return SELF_AUTH ? <Auth /> : <TossLogin />;

  if (!state.onboarded) return <Onboarding />;

  // 채팅은 별도 탭이 아니다. 경기에 들어가야 나온다.
  return (
    <div className="app">
      {/* 탭이 바뀌면 화면이 통째로 갈리므로 각 화면의 .screen 등장 연출이 매번 재생된다 */}
      {tab === 'predict' && <Predict onOpenMatch={setOpenMatch} />}
      {tab === 'rank' && <Ranking />}
      {tab === 'me' && (
        <Profile
          onReplayTutorial={() => {
            setTutorialDone(false);
            setTab('predict'); // 안내는 홈에서 도는 것이므로 홈으로 데려간다
          }}
        />
      )}

      {openMatch != null && (
        <MatchDetail
          fixtureId={openMatch}
          onBack={() => setOpenMatch(null)}
        />
      )}

      <LevelUp />

      {/* 안내는 홈 위에서 돈다. 경기 상세가 열려 있으면 방해되므로 비켜 둔다 */}
      {!tutorialDone && tab === 'predict' && openMatch == null && (
        <Coachmarks onDone={() => setTutorialDone(true)} />
      )}

      {state.error && (
        <div className="toast" role="status" onClick={() => dispatch({ type: 'error', message: null })}>
          {state.error}
        </div>
      )}

      <nav className="nav" data-tour="nav">
        {TABS.map(({ id, label, Icon }) => {
          const on = tab === id;
          return (
            <button
              key={id}
              className="navitem"
              aria-current={on ? 'page' : undefined}
              onClick={() => {
                if (!on) haptic(10);
                setOpenMatch(null);
                setTab(id);
              }}
            >
              <span className="navicon">
                <Icon color="currentColor" strokeWidth={on ? 2.5 : 2} />
                {/* 오늘 예측하지 않은 경기가 남아 있으면 예측 탭에 점을 찍는다 */}
                {id === 'predict' && !on && todoCount > 0 && <i className="navdot" />}
              </span>
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** 첫 프레임. 로딩이라도 브랜드는 보여준다. */
function Splash() {
  return (
    <div className="app">
      <div className="scroll pad" style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ animation: 'levelburst 0.6s var(--spring)' }}>
          <span style={{ display: 'block', animation: 'breathe 1.5s ease-in-out infinite' }}>
            <Wordmark width={200} />
          </span>
        </div>
      </div>
    </div>
  );
}
