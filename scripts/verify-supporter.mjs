// Temporary isolated account/orders only; no real purchase or token logging.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createClient,FunctionRegion} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const ref='nqkytgbbvlemeoljibmf',url=`https://${ref}.supabase.co`;
const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const admin=createClient(url,keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false}});
const client=createClient(url,keys.find(k=>k.name==='anon').api_key,{auth:{persistSession:false}});
const env=Object.fromEntries(readFileSync('.env.supporter-server.local','utf8').trim().split('\n').map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
const order='test-supporter-'+randomUUID(),email=randomUUID()+'@example.invalid',password=randomUUID()+randomUUID();
let id;
const rpc=async(name,args)=>{const r=await admin.rpc(name,args);assert.ifError(r.error);return r.data;};
const state=async()=>{const r=await client.functions.invoke('supporter',{region:FunctionRegion.ApNortheast2,body:{action:'status'}});assert.ifError(r.error);return r.data;};
const now=Date.now();
const event=async(status,seq,auth=true)=>fetch(url+'/functions/v1/supporter-webhook',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Basic '+env.TOSS_SUPPORTER_WEBHOOK_BASIC}:{})},body:JSON.stringify({eventType:'subscription.status_changed',eventVersion:'1.0',orderId:order,sku:env.TOSS_SUPPORTER_SKU,occurredAt:new Date(now+seq*1000).toISOString(),subscription:{current:{status,accessGranted:status==='ACTIVE',expiresAt:new Date(now+86400000).toISOString(),autoRenew:seq===0}}})});
try{
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{toss_user_key:'1'}});assert.ifError(created.error);id=created.data.user.id;
 assert.ifError((await client.auth.signInWithPassword({email,password})).error);
 assert.equal((await state()).active,false);
 assert.equal((await event('ACTIVE',0,false)).status,401);
 assert.equal((await event('ACTIVE',0)).status,200);
 await rpc('supporter_bind_order',{p_user:id,p_order:order,p_sku:env.TOSS_SUPPORTER_SKU});
 assert.equal((await state()).active,true);
 const team=await admin.from('teams').select('id').limit(1).single();assert.ifError(team.error);
 const saved=await client.functions.invoke('supporter',{region:FunctionRegion.ApNortheast2,body:{action:'team',teamId:team.data.id}});assert.ifError(saved.error);
 assert.equal((await client.rpc('supporter_badges',{p_users:[id]})).data.length,1);
 assert.equal((await event('ACTIVE',1)).status,200);assert.equal((await state()).active,true);assert.equal((await state()).autoRenew,false);
 assert.equal((await event('REVOKED',2)).status,200);assert.equal((await state()).active,false);
 assert.equal((await event('ACTIVE',0)).status,200);assert.equal((await state()).active,false);
 assert.equal((await client.rpc('supporter_badges',{p_users:[id]})).data.length,0);
 assert.ok((await client.rpc('supporter_bind_order',{p_user:id,p_order:'forged',p_sku:env.TOSS_SUPPORTER_SKU})).error);
 const forged=await client.functions.invoke('supporter',{region:FunctionRegion.ApNortheast2,body:{action:'grant',orderId:randomUUID()}});assert.ok(forged.error);
 console.log('PASS: deployed auth, webhook-before-grant, team selection, badge RPC, cancel, refund, reordered event and client grant denial');
}finally{
 assert.ifError((await admin.from('supporter_orders').delete().eq('order_id',order)).error);
 if(id)assert.ifError((await admin.auth.admin.deleteUser(id)).error);
 console.log('Temporary test data removed. No real purchase made.');
}
