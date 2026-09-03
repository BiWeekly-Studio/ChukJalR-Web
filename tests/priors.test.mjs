import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Edge Function 의 기준 확률 모델과 같은 계산.
 *
 * 시즌 초 표본으로 값이 튀지 않는지 확인한다 — 실제로 2라운드 데이터에서
 * 분데스리가 홈 승률 87% 같은 값이 나왔고, 그게 이 테스트가 생긴 이유다.
 * 상수를 바꾸면 supabase/functions/sync-fixtures/index.ts 도 같이 고쳐야 한다.
 */
const PRIOR_SHRINK = 6;
const LEAGUE_SHRINK = 150;
const LEAGUE_BASE_HOME = 1.55;
const LEAGUE_BASE_AWAY = 1.25;
const STRENGTH_MIN = 0.6;
const STRENGTH_MAX = 1.6;
const MAX_GOALS = 8;

function poisson(lambda, k) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p = (p * lambda) / i;
  return p;
}

function outcomeProbabilities(lh, la) {
  const h = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poisson(lh, k));
  const a = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poisson(la, k));
  let home = 0, draw = 0, away = 0;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = h[i] * a[j];
      if (i > j) home += p; else if (i === j) draw += p; else away += p;
    }
  const s = home + draw + away;
  return [home / s, draw / s, away / s];
}

function normalize(q) {
  const c = q.map((v) => Math.min(0.94, Math.max(0.03, v)));
  const s = c[0] + c[1] + c[2];
  const o = c.map((v) => Number((v / s).toFixed(6)));
  return [o[0], o[1], 1 - o[0] - o[1]];
}

/** table: [{played, gf, ga, homePlayed, homeGf, awayPlayed, awayGf}] */
function model(table) {
  const homePlayed = table.reduce((n, r) => n + r.homePlayed, 0);
  const awayPlayed = table.reduce((n, r) => n + r.awayPlayed, 0);
  const lw = homePlayed / (homePlayed + LEAGUE_SHRINK);
  const homeObs = homePlayed > 0 ? table.reduce((n, r) => n + r.homeGf, 0) / homePlayed : LEAGUE_BASE_HOME;
  const awayObs = awayPlayed > 0 ? table.reduce((n, r) => n + r.awayGf, 0) / awayPlayed : LEAGUE_BASE_AWAY;
  const homeAvg = lw * homeObs + (1 - lw) * LEAGUE_BASE_HOME;
  const awayAvg = lw * awayObs + (1 - lw) * LEAGUE_BASE_AWAY;
  const leagueAvg = (homeAvg + awayAvg) / 2;

  const clamp = (v) => Math.min(STRENGTH_MAX, Math.max(STRENGTH_MIN, v));
  const strength = new Map();
  for (const r of table) {
    if (r.played === 0) { strength.set(r.id, { attack: 1, defence: 1 }); continue; }
    const w = r.played / (r.played + PRIOR_SHRINK);
    strength.set(r.id, {
      attack: clamp(1 + (r.gf / r.played / leagueAvg - 1) * w),
      defence: clamp(1 + (r.ga / r.played / leagueAvg - 1) * w),
    });
  }
  return { strength, homeAvg, awayAvg };
}

function probs(m, homeId, awayId) {
  const h = m.strength.get(homeId), a = m.strength.get(awayId);
  return normalize(outcomeProbabilities(
    h.attack * a.defence * m.homeAvg,
    a.attack * h.defence * m.awayAvg));
}

/** 각 팀이 홈 1 · 원정 1경기씩 치른 리그. gf/ga 는 팀별로 준다. */
function league(rows) {
  return rows.map((r, i) => ({
    id: i + 1, played: 2, gf: r[0], ga: r[1],
    homePlayed: 1, homeGf: r[2], awayPlayed: 1, awayGf: r[0] - r[2],
  }));
}

test('시즌 초 극단 표본에서도 홈 승률이 현실 범위에 머문다', () => {
  // 2라운드에 홈팀이 몰아친 리그 (홈 30골 / 원정 12골). 실제로 이런 표본이 나왔다.
  const table = league(Array.from({ length: 18 }, (_, i) =>
    i < 9 ? [3, 1, 3] : [1, 3, 0]));
  const m = model(table);
  // 평균끼리만 붙여도(같은 전력) 홈 승률은 45% 근처여야 한다
  const even = normalize(outcomeProbabilities(m.homeAvg, m.awayAvg));
  assert.ok(even[0] > 0.38 && even[0] < 0.52, `home=${even[0].toFixed(3)}`);
  assert.ok(even[1] > 0.22 && even[1] < 0.30, `draw=${even[1].toFixed(3)}`);
});

test('강팀 홈 vs 약팀 원정이라도 90% 를 넘지 않는다', () => {
  const table = league([
    [8, 0, 5],                                    // 1: 최강
    ...Array.from({ length: 16 }, () => [2, 2, 1]),
    [0, 8, 0],                                    // 18: 최약
  ]);
  const m = model(table);
  const q = probs(m, 1, 18);
  assert.ok(q[0] < 0.9, `home=${q[0].toFixed(3)}`);
  assert.ok(q[0] > 0.5, `home=${q[0].toFixed(3)}`);
  assert.ok(q[1] > 0.03, `draw=${q[1].toFixed(3)}`);
});

test('전력이 같으면 홈이 원정보다 유리하다', () => {
  const table = league(Array.from({ length: 18 }, () => [2, 2, 1]));
  const m = model(table);
  const q = probs(m, 1, 2);
  assert.ok(q[0] > q[2], `home=${q[0].toFixed(3)} away=${q[2].toFixed(3)}`);
  assert.ok(q[0] - q[2] < 0.25, '홈 어드밴티지가 과도하다');
});

test('합은 언제나 1 이고 각 항은 [0.03, 0.94] 안에 있다', () => {
  const table = league([[9, 0, 6], ...Array.from({ length: 17 }, () => [1, 3, 0])]);
  const m = model(table);
  for (const [h, a] of [[1, 2], [2, 1], [3, 4]]) {
    const q = probs(m, h, a);
    assert.ok(Math.abs(q[0] + q[1] + q[2] - 1) < 1e-9);
    for (const v of q) assert.ok(v >= 0.03 && v <= 0.94, `${v}`);
  }
});
