import test from 'node:test';
import assert from 'node:assert/strict';

// tsc 없이 돌리기 위해 공식을 그대로 옮겨 검증한다.
// src/lib/scoring.ts 를 수정하면 이 값들도 함께 확인해야 한다.
const K = 40;
const C = { 1: 0.15, 2: 0.35, 3: 0.6 };

function userDist(q, pick, conf) {
  const p = [0, 0, 0];
  p[pick] = q[pick] + C[conf] * (1 - q[pick]);
  const rest = 1 - p[pick];
  const sum = q.reduce((a, v, i) => (i === pick ? a : a + v), 0);
  for (let i = 0; i < 3; i++) if (i !== pick) p[i] = (rest * q[i]) / sum;
  return p;
}
function delta(q, pick, conf, actual) {
  const p = userDist(q, pick, conf);
  return Math.max(-60, Math.min(90, Math.round(K * Math.log2(p[actual] / q[actual]))));
}

const q = [0.62, 0.21, 0.17];

test('명세 2.5 표와 값이 일치한다', () => {
  assert.equal(delta(q, 0, 1, 0), 5);
  assert.equal(delta(q, 0, 3, 0), 18);
  assert.equal(delta(q, 2, 3, 2), 79);
  assert.equal(delta(q, 1, 3, 1), 68);
});

test('틀렸을 때 손해는 어떤 오답이든 같다', () => {
  for (const conf of [1, 2, 3]) {
    assert.equal(delta(q, 0, conf, 1), delta(q, 0, conf, 2));
  }
});

test('소수 의견을 맞히면 다수 의견보다 훨씬 크게 얻는다', () => {
  assert.ok(delta(q, 2, 3, 2) > delta(q, 0, 3, 0) * 4);
});

test('확률 분포의 합은 항상 1이다', () => {
  for (const pick of [0, 1, 2]) {
    for (const conf of [1, 2, 3]) {
      const sum = userDist(q, pick, conf).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 1e-9);
    }
  }
});

test('확신을 부풀리면 기대값이 떨어진다 (정직성)', () => {
  const belief = 0.7;
  const b = [belief, ((1 - belief) * q[1]) / (q[1] + q[2]), ((1 - belief) * q[2]) / (q[1] + q[2])];
  const ev = (conf) => {
    const p = userDist(q, 0, conf);
    return b.reduce((s, bi, a) => s + bi * K * Math.log2(p[a] / q[a]), 0);
  };
  assert.ok(ev(1) > ev(3), '70% 확신에서는 확신1이 확신3보다 낫다');
});
