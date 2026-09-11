-- Subscription state is written only by the authenticated payment webhook.
create table public.supporter_orders (
  order_id text primary key,
  user_id uuid references public.profiles(id) on delete set null,
  bound_at timestamptz,
  sku text not null,
  status text not null default 'PENDING',
  access_granted boolean not null default false,
  expires_at timestamptz,
  auto_renew boolean not null default false,
  event_at timestamptz,
  created_at timestamptz not null default now()
);
create index supporter_orders_user on public.supporter_orders(user_id);
create table public.supporter_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  team_id bigint not null references public.teams(id)
);
alter table public.supporter_orders enable row level security;
alter table public.supporter_profiles enable row level security;
revoke all on public.supporter_orders, public.supporter_profiles from anon, authenticated;

create function public.supporter_snapshot(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'active', coalesce((select bool_or(access_granted and status in ('ACTIVE','IN_GRACE_PERIOD') and (expires_at is null or expires_at > now())) from supporter_orders where user_id=p_user),false),
    'teamId',(select team_id from supporter_profiles where user_id=p_user),
    'expiresAt',(select expires_at from supporter_orders where user_id=p_user and access_granted and status in ('ACTIVE','IN_GRACE_PERIOD') and (expires_at is null or expires_at>now()) order by expires_at desc nulls first limit 1),
    'autoRenew',coalesce((select bool_or(auto_renew) from supporter_orders where user_id=p_user and access_granted and status in ('ACTIVE','IN_GRACE_PERIOD') and (expires_at is null or expires_at>now())),false),
    'pending',exists(select 1 from supporter_orders where user_id=p_user and event_at is null)
  );
$$;
revoke all on function public.supporter_snapshot(uuid) from public;
grant execute on function public.supporter_snapshot(uuid) to service_role;

create function public.supporter_bind_order(p_user uuid,p_order text,p_sku text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid; v_sku text; v_bound timestamptz;
begin
  insert into supporter_orders(order_id,sku) values(p_order,p_sku) on conflict do nothing;
  select user_id,sku,bound_at into v_owner,v_sku,v_bound from supporter_orders where order_id=p_order for update;
  if v_sku<>p_sku or (v_owner is not null and v_owner<>p_user) or (v_owner is null and v_bound is not null) then raise exception 'ORDER_OWNER_MISMATCH'; end if;
  update supporter_orders set user_id=p_user,bound_at=coalesce(bound_at,now()) where order_id=p_order;
end;
$$;
revoke all on function public.supporter_bind_order(uuid,text,text) from public;
grant execute on function public.supporter_bind_order(uuid,text,text) to service_role;

create function public.supporter_payment_event(p_order text,p_sku text,p_status text,p_access boolean,p_expires timestamptz,p_renew boolean,p_event_at timestamptz) returns void
language sql security definer set search_path=public,pg_temp as $$
  insert into supporter_orders(order_id,sku,status,access_granted,expires_at,auto_renew,event_at)
  values(p_order,p_sku,p_status,p_access,p_expires,p_renew,p_event_at)
  on conflict(order_id) do update set status=excluded.status,access_granted=excluded.access_granted,
    expires_at=excluded.expires_at,auto_renew=excluded.auto_renew,event_at=excluded.event_at
  where supporter_orders.sku=excluded.sku and (supporter_orders.event_at is null or excluded.event_at>supporter_orders.event_at);
$$;
revoke all on function public.supporter_payment_event(text,text,text,boolean,timestamptz,boolean,timestamptz) from public;
grant execute on function public.supporter_payment_event(text,text,text,boolean,timestamptz,boolean,timestamptz) to service_role;

-- Only display metadata is public to signed-in players; no order/payment data.
create function public.supporter_badges(p_users uuid[])
returns table(user_id uuid,team_id bigint,expires_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select p.user_id,p.team_id,o.expires_at from supporter_profiles p
  join lateral(select s.expires_at from supporter_orders s where s.user_id=p.user_id
    and s.access_granted and s.status in ('ACTIVE','IN_GRACE_PERIOD')
    and (s.expires_at is null or s.expires_at>now())
    order by s.expires_at desc nulls first limit 1) o on true
  where p.user_id=any(p_users[1:100]);
$$;
revoke all on function public.supporter_badges(uuid[]) from public;
grant execute on function public.supporter_badges(uuid[]) to authenticated;
