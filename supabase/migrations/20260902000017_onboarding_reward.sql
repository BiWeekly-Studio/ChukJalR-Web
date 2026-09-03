-- ------------------------------------------------------------------
-- 가입 보상은 상점 재화로만 준다
--
-- bootstrap_profile 이 300 을 lifetime_points 와 balance 양쪽에 넣고 있었다.
-- lifetime_points 는 '레벨의 근거'(스키마 주석, 명세 4.1)인데, 여기에 가입 보상이
-- 섞이면 앱을 처음 켠 사람이 Lv.3 · XP 50% 로 시작한다 — 아무것도 하지 않았는데
-- 레벨이 3이면 레벨 자체가 의미를 잃는다.
--
--   lifetime_points 300 → Lv.3 도달선 225, 다음 레벨까지 150 → 75/150 = 50%
--
-- 보상은 balance(상점 재화)에만 넣는다. 레벨은 실력으로만 오른다.
-- ------------------------------------------------------------------

create or replace function bootstrap_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_season int := case when extract(month from now()) >= 7
                             then extract(year from now())::int
                             else extract(year from now())::int - 1 end;
begin
  -- lifetime_points 는 0 에서 시작한다. 레벨은 예측으로만 오른다.
  insert into ratings (user_id, season, lifetime_points, balance)
  values (new.id, v_season, 0, 300)
  on conflict (user_id, season) do nothing;

  insert into point_ledger (user_id, source, amount, balance_after, idempotency_key)
  values (new.id, 'onboarding', 300, 300, 'onboarding:' || new.id)
  on conflict (idempotency_key) do nothing;

  return new;
end $$;

-- 이미 만들어진 계정 되돌리기.
-- 가입 보상만 받고 아직 아무것도 정산되지 않은 사람은 lifetime_points 가 정확히 300 이다.
-- 그 사람들만 0 으로 내린다 — 실제로 쌓은 포인트가 있는 계정은 건드리지 않는다.
update ratings
   set lifetime_points = 0
 where lifetime_points = 300
   and settled_matches = 0;
