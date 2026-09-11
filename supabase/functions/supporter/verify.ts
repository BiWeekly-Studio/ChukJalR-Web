const statuses = ['ACTIVE','EXPIRED','IN_GRACE_PERIOD','ON_HOLD','PAUSED','REVOKED'];
export function verifySupporterOrder(value: unknown, id: string, sku: string) {
  const body = value as {resultType?: string; success?: {orderId?: string; sku?: string; status?: string}};
  const o = body?.success;
  if (!sku || body?.resultType !== 'SUCCESS' || o?.orderId !== id || o?.sku !== sku)
    throw new Error('ORDER_VERIFICATION_FAILED');
  if (!['PAYMENT_COMPLETED','PURCHASED'].includes(o.status ?? '')) throw new Error('ORDER_NOT_PAID');
}
export function paymentEvent(value: unknown, sku: string, localOffset?: string) {
  const b = value as {eventType?: string; eventVersion?: string; orderId?: string; sku?: string; occurredAt?: string;
    subscription?: {current?: {status?: string; accessGranted?: boolean; expiresAt?: string | null; autoRenew?: boolean}}};
  const s = b?.subscription?.current;
  if (!sku || b?.sku !== sku || b.eventType !== 'subscription.status_changed' || b.eventVersion !== '1.0' ||
    typeof b.orderId !== 'string' || !b.orderId || b.orderId.length>200 || !s ||
    !statuses.includes(s.status ?? '') || typeof s.accessGranted !== 'boolean' || typeof s.autoRenew !== 'boolean')
    throw new Error('INVALID_EVENT');
  // The provider sends local ISO dates. Require an explicitly verified offset;
  // never let the server host timezone determine paid access.
  const date = (v: unknown): string => {
    if (typeof v !== 'string') throw new Error('INVALID_EVENT_TIME');
    if (!/(Z|[+-]\d\d:\d\d)$/.test(v)) {
      if (!localOffset || !/^[+-](0\d|1[0-4]):[0-5]\d$/.test(localOffset) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(v)) throw new Error('INVALID_EVENT_TIME');
      v += localOffset;
    }
    const parsed=Date.parse(v as string);
    if(!Number.isFinite(parsed))throw new Error('INVALID_EVENT_TIME');
    return new Date(parsed).toISOString();
  };
  return {p_order:b.orderId,p_sku:sku,p_status:s.status!,p_access:s.accessGranted && ['ACTIVE','IN_GRACE_PERIOD'].includes(s.status!),
    p_expires:s.expiresAt===null?null:date(s.expiresAt),p_renew:s.autoRenew,p_event_at:date(b.occurredAt)};
}
