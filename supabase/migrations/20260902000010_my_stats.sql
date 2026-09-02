-- 내 기록 집계 (명세 5.4)
--
-- 프로필 화면이 필요한 값을 한 번의 호출로 모두 돌려준다.
-- 앱인토스는 미니앱 단위 요청 한도가 있어 화면마다 여러 번 부르면 안 된다. (명세 13.1)
--
-- 캘리브레이션은 고정 구간과 비교하지 않는다. 정산 시 저장해 둔 p_user 로
-- "내가 평균 몇 %를 걸었나"를 계산해 실제 적중률과 맞대본다. 그게 캘리브레이션의 정의다.

create or replace function my_stats()
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_user uuid := auth.uid();
  v_fav  int;
begin
  if v_user is null then
    return null;
  end if;

  select favorite_team_id into v_fav from profiles where id = v_user;

  return (
    with mine as (
      select s.*, p.confidence, p.pick, f.league_id,
             (f.home_team_id = v_fav or f.away_team_id = v_fav) as is_fav
        from settlements s
        join predictions p on p.id = s.prediction_id
        join fixtures f    on f.id = s.fixture_id
       where s.user_id = v_user
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

      -- 확신도별: 내가 건 평균 확률(expected) vs 실제 적중률(actual)
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

      -- 팬심 편향 = 최애팀 경기 평균 Δ지수 − 전체 평균 Δ지수
      'fanBias', (
        select case when count(*) filter (where is_fav) = 0 then null
               else jsonb_build_object(
                 'teamId', v_fav,
                 'n',      count(*) filter (where is_fav),
                 'bias',   round(
                             avg(delta_rating) filter (where is_fav) - avg(delta_rating), 1
                           )
               ) end
          from mine
      ),

      'recent', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'correct', delta_rating > 0, 'delta', delta_rating
               ) order by settled_at desc), '[]'::jsonb)
          from (select delta_rating, settled_at from mine order by settled_at desc limit 10) t
      )
    )
  );
end $$;

grant execute on function my_stats() to authenticated;
