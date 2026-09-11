import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { setupPreview, cardStates } from './setup';
import { AppProvider, useApp } from '../src/store';
import { MatchCard } from '../src/components/MatchCard';
import { MatchDetail } from '../src/screens/MatchDetail';
import { BallMark } from '../src/components/Logo';
import tokens from './system/tokens.json';
import '../src/styles.css';
import '../src/design/matchday.css';
import './system.css';
setupPreview(true);

function System() {
  const { ready } = useApp();
  const [detail, setDetail] = useState<number | null>(null);
  return (
    <main className="system-page">
      <header className="system-header">
        <span>
          <BallMark size={22} /> 축잘알 / MATCHDAY
        </span>
        <a href="/design/preview.html">앱 미리보기 ↗</a>
      </header>
      <section className="system-intro">
        <p>DESIGN SYSTEM · V1</p>
        <h1>
          같은 기준으로.
          <br />
          <span>더 선명한 축구 경험.</span>
        </h1>
        <p>경기에 집중하는 화면. 분명한 선택. 읽기 쉬운 기록.</p>
      </section>
      <section className="system-section">
        <div className="system-title">
          <span>01 / COLOR</span>
          <h2>네이비는 중심, 라임은 선택.</h2>
        </div>
        <div className="system-swatches">
          {(
            [
              'ink',
              'accent',
              'lime',
              'paper',
              'card',
              'ink-3',
              'win',
              'cool',
            ] as const
          ).map((k) => (
            <div key={k}>
              <i style={{ background: tokens.colors[k] }} />
              <strong>{k}</strong>
              <span>{tokens.colors[k]}</span>
            </div>
          ))}
        </div>
        <p className="system-note">
          밝은 화면의 본문은 네이비. 어두운 경기 카드의 본문은 흰색. 라임 위에는
          네이비를 씁니다. 적중과 실패는 색과 문구를 함께 표시합니다.
        </p>
      </section>
      <section className="system-section">
        <div className="system-title">
          <span>02 / TYPE & SPACE</span>
          <h2>규칙이 보이는 글자와 여백.</h2>
        </div>
        <div className="system-type-grid">
          <div className="system-type">
            <p style={{ fontSize: 36, fontWeight: 700 }}>1,240</p>
            <p style={{ fontSize: 24, fontWeight: 700 }}>오늘의 승부</p>
            <p style={{ fontSize: 16, fontWeight: 600 }}>당신의 한 수</p>
            <p style={{ fontSize: 14 }}>확신도를 고르고 예측을 완료해요.</p>
            <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              IBM Plex Sans KR · 400 / 500 / 600 / 700
            </p>
          </div>
          <div className="system-spacing">
            {Object.entries(tokens.space).map(([k, v]) => (
              <div key={k}>
                <span>{v}</span>
                <i style={{ width: v }} />
              </div>
            ))}
          </div>
        </div>
        <p className="system-note">
          간격은 4px 단위. 버튼 8~12px, 카드 16px, 주목할 경기 24px 모서리. 주요
          동작은 44px 이상 누를 영역을 확보합니다.
        </p>
      </section>
      <section className="system-section">
        <div className="system-title">
          <span>03 / ACTION</span>
          <h2>선택을 확인하고, 결과로 이어지게.</h2>
        </div>
        <div className="system-actions">
          <div>
            <span>PRIMARY · 48px</span>
            <button
              className="cta"
              onClick={() =>
                document
                  .getElementById('match-states')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              경기 카드 살펴보기
            </button>
          </div>
          <div>
            <span>DISABLED</span>
            <button className="cta" disabled>
              예측이 마감됐어요
            </button>
          </div>
          <div>
            <span>STATUS</span>
            <div className="system-statuses">
              <span className="chip solid">예측함</span>
              <span className="chip win">✓ 적중</span>
              <span className="chip plain">✕ 실패</span>
              <span className="chip plain">마감</span>
            </div>
          </div>
        </div>
      </section>
      <section className="system-section" id="match-states">
        <div className="system-title">
          <span>04 / MATCH CARD</span>
          <h2>같은 컴포넌트, 모든 경기 상태.</h2>
        </div>
        <p className="system-note">
          아래는 예시 데이터입니다. 실제 화면과 같은 경기 카드로
          선택·확신도·완료 상태를 직접 확인할 수 있어요.
        </p>
        <div className="system-cards">
          {ready &&
            cardStates.map((s, i) => (
              <article key={s.id}>
                <p className="system-state-label">
                  {String(i + 1).padStart(2, '0')} / {s.label}
                </p>
                <MatchCard
                  fixtureId={s.id}
                  featured={i === 0}
                  onOpen={() => setDetail(s.id)}
                />
              </article>
            ))}
        </div>
      </section>
      <footer className="system-footer">
        <span>축잘알 · Matchday 01</span>
        <a href="/design/preview.html">앱으로 돌아가기 ↗</a>
      </footer>
      {detail != null && (
        <div className="system-modal">
          <div className="app">
            <MatchDetail fixtureId={detail} onBack={() => setDetail(null)} />
          </div>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById('system-root')!).render(
  <AppProvider>
    <System />
  </AppProvider>
);
