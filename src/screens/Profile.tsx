import { IconBolt, IconFlame, IconLock, IconShield } from '../components/icons';
import { leagues as allLeagues, team } from '../data/catalog';
import { repository } from '../data';
import { useAsync } from '../lib/useAsync';
import type { BadgeDef, MyStats } from '../data/types';
import { comma } from '../lib/format';
import { CONFIDENCE_LABEL, PLACEMENT_MATCHES, TIER_LABEL } from '../lib/scoring';
import { useApp } from '../store';

/** 캘리브레이션 표본이 이보다 적으면 숫자를 보여주지 않는다. 오해를 부른다. */
const MIN_CALIBRATION_N = 5;
/** 팬심 편향은 최애 팀 경기가 이만큼 쌓여야 의미가 있다 (명세 5.4) */
const MIN_FAN_BIAS_N = 10;

export function Profile() {
  const { state, level, tier } = useApp();
  const badges = useAsync<BadgeDef[]>(() => repository.loadBadges(), []);
  const stats = useAsync<MyStats | null>(() => repository.loadMyStats(), null);
  const leagues = allLeagues();
  const hasRecord = (stats?.settled ?? 0) > 0;
  const inPlacement = state.settledMatches < PLACEMENT_MATCHES;
  const accuracy = hasRecord ? stats!.hits / stats!.settled : null;
  const favTeams = state.favoriteTeamIds.map((id) => team(id));

  return (
    <div className="scroll">
      <div className="pad" style={{ paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 34 }}>
          <span className="h2">내 기록</span>
          <span className="tiny muted">{comma(state.balance)}점 보유</span>
        </div>

        <div className="card" style={{ marginTop: 12, borderRadius: 22, padding: 18 }}>
          <div className="row">
            <span
              style={{
                width: 50, height: 50, borderRadius: 999, background: 'var(--accent-soft)',
                border: '2.5px solid var(--accent)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontFamily: 'var(--display)', fontWeight: 900,
                fontSize: 19, color: 'var(--accent-deep)',
              }}
            >
              {state.handle.slice(0, 1)}
            </span>
            <div>
              <div className="h2" style={{ fontSize: 17 }}>{state.handle}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <IconShield size={14} color="var(--accent)" />
                <span className="h3" style={{ fontSize: 13, color: 'var(--accent-deep)' }}>
                  Lv.{level.level} {TIER_LABEL[tier]}
                </span>
                <span className="tiny muted">지수 {comma(state.rating)}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 20 }}>
            {inPlacement ? (
              <>
                <span className="small muted">아직</span>
                <span className="num" style={{ fontSize: 34, color: 'var(--accent)', lineHeight: 0.92 }}>
                  배치 중
                </span>
              </>
            ) : (
              <>
                <span className="small muted">전체 유저 중</span>
                <span className="num" style={{ fontSize: 38, color: 'var(--accent)', lineHeight: 0.92 }}>
                  상위 {state.topPercent}%
                </span>
              </>
            )}
          </div>

          <div className="track" style={{ height: 8, marginTop: 18 }}>
            <i style={{ width: `${Math.round(level.progress * 100)}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9 }}>
            <span className="tiny muted">다음 레벨까지 {Math.max(0, level.need - level.into)}점</span>
            <span className="tiny" style={{ color: 'var(--ink-2)' }}>
              {inPlacement
                ? `순위까지 ${PLACEMENT_MATCHES - state.settledMatches}경기`
                : `${TIER_LABEL[tier]} 구간`}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
          <div className="stat">
            <span className="num" style={{ fontSize: 25 }}>
              {accuracy == null ? '—' : `${Math.round(accuracy * 100)}%`}
            </span>
            <span className="tiny muted">적중률</span>
          </div>
          <div className="stat">
            <span className="num" style={{ fontSize: 25 }}>{stats?.settled ?? 0}</span>
            <span className="tiny muted">누적 예측</span>
          </div>
          <div className="stat" style={{ background: 'var(--gold-soft)', boxShadow: '0 3px 0 0 var(--gold-shadow)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <IconFlame size={15} color="var(--gold-ink)" />
              <span className="num" style={{ fontSize: 25, color: 'var(--gold)' }}>{state.streak}</span>
            </span>
            <span className="tiny" style={{ color: 'var(--gold)' }}>연속 적중</span>
          </div>
        </div>

        <Section title="리그별 적중률">
          {!hasRecord ? (
            <Pending text="경기가 정산되면 리그별로 어디에 강한지 보여드려요." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {leagues.map((l) => {
                const row = stats!.byLeague.find((b) => b.leagueId === l.id);
                return (
                  <div key={l.id} className="row">
                    <span className="small muted" style={{ width: 60 }}>{l.short}</span>
                    <div className="bar">
                      <i style={{ width: `${(row?.accuracy ?? 0) * 100}%` }} />
                    </div>
                    <span className="num" style={{ width: 44, textAlign: 'right', fontSize: 14 }}>
                      {row ? `${Math.round(row.accuracy * 100)}%` : '—'}
                    </span>
                    <span className="tiny muted" style={{ width: 30, textAlign: 'right' }}>
                      {row ? `${row.n}건` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="확신도는 정확한가" hint="건 만큼 맞히고 있는지">
          {!stats ||
          stats.calibration.length === 0 ||
          stats.calibration.every((c) => c.n < MIN_CALIBRATION_N) ? (
            <Pending
              text={`확신도마다 ${MIN_CALIBRATION_N}건씩은 쌓여야 의미가 생겨요. 그때부터 확신을 부풀리고 있는지 알려드릴게요.`}
            />
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {stats.calibration.map((c) => {
                  const enough = c.n >= MIN_CALIBRATION_N;
                  const gap = c.actual - c.expected;
                  return (
                    <div key={c.confidence} className="row">
                      <span className="small" style={{ width: 84, fontWeight: 600 }}>
                        {CONFIDENCE_LABEL[c.confidence]}
                      </span>
                      <div className="bar">
                        <i
                          style={{
                            width: `${(enough ? c.actual : 0) * 100}%`,
                            background: gap < -0.08 ? 'var(--ink-4)' : 'var(--accent)',
                          }}
                        />
                      </div>
                      <span
                        className="num"
                        style={{ width: 40, textAlign: 'right', fontSize: 14 }}
                      >
                        {enough ? `${Math.round(c.actual * 100)}%` : '—'}
                      </span>
                      <span className="tiny muted" style={{ width: 62, textAlign: 'right' }}>
                        {enough ? `건 값 ${Math.round(c.expected * 100)}%` : `${c.n}건`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <CalibrationNote rows={stats.calibration} />
            </>
          )}
        </Section>

        {favTeams.length > 0 && (
          <Section title="팬심 편향" hint={favTeams.map((t) => t.name).join(' · ')}>
            {!stats?.fanBias || stats.fanBias.n < MIN_FAN_BIAS_N ? (
              <Pending
                text={`내 팀 경기가 ${MIN_FAN_BIAS_N}건 쌓이면, 팬심이 예측을 흐리는지 알려드려요.`}
              />
            ) : (
              <div
                className="card"
                style={{ boxShadow: 'none', border: '1px solid var(--line)', padding: '14px 16px' }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <span
                    className="num"
                    style={{ fontSize: 24, color: stats.fanBias.bias < 0 ? 'var(--accent)' : 'var(--ink)' }}
                  >
                    {stats.fanBias.bias > 0 ? `+${stats.fanBias.bias}` : `−${Math.abs(stats.fanBias.bias)}`}
                  </span>
                  <span className="tiny muted">경기당 평균 지수</span>
                </div>
                <p className="small muted" style={{ margin: '8px 0 0' }}>
                  {stats.fanBias.bias < 0
                    ? `내 팀 경기에서 평균 ${Math.abs(stats.fanBias.bias)}점을 손해 보고 있어요. 다른 경기에서는 잘 보시는데요.`
                    : '내 팀 경기에서 오히려 더 잘 맞히는 드문 유형이에요.'}
                </p>
              </div>
            )}
          </Section>
        )}

        <Section
          title="최근 10경기"
          hint={hasRecord ? `${stats!.recent.filter((r) => r.correct).length} 적중 · ${stats!.recent.filter((r) => !r.correct).length} 실패` : undefined}
        >
          {!hasRecord ? (
            <Pending text="첫 경기가 정산되면 여기에 쌓입니다." />
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: 10 }).map((_, i) => {
                const r = stats!.recent[i];
                return (
                  <div
                    key={i}
                    title={r ? `${r.delta > 0 ? '+' : ''}${r.delta}` : ''}
                    style={{
                      flex: 1, height: 28, borderRadius: 8,
                      background: !r ? 'var(--line-2)' : r.correct ? 'var(--accent)' : 'var(--line)',
                    }}
                  />
                );
              })}
            </div>
          )}
        </Section>

        <Section title="모은 뱃지" hint={`${badges.filter((b) => b.progress >= b.target).length}개 획득`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {badges.slice(0, 8).map((b) => {
              const earned = b.progress >= b.target;
              return (
                <div key={b.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: 44, height: 44, borderRadius: 999,
                      background: earned ? (b.tier === 'gold' ? 'var(--gold-soft)' : 'var(--accent-soft)') : 'var(--card-2)',
                      border: earned ? 'none' : '1.5px dashed var(--line-strong)',
                      boxShadow: earned ? `0 3px 0 0 ${b.tier === 'gold' ? 'var(--gold-shadow)' : 'var(--accent-line)'}` : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {earned ? (
                      <IconBolt size={20} color={b.tier === 'gold' ? 'var(--gold-ink)' : 'var(--accent)'} />
                    ) : (
                      <IconLock color="var(--ink-4)" />
                    )}
                  </div>
                  <span className="tiny" style={{ textAlign: 'center', color: earned ? 'var(--ink-2)' : 'var(--ink-4)', lineHeight: 1.3 }}>
                    {b.name}
                  </span>
                  {!earned && (
                    <span className="tiny" style={{ color: 'var(--ink-4)', fontSize: 10 }}>
                      {b.progress}/{b.target}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

/** 아직 데이터가 없는 구간. 가짜 숫자 대신 무엇을 기다리는지 말한다. */
function Pending({ text }: { text: string }) {
  return (
    <p
      className="small muted"
      style={{
        margin: 0, padding: '14px 16px', borderRadius: 12,
        border: '1px dashed var(--line-strong)', lineHeight: 1.6,
      }}
    >
      {text}
    </p>
  );
}

/** 가장 크게 어긋난 확신도 한 줄만 짚어준다. 세 줄 다 설명하면 아무도 안 읽는다. */
function CalibrationNote({ rows }: { rows: MyStats['calibration'] }) {
  const worst = rows
    .filter((r) => r.n >= MIN_CALIBRATION_N)
    .sort((a, b) => a.actual - a.expected - (b.actual - b.expected))[0];
  if (!worst) return null;

  const gap = Math.round((worst.actual - worst.expected) * 100);
  if (gap >= -8) {
    return (
      <p className="tiny muted" style={{ margin: '11px 0 0' }}>
        확신한 만큼 맞히고 있어요. 이게 진짜 축잘알의 조건입니다.
      </p>
    );
  }
  return (
    <p className="tiny muted" style={{ margin: '11px 0 0' }}>
      &lsquo;{CONFIDENCE_LABEL[worst.confidence]}&rsquo;에서 실제 적중률이 건 값보다 {Math.abs(gap)}%p 낮아요.
      확신을 조금 아껴 쓰면 지수가 올라갑니다.
    </p>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="h3">{title}</span>
        {hint && <span className="tiny muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
