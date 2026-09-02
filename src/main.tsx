import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppProvider } from './store';
import './styles.css';

/**
 * 앱인토스 미니앱은 SSR을 허용하지 않는다 → 순수 CSR 엔트리.
 * 첫 화면이 10초 안에 떠야 하므로 초기 번들에 무거운 의존성을 넣지 않는다.
 */
const el = document.getElementById('root');
if (!el) throw new Error('#root not found');

createRoot(el).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>
);
