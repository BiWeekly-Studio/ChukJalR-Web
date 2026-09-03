import { useEffect, useRef, useState } from 'react';
import { Crest } from '../components/Crest';
import { LeagueMark } from '../components/LeagueMark';
import { MessageActions } from '../components/MessageActions';
import { EventTimeline, HeadToHeadCard, Lineups, MatchStatsCard } from '../components/MatchInfo';
import { IconBack, IconCheck, IconSend, IconUsers, IconX } from '../components/icons';
import { fixture, league, team } from '../data/catalog';
import { repository } from '../data';
import type { ChatMessage, MatchDetailData, MatchEvent } from '../data/types';
import { haptic } from '../lib/anim';
import { comma, kickoffLabel, pct, signed } from '../lib/format';
import { crowdLevel } from '../lib/baseline';
import { chatOpensLabel, chatState } from '../lib/window';
import { CONFIDENCE_LABEL, OUTCOMES, previewScore } from '../lib/scoring';
import { useApp } from '../store';

/** 홈 · 무 · 원정. 키 컬러와 반대편 색을 써서 한눈에 갈린다. */
const SEG_COLOR = [
  'linear-gradient(90deg, #3a63ff, #7b46f0)',
  'var(--line-strong)',
  'linear-gradient(90deg, #ff7a4a, #d1492a)',
];
const DOT_COLOR = ['var(--accent)', 'var(--line-strong)', 'var(--cool)'];

