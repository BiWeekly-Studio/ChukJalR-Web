-- 확인 기록은 계정에 저장하여 웹/iOS에서 함께 사용한다. 조회만으로 읽음 처리하지 않는다.
create table public.settlement_receipts (
  prediction_id bigint primary key references public.settlements(prediction_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.settlement_receipts enable row level security;
revoke all on public.settlement_receipts from public, anon, authenticated;
grant all on public.settlement_receipts to service_role;

create or replace function public.pending_settlement_recap()
returns jsonb language sql stable security definer set search_path = public as $$
  with unseen as (
    select s.*, p.pick, coalesce(h.name_ko,h.name) home_name, coalesce(a.name_ko,a.name) away_name,
           f.home_goals_ft, f.away_goals_ft
    from settlements s
    join predictions p on p.id=s.prediction_id
    join fixtures f on f.id=s.fixture_id
    join teams h on h.id=f.home_team_id
    join teams a on a.id=f.away_team_id
    where s.user_id=auth.uid()
      and not exists(select 1 from settlement_receipts r where r.prediction_id=s.prediction_id)
  ), batch as (
    select * from unseen order by settled_at, prediction_id limit 100
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',prediction_id::text,'fixtureId',fixture_id,'homeName',home_name,'awayName',away_name,
    'homeGoals',home_goals_ft,'awayGoals',away_goals_ft,'pick',pick,'actual',actual,
    'correct',pick=actual,'deltaRating',delta_rating,'points',points,'settledAt',settled_at
  ) order by settled_at,prediction_id) from batch),'[]'::jsonb),
  'remaining',greatest(0,(select count(*) from unseen)-100));
$$;

create or replace function public.ack_settlement_recap(p_ids bigint[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(cardinality(p_ids),0)>100 then raise exception 'TOO_MANY_ITEMS'; end if;
  insert into settlement_receipts(prediction_id,user_id)
  select prediction_id,user_id from settlements
  where prediction_id=any(p_ids) and user_id=auth.uid()
  on conflict(prediction_id) do nothing;
end $$;
revoke all on function public.pending_settlement_recap() from public,anon,authenticated;
revoke all on function public.ack_settlement_recap(bigint[]) from public,anon,authenticated;
grant execute on function public.pending_settlement_recap() to authenticated;
grant execute on function public.ack_settlement_recap(bigint[]) to authenticated;
