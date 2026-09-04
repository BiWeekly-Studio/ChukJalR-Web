-- 뱃지 (명세 6장)
--
-- 지금까지 badge_definitions 는 비어 있었고, 채워도 아무것도 달라지지 않았다 —
-- 진행도를 계산해 주는 코드가 없어서 모든 뱃지가 영영 0 이었을 것이다.
-- 정의와 계산을 같이 넣는다.
--
-- 계산은 매번 처음부터 다시 한다. 증분으로 더해 나가면 정산이 재실행되거나
-- 계정이 지워질 때 어긋나고, 어긋난 걸 알아채기도 어렵다. 유저 수 규모에서
-- 전체 재계산은 충분히 싸다.

insert into badge_definitions (id, name, grp, tier, rule, active) values
  ('first_pick',    '첫 예측',      'start',  'bronze',
   '{"desc":"첫 경기를 예측한다","target":1}', true),
  ('placed',        '배치 완료',    'start',  'silver',
   '{"desc":"정산된 예측 20경기","target":20}', true),

  ('streak_3',      '3연속 적중',   'streak', 'bronze',
   '{"desc":"연속으로 3경기 적중","target":3}', true),
  ('streak_5',      '5연속 적중',   'streak', 'silver',
   '{"desc":"연속으로 5경기 적중","target":5}', true),
  ('streak_10',     '10연속 적중',  'streak', 'gold',
   '{"desc":"연속으로 10경기 적중","target":10}', true),

  ('contrarian_3',  '역발상',       'read',   'silver',
   '{"desc":"기준 확률 25% 미만인 결과를 3번 맞힌다","target":3}', true),
  ('contrarian_10', '역발상의 대가','read',   'gold',
   '{"desc":"기준 확률 25% 미만인 결과를 10번 맞힌다","target":10}', true),

  ('conviction_10', '확신의 값',    'read',   'silver',
   '{"desc":"''이건 확실해요''로 10번 적중","target":10}', true),

  ('regular_7',     '일주일 개근',  'habit',  'bronze',
   '{"desc":"서로 다른 7일에 예측","target":7}', true),
  ('regular_30',    '한 달 개근',   'habit',  'silver',
   '{"desc":"서로 다른 30일에 예측","target":30}', true),

  ('cool_head',     '팬심 극복',    'habit',  'gold',
   '{"desc":"내 팀 경기 10건 이상에서 평균 지수가 손해가 아니다","target":10}', true)
on conflict (id) do update set
  name = excluded.name, grp = excluded.grp, tier = excluded.tier,
  rule = excluded.rule, active = excluded.active;


-- 한 사람의 뱃지를 전부 다시 센다.
create or replace function refresh_badges(p_uid uuid)
returns int language plpgsql security definer set search_path = public as $$
-- 파라미터 이름이 컬럼과 겹치면 plpgsql 이 컬럼을 먼저 본다. 변수 쪽으로 못 박는다.
#variable_conflict use_variable
declare
  v_n int;
begin
  with mine as (
    select s.delta_rating, s.settled_at, s.q_snapshot, s.actual,
           p.confidence,
           (f.home_team_id = any(pr.favorite_team_ids)
            or f.away_team_id = any(pr.favorite_team_ids)) as is_fav
      from settlements s
      join predictions p on p.id = s.prediction_id
      join fixtures f    on f.id = s.fixture_id
      join profiles pr   on pr.id = s.user_id
     where s.user_id = p_uid
  ),
  -- 연속 적중의 최고 기록. 시간순으로 훑으며 실패에서 끊는다.
  runs as (
    select delta_rating > 0 as hit,
           row_number() over (order by settled_at)
             - row_number() over (partition by delta_rating > 0 order by settled_at) as grp
      from mine
  ),
  best_streak as (
    select coalesce(max(cnt), 0) as n
      from (select count(*) cnt from runs where hit group by grp) t
  ),
  totals as (
    select
      (select count(*) from predictions where user_id = p_uid)              as picks,
      (select count(*) from mine)                                            as settled,
      (select n from best_streak)                                            as streak,
      -- 기준선이 낮게 본 결과를 맞힌 횟수. q_snapshot 은 마감 때 동결된 값이다.
      (select count(*) from mine
        where delta_rating > 0
          and (q_snapshot ->> (outcome_index(actual) - 1))::numeric < 0.25)  as contrarian,
      (select count(*) from mine where delta_rating > 0 and confidence = 3)  as conviction,
      (select count(distinct (created_at at time zone 'Asia/Seoul')::date)
         from predictions where user_id = p_uid)                            as days,
      (select count(*) from mine where is_fav)                               as fav_n,
      (select coalesce(avg(delta_rating) filter (where is_fav), -1) from mine) as fav_avg
  )
  insert into user_badges (user_id, badge_id, progress, target, earned_at)
  select p_uid, b.id, least(v.progress, v.target), v.target,
         case when v.progress >= v.target then now() end
    from totals t
    cross join lateral (values
      ('first_pick',    t.picks,      1),
      ('placed',        t.settled,    20),
      ('streak_3',      t.streak,     3),
      ('streak_5',      t.streak,     5),
      ('streak_10',     t.streak,     10),
      ('contrarian_3',  t.contrarian, 3),
      ('contrarian_10', t.contrarian, 10),
      ('conviction_10', t.conviction, 10),
      ('regular_7',     t.days,       7),
      ('regular_30',    t.days,       30),
      -- 팬심 극복은 '손해를 안 봤을 때만' 진행도를 인정한다. 경기 수만 채우고
      -- 편향이 마이너스면 0 이다 — 그래야 뱃지 이름이 거짓말이 아니다.
      ('cool_head',     case when t.fav_avg >= 0 then t.fav_n else 0 end, 10)
    ) as v(badge_id, progress, target)
    join badge_definitions b on b.id = v.badge_id and b.active
  on conflict (user_id, badge_id) do update set
    progress = excluded.progress,
    target   = excluded.target,
    -- 한 번 받은 뱃지는 회수하지 않는다. 나중에 규칙이 바뀌어도 마찬가지다.
    earned_at = coalesce(user_badges.earned_at, excluded.earned_at);

  get diagnostics v_n = row_count;
  return v_n;
end $$;


-- 최근에 뭔가 달라진 사람만 다시 센다. 전체를 매번 돌 이유가 없다.
create or replace function refresh_recent_badges()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_n int := 0;
begin
  for v_user in
    select user_id from settlements where settled_at > now() - interval '2 hours'
    union
    select user_id from predictions where created_at > now() - interval '2 hours'
                                       or updated_at > now() - interval '2 hours'
  loop
    perform refresh_badges(v_user);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

select cron.schedule('badge-refresh', '*/10 * * * *', $$ select refresh_recent_badges(); $$);

-- 이미 예측한 사람들의 뱃지를 한 번 채워 둔다
select refresh_badges(id) from profiles;
