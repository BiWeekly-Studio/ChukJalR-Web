// Only the previously authorized owner's account. Generates an auth link without
// sending email; the temporary verification session is revoked at the end.
import {execFileSync} from 'node:child_process';
import {writeFileSync,unlinkSync} from 'node:fs';
import {createClient,FunctionRegion} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const ref='nqkytgbbvlemeoljibmf';
const mode=process.argv[2];
if(!['prepare','test','live','inspect'].includes(mode))throw new Error('Choose prepare, test, live, or inspect');
async function main() {
  const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(`https://${ref}.supabase.co`,keys.find(k=>k.name==='service_role').api_key,options);
  const client=createClient(`https://${ref}.supabase.co`,keys.find(k=>k.name==='anon').api_key,options);
  // The original automatic handle embeds the first six UUID digits. Resolve
  // that same account even if its owner has since edited the visible handle.
  const profile=await admin.from('profiles').select('id').gte('id','97b28200-0000-0000-0000-000000000000').lt('id','97b28300-0000-0000-0000-000000000000').single();
  assert.ifError(profile.error);
  const found=await admin.auth.admin.getUserById(profile.data.id);assert.ifError(found.error);
  const user=found.data.user;
  assert.ok(user.email?.endsWith('@toss.invalid')&&user.app_metadata?.toss_user_key,'owner must have a verified Toss identity');
  if(mode==='prepare') {
    const path='/tmp/chukjalr-promotion-test-owner.env';
    writeFileSync(path,`TOSS_PROMOTION_TEST_USER_ID=${user.id}\n`,{mode:0o600});
    try {execFileSync('supabase',['secrets','set','--project-ref',ref,'--env-file',path],{stdio:['ignore','pipe','pipe']});}finally{unlinkSync(path);}
    console.log('Configured the owner-only TEST promotion identity.');return;
  }
  const inspect=async()=>{
    const {data,error}=await admin.from('toss_promotion_rewards').select('promotion_code,status,amount,error_code,paid_at,attempted_at').eq('user_id',user.id);
    assert.ifError(error);return data;
  };
  if(mode==='inspect'){console.log(JSON.stringify(await inspect()));return;}
  const link=await admin.auth.admin.generateLink({type:'magiclink',email:user.email});assert.ifError(link.error);
  const auth=await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});assert.ifError(auth.error);
  const invoke=async body=>{
    const res=await client.functions.invoke('toss-promotion',{region:FunctionRegion.ApNortheast2,body});
    if(res.error){let detail;try{detail=await res.error.context?.json();}catch{}throw new Error('Promotion invoke failed: '+JSON.stringify(detail??{message:res.error.message}));}
    return res.data;
  };
  try {
    const input={action:'claim',...(mode==='test'?{test:true}:{})};
    const first=await invoke(input);
    console.log(JSON.stringify({mode,first}));
    assert.ok(['paid','pending','retry','ended'].includes(first.status));
    if(first.status==='paid') {
      const repeated=await Promise.all([invoke(input),invoke(input)]);
      assert.ok(repeated.every(r=>r.status==='paid'&&r.newlyPaid===false));
      const forged=await client.functions.invoke('toss-promotion',{region:FunctionRegion.ApNortheast2,body:{...input,amount:500}});
      assert.ok(forged.error,'client cannot choose the amount');
      const unauth=await fetch(`https://${ref}.supabase.co/functions/v1/toss-promotion`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
      assert.equal(unauth.status,401);
      assert.ok((await client.rpc('acquire_first_visit_reward',{p_code:'forged',p_identity:'a'.repeat(64),p_user:user.id,p_token:crypto.randomUUID()})).error);
      console.log('PASS: confirmed payment, two repeated calls without payment, forged amount denied, anonymous request denied and direct ledger RPC denied.');
    }
    console.log(JSON.stringify({ledger:await inspect()}));
  } finally {await client.auth.signOut({scope:'local'});}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
