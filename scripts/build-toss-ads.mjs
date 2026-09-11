import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { loadEnv } from 'vite';

const mode = process.argv[2];
if (mode !== 'test' && mode !== 'live') throw new Error('광고 빌드는 test 또는 live를 선택하세요.');
const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const id = env.VITE_TOSS_BANNER_AD_GROUP_ID?.trim();
if (mode === 'live' && (!id || id.startsWith('ait-ad-test-'))) {
  throw new Error('콘솔에서 발급된 운영 ID를 VITE_TOSS_BANNER_AD_GROUP_ID에 설정해야 운영 광고를 빌드할 수 있어요.');
}
execFileSync('npm', ['run', 'build:toss'], {
  stdio: 'inherit',
  env: {
    ...env,
    VITE_TOSS_ADS_MODE: mode,
    VITE_TOSS_BANNER_AD_GROUP_ID: mode === 'live' ? id : '',
    VITE_TOSS_ANALYTICS_ENABLED: mode === 'test' ? 'false' : 'true',
  },
});
mkdirSync('artifacts', { recursive: true });
const output = `artifacts/chukjalr-ads-${mode}.ait`;
copyFileSync('chukjalr.ait', output);
console.log(`광고 ${mode === 'test' ? '테스트' : '운영'} 번들: ${output}`);
