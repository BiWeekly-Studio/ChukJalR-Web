import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 앱인토스: SSR 금지 → 순수 CSR SPA로만 빌드한다.
// 번들은 압축 해제 기준 100MB 이하여야 하므로 외부 폰트/이미지를 인라인하지 않는다.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: { react: ['react', 'react-dom'] },
      },
    },
  },
});
