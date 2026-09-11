export const NOTIFICATION_KINDS = ['lock','kickoff','chat','settlement'] as const;
export type NotificationKind = typeof NOTIFICATION_KINDS[number];
export interface NotificationItem {kind:NotificationKind;templateCode:string;available:boolean;enabled:boolean}
export interface NotificationState {items:NotificationItem[];fixtureId?:number|null}
export const NOTIFICATION_LABELS:Record<NotificationKind,{title:string;detail:string}>={
 lock:{title:'예측 마감 임박',detail:'미예측 경기의 예측 마감 15분 전'},
 kickoff:{title:'경기 시작',detail:'내가 예측한 경기 시작 10분 전'},
 chat:{title:'채팅 열림',detail:'응원 팀 경기 시작 1시간 전'},
 settlement:{title:'예측 결과',detail:'참여한 경기의 예측 결과가 확정되면'},
};
export function notificationKind(value:unknown):NotificationKind|null {
 return typeof value==='string' && (NOTIFICATION_KINDS as readonly string[]).includes(value)?value as NotificationKind:null;
}
export type AgreementRequest=(args:{options:{templateCode:string};onEvent:(event:{type:string})=>void;onError:(e:unknown)=>void})=>(()=>void);
// Handles synchronous SDK callbacks and unmounts without leaking the bridge listener.
export function askNotificationAgreement(request:AgreementRequest,templateCode:string,done:(accepted:boolean,error?:unknown)=>void){
 let cleanup:(()=>void)|undefined,finished=false,released=false;
 const release=()=>{if(cleanup&&!released){released=true;cleanup();}};
 const finish=(accepted:boolean,error?:unknown)=>{if(finished)return;finished=true;release();done(accepted,error);};
 cleanup=request({options:{templateCode},onEvent:e=>finish(e.type==='newAgreement'||e.type==='alreadyAgreed'),onError:e=>finish(false,e)});
 if(finished)release();
 return ()=>{finished=true;release();};
}
