import { setupPreview } from './setup';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/App';
import { TossLogin } from '../src/screens/TossLogin';
import { Onboarding } from '../src/screens/Onboarding';
import { AppProvider } from '../src/store';
import { BallMark } from '../src/components/Logo';
import tokens from './system/tokens.json';
import '../src/styles.css';
import '../src/design/matchday.css';
import './preview.css';

setupPreview();

function Preview() {
  const [width, setWidth] = useState(390);
  const [view, setView] = useState('app');
  return (
    <main className="design-review">
      <aside className="review-notes">
        <p className="review-kicker">
          <BallMark size={18} /> 축잘알 DESIGN SYSTEM · 01
        </p>
        <h1>
          경기가 먼저.
          <br />
          나의 한 수가
          <br />
          <span>선명하게.</span>
        </h1>
        <p className="review-description">
          차분한 네이비와 선명한 라임.
          <br />
          축구를 좋아하는 사람을 위한 매치데이.
        </p>
        <div className="review-palette">
          {(['ink', 'lime', 'paper', 'card'] as const).map((key) => (
            <div key={key}>
              <i style={{ background: tokens.colors[key] }} />
              <b>{key}</b>
              <span>{tokens.colors[key]}</span>
            </div>
          ))}
        </div>
        <div className="review-rules">
          <div>
            <b>01</b>
            <span>오늘의 경기부터 바로 예측</span>
          </div>
          <div>
            <b>02</b>
            <span>같은 색 · 간격 · 버튼 규칙</span>
          </div>
          <div>
            <b>03</b>
            <span>선택과 결과를 분명하게</span>
          </div>
        </div>
        <a href="/design/system.html">
          디자인 시스템 보기 <span>↗</span>
        </a>
        <a href="/design/brand.html">
          새로운 로고 · 브랜드 보기 <span>↗</span>
        </a>
      </aside>
      <section className="preview-column" aria-label="앱 미리보기">
        <div className="preview-tools">
          <label><span className="preview-view-label">미리보기 </span><select aria-label="미리보기 화면" value={view} onChange={event => setView(event.target.value)}><option value="app">앱 화면</option><option value="login">토스 로그인</option><option value="onboarding">시작 안내</option></select></label>
          <div>
            {[320, 390, 430].map((w) => (
              <button
                key={w}
                aria-pressed={w === width}
                onClick={() => setWidth(w)}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        <div className="preview-device" style={{ width }}>
          <AppProvider>
            {view === 'login' ? <TossLogin /> : view === 'onboarding' ? <Onboarding /> : <App />}
          </AppProvider>
        </div>
        <p className="preview-hint">
          홈 승을 눌러 예측해보세요. 실제 계정에는 저장되지 않아요.
        </p>
      </section>
    </main>
  );
}
createRoot(document.getElementById('preview-root')!).render(<Preview />);
