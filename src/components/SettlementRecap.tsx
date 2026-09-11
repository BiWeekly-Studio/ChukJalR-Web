import { useEffect, useRef, useState } from 'react';
import { repository } from '../data';
import { recapPick, recapTotals, type Recap } from '../lib/settlementRecap';
import { useApp } from '../store';

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

export function SettlementRecap({ blocked, onOpenChange }: { blocked: boolean; onOpenChange: (open: boolean) => void }) {
  const { dispatch } = useApp();
  const [recap, setRecap] = useState<Recap>({ items: [], remaining: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const current = useRef(recap);
  const alive = useRef(false);
  const confirm = useRef<HTMLButtonElement>(null);
  const visible = !blocked && recap.items.length > 0;

  useEffect(() => {
    alive.current = true;
    let loading = false;
    const refresh = async () => {
      if (document.visibilityState === 'hidden' || loading || current.current.items.length) return;
      loading = true;
      try {
        const value = await repository.loadSettlementRecap();
        if (!alive.current) return;
        current.current = value; setRecap(value);
        if (value.items.length) {
          const snapshot = await repository.loadMe();
          if (alive.current) dispatch({ type: 'me', snapshot });
        }
      } catch { /* 확인하지 않은 결과는 서버에 남기고 다음 진입 때 다시 조회한다. */ }
      finally { loading = false; }
    };
    void refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => { alive.current = false; document.removeEventListener('visibilitychange', refresh); };
  }, [dispatch]);

  useEffect(() => {
    onOpenChange(visible);
    if (visible) confirm.current?.focus();
    return () => onOpenChange(false);
  }, [visible, onOpenChange]);

  async function acknowledge() {
    if (saving) return;
    setSaving(true); setError('');
    try {
      await repository.acknowledgeSettlementRecap(recap.items.map(r => r.id));
      if (!alive.current) return;
      current.current = { items: [], remaining: 0 }; setRecap(current.current);
      const next = await repository.loadSettlementRecap();
      if (alive.current) { current.current = next; setRecap(next); }
    } catch { if (alive.current) setError('확인 내용을 저장하지 못했어요. 다시 눌러 주세요.'); }
    finally { if (alive.current) setSaving(false); }
  }

  if (!visible) return null;
  const totals = recapTotals(recap.items);
  return <div className="recap-backdrop">
    <section className="recap-dialog" role="dialog" aria-modal="true" aria-labelledby="recap-title"
      onKeyDown={event => { if (event.key === 'Tab') { event.preventDefault(); confirm.current?.focus(); } }}>
      <h2 id="recap-title">예측 결과가 도착했어요</h2>
      <p className="small muted">맞힌 경기 {totals.correct} · 틀린 경기 {recap.items.length - totals.correct}</p>
      <div className="recap-total"><span>이번 결과 지수 변화</span><strong>{signed(totals.delta)}점</strong></div>
      <div className="recap-list">
        {recap.items.map(r => <article key={r.id} className="recap-match">
          <div className="recap-match-head"><strong>{r.homeName} vs {r.awayName}</strong><b style={{ color: r.correct ? 'var(--win)' : 'var(--cool)' }}>{r.correct ? '적중' : '실패'}</b></div>
          <p>내 예측: {recapPick(r)}{r.homeGoals != null && r.awayGoals != null ? ` · 결과 ${r.homeGoals}:${r.awayGoals}` : ''}</p>
          <div className="recap-match-head"><span>지수 <b>{signed(r.deltaRating)}점</b></span><span>획득 포인트 {signed(r.points)}P</span></div>
        </article>)}
      </div>
      <p className="small muted">획득 포인트 합계 {signed(totals.points)}P · 이미 내 기록에 반영됐어요.</p>
      {recap.remaining > 0 && <p className="small muted">확인할 결과가 {recap.remaining}경기 더 있어요.</p>}
      {error && <p role="alert" className="small">{error}</p>}
      <button ref={confirm} className="cta" disabled={saving} onClick={acknowledge}>{saving ? '저장 중…' : recap.remaining ? '확인하고 다음 결과 보기' : '확인했어요'}</button>
    </section>
  </div>;
}
