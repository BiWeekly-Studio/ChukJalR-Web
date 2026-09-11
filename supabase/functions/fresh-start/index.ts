import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SKU, trustedTossKey, verifyOrder } from './verify.ts';
const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-region', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
const json = (body: unknown, status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req => {
  if (req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if (req.method!=='POST') return json({error:'METHOD_NOT_ALLOWED'},405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const bearer = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) return json({error:'LOGIN_REQUIRED'},401);
  const {data:{user},error:authError} = await admin.auth.getUser(bearer);
  if (authError || !user) return json({error:'LOGIN_REQUIRED'},401);
  let client: { close(): void } | undefined;
  try {
    const userKey = trustedTossKey(user);
    const body = await req.json();
    if (!['status','grant','start'].includes(body.action)) return json({error:'BAD_REQUEST'},400);
    const cert=Deno.env.get('TOSS_CLIENT_CERT'), key=Deno.env.get('TOSS_CLIENT_KEY');
    if (!cert || !key) throw new Error('SERVER_NOT_CONFIGURED');
    client = Deno.createHttpClient({cert,key});
    const check = async (orderId: string) => {
      const response = await fetch('https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/order/get-order-status',{
        method:'POST', headers:{'Content-Type':'application/json','x-toss-user-key':userKey},
        body:JSON.stringify({orderId}), client, signal:AbortSignal.timeout(10000),
      } as RequestInit);
      if (!response.ok) throw new Error('ORDER_VERIFICATION_FAILED');
      return verifyOrder(await response.json(),orderId);
    };
    const action = async (name: string, order: string | null = null) => {
      const {data,error} = await admin.rpc('fresh_start_action',{p_user:user.id,p_action:name,p_order:order,p_sku:SKU});
      if (error) throw new Error('TICKET_PROCESSING_FAILED');
      return data;
    };
    if (body.action !== 'status') {
      if (typeof body.orderId!=='string' || body.orderId.length<1 || body.orderId.length>200) return json({error:'BAD_REQUEST'},400);
      const state = await check(body.orderId);
      if (state==='refunded') {
        // Refund only an order already owned by this account; never mint a ticket.
        const {data:known} = await admin.from('fresh_start_orders').select('order_id').eq('user_id',user.id).eq('order_id',body.orderId).maybeSingle();
        if (known) await action('refund',body.orderId);
        return json({error:'ORDER_REFUNDED'},409);
      }
      if (body.action==='start') {
        // Paid-but-not-yet-acknowledged orders must finish SDK delivery first.
        const {data:known} = await admin.from('fresh_start_orders').select('order_id').eq('user_id',user.id).eq('order_id',body.orderId).maybeSingle();
        if (!known) return json({error:'ORDER_NOT_FOUND'},409);
      }
      const purchaseState = await action(body.action,body.orderId);
      purchaseState.tickets = purchaseState.tickets.filter((ticket: {orderId:string}) => !ticket.orderId.startsWith('apple:'));
      return json({...purchaseState,sku:SKU});
    }
    // Reconcile refunds, including previously consumed tickets. Do not erase history.
    const {data:orders,error:orderError} = await admin.from('fresh_start_orders').select('order_id').eq('user_id',user.id).eq('sku',SKU).is('refunded_at',null);
    if (orderError) throw new Error('TICKET_PROCESSING_FAILED');
    let verificationPending = false;
    for (let i=0;i<(orders?.length ?? 0);i+=8) {
      await Promise.all(orders!.slice(i,i+8).map(async order => {
        try { if (await check(order.order_id)==='refunded') await action('refund',order.order_id); }
        catch { verificationPending=true; }
      }));
    }
    const state = await action('status');
    state.tickets = state.tickets.filter((ticket: {orderId:string}) => !ticket.orderId.startsWith('apple:'));
    return json({...state,sku:SKU,verificationPending});
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNEXPECTED';
    const allowed = ['TOSS_LOGIN_REQUIRED','ORDER_VERIFICATION_FAILED','ORDER_NOT_PAID','SERVER_NOT_CONFIGURED','TICKET_PROCESSING_FAILED'];
    return json({error:allowed.includes(code)?code:'UNEXPECTED'},400);
  } finally { client?.close(); }
});
