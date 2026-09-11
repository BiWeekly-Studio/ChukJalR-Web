import { createClient } from 'jsr:@supabase/supabase-js@2';
import { trustedTossKey } from '../fresh-start/verify.ts';
import { deliveryResult } from './result.ts';
Deno.serve(async req=>{
 const secret=Deno.env.get('SYNC_TOKEN');
 if(!secret||req.headers.get('x-sync-token')!==secret)return Response.json({error:'FORBIDDEN'},{status:403});
 if(req.method!=='POST')return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405});
 const cert=Deno.env.get('TOSS_CLIENT_CERT'),key=Deno.env.get('TOSS_CLIENT_KEY');
 if(!cert||!key)return Response.json({error:'MTLS_NOT_CONFIGURED'},{status:503});
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const client=Deno.createHttpClient({cert,key});
 try{
  const body=await req.json().catch(()=>({}));
  if(body.action==='test'){
   if(typeof body.handle!=='string'||typeof body.deploymentId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.deploymentId))return Response.json({error:'INVALID_TEST_INPUT'},{status:400});
   const template=await admin.from('toss_notification_templates').select('template_code,approved').eq('kind',body.kind).single();
   const profile=await admin.from('profiles').select('id').eq('handle',body.handle).single();
   if(template.error||!template.data?.approved||profile.error)return Response.json({error:'TEST_TARGET_OR_TEMPLATE_INVALID'},{status:400});
   const account=await admin.auth.admin.getUserById(profile.data.id);
   if(account.error||!account.data.user)return Response.json({error:'TEST_ACCOUNT_MISSING'},{status:400});
   const response=await fetch('https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/messenger/send-test-message',{
    method:'POST',headers:{'Content-Type':'application/json','x-toss-user-key':trustedTossKey(account.data.user)},
    body:JSON.stringify({templateSetCode:template.data.template_code,deploymentId:body.deploymentId,context:{}}),client,signal:AbortSignal.timeout(10000)
   } as RequestInit);
   const result=await response.json();
   return Response.json({httpStatus:response.status,resultType:result.resultType,result:deliveryResult(result),error:result.error??null});
  }
  const claimed=await admin.rpc('claim_toss_notifications',{p_limit:20});
  if(claimed.error)throw claimed.error;
  const counts={sent:0,failed:0,unknown:0,skipped:0};
  // Bounded parallel work keeps the cron request under 30 seconds.
  await Promise.all((claimed.data??[]).map(async (item:any)=>{
   let result:any={status:'unknown',push_count:0,error_code:'NETWORK_UNCERTAIN'};
   try{
    const prefs=await admin.from('toss_notification_preferences').select('enabled').eq('user_id',item.user_id).eq('kind',item.kind).single();
    const account=await admin.auth.admin.getUserById(item.user_id);
    if(prefs.error||!prefs.data?.enabled||account.error||!account.data.user){result={status:'skipped',push_count:0,error_code:'DISABLED_OR_DELETED'};}
    else{
     const response=await fetch('https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/messenger/send-message',{
      method:'POST',headers:{'Content-Type':'application/json','x-toss-user-key':trustedTossKey(account.data.user)},
      body:JSON.stringify({templateSetCode:item.template_code,context:{}}),client,signal:AbortSignal.timeout(10000)
     } as RequestInit);
     if(response.ok)result=deliveryResult(await response.json());
     else result={status:response.status>=500?'unknown':'failed',push_count:0,error_code:'HTTP_'+response.status};
    }
   }catch{/* A timeout may follow an accepted send; never blindly resend. */}
   const saved=await admin.from('toss_notification_deliveries').update(result).eq('id',item.id);
   if(saved.error)throw saved.error;
   counts[result.status as keyof typeof counts]++;
  }));
  return Response.json({ok:true,...counts});
 }catch{return Response.json({error:'NOTIFICATION_JOB_FAILED'},{status:502});}
 finally{client.close();}
});
