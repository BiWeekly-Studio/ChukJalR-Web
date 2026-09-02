import { useState } from 'react';
import { IconCrown, IconDown, IconShield, IconUp } from '../components/icons';
import { repository } from '../data';
import type { RankRow } from '../data/types';
import { comma } from '../lib/format';
import { PLACEMENT_MATCHES, TIER_LABEL } from '../lib/scoring';
import { useAsync } from '../lib/useAsync';
import { useApp } from '../store';

const SCOPES = [
  { id: 'global', label: '전체' },
  { id: 'league', label: '리그별' },
  { id: 'friends', label: '친구' },
] as const;

/** 순위는 매일 08:00 KST 에 확정된다 (명세 3.3). 다음 발표까지 남은 시간을 알려준다. */
function nextPublishLabel(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const hour = kst.getUTCHours();
  const hoursLeft = hour < 8 ? 8 - hour : 32 - hour;
  return hoursLeft <= 1 ? '곧 발표돼요' : `다음 발표까지 ${hoursLeft}시간`;
}

export function Ranking() {
  const { state, tier } = useApp();
  const [scope, setScope] = useState<(typeof SCOPES)[number]['id']>('global');
  const rows = useAsync<RankRow[]>(() => repository.loadRanking(), []);
  const myRank = useAsync<RankRow | null>(() => repository.loadMyRank(), null);

  const [first, second, third, ...rest] = rows;
  const inPlacement = state.settledMatches < PLACEMENT_MATCHES;

  return (
    <div className="scroll">
      <div className="pad" style={{ paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 34 }}>
          <span className="h2">랭킹</span>
          <span className="tiny muted">매일 오전 8시 확정 · {nextPublishLabel()}</span>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {SCOPES.map((s) => (
          <button key={s.id} role="tab" className="tab" aria-selected={scope === s.id} onClick={() => setScope(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {scope === 'friends' ? (
        <Empty
          title="아직 친구가 없어요"
          body="친구를 초대하면, 그 친구가 배치 20경기를 마쳤을 때 200점을 드려요."
        />
      ) : rows.length === 0 ? (
        <Empty
          title="아직 순위가 없어요"
          body={`배치 ${PLACEMENT_MATCHES}경기를 마친 사람이 나오면 순위표가 열려요. 운으로 오른 순위를 막기 위한 장치예요.`}
        />
      ) : (
        <>
          <div className="pad" style={{ display: 'flex', alignItems: 'flex-end', gap: 10, paddingTop: 20 }}>
            <Podium row={second} height={50} rank={2} />
            <Podium row={first} height={70} rank={1} crown />
            <Podium row={third} height={36} rank={3} />
          </div>

          <div className="pad" style={{ paddingTop: 8 }}>
            {rest.map((r, i) => (
              <div
                key={r.handle}
                className={`row${i < rest.length - 1 ? ' divide' : ''}`}
                style={{ height: 54 }}
              >
                <span className="num" style={{ width: 22, fontSize: 17, color: 'var(--ink-2)' }}>{r.rank}</span>
                <Change value={r.change} />
                <span className="avatar" style={{ width: 30, height: 30 }}>{r.initial}</span>
                <span className="small" style={{ flex: 1, fontWeight: r.isMe ? 800 : 600 }}>
                  {r.handle}
                  {r.isMe && <span className="tiny" style={{ color: 'var(--accent)' }}> · 나</span>}
                </span>
                <span className="tiny muted">적중 {Math.round(r.accuracy * 100)}%</span>
                <span className="num" style={{ width: 58, textAlign: 'right', fontSize: 14 }}>
                  {comma(r.rating)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="pad" style={{ paddingTop: 14, paddingBottom: 24 }}>
        {inPlacement ? <PlacementCard settled={state.settledMatches} /> : <MyRankCard row={myRank} tier={tier} />}
      </div>
    </div>
  );
}

/** 배치 중에는 순위 대신 진행률을 보여준다. 이게 초반의 목표가 된다. */
function PlacementCard({ settled }: { settled: number }) {
  const left = Math.max(0, PLACEMENT_MATCHES - settled);
  return (
    <div
      style={{
        borderRadius: 16, background: 'var(--card)', padding: '16px 16px 18px',
        boxShadow: 'var(--lift)',
      }}
    >
      <div className="row" style={{ gap: 8 }}>
        <IconShield size={15} color="var(--accent)" />
        <span className="h3">배치 중</span>
        <span className="tiny muted" style={{ marginLeft: 'auto' }}>
          {settled} / {PLACEMENT_MATCHES}
        </span>
      </div>
      <div className="track" style={{ marginTop: 11 }}>
        <i style={{ width: `${Math.round((settled / PLACEMENT_MATCHES) * 100)}%` }} />
      </div>
      <p className="small muted" style={{ margin: '11px 0 0' }}>
        {left > 0
          ? `${left}경기만 더 예측하면 순위에 올라요.`
          : '내일 아침 발표에 처음 이름이 올라갑니다.'}
      </p>
    </div>
  );
}

function MyRankCard({ row, tier }: { row: RankRow | null; tier: keyof typeof TIER_LABEL }) {
  const { state } = useApp();
  if (!row) return null;
  return (
    <div
      className="row"
      style={{
        height: 60, borderRadius: 16, background: 'var(--accent-soft)',
        padding: '0 14px', boxShadow: '0 3px 0 0 var(--accent-line)',
      }}
    >
      <span className="num" style={{ width: 22, fontSize: 17, color: 'var(--accent)' }}>{row.rank}</span>
      <span className="avatar" style={{ width: 32, height: 32, background: '#fff', color: 'var(--accent-deep)' }}>
        {row.initial}
      </span>
      <span style={{ flex: 1 }}>
        <span className="h3" style={{ display: 'block', fontSize: 14 }}>{row.handle}</span>
        <span className="tiny" style={{ color: 'var(--accent-deep)' }}>
          {TIER_LABEL[tier]} · 상위 {state.topPercent}%
        </span>
      </span>
      <Change value={row.change} />
      <span className="num" style={{ fontSize: 14, color: 'var(--accent)' }}>{comma(row.rating)}</span>
    </div>
  );
}

function Change({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="tiny" style={{ color: 'var(--accent)', width: 22 }}>NEW</span>;
  }
  if (value > 0) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 2, width: 22 }}>
        <IconUp color="var(--accent)" />
        <span className="tiny" style={{ color: 'var(--accent)' }}>{value}</span>
      </span>
    );
  }
  if (value < 0) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 2, width: 22 }}>
        <IconDown color="var(--ink-4)" />
        <span className="tiny muted">{Math.abs(value)}</span>
      </span>
    );
  }
  return <span style={{ width: 22, display: 'flex' }}><span style={{ width: 10, height: 2.5, borderRadius: 2, background: 'var(--line-strong)' }} /></span>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="pad" style={{ textAlign: 'center', padding: '56px 32px 24px' }}>
      <p className="h3" style={{ marginBottom: 8 }}>{title}</p>
      <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function Podium({
  row, height, rank, crown,
}: { row?: RankRow; height: number; rank: number; crown?: boolean }) {
  const top = rank === 1;
  if (!row) return <div style={{ flex: 1 }} />;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {crown && <IconCrown color="var(--gold-ink)" />}
      <span
        className="avatar"
        style={{
          width: top ? 54 : 42, height: top ? 54 : 42,
          background: top ? 'var(--accent-soft)' : 'var(--card-2)',
          color: top ? 'var(--accent-deep)' : 'var(--ink-2)',
          fontSize: top ? 19 : 15,
          boxShadow: `0 ${top ? 4 : 3}px 0 0 ${top ? 'var(--accent-line)' : 'var(--line-strong)'}`,
        }}
      >
        {row.initial}
      </span>
      <span
        className={top ? 'h3' : 'small'}
        style={{ fontSize: top ? 14 : 12, fontWeight: top ? 900 : 600, color: top ? 'var(--ink)' : 'var(--ink-2)' }}
      >
        {row.handle}
      </span>
      <span className="num" style={{ fontSize: top ? 14 : 13, color: top ? 'var(--accent)' : 'var(--ink-3)' }}>
        {comma(row.rating)}
      </span>
      <div className="podium" style={{ width: '100%', height, background: top ? 'var(--accent)' : 'var(--line-2)' }}>
        <span className="num" style={{ fontSize: top ? 32 : 24, color: top ? '#fff6f2' : 'var(--ink-3)' }}>{rank}</span>
      </div>
    </div>
  );
}
