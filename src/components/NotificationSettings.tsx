import {LeagueNotificationSettings} from './LeagueNotificationSettings';
import {useEffect,useRef,useState} from 'react';
import {repository} from '../data';
import {SELF_AUTH} from '../lib/env';
import {askNotificationAgreement,NOTIFICATION_LABELS,type NotificationItem} from '../lib/notifications';
export function NotificationSettings(){
 const [items,setItems]=useState<NotificationItem[]>([]),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState('');
 const alive=useRef(false),cleanup=useRef<(()=>void)|undefined>();
 const refresh=async()=>{try{const s=await repository.notifications('status');if(alive.current){setItems(s.items);setError('');}}catch{if(alive.current)setError('알림 설정을 불러오지 못했어요. 다시 시도해 주세요.');}};
 useEffect(()=>{alive.current=true;if(!SELF_AUTH)void refresh();return()=>{alive.current=false;cleanup.current?.();};},[]);
 if(SELF_AUTH)return null;
 const save=async(item:NotificationItem,enabled:boolean)=>{
  try{const s=await repository.notifications('set',{kind:item.kind,enabled});if(alive.current)setItems(s.items);}
  catch{if(alive.current)setError('설정을 저장하지 못했어요. 다시 시도해 주세요.');}
  finally{if(alive.current)setBusy(null);}
 };
 const toggle=async(item:NotificationItem)=>{
  setError('');setBusy(item.kind);
  if(item.enabled){await save(item,false);return;}
  try{
   const {Notification}=await import('@apps-in-toss/web-framework');
   if(!alive.current)return;
   if(!Notification.requestAgreement.isSupported())throw new Error('UNSUPPORTED');
   cleanup.current?.();
   cleanup.current=askNotificationAgreement(Notification.requestAgreement,item.templateCode,(accepted,e)=>{
    if(!alive.current)return;
    if(accepted)void save(item,true);
    else {setBusy(null);if(e)setError('토스 앱에서 알림 수신 동의를 다시 시도해 주세요.');}
   });
  }catch{if(alive.current){setBusy(null);setError('최신 토스 앱에서 알림을 설정해 주세요.');}}
 };
 return <section className="card" style={{marginTop:16,padding:18}} aria-label="알림 설정">
  <h2 className="h2" style={{fontSize:16}}>알림</h2>
  <p className="small muted" style={{margin:'7px 0 12px'}}>원하는 경기 소식만 토스 알림으로 받아보세요.</p>
  {items.map(item=><div key={item.kind} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderTop:'1px solid var(--line)'}}>
   <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700}}>{NOTIFICATION_LABELS[item.kind].title}</div><div className="tiny muted" style={{marginTop:4}}>{NOTIFICATION_LABELS[item.kind].detail}</div>
   {!item.available&&<div className="tiny muted" style={{marginTop:4}}>알림 준비 중이에요</div>}</div>
   <button type="button" role="switch" aria-checked={item.enabled} aria-label={NOTIFICATION_LABELS[item.kind].title} disabled={busy!==null||(!item.available&&!item.enabled)} onClick={()=>void toggle(item)} style={{minWidth:64,minHeight:44,border:0,borderRadius:22,background:item.enabled?'var(--accent)':'var(--card-2, #eeedf3)',color:item.enabled?'white':'var(--ink-2)',fontWeight:700,opacity:!item.available ? 0.5 : 1}}>{busy===item.kind?'저장 중':item.enabled?'켜짐':'켜기'}</button>
  </div>)}
  <LeagueNotificationSettings />
  {error&&<div role="alert" className="small" style={{marginTop:8}}>{error} <button onClick={()=>void refresh()}>다시 시도</button></div>}
  <p className="tiny muted" style={{marginTop:10}}>알림이 오지 않으면 토스 설정 → 알림 → 서비스별 알림과 휴대폰의 토스 알림 허용 여부를 확인해 주세요.</p>
 </section>;
}
