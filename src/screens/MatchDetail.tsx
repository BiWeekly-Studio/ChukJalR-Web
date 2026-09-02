import { useEffect, useRef, useState } from 'react';
import { Crest } from '../components/Crest';
import { LeagueMark } from '../components/LeagueMark';
import { IconBack, IconCheck, IconSend, IconX } from '../components/icons';
import { fixture, league, team } from '../data/catalog';
import { repository } from '../data';
import type { ChatMessage } from '../data/types';
import { comma, kickoffLabel, pct, signed } from '../lib/format';
import { chatOpensLabel, chatState } from '../lib/window';
import { CONFIDENCE_LABEL, OUTCOMES, previewScore } from '../lib/scoring';
import { useApp } from '../store';

const SEG_COLOR = ['var(--accent)', 'var(--line-strong)', 'var(--cool)'];

export function MatchDetail({ fixtureId, onBack }: { fixtureId: number; onBack: () => void }) {
  const { state } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewers, setViewers] = useState(0);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

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

    const unsubscribe = repository.subscribeChat(
      fixtureId,
      (m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])),
      setViewers
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [fixtureId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const f = fixture(fixtureId);
  if (!f) return null;

  const home = team(f.homeTeamId);
  const away = team(f.awayTeamId);
  const saved = state.predictions[fixtureId];
  const chat = chatState(f);

  function send() {
    const body = draft.trim();
    if (!body) return;
    setDraft('');

    // 서버 구현에서는 Broadcast 로 되돌아오므로 여기서 붙이지 않는다 (중복 방지).
    if (repository.kind === 'mock') {
      setMessages((prev) => [
        ...prev,
        {
          id: `me-${Date.now()}`, fixtureId, handle: state.handle,
          initial: state.handle.slice(0, 1), topPercent: state.topPercent,
          tier: 'MASTER', body, at: nowLabel(), mine: true,
        },
      ]);
    }

    repository.sendChat(fixtureId, body).catch(() => {
      /* 레이트 리밋 등은 조용히 무시한다 — 재전송은 유저가 한다 */
    });
  }

  const preview = saved ? previewScore(f.baseline, saved.pick, saved.confidence, state.streak) : null;
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

      <div ref={listRef} className="scroll" style={{ paddingTop: 0 }}>
        <div className="pad" style={{ paddingTop: 10 }}>
          <div className="card" style={{ borderRadius: 22, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <LeagueMark leagueId={f.leagueId} size={16} />
                <span className="tiny" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                  {league(f.leagueId).name} {f.round}R
                </span>
              </span>
              <span className="tiny muted">{f.venue}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 14 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Crest teamId={f.homeTeamId} size={46} />
                <span className="small" style={{ fontWeight: 600 }}>{home.name}</span>
              </div>
              <div style={{ textAlign: 'center', padding: '0 4px' }}>
                <div className="num" style={{ fontSize: 26, lineHeight: 1 }}>
                  {f.state === 'FINISHED' && f.result
                    ? `${f.homeGoals} : ${f.awayGoals}`
                    : kickoffLabel(f.kickoffAt)}
                </div>
                <div className="tiny muted" style={{ marginTop: 3 }}>
                  {f.state === 'FINISHED' && f.result ? '경기 종료' : '킥오프'}
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Crest teamId={f.awayTeamId} size={46} />
                <span className="small" style={{ fontWeight: 600 }}>{away.name}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12, borderRadius: 20, padding: '14px 16px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="h3">다른 사람들은 이렇게 봤어요</span>
              <span className="tiny muted">{comma(f.participants)}명</span>
            </div>
            <div style={{ display: 'flex', gap: 3, height: 11, marginTop: 12 }}>
              {f.baseline.map((v, i) => (
                <div
                  key={i}
                  style={{
                    flex: v, background: SEG_COLOR[i],
                    borderRadius: i === 0 ? '999px 0 0 999px' : i === 2 ? '0 999px 999px 0' : 0,
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', marginTop: 11 }}>
              {OUTCOMES.map((o, i) => (
                <div
                  key={o}
                  style={{
                    flex: i === 1 ? '0 0 auto' : 1, display: 'flex', alignItems: 'center', gap: 6,
                    justifyContent: i === 2 ? 'flex-end' : 'flex-start',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: SEG_COLOR[i] }} />
                  <span className="tiny muted">{o === 'HOME' ? home.name : o === 'AWAY' ? away.name : '무'}</span>
                  <span className="num" style={{ fontSize: 14 }}>{pct(f.baseline[i])}</span>
                </div>
              ))}
            </div>
          </div>

          {saved && f.state === 'FINISHED' && state.settlements[fixtureId] && (
            <ResultBanner
              label={pickLabel ?? ''}
              won={state.settlements[fixtureId].deltaRating > 0}
              delta={state.settlements[fixtureId].deltaRating}
              points={state.settlements[fixtureId].points}
            />
          )}

          {saved && f.state !== 'FINISHED' && preview && (
            <div
              style={{
                marginTop: 12, height: 50, borderRadius: 14, background: 'var(--accent-soft)',
                display: 'flex', alignItems: 'center', gap: 9, padding: '0 13px',
                boxShadow: '0 3px 0 0 var(--accent-line)',
              }}
            >
              <span className="tick"><IconCheck /></span>
              <span className="h3" style={{ color: 'var(--accent-deep)' }}>내 예측 · {pickLabel}</span>
              <span className="tiny" style={{ color: 'var(--accent-deep)', marginLeft: 'auto' }}>
                {CONFIDENCE_LABEL[saved.confidence]} · {signed(preview.ifCorrect)}
              </span>
            </div>
          )}
        </div>

        <div className="pad" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 20px 12px' }}>
          <span
            className={chat === 'OPEN' ? 'live-dot' : undefined}
            style={{
              width: 7, height: 7, borderRadius: 999,
              background: chat === 'OPEN' ? 'var(--accent)' : 'var(--line-strong)',
            }}
          />
          <span className="h3">경기 채팅</span>
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
          {messages.map((m) => (
            <div key={m.id} className={`msg${m.mine ? ' mine' : ''}`}>
              {!m.mine && <span className="avatar">{m.initial}</span>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!m.mine && <span className="tiny" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{m.handle}</span>}
                  {!m.mine && (
                    <span
                      className="tiny"
                      style={{
                        fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                        background: m.topPercent <= 5 ? 'var(--accent-soft)' : 'var(--card-2)',
                        color: m.topPercent <= 5 ? 'var(--accent-deep)' : 'var(--ink-2)',
                      }}
                    >
                      상위 {m.topPercent}%
                    </span>
                  )}
                  <span className="tiny" style={{ color: 'var(--ink-4)' }}>{m.at}</span>
                </div>
                <div className="bubble">{m.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

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

/** 정산이 끝난 경기의 내 결과 */
function ResultBanner({
  label, won, delta, points,
}: { label: string; won: boolean; delta: number; points: number }) {
  return (
    <div
      style={{
        marginTop: 12, height: 50, borderRadius: 14,
        background: won ? 'var(--accent-soft)' : 'var(--card-2)',
        display: 'flex', alignItems: 'center', gap: 9, padding: '0 13px',
        boxShadow: `0 3px 0 0 ${won ? 'var(--accent-line)' : 'var(--line)'}`,
      }}
    >
      <span className="tick" style={won ? undefined : { background: 'var(--ink-4)' }}>
        {won ? <IconCheck /> : <IconX size={11} color="#fff" />}
      </span>
      <span className="h3" style={{ color: won ? 'var(--accent-deep)' : 'var(--ink-2)' }}>
        {won ? '적중' : '실패'} · {label}
      </span>
      <span
        className="tiny"
        style={{ marginLeft: 'auto', color: won ? 'var(--accent-deep)' : 'var(--ink-2)' }}
      >
        지수 {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`} · +{points}점
      </span>
    </div>
  );
}

function nowLabel(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
