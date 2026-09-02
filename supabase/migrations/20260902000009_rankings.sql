-- 랭킹 발표 (명세 3.3)
--
-- 시각 결정: 유럽 경기는 KST 새벽 05:00에도 킥오프해서 07:00 무렵 끝난다.
-- 04:00 KST 갱신은 그 경기들을 다음 날까지 반영하지 못한다.
-- 마지막 경기가 정산되고 남는 08:00 KST 로 옮긴다. (= 23:00 UTC 전날)
--
-- 갱신 방식: 내 지수는 정산 즉시 움직이지만, 남과 비교하는 순위는 하루 한 번만 확정한다.
-- 순위가 실시간으로 출렁이면 노이즈가 되고, 아침에 "어제 나 몇 등 됐지"를 확인하는
-- 리듬이 생기지 않는다.

drop materialized view if exists leaderboard cascade;

create materialized view leaderboard as
with agg as (
  -- 우리 공식에서는 맞히면 항상 Δ지수가 양수다. 그래서 적중 = delta_rating > 0.
  select s.user_id, s.season,
         count(*)                                  as settled,
         count(*) filter (where s.delta_rating > 0) as hits
    from settlements s
   group by s.user_id, s.season
),
prev as (
  -- 직전 발표 시점의 순위. 변동 화살표의 근거다.
  select distinct on (user_id, season) user_id, season, rank
    from rating_history
   order by user_id, season, day desc
)
select r.user_id,
       r.season,
       p.handle,
       r.rating,
       r.settled_matches,
       round(coalesce(a.hits::numeric / nullif(a.settled, 0), 0), 3) as accuracy,
       rank() over (partition by r.season order by r.rating desc)     as rank,
       round(((1 - percent_rank() over (partition by r.season order by r.rating)) * 100)::numeric, 1)
         as top_percent,
       pr.rank as prev_rank
  from ratings r
  join profiles p on p.id = r.user_id
  left join agg a  on a.user_id  = r.user_id and a.season  = r.season
  left join prev pr on pr.user_id = r.user_id and pr.season = r.season
 where r.settled_matches >= 20;

create unique index leaderboard_pk on leaderboard (season, user_id);
create index leaderboard_rank_idx on leaderboard (season, rank);
grant select on leaderboard to anon, authenticated;

-- 발표 = 갱신 + 스냅샷. 순서가 중요하다 — 갱신 시점의 prev 는 어제 스냅샷을 읽는다.
create or replace function publish_rankings()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  -- concurrently 는 트랜잭션 안에서 못 돈다. 규모가 작아 잠깐의 잠금은 문제되지 않는다.
  refresh materialized view leaderboard;

  insert into rating_history (user_id, season, day, rating, rank)
  select user_id, season, (now() at time zone 'Asia/Seoul')::date, rating, rank
    from leaderboard
  on conflict (user_id, season, day) do update
    set rating = excluded.rating, rank = excluded.rank;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 08:00 KST = 23:00 UTC (전날)
select cron.unschedule('refresh-leaderboard');
select cron.schedule('publish-rankings', '0 23 * * *', $$ select publish_rankings(); $$);
