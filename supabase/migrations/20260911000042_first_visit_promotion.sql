-- The identity digest survives account deletion, so reinstall/rejoining cannot
-- redeem the same campaign again. Provider keys never leave the server.
create table public.toss_promotion_rewards (
  promotion_code text not null check (promotion_code in ('01M1XAXHHF8KX6JA7H86RXFGZH','TEST_01M1XAXHHF8KX6JA7H86RXFGZH')),
  identity_hash text not null check (identity_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid references auth.users(id) on delete set null,
  amount integer not null default 50 check (amount = 50),
  status text not null default 'new' check (status in ('new','pending','paid','failed')),
  reward_key text,
  key_created_at timestamptz,
  attempted_at timestamptz,
  paid_at timestamptz,
  error_code text,
  lease_token uuid,
  lease_until timestamptz,
  retry_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (promotion_code, identity_hash),
  check (status <> 'paid' or (paid_at is not null and reward_key is not null)),
  check (attempted_at is null or reward_key is not null)
);
alter table public.toss_promotion_rewards enable row level security;
revoke all on public.toss_promotion_rewards from public, anon, authenticated;
grant select, insert, update, delete on public.toss_promotion_rewards to service_role;

create function public.acquire_first_visit_reward(p_code text, p_identity text, p_user uuid, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_reward public.toss_promotion_rewards%rowtype;
begin
  insert into public.toss_promotion_rewards(promotion_code,identity_hash,user_id)
    values(p_code,p_identity,p_user) on conflict do nothing;
  select * into strict v_reward from public.toss_promotion_rewards
    where promotion_code=p_code and identity_hash=p_identity for update;
  if v_reward.status='paid' or v_reward.lease_until>clock_timestamp() or v_reward.retry_after>clock_timestamp() then
    return to_jsonb(v_reward) || jsonb_build_object('acquired',false);
  end if;
  update public.toss_promotion_rewards set lease_token=p_token,
    lease_until=clock_timestamp()+interval '90 seconds',updated_at=clock_timestamp(),user_id=p_user
    where promotion_code=p_code and identity_hash=p_identity returning * into v_reward;
  return to_jsonb(v_reward) || jsonb_build_object('acquired',true);
end;
$$;
revoke all on function public.acquire_first_visit_reward(text,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.acquire_first_visit_reward(text,text,uuid,uuid) to service_role;

select cron.schedule('purge-first-visit-promotion', '40 18 * * *',
  $job$delete from public.toss_promotion_rewards
    where now() >= timestamptz '2026-09-22 00:00:00+09' + interval '90 days'$job$);
