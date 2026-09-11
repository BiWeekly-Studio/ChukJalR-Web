import { createClient } from 'jsr:@supabase/supabase-js@2';
import { paymentEvent } from '../supporter/verify.ts';
Deno.serve(async req=>{
  if(req.method!=='POST')return new Response(null,{status:405});
  const secret=Deno.env.get('TOSS_SUPPORTER_WEBHOOK_BASIC');
  if(!secret)return new Response(null,{status:503});
  const supplied=req.headers.get('authorization')??'';
  // Hash both values to fixed length before constant-time comparison.
  const hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const a=await hash(supplied);
  // Docs describe Basic; the production console verification sends Bearer.
  // Both must carry the exact same high-entropy server secret.
  const candidates=await Promise.all([`Basic ${secret}`,`Bearer ${secret}`].map(hash));
  if(!candidates.some(b=>a.reduce((n,v,i)=>n|(v^b[i]),0)===0))return new Response(null,{status:401});
  try{
    const body=await req.json();
    if(body?.eventType==='callback.registration_verification'){
      if(typeof body.occurredAt!=='string' || body.occurredAt.length>64)return new Response(null,{status:400});
      const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const {error}=await admin.from('supporter_callback_health').upsert({id:1,occurred_at:body.occurredAt,received_at:new Date().toISOString()});
      return new Response(null,{status:error?500:200});
    }
    const event=paymentEvent(body,Deno.env.get('TOSS_SUPPORTER_SKU')??'',Deno.env.get('TOSS_SUBSCRIPTION_TIME_OFFSET'));
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const {error}=await admin.rpc('supporter_payment_event',event);
    return new Response(null,{status:error?500:200});
  }catch{return new Response(null,{status:400});}
});
