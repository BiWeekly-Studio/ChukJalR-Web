import type { BadgeDef, ChatMessage, Fixture, League, RankRow, Team } from './types';

/**
 * 목업 데이터. 실제 구현에서는 GET /v1/feed 등으로 대체된다. (명세 8장)
 * 킥오프 시각은 앱을 언제 열어도 자연스럽도록 현재 시각 기준으로 생성한다.
 */

export const LEAGUES: League[] = [
  { id: 39, name: '프리미어리그', short: '프리미어', country: '잉글랜드' },
  { id: 140, name: '라리가', short: '라리가', country: '스페인' },
  { id: 78, name: '분데스리가', short: '분데스', country: '독일' },
  { id: 135, name: '세리에 A', short: '세리에A', country: '이탈리아' },
];

export const TEAMS: Team[] = [
  { id: 42, leagueId: 39, name: '아스날', abbr: 'ARS', color: '#C8102E', tint: '#F7E4E3' },
  { id: 50, leagueId: 39, name: '맨시티', abbr: 'MCI', color: '#33608F', tint: '#E4EDF6' },
  { id: 40, leagueId: 39, name: '리버풀', abbr: 'LIV', color: '#B01C33', tint: '#F7E4E6' },
  { id: 51, leagueId: 39, name: '브라이턴', abbr: 'BHA', color: '#2A63A8', tint: '#E5EDF8' },
  { id: 49, leagueId: 39, name: '첼시', abbr: 'CHE', color: '#2B4C8C', tint: '#E6EBF6' },
  { id: 47, leagueId: 39, name: '토트넘', abbr: 'TOT', color: '#4A5568', tint: '#ECEEF2' },
  { id: 541, leagueId: 140, name: '레알 마드리드', abbr: 'RMA', color: '#4A5568', tint: '#EDEFF3' },
  { id: 529, leagueId: 140, name: '바르셀로나', abbr: 'BAR', color: '#7A2A55', tint: '#F4E6EE' },
  { id: 530, leagueId: 140, name: '아틀레티코', abbr: 'ATM', color: '#C0392B', tint: '#F8E6E3' },
  { id: 532, leagueId: 140, name: '발렌시아', abbr: 'VAL', color: '#C98A19', tint: '#FBF1DC' },
  { id: 157, leagueId: 78, name: '바이에른', abbr: 'FCB', color: '#B8202E', tint: '#F8E5E6' },
  { id: 165, leagueId: 78, name: '도르트문트', abbr: 'BVB', color: '#B08A00', tint: '#FAF3D8' },
  { id: 168, leagueId: 78, name: '레버쿠젠', abbr: 'B04', color: '#B01F2E', tint: '#F8E4E6' },
  { id: 172, leagueId: 78, name: '슈투트가르트', abbr: 'VFB', color: '#4C7BA8', tint: '#E7EFF7' },
  { id: 505, leagueId: 135, name: '인터', abbr: 'INT', color: '#2B4C8C', tint: '#E6EBF6' },
  { id: 489, leagueId: 135, name: 'AC 밀란', abbr: 'MIL', color: '#B0202E', tint: '#F8E5E6' },
  { id: 496, leagueId: 135, name: '유벤투스', abbr: 'JUV', color: '#3A3A3A', tint: '#ECECEC' },
  { id: 492, leagueId: 135, name: '나폴리', abbr: 'NAP', color: '#2E7BB8', tint: '#E5EFF8' },
];

