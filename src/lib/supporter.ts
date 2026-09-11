export interface SupporterBadgeData { teamId: number; expiresAt: string | null }
export interface SupporterState {
  active: boolean; teamId: number | null; expiresAt: string | null;
  autoRenew: boolean; pending: boolean;
}
export function badgeIsActive(badge?: SupporterBadgeData | null, now = Date.now()) {
  return !!badge && Number.isInteger(badge.teamId) && badge.teamId > 0 &&
    (badge.expiresAt === null || Date.parse(badge.expiresAt) > now);
}
export const SUPPORTER_PRICE = 2200;

type Supported<T> = T & { isSupported(): boolean };
export interface SubscriptionSdk {
  getProductItemList: Supported<() => Promise<{products: {sku: string; type: string; renewalCycle?: string; displayAmount: string}[]} | undefined>>;
  getPendingOrders: Supported<() => Promise<{orders: {orderId: string; sku: string}[]} | undefined>>;
  completeProductGrant: Supported<(args: {params: {orderId: string}}) => Promise<boolean>>;
  createSubscriptionPurchaseOrder: Supported<(args: {
    options: {sku: string; processProductGrant(params: {orderId: string}): Promise<boolean>};
    onEvent(event: {type: string}): void; onError(error: unknown): void;
  }) => () => void>;
}
export function supportsSubscriptions(sdk: SubscriptionSdk) {
  return [sdk.getProductItemList, sdk.getPendingOrders, sdk.completeProductGrant, sdk.createSubscriptionPurchaseOrder]
    .every(fn => typeof fn === 'function' && typeof fn.isSupported === 'function' && fn.isSupported());
}
export async function restoreSupporter(sdk: SubscriptionSdk, sku: string, grant: (id: string) => Promise<SupporterState>) {
  const result = await sdk.getPendingOrders();
  if (!result) throw new Error('SDK_UNSUPPORTED');
  for (const order of result.orders) {
    if (order.sku !== sku) continue;
    const state = await grant(order.orderId);
    if (!state.active || state.pending) throw new Error('PAYMENT_PENDING');
    if (!await sdk.completeProductGrant({params: {orderId: order.orderId}})) throw new Error('PAYMENT_PENDING');
  }
}
export function subscribeSupporter(sdk: SubscriptionSdk, sku: string, grant: (id: string) => Promise<SupporterState>, done: (error?: unknown) => void) {
  let cleanup: (() => void) | undefined, finished = false, cleaned = false;
  const release = () => { if (cleanup && !cleaned) { cleaned = true; cleanup(); } };
  const finish = (error?: unknown) => { if (finished) return; finished = true; release(); done(error); };
  cleanup = sdk.createSubscriptionPurchaseOrder({
    options: {sku, processProductGrant: async ({orderId}) => {
      try { const state = await grant(orderId); return state.active && !state.pending; } catch { return false; }
    }},
    onEvent: event => { if (event.type === 'success') finish(); }, onError: finish,
  });
  if (finished) release();
  return () => { finished = true; release(); };
}
