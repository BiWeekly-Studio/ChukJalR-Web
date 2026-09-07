import { createClient } from 'jsr:@supabase/supabase-js@2';
const headers = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'https://apps-in-toss.toss.im', 'Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info,x-region', 'Access-Control-Allow-Methods':'POST,OPTIONS' };
const reply = (status: number) => new Response(JSON.stringify({ok:status===200}),{status,headers});
Deno.serve(async req => {
  if(req.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if(req.method !== 'POST') return reply(405);
  const secret=Deno.env.get('TOSS_UNLINK_SECRET');
  if(!secret) return reply(503);
  const expected=`Basic ${btoa(secret)}`;
  const incoming=req.headers.get('authorization') ?? '';
  const hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [a,b]=await Promise.all([hash(expected),hash(incoming)]);
  if(a.reduce((n,x,i)=>n|(x^b[i]),0)!==0) return reply(401);
  let body;
  try {body=await req.json();} catch {return reply(400);}
  if(!body || !['UNLINK','WITHDRAWAL_TERMS','WITHDRAWAL_TOSS'].includes(body.referrer)) return reply(400);
  const key=String(body.userKey ?? '');
  if(!/^[0-9]+$/.test(key)) return reply(400);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {error}=await admin.rpc('unlink_toss_user',{p_user_key:key});
  return reply(error?500:200);
});
