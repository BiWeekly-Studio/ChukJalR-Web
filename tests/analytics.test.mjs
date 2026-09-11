import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/analytics.ts', import.meta.url), 'utf8');
const dataUrl = (text) => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
let moduleId = 0;
async function loadLogger({ standalone = false, production = true, enabled = 'true', reject = false } = {}) {
  const sdkUrl = dataUrl(`export const events = []; export const Analytics = { log: async (event) => {
    events.push(event); ${reject ? "throw new Error('offline');" : ''}
  } }; // ${moduleId++}`);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  const code = outputText
    .replace("import { SELF_AUTH } from './env';", `const SELF_AUTH = ${standalone};`)
    .replaceAll('import.meta.env', JSON.stringify({ PROD: production, VITE_TOSS_ANALYTICS_ENABLED: enabled }))
    .replace("'@apps-in-toss/web-framework'", JSON.stringify(sdkUrl));
  return { ...(await import(dataUrl(code))), ...(await import(sdkUrl)) };
}

test('운영 토스에서 예측 저장 이벤트만 최소 파라미터로 보낸다', async () => {
  const { logPredictionSaved, events } = await loadLogger();
  await logPredictionSaved(42);
  assert.deepEqual(events, [{ log_name: 'chukjalal_prediction_saved', log_type: 'event', params: { fixture_id: 42 } }]);
});

test('웹/개발/광고 QA 빌드는 운영 지표를 보내지 않는다', async () => {
  for (const settings of [{ standalone: true }, { production: false }, { enabled: 'false' }]) {
    const { logPredictionSaved, events } = await loadLogger(settings);
    await logPredictionSaved(42);
    assert.equal(events.length, 0);
  }
});

test('지표 전송 실패가 예측 성공을 실패로 뒤집지 않는다', async () => {
  const { logPredictionSaved } = await loadLogger({ reject: true });
  await assert.doesNotReject(logPredictionSaved(42));
});
