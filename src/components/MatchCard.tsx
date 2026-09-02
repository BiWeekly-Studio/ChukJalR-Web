import { useState } from 'react';
import { Crest } from './Crest';
import { IconCheck, IconFlame, IconX } from './icons';
import { fixture, league, team } from '../data/catalog';
import { kickoffLabel, pct, signed } from '../lib/format';
import { CONFIDENCE_LABEL, OUTCOMES, previewScore } from '../lib/scoring';
import { opensLabel, windowState } from '../lib/window';
import type { Confidence, Outcome } from '../lib/scoring';
import { useApp } from '../store';

const FILL_CLASS: Record<Outcome, string> = { HOME: 'home', DRAW: '', AWAY: 'away' };

export function MatchCard({ fixtureId, onOpen }: { fixtureId: number; onOpen: () => void }) {
  const { state, predict, isFavoriteFixture } = useApp();
  // 보기를 고르면 확신도 단계가 열린다. 이미 예측한 경기는 접힌 상태로 시작한다.
  const [draft, setDraft] = useState<Outcome | null>(null);

  const f = fixture(fixtureId);
  if (!f) return null;

  const home = team(f.homeTeamId);
  const away = team(f.awayTeamId);
  const saved = state.predictions[fixtureId];
  const isFav = isFavoriteFixture(fixtureId);
  const phase = windowState(f);
  const canPredict = phase === 'OPEN';
  const active = canPredict ? draft : null;

  const labels: Record<Outcome, string> = {
    HOME: `${home.name} 승`,
    DRAW: '무승부',
    AWAY: `${away.name} 승`,
  };

  const favTeam = isFav && state.favoriteTeamId != null ? team(state.favoriteTeamId) : null;

  function choose(o: Outcome) {
    if (!canPredict) return;
    setDraft((prev) => (prev === o ? null : o));
  }

  function commit(c: Confidence) {
    if (!active) return;
    predict(fixtureId, active, c);
    setDraft(null);
  }

  return (
    <div className={`card${isFav ? ' fav' : ''}`}>
      {favTeam && <div className="favband" style={{ background: favTeam.color }} />}

      <div className="cardhead">
        <button className="crests" onClick={onOpen} aria-label="경기 상세 열기">
          <Crest teamId={f.homeTeamId} />
          <Crest teamId={f.awayTeamId} />
        </button>
        <button onClick={onOpen} style={{ textAlign: 'left', flex: 1 }}>
          <div className="h3" style={{ fontSize: 16 }}>
            {home.name} vs {away.name}
          </div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            {isFav && <b style={{ color: favTeam?.color }}>내 팀 · </b>}
            {league(f.leagueId).name} {f.round}R ·{' '}
            {phase === 'FINISHED' ? (
              <b style={{ color: 'var(--ink-2)' }}>종료 {f.homeGoals} : {f.awayGoals}</b>
            ) : (
              `${f.venue} · ${kickoffLabel(f.kickoffAt)}`
            )}
          </div>
        </button>
        {phase === 'FINISHED' && saved ? (
          saved.pick === f.result ? (
            <span className="chip acc" style={{ flexShrink: 0 }}>
              <IconCheck size={11} color="currentColor" strokeWidth={3} />
              적중
            </span>
          ) : (
            <span className="chip plain" style={{ flexShrink: 0 }}>
              <IconX size={10} color="currentColor" />
              실패
            </span>
          )
        ) : saved && !active ? (
          <span className="chip acc" style={{ flexShrink: 0 }}>
            <IconCheck size={11} color="currentColor" strokeWidth={3} />
            예측함
          </span>
        ) : !saved && phase === 'LOCKED' ? (
          <span className="chip plain" style={{ flexShrink: 0 }}>마감</span>
        ) : null}
      </div>

      <div className="options">
        {OUTCOMES.map((o, i) => {
          const chosen = saved?.pick === o;
          const isDraft = active === o;
          const isResult = phase === 'FINISHED' && f.result === o;
          const hit = isResult && chosen;
          // 끝난 경기: 결과 행과 내가 고른 행만 살리고 나머지는 죽인다
          const dim =
            phase === 'FINISHED'
              ? !isResult && !chosen
              : Boolean(saved) && !chosen && !active;
          return (
            <button
              key={o}
              type="button"
              className={`option${dim || (!canPredict && phase !== 'FINISHED') ? ' dim' : ''}`}
              aria-pressed={chosen || isDraft || isResult}
              disabled={!canPredict}
              onClick={() => choose(o)}
            >
              <span
                className={`fill ${FILL_CLASS[o]}`}
                style={{ width: `${Math.round(f.baseline[i] * 100)}%` }}
              />
              <span className="body">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {phase === 'FINISHED' && chosen && (
                    <span
                      className="tick"
                      style={hit ? undefined : { background: 'var(--ink-4)' }}
                    >
                      {hit ? <IconCheck /> : <IconX size={11} color="#fff" />}
                    </span>
                  )}
                  {phase !== 'FINISHED' && chosen && !active && (
                    <span className="tick">
                      <IconCheck />
                    </span>
                  )}
                  <span className="name" style={chosen || isResult ? { fontWeight: 800 } : undefined}>
                    {labels[o]}
                  </span>
                  {isResult && !chosen && (
                    <span className="chip plain" style={{ height: 18, fontSize: 10 }}>결과</span>
                  )}
                </span>
                <span
                  className="pctv"
                  style={hit ? { color: 'var(--accent)' } : undefined}
                >
                  {pct(f.baseline[i])}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {active ? (
        <ConfidenceStep
          fixtureId={fixtureId}
          pick={active}
          label={labels[active]}
          current={saved?.pick === active ? saved.confidence : undefined}
          onPick={commit}
        />
      ) : (
        <Footline fixtureId={fixtureId} />
      )}
    </div>
  );
}

function ConfidenceStep({
  fixtureId,
  pick,
  label,
  current,
  onPick,
}: {
  fixtureId: number;
  pick: Outcome;
  label: string;
  current?: Confidence;
  onPick: (c: Confidence) => void;
}) {
  const { state } = useApp();
  const [hover, setHover] = useState<Confidence>(current ?? 2);

  const f = fixture(fixtureId);
  if (!f) return null;
  const preview = previewScore(f.baseline, pick, hover, state.streak);

  return (
    <div className="confwrap">
      <div className="small" style={{ fontWeight: 600 }}>
        <b style={{ color: 'var(--accent)' }}>{label}</b> — 얼마나 확신하세요?
      </div>

      <div className="confbtns">
        {([1, 2, 3] as Confidence[]).map((c) => (
          <button
            key={c}
            type="button"
            className="conf"
            aria-pressed={hover === c}
            onClick={() => (hover === c ? onPick(c) : setHover(c))}
          >
            <span className="lv">
              {[1, 2, 3].map((d) => (
                <i key={d} className={`dot${d <= c ? ' on' : ''}`} />
              ))}
            </span>
            {CONFIDENCE_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="stake">
        <span className="tiny muted">맞히면</span>
        <span className="val" style={{ color: 'var(--accent)' }}>
          {signed(preview.ifCorrect)}
        </span>
        <span className="tiny muted">틀리면</span>
        <span className="val" style={{ color: 'var(--ink-3)' }}>
          {signed(preview.ifWrong)}
        </span>
        <span style={{ marginLeft: 'auto' }} className="chip gold">
          <IconFlame size={11} />+{preview.pointsIfCorrect}점
        </span>
      </div>

      <button className="cta" style={{ height: 46, marginTop: 11 }} onClick={() => onPick(hover)}>
        이걸로 예측하기
      </button>
      {hover === 3 && (
        <p className="tiny muted" style={{ margin: '9px 0 0', textAlign: 'center' }}>
          확신은 아껴 쓰세요. 속으로 80% 이상 확신할 때만 이득입니다.
        </p>
      )}
    </div>
  );
}

function Footline({ fixtureId }: { fixtureId: number }) {
  const { state } = useApp();
  const f = fixture(fixtureId);
  const saved = state.predictions[fixtureId];

  if (!f) return null;

  const phase = windowState(f);

  if (phase === 'FINISHED') {
    const result = state.settlements[fixtureId];
    if (!saved) {
      return (
        <div className="stake" style={{ marginTop: 12 }}>
          <span className="tiny muted">예측하지 않은 경기예요</span>
        </div>
      );
    }
    if (!result) {
      return (
        <div className="stake" style={{ marginTop: 12 }}>
          <span className="tiny muted">결과 확인 중이에요. 곧 정산돼요</span>
        </div>
      );
    }
    const won = result.deltaRating > 0;
    return (
      <div className="stake" style={{ marginTop: 12 }}>
        <span className="tiny muted">{CONFIDENCE_LABEL[saved.confidence]}</span>
        <span className="tiny muted">·</span>
        <span className="val" style={{ color: won ? 'var(--accent)' : 'var(--ink-3)' }}>
          {signed(result.deltaRating)}
        </span>
        <span className="tiny muted">지수</span>
        <span style={{ marginLeft: 'auto' }} className="chip gold">
          +{result.points}점
        </span>
      </div>
    );
  }

  if (phase === 'UPCOMING') {
    return (
      <div className="stake" style={{ marginTop: 12 }}>
        <span className="tiny muted">{opensLabel(f.opensAt)}</span>
        <span className="tiny muted" style={{ marginLeft: 'auto' }}>
          경기 당일에만 예측할 수 있어요
        </span>
      </div>
    );
  }

  if (!saved) {
    return (
      <div className="stake" style={{ marginTop: 12 }}>
        <span className="tiny muted">
          {phase === 'LOCKED'
            ? '예측이 마감됐어요'
            : `${f.participants.toLocaleString('ko-KR')}명 예측 중`}
        </span>
        <span className="tiny muted" style={{ marginLeft: 'auto' }}>
          {phase === 'LOCKED' ? '결과를 기다려요' : '보기를 누르면 확신도를 고를 수 있어요'}
        </span>
      </div>
    );
  }

  const preview = previewScore(f.baseline, saved.pick, saved.confidence, state.streak);
  return (
    <div className="stake" style={{ marginTop: 12 }}>
      <span className="tiny muted">{CONFIDENCE_LABEL[saved.confidence]}</span>
      <span className="tiny muted">·</span>
      <span className="tiny muted">
        맞히면 {signed(preview.ifCorrect)} / 틀리면 {signed(preview.ifWrong)}
      </span>
      <span style={{ marginLeft: 'auto' }} className="chip gold">
        +{preview.pointsIfCorrect}점
      </span>
    </div>
  );
}
