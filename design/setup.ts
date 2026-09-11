import { repository } from '../src/data';
import { mockRepository } from '../src/data/mockRepository';
import { LEAGUES, TEAMS, FIXTURES } from '../src/data/mock';
import { matchdayStart } from '../src/lib/window';
import type { League, Fixture } from '../src/data/types';
// This entry is dev-only (not a Vite production entry). Replace every repository
// method, including auth, before mounting. No real predictions, receipts or chat.
const me = mockRepository.loadMe;
const orderKey = 'chukjalal.design.league-order.v1';
function previewLeagueOrder(): number[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(orderKey) ?? 'null');
    if (Array.isArray(saved) && saved.every(id => Number.isInteger(id))) return saved;
  } catch { /* Preview can still run without browser storage. */ }
  return leagues.map(l => l.id);
}
const extras: League[] = [
  { id: 61, name: '리그 1', short: '리그앙', country: '프랑스' },
  { id: 2, name: 'UEFA 챔피언스리그', short: '챔피언스', country: 'World' },
  { id: 3, name: 'UEFA 유로파리그', short: '유로파', country: 'World' },
  { id: 848, name: 'UEFA 컨퍼런스리그', short: '컨퍼런스', country: 'World' },
  { id: 10, name: '국제 친선경기', short: '국제 친선', country: 'World' },
];
const leagues = [...LEAGUES, ...extras];
const today = matchdayStart().toISOString();
const fixtureSeed = FIXTURES[0];
const fixtures: Fixture[] = [
  ...FIXTURES.map((f, i) => (i < 3 ? { ...f, opensAt: today } : f)),
  ...extras
    .filter((l) => l.id !== 61)
    .map((l, i) => ({
      ...fixtureSeed,
      id: 900000 + i,
      leagueId: l.id,
      homeTeamId: 541,
      awayTeamId: 157,
      participants: null,
      baseline: null,
      venue: null,
      round: null,
      opensAt: today,
    })),
];
export const cardStates: { label: string; id: number }[] = [
  { label: '기본 · 예측 가능', id: fixtureSeed.id },
  { label: '참여자 없음', id: 910001 },
  { label: '마감 · 수정 불가', id: 910002 },
  { label: '적중 · 지수 상승', id: 910003 },
  { label: '실패 · 지수 하락', id: 910004 },
  { label: '예측 오픈 전', id: 910005 },
];
const now = Date.now();
fixtures.push(
  {
    ...fixtureSeed,
    id: 910001,
    participants: 0,
    baseline: null,
    opensAt: today,
  },
  {
    ...fixtureSeed,
    id: 910002,
    lockAt: new Date(now - 60000).toISOString(),
    opensAt: today,
  },
  {
    ...fixtureSeed,
    id: 910003,
    state: 'FINISHED',
    result: 'HOME',
    homeGoals: 2,
    awayGoals: 1,
    opensAt: today,
  },
  {
    ...fixtureSeed,
    id: 910004,
    state: 'FINISHED',
    result: 'AWAY',
    homeGoals: 0,
    awayGoals: 1,
    opensAt: today,
  },
  {
    ...fixtureSeed,
    id: 910005,
    opensAt: new Date(now + 86400000).toISOString(),
    kickoffAt: new Date(now + 90000000).toISOString(),
    lockAt: new Date(now + 89700000).toISOString(),
  }
);
export function setupPreview(gallery = false) {
  Object.assign(repository, mockRepository, {
    loadCatalog: async () => ({
      leagues,
      teams: TEAMS.map((t) => ({
        ...t,
        logoUrl: `https://media.api-sports.io/football/teams/${t.id}.png`,
      })),
      fixtures: gallery
        ? fixtures
        : fixtures.filter((f) => f.id < 910001 || f.id > 910005),
    }),
    loadMe: async () => ({
      ...(await me()),
      onboarded: true,
      handle: '축구보는날',
      favoriteTeamIds: [42],
      leagueOrder: previewLeagueOrder(),
      predictions: gallery
        ? [910003, 910004].map((id) => ({
            fixtureId: id,
            pick: 'HOME' as const,
            confidence: 2 as const,
            createdAt: new Date(now - 86400000).toISOString(),
          }))
        : [],
      settlements: gallery
        ? [
            { fixtureId: 910003, deltaRating: 11, points: 28 },
            { fixtureId: 910004, deltaRating: -25, points: 0 },
          ]
        : [],
    }),
    saveLeagueOrder: async (order: number[]) => { localStorage.setItem(orderKey, JSON.stringify(order)); },
    subscribeChat: () => () => {},
  });
  localStorage.removeItem('chukjalal.v1');
  localStorage.setItem('chukjalal.tutorial.v1', '1');
}
