import type { Fixture, League, Team } from './types';

/**
 * 카탈로그 레지스트리.
 * 목업이든 Supabase든 부팅 시 여기에 한 번 주입하면, 화면 코드는 출처를 몰라도 된다.
 */
let _leagues: League[] = [];
let _teams = new Map<number, Team>();
let _fixtures = new Map<number, Fixture>();
let _fixtureList: Fixture[] = [];

export function hydrate(data: { leagues: League[]; teams: Team[]; fixtures: Fixture[] }) {
  _leagues = data.leagues;
  _teams = new Map(data.teams.map((t) => [t.id, t]));
  _fixtures = new Map(data.fixtures.map((f) => [f.id, f]));
  _fixtureList = [...data.fixtures].sort(
    (a, b) => +new Date(a.kickoffAt) - +new Date(b.kickoffAt)
  );
}

export const leagues = (): League[] => _leagues;
export const fixtures = (): Fixture[] => _fixtureList;
export const teams = (): Team[] => [..._teams.values()];

const FALLBACK_TEAM: Team = {
  id: -1, leagueId: -1, name: '미상', abbr: '???', color: '#6B655B', tint: '#EDE5D8',
};

/** 카탈로그에 없는 id 로 렌더가 깨지지 않도록 자리표시자를 돌려준다. */
export function team(id: number): Team {
  return _teams.get(id) ?? FALLBACK_TEAM;
}

export function league(id: number): League {
  return _leagues.find((l) => l.id === id) ?? { id, name: '기타', short: '기타', country: '' };
}

export function fixture(id: number): Fixture | undefined {
  return _fixtures.get(id);
}
