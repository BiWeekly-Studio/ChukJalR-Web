import { useState } from 'react';
import { repository } from '../data';
import type { ChatMessage, ReportReason } from '../data/types';
import { haptic } from '../lib/anim';

/**
 * 메시지 신고·차단.
 *
 * 앱인토스는 신고·차단·제재 정책을 "UI에 실제로 노출"할 것을 요구한다 (정책 13.2).
 * 그래서 정책 문서로 미루지 않고 메시지마다 손 닿는 곳에 둔다.
 *
 * 판정과 필터링은 서버가 한다 (명세 10장). 여기서는 접수하고, 그 결과를
 * 지금 화면에서 바로 치워 주는 것까지만 한다 — 신고해 놓고 그 글이 계속 보이면
 * 아무 일도 안 일어난 것처럼 느껴진다.
 */
const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'ABUSE', label: '욕설 · 비하' },
  { id: 'SPAM', label: '도배 · 스팸' },
  { id: 'ADVERT', label: '홍보 · 도박 유도' },
  { id: 'SEXUAL', label: '선정적인 내용' },
  { id: 'OTHER', label: '기타' },
];

export function MessageActions({
  message,
  onHide,
  onBlock,
  onError,
}: {
  message: ChatMessage;
  /** 이 메시지만 화면에서 치운다 */
  onHide: () => void;
  /** 이 사람의 메시지를 전부 치운다 */
  onBlock: (userId: string) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setPicking(false);
  }

  async function report(reason: ReportReason) {
    setBusy(true);
    try {
      await repository.reportMessage(message.id, reason);
      haptic(12);
      close();
      onHide();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function block() {
    if (!message.userId) return;
    setBusy(true);
    try {
      await repository.blockUser(message.userId);
      haptic(12);
      close();
      onBlock(message.userId);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="msgmore"
        aria-label={`${message.handle}님의 메시지 신고하거나 차단하기`}
        onClick={() => setOpen(true)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {open && (
        <div className="sheetwrap" onClick={close} role="dialog" aria-label="메시지 관리">
          <div className="sheetcard" onClick={(e) => e.stopPropagation()}>
            {!picking ? (
              <>
                <p className="sheettitle">
                  <b>{message.handle}</b>님의 메시지
                </p>
                <button className="sheetbtn" disabled={busy} onClick={() => setPicking(true)}>
                  신고하기
                </button>
                <button className="sheetbtn danger" disabled={busy || !message.userId} onClick={block}>
                  이 사용자 차단하기
                </button>
                <p className="tiny muted" style={{ margin: '10px 4px 0', lineHeight: 1.55 }}>
                  차단하면 이 사람의 메시지가 더 이상 보이지 않아요.
                  신고가 3건 쌓이면 자동으로 가려지고 운영자가 확인합니다.
                </p>
                <button className="sheetbtn plain" onClick={close}>닫기</button>
              </>
            ) : (
              <>
                <p className="sheettitle">신고 사유를 골라주세요</p>
                {REASONS.map((r) => (
                  <button key={r.id} className="sheetbtn" disabled={busy} onClick={() => report(r.id)}>
                    {r.label}
                  </button>
                ))}
                <button className="sheetbtn plain" onClick={() => setPicking(false)}>뒤로</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
