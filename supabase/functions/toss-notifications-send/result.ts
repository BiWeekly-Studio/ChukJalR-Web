export function deliveryResult(body: any): {status:'sent'|'failed';push_count:number;error_code:string|null} {
 const success=body?.success;
 const count=Number(success?.sentPushCount);
 const failure=success?.fail?.sentPush;
 const reachFailure=success?.detail?.sentPush?.some((p:any)=>p.reachedFailReason);
 if(body?.resultType==='SUCCESS'&&Number.isSafeInteger(count)&&count>0&&!failure?.length&&!reachFailure)
  return {status:'sent',push_count:count,error_code:null};
 return {status:'failed',push_count:0,error_code:String(body?.error?.errorCode??failure?.[0]?.reachedFailReason??'PUSH_NOT_SENT').slice(0,100)};
}
