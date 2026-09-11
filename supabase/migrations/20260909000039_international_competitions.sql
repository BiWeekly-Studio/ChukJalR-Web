-- 팀은 하나의 프로필을 유지하면서 여러 대회에 출전한다.
create table public.team_competitions (
  team_id integer not null references public.teams(id) on delete cascade,
  league_id integer not null references public.leagues(id) on delete cascade,
  primary key (team_id, league_id)
);
alter table public.team_competitions enable row level security;
revoke all on public.team_competitions from public, anon, authenticated;
grant select on public.team_competitions to anon, authenticated;
grant all on public.team_competitions to service_role;
create policy "Read competition teams" on public.team_competitions for select using (true);
insert into public.team_competitions select id, league_id from public.teams on conflict do nothing;
create index team_competitions_league_idx on public.team_competitions(league_id);

-- 새 국제 친선경기·대회 일정도 매일 확인한다.
select cron.schedule('sync-schedule', '0 19 * * *', $$ select invoke_sync('schedule'); $$);
-- 날짜별 전 세계 일정 확인과 일괄 저장을 마칠 여유를 둔다.
create or replace function public.invoke_sync(p_mode text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_url text; v_token text;
begin
  select value into v_url from app_secrets where name = 'project_url';
  select value into v_token from app_secrets where name = 'sync_token';
  if v_url is null or v_token is null then return null; end if;
  return net.http_post(
    url := v_url || '/functions/v1/sync-fixtures?mode=' || p_mode,
    headers := jsonb_build_object('Content-Type','application/json','x-sync-token',v_token),
    body := '{}'::jsonb, timeout_milliseconds := 120000
  );
end $$;
revoke all on function public.invoke_sync(text) from public, anon, authenticated;
grant execute on function public.invoke_sync(text) to service_role;
