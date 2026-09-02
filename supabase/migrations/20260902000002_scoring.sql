-- 점수 엔진 — 기술 명세 2장. src/lib/scoring.ts 와 같은 공식이어야 한다.
-- 이 파일을 고치면 반드시 명세 2.5 표와 대조할 것.

create or replace function conf_shift(c smallint)
returns numeric language sql immutable as $$
  select case c when 1 then 0.15 when 2 then 0.35 when 3 then 0.60 end::numeric;
$$;

create or replace function outcome_index(o match_outcome)
returns int language sql immutable as $$
  select case o when 'HOME' then 1 when 'DRAW' then 2 else 3 end;
$$;

-- 유저 확률분포: 확신도는 기준선에서 내 픽 쪽으로의 상대 이동이다 (명세 2.3)
create or replace function user_prob(q numeric[], pick match_outcome, c smallint)
returns numeric[] language plpgsql immutable as $$
declare
  i int := outcome_index(pick);
  p numeric[] := array[0, 0, 0]::numeric[];
  rest numeric;
  others numeric;
begin
  p[i] := q[i] + conf_shift(c) * (1 - q[i]);
  rest := 1 - p[i];
  others := (q[1] + q[2] + q[3]) - q[i];
  for j in 1..3 loop
    if j <> i then p[j] := rest * q[j] / others; end if;
  end loop;
  return p;
end $$;

-- Δ지수 = round(40 · log2(p(실제) / q(실제))), clamp [-60, 90] (명세 2.4)
create or replace function delta_rating(q numeric[], p numeric[], actual match_outcome)
returns int language sql immutable as $$
  select greatest(-60, least(90, round(40 * log(2::numeric, p[a] / q[a]))))::int
  from (select outcome_index(actual) as a) t;
$$;

-- ------------------------------------------------------------------ 기준선 동결

