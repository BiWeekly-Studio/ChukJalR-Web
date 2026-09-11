import { createClient } from 'jsr:@supabase/supabase-js@2';
import { applyTransaction, verifySigned, PurchaseError } from '../_shared/apple/index.ts';
Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('{}', { status: 405 });
  try {
    const raw = await req.text();
    if (raw.length > 65000) throw new PurchaseError('INVALID_REQUEST');
    const { signedPayload } = JSON.parse(raw);
    const { decoded, verifier } = await verifySigned(signedPayload, true);
    const notification = decoded as any;
    if (notification.notificationType === 'TEST') return Response.json({ ok: true });
    if (!notification.data?.signedTransactionInfo) return Response.json({ ok: true });
    const tx = await verifier.verifyAndDecodeTransaction(notification.data.signedTransactionInfo);
    const renewal = notification.data.signedRenewalInfo
      ? await verifier.verifyAndDecodeRenewalInfo(notification.data.signedRenewalInfo) : undefined;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    await applyTransaction(admin, tx, undefined, renewal);
    return Response.json({ ok: true });
  } catch (error) {
    const known = error instanceof PurchaseError;
    return Response.json({ error: known ? error.message : 'DELIVERY_PENDING' }, { status: known ? error.status : 503 });
  }
});
