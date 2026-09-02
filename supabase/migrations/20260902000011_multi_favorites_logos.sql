-- 최애 팀 최대 5개 + 팀 엠블럼

-- 1) 최애 팀을 배열로. 하나만 고르게 하면 여러 리그를 보는 사람을 담지 못한다.
alter table profiles add column if not exists favorite_team_ids int[] not null default '{}';

update profiles
   set favorite_team_ids = array[favorite_team_id]
 where favorite_team_id is not null
   and cardinality(favorite_team_ids) = 0;

alter table profiles drop column if exists favorite_team_id;

alter table profiles
  add constraint favorite_team_limit check (cardinality(favorite_team_ids) <= 5);

-- 2) 엠블럼. API-Football 이 team.logo 로 URL 을 준다.
alter table teams add column if not exists logo_url text;

-- 3) 팬심 편향을 여러 팀 기준으로 다시 쓴다.
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
      )
    )
  );
end $$;
