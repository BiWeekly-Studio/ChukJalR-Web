import { createClient } from 'jsr:@supabase/supabase-js@2';
import { trustedTossKey } from '../fresh-start/verify.ts';
import { verifySupporterOrder } from './verify.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-region','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(b:unknown,status=200)=>new Response(JSON.stringify(b),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return json({error:'LOGIN_REQUIRED'},401);
  const {data:{user},error}=await admin.auth.getUser(token);
  if(error||!user)return json({error:'LOGIN_REQUIRED'},401);
  let client:ReturnType<typeof Deno.createHttpClient>|undefined;
  try{
    const userKey=trustedTossKey(user), body=await req.json();
    const sku=Deno.env.get('TOSS_SUPPORTER_SKU');
    if(!sku)return json({error:'SUBSCRIPTION_NOT_CONFIGURED'},503);
    if(!['status','grant','team'].includes(body.action))return json({error:'BAD_REQUEST'},400);
    if(body.action==='grant'){
      if(typeof body.orderId!=='string'||!body.orderId||body.orderId.length>200)return json({error:'BAD_REQUEST'},400);
      const cert=Deno.env.get('TOSS_CLIENT_CERT'),key=Deno.env.get('TOSS_CLIENT_KEY');
      if(!cert||!key)throw new Error('SERVER_NOT_CONFIGURED');
      client=Deno.createHttpClient({cert,key});
      const res=await fetch('https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/order/get-order-status',{
        method:'POST',headers:{'Content-Type':'application/json','x-toss-user-key':userKey},body:JSON.stringify({orderId:body.orderId}),client,signal:AbortSignal.timeout(10000)
      } as RequestInit);
      if(!res.ok)throw new Error('ORDER_VERIFICATION_FAILED');
      verifySupporterOrder(await res.json(),body.orderId,sku);
      const bound=await admin.rpc('supporter_bind_order',{p_user:user.id,p_order:body.orderId,p_sku:sku});
      if(bound.error)throw new Error('ORDER_VERIFICATION_FAILED');
    }
    const snapshot=await admin.rpc('supporter_snapshot',{p_user:user.id});
    if(snapshot.error)throw new Error('SUBSCRIPTION_UNAVAILABLE');
    if(body.action==='team'){
      if(!snapshot.data?.active)return json({error:'SUBSCRIPTION_REQUIRED'},403);
      if(!Number.isSafeInteger(body.teamId)||body.teamId<=0)return json({error:'BAD_REQUEST'},400);
      const saved=await admin.from('supporter_profiles').upsert({user_id:user.id,team_id:body.teamId});
      if(saved.error)throw new Error('TEAM_SAVE_FAILED');
      return json({...snapshot.data,teamId:body.teamId});
    }
    return json(snapshot.data);
  }catch(e){
    const message=e instanceof Error?e.message:'';
    const allowed=['TOSS_LOGIN_REQUIRED','ORDER_VERIFICATION_FAILED','ORDER_NOT_PAID','SUBSCRIPTION_UNAVAILABLE','TEAM_SAVE_FAILED','SERVER_NOT_CONFIGURED'];
    return json({error:allowed.includes(message)?message:'SUBSCRIPTION_UNAVAILABLE'},400);
  }finally{client?.close();}
});
