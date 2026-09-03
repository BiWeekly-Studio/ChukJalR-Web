import { useState } from 'react';
import { Burst } from './Burst';
import { Crest } from './Crest';
import { IconCheck, IconFlame, IconX } from './icons';
import { fixture, league, team } from '../data/catalog';
import { haptic } from '../lib/anim';
import { kickoffLabel, pct, signed } from '../lib/format';
import { CONFIDENCE_LABEL, OUTCOMES, previewScore } from '../lib/scoring';
import { crowdLevel } from '../lib/baseline';
import { opensLabel, windowState } from '../lib/window';
import type { Confidence, Outcome } from '../lib/scoring';
import { useApp } from '../store';

const FILL_CLASS: Record<Outcome, string> = { HOME: 'home', DRAW: '', AWAY: 'away' };

export function MatchCard({
  fixtureId, index = 0, onOpen,
}: { fixtureId: number; index?: number; onOpen: () => void }) {
  const { state, predict, isFavoriteFixture } = useApp();
  // 보기를 고르면 확신도 단계가 열린다. 이미 예측한 경기는 접힌 상태로 시작한다.
  const [draft, setDraft] = useState<Outcome | null>(null);
  // 예측을 확정한 순간 카드 위에서 터지는 연출. seed 가 바뀔 때마다 한 번 재생된다.
  const [burst, setBurst] = useState({ seed: 0, label: '' });

  const f = fixture(fixtureId);
  if (!f) return null;

  const home = team(f.homeTeamId);
  const away = team(f.awayTeamId);
  const saved = state.predictions[fixtureId];
  const isFav = isFavoriteFixture(fixtureId);
  const phase = windowState(f);
  const canPredict = phase === 'OPEN';
  const active = canPredict ? draft : null;

  // 기준선은 예측이 한 명도 없어도 서버가 prior 로 돌려준다 (compute_baseline).
  // 점수 계산의 근거로는 진짜지만, 아무도 예측하지 않았다면 '여론'은 아니다.
  const crowd = crowdLevel(f.participants);
  const showCrowd = f.baseline != null && crowd !== 'none';

  const labels: Record<Outcome, string> = {
    HOME: `${home.name} 승`,
    DRAW: '무승부',
    AWAY: `${away.name} 승`,
  };

  // 한 경기에 내 팀이 둘일 수도 있다(더비). 홈 쪽을 먼저 잡는다.
  const myTeamId = [f.homeTeamId, f.awayTeamId].find((id) => state.favoriteTeamIds.includes(id));
  const favTeam = myTeamId != null ? team(myTeamId) : null;

  function choose(o: Outcome) {
    if (!canPredict) return;
    haptic(9);
    setDraft((prev) => (prev === o ? null : o));
  }

  function commit(c: Confidence) {
    if (!active || !f) return;
    // 기준선이 없으면 얻을 점수를 계산할 근거가 없다. 숫자를 지어내지 않는다.
    const gain = f.baseline
      ? previewScore(f.baseline, active, c, state.streak).pointsIfCorrect
      : null;
    predict(fixtureId, active, c);
    setDraft(null);
    setBurst({ seed: Date.now(), label: gain == null ? '예측 완료' : `+${gain}점 예약` });
    haptic([12, 40, 18]);
  }

  return (
    <div
      className={`card in${isFav ? ' fav' : ''}`}
      style={{ ['--i' as string]: index, position: 'relative' }}
    >
      {favTeam && <div className="favband" style={{ background: favTeam.color }} />}
      <Burst seed={burst.seed} label={burst.label} />

      <div className="cardhead">
        <button className="crests" onClick={onOpen} aria-label="경기 상세 열기">
          <Crest teamId={f.homeTeamId} />
          <Crest teamId={f.awayTeamId} />
        </button>
        <button onClick={onOpen} style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
          <div className="h3" style={{ fontSize: 16 }}>
            {home.name} <span style={{ color: 'var(--ink-4)' }}>vs</span> {away.name}
          </div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            {isFav && <b style={{ color: favTeam?.color }}>내 팀 · </b>}
            {[league(f.leagueId).name, f.round == null ? null : `${f.round}R`]
              .filter(Boolean)
              .join(' ')}{' · '}
            {phase === 'FINISHED' ? (
              <b style={{ color: 'var(--ink-2)' }}>종료 {f.homeGoals} : {f.awayGoals}</b>
            ) : (
              [f.venue, kickoffLabel(f.kickoffAt)].filter(Boolean).join(' · ')
            )}
          </div>
        </button>
        <StatusChip phase={phase} hit={saved ? saved.pick === f.result : null} predicted={Boolean(saved) && !active} />
      </div>

      <div className="options" data-tour={index === 0 ? 'options' : undefined}>
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
              style={{ ['--i' as string]: i }}
              onClick={() => choose(o)}
            >
              {/* 여론이 아직 없으면 채움 막대도 없다 */}
              {showCrowd && f.baseline && (
                <span
                  className={`fill ${FILL_CLASS[o]}`}
                  style={{ width: `${Math.round(f.baseline[i] * 100)}%` }}
                />
              )}
              <span className="body">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {phase === 'FINISHED' && chosen && (
                    <span className={`tick ${hit ? 'win' : 'lose'}`}>
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
                {showCrowd && f.baseline && (
                  <span className="pctv" style={hit ? { color: 'var(--win)' } : undefined}>
                    {pct(f.baseline[i])}
                  </span>
                )}
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

/** 카드 오른쪽 위의 상태 뱃지. 예측 직후에는 톡 튀어나온다. */
function StatusChip({
  phase, hit, predicted,
}: { phase: ReturnType<typeof windowState>; hit: boolean | null; predicted: boolean }) {
  if (phase === 'FINISHED' && hit != null) {
    return hit ? (
      <span className="chip win pop" style={{ flexShrink: 0 }}>
        <IconCheck size={11} color="currentColor" strokeWidth={3} />
        적중
      </span>
    ) : (
      <span className="chip plain" style={{ flexShrink: 0 }}>
        <IconX size={10} color="currentColor" />
        실패
      </span>
    );
  }
  if (predicted) {
    return (
      <span className="chip solid pop" style={{ flexShrink: 0 }}>
        <IconCheck size={11} color="currentColor" strokeWidth={3} />
        예측함
      </span>
    );
  }
  if (phase === 'LOCKED') {
    return <span className="chip plain" style={{ flexShrink: 0 }}>마감</span>;
  }
  return null;
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
  // 기준선이 없으면 점수 폭을 미리 보여줄 수 없다 (서버가 마감 때 계산한다)
  const preview = f.baseline ? previewScore(f.baseline, pick, hover, state.streak) : null;

  return (
    <div className="confwrap" data-tour="confidence">
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
            onClick={() => {
              haptic(8);
              if (hover === c) onPick(c);
              else setHover(c);
            }}
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

      {preview ? (
        <div className="stake">
          <span className="tiny muted">맞히면</span>
          <span className="val" style={{ color: 'var(--win)' }}>
            {signed(preview.ifCorrect)}
          </span>
          <span className="tiny muted">틀리면</span>
          <span className="val" style={{ color: 'var(--ink-3)' }}>
            {signed(preview.ifWrong)}
          </span>
          <span style={{ marginLeft: 'auto' }} className="chip hot">
            <span className="flame"><IconFlame size={11} color="#fff" /></span>
            +{preview.pointsIfCorrect}점
          </span>
        </div>
      ) : (
        <p className="tiny muted" style={{ margin: '12px 0 0', lineHeight: 1.55 }}>
          아직 예측이 모이지 않아 점수 폭이 정해지지 않았어요. 마감 때 서버가 계산합니다.
        </p>
      )}

      <button className="cta" style={{ height: 48, marginTop: 12 }} onClick={() => onPick(hover)}>
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
          <span className="tiny muted" style={{ animation: 'breathe 1.6s ease-in-out infinite' }}>
            결과 확인 중이에요. 곧 정산돼요
          </span>
        </div>
      );
    }
    const won = result.deltaRating > 0;
    return (
      <div className="stake" style={{ marginTop: 12 }}>
        <span className="tiny muted">{CONFIDENCE_LABEL[saved.confidence]}</span>
        <span className="tiny muted">·</span>
        <span className="val" style={{ color: won ? 'var(--win)' : 'var(--ink-3)' }}>
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
            : f.participants == null || f.participants === 0
              ? '아직 아무도 예측하지 않았어요'
              : `${f.participants.toLocaleString('ko-KR')}명 예측 중`}
        </span>
        <span className="tiny muted" style={{ marginLeft: 'auto' }}>
          {phase === 'LOCKED'
            ? '결과를 기다려요'
            : f.participants === 0
              ? '첫 예측자가 되어보세요'
              : '보기를 누르면 확신도를 고를 수 있어요'}
        </span>
      </div>
    );
  }

  const preview = f.baseline
    ? previewScore(f.baseline, saved.pick, saved.confidence, state.streak)
    : null;
  return (
    <div className="stake" style={{ marginTop: 12 }}>
      <span className="tiny muted">{CONFIDENCE_LABEL[saved.confidence]}</span>
      {preview ? (
        <>
          <span className="tiny muted">·</span>
          <span className="tiny muted">
            맞히면 {signed(preview.ifCorrect)} / 틀리면 {signed(preview.ifWrong)}
          </span>
          <span style={{ marginLeft: 'auto' }} className="chip gold">
            +{preview.pointsIfCorrect}점
          </span>
        </>
      ) : (
        <span className="tiny muted" style={{ marginLeft: 'auto' }}>점수는 마감 때 정해져요</span>
      )}
    </div>
  );
}
