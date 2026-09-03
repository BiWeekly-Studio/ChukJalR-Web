-- 내 기록에 볼 것을 더한다 — 지수 추이와 픽 성향
--
-- 지금은 정산이 쌓여야 뭔가 보인다. 리그별·확신도·팬심 셋 다 표본이 필요해서,
-- 새로 온 사람의 '나' 탭은 빈 상자 세 개다.
--
-- 추이는 rating_history(하루 한 점)가 아니라 settlements 에서 만든다. 경기마다
-- 한 점이 찍히므로 첫 경기부터 선이 그려지고, 어디서 꺾였는지도 보인다.
create or replace function my_stats()
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_user uuid := auth.uid();
  v_fav  int[];
begin
  if v_user is null then
    return null;
  end if;

  select favorite_team_ids into v_fav from profiles where id = v_user;

  return (
    with mine as (
      select s.*, p.confidence, p.pick, f.league_id,
             (f.home_team_id = any(v_fav) or f.away_team_id = any(v_fav)) as is_fav
        from settlements s
        join predictions p on p.id = s.prediction_id
        join fixtures f    on f.id = s.fixture_id
       where s.user_id = v_user
    ),
    -- 시작 지수 1000 에서 정산 순서대로 더해 나간 값. 서버가 들고 있는 현재 지수와
    -- 같은 수를 재현하므로, 화면의 선과 헤더의 숫자가 어긋나지 않는다.
    curve as (
      select settled_at,
             1000 + sum(delta_rating) over (order by settled_at
                                            rows between unbounded preceding and current row) as rating
        from mine
    )
    select jsonb_build_object(
      'settled', (select count(*) from mine),
      'hits',    (select count(*) filter (where delta_rating > 0) from mine),

      'byLeague', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'leagueId', league_id, 'n', n, 'accuracy', round(hits::numeric / n, 3)
               ) order by league_id), '[]'::jsonb)
          from (select league_id, count(*) n, count(*) filter (where delta_rating > 0) hits
                  from mine group by league_id) t
      ),

      'calibration', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'confidence', confidence, 'n', n,
                 'expected', round(expected, 3), 'actual', round(actual, 3)
               ) order by confidence), '[]'::jsonb)
          from (
            select confidence,
                   count(*) as n,
                   avg((p_user ->> (outcome_index(pick) - 1))::numeric) as expected,
                   count(*) filter (where delta_rating > 0)::numeric / count(*) as actual
              from mine group by confidence
          ) t
      ),

      -- 어느 쪽에 걸었을 때 잘 맞히는지. 홈에만 걸어서 이기는 사람과 원정을 읽는
      -- 사람은 다르고, 본인은 대개 그걸 모른다.
      'byOutcome', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'pick', pick, 'n', n, 'accuracy', round(hits::numeric / n, 3)
               ) order by pick), '[]'::jsonb)
          from (select pick, count(*) n, count(*) filter (where delta_rating > 0) hits
                  from mine group by pick) t
      ),

      -- 내 팀 경기 전체를 묶어서 본다. 팀이 여럿이어도 "팬심"은 하나의 성향이다.
      'fanBias', (
        select case when count(*) filter (where is_fav) = 0 then null
               else jsonb_build_object(
                 'teamIds', to_jsonb(v_fav),
                 'n',       count(*) filter (where is_fav),
                 'bias',    round(avg(delta_rating) filter (where is_fav) - avg(delta_rating), 1)
               ) end
          from mine
      ),

      'recent', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'correct', delta_rating > 0, 'delta', delta_rating
               ) order by settled_at desc), '[]'::jsonb)
          from (select delta_rating, settled_at from mine order by settled_at desc limit 10) t
      ),

      -- 최근 30경기치만. 그보다 길면 화면에서 한 점이 1px 도 안 된다.
      'curve', (
        select coalesce(jsonb_agg(rating order by settled_at), '[]'::jsonb)
          from (select settled_at, rating from curve order by settled_at desc limit 30) t
      )
    )
  );
end $$;
