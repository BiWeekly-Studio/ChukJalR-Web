// Temporary account only. Never prints keys, access tokens or user identifiers.
import {execFileSync} from 'node:child_process';
import {createClient,FunctionRegion} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const ref='nqkytgbbvlemeoljibmf';
const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const service=keys.find(k=>k.name==='service_role')?.api_key;
const anon=keys.find(k=>k.name==='anon')?.api_key;
if(!service || !anon) throw Error('Required project keys unavailable');
const url=`https://${ref}.supabase.co`;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const email=`fresh-start-check-${randomUUID()}@example.invalid`, password=randomUUID()+randomUUID();
let id;
try {
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{toss_user_key:'1'}});
 if(created.error) throw Error('Temporary user creation failed');
 id=created.data.user.id;
 const login=await client.auth.signInWithPassword({email,password});
 assert.ifError(login.error);
 const status=await client.functions.invoke('fresh-start',{region:FunctionRegion.ApNortheast2,body:{action:'status'}});
 if(status.error) {
   let body;try{body=await status.error.context.json();}catch{}
   throw Error(`Status check failed: ${JSON.stringify(body ?? {message:status.error.message})}`);
 }
 assert.equal(status.data.tickets.length,0);
 assert.equal(status.data.challenges.length,1);
 assert.equal(status.data.challenges[0].rating,1000);
 console.log('PASS: authenticated deployed function, initial challenge, zero tickets');
 const deny=await client.rpc('fresh_start_action',{p_user:id,p_action:'grant',p_order:'forged'});
 assert.ok(deny.error);console.log('PASS: direct client grant denied');
 const grant=await client.functions.invoke('fresh-start',{region:FunctionRegion.ApNortheast2,body:{action:'grant',orderId:randomUUID(),sku:'forged',userId:randomUUID(),userKey:'2'}});
 assert.ok(grant.error);
 const denied=await grant.error.context.json();
 assert.ok(['ORDER_NOT_PAID','ORDER_VERIFICATION_FAILED'].includes(denied.error),JSON.stringify(denied));
 console.log('PASS: mTLS order verification rejects nonexistent order; client identity ignored');
 const orders=await admin.from('fresh_start_orders').select('order_id').eq('user_id',id);
 assert.ifError(orders.error);assert.equal(orders.data.length,0);
 const publicClient=createClient(url,anon,{auth:{persistSession:false}});
 const unauth=await publicClient.functions.invoke('fresh-start',{body:{action:'status'}});
 assert.ok(unauth.error);console.log('PASS: unauthenticated request rejected');
} finally {
 if(id){const removed=await admin.auth.admin.deleteUser(id);if(removed.error) throw Error('Temporary user cleanup failed');console.log('Temporary test account and its challenge removed.');}
}
