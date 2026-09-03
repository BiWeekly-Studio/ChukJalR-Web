-- 경기 부가 데이터 (명세 12.1 확장)
--
-- 지금까지 수집한 건 일정과 최종 스코어뿐이다. 여기서 네 가지를 더 받는다.
--   라이브 스코어 · 이벤트  → 채팅방과 Live Activity 가 실제로 살아난다
--   선발 명단               → 킥오프 전에 앱을 열 이유가 생긴다
--   상대 전적               → 경기 상세의 빈 자리를 사실로 채운다
--   경기 통계               → 끝난 경기의 요약
--
-- 전부 공개 읽기다. 예측·정산과 달리 비밀이 없고, 클라이언트가 바로 읽어야 한다.

-- ------------------------------------------------------------------ 라이브 스코어

-- 정규 결과(_ft)와 진행 중 점수를 섞으면 안 된다. 정산은 오직 _ft 만 본다 (명세 9장).
-- 라이브 값은 표시 전용이고, 경기가 끝나면 _ft 가 채워진다.
alter table fixtures
  add column if not exists home_goals_live smallint,
  add column if not exists away_goals_live smallint,
  -- 경과 분. 하프타임에는 45 에서 멈춘다 (API 가 그렇게 준다)
  add column if not exists elapsed smallint;

-- ------------------------------------------------------------------ 이벤트

create table if not exists fixture_events (
  fixture_id bigint not null references fixtures(id) on delete cascade,
  -- API 응답 순서. 같은 분에 여러 건이 오므로 분만으로는 키가 안 된다.
  seq        smallint not null,
  minute     smallint,
  extra      smallint,
  team_id    int references teams(id),
  -- Goal | Card | subst | Var
  type       text not null,
  detail     text,
  player     text,
  assist     text,
  primary key (fixture_id, seq)
);
create index if not exists fixture_events_idx on fixture_events (fixture_id, seq);

-- ------------------------------------------------------------------ 선발 명단

create table if not exists fixture_lineups (
  fixture_id bigint not null references fixtures(id) on delete cascade,
  team_id    int not null references teams(id),
  formation  text,
  -- [{name, number, pos}] — 선수 테이블을 따로 두지 않는다. 이 데이터는 경기에 붙어 있고
  -- 우리가 선수를 개별로 다룰 일이 없다.
  starters   jsonb not null default '[]'::jsonb,
  bench      jsonb not null default '[]'::jsonb,
  coach      text,
  updated_at timestamptz not null default now(),
  primary key (fixture_id, team_id)
);

-- ------------------------------------------------------------------ 상대 전적

create table if not exists fixture_h2h (
  fixture_id bigint primary key references fixtures(id) on delete cascade,
  played     smallint not null default 0,
  home_wins  smallint not null default 0,
  draws      smallint not null default 0,
  away_wins  smallint not null default 0,
  -- 최근 5경기 [{date, hg, ag, home_id, away_id}]
  recent     jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ 경기 통계

create table if not exists fixture_stats (
  fixture_id bigint not null references fixtures(id) on delete cascade,
  team_id    int not null references teams(id),
  -- {"Ball Possession": "54%", "Total Shots": 14, ...} — API 가 주는 이름을 그대로 쓴다
  stats      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (fixture_id, team_id)
);

-- ------------------------------------------------------------------ 기준 확률의 출처

-- 배당에서 뽑은 값과 모델이 만든 값을 구분한다. 배당이 있으면 그쪽이 낫고,
-- 모델이 나중에 덮어써서 더 나쁜 기준선으로 되돌아가면 안 된다.
alter table fixture_priors
  add column if not exists source text not null default 'model',
  add column if not exists updated_at timestamptz not null default now();

-- ------------------------------------------------------------------ RLS

alter table fixture_events  enable row level security;
alter table fixture_lineups enable row level security;
alter table fixture_h2h     enable row level security;
alter table fixture_stats   enable row level security;

create policy read_events  on fixture_events  for select using (true);
create policy read_lineups on fixture_lineups for select using (true);
create policy read_h2h     on fixture_h2h     for select using (true);
create policy read_stats   on fixture_stats   for select using (true);

-- 기준 확률은 클라이언트가 볼 이유가 없다. 마감 때 동결된 fixture_baselines 만 보면 된다.
-- 배당에서 뽑은 값이라 노출하면 배당을 그대로 보여주는 것과 같아진다.
