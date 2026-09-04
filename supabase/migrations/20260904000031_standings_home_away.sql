-- 순위표에 홈/원정 분리를 더한다
--
-- 기준 확률 모델은 리그의 홈 어드밴티지를 관측값에서 끌어온다. 저장된 표에 합계만
-- 있으면 그 신호가 사라지고 장기 평균만 남는다 — 시즌이 깊어져도 모델이 그 리그의
-- 실제 홈 강세를 반영하지 못한다.
alter table standings
  add column if not exists home_played    smallint not null default 0,
  add column if not exists home_goals_for smallint not null default 0,
  add column if not exists away_played    smallint not null default 0,
  add column if not exists away_goals_for smallint not null default 0;
