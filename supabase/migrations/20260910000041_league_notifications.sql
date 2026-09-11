-- One account-level league filter for Toss and iOS. Type-level consent is unchanged.
insert into public.leagues(id,name,short_name,country) values (61,'리그앙','리그앙','프랑스')
on conflict(id) do update set name=excluded.name,short_name=excluded.short_name,country=excluded.country;
create table public.notification_league_preferences (
 user_id uuid not null references public.profiles(id) on delete cascade,
 league_id int not null references public.leagues(id) on delete cascade,
 enabled boolean not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,league_id)
);
alter table public.notification_league_preferences enable row level security;
revoke all on public.notification_league_preferences from public,anon,authenticated;
grant all on public.notification_league_preferences to service_role;
create function public.notification_league_enabled(p_user uuid,p_league int) returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce((select enabled from notification_league_preferences where user_id=p_user and league_id=p_league),p_league=any(array[39,78,61,140,135,2,3,848]));
$$;
revoke all on function public.notification_league_enabled(uuid,int) from public,anon,authenticated;
grant execute on function public.notification_league_enabled(uuid,int) to service_role;
create function public.league_notification_settings(p_league_id int default null,p_enabled boolean default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'LOGIN_REQUIRED'; end if;
 if (p_league_id is null) <> (p_enabled is null) then raise exception 'BAD_REQUEST'; end if;
 if p_league_id is not null then
  if not exists(select 1 from leagues where id=p_league_id) then raise exception 'UNKNOWN_LEAGUE'; end if;
  insert into notification_league_preferences(user_id,league_id,enabled) values(uid,p_league_id,p_enabled)
  on conflict(user_id,league_id) do update set enabled=excluded.enabled,updated_at=now()
  where notification_league_preferences.enabled is distinct from excluded.enabled;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'major',l.id=any(array[39,78,61,140,135,2,3,848]),'enabled',notification_league_enabled(uid,l.id))
 order by coalesce(array_position(array[39,78,61,140,135,2,3,848],l.id),99),l.name,l.id),'[]'::jsonb) into result from leagues l;
 return result;
end; $$;
revoke all on function public.league_notification_settings(int,boolean) from public,anon,authenticated;
grant execute on function public.league_notification_settings(int,boolean) to authenticated;

create or replace function public.claim_toss_notifications(p_limit int default 50)
returns table(id bigint,user_id uuid,kind text,fixture_id bigint,template_code text)
language sql security definer set search_path=public as $$
 with candidates as (
 select pref.user_id,pref.kind,f.id as fixture_id,
   case pref.kind when 'lock' then f.lock_at-interval '15 minutes'
     when 'kickoff' then f.kickoff_at-interval '10 minutes'
     when 'chat' then f.kickoff_at-interval '1 hour'
     else s.settled_at end as due_at,
   pref.enabled_at
 from toss_notification_preferences pref
 join toss_notification_templates tpl on tpl.kind=pref.kind and tpl.approved
 join profiles pr on pr.id=pref.user_id
 join auth.users u on u.id=pr.id and u.raw_app_meta_data ? 'toss_user_key'
 join fixtures f on (f.kickoff_at between now()-interval '1 day' and now()+interval '2 hours'
                    or (pref.kind='settlement' and exists(select 1 from settlements sx where sx.user_id=pref.user_id and sx.fixture_id=f.id and sx.settled_at>now()-interval '1 hour')))
 left join predictions p on p.user_id=pref.user_id and p.fixture_id=f.id
 left join settlements s on s.prediction_id=p.id
 where pref.enabled and public.notification_league_enabled(pref.user_id,f.league_id) and pr.onboarded_at is not null and (
   (pref.kind='lock' and f.state='SCHEDULED' and f.opens_at<=now() and now()<f.lock_at and p.id is null)
   or (pref.kind='kickoff' and f.state='SCHEDULED' and now()<f.kickoff_at and p.id is not null)
   or (pref.kind='chat' and f.state='SCHEDULED' and now()<f.kickoff_at and (f.home_team_id=any(pr.favorite_team_ids) or f.away_team_id=any(pr.favorite_team_ids)))
   or (pref.kind='settlement' and s.prediction_id is not null and f.state='FINISHED')
  )
 ), eligible as (
 select c.* from candidates c where not exists (
 select 1 from public.notification_league_preferences lp join fixtures lf on lf.id=c.fixture_id
 where lp.user_id=c.user_id and lp.league_id=lf.league_id and lp.enabled and lp.updated_at>c.due_at
 ) and c.due_at<=now() and c.due_at>=c.enabled_at
 and c.due_at>now()-case when c.kind='settlement' then interval '1 hour' else interval '5 minutes' end
 and not exists(select 1 from toss_notification_deliveries d where d.user_id=c.user_id and d.kind=c.kind and d.fixture_id=c.fixture_id)
 -- Leave room below Toss's per-user 10/minute limit.
 and (select count(*) from toss_notification_deliveries d where d.user_id=c.user_id and d.attempted_at>now()-interval '1 minute')<5
 ), ranked as (
 select e.*,row_number() over(partition by e.user_id order by e.due_at,e.kind,e.fixture_id) as rn from eligible e
 ), claimed as (
 insert into toss_notification_deliveries(user_id,kind,fixture_id,due_at)
 select user_id,kind,fixture_id,due_at from ranked where rn<=1
 order by due_at limit greatest(1,least(p_limit,50))
 on conflict(user_id,kind,fixture_id) do nothing
 returning *
 ) select c.id,c.user_id,c.kind,c.fixture_id,t.template_code from claimed c join toss_notification_templates t on t.kind=c.kind;
$$;
revoke all on function public.claim_toss_notifications(int) from public,anon,authenticated;
grant execute on function public.claim_toss_notifications(int) to service_role;

create or replace function pending_settlement_pushes(p_since_minutes int default 60)
returns table (
  user_id uuid, prediction_id bigint, delta_rating int, points int,
  hit boolean, home_name text, away_name text, tokens text[]
)
language sql security definer set search_path = public stable as $$
  select s.user_id,
         s.prediction_id,
         s.delta_rating,
         s.points,
         s.delta_rating > 0                    as hit,
         coalesce(h.name_ko, h.name)           as home_name,
         coalesce(a.name_ko, a.name)           as away_name,
         array_agg(t.token)                    as tokens
    from settlements s
    join fixtures f on f.id = s.fixture_id
    join teams h    on h.id = f.home_team_id
    join teams a    on a.id = f.away_team_id
    join push_tokens t on t.user_id = s.user_id
   where public.notification_league_enabled(s.user_id,f.league_id)
     and not exists(select 1 from notification_league_preferences lp where lp.user_id=s.user_id and lp.league_id=f.league_id and lp.enabled and lp.updated_at>s.settled_at)
     and s.settled_at > now() - make_interval(mins => p_since_minutes)
     and not exists (
       select 1 from push_log l
        where l.user_id = s.user_id and l.kind = 'settlement' and l.ref_id = s.prediction_id
     )
   group by s.user_id, s.prediction_id, s.delta_rating, s.points,
            h.name_ko, h.name, a.name_ko, a.name;
$$;

revoke all on function pending_settlement_pushes(int) from public;
grant execute on function pending_settlement_pushes(int) to service_role;
