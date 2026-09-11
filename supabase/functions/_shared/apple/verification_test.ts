import { verifySigned, applyTransaction, PurchaseError } from './index.ts';
function check(value: unknown, message: string) { if (!value) throw Error(message); }
Deno.test('forged Apple transactions and notifications fail before database access', async () => {
  for (const notification of [false, true]) {
    for (const token of ['', 'header.payload.signature', 'eyJhbGciOiJub25lIn0.eyJidW5kbGVJZCI6ImNvbS5qYWxyLmNodWtqYWxhbCJ9.']) {
      try { await verifySigned(token, notification); throw Error('Accepted forged signature'); }
      catch (error) { check(error instanceof PurchaseError && error.message === 'INVALID_SIGNATURE', 'fail closed'); }
    }
  }
});
Deno.test('wrong product, environment, quantity and ownership are rejected', async () => {
  const valid = { productId:'com.jalr.chukjalal.freshstart',bundleId:'com.jalr.chukjalal',environment:'Production',transactionId:'100',originalTransactionId:'100',signedDate:Date.now(),purchaseDate:Date.now(),quantity:1,type:'Consumable',inAppOwnershipType:'PURCHASED' };
  for (const change of [{productId:'invalid'},{bundleId:'another.app'},{environment:'Xcode'},{quantity:2},{inAppOwnershipType:'FAMILY_SHARED'},{type:'Non-Consumable'}]) {
    try { await applyTransaction({}, {...valid,...change},'user'); throw Error('Accepted invalid transaction'); }
    catch (error) { check(error instanceof PurchaseError && error.message === 'INVALID_PRODUCT', 'strict product contract'); }
  }
});
