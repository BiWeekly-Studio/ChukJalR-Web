import { isMajorCompetition } from '../lib/competitions';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Crest } from '../components/Crest';
import { BallMark, Wordmark } from '../components/Logo';
import { MatchCard } from '../components/MatchCard';
import { StandingsLink } from '../components/Standings';
import { TierChip } from '../components/TierChip';
import { TossBanner } from '../components/TossBanner';
import { LeagueOrderEditor } from '../components/LeagueOrderEditor';
import { IconFlame, IconLock } from '../components/icons';
import { fixture, fixtures as allFixtures, team } from '../data/catalog';
import { haptic } from '../lib/anim';
import { isCurrentMatchday, opensLabel, windowState } from '../lib/window';
import { kickoffLabel } from '../lib/format';
import { useApp, useOrderedLeagues } from '../store';

export function Predict({
  onOpenMatch,
  showAd,
}: {
  onOpenMatch: (id: number) => void;
  showAd: boolean;
}) {
  const { state, level, tier, isFavoriteFixture } = useApp();
  const ordered = useOrderedLeagues();
  const [tab, setTab] = useState<number | null>(null),
    [group, setGroup] = useState<'major' | 'other'>('major');
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderSaved, setOrderSaved] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const grouped = ordered.filter(
    (l) => isMajorCompetition(l.id) === (group === 'major')
  );
  const activeTab = grouped.some((l) => l.id === tab)
    ? tab!
    : (grouped[0]?.id ?? 0);
  useEffect(() => {
    const rail = tabsRef.current;
    const selected = rail?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (rail && selected)
      rail.scrollTo({
        left:
          selected.offsetLeft - (rail.clientWidth - selected.offsetWidth) / 2,
        behavior: 'auto',
      });
  }, [activeTab, ordered]);
  const inLeague = allFixtures().filter((f) => f.leagueId === activeTab);
  const today = inLeague.filter(
    (f) => windowState(f) !== 'UPCOMING' && isCurrentMatchday(f)
  );
  const upcoming = inLeague.filter((f) => windowState(f) === 'UPCOMING');
  const open = today.filter((f) => windowState(f) === 'OPEN');
  const featured =
    open.find((f) => isFavoriteFixture(f.id)) ??
    open[0] ??
    today[0] ??
    upcoming[0];
  const rest = today
    .filter((f) => f.id !== featured?.id)
    .sort(
      (a, b) =>
        Number(isFavoriteFixture(b.id)) - Number(isFavoriteFixture(a.id))
    );
  const done = today.filter((f) => state.predictions[f.id]).length;
  const banner = showAd && !standingsOpen && !orderOpen ? <TossBanner /> : null;
  const day = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date());
  const select = (id: number) => {
    haptic(8);
    setTab(id);
    setGroup(isMajorCompetition(id) ? 'major' : 'other');
  };
  return (
    <div className="scroll screen matchday-screen">
      <header className="matchday-header pad">
        <Wordmark width={112} />
        <span className="streak-counter">
          <IconFlame size={15} color="var(--hot)" />
          <b>{state.streak}</b> 연속 적중
        </span>
      </header>
      <div className="matchday-intro pad">
        <div>
          <p className="eyebrow">YOUR MATCHDAY</p>
          <h1>
            오늘의 승부,
            <br />
            <span>당신의 한 수.</span>
          </h1>
        </div>
        <span className="matchday-date">{day}</span>
      </div>
      <div className="competition-toolbar pad">
        <div className="competition-groups" aria-label="대회 분류">
          <button
            aria-pressed={group === 'major'}
            onClick={() => setGroup('major')}
          >
            메이저
          </button>
          <button
            aria-pressed={group === 'other'}
            onClick={() => setGroup('other')}
          >
            기타 대회
          </button>
        </div>
        <label className="all-competitions">
          전체 대회 <span aria-hidden="true">⌄</span>
          <select
            aria-label="전체 대회 선택"
            value={activeTab}
            onChange={(e) => select(Number(e.target.value))}
          >
            <optgroup label="메이저 대회">
              {ordered
                .filter((l) => isMajorCompetition(l.id))
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="기타 대회">
              {ordered
                .filter((l) => !isMajorCompetition(l.id))
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
      </div>
      <div className="competition-tabbar">
      <div
        ref={tabsRef}
        className="tabs competition-tabs"
        role="tablist"
        aria-label="대회 선택"
      >
        {grouped.map((l) => (
          <button
            key={l.id}
            role="tab"
            className="tab"
            aria-selected={activeTab === l.id}
            onClick={() => select(l.id)}
          >
            {l.short}
          </button>
        ))}
      </div>
      <button className="league-order-trigger" aria-label="리그 순서 편집" aria-haspopup="dialog"
        onClick={() => { setTab(activeTab); setOrderSaved(false); setOrderOpen(true); }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h10M4 12h7M4 18h7m7-12v12m-3-3 3 3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        순서
      </button>
      </div>
      {orderSaved && <p className="league-order-saved pad" role="status">리그 순서를 저장했어요.</p>}
      {orderOpen && <LeagueOrderEditor key={state.authUser?.id} initialGroup={group}
        close={() => setOrderOpen(false)} onSaved={() => { setOrderOpen(false); setOrderSaved(true); }} />}
      <div className="pad matchday-body">
        {featured && (
          <section aria-label="주목할 경기">
            <div className="section-heading">
              <h2>
                {windowState(featured) === 'UPCOMING'
                  ? '다가오는 매치'
                  : '오늘의 매치'}
              </h2>
              <span className="eyebrow">MATCH OF THE DAY</span>
            </div>
            <MatchCard
              key={featured.id}
              fixtureId={featured.id}
              featured
              onOpen={() => onOpenMatch(featured.id)}
            />
            {banner}
          </section>
        )}
        <div className="player-strip" data-tour="hud">
          <span className="player-level">
            {level.level}
            <small>LEVEL</small>
          </span>
          <div className="player-summary">
            <span>나의 축잘알 지수</span>
            <strong>
              {state.rating.toLocaleString('ko-KR')}
              <TierChip tier={tier} />
            </strong>
            <div
              className="player-track"
              role="progressbar"
              aria-label="다음 레벨 진행률"
              aria-valuenow={Math.round(level.progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${level.progress * 100}%` }} />
            </div>
          </div>
          <span className="today-progress">
            <b>
              {done}
              <i> / {today.length}</i>
            </b>
            오늘 예측
          </span>
        </div>
        {rest.length > 0 && (
          <section>
            <div className="section-heading">
              <h2>계속 예측해볼까요</h2>
              <span>
                {open.filter((f) => !state.predictions[f.id]).length}경기 남음
              </span>
            </div>
            <div className="match-list">
              {rest.map((f, i) => (
                <MatchCard
                  key={f.id}
                  fixtureId={f.id}
                  index={i + 1}
                  onOpen={() => onOpenMatch(f.id)}
                />
              ))}
            </div>
          </section>
        )}
        <StandingsLink leagueId={activeTab} onOpenChange={setStandingsOpen} />
        {today.length === 0 && (
          <div className="matchday-empty">
            <span className="empty-match-mark">
              <BallMark size={24} />
            </span>
            <div>
              <strong>오늘은 잠시 쉬어가는 날</strong>
              <p>다른 대회나 다가오는 경기를 확인해보세요.</p>
            </div>
          </div>
        )}
        {upcoming.filter((f) => f.id !== featured?.id).length > 0 && (
          <section>
            <div className="section-heading">
              <h2>다음 킥오프</h2>
              <span>다가오는 경기</span>
            </div>
            <div className="upcoming-list">
              {upcoming
                .filter((f) => f.id !== featured?.id)
                .slice(0, 6)
                .map((f, i) => (
                  <Fragment key={f.id}>
                    <UpcomingRow
                      fixtureId={f.id}
                      index={i}
                      onOpen={() => onOpenMatch(f.id)}
                    />
                  </Fragment>
                ))}
            </div>
          </section>
        )}
        <p className="matchday-signoff">
          축구를 보는 또 하나의 즐거움. <BallMark size={12} />
        </p>
      </div>
    </div>
  );
}

/** 아직 예측 창이 열리지 않은 경기. 예고만 보여준다. */
function UpcomingRow({
  fixtureId,
  index,
  onOpen,
}: {
  fixtureId: number;
  index: number;
  onOpen: () => void;
}) {
  const f = fixture(fixtureId);
  if (!f) return null;
  const home = team(f.homeTeamId);
  const away = team(f.awayTeamId);

  return (
    <button
      onClick={onOpen}
      className="row upcoming-row in-row"
      style={{
        minHeight: 72,
        padding: '0 14px',
        width: '100%',
        textAlign: 'left',
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
