import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const load=async path=>{
 const {outputText}=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};
const {paymentEvent,verifySupporterOrder}=await load('../supabase/functions/supporter/verify.ts');
const {badgeIsActive,subscribeSupporter,restoreSupporter}=await load('../src/lib/supporter.ts');
const event=(status='ACTIVE',extra={})=>({eventType:'subscription.status_changed',eventVersion:'1.0',orderId:'o1',sku:'monthly',occurredAt:'2026-09-07T12:00:00+09:00',subscription:{current:{status,accessGranted:true,expiresAt:'2026-10-07T12:00:00+09:00',autoRenew:true,...extra}}});
test('subscription orders must match user-verified order ID and configured SKU',()=>{
 const body={resultType:'SUCCESS',success:{orderId:'o1',sku:'monthly',status:'PURCHASED'}};
 verifySupporterOrder(body,'o1','monthly');
 for(const b of [null,{}, {...body,success:{...body.success,status:'REFUNDED'}}, {...body,success:{...body.success,sku:'ticket'}}])assert.throws(()=>verifySupporterOrder(b,'o1','monthly'));
 assert.throws(()=>verifySupporterOrder(body,'another','monthly'));
});
test('refund, pause, hold and expiration cannot grant access even with contradictory flag',()=>{
 for(const status of ['EXPIRED','REVOKED','PAUSED','ON_HOLD'])assert.equal(paymentEvent(event(status),'monthly').p_access,false);
 assert.equal(paymentEvent(event('IN_GRACE_PERIOD'),'monthly').p_access,true);
 assert.equal(paymentEvent(event('ACTIVE',{autoRenew:false}),'monthly').p_access,true);
});
test('webhook schema, SKU and local time offset are validated',()=>{
 const b=event();b.occurredAt='2026-09-07T12:00:00';
 assert.throws(()=>paymentEvent(b,'monthly'));
 assert.equal(paymentEvent(b,'monthly','+09:00').p_event_at,'2026-09-07T03:00:00.000Z');
 b.occurredAt='2026-09-07T17:24:05.16925625';
 assert.equal(paymentEvent(b,'monthly','+09:00').p_event_at,'2026-09-07T08:24:05.169Z');
 for(const bad of [null,{}, {...event(),sku:'other'}, {...event(),eventVersion:'2'},event('INVALID'),event('ACTIVE',{expiresAt:'nonsense'})])assert.throws(()=>paymentEvent(bad,'monthly'));
});
test('badge disappears at exact expiration and invalid values are denied',()=>{
 const now=Date.parse('2026-10-07T03:00:00Z');
 assert.equal(badgeIsActive({teamId:1,expiresAt:new Date(now).toISOString()},now),false);
 assert.equal(badgeIsActive({teamId:1,expiresAt:new Date(now+1).toISOString()},now),true);
 for(const badge of [undefined,{teamId:-1,expiresAt:null},{teamId:1,expiresAt:'bad'}])assert.equal(badgeIsActive(badge,now),false);
});
test('SDK acknowledges only server-confirmed access and cleans up once',async()=>{
 let args,clean=0,done=0;
 const sdk={createSubscriptionPurchaseOrder:a=>{args=a;return ()=>clean++;}};
 let state={active:false,pending:true};
 const dispose=subscribeSupporter(sdk,'monthly',async()=>state,()=>done++);
 assert.equal(await args.options.processProductGrant({orderId:'o1'}),false);
 state={active:true,pending:false};
 assert.equal(await args.options.processProductGrant({orderId:'o1'}),true);
 args.onEvent({type:'success'});args.onEvent({type:'success'});dispose();
 assert.equal(clean,1);assert.equal(done,1);
});
test('restore filters other products and never acknowledges a pending entitlement',async()=>{
 let granted=[],completed=[];
 const sdk={getPendingOrders:async()=>({orders:[{orderId:'ticket',sku:'ticket'},{orderId:'o1',sku:'monthly'}]}),completeProductGrant:async({params})=>{completed.push(params.orderId);return true;}};
 await assert.rejects(()=>restoreSupporter(sdk,'monthly',async id=>{granted.push(id);return {active:false,pending:true};}));
 assert.deepEqual(granted,['o1']);assert.deepEqual(completed,[]);
 await restoreSupporter(sdk,'monthly',async()=>({active:true,pending:false}));
 assert.deepEqual(completed,['o1']);
});
