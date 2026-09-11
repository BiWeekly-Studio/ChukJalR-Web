import {useEffect,useRef,useState} from 'react';
import {repository} from '../data';
import type {LeagueNotification} from '../lib/competitions';
export function LeagueNotificationSettings(){
 const [leagues,setLeagues]=useState<LeagueNotification[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(false);
 const load=async()=>{setBusy(true);try{const next=await repository.leagueNotifications();if(alive.current){setLeagues(next);setError('');}}catch{if(alive.current)setError('대회 알림 설정을 불러오지 못했어요.');}finally{if(alive.current)setBusy(false);}};
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[]);
 const save=async(l:LeagueNotification)=>{setBusy(true);setError('');try{const next=await repository.leagueNotifications(l.id,!l.enabled);if(alive.current)setLeagues(next);}catch{if(alive.current)setError('저장하지 못했어요. 다시 시도해 주세요.');}finally{if(alive.current)setBusy(false);}};
 const group=(major:boolean)=><div>{leagues.filter(l=>l.major===major).map(l=><div key={l.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'8px 0'}}>
  <span className="small">{l.name}</span><button type="button" role="switch" aria-label={`${l.name} 알림`} aria-checked={l.enabled} disabled={busy} onClick={()=>void save(l)} style={{minWidth:64,minHeight:44,border:0,borderRadius:22,background:l.enabled?'var(--accent)':'var(--card-2)',color:l.enabled?'white':'var(--ink-2)'}}>{l.enabled?'켜짐':'꺼짐'}</button>
 </div>)}</div>;
 return <div style={{borderTop:'1px solid var(--line)',marginTop:12,paddingTop:16}} aria-label="대회별 알림">
  <h3 className="h3">대회별 알림</h3><p className="tiny muted">위에서 켠 알림 종류를 선택한 대회에서만 받아요. 기본 대상은 메이저 8개 대회이며, 기타 대회는 직접 켤 수 있어요.</p>
  <h4>메이저 대회</h4>{group(true)}
  <details><summary style={{padding:'14px 0',cursor:'pointer'}}>기타 대회 · {leagues.filter(l=>!l.major&&l.enabled).length}개 켜짐</summary>{group(false)}</details>
  {busy&&<p role="status" className="tiny muted">설정을 저장하거나 불러오는 중이에요.</p>}
  {error&&<p role="alert" className="small">{error} <button disabled={busy} onClick={()=>void load()}>다시 불러오기</button></p>}
 </div>;
}
