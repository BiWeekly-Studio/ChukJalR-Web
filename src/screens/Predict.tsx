import { useState } from 'react';
import { Crest } from '../components/Crest';
import { Wordmark } from '../components/Logo';
import { MatchCard } from '../components/MatchCard';
import { Ring } from '../components/Ring';
import { TierChip } from '../components/TierChip';
import { IconFlame, IconLock } from '../components/icons';
import { fixture, fixtures as allFixtures, league, team } from '../data/catalog';
import { haptic, useCountUpInt } from '../lib/anim';
import { isCurrentMatchday, opensLabel, windowState } from '../lib/window';
import { dateHeading, kickoffLabel } from '../lib/format';
import { PLACEMENT_MATCHES } from '../lib/scoring';
import { useApp, useOrderedLeagues } from '../store';

export function Predict({ onOpenMatch }: { onOpenMatch: (id: number) => void }) {
  const { state, level, tier, isFavoriteFixture } = useApp();
  const ordered = useOrderedLeagues();
  const [tab, setTab] = useState<number | null>(null);
  const activeTab = tab ?? ordered[0]?.id ?? 0;

  const inLeague = allFixtures().filter((f) => f.leagueId === activeTab);
  // 예측은 매치데이가 열린 경기만 가능하다. 나머지는 예고로만 보여준다. (명세 2.1)
  // 지난 매치데이 경기는 빼야 한다 — 결과를 못 받으면 '마감' 상태로 영원히 남는다.
  const today = inLeague.filter((f) => windowState(f) !== 'UPCOMING' && isCurrentMatchday(f));
  const upcoming = inLeague.filter((f) => windowState(f) === 'UPCOMING');
  const favMatches = today.filter((f) => isFavoriteFixture(f.id));
  const rest = today.filter((f) => !isFavoriteFixture(f.id));
  const predictedCount = today.filter((f) => state.predictions[f.id]).length;
  const allDone = today.length > 0 && predictedCount === today.length;

  return (
    <div className="scroll screen">
      <div className="pad" style={{ paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 36 }}>
          <Wordmark width={132} />
          <StreakChip streak={state.streak} />
        </div>

        <HudCard level={level} tier={tier} done={predictedCount} total={today.length} />
      </div>

      <div className="tabs" role="tablist">
        {ordered.map((l) => (
          <button
            key={l.id}
            role="tab"
            className="tab"
            aria-selected={activeTab === l.id}
            onClick={() => {
              haptic(8);
              setTab(l.id);
            }}
          >
            {l.short}
          </button>
        ))}
      </div>

      <div className="pad" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 10px' }}>
        <span className="h3" style={{ fontSize: 13 }}>
          {today.length ? `오늘의 경기 · ${dateHeading(today[0].kickoffAt)}` : '오늘 경기 없음'}
        </span>
        {today.length > 0 && (
          <span className={`chip ${allDone ? 'win' : 'plain'}`} style={{ fontSize: 10.5 }}>
            {allDone ? '오늘 예측 완료 🎉' : `${today.length - predictedCount}경기 남음`}
          </span>
        )}
      </div>

      <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 13, paddingBottom: 24 }}>
        {favMatches.length > 0 && (
          <>
            <SectionLabel accent>내 팀 경기</SectionLabel>
            {favMatches.map((f, i) => (
              <MatchCard key={f.id} fixtureId={f.id} index={i} onOpen={() => onOpenMatch(f.id)} />
            ))}
            <SectionLabel>{league(activeTab).name}의 남은 경기</SectionLabel>
          </>
        )}
        {rest.map((f, i) => (
          <MatchCard
            key={f.id}
            fixtureId={f.id}
            index={favMatches.length + i}
            onOpen={() => onOpenMatch(f.id)}
          />
        ))}

        {today.length === 0 && (
          <div className="empty">
            <span className="mark">
              <IconLock size={26} color="var(--ink-4)" />
            </span>
            <p className="h3" style={{ fontSize: 15, marginBottom: 6 }}>오늘 예측할 경기가 없어요</p>
            <p className="small muted" style={{ margin: 0 }}>
              다른 리그 탭을 눌러보거나, 아래 예고를 확인해 보세요.
            </p>
          </div>
        )}

        {upcoming.length > 0 && (
          <>
            <SectionLabel>다가오는 경기</SectionLabel>
            {upcoming.slice(0, 6).map((f, i) => (
              <UpcomingRow key={f.id} fixtureId={f.id} index={i} onOpen={() => onOpenMatch(f.id)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className="tiny"
      style={{
        display: 'flex', alignItems: 'center', gap: 7, marginTop: 6,
        fontWeight: 600, letterSpacing: '0.04em',
        color: accent ? 'var(--accent)' : 'var(--ink-3)',
      }}
    >
      <span
        style={{
          width: 3, height: 13, borderRadius: 2,
          background: accent ? 'var(--grad-accent)' : 'var(--line-strong)',
        }}
      />
      {children}
    </div>
  );
}

/** 연속 적중. 3연승부터는 칩이 불타오른다. */
function StreakChip({ streak }: { streak: number }) {
  const hot = streak >= 3;
  return (
    <span className={`chip ${hot ? 'hot' : 'plain'}`} style={{ height: 28, paddingInline: 11 }}>
      <span className={hot ? 'flame' : undefined}>
        <IconFlame size={14} color={hot ? '#fff' : 'var(--ink-3)'} />
      </span>
      <b className="num" style={{ fontSize: 13 }}>{streak}</b>
      연속
    </span>
  );
}

/** 화면 최상단의 상태창 — 레벨 · 티어 · XP · 오늘 진행률을 한 덩어리로 본다. */
function HudCard({
  level, tier, done, total,
}: {
  level: { level: number; into: number; need: number; progress: number };
  tier: React.ComponentProps<typeof TierChip>['tier'];
  done: number;
  total: number;
}) {
  const { state } = useApp();
  const remaining = Math.max(0, level.need - level.into);
  const xp = useCountUpInt(Math.round(level.progress * 100), 1000);

  return (
    <div className="levelcard in" data-tour="hud" style={{ marginTop: 12 }}>
      <div className="levelrow">
        <span className="lvbadge">Lv.{level.level}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TierChip tier={tier} />
            <span className="tiny" style={{ color: 'var(--accent)', fontWeight: 700 }}>
              {state.settledMatches < PLACEMENT_MATCHES
                ? `배치 ${state.settledMatches}/${PLACEMENT_MATCHES}`
                : state.topPercent == null
                  ? '순위 집계 전'
                  : `상위 ${state.topPercent}%`}
            </span>
          </span>
          <span className="tiny muted" style={{ display: 'block', marginTop: 3 }}>
            다음 레벨까지 <b style={{ color: 'var(--ink-2)' }}>{remaining}점</b>
          </span>
        </span>
        {total > 0 && <Ring value={done} total={total} />}
      </div>

      <div className="track">
        <i style={{ width: `${Math.round(level.progress * 100)}%` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span className="tiny muted">XP {xp}%</span>
        <span className="tiny muted">
          {level.into} / {level.need}
        </span>
      </div>
    </div>
  );
}

/** 아직 예측 창이 열리지 않은 경기. 예고만 보여준다. */
function UpcomingRow({
  fixtureId, index, onOpen,
}: { fixtureId: number; index: number; onOpen: () => void }) {
  const f = fixture(fixtureId);
  if (!f) return null;
  const home = team(f.homeTeamId);
  const away = team(f.awayTeamId);

  return (
    <button
      onClick={onOpen}
      className="row in-row"
      style={{
        height: 62, borderRadius: 16, border: '1.5px dashed var(--line-strong)',
        padding: '0 14px', width: '100%', textAlign: 'left',
        ['--i' as string]: index,
      }}
    >
      <span className="crests">
        <Crest teamId={f.homeTeamId} size={26} />
        <Crest teamId={f.awayTeamId} size={26} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="small" style={{ display: 'block', fontWeight: 700 }}>
          {home.name} vs {away.name}
        </span>
        <span className="tiny muted">{kickoffLabel(f.kickoffAt)}</span>
      </span>
      <span className="chip plain" style={{ fontSize: 10, flexShrink: 0 }}>
        <IconLock size={11} color="currentColor" />
        {opensLabel(f.opensAt)}
      </span>
    </button>
  );
}