-- 마감 시각에 q를 계산해 동결한다. 본인 예측은 제외(leave-one-out)하지 않고
-- 전체 분포를 쓰되, 모델 가중치 w = 30/(30+N) 으로 소수 참여의 영향을 눌러둔다. (명세 2.2)
create or replace function freeze_baseline(p_fixture_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_n int;
  v_crowd numeric[];
  v_prior numeric[];
  v_w numeric;
  v_q numeric[];
  v_sum numeric;
begin
  if exists (select 1 from fixture_baselines where fixture_id = p_fixture_id) then
    return;                                    -- 이미 동결됨. 재실행해도 안전하다.
  end if;

  select count(*),
         array[
           (count(*) filter (where pick = 'HOME') + 1)::numeric / (count(*) + 3),
           (count(*) filter (where pick = 'DRAW') + 1)::numeric / (count(*) + 3),
           (count(*) filter (where pick = 'AWAY') + 1)::numeric / (count(*) + 3)
         ]                                     -- 라플라스 스무딩
    into v_n, v_crowd
    from predictions where fixture_id = p_fixture_id;

  select q into v_prior from fixture_priors where fixture_id = p_fixture_id;
  if v_prior is null then
    v_prior := array[0.45, 0.26, 0.29]::numeric[];   -- 홈 어드밴티지만 반영한 리그 평균
  end if;

  v_w := 30::numeric / (30 + v_n);
  v_q := array[
    v_w * v_prior[1] + (1 - v_w) * v_crowd[1],
    v_w * v_prior[2] + (1 - v_w) * v_crowd[2],
    v_w * v_prior[3] + (1 - v_w) * v_crowd[3]
  ];

  -- [0.03, 0.94] 클램프 후 정규화
  for j in 1..3 loop
    v_q[j] := greatest(0.03, least(0.94, v_q[j]));
  end loop;
  v_sum := v_q[1] + v_q[2] + v_q[3];
  for j in 1..3 loop
    v_q[j] := round(v_q[j] / v_sum, 6);
  end loop;
  v_q[3] := 1 - v_q[1] - v_q[2];               -- 반올림 오차를 마지막 칸이 흡수

  insert into fixture_baselines (fixture_id, q, n_participants, source)
  values (p_fixture_id, v_q, v_n, case when v_n >= 30 then 'blend' else 'prior-heavy' end)
  on conflict (fixture_id) do nothing;
end $$;

-- 마감 시각이 지난 경기의 기준선을 한꺼번에 동결한다. 1분마다 돈다.
create or replace function lock_due_fixtures()
returns int language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_count int := 0;
begin
  for v_id in
    select f.id from fixtures f
     where now() >= f.lock_at
       and not exists (select 1 from fixture_baselines b where b.fixture_id = f.id)
  loop
    perform freeze_baseline(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ------------------------------------------------------------------ 정산

-- 한 트랜잭션에서 settlements → point_ledger → ratings 까지 끝낸다.
-- on conflict do nothing 으로 재실행해도 안전하다. (명세 9장, 14.3)
create or replace function settle_fixture(p_fixture_id bigint)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_q numeric[];
  v_actual match_outcome;
  v_season int;
  v_settled int := 0;
begin
  select b.q, f.result, f.season
    into v_q, v_actual, v_season
    from fixtures f
    join fixture_baselines b on b.fixture_id = f.id
   where f.id = p_fixture_id
     and f.state = 'FINISHED'
     and f.result is not null;

  if v_q is null then
    return 0;                                  -- 아직 정산할 수 없는 경기
  end if;

  with calc as (
    select p.id, p.user_id,
           user_prob(v_q, p.pick, p.confidence) as pu,
           coalesce(r.streak, 0) as streak
      from predictions p
      left join ratings r on r.user_id = p.user_id and r.season = v_season
     where p.fixture_id = p_fixture_id
  ),
  scored as (
    select id, user_id, pu, streak,
           delta_rating(v_q, pu, v_actual) as dr
      from calc
  ),
  ins as (
    insert into settlements
      (prediction_id, user_id, fixture_id, season, q_snapshot, p_user, actual, delta_rating, points)
    select id, user_id, p_fixture_id, v_season, to_jsonb(v_q), to_jsonb(pu), v_actual, dr,
           greatest(0, dr) + 3 + least(streak, 10) * 2       -- 명세 2.8
      from scored
    on conflict (prediction_id) do nothing
    returning prediction_id, user_id, delta_rating, points
  ),
  led as (
    insert into point_ledger (user_id, source, amount, ref_type, ref_id, idempotency_key)
    select user_id, 'settlement', points, 'prediction', prediction_id,
           'settle:' || prediction_id
      from ins
    on conflict (idempotency_key) do nothing
    returning id
  ),
  agg as (
    select user_id,
           sum(delta_rating) as d_rating,
           sum(points)       as d_points,
           count(*)          as n,
           bool_and(delta_rating > 0) as all_correct
      from ins group by user_id
  )
  update ratings r
     set rating          = r.rating + a.d_rating,
         lifetime_points = r.lifetime_points + a.d_points,
         balance         = r.balance + a.d_points,
         settled_matches = r.settled_matches + a.n,
         -- 스트릭: 이 경기를 다 맞혔으면 잇고, 아니면 끊는다
         streak          = case when a.all_correct then r.streak + a.n::int else 0 end,
         updated_at      = now()
    from agg a
   where r.user_id = a.user_id and r.season = v_season;

  select count(*) into v_settled from settlements where fixture_id = p_fixture_id;
  return v_settled;
end $$;

create or replace function settle_finished_fixtures()
returns int language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_total int := 0;
begin
  for v_id in
    select f.id from fixtures f
     where f.state = 'FINISHED'
       and f.result is not null
       and exists (select 1 from fixture_baselines b where b.fixture_id = f.id)
       and exists (select 1 from predictions p where p.fixture_id = f.id)
       and not exists (
         select 1 from settlements s
          join predictions p on p.id = s.prediction_id
         where p.fixture_id = f.id
       )
  loop
    v_total := v_total + settle_fixture(v_id);
  end loop;
  return v_total;
end $$;

-- ------------------------------------------------------------------ 랭킹

-- 백분위와 티어. 배치 20경기를 마친 유저만 순위에 든다 (명세 3.3)
create materialized view leaderboard as
select r.user_id,
       r.season,
       p.handle,
       r.rating,
       r.settled_matches,
       rank() over (partition by r.season order by r.rating desc) as rank,
       -- percent_rank() 는 double precision 이라 round(numeric, int) 를 쓰려면 캐스팅해야 한다
       round(((1 - percent_rank() over (partition by r.season order by r.rating)) * 100)::numeric, 1)
         as top_percent
  from ratings r
  join profiles p on p.id = r.user_id
 where r.settled_matches >= 20;

create unique index leaderboard_pk on leaderboard (season, user_id);
create index leaderboard_rank_idx on leaderboard (season, rank);

create or replace function tier_of(top_percent numeric, settled int)
returns text language sql immutable as $$
  select case
    when settled < 20        then 'PLACEMENT'
    when top_percent <= 1    then 'GRANDMASTER'
    when top_percent <= 5    then 'MASTER'
    when top_percent <= 15   then 'DIAMOND'
    when top_percent <= 30   then 'PLATINUM'
    when top_percent <= 50   then 'GOLD'
    when top_percent <= 75   then 'SILVER'
    else 'BRONZE'
  end;
$$;

-- ------------------------------------------------------------------ 채팅 팬아웃

-- Postgres Changes 대신 Broadcast 로 내보낸다. 구독자 수와 무관하게 한 번만 팬아웃된다. (명세 14.4)
create or replace function broadcast_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id, 'userId', new.user_id, 'body', new.body, 'at', new.created_at
    ),
    'chat.message',
    new.channel,
    false
  );
  return new;
end $$;

create trigger chat_broadcast after insert on chat_messages
  for each row execute function broadcast_chat();

