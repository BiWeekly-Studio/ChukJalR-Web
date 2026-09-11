import { Buffer } from 'node:buffer';
import { AppStoreServerAPIClient, Environment, SignedDataVerifier } from 'npm:@apple/app-store-server-library@3.1.0';
import { appleRoots } from './roots.ts';
import { installAppleCryptoCompatibility } from './compat.ts';
export const BUNDLE = 'com.jalr.chukjalal';
export const TICKET = BUNDLE + '.freshstart';
export const SUPPORTER = BUNDLE + '.supporter.monthly';
const roots = appleRoots.map(x => Buffer.from(x, 'base64'));
installAppleCryptoCompatibility(roots[0]);
const environments = [Environment.PRODUCTION, Environment.SANDBOX];
const verifiers = environments.map(env => new SignedDataVerifier(roots, true, env, BUNDLE, 6808257765));
export class PurchaseError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function verifySigned(value: string, notification = false) {
  if (typeof value !== 'string' || value.length > 60000) throw new PurchaseError('INVALID_SIGNATURE');
  const failures: { name: string; status?: number; reason: string }[] = [];
  for (let i = 0; i < verifiers.length; i++) {
    try {
      const decoded = notification
        ? await verifiers[i].verifyAndDecodeNotification(value)
        : await verifiers[i].verifyAndDecodeTransaction(value);
      return { decoded, verifier: verifiers[i], environment: environments[i] };
    } catch (error) {
      const failure = error as any;
      failures.push({ name: failure?.name ?? 'Error', status: failure?.status,
        reason: String(failure?.cause?.message ?? failure?.message ?? '').slice(0, 300) });
    }
  }
  // Never log the JWS, transaction details, account token or credential material.
  console.warn('Apple signature verification failed', JSON.stringify(failures));
  if (failures.some(f => f.status === 2)) throw new PurchaseError('VERIFICATION_PENDING', 503);
  throw new PurchaseError('INVALID_SIGNATURE');
}
export function appleClient(environment: Environment) {
  const key = Deno.env.get('APPLE_IAP_PRIVATE_KEY');
  const keyId = Deno.env.get('APPLE_IAP_KEY_ID');
  const issuer = Deno.env.get('APPLE_IAP_ISSUER_ID');
  if (!key || !keyId || !issuer) throw new PurchaseError('STORE_NOT_READY', 503);
  return new AppStoreServerAPIClient(key.replace(/\\n/g, '\n'), keyId, issuer, BUNDLE, environment);
}
const date = (n: number | undefined) => n == null ? null : new Date(n).toISOString();
export async function applyTransaction(admin: any, tx: any, expectedUser?: string, renewal?: any) {
  if (![TICKET, SUPPORTER].includes(tx.productId) || tx.bundleId !== BUNDLE ||
      !['Production', 'Sandbox'].includes(tx.environment) ||
      !/^\d+$/.test(tx.transactionId ?? '') || !/^\d+$/.test(tx.originalTransactionId ?? '') ||
      !tx.signedDate || !tx.purchaseDate || tx.quantity !== 1 ||
      tx.inAppOwnershipType !== 'PURCHASED' ||
      (tx.productId === TICKET && tx.type !== 'Consumable') ||
      (tx.productId === SUPPORTER && (tx.type !== 'Auto-Renewable Subscription' || !tx.expiresDate))) {
    throw new PurchaseError('INVALID_PRODUCT');
  }
  if (renewal && (renewal.originalTransactionId !== tx.originalTransactionId ||
      renewal.productId !== tx.productId || renewal.environment !== tx.environment)) {
    throw new PurchaseError('INVALID_RENEWAL');
  }
  const { data: owners, error: lookupError } = await admin.from('apple_purchases')
    .select('user_id').eq('environment', tx.environment).eq('original_id', tx.originalTransactionId).limit(1);
  if (lookupError) throw new PurchaseError('DATABASE_UNAVAILABLE', 503);
  const token = tx.appAccountToken?.toLowerCase();
  const owner = owners?.length ? owners[0].user_id : token;
  // A deleted account's tombstone is acknowledged by notifications, never rebound.
  if (owners?.length && owner === null) {
    if (expectedUser) throw new PurchaseError('ORDER_OWNER_MISMATCH');
    return;
  }
  if (!owner || (token && token !== owner) || (expectedUser && owner !== expectedUser.toLowerCase())) {
    throw new PurchaseError('ORDER_OWNER_MISMATCH');
  }
  const { data: profile, error: profileError } = await admin.from('profiles').select('id').eq('id', owner).maybeSingle();
  if (profileError) throw new PurchaseError('DATABASE_UNAVAILABLE', 503);
  if (!profile) {
    if (expectedUser) throw new PurchaseError('USER_NOT_FOUND');
    return; // Notification for an account deleted before its first delivery.
  }
  const { error } = await admin.rpc('apple_apply_transaction', {
    p_user: owner, p_environment: tx.environment, p_transaction: tx.transactionId,
    p_original: tx.originalTransactionId, p_product: tx.productId,
    p_purchased: date(tx.purchaseDate), p_expires: date(tx.expiresDate),
    p_revoked: date(tx.revocationDate), p_signed: date(tx.signedDate),
    p_renew: renewal?.autoRenewStatus == null ? null : renewal.autoRenewStatus === 1,
    p_renew_signed: date(renewal?.signedDate),
  });
  if (error) throw new PurchaseError(error.message?.includes('OWNER') ? 'ORDER_OWNER_MISMATCH' : 'GRANT_PENDING', 503);
}
export async function currentTransaction(signed: string, admin: any, user: string) {
  const verified = await verifySigned(signed);
  const tx = verified.decoded as any;
  if (!tx.transactionId) throw new PurchaseError('INVALID_TRANSACTION');
  // Do not grant a stale signed receipt that predates a refund. Fetch Apple's
  // current version before applying even a locally verified StoreKit transaction.
  await refreshAppleTransaction(tx.transactionId, verified.environment, admin, user);
}
export async function refreshAppleTransaction(id: string, environment: Environment, admin: any, user: string) {
  const verifier = verifiers[environments.indexOf(environment)];
  if (!verifier || !/^\d+$/.test(id)) throw new PurchaseError('INVALID_TRANSACTION');
  const client = appleClient(environment);
  const current = await client.getTransactionInfo(id);
  if (!current.signedTransactionInfo) throw new PurchaseError('VERIFICATION_PENDING', 503);
  const fresh = await verifier.verifyAndDecodeTransaction(current.signedTransactionInfo);
  if (fresh.transactionId !== id) throw new PurchaseError('INVALID_TRANSACTION');
  await applyTransaction(admin, fresh, user);
  if (fresh.productId === SUPPORTER) {
    const statuses = await client.getAllSubscriptionStatuses(fresh.originalTransactionId!);
    for (const group of statuses.data ?? []) for (const item of group.lastTransactions ?? []) {
      if (item.originalTransactionId !== fresh.originalTransactionId || !item.signedTransactionInfo) continue;
      const latest = await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo);
      const renewal = item.signedRenewalInfo ? await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo) : undefined;
      await applyTransaction(admin, latest, user, renewal);
    }
  }
}
export { Environment };

export async function purchaseSnapshot(admin: any, user: string) {
  const [fresh, supporter] = await Promise.all([
    admin.rpc('fresh_start_action', { p_user: user, p_action: 'status' }),
    admin.rpc('supporter_snapshot', { p_user: user }),
  ]);
  if (fresh.error || supporter.error) throw new PurchaseError('STATUS_UNAVAILABLE', 503);
  // iOS cannot consume a Toss ticket without the provider's fresh verification.
  fresh.data.tickets = fresh.data.tickets.filter((t: any) => t.orderId.startsWith('apple:'));
  return { freshStart: fresh.data, supporter: supporter.data,
    storeReady: Boolean(Deno.env.get('APPLE_IAP_PRIVATE_KEY') && Deno.env.get('APPLE_IAP_KEY_ID') && Deno.env.get('APPLE_IAP_ISSUER_ID')) };
}
