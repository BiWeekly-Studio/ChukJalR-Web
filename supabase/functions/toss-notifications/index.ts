import { createClient } from 'jsr:@supabase/supabase-js@2';
import { trustedTossKey } from '../fresh-start/verify.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-region','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const token=req.headers.get('authorization')?.replace(/^Bearer /i,'');
 if(!token)return json({error:'LOGIN_REQUIRED'},401);
 const {data:{user},error}=await admin.auth.getUser(token);
 if(error||!user)return json({error:'LOGIN_REQUIRED'},401);
 try{
  trustedTossKey(user);
  const body=await req.json();
  if(!['status','set','latest'].includes(body.action))return json({error:'BAD_ACTION'},400);
  const templates=await admin.from('toss_notification_templates').select('kind,template_code,approved');
  if(templates.error)throw templates.error;
  if(body.action==='set'){
   const template=templates.data.find(t=>t.kind===body.kind);
   if(!template||typeof body.enabled!=='boolean')return json({error:'BAD_REQUEST'},400);
   if(body.enabled&&!template.approved)return json({error:'TEMPLATE_PENDING'},409);
   // SDK agreement is required in the UI; Toss independently enforces actual consent on send.
   const result=await admin.from('toss_notification_preferences').upsert({user_id:user.id,kind:body.kind,enabled:body.enabled,enabled_at:new Date().toISOString()});
   if(result.error)throw result.error;
  }
  if(body.action==='latest'){
   if(!templates.data.some(t=>t.kind===body.kind))return json({error:'BAD_KIND'},400);
   const result=await admin.from('toss_notification_deliveries').select('fixture_id').eq('user_id',user.id).eq('kind',body.kind).eq('status','sent').order('attempted_at',{ascending:false}).limit(1).maybeSingle();
   if(result.error)throw result.error;
   return json({fixtureId:result.data?.fixture_id??null});
  }
  const prefs=await admin.from('toss_notification_preferences').select('kind,enabled').eq('user_id',user.id);
  if(prefs.error)throw prefs.error;
  return json({items:templates.data.map(t=>({kind:t.kind,templateCode:t.template_code,available:t.approved,enabled:prefs.data.some(p=>p.kind===t.kind&&p.enabled)}))});
 }catch{return json({error:'NOTIFICATIONS_UNAVAILABLE'},400);}
});