export function MatchDetail({ fixtureId, onBack }: { fixtureId: number; onBack: () => void }) {
  const { state, authUser } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewers, setViewers] = useState(0);
  const [draft, setDraft] = useState('');
  // 신고·차단은 서버에 남지만, 지금 화면에서도 즉시 치워야 조치된 느낌이 든다
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  // 수집한 곁들이 정보. 없으면 그 자리를 아예 그리지 않는다.
  const [info, setInfo] = useState<MatchDetailData>({
    events: [], lineups: [], h2h: null, stats: [],
  });
  // 진행 중 점수는 브로드캐스트로 들어온다. 카탈로그의 값보다 이쪽이 최신이다.
  const [live, setLive] = useState<{ home: number | null; away: number | null; elapsed: number | null } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /**
   * 채팅이 열려 있으면 채팅부터 보여준다.
   *
   * 경기 기록·팀 기록·선발 명단·맞대결이 붙으면서 한 줄로 쌓으면 채팅에 닿는 데
   * 카드 네 장을 지나쳐야 한다. 라이브에서 채팅은 곁들이가 아니라 본 화면이다.
   */
  const [tab, setTab] = useState<'chat' | 'info'>('info');
  // 채팅 창 상태는 화면이 뜬 뒤에 정해지므로(경기 정보가 와야 안다) 한 번만 맞춰준다
  const tabDecided = useRef(false);

  // 기존 메시지를 불러오고 Realtime Broadcast 를 구독한다 (명세 14.4).
  // 목업 구현에서는 가짜 메시지가 주기적으로 들어온다.
  useEffect(() => {
    let cancelled = false;
    repository
      .loadChat(fixtureId)
      .then((m) => {
        if (!cancelled) setMessages(m);
      })
      .catch(() => {
        /* 채팅을 못 불러와도 경기 정보는 보여야 한다 */
      });

    repository
      .loadMatchDetail(fixtureId)
      .then((d) => {
        if (!cancelled) setInfo(d);
      })
      .catch(() => {
        /* 곁들이 정보가 없어도 예측과 채팅은 되어야 한다 */
      });

    const unsubscribe = repository.subscribeChat(
      fixtureId,
      (m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])),
      setViewers,
      (l) => setLive({ home: l.home, away: l.away, elapsed: l.elapsed }),
      (e: MatchEvent) =>
        setInfo((prev) =>
          prev.events.some((x) => x.seq === e.seq)
            ? prev
            : { ...prev, events: [...prev.events, e].sort((x, y) => x.seq - y.seq) }
        )
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [fixtureId]);

  useEffect(() => {
    if (tab !== 'chat') return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, tab]);

  const f = fixture(fixtureId);
  if (!f) return null;

  const home = team(f.homeTeamId);
  const away = team(f.awayTeamId);
  const saved = state.predictions[fixtureId];
  const chat = chatState(f);
  const finished = f.state === 'FINISHED' && Boolean(f.result);
  // 진행 중: 킥오프는 했는데 아직 안 끝난 상태. 브로드캐스트로 받은 값이 있으면 그게 최신이다.
  const liveHome = live?.home ?? f.liveHome;
  const liveAway = live?.away ?? f.liveAway;
  const elapsed = live?.elapsed ?? f.elapsed;
  const inPlay = !finished && liveHome != null && liveAway != null;
  // 서버는 예측이 없어도 prior 로 기준선을 준다. 그건 여론이 아니므로 따로 가른다.
  const crowd = crowdLevel(f.participants);
  const showCrowd = f.baseline != null && crowd !== 'none';

  function send() {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    haptic(10);

    // 서버 구현에서는 Broadcast 로 되돌아오므로 여기서 붙이지 않는다 (중복 방지).
    if (repository.kind === 'mock') {
      setMessages((prev) => [
        ...prev,
        {
          id: `me-${Date.now()}`, fixtureId, userId: authUser?.id ?? null, handle: state.handle,
          initial: state.handle.slice(0, 1), topPercent: state.topPercent,
          tier: 'MASTER', body, at: nowLabel(), mine: true,
        },
      ]);
    }

    repository.sendChat(fixtureId, body).catch((err) => {
      // 필터에 걸렸으면 왜 막혔는지 알려줘야 한다. 조용히 사라지면 버그로 보인다.
      setNotice(err instanceof Error ? err.message : '메시지를 보내지 못했어요.');
    });
  }

  if (!tabDecided.current) {
    tabDecided.current = true;
    if (chat === 'OPEN') setTab('chat');
  }

  const preview =
    saved && f.baseline ? previewScore(f.baseline, saved.pick, saved.confidence, state.streak) : null;

  // 신고했거나 차단한 사람의 메시지는 즉시 뺀다
  const visible = messages.filter(
    (m) => !hidden.has(m.id) && !(m.userId && blocked.has(m.userId))
  );
  const pickLabel = saved
    ? saved.pick === 'HOME' ? `${home.name} 승` : saved.pick === 'AWAY' ? `${away.name} 승` : '무승부'
    : null;

  return (
    <div className="sheet">
      <div className="appbar" style={{ paddingTop: 'calc(var(--safe-top) + 14px)' }}>
        <button className="backbtn" onClick={onBack} aria-label="뒤로">
          <IconBack />
        </button>
        <span className="h3" style={{ fontSize: 15 }}>
          {home.name} vs {away.name}
        </span>
        <span style={{ width: 40 }} />
      </div>

      {/* 위쪽은 고정 — 어느 탭에서도 점수와 내 예측은 보여야 한다 */}
      <div className="pad" style={{ paddingTop: 10, paddingBottom: 0 }}>
          {/* 대진 배너 — 경기 상세의 얼굴 */}
          <div className="versus in">
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <LeagueMark leagueId={f.leagueId} size={16} />
                <span className="tiny" style={{ color: 'var(--accent-deep)', fontWeight: 600 }}>
                  {[league(f.leagueId).name, f.round == null ? null : `${f.round}R`]
                    .filter(Boolean)
                    .join(' ')}
                </span>
              </span>
              {f.venue && <span className="tiny muted">{f.venue}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 16, position: 'relative' }}>
              <Side teamId={f.homeTeamId} name={home.name} />
              <div style={{ textAlign: 'center', padding: '0 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                {inPlay ? (
                  <span className="livepill"><i />LIVE</span>
                ) : (
                  <span className="vs-badge">{finished ? 'FT' : 'VS'}</span>
                )}
                <div className="num" style={{ fontSize: finished || inPlay ? 28 : 22, lineHeight: 1 }}>
                  {finished
                    ? `${f.homeGoals} : ${f.awayGoals}`
                    : inPlay
                      ? `${liveHome} : ${liveAway}`
                      : kickoffLabel(f.kickoffAt)}
                </div>
                <div className="tiny muted">
                  {finished ? '경기 종료' : inPlay ? (elapsed != null ? `${elapsed}분 진행` : '진행 중') : '킥오프'}
                </div>
              </div>
              <Side teamId={f.awayTeamId} name={away.name} />
            </div>
          </div>
          {saved && finished && state.settlements[fixtureId] && (
            <ResultBanner
              label={pickLabel ?? ''}
              won={state.settlements[fixtureId].deltaRating > 0}
              delta={state.settlements[fixtureId].deltaRating}
              points={state.settlements[fixtureId].points}
            />
          )}

          {saved && !finished && preview && (
            <div
              className="in"
              style={{
                marginTop: 12, minHeight: 54, borderRadius: 16, background: 'var(--grad-accent)',
                display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
                boxShadow: 'var(--glow-accent)', color: '#fff', ['--i' as string]: 2,
              }}
            >
              <span className="tick" style={{ background: 'rgba(255,255,255,.26)' }}><IconCheck /></span>
              <span className="h3">내 예측 · {pickLabel}</span>
              <span className="tiny" style={{ marginLeft: 'auto', opacity: 0.9 }}>
                {CONFIDENCE_LABEL[saved.confidence]} · {signed(preview.ifCorrect)}
              </span>
            </div>
          )}
      </div>

      <div className="tabs" role="tablist">
        {(['chat', 'info'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'on' : undefined}
            onClick={() => {
              haptic(9);
              setTab(key);
            }}
          >
            {key === 'chat' ? '채팅' : '정보'}
            {key === 'chat' && chat === 'OPEN' && <i className="tabdot" />}
          </button>
        ))}
      </div>

      {tab === 'chat' ? (
        <div ref={listRef} className="scroll" style={{ paddingTop: 0 }}>
        <div className="pad" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '20px 20px 12px' }}>
          <span
            className={chat === 'OPEN' ? 'live-dot' : undefined}
            style={{
              width: 8, height: 8, borderRadius: 999,
              background: chat === 'OPEN' ? 'var(--accent)' : 'var(--line-strong)',
            }}
          />
          <span className="h3">경기 채팅</span>
          {chat === 'OPEN' && (
            <span className="chip solid" style={{ fontSize: 10, height: 20 }}>LIVE</span>
          )}
          <span className="tiny muted">
            {chat === 'BEFORE'
              ? `${chatOpensLabel(f)}에 열려요`
              : chat === 'CLOSED'
                ? '채팅이 끝났어요'
                : viewers > 1
                  ? `${viewers}명이 함께 보고 있어요`
                  : '지금은 혼자 보고 있어요'}
          </span>
        </div>

        {chat !== 'BEFORE' && (
          <p className="chatrule">
            욕설·도배·홍보는 신고할 수 있어요. 신고 3건이 쌓이면 자동으로 가려지고 운영자가 확인합니다.
          </p>
        )}

        {chat === 'BEFORE' ? (
          <p
            className="small muted"
            style={{ textAlign: 'center', padding: '28px 32px 20px', lineHeight: 1.6 }}
          >
            경기 시작 1시간 전에 채팅이 열려요.
            <br />
            그때 같이 보면서 이야기해요.
          </p>
        ) : messages.length === 0 ? (
          <p className="small muted" style={{ textAlign: 'center', padding: '28px 32px 20px' }}>
            {chat === 'CLOSED' ? '오간 이야기가 없어요.' : '아직 아무도 말이 없어요. 먼저 열어보세요.'}
          </p>
        ) : null}

        <div className="msgs">
          {chat !== 'BEFORE' && visible.map((m) => (
            <div key={m.id} className={`msg${m.mine ? ' mine' : ''}`}>
              {!m.mine && <span className="avatar">{m.initial}</span>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!m.mine && <span className="tiny" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>{m.handle}</span>}
                  {/* 등급을 모르는 메시지(지난 기록)에는 뱃지를 붙이지 않는다 */}
                  {!m.mine && m.topPercent != null && (
                    <span
                      className={`chip ${m.topPercent <= 5 ? 'solid' : 'plain'}`}
                      style={{ height: 17, fontSize: 9.5, paddingInline: 7 }}
                    >
                      상위 {m.topPercent}%
                    </span>
                  )}
                  <span className="tiny" style={{ color: 'var(--ink-4)' }}>{m.at}</span>
                  {!m.mine && (
                    <MessageActions
                      message={m}
                      onHide={() => {
                        setHidden((prev) => new Set(prev).add(m.id));
                        setNotice('신고했어요. 운영자가 확인합니다.');
                      }}
                      onBlock={(id) => {
                        setBlocked((prev) => new Set(prev).add(id));
                        setNotice('차단했어요. 이 사람의 메시지는 보이지 않아요.');
                      }}
                      onError={setNotice}
                    />
                  )}
                </div>
                <div className="bubble">{m.body}</div>
              </div>
            </div>
          ))}
        </div>
        </div>
      ) : (
        <div className="scroll" style={{ paddingTop: 0 }}>
          <div className="pad" style={{ paddingTop: 12 }}>
          {showCrowd && f.baseline ? (
            <div className="card in" style={{ marginTop: 12, borderRadius: 20, padding: '14px 16px 16px', ['--i' as string]: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="h3">
                  {crowd === 'solid' ? '다른 사람들은 이렇게 봤어요' : '지금까지의 예상 확률'}
                </span>
                {f.participants != null && (
                  <span className="chip plain" style={{ fontSize: 10.5 }}>
                    <IconUsers size={11} color="currentColor" />
                    {comma(f.participants)}명
                  </span>
                )}
              </div>
              <div className="distbar" style={{ marginTop: 12 }}>
                {f.baseline.map((v, i) => (
                  <i key={i} style={{ flex: v, background: SEG_COLOR[i], ['--i' as string]: i }} />
                ))}
              </div>
              {crowd === 'thin' && (
                <p className="tiny muted" style={{ margin: '10px 0 0', lineHeight: 1.55 }}>
                  아직 예측이 {f.participants}명뿐이라, 이 확률은 대부분 기본 예상치예요.
                  사람이 모일수록 실제 판단 쪽으로 옮겨갑니다.
                </p>
              )}
              <div style={{ display: 'flex', marginTop: 11 }}>
                {OUTCOMES.map((o, i) => (
                  <div
                    key={o}
                    style={{
                      flex: i === 1 ? '0 0 auto' : 1, display: 'flex', alignItems: 'center', gap: 6,
                      justifyContent: i === 2 ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: DOT_COLOR[i] }} />
                    <span className="tiny muted">{o === 'HOME' ? home.name : o === 'AWAY' ? away.name : '무'}</span>
                    <span className="num" style={{ fontSize: 14 }}>{pct(f.baseline![i])}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* 여론이 없으면 분포를 그리지 않는다 — 빈 자리를 그럴듯한 숫자로 채우면 그게 가짜다 */
            <div
              className="card in"
              style={{ marginTop: 12, borderRadius: 20, padding: '18px 16px', textAlign: 'center', ['--i' as string]: 1 }}
            >
              <p className="h3" style={{ fontSize: 13, marginBottom: 6 }}>아직 아무도 예측하지 않았어요</p>
              <p className="tiny muted" style={{ margin: 0, lineHeight: 1.6 }}>
                예측이 모이면 사람들이 어느 쪽을 봤는지 여기에 나와요.
              </p>
            </div>
          )}
          <EventTimeline events={info.events} homeTeamId={f.homeTeamId} />
          {info.stats.length > 0 && (
            <MatchStatsCard stats={info.stats} homeTeamId={f.homeTeamId} />
          )}
          <Lineups lineups={info.lineups} homeTeamId={f.homeTeamId} />
          {info.h2h && (
            <HeadToHeadCard h2h={info.h2h} homeTeamId={f.homeTeamId} awayTeamId={f.awayTeamId} />
          )}
          </div>
        </div>
      )}

      {notice && (
        <div className="toast" role="status" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}

      {chat === 'OPEN' && (
        <div className="composer">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="이 경기 어떻게 보세요?"
            maxLength={300}
            aria-label="메시지 입력"
          />
          <button className="send" onClick={send} disabled={!draft.trim()} aria-label="보내기">
            <IconSend />
          </button>
        </div>
      )}
    </div>
  );
}

function Side({ teamId, name }: { teamId: number; name: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, minWidth: 0 }}>
      <Crest teamId={teamId} size={50} />
      <span className="small" style={{ fontWeight: 700, textAlign: 'center' }}>{name}</span>
    </div>
  );
}

/** 정산이 끝난 경기의 내 결과 */
function ResultBanner({
  label, won, delta, points,
}: { label: string; won: boolean; delta: number; points: number }) {
  return (
    <div
      className="in"
      style={{
        marginTop: 12, minHeight: 54, borderRadius: 16,
        background: won ? 'linear-gradient(135deg, #22c97e, #0b8f57)' : 'var(--card-2)',
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
        boxShadow: won ? '0 8px 22px -10px rgba(15,169,104,.8)' : '0 3px 0 0 var(--line)',
        color: won ? '#fff' : 'var(--ink-2)', ['--i' as string]: 2,
      }}
    >
      <span className={`tick ${won ? '' : 'lose'}`} style={won ? { background: 'rgba(255,255,255,.28)' } : undefined}>
        {won ? <IconCheck /> : <IconX size={11} color="#fff" />}
      </span>
      <span className="h3">{won ? '적중' : '실패'} · {label}</span>
      <span className="tiny" style={{ marginLeft: 'auto', opacity: won ? 0.92 : 1 }}>
        지수 {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`} · +{points}점
      </span>
    </div>
  );
}

function nowLabel(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
