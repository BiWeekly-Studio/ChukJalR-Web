import { useState } from 'react';
import { team } from '../data/catalog';
import { haptic } from '../lib/anim';
import type { HeadToHead, Lineup, MatchEvent, TeamStats } from '../data/types';

/**
 * 경기 상세의 곁들이 정보 — 이벤트 · 선발 명단 · 상대 전적 · 기록.
 *
 * 전부 "있으면 보여주고 없으면 아예 그리지 않는다". 선발 명단은 킥오프 한 시간쯤
 * 전에야 나오고, 이벤트는 경기가 시작해야 생긴다. 빈 카드를 미리 깔아두면
 * 화면이 고장 난 것처럼 보인다.
 */

/* ------------------------------------------------------------------ 이벤트 */

/** 이벤트 종류별 표시. 아는 것만 그리고, 모르는 종류는 통째로 건너뛴다. */
function eventMark(e: MatchEvent): { icon: string; tone: string } | null {
  const detail = (e.detail ?? '').toLowerCase();
  if (e.type === 'Goal') {
    if (detail.includes('missed')) return { icon: '✖', tone: 'var(--ink-3)' };
    return { icon: '⚽', tone: 'var(--ink)' };
  }
  if (e.type === 'Card') {
    if (detail.includes('red')) return { icon: '🟥', tone: 'var(--cool)' };
    return { icon: '🟨', tone: 'var(--gold-ink)' };
  }
  if (e.type === 'subst') return { icon: '↔', tone: 'var(--ink-3)' };
  return null;
}

function minuteLabel(e: MatchEvent): string {
  if (e.minute == null) return '';
  return e.extra ? `${e.minute}+${e.extra}'` : `${e.minute}'`;
}

