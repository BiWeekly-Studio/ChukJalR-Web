-- 리그 순위표 (명세 12.1 확장)
--
-- 순위표는 이미 매주 받고 있다 — 기준 확률 모델이 팀 전력을 재는 데 쓴다.
-- 그런데 계산만 하고 표는 버렸다. 저장만 하면 API 호출은 한 번도 늘지 않는다.
create table if not exists standings (
  league_id  int not null references leagues(id) on delete cascade,
  season     int not null,
  team_id    int not null references teams(id) on delete cascade,
  rank       smallint not null,
  points     smallint not null,
  played     smallint not null,
  win        smallint not null,
  draw       smallint not null,
  lose       smallint not null,
  goals_for     smallint not null,
  goals_against smallint not null,
  goal_diff  smallint not null,
  -- 최근 5경기 "WWDLW". API 가 주는 그대로 — 우리가 다시 세지 않는다.
  form       text,
  updated_at timestamptz not null default now(),
  primary key (league_id, season, team_id)
);
create index if not exists standings_rank_idx on standings (league_id, season, rank);

alter table standings enable row level security;
create policy read_standings on standings for select using (true);
