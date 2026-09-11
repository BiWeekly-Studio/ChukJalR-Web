export const FRESH_START_SKU = 'ait.0000072177.d2cc5053.4c3aea389e.8761666150';
export interface PersonalChallenge {
  id: string; started_at: string; ended_at: string | null; refunded: boolean;
  predicted: number; settled: number; hits: number; rating: number;
}
export interface FreshStartState {
  sku: string; tickets: { orderId: string }[]; challenges: PersonalChallenge[]; verificationPending?: boolean;
}
export interface Product { sku: string; displayAmount: string; displayName: string }
type Supported<T> = T & { isSupported(): boolean };
export interface PurchaseSDK {
  getProductItemList: Supported<() => Promise<{ products: Product[] } | undefined>>;
  getPendingOrders: Supported<() => Promise<{ orders: {orderId: string; sku: string}[] } | undefined>>;
  completeProductGrant: Supported<(args: {params: {orderId: string}}) => Promise<boolean>>;
  createOneTimePurchaseOrder: Supported<(args: {
    options: {sku: string; processProductGrant(params: {orderId: string}): Promise<boolean>};
    onEvent(event: {type: string}): void;
    onError(error: unknown): void;
  }) => () => void>;
}
export const loadPurchaseSDK = async (): Promise<PurchaseSDK> => {
  const { IAP } = await import('@apps-in-toss/web-framework');
  return IAP as unknown as PurchaseSDK;
};
export function supportsPurchases(sdk: PurchaseSDK) {
  return [sdk.getProductItemList, sdk.getPendingOrders, sdk.completeProductGrant, sdk.createOneTimePurchaseOrder]
    .every(fn => typeof fn === 'function' && typeof fn.isSupported === 'function' && fn.isSupported());
}
// A module-level lock survives StrictMode remounts and avoids duplicate restore jobs.
let recovery: Promise<number> | null = null;
export function restoreTickets(sdk: PurchaseSDK, grant: (orderId: string) => Promise<unknown>): Promise<number> {
  if (recovery) return recovery;
  recovery = (async () => {
    const pending = await sdk.getPendingOrders();
    if (!pending) throw new Error('SDK_UNSUPPORTED');
    let recovered=0;
    for (const order of pending.orders) {
      if (order.sku !== FRESH_START_SKU) continue;
      await grant(order.orderId);
      if (!await sdk.completeProductGrant({params:{orderId:order.orderId}})) throw new Error('PRODUCT_NOT_GRANTED_BY_PARTNER');
      recovered++;
    }
    return recovered;
  })().finally(() => { recovery=null; });
  return recovery;
}
export function purchaseTicket(sdk: PurchaseSDK, grant: (id: string) => Promise<unknown>, done: (error?: unknown) => void): () => void {
  let cleanup: (() => void) | undefined;
  let ended=false;
  let cleaned=false;
  const release = () => { if (cleanup && !cleaned) { cleaned=true; cleanup(); } };
  const finish = (error?: unknown) => {
    if (ended) return;
    ended=true;
    release();
    done(error);
  };
  cleanup = sdk.createOneTimePurchaseOrder({
    options:{sku:FRESH_START_SKU,processProductGrant: async ({orderId}) => {
      try { await grant(orderId); return true; } catch { return false; }
    }},
    onEvent:event => { if (event.type==='success') finish(); },
    onError:finish,
  });
  if (ended) release();
  return () => { ended=true; release(); };
}
export function purchaseError(error: unknown): string {
  const e = error as {code?: string; errorCode?: string; message?: string};
  const code=e?.errorCode ?? e?.code ?? e?.message ?? '';
  if (code==='USER_CANCELED') return '구매를 취소했어요.';
  if (code==='TOSS_LOGIN_REQUIRED' || code==='LOGIN_REQUIRED') return '토스 로그인을 다시 해주세요.';
  if (code==='ORDER_REFUNDED') return '환불된 이용권이에요. 구매 내역을 다시 확인해주세요.';
  if (code==='PAYMENT_PENDING') return '결제 확인 중이에요. 다시 구매하지 말고 잠시 후 구매 복구를 눌러주세요.';
  return '처리를 완료하지 못했어요. 결제했다면 다시 구매하지 말고 구매 복구를 눌러주세요.';
}
