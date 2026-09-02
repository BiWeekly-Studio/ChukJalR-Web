export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function comma(n: number): string {
  return n.toLocaleString('ko-KR');
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export function kickoffLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay) return `오늘 ${hh}:${mm}`;
  if (d.toDateString() === tomorrow.toDateString()) return `내일 ${hh}:${mm}`;
  return `${d.getMonth() + 1}.${d.getDate()}(${WEEKDAY[d.getDay()]}) ${hh}:${mm}`;
}

export function dateHeading(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAY[d.getDay()]}요일`;
}
