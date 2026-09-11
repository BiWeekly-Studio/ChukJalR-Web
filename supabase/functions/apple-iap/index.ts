import { createClient } from 'jsr:@supabase/supabase-js@2';
import { currentTransaction, refreshAppleTransaction, Environment, purchaseSnapshot, PurchaseError, TICKET } from '../_shared/apple/index.ts';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Content-Type': 'application/json' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response('{}', { status: 405, headers });
  try {
    const auth = req.headers.get('authorization') ?? '';
    if (!auth.startsWith('Bearer ')) throw new PurchaseError('LOGIN_REQUIRED', 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: { user }, error } = await admin.auth.getUser(auth.slice(7));
    if (error || !user) throw new PurchaseError('LOGIN_REQUIRED', 401);
    const text = await req.text();
    if (text.length > 65000) throw new PurchaseError('INVALID_REQUEST');
    const body = JSON.parse(text);
    if (body.action === 'verify') {
      await currentTransaction(body.signedTransaction, admin, user.id);
    } else if (body.action === 'start') {
      if (typeof body.orderId !== 'string' || !/^apple:(Production|Sandbox):\d+$/.test(body.orderId)) throw new PurchaseError('INVALID_ORDER');
      const { data: order } = await admin.from('fresh_start_orders').select('sku').eq('order_id', body.orderId).eq('user_id', user.id).maybeSingle();
      if (order?.sku !== TICKET) throw new PurchaseError('ORDER_NOT_FOUND');
      // StoreKit sends the signed transaction again for verification before use.
      const [, env, transactionID] = body.orderId.split(':');
      await refreshAppleTransaction(transactionID, env as Environment, admin, user.id);
      const { error } = await admin.rpc('fresh_start_action', { p_user: user.id, p_action: 'start', p_order: body.orderId });
      if (error) throw new PurchaseError(error.message.includes('REFUNDED') ? 'ORDER_REFUNDED' : 'START_FAILED');
    } else if (body.action === 'team') {
      if (!Number.isSafeInteger(body.teamId)) throw new PurchaseError('INVALID_TEAM');
      const status = await purchaseSnapshot(admin, user.id);
      if (!status.supporter.active) throw new PurchaseError('SUBSCRIPTION_REQUIRED');
      const { error } = await admin.from('supporter_profiles').upsert({ user_id: user.id, team_id: body.teamId });
      if (error) throw new PurchaseError('TEAM_SAVE_FAILED');
    } else if (body.action !== 'status') throw new PurchaseError('INVALID_ACTION');
    return new Response(JSON.stringify(await purchaseSnapshot(admin, user.id)), { headers });
  } catch (error) {
    const known = error instanceof PurchaseError;
    // Never log signed purchases, user tokens, Apple credentials or raw payloads.
    return new Response(JSON.stringify({ error: known ? error.message : 'VERIFICATION_PENDING' }), { status: known ? error.status : 503, headers });
  }
});
