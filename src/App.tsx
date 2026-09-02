import { useState } from 'react';
import { IconMe, IconPredict, IconRank } from './components/icons';
import { MatchDetail } from './screens/MatchDetail';
import { Onboarding } from './screens/Onboarding';
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
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState<Tab>('predict');
  const [openMatch, setOpenMatch] = useState<number | null>(null);

  // 카탈로그가 도착하기 전에는 아무것도 그리지 않는다. 앱인토스는 10초 안에 첫 화면이 떠야 한다.
  if (!state.ready) {
    return (
      <div className="app">
        <div className="scroll pad" style={{ display: 'grid', placeItems: 'center' }}>
          <span className="h1" style={{ opacity: 0.25 }}>축잘알</span>
        </div>
      </div>
    );
  }

  if (!state.onboarded) return <Onboarding />;

  // 채팅은 별도 탭이 아니다. 경기에 들어가야 나온다.
  return (
    <div className="app">
      {tab === 'predict' && <Predict onOpenMatch={setOpenMatch} />}
      {tab === 'rank' && <Ranking />}
      {tab === 'me' && <Profile />}
      {openMatch != null && (
        <MatchDetail
          fixtureId={openMatch}
          onBack={() => setOpenMatch(null)}
        />
      )}

      {state.error && (
        <div className="toast" role="status" onClick={() => dispatch({ type: 'error', message: null })}>
          {state.error}
        </div>
      )}

      <nav className="nav">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className="navitem"
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => {
              setOpenMatch(null);
              setTab(id);
            }}
          >
            <Icon color="currentColor" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