export function EventTimeline({
  events, homeTeamId,
}: { events: MatchEvent[]; homeTeamId: number }) {
  const shown = events.filter((e) => eventMark(e) !== null);
  if (shown.length === 0) return null;

  return (
    <section className="card in" style={{ marginTop: 12, borderRadius: 20, padding: '14px 16px 16px' }}>
      <h2 className="h3">경기 기록</h2>
      {/* 홈은 [분][표시][이름], 원정은 그 거울 — .timeline li.away 의 row-reverse 가 뒤집는다 */}
      <ol className="timeline">
        {shown.map((e) => {
          const mark = eventMark(e)!;
          const home = e.teamId === homeTeamId;
          return (
            <li key={e.seq} className={home ? 'home' : 'away'}>
              <span className="tiny muted min">{minuteLabel(e)}</span>
              <span className="mark" aria-hidden>{mark.icon}</span>
              <span style={{ minWidth: 0 }}>
                <span className="small" style={{ display: 'block', fontWeight: 600, color: mark.tone }}>
                  {e.player ?? '—'}
                </span>
                {e.assist && (
                  <span className="tiny muted">
                    {e.type === 'subst' ? `→ ${e.assist}` : `도움 ${e.assist}`}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ 선발 명단 */

export function Lineups({
  lineups, homeTeamId,
}: { lineups: Lineup[]; homeTeamId: number }) {
  if (lineups.length === 0) return null;
  // 홈을 왼쪽에 둔다. API 순서를 믿지 않는다.
  const ordered = [...lineups].sort((a) => (a.teamId === homeTeamId ? -1 : 1));

  return (
    <section className="card in" style={{ marginTop: 12, borderRadius: 20, padding: '14px 16px 16px' }}>
      <h2 className="h3">선발 명단</h2>
      <div className="lineups">
        {ordered.map((l) => (
          <div key={l.teamId}>
            <div className="lineup-head">
              <span className="small" style={{ fontWeight: 700 }}>{team(l.teamId).name}</span>
              {l.formation && <span className="chip plain" style={{ fontSize: 10 }}>{l.formation}</span>}
            </div>
            <ol>
              {l.starters.map((p, i) => (
                <li key={i}>
                  <span className="num" style={{ fontSize: 11, color: 'var(--ink-3)', width: 18 }}>
                    {p.number ?? ''}
                  </span>
                  <span className="tiny" style={{ color: 'var(--ink-2)' }}>{p.name ?? '—'}</span>
                </li>
              ))}
            </ol>
            {l.coach && <p className="tiny muted" style={{ margin: '8px 0 0' }}>감독 {l.coach}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 상대 전적 */

/**
 * 접힘 상태는 사람마다 취향이 갈린다. 한 번 접은 사람은 다음 경기에서도 접힌 걸
 * 보고 싶어 하므로 기기에 남긴다 — 경기별이 아니라 이 섹션 하나에 대한 취향이다.
 */
const H2H_OPEN_KEY = 'chukjalal.h2h.open';

function readOpen(): boolean {
  try {
    return localStorage.getItem(H2H_OPEN_KEY) !== '0';
  } catch {
    return true;   // 저장소를 막아둔 브라우저에서는 펼친 채로 둔다
  }
}

export function HeadToHeadCard({
  h2h, homeTeamId, awayTeamId,
}: { h2h: HeadToHead; homeTeamId: number; awayTeamId: number }) {
  const [open, setOpen] = useState(readOpen);
  if (h2h.played === 0) return null;
  const home = team(homeTeamId);
  const away = team(awayTeamId);
  const pct = (n: number) => (n / h2h.played) * 100;

  function toggle() {
    haptic(9);
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(H2H_OPEN_KEY, next ? '1' : '0');
      } catch {
        /* 저장 실패는 무시한다 */
      }
      return next;
    });
  }

  return (
    <section className="card in" style={{ marginTop: 12, borderRadius: 20, padding: '14px 16px 16px' }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}
      >
        <h2 className="h3">최근 맞대결</h2>
        <span className="tiny muted" style={{ marginLeft: 'auto' }}>{h2h.played}경기</span>
        <Chevron open={open} />
      </button>

      <div className="distbar" style={{ marginTop: 12 }}>
        <i style={{ flex: Math.max(pct(h2h.homeWins), 0.001), background: 'var(--grad-accent)' }} />
        <i style={{ flex: Math.max(pct(h2h.draws), 0.001), background: 'var(--line-strong)' }} />
        <i style={{ flex: Math.max(pct(h2h.awayWins), 0.001), background: 'linear-gradient(90deg,#ff7a4a,#d1492a)' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <span className="tiny muted">{home.name} {h2h.homeWins}승</span>
        <span className="tiny muted">무 {h2h.draws}</span>
        <span className="tiny muted">{away.name} {h2h.awayWins}승</span>
      </div>

      {/* 접어도 요약 막대는 남긴다. 카드의 값은 거기 있고, 길이를 만드는 건 아래 목록이다. */}
      {h2h.recent.length > 0 && (
        <div className="collapse" data-open={open || undefined}>
          <div>
            <ul className="h2h-list">
              {h2h.recent.map((m, i) => (
                <li key={i}>
                  <span className="tiny muted">{m.date.slice(0, 10)}</span>
                  <span className="tiny" style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                    {team(m.homeId).abbr}
                  </span>
                  <span className="num" style={{ fontSize: 12 }}>{m.hg ?? '-'} : {m.ag ?? '-'}</span>
                  <span className="tiny" style={{ flex: 1, minWidth: 0 }}>{team(m.awayId).abbr}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="var(--ink-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{
        flexShrink: 0,
        transform: `rotate(${open ? 180 : 0}deg)`,
        transition: 'transform 0.28s var(--ease)',
      }}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ 기록 */

/** 화면에 낼 항목만 고른다. API 는 20가지쯤 주는데 대부분 잡음이다. */
const STAT_ROWS: [key: string, label: string][] = [
  ['Ball Possession', '점유율'],
  ['Total Shots', '슈팅'],
  ['Shots on Goal', '유효 슈팅'],
  ['Corner Kicks', '코너킥'],
  ['Fouls', '파울'],
  ['Yellow Cards', '경고'],
];

function statValue(v: string | number | null | undefined): { text: string; n: number } {
  if (v == null) return { text: '-', n: 0 };
  const text = String(v);
  const n = Number(text.replace('%', ''));
  return { text, n: Number.isFinite(n) ? n : 0 };
}

export function MatchStatsCard({
  stats, homeTeamId,
}: { stats: TeamStats[]; homeTeamId: number }) {
  const home = stats.find((s) => s.teamId === homeTeamId);
  const away = stats.find((s) => s.teamId !== homeTeamId);
  if (!home || !away) return null;

  const rows = STAT_ROWS.filter(([key]) => home.stats[key] != null || away.stats[key] != null);
  if (rows.length === 0) return null;

  return (
    <section className="card in" style={{ marginTop: 12, borderRadius: 20, padding: '14px 16px 16px' }}>
      <h2 className="h3">경기 기록</h2>
      <div style={{ marginTop: 10 }}>
        {rows.map(([key, label]) => {
          const h = statValue(home.stats[key]);
          const a = statValue(away.stats[key]);
          const total = h.n + a.n;
          return (
            <div key={key} className="statrow">
              <span className="num" style={{ fontSize: 12, width: 42 }}>{h.text}</span>
              <span style={{ flex: 1 }}>
                <span className="tiny muted" style={{ display: 'block', textAlign: 'center' }}>{label}</span>
                <span className="statbar">
                  <i style={{ flex: total ? h.n : 1, background: 'var(--accent)' }} />
                  <i style={{ flex: total ? a.n : 1, background: 'var(--cool)' }} />
                </span>
              </span>
              <span className="num" style={{ fontSize: 12, width: 42, textAlign: 'right' }}>{a.text}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
