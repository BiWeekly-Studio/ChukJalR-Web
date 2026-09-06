import { useState } from 'react';
import { Crest } from './Crest';
import { IconX } from './icons';
import { league, rank as teamRank, standingsOf, team } from '../data/catalog';
import { haptic } from '../lib/anim';
import { useApp } from '../store';

/**
 * 팀 이름 옆의 현재 등수.
 *
 * 순위표를 못 받았거나 승격팀이라 표에 없으면 아무것도 그리지 않는다 —
 * '0위' 나 '-' 를 붙이면 없는 정보를 있는 것처럼 만든다.
 */
export function RankTag({ teamId }: { teamId: number }) {
  const r = teamRank(teamId);
  if (r == null) return null;
  // 상위권과 강등권만 색으로 가른다. 나머지는 조용히 둔다.
  const tone = r <= 4 ? 'var(--accent)' : r >= 18 ? 'var(--cool)' : 'var(--ink-3)';
  return (
    <span className="ranktag" style={{ color: tone, background: `color-mix(in srgb, ${tone} 13%, transparent)` }}>
      {r}위
    </span>
  );
}

/** 리그 탭 아래의 순위표 진입. 상위 세 팀을 미리 보여줘야 누를 이유가 생긴다. */
export function StandingsLink({ leagueId }: { leagueId: number }) {
  const [open, setOpen] = useState(false);
  const top = standingsOf(leagueId).slice(0, 3);
  if (top.length === 0) return null;

  return (
    <>
      <button
        className="standlink"
        onClick={() => {
          haptic(9);
          setOpen(true);
        }}
      >
        <span className="small" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>순위표</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {top.map((r) => (
            <span key={r.teamId} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="num" style={{ fontSize: 10, color: 'var(--ink-4)' }}>{r.rank}</span>
              <Crest teamId={r.teamId} size={17} />
            </span>
          ))}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--ink-4)' }}>›</span>
      </button>
      {open && <StandingsSheet leagueId={leagueId} onClose={() => setOpen(false)} />}
    </>
  );
}

function StandingsSheet({ leagueId, onClose }: { leagueId: number; onClose: () => void }) {
  const { state } = useApp();
  const rows = standingsOf(leagueId);

  return (
    <div className="sheet" role="dialog" aria-label="리그 순위표">
      <div className="appbar" style={{ paddingTop: 'calc(var(--safe-top) + 14px)' }}>
        <span style={{ width: 40 }} />
        <span className="h3" style={{ fontSize: 15 }}>{league(leagueId).name}</span>
        <button className="backbtn" onClick={onClose} aria-label="닫기">
          <IconX size={15} color="var(--ink)" strokeWidth={2.5} />
        </button>
      </div>

      <div className="scroll" style={{ paddingTop: 0 }}>
        <div className="standings">
          <div className="strow head">
            <span className="pos" />
            <span className="who">팀</span>
            <span>경기</span><span>승</span><span>무</span><span>패</span>
            <span className="wide">득실</span><span className="wide">승점</span>
          </div>
          {rows.map((r) => {
            const mine = state.favoriteTeamIds.includes(r.teamId);
            const tone = r.rank <= 4 ? 'var(--accent)' : r.rank >= 18 ? 'var(--cool)' : 'var(--ink-2)';
            return (
              <div key={r.teamId} className={`strow${mine ? ' mine' : ''}`}>
                <span className="pos num" style={{ color: tone }}>{r.rank}</span>
                <span className="who">
                  <Crest teamId={r.teamId} size={20} />
                  <span className="small" style={{ fontWeight: mine ? 700 : 600 }}>
                    {team(r.teamId).name}
                  </span>
                </span>
                <span className="num muted">{r.played}</span>
                <span className="num">{r.win}</span>
                <span className="num">{r.draw}</span>
                <span className="num">{r.lose}</span>
                <span className="num muted wide">{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</span>
                <span className="num wide" style={{ fontWeight: 700 }}>{r.points}</span>
              </div>
            );
          })}
        </div>
        <p className="tiny muted" style={{ padding: '14px 20px 28px', margin: 0 }}>
          매일 낮에 갱신돼요.
        </p>
      </div>
    </div>
  );
}
