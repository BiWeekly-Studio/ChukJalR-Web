import { useEffect, useRef, useState } from 'react';
import { repository } from '../data';
import { SELF_AUTH } from '../lib/env';
import { FRESH_START_SKU, loadPurchaseSDK, supportsPurchases, restoreTickets, purchaseTicket, purchaseError,
  type FreshStartState, type Product, type PurchaseSDK } from '../lib/freshStart';

export function FreshStart() {
  if (SELF_AUTH || repository.kind !== 'supabase') return null;
  return <FreshStartCard />;
}
export function FreshStartCard() {
  const [state,setState]=useState<FreshStartState | null>(null);
  const [product,setProduct]=useState<Product | null>(null);
  const [busy,setBusy]=useState(true);
  const [message,setMessage]=useState('');
  const [confirm,setConfirm]=useState(false);
  const [history,setHistory]=useState(false);
  const sdk=useRef<PurchaseSDK | null>(null);
  const cleanup=useRef<(() => void) | null>(null);
  const alive=useRef(true);
  const refresh=async () => {
    const next=await repository.freshStart('status');
    if (alive.current) setState(next);
  };
  const restore=async () => {
    setBusy(true); setMessage('');
    try {
      const api=await loadPurchaseSDK();
      if (!supportsPurchases(api)) {
        await refresh();
        if (alive.current) setMessage('이용권 구매는 최신 토스 앱에서 이용할 수 있어요.');
        return;
      }
      sdk.current=api;
      const catalog=await api.getProductItemList();
      if (alive.current) setProduct(catalog?.products.find(p=>p.sku===FRESH_START_SKU) ?? null);
      await restoreTickets(api,id=>repository.freshStart('grant',id));
      await refresh();
    } catch(error) {
      if (alive.current) setMessage(purchaseError(error));
      // Grants already recorded by the server remain visible even if SDK acknowledgement failed.
      try { await refresh(); } catch { /* keep error and retry action visible */ }
    } finally { if (alive.current) setBusy(false); }
  };
  useEffect(()=> {
    alive.current=true;
    void restore();
    return ()=>{ alive.current=false; cleanup.current?.(); };
  },[]);
  const buy=() => {
    if (!sdk.current || !product || busy) return;
    setBusy(true); setMessage('');
    try {
      cleanup.current=purchaseTicket(sdk.current,id=>repository.freshStart('grant',id), async error=>{
        if (!alive.current) return;
        setMessage(error?purchaseError(error):'이용권 1장이 지급됐어요. 원할 때 사용해 새로 시작하세요.');
        try { await refresh(); } catch { if (alive.current) setMessage('구매 내역 확인이 필요해요. 구매 복구를 눌러주세요.'); }
        if (alive.current) setBusy(false);
      });
    } catch(error) { setMessage(purchaseError(error)); setBusy(false); }
  };
  const start=async () => {
    const ticket=state?.tickets[0];
    if (!ticket || busy) return;
    setBusy(true); setMessage('');
    try {
      const next=await repository.freshStart('start',ticket.orderId);
      if (alive.current) { setState(next);setConfirm(false);setMessage('새 도전을 시작했어요! 지금부터 새로 제출한 예측이 집계돼요.'); }
    } catch(error) { if (alive.current) setMessage(purchaseError(error)); }
    finally { if (alive.current) setBusy(false); }
  };
  const current=state?.challenges.find(c=>!c.ended_at);
  const previous=state?.challenges.filter(c=>c.ended_at) ?? [];
  const tickets=state?.tickets.length ?? 0;
  return <section className="fresh-start card" aria-label="개인 도전">
    <div className="fresh-start-title"><div><span className="tiny muted">나만의 새 출발</span><h2>개인 도전</h2></div><img src="/fresh-start-ticket.png" alt="새 출발권" width="64" height="64" /></div>
    {current ? <>
      <p className="small muted">{new Date(current.started_at).toLocaleDateString('ko-KR')}부터 새로 제출한 예측</p>
      <div className="fresh-start-stats"><div><b>{current.rating.toLocaleString()}</b><span>개인 도전 지수</span></div><div><b>{current.settled ? `${Math.round(current.hits/current.settled*100)}%`:'—'}</b><span>적중률 · {current.settled}경기</span></div></div>
      <p className="tiny muted">결과 대기 {current.predicted-current.settled}경기</p>
    </> : <p className="small muted">{busy?'도전 기록을 불러오는 중이에요.':state?'진행 중인 개인 도전이 없어요.':'도전 기록을 확인해주세요.'}</p>}
    <p className="small">새 출발권으로 개인 도전 지수를 1,000부터 다시 시작해요. 공식 점수·랭킹과 기존 예측 기록은 유지돼요.</p>
    <div className="fresh-start-balance">보유 이용권 <b>{tickets}장</b></div>
    {confirm ? <div className="fresh-start-confirm" role="group" aria-label="이용권 사용 확인">
      <p>이용권 1장을 사용할까요? 진행 중이던 예측은 이전 도전에 남고, 사용 이후 새로 제출한 예측부터 집계돼요.</p>
      <button className="btn primary" disabled={busy || state?.verificationPending} onClick={()=>void start()}>1장 사용하고 새 출발</button>
      <button className="btn" disabled={busy} onClick={()=>setConfirm(false)}>취소</button>
    </div> : tickets>0 ? <button className="btn primary" disabled={busy || state?.verificationPending} onClick={()=>setConfirm(true)}>이용권 사용하기</button>
      : <button className="btn primary" disabled={busy || !product || !state} onClick={buy}>{busy?'확인 중…':product?`새 출발권 1회 · ${product.displayAmount}`:'현재 상품을 구매할 수 없어요'}</button>}
    {state?.verificationPending && <p className="small" role="status">주문 확인이 지연되고 있어요. 구매 복구로 다시 확인해주세요.</p>}
    {message && <p className="small fresh-start-message" role="status">{message}</p>}
    <p className="tiny muted"><a href="/support.html" target="_blank" rel="noreferrer">구매·환불 안내</a> · <a href="/privacy.html" target="_blank" rel="noreferrer">개인정보 처리방침</a></p>
    <div className="fresh-start-links"><button disabled={busy} onClick={()=>void restore()}>구매 복구</button>{previous.length>0 && <button onClick={()=>setHistory(!history)}>이전 도전 {previous.length}개 {history?'접기':'보기'}</button>}</div>
    {history && <ul className="fresh-start-history">{previous.map(c=><li key={c.id}><span>{new Date(c.started_at).toLocaleDateString('ko-KR')} ~ {new Date(c.ended_at!).toLocaleDateString('ko-KR')}{c.refunded?' · 이용권 환불':''}</span><b>{c.rating.toLocaleString()} · {c.hits}/{c.settled} 적중</b></li>)}</ul>}
  </section>;
}

export function PurchaseRecovery() {
  const [message,setMessage]=useState('');
  useEffect(()=>{
    if (SELF_AUTH || repository.kind !== 'supabase') return;
    let active=true;
    void (async()=>{
      try {
        const api=await loadPurchaseSDK();
        if (!supportsPurchases(api)) return;
        const count=await restoreTickets(api,id=>repository.freshStart('grant',id));
        if (active && count>0) setMessage('구매한 이용권을 복구했어요. 나 탭에서 확인해주세요.');
      } catch { if (active) setMessage('구매 복구를 완료하지 못했어요. 나 탭에서 다시 확인해주세요.'); }
    })();
    return ()=>{active=false;};
  },[]);
  return message?<div className="toast" role="status" onClick={()=>setMessage('')}>{message}</div>:null;
}
