import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const load=async path=>{const {outputText}=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);};
const {askNotificationAgreement,notificationKind}=await load('../src/lib/notifications.ts');
const {deliveryResult}=await load('../supabase/functions/toss-notifications-send/result.ts');
test('agreement must explicitly accept, release once, ignore callbacks after unmount',()=>{
 for(const type of ['newAgreement','alreadyAgreed','agreementRejected','unknown']){
  let clean=0,accepted,calls=0;
  const dispose=askNotificationAgreement(args=>{args.onEvent({type});return()=>clean++;},'code',v=>{accepted=v;calls++;});
  dispose();assert.equal(clean,1);assert.equal(calls,1);assert.equal(accepted,['newAgreement','alreadyAgreed'].includes(type));
 }
 let callbacks,done=0,clean=0;
 const dispose=askNotificationAgreement(a=>{callbacks=a;return()=>clean++;},'code',()=>done++);
 dispose();callbacks.onEvent({type:'newAgreement'});assert.equal(done,0);assert.equal(clean,1);
});
test('an HTTP-success envelope with zero push deliveries is not a sent notification',()=>{
 for(const body of [null,{}, {resultType:'FAIL'}, {resultType:'SUCCESS',success:{msgCount:1,sentPushCount:0,sentInboxCount:1}}, {resultType:'SUCCESS',success:{sentPushCount:1,fail:{sentPush:[{reachedFailReason:'NO_CONSENT'}]}}}])assert.equal(deliveryResult(body).status,'failed');
 assert.equal(deliveryResult({resultType:'SUCCESS',success:{sentPushCount:1,detail:{sentPush:[{contentId:'test'}]}}}).status,'sent');
});
test('notification links accept only known kinds',()=>{for(const value of [null,undefined,'https://evil','invalid'])assert.equal(notificationKind(value),null);assert.equal(notificationKind('chat'),'chat');});
