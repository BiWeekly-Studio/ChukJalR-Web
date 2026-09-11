-- Toss notifications are separate from iOS device tokens. Default is opt-out.
create table public.toss_notification_templates (
 kind text primary key check(kind in ('lock','kickoff','chat','settlement')),
 template_code text not null unique,
 approved boolean not null default false
);
insert into public.toss_notification_templates(kind,template_code) values
 ('lock','chukjalr-prediction-lock'),('kickoff','chukjalr-kickoff'),
 ('chat','chukjalr-chat-open'),('settlement','chukjalr-prediction-result');
create table public.toss_notification_preferences (
 user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null references public.toss_notification_templates(kind),
 enabled boolean not null default false,
 enabled_at timestamptz not null default now(),
 primary key(user_id,kind)
);
create table public.toss_notification_deliveries (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null references public.toss_notification_templates(kind),
 fixture_id bigint not null references public.fixtures(id) on delete cascade,
 due_at timestamptz not null,
 status text not null default 'claimed' check(status in ('claimed','sent','failed','unknown','skipped')),
 attempted_at timestamptz not null default now(),
 push_count int not null default 0,
 error_code text,
 unique(user_id,kind,fixture_id)
);
alter table public.toss_notification_templates enable row level security;
alter table public.toss_notification_preferences enable row level security;
alter table public.toss_notification_deliveries enable row level security;
revoke all on public.toss_notification_templates,public.toss_notification_preferences,public.toss_notification_deliveries from public,anon,authenticated;
grant all on public.toss_notification_templates,public.toss_notification_preferences,public.toss_notification_deliveries to service_role;

-- Atomic claim + unique key prevent duplicate sends across simultaneous cron runs.
-- No automatic retry after an ambiguous network response: Toss has no idempotency key.
create function public.claim_toss_notifications(p_limit int default 50)
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
 where pref.enabled and pr.onboarded_at is not null and (
   (pref.kind='lock' and f.state='SCHEDULED' and f.opens_at<=now() and now()<f.lock_at and p.id is null and f.league_id=any(pr.league_order))
   or (pref.kind='kickoff' and f.state='SCHEDULED' and now()<f.kickoff_at and p.id is not null)
   or (pref.kind='chat' and f.state='SCHEDULED' and now()<f.kickoff_at and (f.home_team_id=any(pr.favorite_team_ids) or f.away_team_id=any(pr.favorite_team_ids)))
   or (pref.kind='settlement' and s.prediction_id is not null and f.state='FINISHED')
  )
 ), eligible as (
 select c.* from candidates c where c.due_at<=now() and c.due_at>=c.enabled_at
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
-- invoke_function exposes a privileged network call; only cron/service may invoke it.
revoke all on function public.invoke_function(text,text) from public,anon,authenticated;
grant execute on function public.invoke_function(text,text) to service_role;
select cron.schedule('toss-notifications','* * * * *',$$select public.invoke_function('toss-notifications-send');$$);
