import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const load = async source => {
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  }});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};
const { normalizeLeagueOrder, moveLeague, MAJOR_COMPETITION_IDS } = await load(read('../src/lib/competitions.ts'));

test('saved preferences survive catalog additions/removals without dropping or duplicating competitions', () => {
  assert.deepEqual(normalizeLeagueOrder([2, 999, 39, 2], [39, 78, 2, 10, 10]), [2, 39, 78, 10]);
  assert.deepEqual(normalizeLeagueOrder([], []), []);
  assert.deepEqual(normalizeLeagueOrder(MAJOR_COMPETITION_IDS, [10, 2, 140, 39]), [39, 140, 2, 10]);
});

test('moving within either group preserves the other group and never moves past a boundary', () => {
  const original = [39, 10, 2, 1, 78];
  assert.deepEqual(moveLeague(original, 2, -1), [2, 10, 39, 1, 78]);
  assert.deepEqual(moveLeague(original, 10, 1), [39, 1, 2, 10, 78]);
  for (const [id, direction] of [[39, -1], [78, 1], [10, -1], [1, 1], [999, 1]]) {
    assert.deepEqual(moveLeague(original, id, direction), original);
  }
  assert.deepEqual(original, [39, 10, 2, 1, 78]);
});

// Exercise the production repository method with an isolated PostgREST client.
const source = read('../src/data/supabaseRepository.ts');
const method = source.slice(source.indexOf('    async saveLeagueOrder('), source.indexOf('    async upsertPrediction('));
const { makeRepository } = await load(`export function makeRepository(sb, uid) { return { ${method} }; }`);
function client(error = null) {
  const calls = [];
  const sb = Object.fromEntries(['from', 'update', 'eq', 'select'].map(key => [key, (...args) => {
    calls.push([key, ...args]); return sb;
  }]));
  sb.single = async () => ({ data: error ? null : { id: 'user-a' }, error });
  return { sb, calls };
}
test('saving updates only the signed-in user league order, without changing favorites or onboarding', async () => {
  const { sb, calls } = client();
  await makeRepository(sb, async () => 'user-a').saveLeagueOrder([2, 39, 10], 'user-a');
  assert.deepEqual(calls, [
    ['from', 'profiles'], ['update', { league_order: [2, 39, 10] }],
    ['eq', 'id', 'user-a'], ['select', 'id'],
  ]);
});
test('account changes and failed/zero-row updates cannot report a successful save', async () => {
  for (const signedIn of [null, 'user-b']) {
    const { sb, calls } = client();
    await assert.rejects(makeRepository(sb, async () => signedIn).saveLeagueOrder([39], 'user-a'), /NOT_AUTHENTICATED/);
    assert.equal(calls.length, 0);
  }
  for (const failure of [new Error('offline'), new Error('PGRST116: zero rows')]) {
    const { sb } = client(failure);
    await assert.rejects(makeRepository(sb, async () => 'user-a').saveLeagueOrder([39], 'user-a'), failure);
  }
});
