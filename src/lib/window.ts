import type { Fixture } from '../data/types';

export type WindowState = 'UPCOMING' | 'OPEN' | 'LOCKED' | 'FINISHED';

/**
 * 예측 창 상태. 매치데이(KST 06:00 시작)가 열려야 예측할 수 있고,
 * 킥오프 5분 전에 닫힌다. 서버 RLS 가 같은 조건을 강제하므로 여기서는 표시만 담당한다.
 */
export function windowState(f: Fixture, now = Date.now()): WindowState {
  if (f.state === 'FINISHED' && f.result) return 'FINISHED';
  if (now < +new Date(f.opensAt)) return 'UPCOMING';
  if (now >= +new Date(f.lockAt)) return 'LOCKED';
  return 'OPEN';
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** "오늘 06:00에 열려요" / "9월 5일(금) 06:00에 열려요" */
export function opensLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return `오늘 ${hhmm}에 열려요`;
  if (d.toDateString() === tomorrow.toDateString()) return `내일 ${hhmm}에 열려요`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAY[d.getDay()]}) ${hhmm}에 열려요`;
}

export type ChatState = 'BEFORE' | 'OPEN' | 'CLOSED';

/** 채팅은 킥오프 1시간 전에 열리고, 경기가 끝나고 얼마 뒤 닫힌다. */
export function chatState(f: Fixture, now = Date.now()): ChatState {
  const kickoff = +new Date(f.kickoffAt);
  if (now < kickoff - 3600_000) return 'BEFORE';
  if (now > kickoff + 4 * 3600_000) return 'CLOSED';
  return 'OPEN';
}

/** "오늘 03:00에 열려요" — 채팅이 열리는 시각 */
export function chatOpensLabel(f: Fixture, now = new Date()): string {
  const at = new Date(+new Date(f.kickoffAt) - 3600_000);
  const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const sameDay = at.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay) return `오늘 ${hhmm}`;
  if (at.toDateString() === tomorrow.toDateString()) return `내일 ${hhmm}`;
  return `${at.getMonth() + 1}월 ${at.getDate()}일 ${hhmm}`;
}
