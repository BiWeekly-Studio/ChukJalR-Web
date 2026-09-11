import { useEffect, useState } from 'react';
import { team } from '../data/catalog';
import { badgeIsActive, type SupporterBadgeData } from '../lib/supporter';
export function useActiveSupporter(badge?: SupporterBadgeData | null) {
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{
    if(!badge?.expiresAt)return;
    const remaining=Date.parse(badge.expiresAt)-Date.now();
    if(!Number.isFinite(remaining) || remaining<=0)return;
    const timer=setTimeout(()=>setNow(Date.now()),Math.min(remaining+1,2147483647));
    return ()=>clearTimeout(timer);
  },[badge?.expiresAt,now]);
  return badgeIsActive(badge,Date.now());
}
export function SupporterBadge({badge}: {badge?: SupporterBadgeData | null}) {
  const active=useActiveSupporter(badge);
  if(!active) return null;
  const t=team(badge!.teamId);
  return <span className="supporter-badge" style={{borderColor:t.color}} aria-label={`${t.name} 서포터`}>
    <span aria-hidden="true" style={{background:t.color}}/> {t.name} 서포터
  </span>;
}