-- 레이트 리밋: 5초에 3건, 가입 24시간 미만은 30초에 1건 (명세 10장)
create or replace function chat_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_recent int;
  v_new_account boolean;
begin
  select created_at > now() - interval '24 hours' into v_new_account
    from profiles where id = new.user_id;

  if v_new_account then
    select count(*) into v_recent from chat_messages
     where user_id = new.user_id and created_at > now() - interval '30 seconds';
    if v_recent >= 1 then
      raise exception 'RATE_LIMIT_SLOW_MODE';
    end if;
  else
    select count(*) into v_recent from chat_messages
     where user_id = new.user_id and created_at > now() - interval '5 seconds';
    if v_recent >= 3 then
      raise exception 'RATE_LIMIT';
    end if;
  end if;
  return new;
end $$;

create trigger chat_rate_limit_check before insert on chat_messages
  for each row execute function chat_rate_limit();

-- ------------------------------------------------------------------ 스케줄
-- pg_cron 은 UTC 로 돈다. 04:00 KST = 19:00 UTC (명세 14.3)

create extension if not exists pg_cron;

-- DB 안에서 도는 작업은 API 비용이 없으므로 촘촘히 돌린다.
select cron.schedule('lock-fixtures', '* * * * *',
  $$ select lock_due_fixtures(); $$);

select cron.schedule('settle-fixtures', '* * * * *',
  $$ select settle_finished_fixtures(); $$);

select cron.schedule('refresh-leaderboard', '0 19 * * *',
  $$ refresh materialized view concurrently leaderboard; $$);

select cron.schedule('prune-chat', '30 19 * * *',
  $$ delete from chat_messages
      where created_at < now() - interval '24 hours' and channel like 'match:%'; $$);

-- ------------------------------------------------------------------
-- 외부 API 를 쓰는 수집 작업. 호출을 아끼기 위해 주기를 크게 벌린다. (명세 12.1)
--
--   일정   주 1회 (월요일 04:00 KST = 일요일 19:00 UTC) — 향후 1개월치, 4회 호출
--   팀     월 1회 — 4회 호출
--   결과   10분마다 — 단, 열려 있고 안 끝난 경기가 없으면 함수가 API 를 부르지 않는다
--
-- pg_net 으로 Edge Function 을 호출한다. 키는 Vault 에 넣고 꺼내 쓴다.
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service_role_key>', 'service_key');
--
-- create extension if not exists pg_net;
--
-- create or replace function invoke_sync(p_mode text) returns void
-- language plpgsql security definer as $fn$
-- declare v_url text; v_key text;
-- begin
--   select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
--   select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_key';
--   perform net.http_post(
--     url     := v_url || '/functions/v1/sync-fixtures?mode=' || p_mode,
--     headers := jsonb_build_object('Authorization', 'Bearer ' || v_key)
--   );
-- end $fn$;
--
-- select cron.schedule('sync-schedule', '0 19 * * 0', $$ select invoke_sync('schedule'); $$);
-- select cron.schedule('sync-teams',    '0 18 1 * *', $$ select invoke_sync('teams');    $$);
-- select cron.schedule('sync-results',  '*/10 * * * *', $$ select invoke_sync('results'); $$);

-- ------------------------------------------------------------------ 신규 유저

-- 토스 로그인으로 auth.users 행이 생기면 프로필을 만든다.
-- 이게 없으면 가입은 되는데 읽을 프로필이 없어 첫 화면부터 실패한다.
-- security definer 인 이유: 이 시점에는 세션이 없어 RLS 를 통과할 수 없다.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_handle text;
begin
  v_handle := coalesce(
    nullif(new.raw_user_meta_data ->> 'handle', ''),
    '축잘알' || substr(replace(new.id::text, '-', ''), 1, 6)
  );

  while exists (select 1 from public.profiles where handle = v_handle) loop
    v_handle := v_handle || floor(random() * 10)::text;
  end loop;

  insert into public.profiles (id, handle) values (new.id, v_handle);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- 프로필이 생기면 그 시즌 ratings 행과 온보딩 보상 300포인트를 함께 만든다 (명세 4.2)
create or replace function bootstrap_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_season int := case when extract(month from now()) >= 7
                             then extract(year from now())::int
                             else extract(year from now())::int - 1 end;
begin
  insert into ratings (user_id, season, lifetime_points, balance)
  values (new.id, v_season, 300, 300)
  on conflict (user_id, season) do nothing;

  insert into point_ledger (user_id, source, amount, balance_after, idempotency_key)
  values (new.id, 'onboarding', 300, 300, 'onboarding:' || new.id)
  on conflict (idempotency_key) do nothing;

  return new;
end $$;

create trigger profiles_bootstrap after insert on profiles
  for each row execute function bootstrap_profile();

-- 머티리얼라이즈드 뷰는 RLS 를 타지 않는다. 읽기 권한을 명시적으로 준다.
-- 랭킹은 공개 데이터이므로 의도한 동작이다.
grant select on leaderboard to anon, authenticated;
