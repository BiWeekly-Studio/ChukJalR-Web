import { useEffect, useRef, useState } from 'react';
import { repository } from '../data';
import { teams } from '../data/catalog';
import { useApp } from '../store';
import { SELF_AUTH } from '../lib/env';
import { restoreSupporter, subscribeSupporter, supportsSubscriptions, type SubscriptionSdk, type SupporterState } from '../lib/supporter';
import { SupporterBadge } from './SupporterBadge';
const sku=import.meta.env.VITE_TOSS_SUPPORTER_SKU?.trim() ?? '';
export function SupporterMembership() {
  const {state,dispatch}=useApp();
  const [membership,setMembership]=useState<SupporterState|null>(null);
  const [selected,setSelected]=useState(state.favoriteTeamIds[0] ?? teams()[0]?.id ?? 0);
  const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[message,setMessage]=useState('');
  const sdk=useRef<SubscriptionSdk|null>(null),lock=useRef(false),alive=useRef(false),dispose=useRef<(()=>void)|null>(null);
  const apply=(next:SupporterState)=>{
    if(!alive.current)return;
    setMembership(next);
    if(next.teamId)setSelected(next.teamId);
    dispatch({type:'hydrate',state:{supporter:next.active && next.teamId ? {teamId:next.teamId,expiresAt:next.expiresAt}:null}});
  };
  const grant=async(orderId:string)=>{const next=await repository.supporter('grant',{orderId});apply(next);return next;};
  const refresh=async()=>{
    if(lock.current || !sku || repository.kind!=='supabase')return;
    lock.current=true;setBusy(true);
    try {
      apply(await repository.supporter('status'));
      const {IAP}=await import('@apps-in-toss/web-framework');
      const api=IAP as unknown as SubscriptionSdk;
      if(!supportsSubscriptions(api))throw new Error('UNSUPPORTED');
      sdk.current=api;
      await restoreSupporter(api,sku,grant);
      apply(await repository.supporter('status'));
      const list=await api.getProductItemList();
      const product=list?.products.find(p=>p.sku===sku && p.type==='SUBSCRIPTION' && p.renewalCycle==='MONTHLY');
      // Fail closed if the console price differs from the advertised KRW amount.
      if(!product || product.displayAmount.replace(/[^0-9]/g,'')!=='2200')throw new Error('CONFIG');
      if(alive.current){setReady(true);setMessage('');}
    } catch(error) {
      if(alive.current){setReady(false);setMessage(error instanceof Error && error.message==='PAYMENT_PENDING'?'결제 확인 중이에요. 다시 결제하지 말고 구매 복원을 눌러 주세요.':'구독을 확인하지 못했어요. 최신 토스 앱에서 다시 시도해 주세요.');}
    } finally {lock.current=false;if(alive.current)setBusy(false);}
  };
  useEffect(()=>{
    alive.current=true;void refresh();
    const visible=()=>{if(document.visibilityState==='visible')void refresh();};
    document.addEventListener('visibilitychange',visible);
    return ()=>{alive.current=false;dispose.current?.();document.removeEventListener('visibilitychange',visible);};
  },[]);
  const buy=()=>{
    if(lock.current || !ready || !sdk.current || membership?.active || membership?.pending)return;
    lock.current=true;setBusy(true);setMessage('');
    const finish=(error?:unknown)=>{
      lock.current=false;
      if(alive.current){setBusy(false);setMessage(error?'결제가 완료되지 않았어요. 구매 복원으로 상태를 확인해 주세요.':'구독이 시작됐어요. 응원 팀을 선택하고 저장해 주세요.');}
    };
    try{dispose.current=subscribeSupporter(sdk.current,sku,grant,finish);}catch(error){finish(error);}
  };
  const save=async()=>{
    if(lock.current)return;lock.current=true;setBusy(true);
    try{apply(await repository.supporter('team',{teamId:selected}));setMessage('응원 팀을 저장했어요.');}
    catch{setMessage('팀을 저장하지 못했어요. 다시 시도해 주세요.');}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  };
  return <section className="supporter-card">
    <div className="h3">응원 프로필 팩</div>
    <p className="small muted">채팅·순위표·프로필에 내 응원 팀 배지와 컬러 테두리를 표시해요.</p>
    <strong>월 2,200원 <span className="small muted">/ 부가세 포함 · 자동 갱신</span></strong>
    <label className="small" htmlFor="supporter-team">응원 팀</label>
    <select id="supporter-team" value={selected} disabled={busy} onChange={e=>setSelected(Number(e.target.value))}>
      {teams().map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
    <div className="supporter-preview"><span className="small muted">미리보기</span><SupporterBadge badge={{teamId:selected,expiresAt:null}}/></div>
    <p className="tiny muted">직접 디자인한 서포터 배지예요. 구단 공식 상품이 아니에요. 구독 중 응원 팀을 바꿀 수 있어요.</p>
    {membership?.active ? <>
      <p className="small">{membership.autoRenew?'구독 이용 중 · 자동 갱신 켜짐':'구독 이용 중 · 자동 갱신 꺼짐'}{membership.expiresAt && ` · ${new Date(membership.expiresAt).toLocaleDateString('ko-KR')}까지`}</p>
      <button className="btn primary" disabled={busy} onClick={()=>void save()}>응원 팀 저장</button>
    </> : <button className="btn primary" disabled={busy || !ready || membership?.pending || SELF_AUTH} onClick={buy}>{busy?'확인 중…':membership?.pending?'결제 확인 중':!sku?'구독 출시 준비 중':'월 2,200원으로 구독하기'}</button>}
    {!!sku && <button className="btn" disabled={busy} onClick={()=>void refresh()}>구매 복원·상태 확인</button>}
    <p className="tiny muted">해지하면 다음 갱신부터 결제가 중단돼요. 남은 이용기간에는 혜택이 유지되며, 환불로 권한이 회수되면 종료돼요. 해지는 결제한 스토어의 구독 관리에서 진행해 주세요.</p>
    {message && <p role="status" className="small">{message}</p>}
  </section>;
}
