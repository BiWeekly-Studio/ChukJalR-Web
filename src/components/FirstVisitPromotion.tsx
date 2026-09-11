import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import {repository} from '../data';
import {SELF_AUTH} from '../lib/env';
import {firstVisitPromotionOpen, type FirstVisitReward} from '../lib/promotion';

const inFlight=new Map<string,Promise<FirstVisitReward>>();
function claim(userId:string) {
  let pending=inFlight.get(userId);
  if(!pending) {
    pending=repository.firstVisitReward('claim').finally(()=>inFlight.delete(userId));
    inFlight.set(userId,pending);
  }
  return pending;
}
const RewardContext=createContext<{reward:FirstVisitReward|null;busy:boolean;check:()=>void}|null>(null);

export function FirstVisitPromotion({userId,children}:{userId?:string;children:ReactNode}) {
  const [reward,setReward]=useState<FirstVisitReward|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState(false);
  const owner=useRef(userId);
  owner.current=userId;
  const enabled=Boolean(userId&&!SELF_AUTH&&repository.kind==='supabase'&&import.meta.env.PROD);
  const check=useCallback(async()=>{
    if(!enabled||!userId)return;
    const current=userId;
    setBusy(true);
    try {
      const next=await claim(current);
      if(owner.current!==current)return;
      setReward(next);
      if(next.newlyPaid)setNotice(true);
    } catch {
      if(owner.current===current)setReward({status:'retry',amount:50,newlyPaid:false});
    } finally {if(owner.current===current)setBusy(false);}
  },[enabled,userId]);
  useEffect(()=>{setReward(null);setNotice(false);void check();},[check]);
  useEffect(()=>{
    if(!notice)return;
    const timer=window.setTimeout(()=>setNotice(false),8000);
    return()=>window.clearTimeout(timer);
  },[notice]);
  // One delayed reconciliation after entry; further checks are user initiated.
  useEffect(()=>{
    if(!enabled)return;
    const timer=window.setTimeout(()=>{void check();},15000);
    return()=>window.clearTimeout(timer);
  },[check,enabled]);
  return <RewardContext.Provider value={enabled?{reward,busy,check:()=>{void check();}}:null}>
    {children}
    {notice&&<div className="promotion-toast" role="status"><span>첫 방문 혜택 · 토스 포인트 50원 지급 완료</span><button aria-label="지급 안내 닫기" onClick={()=>setNotice(false)}>닫기</button></div>}
  </RewardContext.Provider>;
}

export function FirstVisitRewardInfo() {
  const context=useContext(RewardContext);
  if(!context||context.reward?.status==='ended'||(!firstVisitPromotionOpen()&&!context.reward))return null;
  const {reward,busy,check}=context;
  return <section className="promotion-benefit" aria-label="첫 방문 토스 포인트">
    <div><span className="eyebrow">첫 방문 혜택</span><strong>토스 포인트 50원</strong></div>
    <p>{reward?.status==='paid'?'지급을 완료했어요. 토스 앱의 포인트 적립 내역에서 확인해 주세요.':busy?'지급 결과를 확인하고 있어요.':reward?.status==='pending'?'지급 확인이 지연되고 있어요. 잠시 후 다시 확인해 주세요.':'아직 지급을 확인하지 못했어요. 다시 확인해 주세요.'}</p>
    {reward?.status!=='paid'&&<button className="profile-history-link" disabled={busy} onClick={check}>{busy?'확인 중…':'지급 다시 확인'}</button>}
    <PromotionTerms />
  </section>;
}

export function PromotionTerms() {
  return <details className="promotion-terms"><summary>첫 방문 혜택 안내</summary><p>2026. 9. 7.~9. 21. 이벤트 기간에 토스로 로그인해 축잘알을 방문하면 토스 계정당 한 번, 토스 포인트 50원을 지급해요. 로그인 후 자동으로 지급을 요청하며, 토스 처리에 따라 적립이 지연될 수 있어요.</p><p>이미 받은 계정의 재가입·중복 참여·부정 참여는 지급 대상에서 제외돼요. 예산 소진 시 조기 종료되며, 이 프로모션은 사전 고지 없이 중단될 수 있어요. 앱 안의 예측 XP와는 별도 혜택이에요.</p></details>;
}

export function LoginPromotionNotice() {
  if(!firstVisitPromotionOpen())return null;
  return <div className="promotion-login"><strong>첫 방문하면 토스 포인트 50원</strong><p>토스로 로그인 후 자동 지급 · 토스 계정당 1회</p><PromotionTerms /></div>;
}
