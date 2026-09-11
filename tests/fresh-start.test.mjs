import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const load=async path=>{
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};
const {verifyOrder,trustedTossKey,SKU}=await load('../supabase/functions/fresh-start/verify.ts');
const {purchaseTicket,restoreTickets,supportsPurchases,purchaseError}=await load('../src/lib/freshStart.ts');
const response=(status,extra={})=>({resultType:'SUCCESS',success:{orderId:'order-1',sku:SKU,status,...extra}});
test('only paid matching orders pass server verification',()=>{
 for(const status of ['PURCHASED','PAYMENT_COMPLETED']) assert.equal(verifyOrder(response(status),'order-1'),'paid');
 assert.equal(verifyOrder(response('REFUNDED'),'order-1'),'refunded');
 for(const status of ['FAILED','NOT_FOUND','MINIAPP_MISMATCH','ORDER_IN_PROGRESS','ERROR']) assert.throws(()=>verifyOrder(response(status),'order-1'));
 for(const body of [null,{},response('PURCHASED',{sku:'wrong'}),response('PURCHASED',{orderId:'wrong'}),{...response('PURCHASED'),resultType:'FAIL'}]) assert.throws(()=>verifyOrder(body,'order-1'));
});
test('purchase identity uses only immutable server metadata',()=>{
 assert.equal(trustedTossKey({app_metadata:{toss_user_key:'12345'}}),'12345');
 for(const user of [{user_metadata:{toss_user_key:'12345'}},{app_metadata:{toss_user_key:12345}},{app_metadata:{toss_user_key:'0'}},{app_metadata:{toss_user_key:'99999999999999999'}}]) assert.throws(()=>trustedTossKey(user));
});
test('SDK callback waits for server grant; a failed grant is never acknowledged',async()=>{
 let params; let cleanups=0; let finished=0;let granted=0;
 const sdk={createOneTimePurchaseOrder:p=>{params=p;return ()=>cleanups++;}};
 const dispose=purchaseTicket(sdk,async()=>{granted++;},()=>finished++);
 assert.equal(await params.options.processProductGrant({orderId:'order-1'}),true);
 assert.equal(granted,1);assert.equal(finished,0);
 params.onEvent({type:'success'});params.onEvent({type:'success'});
 assert.equal(finished,1);assert.equal(cleanups,1);dispose();
 purchaseTicket(sdk,async()=>{throw Error('offline');},()=>{});
 assert.equal(await params.options.processProductGrant({orderId:'order-2'}),false);
});
test('synchronous success still cleans up and cancellation never grants',()=>{
 let cleaned=0;let done=0;
 purchaseTicket({createOneTimePurchaseOrder:p=>{p.onEvent({type:'success'});return ()=>cleaned++;}},async()=>{},()=>done++);
 assert.equal(done,1);assert.equal(cleaned,1);
 purchaseTicket({createOneTimePurchaseOrder:p=>{p.onError({code:'USER_CANCELED'});return ()=>{};}},()=>{throw Error('must not grant');},e=>assert.match(purchaseError(e),/취소/));
});
test('restore grants before SDK acknowledgement, filters SKU and shares in-flight work',async()=>{
 const events=[];
 const sdk={getPendingOrders:async()=>({orders:[{orderId:'order-1',sku:SKU},{orderId:'other',sku:'other'}]}),completeProductGrant:async p=>{events.push(`ack:${p.params.orderId}`);return true;}};
 const grant=async id=>{events.push(`grant:${id}`);};
 const [a,b]=await Promise.all([restoreTickets(sdk,grant),restoreTickets(sdk,grant)]);
 assert.equal(a,1);assert.equal(b,1);assert.deepEqual(events,['grant:order-1','ack:order-1']);
});
test('failed delivery stays recoverable and does not acknowledge the order',async()=>{
 let ack=0;
 const sdk={getPendingOrders:async()=>({orders:[{orderId:'order-1',sku:SKU}]}),completeProductGrant:async()=>{ack++;return true;}};
 await assert.rejects(restoreTickets(sdk,async()=>{throw Error('offline');}));assert.equal(ack,0);
 assert.equal(await restoreTickets(sdk,async()=>{}),1);assert.equal(ack,1);
 sdk.completeProductGrant=async()=>false;
 await assert.rejects(restoreTickets(sdk,async()=>{}),/PRODUCT_NOT_GRANTED/);
});
test('unsupported clients cannot purchase',()=>{
 const supported=Object.assign(()=>{},{isSupported:()=>true});
 assert.equal(supportsPurchases({getProductItemList:supported,getPendingOrders:supported,completeProductGrant:supported,createOneTimePurchaseOrder:supported}),true);
 assert.equal(supportsPurchases({}),false);
});
