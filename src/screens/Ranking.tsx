import { useState } from 'react';
import { TierChip } from '../components/TierChip';
import { IconCrown, IconDown, IconRank, IconUp } from '../components/icons';
import { repository } from '../data';
import type { RankRow } from '../data/types';
import { haptic, useCountUpInt } from '../lib/anim';
import { comma } from '../lib/format';
import { PLACEMENT_MATCHES } from '../lib/scoring';
import type { Tier } from '../lib/scoring';
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
    <div className="scroll screen">
      <div className="pad" style={{ paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 36 }}>
          <span className="h1" style={{ fontSize: 22 }}>랭킹</span>
          <span className="chip plain" style={{ fontSize: 10.5 }}>
            <span className="live-dot" style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)' }} />
            {nextPublishLabel()}
          </span>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            role="tab"
            className="tab"
            aria-selected={scope === s.id}
            onClick={() => {
              haptic(8);
              setScope(s.id);
            }}
          >
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
          <div className="pad" style={{ display: 'flex', alignItems: 'flex-end', gap: 10, paddingTop: 22 }}>
            <Podium row={second} height={54} rank={2} order={1} />
            <Podium row={first} height={78} rank={1} order={0} crown />
            <Podium row={third} height={40} rank={3} order={2} />
          </div>

          <div className="pad" style={{ paddingTop: 10 }}>
            {rest.map((r, i) => (
              <div
                key={r.handle}
                className={`row in-row${i < rest.length - 1 ? ' divide' : ''}`}
                style={{
                  height: 56, ['--i' as string]: i,
                  ...(r.isMe
                    ? { background: 'var(--accent-fill)', borderRadius: 14, paddingInline: 8, marginInline: -8 }
                    : null),
                }}
              >
                <span className="num" style={{ width: 24, fontSize: 17, color: r.isMe ? 'var(--accent)' : 'var(--ink-2)' }}>
                  {r.rank}
                </span>
                <Change value={r.change} />
                <span className="avatar" style={{ width: 32, height: 32 }}>{r.initial}</span>
                <span className="small" style={{ flex: 1, minWidth: 0, fontWeight: r.isMe ? 800 : 600 }}>
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

      <div className="pad" style={{ paddingTop: 16, paddingBottom: 24 }}>
        {inPlacement ? <PlacementCard settled={state.settledMatches} /> : <MyRankCard row={myRank} tier={tier} />}
      </div>
    </div>
  );
}

/** 배치 중에는 순위 대신 진행률을 보여준다. 이게 초반의 목표가 된다. */
function PlacementCard({ settled }: { settled: number }) {
  const left = Math.max(0, PLACEMENT_MATCHES - settled);
  return (
    <div className="levelcard in" style={{ padding: '16px 16px 18px' }}>
      <div className="row" style={{ gap: 8 }}>
        <TierChip tier="PLACEMENT" />
        <span className="h3">순위 진입까지</span>
        <span className="num" style={{ marginLeft: 'auto', fontSize: 15 }}>
          {settled} <span className="muted" style={{ fontSize: 12 }}>/ {PLACEMENT_MATCHES}</span>
        </span>
      </div>
      <div className="track" style={{ marginTop: 12 }}>
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

function MyRankCard({ row, tier }: { row: RankRow | null; tier: Tier | null }) {
  const { state } = useApp();
  const rating = useCountUpInt(row?.rating ?? 0, 1100);
  if (!row) return null;
  return (
    <div
      className="row in"
      style={{
        height: 68, borderRadius: 20, background: 'var(--grad-accent)',
        padding: '0 15px', boxShadow: 'var(--glow-accent)', color: '#fff',
      }}
    >
      <span className="num" style={{ width: 26, fontSize: 19 }}>{row.rank}</span>
      <span
        className="avatar"
        style={{ width: 36, height: 36, background: 'rgba(255,255,255,.22)', color: '#fff' }}
      >
        {row.initial}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="h3" style={{ display: 'block', fontSize: 14 }}>{row.handle}</span>
        <span className="tiny" style={{ opacity: 0.86 }}>
          {tier === 'PLACEMENT' || state.topPercent == null
            ? '배치 중'
            : `상위 ${state.topPercent}%`}{' '}
          · 내 순위
        </span>
      </span>
      <Change value={row.change} onDark />
      <span className="num" style={{ fontSize: 16 }}>{comma(rating)}</span>
    </div>
  );
}

function Change({ value, onDark }: { value: number | null; onDark?: boolean }) {
  const dim = onDark ? 'rgba(255,255,255,.7)' : 'var(--ink-4)';
  const up = onDark ? '#b7ffd9' : 'var(--win)';

  if (value == null) {
    return (
      <span className="tiny" style={{ color: onDark ? '#fff' : 'var(--accent)', width: 24, fontWeight: 800 }}>
        NEW
      </span>
    );
  }
  if (value > 0) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 2, width: 24 }}>
        <IconUp color={up} />
        <span className="tiny" style={{ color: up, fontWeight: 700 }}>{value}</span>
      </span>
    );
  }
  if (value < 0) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 2, width: 24 }}>
        <IconDown color={dim} />
        <span className="tiny" style={{ color: dim }}>{Math.abs(value)}</span>
      </span>
    );
  }
  return (
    <span style={{ width: 24, display: 'flex' }}>
      <span style={{ width: 10, height: 2.5, borderRadius: 2, background: onDark ? 'rgba(255,255,255,.5)' : 'var(--line-strong)' }} />
    </span>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <span className="mark">
        <IconRank size={26} color="var(--ink-4)" />
      </span>
      <p className="h3" style={{ fontSize: 15, marginBottom: 8 }}>{title}</p>
      <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function Podium({
  row, height, rank, order, crown,
}: { row?: RankRow; height: number; rank: number; order: number; crown?: boolean }) {
  const top = rank === 1;
  if (!row) return <div style={{ flex: 1 }} />;
  return (
    <div
      className="in"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, ['--i' as string]: order }}
    >
      {crown && (
        <span className="crown">
          <IconCrown color="var(--gold-ink)" />
        </span>
      )}
      <span
        className="avatar"
        style={{
          width: top ? 58 : 44, height: top ? 58 : 44,
          background: top ? 'var(--grad-gold)' : 'var(--card-2)',
          color: top ? '#fff' : 'var(--ink-2)',
          fontSize: top ? 20 : 15,
          boxShadow: top ? 'var(--glow-gold)' : '0 3px 0 0 var(--line-strong)',
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
      <span className="num" style={{ fontSize: top ? 14 : 13, color: top ? 'var(--gold)' : 'var(--ink-3)' }}>
        {comma(row.rating)}
      </span>
      <div
        className={`podium${top ? ' gold' : ''}`}
        style={{
          width: '100%', height,
          background: rank === 2 ? 'var(--paper-2)' : 'var(--line-2)',
          ['--i' as string]: order,
        }}
      >
        <span className="num" style={{ fontSize: top ? 34 : 24, color: top ? '#fff' : 'var(--ink-3)' }}>
          {rank}
        </span>
      </div>
    </div>
  );
}
