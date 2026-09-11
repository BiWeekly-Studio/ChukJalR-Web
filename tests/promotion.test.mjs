import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const {outputText}=ts.transpileModule(readFileSync(new URL('../supabase/functions/toss-promotion/reward.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const {settleReward,PROMOTION_CODE,ENDS_AT}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const NOW=Date.parse('2026-09-11T12:00:00+09:00');
const ok=success=>({resultType:'SUCCESS',success});
const fail=errorCode=>({resultType:'FAIL',error:{errorCode}});
function harness(record={},responses=[]) {
  const row={status:'new',reward_key:null,key_created_at:null,attempted_at:null,acquired:true,...record};
  const calls=[],writes=[];
  let now=NOW;
  const io={now:()=>now,async save(patch){writes.push({...patch});Object.assign(row,patch);},async request(path,body){
    calls.push({path,body});
    if(path==='execute-promotion')assert.ok(row.attempted_at,'attempt is persisted before payout');
    const next=responses.shift();if(next instanceof Error)throw next;
    assert.ok(next,'unexpected provider request');return next;
  }};
  return {row,calls,writes,io,run:()=>settleReward({...row},PROMOTION_CODE,io),setTime:value=>{now=value;}};
}
test('first claim persists its key and pays exactly 50; repeats perform no payout',async()=>{
  const h=harness({},[ok({key:'k1'}),ok({key:'k1'}),ok('SUCCESS')]);
  assert.deepEqual(await h.run(),{status:'paid',amount:50,newlyPaid:true});
  assert.equal(h.calls[1].body.amount,50);assert.equal(h.calls[1].body.promotionCode,PROMOTION_CODE);
  assert.equal(h.writes[0].reward_key,'k1');
  assert.deepEqual(await h.run(),{status:'paid',amount:50,newlyPaid:false});
  assert.equal(h.calls.length,3);
});
test('concurrent claim that does not own the lease cannot contact Toss',async()=>{
  const h=harness({acquired:false});assert.equal((await h.run()).status,'pending');assert.equal(h.calls.length,0);
});
test('network loss after payout reconciles the same key without executing again',async()=>{
  const h=harness({},[ok({key:'k1'}),new Error('timeout'),ok('SUCCESS')]);
  await assert.rejects(h.run(),/timeout/);
  assert.equal(h.row.reward_key,'k1');assert.ok(h.row.attempted_at);
  assert.equal((await h.run()).status,'paid');
  assert.equal(h.calls.filter(c=>c.path==='execute-promotion').length,1);
});
test('pending and unknown results never allocate another key, even after expiry',async()=>{
  for(const answer of [ok('PENDING'),fail('5000'),fail('4111')]) {
    const h=harness({status:'pending',reward_key:'old',key_created_at:new Date(NOW-2*3600000).toISOString(),attempted_at:new Date(NOW-2*3600000).toISOString()},[answer]);
    assert.equal((await h.run()).status,'pending');assert.deepEqual(h.calls.map(c=>c.path),['execution-result']);assert.equal(h.row.reward_key,'old');
  }
});
test('not-found execution can retry only its original unexpired key; duplicate response is reconciled',async()=>{
  const h=harness({status:'pending',reward_key:'original',key_created_at:new Date(NOW-60000).toISOString(),attempted_at:new Date(NOW-60000).toISOString()},[fail('4111'),fail('4113'),ok('SUCCESS')]);
  assert.equal((await h.run()).status,'paid');assert.equal(h.calls[1].body.key,'original');
  assert.ok(!h.calls.some(c=>c.path.endsWith('get-key')));
});
test('explicit budget rejection is retryable, never reported as paid',async()=>{
  const h=harness({},[ok({key:'k1'}),fail('4112')]);
  assert.equal((await h.run()).status,'retry');assert.equal(h.row.reward_key,null);assert.equal(h.row.attempted_at,null);assert.equal(h.row.status,'failed');
});
test('definitive failed settlement clears the key for a later retry',async()=>{
  const h=harness({status:'pending',reward_key:'failed',key_created_at:new Date(NOW).toISOString(),attempted_at:new Date(NOW).toISOString()},[ok('FAILED')]);
  assert.equal((await h.run()).status,'retry');assert.equal(h.row.reward_key,null);
});
test('expired campaign cannot issue new payouts but can reconcile an existing one',async()=>{
  const h=harness();h.setTime(ENDS_AT);assert.equal((await h.run()).status,'ended');assert.equal(h.calls.length,0);
  const p=harness({status:'pending',reward_key:'old',key_created_at:new Date(NOW).toISOString(),attempted_at:new Date(NOW).toISOString()},[ok('SUCCESS')]);
  p.setTime(ENDS_AT);assert.equal((await p.run()).status,'paid');assert.equal(p.calls.length,1);
});
test('failed database write prevents the external payment',async()=>{
  const h=harness({},[ok({key:'k1'})]);h.io.save=async()=>{throw new Error('storage failed');};
  await assert.rejects(h.run(),/storage failed/);assert.equal(h.calls.length,1);
});
