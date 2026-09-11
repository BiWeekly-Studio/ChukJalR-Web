import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// 복제한 로직이 아니라 실제 소스의 타입만 제거해서 실행한다.
const source = readFileSync(new URL('../src/lib/tossBanner.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { resolveBannerId, createAdsLoader, mountTossBanner } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fakeSdk({ supported = true, versionSupported = true, initError = false } = {}) {
  const calls = { initialize: 0, attach: 0, destroy: 0, callbacks: null };
  const initialize = Object.assign(({ callbacks }) => {
    calls.initialize++;
    if (initError) callbacks.onInitializationFailed(new Error('offline'));
    else callbacks.onInitialized();
  }, { isSupported: () => supported });
  const attachBanner = Object.assign((_id, _element, { callbacks }) => {
    calls.attach++;
    calls.callbacks = callbacks;
    return { destroy: () => { calls.destroy++; } };
  }, { isSupported: () => supported });
  return { calls, sdk: { TossAds: { initialize, attachBanner }, isMinVersionSupported: () => versionSupported } };
}

test('자체 웹과 미설정 빌드는 광고를 요청하지 않고 테스트 빌드는 항상 테스트 ID만 사용한다', () => {
  assert.equal(resolveBannerId('standalone', 'live', 'production-id'), null);
  assert.equal(resolveBannerId('toss', undefined, 'production-id'), null);
  assert.equal(resolveBannerId('toss', 'test', 'production-id'), 'ait-ad-test-banner-id');
  assert.equal(resolveBannerId('toss', 'live', ''), null);
  assert.equal(resolveBannerId('toss', 'live', 'ait-ad-test-banner-id'), null);
  assert.equal(resolveBannerId('toss', 'live', ' production-id '), 'production-id');
});

test('동시 마운트와 화면 재진입에서도 초기화는 한 번이다', async () => {
  const { sdk, calls } = fakeSdk();
  let loads = 0;
  const load = createAdsLoader(async () => { loads++; return sdk; });
  const results = await Promise.all([load(), load(), load()]);
  assert.ok(results.every((r) => r === sdk.TossAds));
  assert.equal(await load(), sdk.TossAds);
  assert.equal(loads, 1);
  assert.equal(calls.initialize, 1);
});

test('미지원 환경과 구버전에서는 초기화하지 않는다', async () => {
  for (const options of [{ supported: false }, { versionSupported: false }]) {
    const { sdk, calls } = fakeSdk(options);
    assert.equal(await createAdsLoader(async () => sdk)(), null);
    assert.equal(calls.initialize, 0);
  }
});

test('초기화 실패와 SDK 로드 실패는 광고 없이 종료한다', async () => {
  const { sdk } = fakeSdk({ initError: true });
  assert.equal(await createAdsLoader(async () => sdk)(), null);
  assert.equal(await createAdsLoader(async () => { throw new Error('offline'); })(), null);
});

test('초기화 대기 중 화면을 떠나면 뒤늦게 광고를 부착하지 않는다', async () => {
  const { sdk, calls } = fakeSdk();
  let complete;
  const pending = new Promise((resolve) => { complete = resolve; });
  const stop = mountTossBanner({}, 'test', () => assert.fail('unmounted callback'), () => pending);
  stop();
  complete(sdk.TossAds);
  await tick();
  assert.equal(calls.attach, 0);
});

test('표시된 광고는 화면을 떠날 때 한 번만 정리한다', async () => {
  const { sdk, calls } = fakeSdk();
  const stop = mountTossBanner({}, 'test', () => assert.fail('available'), async () => sdk.TossAds);
  await tick();
  assert.equal(calls.attach, 1);
  stop(); stop();
  assert.equal(calls.destroy, 1);
});

test('광고 없음/렌더 실패 시 슬롯을 제거하고 빈 영역을 닫는다', async () => {
  for (const event of ['onNoFill', 'onAdFailedToRender']) {
    const { sdk, calls } = fakeSdk();
    let collapsed = 0;
    const stop = mountTossBanner({}, 'test', () => collapsed++, async () => sdk.TossAds);
    await tick();
    calls.callbacks[event]();
    calls.callbacks[event]();
    stop();
    assert.equal(collapsed, 1);
    assert.equal(calls.destroy, 1);
  }
});

test('부착 중 동기 실패 콜백에도 반환된 슬롯을 정리한다', async () => {
  let destroyed = 0;
  let collapsed = 0;
  const ads = { attachBanner: (_id, _element, { callbacks }) => {
    callbacks.onNoFill();
    return { destroy: () => destroyed++ };
  } };
  const stop = mountTossBanner({}, 'test', () => collapsed++, async () => ads);
  await tick();
  stop();
  assert.equal(destroyed, 1);
  assert.equal(collapsed, 1);
});

test('SDK가 예외를 던져도 화면을 깨뜨리지 않는다', async () => {
  let collapsed = 0;
  const ads = { attachBanner: () => { throw new Error('unavailable'); } };
  mountTossBanner({}, 'test', () => collapsed++, async () => ads);
  await tick();
  assert.equal(collapsed, 1);
});
