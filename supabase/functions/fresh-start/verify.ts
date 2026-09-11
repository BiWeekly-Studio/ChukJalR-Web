export const SKU = 'ait.0000072177.d2cc5053.4c3aea389e.8761666150';
export function trustedTossKey(user: { app_metadata?: Record<string, unknown> }): string {
  const key = user.app_metadata?.toss_user_key;
  if (typeof key !== 'string' || !/^[1-9][0-9]*$/.test(key) || !Number.isSafeInteger(Number(key))) {
    throw new Error('TOSS_LOGIN_REQUIRED');
  }
  return key;
}
export function verifyOrder(body: unknown, orderId: string): 'paid' | 'refunded' {
  const value = body as { resultType?: string; success?: { orderId?: string; sku?: string; status?: string } };
  const order = value?.success;
  if (value?.resultType !== 'SUCCESS' || order?.orderId !== orderId || order?.sku !== SKU) {
    throw new Error('ORDER_VERIFICATION_FAILED');
  }
  if (order.status === 'REFUNDED') return 'refunded';
  if (order.status === 'PAYMENT_COMPLETED' || order.status === 'PURCHASED') return 'paid';
  throw new Error('ORDER_NOT_PAID');
}
