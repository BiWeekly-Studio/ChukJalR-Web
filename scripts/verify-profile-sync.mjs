// Creates and removes one isolated verification account. Requires an authenticated Supabase CLI.
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const ref=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8'}));
const service=keys.find(k=>k.name==='service_role')?.api_key;
assert(service,'Service role unavailable');
const admin=createClient(env.VITE_SUPABASE_URL,service,{auth:{persistSession:false}});
const email=`sync-check-${randomUUID()}@example.invalid`, password=randomUUID()+'aA1!';
let id;
const modulePath=new URL('../src/data/.sync-verification.mjs',import.meta.url);
try {
 fs.writeFileSync(modulePath,ts.transpile(fs.readFileSync('src/data/supabaseRepository.ts','utf8'),{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}));
 const {createSupabaseRepository}=await import(modulePath);
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(made.error);id=made.data.user.id;
 const repo=createSupabaseRepository(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY);
 await repo.auth.signIn(email,password);
 assert.equal((await repo.auth.current()).id,id);
 assert.deepEqual(await repo.loadHistory(),[]);
 const handle=`검증${randomUUID().replaceAll('-','').slice(0,8)}`;
 assert.equal(await repo.setHandle(handle),handle);
 assert.equal((await repo.loadMe()).handle,handle);
 await assert.rejects(repo.setHandle(handle+'x'),/7일/);
 // Valid tiny JPEG fixture; never uses a user's photo.
 const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==','base64');
 const url=await repo.setAvatar(new Blob([jpeg],{type:'image/jpeg'}));
 assert.equal((await repo.loadMe()).avatarUrl,url);
 assert.equal((await fetch(url)).status,200);
 await repo.removeAvatar();assert.equal((await repo.loadMe()).avatarUrl,null);
 await repo.deleteAccount();assert.equal(await repo.auth.current(),null);
 const gone=await admin.auth.admin.getUserById(id);assert(gone.error);
 console.log('PASS: history, nickname persistence/cooldown, avatar upload/read/remove, account deletion and session cleanup.');
} finally {
 if(id) await admin.auth.admin.deleteUser(id);
 fs.rmSync(modulePath,{force:true});
}
