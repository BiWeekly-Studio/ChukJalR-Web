// Run with PGLITE_MODULE pointing to the installed @electric-sql/pglite entry point.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema auth;create table auth.users(id uuid primary key,raw_app_meta_data jsonb);
create table profiles(id uuid primary key references auth.users,league_order int[],favorite_team_ids int[],onboarded_at timestamptz);
create table fixtures(id bigint primary key,league_id int,home_team_id int,away_team_id int,kickoff_at timestamptz,lock_at timestamptz,opens_at timestamptz,state text);
create table predictions(id bigint primary key,user_id uuid,fixture_id bigint);
create table settlements(prediction_id bigint,user_id uuid,fixture_id bigint,settled_at timestamptz);
create function invoke_function(text,text default '') returns bigint language sql as 'select 1::bigint';
create schema cron;create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';`);
await db.exec(readFileSync('supabase/migrations/20260908000038_toss_notifications.sql','utf8'));
const u='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
await db.exec(`insert into auth.users values ('${u}','{"toss_user_key":"123"}'),('${other}','{}');
insert into profiles values ('${u}','{39}','{1}',now()),('${other}','{39}','{1}',now());
insert into fixtures values
(1,39,1,2,now()+interval '19 minutes',now()+interval '14 minutes',now()-interval '1 hour','SCHEDULED'),
(2,39,1,2,now()+interval '9 minutes',now()+interval '4 minutes',now()-interval '1 hour','SCHEDULED'),
(3,39,1,2,now()+interval '59 minutes',now()+interval '54 minutes',now()-interval '1 hour','SCHEDULED'),
(4,39,1,2,now()-interval '2 hours',now()-interval '125 minutes',now()-interval '4 hours','FINISHED'),
(5,39,1,2,now()-interval '1 day',now()-interval '1 day',now()-interval '2 days','VOID');
insert into predictions values(2,'${u}',2),(4,'${u}',4);
insert into settlements values(4,'${u}',4,now()-interval '1 minute');
insert into toss_notification_preferences select '${u}',kind,true,now()-interval '1 day' from toss_notification_templates;
insert into toss_notification_preferences select '${other}',kind,true,now()-interval '1 day' from toss_notification_templates;`);
assert.equal((await db.query('select * from claim_toss_notifications()')).rows.length,0,'unapproved templates cannot send');
await db.exec('update toss_notification_templates set approved=true');
let rows=[];for(let i=0;i<5;i++)rows.push(...(await db.query('select * from claim_toss_notifications()')).rows);
assert.deepEqual(rows.map(x=>x.kind).sort(),['chat','kickoff','lock','settlement']);
assert.ok(rows.every(x=>x.user_id===u),'native accounts excluded');
assert.equal((await db.query('select * from claim_toss_notifications()')).rows.length,0,'unique claim prevents duplicate');
await db.exec(`delete from toss_notification_deliveries;update toss_notification_preferences set enabled=false;`);
assert.equal((await db.query('select * from claim_toss_notifications()')).rows.length,0,'opt-out prevents send');
await db.exec(`update toss_notification_preferences set enabled=true,enabled_at=now();`);
assert.equal((await db.query('select * from claim_toss_notifications()')).rows.length,0,'no catch-up on enabling');
await db.exec(`update toss_notification_preferences set enabled_at=now()-interval '1 day';update fixtures set state='VOID';`);
assert.equal((await db.query('select * from claim_toss_notifications()')).rows.length,0,'void matches excluded');
const permissions=await db.query(`select has_function_privilege('authenticated','claim_toss_notifications(integer)','execute') as client,has_table_privilege('authenticated','toss_notification_deliveries','insert') as writes`);
assert.deepEqual(permissions.rows,[{client:false,writes:false}]);
await db.close();console.log('PASS: notification scheduling, four kinds, consent/preferences, approval gate, duplicate suppression, cancelled matches and privileges');
