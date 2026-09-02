import { useState } from 'react';
import { Crest } from '../components/Crest';
import { MatchCard } from '../components/MatchCard';
import { IconFlame, IconShield } from '../components/icons';
import { fixture, fixtures as allFixtures, league, team } from '../data/catalog';
import { opensLabel, windowState } from '../lib/window';
import { dateHeading, kickoffLabel } from '../lib/format';
import { PLACEMENT_MATCHES, TIER_LABEL } from '../lib/scoring';
import { useApp, useOrderedLeagues } from '../store';

export function Predict({ onOpenMatch }: { onOpenMatch: (id: number) => void }) {
  const { state, level, tier, isFavoriteFixture } = useApp();
  const ordered = useOrderedLeagues();
  const [tab, setTab] = useState<number | null>(null);
  const activeTab = tab ?? ordered[0]?.id ?? 0;

  const inLeague = allFixtures().filter((f) => f.leagueId === activeTab);
  // 예측은 매치데이가 열린 경기만 가능하다. 나머지는 예고로만 보여준다. (명세 2.1)
  const today = inLeague.filter((f) => windowState(f) !== 'UPCOMING');
  const upcoming = inLeague.filter((f) => windowState(f) === 'UPCOMING');
  const favMatches = today.filter((f) => isFavoriteFixture(f.id));
  const rest = today.filter((f) => !isFavoriteFixture(f.id));
  const predictedCount = today.filter((f) => state.predictions[f.id]).length;

  return (
    <div className="scroll">
      <div className="pad" style={{ paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 34 }}>
          <span className="h1">축잘알</span>
          <span className="chip gold">
            <IconFlame />
            {state.streak}연속
          </span>
        </div>

        <div className="levelcard" style={{ marginTop: 12 }}>
          <div className="levelrow">
            <IconShield size={16} color="var(--accent)" />
            <span className="h3">Lv.{level.level} {TIER_LABEL[tier]}</span>
            <span className="tiny" style={{ color: 'var(--accent)', fontWeight: 600 }}>
              {state.settledMatches < PLACEMENT_MATCHES
                ? `배치 ${state.settledMatches}/${PLACEMENT_MATCHES}`
                : `상위 ${state.topPercent}%`}
            </span>
            <span className="tiny muted" style={{ marginLeft: 'auto' }}>
              다음 레벨까지 {Math.max(0, level.need - level.into)}점
            </span>
          </div>
          <div className="track">
            <i style={{ width: `${Math.round(level.progress * 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {ordered.map((l) => (
          <button
            key={l.id}
            role="tab"
            className="tab"
            aria-selected={activeTab === l.id}
            onClick={() => setTab(l.id)}
          >
            {l.short}
          </button>
        ))}
      </div>

      <div className="pad" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px 10px' }}>
        <span className="small" style={{ fontWeight: 600 }}>
          {today.length ? `오늘의 경기 · ${dateHeading(today[0].kickoffAt)}` : '오늘 경기 없음'}
        </span>
        <span className="small muted">
          {today.length ? `${today.length}경기 중 ${predictedCount}개 예측함` : ''}
        </span>
      </div>

      <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 24 }}>
        {favMatches.length > 0 && (
          <>
            <div className="tiny" style={{ fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>
              내 팀 경기
            </div>
            {favMatches.map((f) => (
              <MatchCard key={f.id} fixtureId={f.id} onOpen={() => onOpenMatch(f.id)} />
            ))}
            <div className="tiny muted" style={{ fontWeight: 700, marginTop: 6 }}>
              {league(activeTab).name}의 남은 경기
            </div>
          </>
        )}
        {rest.map((f) => (
          <MatchCard key={f.id} fixtureId={f.id} onOpen={() => onOpenMatch(f.id)} />
        ))}

        {today.length === 0 && (
          <p className="small muted" style={{ textAlign: 'center', padding: '32px 0 8px' }}>
            오늘 예측할 경기가 없어요.
          </p>
        )}

        {upcoming.length > 0 && (
          <>
            <div className="tiny muted" style={{ fontWeight: 700, marginTop: 10 }}>
              다가오는 경기
            </div>
            {upcoming.slice(0, 6).map((f) => (
              <UpcomingRow key={f.id} fixtureId={f.id} onOpen={() => onOpenMatch(f.id)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** 아직 예측 창이 열리지 않은 경기. 예고만 보여준다. */
function UpcomingRow({ fixtureId, onOpen }: { fixtureId: number; onOpen: () => void }) {
  const f = fixture(fixtureId);
  if (!f) return null;
  const home = team(f.homeTeamId);
  const away = team(f.awayTeamId);

  return (
    <button
      onClick={onOpen}
      className="row"
      style={{
        height: 58, borderRadius: 14, border: '1px dashed var(--line-strong)',
        padding: '0 14px', width: '100%', textAlign: 'left',
      }}
    >
      <span className="crests">
        <Crest teamId={f.homeTeamId} size={24} />
        <Crest teamId={f.awayTeamId} size={24} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="small" style={{ display: 'block', fontWeight: 600 }}>
          {home.name} vs {away.name}
        </span>
        <span className="tiny muted">{kickoffLabel(f.kickoffAt)}</span>
      </span>
      <span className="tiny muted" style={{ textAlign: 'right', flexShrink: 0 }}>
        {opensLabel(f.opensAt)}
      </span>
    </button>
  );
}
