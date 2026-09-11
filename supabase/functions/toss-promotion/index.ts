import {createClient} from 'jsr:@supabase/supabase-js@2';
import {trustedTossKey} from '../fresh-start/verify.ts';
import {AMOUNT, PROMOTION_CODE, STARTS_AT, ENDS_AT, settleReward} from './reward.ts';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-region','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});

Deno.serve(async req => {
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const bearer=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!bearer)return json({error:'LOGIN_REQUIRED'},401);
  const {data:{user},error}=await admin.auth.getUser(bearer);
  if(error||!user)return json({error:'LOGIN_REQUIRED'},401);
  let client: {close():void}|undefined;
  let identity: string|undefined;
  let promotionCode=PROMOTION_CODE;
  let token: string|undefined;
  try {
    const userKey=trustedTossKey(user);
    const body=await req.json();
    if(!['claim','status'].includes(body.action) || Object.keys(body).some(k=>!['action','test'].includes(k)))return json({error:'BAD_REQUEST'},400);
    if(body.test === true) {
      if(user.id !== Deno.env.get('TOSS_PROMOTION_TEST_USER_ID'))return json({error:'FORBIDDEN'},403);
      promotionCode='TEST_'+PROMOTION_CODE;
    } else if(body.test !== undefined && body.test !== false)return json({error:'BAD_REQUEST'},400);
    const pepper=Deno.env.get('TOSS_AUTH_PEPPER');
    const cert=Deno.env.get('TOSS_CLIENT_CERT'),privateKey=Deno.env.get('TOSS_CLIENT_KEY');
    if(!pepper||!cert||!privateKey)throw new Error('SERVER_NOT_CONFIGURED');
    const hmac=await crypto.subtle.importKey('raw',new TextEncoder().encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    identity=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',hmac,new TextEncoder().encode('first-visit:'+userKey))),b=>b.toString(16).padStart(2,'0')).join('');
    const row=()=>admin.from('toss_promotion_rewards').select('*').eq('promotion_code',promotionCode).eq('identity_hash',identity!);
    const existing=await row().maybeSingle();
    if(existing.error)throw new Error('REWARD_STORAGE_FAILED');
    if(existing.data?.status==='paid')return json({status:'paid',amount:AMOUNT,newlyPaid:false});
    if(body.action==='status')return json({status:existing.data?.attempted_at?'pending':Date.now()<ENDS_AT&&Date.now()>=STARTS_AT?'retry':'ended',amount:AMOUNT,newlyPaid:false});
    if(!existing.data?.attempted_at && (Date.now()<STARTS_AT||Date.now()>=ENDS_AT))return json({status:'ended',amount:AMOUNT,newlyPaid:false});
    token=crypto.randomUUID();
    const reserved=await admin.rpc('acquire_first_visit_reward',{p_code:promotionCode,p_identity:identity,p_user:user.id,p_token:token});
    if(reserved.error)throw new Error('REWARD_STORAGE_FAILED');
    if(!reserved.data.acquired)return json({status:reserved.data.status==='paid'?'paid':reserved.data.status==='failed'?'retry':'pending',amount:AMOUNT,newlyPaid:false});
    client=Deno.createHttpClient({cert,key:privateKey});
    const saved=await settleReward(reserved.data,promotionCode,{
      now:()=>Date.now(),
      async save(patch) {
        const updated=await admin.from('toss_promotion_rewards').update(patch)
          .eq('promotion_code',promotionCode).eq('identity_hash',identity!).eq('lease_token',token!).select('identity_hash').single();
        if(updated.error)throw new Error('REWARD_STORAGE_FAILED');
      },
      async request(path,payload) {
        const response=await fetch('https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/promotion/'+path,{
          method:'POST',headers:{'Content-Type':'application/json','x-toss-user-key':userKey},
          ...(payload?{body:JSON.stringify(payload)}:{}),client,signal:AbortSignal.timeout(8000),
        } as RequestInit);
        const parsed=await response.json();
        if(!parsed || typeof parsed!=='object'||(!response.ok&&parsed.resultType==='SUCCESS'))throw new Error('PROVIDER_UNAVAILABLE');
        return parsed;
      },
    });
    return json(saved);
  } catch(error) {
    const code=error instanceof Error?error.message:'UNEXPECTED';
    if(code==='TOSS_LOGIN_REQUIRED')return json({error:code},403);
    console.error('First visit reward failed', ['SERVER_NOT_CONFIGURED','REWARD_STORAGE_FAILED'].includes(code)?code:'PROVIDER_UNAVAILABLE');
    // The client must not treat an unknown result as paid. The durable record
    // is reconciled on the next entry or when the user taps Check again.
    return json({status:'pending',amount:AMOUNT,newlyPaid:false});
  } finally {
    client?.close();
    if(identity&&token)await admin.from('toss_promotion_rewards').update({lease_token:null,lease_until:null})
      .eq('promotion_code',promotionCode).eq('identity_hash',identity).eq('lease_token',token);
  }
});
