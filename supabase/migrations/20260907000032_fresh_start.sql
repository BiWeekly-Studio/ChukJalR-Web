-- Paid tickets never modify predictions, settlements, ratings or the point ledger.
create table public.fresh_start_orders (
  order_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sku text not null,
  granted_at timestamptz not null default now(),
  used_at timestamptz,
  refunded_at timestamptz
);
create index fresh_start_orders_user_idx on public.fresh_start_orders(user_id);
create table public.personal_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  order_id text unique references public.fresh_start_orders(order_id),
  refunded boolean not null default false
);
create unique index personal_challenges_active_idx on public.personal_challenges(user_id) where ended_at is null;
alter table public.fresh_start_orders enable row level security;
alter table public.personal_challenges enable row level security;
revoke all on public.fresh_start_orders, public.personal_challenges from anon, authenticated;
grant select on public.fresh_start_orders, public.personal_challenges to authenticated;
create policy own_orders on public.fresh_start_orders for select to authenticated using (auth.uid() = user_id);
create policy own_challenges on public.personal_challenges for select to authenticated using (auth.uid() = user_id);

-- This metadata is server-owned. Only confirmed synthetic identities created by the
-- existing Toss login bridge qualify for the one-time migration.
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) ||
  jsonb_build_object('toss_user_key', split_part(email, '@', 1))
where email ~ '^[1-9][0-9]*@toss[.]invalid$' and email_confirmed_at is not null
  and raw_user_meta_data->>'toss_user_key' = split_part(email, '@', 1);

create function public.fresh_start_action(p_user uuid, p_action text, p_order text default null, p_sku text default null)
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
    if p_order is null or p_sku <> 'ait.0000072177.d2cc5053.4c3aea389e.8761666150' or p_sku is null then
      raise exception 'INVALID_PRODUCT';
    end if;
    insert into public.fresh_start_orders(order_id,user_id,sku) values(p_order,p_user,p_sku)
      on conflict(order_id) do nothing;
    select * into v_order from public.fresh_start_orders where order_id = p_order for update;
    if v_order.user_id <> p_user or v_order.sku <> p_sku then raise exception 'ORDER_OWNER_MISMATCH'; end if;
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