export function team(id: number): Team {
  const t = TEAMS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown team ${id}`);
  return t;
}

export function league(id: number): League {
  const l = LEAGUES.find((x) => x.id === id);
  if (!l) throw new Error(`unknown league ${id}`);
  return l;
}

function at(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3600_000).toISOString();
}

/**
 * 예측 창이 열리는 시각. 킥오프가 속한 매치데이의 시작(KST 06:00)이다.
 * 유럽 경기는 KST 새벽이라 자정으로 자르면 예측할 시간이 남지 않는다.
 */
export function matchdayStart(kickoffIso: string): string {
  const KST = 9 * 3600_000;
  const kst = new Date(new Date(kickoffIso).getTime() + KST);
  const shifted = new Date(kst.getTime() - 6 * 3600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() + 6 * 3600_000 - KST).toISOString();
}

interface Seed {
  id: number;
  leagueId: number;
  home: number;
  away: number;
  venue: string;
  inHours: number;
  baseline: [number, number, number];
  participants: number;
}

const SEEDS: Seed[] = [
  { id: 1183042, leagueId: 39, home: 42, away: 50, venue: '에미레이츠', inHours: 0.6, baseline: [0.62, 0.21, 0.17], participants: 12480 },
  { id: 1183043, leagueId: 39, home: 40, away: 51, venue: '안필드', inHours: 5.6, baseline: [0.71, 0.18, 0.11], participants: 9110 },
  { id: 1183044, leagueId: 39, home: 49, away: 47, venue: '스탬퍼드 브리지', inHours: 8.1, baseline: [0.44, 0.25, 0.31], participants: 7620 },
  { id: 1183051, leagueId: 140, home: 541, away: 530, venue: '베르나베우', inHours: 4.2, baseline: [0.55, 0.26, 0.19], participants: 6890 },
  { id: 1183052, leagueId: 140, home: 529, away: 532, venue: '캄프 누', inHours: 27, baseline: [0.74, 0.16, 0.10], participants: 3140 },
  { id: 1183061, leagueId: 78, home: 157, away: 165, venue: '알리안츠 아레나', inHours: 6.4, baseline: [0.58, 0.22, 0.20], participants: 5320 },
  { id: 1183062, leagueId: 78, home: 168, away: 172, venue: '바이아레나', inHours: 29, baseline: [0.51, 0.26, 0.23], participants: 2210 },
  { id: 1183071, leagueId: 135, home: 505, away: 489, venue: '산 시로', inHours: 7.2, baseline: [0.45, 0.28, 0.27], participants: 8040 },
  { id: 1183072, leagueId: 135, home: 496, away: 492, venue: '알리안츠 스타디움', inHours: 31, baseline: [0.40, 0.29, 0.31], participants: 2760 },
];

/* 1183042 는 킥오프 36분 전으로 둔다 — 목업이 '채팅이 열린 경기' 상태도
   보여줘야 신고·차단 화면을 백엔드 없이 확인할 수 있다. */
export const FIXTURES: Fixture[] = SEEDS.map((s) => ({
  id: s.id,
  leagueId: s.leagueId,
  round: 4,
  homeTeamId: s.home,
  awayTeamId: s.away,
  venue: s.venue,
  kickoffAt: at(s.inHours),
  opensAt: matchdayStart(at(s.inHours)),
  lockAt: at(s.inHours - 5 / 60),
  baseline: s.baseline,
  participants: s.participants,
  state: 'SCHEDULED',
  homeGoals: null,
  awayGoals: null,
  result: null,
}));

export function fixture(id: number): Fixture {
  const f = FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`unknown fixture ${id}`);
  return f;
}

export const CHAT_SEED: ChatMessage[] = [
  {
    id: 'c1', fixtureId: 1183042, userId: 'mock-홍마니아', handle: '홍마니아', initial: '홍', topPercent: 1.2, tier: 'GRANDMASTER',
    body: '외데고르 빠진 아스날 중원이 헐거워요. 저는 무승부 봅니다', at: '03:41',
  },
  {
    id: 'c2', fixtureId: 1183042, userId: 'mock-팔라시오', handle: '팔라시오', initial: '팔', topPercent: 8, tier: 'MASTER',
    body: '홀란드 컨디션 보면 원정이어도 맨시티 쪽인데요', at: '03:43',
  },
  {
    id: 'c3', fixtureId: 1183042, userId: 'mock-케인이형', handle: '케인이형', initial: '케', topPercent: 24, tier: 'PLATINUM',
    body: '라이스 복귀했으면 얘기가 다르죠', at: '03:46',
  },
  {
    id: 'c4', fixtureId: 1183042, userId: 'mock-노스런던', handle: '노스런던', initial: '노', topPercent: 12, tier: 'DIAMOND',
    body: '홈에서 최근 8경기 무패인 건 무시 못함', at: '03:48',
  },
];

/** 채팅이 살아있는 느낌을 주기 위한 유입 메시지 풀 (실제로는 WS 이벤트) */
export const CHAT_INCOMING: Omit<ChatMessage, 'id' | 'fixtureId' | 'at'>[] = [
  { userId: 'mock-오프사이드트랩', handle: '오프사이드트랩', initial: '오', topPercent: 6, tier: 'MASTER', body: '세트피스에서 갈릴 것 같은데요' },
  { userId: 'mock-볼란치킹', handle: '볼란치킹', initial: '볼', topPercent: 19, tier: 'DIAMOND', body: '전반에 선제골 나오면 그대로 굳힐 듯' },
  { userId: 'mock-캄프누사랑', handle: '캄프누사랑', initial: '캄', topPercent: 41, tier: 'GOLD', body: '무승부 쪽이 저평가된 느낌이에요' },
  { userId: 'mock-하프타임', handle: '하프타임', initial: '하', topPercent: 3.4, tier: 'MASTER', body: '원정 팀 최근 3경기 xG가 훨씬 높습니다' },
];

export const RANKING: RankRow[] = [
  { rank: 1, handle: '언더독헌터', initial: '언', accuracy: 0.74, rating: 3180, change: 0 },
  { rank: 2, handle: '페널티박스', initial: '페', accuracy: 0.72, rating: 2940, change: 1 },
  { rank: 3, handle: '하프타임', initial: '하', accuracy: 0.7, rating: 2710, change: -1 },
  { rank: 4, handle: '볼란치킹', initial: '볼', accuracy: 0.71, rating: 2480, change: 1 },
  { rank: 5, handle: '오프사이드트랩', initial: '오', accuracy: 0.69, rating: 2315, change: -1 },
  { rank: 6, handle: '노스런던', initial: '노', accuracy: 0.67, rating: 2190, change: 0 },
  { rank: 7, handle: '캄프누사랑', initial: '캄', accuracy: 0.66, rating: 2104, change: 1 },
  { rank: 8, handle: '리그원의신', initial: '리', accuracy: 0.64, rating: 2038, change: 0 },
];

export const BADGES: BadgeDef[] = [
  { id: 'first_hit', name: '첫 적중', group: '정확도', tier: 'bronze', condition: '첫 예측 적중', progress: 1, target: 1 },
  { id: 'streak_10', name: '백발백중', group: '정확도', tier: 'gold', condition: '10경기 연속 적중', progress: 7, target: 10 },
  { id: 'acc_70', name: '명중률 70', group: '정확도', tier: 'silver', condition: '50경기 이상 적중률 70%', progress: 50, target: 50 },
  { id: 'underdog_hunter', name: '언더독 헌터', group: '난이도', tier: 'silver', condition: '기준선 20% 미만 결과 5회 적중', progress: 3, target: 5 },
  { id: 'defuse', name: '폭탄 해체', group: '난이도', tier: 'gold', condition: '기준선 12% 미만을 확신3으로 적중', progress: 0, target: 1 },
  { id: 'draw_reader', name: '무승부 감별사', group: '난이도', tier: 'silver', condition: '무승부 10회 적중', progress: 4, target: 10 },
  { id: 'honest_oracle', name: '정직한 예언자', group: '캘리브레이션', tier: 'gold', condition: '확신3 20건 이상, 실제 적중률 78~92%', progress: 14, target: 20 },
  { id: 'self_aware', name: '자기 객관화', group: '캘리브레이션', tier: 'gold', condition: '확신 1·2·3 모두 기대치 ±8%p 이내', progress: 2, target: 3 },
  { id: 'daily_30', name: '개근 30', group: '꾸준함', tier: 'silver', condition: '30일 연속 예측', progress: 18, target: 30 },
  { id: 'night_shift', name: '새벽반', group: '꾸준함', tier: 'bronze', condition: '새벽 경기 30건 예측', progress: 30, target: 30 },
  { id: 'epl_master', name: 'EPL 마스터', group: '리그', tier: 'gold', condition: '프리미어리그 30경기 이상 적중률 상위 10%', progress: 30, target: 30 },
  { id: 'cool_fan', name: '냉정한 팬', group: '팬심', tier: 'gold', condition: '최애 팀 경기 팬심 편향 ≥ 0', progress: 6, target: 10 },
];
