import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const source=readFileSync(new URL('../src/lib/settlementRecap.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {recapTotals,recapPick}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('recap sums actual settled rating changes separately from earned points, including losses and zero',()=>{
 assert.deepEqual(recapTotals([{correct:true,deltaRating:18,points:24},{correct:false,deltaRating:-9,points:3},{correct:false,deltaRating:-15,points:3}]),{correct:1,delta:-6,points:30});
 assert.deepEqual(recapTotals([]),{correct:0,delta:0,points:0});
 assert.deepEqual(recapTotals([{correct:false,deltaRating:0,points:3}]),{correct:0,delta:0,points:3});
});
test('recap names the chosen team or draw',()=>{
 const item={homeName:'대한민국',awayName:'일본'};
 assert.equal(recapPick({...item,pick:'HOME'}),'대한민국 승');assert.equal(recapPick({...item,pick:'AWAY'}),'일본 승');assert.equal(recapPick({...item,pick:'DRAW'}),'무승부');
});
