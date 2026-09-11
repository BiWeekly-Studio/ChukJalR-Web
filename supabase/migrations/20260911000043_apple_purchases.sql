-- Apple-signed transactions are applied only by the service role. Provider IDs
-- are namespaced; deleted accounts leave immutable ownership tombstones.
create table public.apple_purchases (
  environment text not null check(environment in ('Production','Sandbox')),
  transaction_id text not null,
  original_id text not null,
  user_id uuid references public.profiles(id) on delete set null,
  product_id text not null check(product_id in ('com.jalr.chukjalal.freshstart','com.jalr.chukjalal.supporter.monthly')),
  purchased_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  signed_at timestamptz not null,
  primary key(environment,transaction_id)
);
create index apple_purchases_owner on public.apple_purchases(user_id,original_id);
alter table public.apple_purchases enable row level security;
revoke all on public.apple_purchases from public,anon,authenticated;
grant all on public.apple_purchases to service_role;

create or replace function public.fresh_start_action(p_user uuid, p_action text, p_order text default null, p_sku text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.fresh_start_orders%rowtype;
  v_now timestamptz := clock_timestamp();
  v_created timestamptz;
  v_result jsonb;
begin
  -- A per-user lock serializes first-run creation, grant, consume and refund.
  select created_at into v_created from public.profiles where id = p_user for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if not exists(select 1 from public.personal_challenges where user_id = p_user) then
    insert into public.personal_challenges(user_id, started_at) values(p_user, v_created);
  end if;
  if p_action = 'grant' then
    if p_order is null or p_sku not in ('ait.0000072177.d2cc5053.4c3aea389e.8761666150','com.jalr.chukjalal.freshstart') or p_sku is null then
      raise exception 'INVALID_PRODUCT';
    end if;
    insert into public.fresh_start_orders(order_id,user_id,sku) values(p_order,p_user,p_sku)
      on conflict(order_id) do nothing;
    select * into v_order from public.fresh_start_orders where order_id = p_order for update;
    if v_order.user_id is distinct from p_user or v_order.sku <> p_sku then raise exception 'ORDER_OWNER_MISMATCH'; end if;
    if v_order.refunded_at is not null then raise exception 'ORDER_REFUNDED'; end if;
  elsif p_action in ('start','refund') then
    select * into v_order from public.fresh_start_orders where order_id = p_order and user_id = p_user for update;
    if not found then raise exception 'ORDER_NOT_FOUND'; end if;
    if p_action = 'refund' then
      update public.fresh_start_orders set refunded_at = coalesce(refunded_at,v_now) where order_id = p_order;
      update public.personal_challenges set refunded = true, ended_at = coalesce(ended_at,v_now) where order_id = p_order;
    else
      if v_order.refunded_at is not null then raise exception 'ORDER_REFUNDED'; end if;
      if v_order.used_at is null then
        update public.personal_challenges set ended_at = v_now where user_id = p_user and ended_at is null;
        insert into public.personal_challenges(user_id,started_at,order_id) values(p_user,v_now,p_order);
        update public.fresh_start_orders set used_at = v_now where order_id = p_order;
      end if;
    end if;
  elsif p_action <> 'status' then raise exception 'INVALID_ACTION';
  end if;
  select jsonb_build_object(
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('orderId',order_id) order by granted_at)
      from public.fresh_start_orders where user_id=p_user and used_at is null and refunded_at is null),'[]'::jsonb),
    'challenges',coalesce((select jsonb_agg(to_jsonb(c) order by c.started_at desc) from (
      select ch.id, ch.started_at, ch.ended_at, ch.refunded,
        count(pr.id)::int as predicted, count(st.prediction_id)::int as settled,
        count(st.prediction_id) filter(where pr.pick=st.actual)::int as hits,
        (1000+coalesce(sum(st.delta_rating),0))::int as rating
      from public.personal_challenges ch
      left join public.predictions pr on pr.user_id=ch.user_id and pr.created_at>=ch.started_at
        and (ch.ended_at is null or pr.created_at<ch.ended_at)
      left join public.settlements st on st.prediction_id=pr.id
      where ch.user_id=fresh_start_action.p_user group by ch.id order by ch.started_at desc
    ) c),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.fresh_start_action(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.fresh_start_action(uuid,text,text,text) to service_role;

create function public.apple_apply_transaction(
  p_user uuid, p_environment text, p_transaction text, p_original text,
  p_product text, p_purchased timestamptz, p_expires timestamptz,
  p_revoked timestamptz, p_signed timestamptz,
  p_renew boolean default null, p_renew_signed timestamptz default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_existing apple_purchases%rowtype;
  v_order text := 'apple:' || p_environment || ':' || p_transaction;
  v_subscription text := 'apple:' || p_environment || ':' || p_original;
  v_expiry timestamptz;
  v_renew boolean;
  v_event timestamptz;
begin
  if p_environment not in ('Production','Sandbox') or p_transaction !~ '^[0-9]+$'
    or p_original !~ '^[0-9]+$' or p_signed is null or p_purchased is null
    or p_product not in ('com.jalr.chukjalal.freshstart','com.jalr.chukjalal.supporter.monthly')
    or (p_product='com.jalr.chukjalal.supporter.monthly' and p_expires is null)
    then raise exception 'INVALID_APPLE_TRANSACTION'; end if;
  -- Serializes every transaction in the same subscription, including first bind.
  perform pg_advisory_xact_lock(hashtextextended(v_subscription,0));
  select * into v_existing from apple_purchases
    where environment=p_environment and original_id=p_original limit 1;
  if found and (v_existing.user_id is distinct from p_user or v_existing.product_id<>p_product)
    then raise exception 'ORDER_OWNER_MISMATCH'; end if;
  if not exists(select 1 from profiles where id=p_user) then raise exception 'USER_NOT_FOUND'; end if;
  select * into v_existing from apple_purchases
    where environment=p_environment and transaction_id=p_transaction for update;
  if found and (v_existing.user_id is distinct from p_user or v_existing.original_id<>p_original
    or v_existing.product_id<>p_product) then raise exception 'ORDER_OWNER_MISMATCH'; end if;
  if not found or p_signed>v_existing.signed_at then
    insert into apple_purchases values(p_environment,p_transaction,p_original,p_user,p_product,p_purchased,p_expires,p_revoked,p_signed)
    on conflict(environment,transaction_id) do update
      set expires_at=excluded.expires_at,revoked_at=excluded.revoked_at,signed_at=excluded.signed_at;
  end if;
  select * into v_existing from apple_purchases where environment=p_environment and transaction_id=p_transaction;
  if p_product='com.jalr.chukjalal.freshstart' then
    if v_existing.revoked_at is null then
      -- A refunded consumable is never reissued on replay or refund reversal.
      if not exists(select 1 from fresh_start_orders where order_id=v_order and refunded_at is not null) then
        perform fresh_start_action(p_user,'grant',v_order,p_product);
      end if;
    else
      insert into fresh_start_orders(order_id,user_id,sku,refunded_at)
        values(v_order,p_user,p_product,v_existing.revoked_at) on conflict do nothing;
      perform fresh_start_action(p_user,'refund',v_order,p_product);
    end if;
  else
    perform supporter_bind_order(p_user,v_subscription,p_product);
    select max(expires_at) into v_expiry from apple_purchases
      where environment=p_environment and original_id=p_original and revoked_at is null;
    -- Renewal preferences have their own event clock. A late receipt must not
    -- turn auto-renew back on after a newer cancellation notification.
    select auto_renew,event_at into v_renew,v_event from supporter_orders where order_id=v_subscription;
    if p_renew is not null and p_renew_signed is not null and (v_event is null or p_renew_signed>v_event) then
      v_renew:=p_renew; v_event:=p_renew_signed;
    end if;
    update supporter_orders set status=case when v_expiry>now() then 'ACTIVE' else 'EXPIRED' end,
      access_granted=coalesce(v_expiry>now(),false),expires_at=coalesce(v_expiry,now()),
      auto_renew=coalesce(v_renew,false),event_at=v_event where order_id=v_subscription;
  end if;
end;
$$;
revoke all on function public.apple_apply_transaction(uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.apple_apply_transaction(uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,timestamptz) to service_role;
