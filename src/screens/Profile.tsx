import { TierChip } from '../components/TierChip';
import { IconBolt, IconFlame, IconLock, IconTarget } from '../components/icons';
import { leagues as allLeagues, team } from '../data/catalog';
import { repository } from '../data';
import { useState } from 'react';
import { useCountUpInt } from '../lib/anim';
import { SELF_AUTH } from '../lib/env';
import { useAsync } from '../lib/useAsync';
import type { BadgeDef, MyStats } from '../data/types';
import { comma } from '../lib/format';
import { CONFIDENCE_LABEL, PLACEMENT_MATCHES } from '../lib/scoring';
import { useApp } from '../store';

/** 캘리브레이션 표본이 이보다 적으면 숫자를 보여주지 않는다. 오해를 부른다. */
const MIN_CALIBRATION_N = 5;
/** 팬심 편향은 최애 팀 경기가 이만큼 쌓여야 의미가 있다 (명세 5.4) */
const MIN_FAN_BIAS_N = 10;

export function Profile({ onReplayTutorial }: { onReplayTutorial?: () => void }) {
  const { state, level, tier } = useApp();
  const badges = useAsync<BadgeDef[]>(() => repository.loadBadges(), []);
  const stats = useAsync<MyStats | null>(() => repository.loadMyStats(), null);
  const leagues = allLeagues();
  const hasRecord = (stats?.settled ?? 0) > 0;
  const inPlacement = state.settledMatches < PLACEMENT_MATCHES;
  const accuracy = hasRecord ? stats!.hits / stats!.settled : null;
  const favTeams = state.favoriteTeamIds.map((id) => team(id));

  const accPct = useCountUpInt(Math.round((accuracy ?? 0) * 100), 1000);
  const settledN = useCountUpInt(stats?.settled ?? 0, 1000);
  const rating = useCountUpInt(state.rating, 1200);

  return (
    <div className="scroll screen">
      <div className="pad" style={{ paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 36 }}>
          <span className="h1" style={{ fontSize: 22 }}>내 기록</span>
          <span className="chip gold" style={{ fontSize: 11 }}>
            <IconBolt size={12} color="var(--gold-ink)" />
            {comma(state.balance)}점
          </span>
        </div>

        {/* 프로필 카드 — 앱에서 가장 자랑스러운 화면이어야 한다 */}
        <div className="card in" style={{ marginTop: 12, borderRadius: 26, padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              background: 'var(--grad-accent)', color: '#fff', padding: '18px 18px 20px',
              position: 'relative', overflow: 'hidden',
            }}
          >
            <div className="row">
              <span
                style={{
                  width: 54, height: 54, borderRadius: 999, background: 'rgba(255,255,255,.2)',
                  border: '2.5px solid rgba(255,255,255,.55)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontFamily: 'var(--display)', fontWeight: 900,
                  fontSize: 21, flexShrink: 0,
                }}
              >
                {state.handle.slice(0, 1)}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="h2" style={{ fontSize: 18 }}>{state.handle}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                  <span className="lvbadge" style={{ height: 22, minWidth: 24, fontSize: 11, background: 'rgba(255,255,255,.24)', boxShadow: 'none' }}>
                    Lv.{level.level}
                  </span>
                  <TierChip tier={tier} />
                </div>
              </div>
              <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <span className="num" style={{ display: 'block', fontSize: 26, lineHeight: 1 }}>{comma(rating)}</span>
                <span className="tiny" style={{ opacity: 0.8 }}>축잘알 지수</span>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 18 }}>
              {inPlacement ? (
                <>
                  <span className="small" style={{ opacity: 0.85 }}>아직</span>
                  <span className="num" style={{ fontSize: 32, lineHeight: 0.92 }}>배치 중</span>
                </>
              ) : state.topPercent == null ? (
                /* 배치는 끝났지만 아직 순위 발표 전. 없는 등수를 만들어 보여주지 않는다 */
                <>
                  <span className="small" style={{ opacity: 0.85 }}>다음 발표에</span>
                  <span className="num" style={{ fontSize: 30, lineHeight: 0.92 }}>순위 첫 등록</span>
                </>
              ) : (
                <>
                  <span className="small" style={{ opacity: 0.85 }}>전체 유저 중</span>
                  <span className="num" style={{ fontSize: 36, lineHeight: 0.92 }}>
                    상위 {state.topPercent}%
                  </span>
                </>
              )}
            </div>
          </div>

          <div style={{ padding: '14px 18px 16px' }}>
            <div className="track" style={{ marginTop: 0 }}>
              <i style={{ width: `${Math.round(level.progress * 100)}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9 }}>
              <span className="tiny muted">다음 레벨까지 {Math.max(0, level.need - level.into)}점</span>
              <span className="tiny" style={{ color: 'var(--ink-2)' }}>
                {inPlacement
                  ? `순위까지 ${PLACEMENT_MATCHES - state.settledMatches}경기`
                  : `Lv.${level.level + 1}까지 ${level.into}/${level.need}`}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
          <div className="stat in" style={{ ['--i' as string]: 1 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <IconTarget size={15} color="var(--accent)" />
              <span className="num grad" style={{ fontSize: 25 }}>
                {accuracy == null ? '—' : `${accPct}%`}
              </span>
            </span>
            <span className="tiny muted">적중률</span>
          </div>
          <div className="stat in" style={{ ['--i' as string]: 2 }}>
            <span className="num" style={{ fontSize: 25 }}>{settledN}</span>
            <span className="tiny muted">누적 예측</span>
          </div>
          <div
            className="stat in"
            style={{ ['--i' as string]: 3, background: 'var(--gold-soft)', boxShadow: '0 3px 0 0 var(--gold-shadow)' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span className={state.streak >= 3 ? 'flame' : undefined}>
                <IconFlame size={15} color="var(--gold-ink)" />
              </span>
              <span className="num grad gold" style={{ fontSize: 25 }}>{state.streak}</span>
            </span>
            <span className="tiny" style={{ color: 'var(--gold)' }}>연속 적중</span>
          </div>
        </div>

        <Section title="리그별 적중률">
          {!hasRecord ? (
            <Pending text="경기가 정산되면 리그별로 어디에 강한지 보여드려요." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {leagues.map((l, i) => {
                const row = stats!.byLeague.find((b) => b.leagueId === l.id);
                return (
                  <div key={l.id} className="row">
                    <span className="small muted" style={{ width: 60 }}>{l.short}</span>
                    <div className="bar">
                      <i style={{ width: `${(row?.accuracy ?? 0) * 100}%`, ['--i' as string]: i }} />
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
                {stats.calibration.map((c, i) => {
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
                            background: gap < -0.08 ? 'var(--ink-4)' : undefined,
                            ['--i' as string]: i,
                          }}
                        />
                      </div>
                      <span className="num" style={{ width: 40, textAlign: 'right', fontSize: 14 }}>
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
                style={{ boxShadow: 'none', border: '1.5px solid var(--line)', padding: '14px 16px' }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <span
                    className="num"
                    style={{ fontSize: 26, color: stats.fanBias.bias < 0 ? 'var(--cool)' : 'var(--win)' }}
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
                    className={`form-cell${!r ? '' : r.correct ? ' hit' : ' miss'}`}
                    style={{ ['--i' as string]: i }}
                  />
                );
              })}
            </div>
          )}
        </Section>

        <Section
          title="모은 뱃지"
          hint={badges.length ? `${badges.filter((b) => b.target != null && b.progress >= b.target).length}개 획득` : undefined}
        >
          {badges.length === 0 && <Pending text="아직 열린 뱃지가 없어요. 준비되면 여기에 생깁니다." />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {badges.slice(0, 8).map((b, i) => {
              const earned = b.target != null && b.progress >= b.target;
              const gold = b.tier === 'gold';
              return (
                <div key={b.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                  <div
                    className={`badge${earned ? ` earned${gold ? ' gold' : ''}` : ' locked'}`}
                    style={{
                      ['--i' as string]: i,
                      background: earned ? (gold ? 'var(--grad-gold)' : 'var(--grad-accent)') : undefined,
                    }}
                  >
                    {earned ? <IconBolt size={22} color="#fff" /> : <IconLock color="var(--ink-4)" />}
                  </div>
                  <span
                    className="tiny"
                    style={{ textAlign: 'center', color: earned ? 'var(--ink-2)' : 'var(--ink-4)', lineHeight: 1.3, fontWeight: earned ? 700 : 500 }}
                  >
                    {b.name}
                  </span>
                  {/* 목표치를 모르면 진행도를 지어내지 않는다 */}
                  {!earned && b.target != null && (
                    <span className="tiny" style={{ color: 'var(--ink-4)', fontSize: 10, marginTop: -4 }}>
                      {b.progress}/{b.target}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <ChatPolicy />

        {onReplayTutorial && (
          <button
            className="ghostcta"
            style={{ marginTop: 24, height: 48 }}
            onClick={onReplayTutorial}
          >
            예측 규칙 다시 보기
          </button>
        )}

        <AccountCard />

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

/**
 * 채팅 운영정책.
 *
 * 앱인토스는 "신고·차단·제재 정책·운영자 검토를 UI에 실제로 노출"할 것을 요구한다
 * (정책 13.2). 외부 링크는 금지되므로 약관 페이지로 보내지 않고 앱 안에 둔다.
 */
function ChatPolicy() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 24 }}>
      <button
        className="policyhead"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="h3" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 3, height: 13, borderRadius: 2, background: 'var(--grad-accent)' }} />
          채팅 운영정책
        </span>
        <span className="tiny muted">{open ? '접기' : '보기'}</span>
      </button>

      {open && (
        <div className="policybody">
          <p><b>이런 메시지는 보낼 수 없어요</b></p>
          <ul>
            <li>욕설 · 비하 · 차별 표현</li>
            <li>같은 내용 반복(도배)과 스팸</li>
            <li>홍보, 그리고 도박 사이트로 유도하는 내용</li>
            <li>선정적이거나 불쾌감을 주는 내용</li>
            <li>링크 — 초기에는 모든 링크를 자동으로 막습니다</li>
          </ul>

          <p><b>신고하면 이렇게 처리돼요</b></p>
          <ul>
            <li>메시지 오른쪽 <b>···</b> 를 눌러 사유와 함께 신고합니다</li>
            <li>신고가 <b>3건</b> 쌓이면 그 메시지는 자동으로 가려지고 운영자 검토로 넘어갑니다</li>
            <li>검토 결과에 따라 경고 → 채팅 제한 → 이용 정지 순으로 조치합니다</li>
          </ul>

          <p><b>직접 차단할 수도 있어요</b></p>
          <ul>
            <li>같은 <b>···</b> 메뉴에서 차단하면, 그 사람의 메시지는 더 이상 보이지 않습니다</li>
            <li>차단은 내 계정에만 적용되고 상대에게 알려지지 않습니다</li>
          </ul>
        </div>
      )}
    </div>
  );
}

/** 계정 칸. 지금 누구로 로그인돼 있는지 보여주고, 로그아웃할 수 있게 한다. */
function AccountCard() {
  const { authUser, signOut } = useApp();

  // 앱인토스 안에서 계정은 토스 계정이다. 관리할 것도, 보여줄 것도 없다.
  if (!authUser || !SELF_AUTH) return null;

  return (
    <div className="account">
      <div className="row" style={{ gap: 10 }}>
        <span className="avatar" style={{ width: 34, height: 34, background: 'var(--grad-accent)', color: '#fff' }}>
          {authUser.email?.slice(0, 1).toUpperCase() ?? '·'}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="h3" style={{ display: 'block', fontSize: 13 }}>로그인됨</span>
          <span
            className="tiny muted"
            style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {authUser.email ?? '토스 계정'}
          </span>
        </span>
        <button className="pill" onClick={() => void signOut()}>로그아웃</button>
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
        margin: 0, padding: '14px 16px', borderRadius: 14,
        border: '1.5px dashed var(--line-strong)', lineHeight: 1.6,
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
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="h3" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 3, height: 13, borderRadius: 2, background: 'var(--grad-accent)' }} />
          {title}
        </span>
        {hint && <span className="tiny muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
