import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const uri = source => `data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`;
const shared = readFileSync(new URL('../supabase/functions/sync-fixtures/competitions.ts',import.meta.url),'utf8');
const {scheduleDates,isSupportedCompetition,competitionLabel} = await import(uri(shared));
test('international support includes UEFA cups and every supported World ID except nonstandard Kings football',()=>{
 const ids=new Set([2,3,848,10,30,850,666,1213]);
 for(const id of [39,61,2,3,848,10,30,850,666]) assert.equal(isSupportedCompetition(id,ids),true);
 for(const id of [1213,123456,40]) assert.equal(isSupportedCompetition(id,ids),false);
 assert.equal(competitionLabel(848,'UEFA Europa Conference League').short_name,'컨퍼런스');
});
test('date window crosses calendar and European-season boundaries without guessed season IDs',()=>{
 const dates=scheduleDates(new Date('2027-01-01T23:59:00Z'),30);
 assert.equal(dates.length,34);assert.equal(dates[0],'2026-12-29');assert.equal(dates.at(-1),'2027-01-31');
});
test('schedule preserves club identity, records multiple memberships, deduplicates and uses actual fixture seasons',async()=>{
 const source=readFileSync(new URL('../supabase/functions/sync-fixtures/index.ts',import.meta.url),'utf8')
  .replace("import { competitionLabel, isSupportedCompetition, scheduleDates } from './competitions.ts';",shared.replaceAll('export ',''))
  .replace('Deno.serve(async','void (async')+'\nexport {syncSchedule};';
 const {syncSchedule}=await import(uri(source));
 const fixture=(id,league,season)=>({fixture:{id,date:'2026-09-27T12:00:00Z',status:{short:'NS'},venue:{name:null}},league:{id:league,season,round:'League Stage - 1'},teams:{home:{id:42,name:'Arsenal'},away:{id:999,name:'Visitor'}},score:{fulltime:{home:null,away:null}}});
 const writes=[],paths=[];
 const sb={select:async()=>[{id:42,league_id:39}],upsert:async(table,rows)=>writes.push({table,rows})};
 const api={get:async path=>{paths.push(path);return {response:path.startsWith('/leagues')?[{league:{id:2,name:'Champions League',logo:'logo'}}]:[fixture(123,2,2027),fixture(456,39,2026),fixture(789,40,2026)]};}};
 const result=await syncSchedule(sb,api,2026);
 assert.equal(result.fixtures,2);
 assert.equal(writes.find(x=>x.table==='teams').rows.find(x=>x.id===42).league_id,39);
 const memberships=writes.find(x=>x.table==='team_competitions').rows;
 assert.ok(memberships.some(x=>x.team_id===42 && x.league_id===2));
 assert.ok(memberships.some(x=>x.team_id===42 && x.league_id===39));
 assert.equal(writes.find(x=>x.table==='fixtures').rows.find(x=>x.id===123).season,2027);
 assert.ok(paths.slice(1).every(x=>x.startsWith('/fixtures?date=')));
});
test('catalog pagination returns more than 1000 rows and surfaces later-page errors',async()=>{
 const source=readFileSync(new URL('../src/data/supabaseRepository.ts',import.meta.url),'utf8');
 const {allRows}=await import(uri(source.slice(source.lastIndexOf('async function allRows<T>'))+'\nexport {allRows};'));
 const records=Array.from({length:1562},(_,id)=>({id}));
 const result=await allRows(async(a,b)=>({data:records.slice(a,b+1),error:null}));
 assert.deepEqual(result.data,records);assert.equal(result.error,null);
 const failed=await allRows(async(a,b)=>a===500?{data:null,error:'offline'}:{data:records.slice(a,b+1),error:null});
 assert.equal(failed.error,'offline');
});

test('major group is exactly the requested eight, including Ligue 1',async()=>{
 const {MAJOR_COMPETITION_IDS,isMajorCompetition}=await import(uri(readFileSync(new URL('../src/lib/competitions.ts',import.meta.url),'utf8')));
 assert.deepEqual(MAJOR_COMPETITION_IDS,[39,78,61,140,135,2,3,848]);
 for(const id of [1,4,5,10,30,850,666])assert.equal(isMajorCompetition(id),false);
 const swift=readFileSync(new URL('../ios/Sources/CompetitionCatalog.swift',import.meta.url),'utf8');
 assert.ok(swift.includes('[39,78,61,140,135,2,3,848]'));
});
