export const MAJOR_COMPETITION_IDS = [39, 78, 61, 140, 135, 2, 3, 848] as const;
export const isMajorCompetition = (id:number) => (MAJOR_COMPETITION_IDS as readonly number[]).includes(id);
export interface LeagueNotification { id:number; name:string; major:boolean; enabled:boolean }

/** Keep every available competition once, including newly added leagues. */
export function normalizeLeagueOrder(preferred: readonly number[], available: readonly number[]): number[] {
  const supported = new Set(available);
  return [...new Set([...preferred, ...available])].filter(id => supported.has(id));
}

/** The two groups stay separate; a move only changes the selected group's order. */
export function moveLeague(order: readonly number[], id: number, direction: -1 | 1): number[] {
  const group = order.filter(candidate => isMajorCompetition(candidate) === isMajorCompetition(id));
  const position = group.indexOf(id);
  const neighbor = group[position + direction];
  if (position < 0 || neighbor === undefined) return [...order];
  const next = [...order];
  const from = next.indexOf(id), to = next.indexOf(neighbor);
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
