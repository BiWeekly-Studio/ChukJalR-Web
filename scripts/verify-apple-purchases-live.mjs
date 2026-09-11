import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createClient,FunctionRegion} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const ref='nqkytgbbvlemeoljibmf',url=`https://${ref}.supabase.co`;
const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const admin=createClient(url,keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false}});
const client=createClient(url,keys.find(k=>k.name==='anon').api_key,{auth:{persistSession:false}});
let id;
try {
 const email='apple-iap-check-'+randomUUID()+'@example.invalid',password=randomUUID()+randomUUID();
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);id=created.data.user.id;
 assert.ifError((await client.auth.signInWithPassword({email,password})).error);
 const call=body=>client.functions.invoke('apple-iap',{region:FunctionRegion.ApNortheast2,body});
 const status=await call({action:'status'});
 if(status.error){let body;try{body=await status.error.context.json();}catch{};throw Error('Status: '+JSON.stringify(body));}
 assert.equal(status.data.freshStart.tickets.length,0);assert.equal(status.data.freshStart.challenges.length,1);assert.equal(status.data.supporter.active,false);
 assert.equal(status.data.storeReady,true,'Apple credentials must be configured');
 const forged=await call({action:'verify',signedTransaction:'eyJhbGciOiJub25lIn0.eyJidW5kbGVJZCI6ImNvbS5qYWxyLmNodWtqYWxhbCJ9.'});assert.ok(forged.error);
 assert.equal((await forged.error.context.json()).error,'INVALID_SIGNATURE');
 assert.ok((await call({action:'start',orderId:'apple:Production:123'})).error);
 assert.ok((await call({action:'team',teamId:50})).error);
 assert.ok((await client.rpc('apple_apply_transaction',{p_user:id,p_environment:'Production',p_transaction:'123',p_original:'123',p_product:'com.jalr.chukjalal.freshstart',p_purchased:new Date().toISOString(),p_expires:null,p_revoked:null,p_signed:new Date().toISOString()})).error);
 const notification=await fetch(url+'/functions/v1/apple-notifications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({signedPayload:'forged'})});assert.equal(notification.status,400);
 const orders=await admin.from('apple_purchases').select('transaction_id').eq('user_id',id);assert.ifError(orders.error);assert.equal(orders.data.length,0);
 console.log('PASS: live authenticated status, free initial challenge, forged JWS rejection, protected team/ticket actions, client RPC denial and notification rejection. No purchase made.');
} finally { if(id) {assert.ifError((await admin.auth.admin.deleteUser(id)).error);console.log('Temporary test account removed.');} }
