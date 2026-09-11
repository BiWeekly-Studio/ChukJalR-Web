import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient,FunctionRegion} from '@supabase/supabase-js';
const ref='nqkytgbbvlemeoljibmf',url=`https://${ref}.supabase.co`;
const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const options={auth:{persistSession:false}};
const admin=createClient(url,keys.find(x=>x.name==='service_role').api_key,options);
const client=createClient(url,keys.find(x=>x.name==='anon').api_key,options);
const password=randomUUID()+randomUUID(),email=randomUUID()+'@example.invalid';let id;
const call=async(action,extra={})=>client.functions.invoke('toss-notifications',{region:FunctionRegion.ApNortheast2,body:{action,...extra}});
try{
 assert.ok((await call('status')).error,'unauth denied');
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{toss_user_key:'1'}});assert.ifError(created.error);id=created.data.user.id;
 assert.ifError((await client.auth.signInWithPassword({email,password})).error);
 let r=await call('status');assert.ifError(r.error);assert.equal(r.data.items.length,4);assert.ok(r.data.items.every(x=>!x.enabled&&x.available));
 // Temporary account remains un-onboarded, so no cron can deliver to it.
 r=await call('set',{kind:'lock',enabled:true});assert.ifError(r.error);assert.equal(r.data.items.find(x=>x.kind==='lock').enabled,true);
 r=await call('set',{kind:'lock',enabled:false});assert.ifError(r.error);assert.equal(r.data.items.find(x=>x.kind==='lock').enabled,false);
 assert.ok((await call('set',{kind:'invalid',enabled:true})).error);
 assert.ok((await client.rpc('claim_toss_notifications')).error);
 assert.ok((await client.from('toss_notification_templates').update({approved:true}).eq('kind','lock')).error);
 const noauth=await fetch(url+'/functions/v1/toss-notifications-send',{method:'POST'});assert.equal(noauth.status,403);
 console.log('PASS: deployed API auth, default opt-out, per-kind preferences, approval config, invalid input and worker authorization');
}finally{if(id)assert.ifError((await admin.auth.admin.deleteUser(id)).error);console.log('Temporary account removed; no push was sent.');}
