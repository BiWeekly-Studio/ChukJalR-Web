const supported=<T extends Function>(fn:T)=>Object.assign(fn,{isSupported:()=>true});
export const IAP={
 getProductItemList:supported(async()=>({products:[{sku:'ait.0000072177.d2cc5053.4c3aea389e.8761666150',displayAmount:'1,100원',displayName:'새 출발권 1회'}]})),
 getPendingOrders:supported(async()=>({orders:[]})),
 completeProductGrant:supported(async()=>true),
 createOneTimePurchaseOrder:supported((p:any)=>{
  const timer=setTimeout(async()=>{if(await p.options.processProductGrant({orderId:'ui-test-order'})) p.onEvent({type:'success'});else p.onError({code:'PRODUCT_NOT_GRANTED_BY_PARTNER'});},100);
  return ()=>clearTimeout(timer);
 }),
};
