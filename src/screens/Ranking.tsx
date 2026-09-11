import { useEffect, useState } from 'react';
import { SupporterBadge } from '../components/SupporterBadge';
import { Avatar } from '../components/Avatar';
import { TierChip } from '../components/TierChip';
import { IconRank } from '../components/icons';
import { repository } from '../data';
import type { RankRow } from '../data/types';
import { comma } from '../lib/format';
import { PLACEMENT_MATCHES } from '../lib/scoring';
import { useApp } from '../store';

export function Ranking() {
  const { state, tier } = useApp();
  const [rows, setRows] = useState<RankRow[]>([]);
  const [myRank, setMyRank] = useState<RankRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void Promise.all([repository.loadRanking(), repository.loadMyRank()]).then(([ranking, mine]) => {
      if (active) { setRows(ranking); setMyRank(mine); }
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const inPlacement = state.settledMatches < PLACEMENT_MATCHES;
  return <div className="scroll screen ranking-screen">
    <header className="page-heading pad">
      <p className="eyebrow">MATCHDAY RANKING</p>
      <div><h1>오늘의 축잘알</h1><span className="page-caption">매일 오전 8시 갱신</span></div>
      <p>예측으로 증명한 실력, 순위로 만나보세요.</p>
    </header>
    <div className="pad">
      <section className="rank-summary" aria-label="내 순위">
        <div className="rank-summary-label"><span>MY RANKING</span><TierChip tier={tier} /></div>
        <div className="rank-summary-main">
          <strong>{inPlacement ? `${Math.max(0, PLACEMENT_MATCHES - state.settledMatches)}경기` : myRank ? `${comma(myRank.rank)}위` : '집계 대기'}</strong>
          <span>{inPlacement ? '순위 진입까지' : state.topPercent != null ? `상위 ${state.topPercent}%` : '다음 발표를 기다려주세요'}</span>
        </div>
        {inPlacement ? <><div className="rank-placement-track"><i style={{width:`${Math.min(100, state.settledMatches / PLACEMENT_MATCHES * 100)}%`}} /></div><p>정산된 {state.settledMatches} / {PLACEMENT_MATCHES}경기 · 배치를 마치면 순위가 열려요.</p></> : <div className="rank-summary-bottom"><span>나의 축잘알 지수</span><b>{comma(state.rating)}</b></div>}
      </section>
      <div className="section-heading ranking-list-heading"><h2>전체 순위</h2><span>축잘알 지수 기준</span></div>
      {loading ? <div className="ranking-message" role="status">순위표를 불러오고 있어요.</div>
        : failed ? <div className="ranking-message" role="alert"><p>순위표를 불러오지 못했어요.</p><button className="pill" onClick={() => retry(value => value + 1)}>다시 시도</button></div>
        : !rows.length ? <div className="ranking-message"><IconRank size={28} color="var(--ink-3)" /><h3>첫 순위의 주인공을 기다려요</h3><p>배치 {PLACEMENT_MATCHES}경기를 마친 사람이 나오면 순위표가 열려요.</p></div>
        : <ol className="ranking-list" aria-label="전체 순위표">
          {rows.map(row => <li key={row.handle} className={row.isMe ? 'is-me' : undefined}>
            <span className={`ranking-position${row.rank <= 3 ? ' top' : ''}`} aria-label={`${row.rank}위`}>{row.rank < 10 ? `0${row.rank}` : row.rank}</span>
            <Avatar supporter={row.supporter} url={row.avatarUrl} name={row.handle} size={36} />
            <div className="ranking-person"><strong>{row.handle}{row.isMe && <small>나</small>}</strong><SupporterBadge badge={row.supporter} /><span>적중 {Math.round(row.accuracy * 100)}%</span></div>
            <div className="ranking-score"><b>{comma(row.rating)}</b><span className={row.change != null && row.change > 0 ? 'up' : ''}>{row.change == null ? 'NEW' : row.change > 0 ? `↑ ${row.change}` : row.change < 0 ? `↓ ${Math.abs(row.change)}` : '—'}</span></div>
          </li>)}
        </ol>}
      <p className="page-footnote">한 경기보다 꾸준한 예측이 실력을 보여줘요.</p>
    </div>
  </div>;
}
