-- 축잘알 스키마 — 기술 명세 7장 / 14.2
-- 원칙: 점수가 붙는 테이블에는 클라이언트 쓰기 정책을 만들지 않는다.

create type match_outcome as enum ('HOME', 'DRAW', 'AWAY');
create type fixture_state as enum ('SCHEDULED', 'LIVE', 'FINISHED', 'VOID');
create type ledger_source as enum (
  'settlement', 'streak', 'mission', 'onboarding', 'referral', 'season_bonus', 'purchase'
);

-- ------------------------------------------------------------------ 카탈로그

create table leagues (
  id          int primary key,             -- API-Football league id
  name        text not null,
  short_name  text not null,
  country     text not null
);

create table teams (
  id         int primary key,              -- API-Football team id
  league_id  int not null references leagues(id),
  name       text not null,
  abbr       text not null,
  color      text not null default '#6B655B',
  tint       text not null default '#EDE5D8'
);
create index teams_league_idx on teams (league_id);

-- ------------------------------------------------------------------ 경기

create table fixtures (
  id            bigint primary key,        -- API-Football fixture id
  league_id     int not null references leagues(id),
  season        int not null,
  round         text,
  home_team_id  int not null references teams(id),
  away_team_id  int not null references teams(id),
  venue         text,
  kickoff_at    timestamptz not null,
  -- 예측 창: 매치데이 시작(opens_at) ~ 킥오프 5분 전(lock_at).
  -- 매치데이는 KST 06:00 에 시작한다. 유럽 경기가 KST 새벽이라 자정 경계로 자르면
  -- 토요일 밤에 일요일 새벽 경기를 예측할 수 없게 된다. (명세 2.1)
  opens_at      timestamptz not null,
  lock_at       timestamptz not null,
  state         fixture_state not null default 'SCHEDULED',
  status_short  text,
  -- 정규 90분 결과만 쓴다. 연장·승부차기는 점수에 반영하지 않는다 (명세 9장)
  home_goals_ft smallint,
  away_goals_ft smallint,
  result        match_outcome generated always as (
    case
      when home_goals_ft is null or away_goals_ft is null then null
      when home_goals_ft > away_goals_ft then 'HOME'::match_outcome
      when home_goals_ft < away_goals_ft then 'AWAY'::match_outcome
      else 'DRAW'::match_outcome
    end
  ) stored,
  updated_at    timestamptz not null default now()
);
create index fixtures_feed_idx on fixtures (league_id, kickoff_at);
-- 결과 폴링 대상(오늘 열린 경기 중 아직 안 끝난 것)을 빠르게 뽑기 위한 인덱스
create index fixtures_open_idx on fixtures (opens_at, state);
create index fixtures_state_idx on fixtures (state, kickoff_at);

create or replace function set_prediction_window() returns trigger
language plpgsql as $$
begin
  new.lock_at := new.kickoff_at - interval '5 minutes';
  -- 킥오프가 속한 매치데이의 시작(KST 06:00)
  new.opens_at := (
    date_trunc('day', (new.kickoff_at at time zone 'Asia/Seoul') - interval '6 hours')
    + interval '6 hours'
  ) at time zone 'Asia/Seoul';
  new.updated_at := now();
  return new;
end $$;

create trigger fixtures_window before insert or update of kickoff_at on fixtures
  for each row execute function set_prediction_window();

-- 마감 시각에 동결되는 기준선. 정산의 유일한 근거다 (명세 2.2)
create table fixture_baselines (
  fixture_id     bigint primary key references fixtures(id) on delete cascade,
  q              numeric[] not null,
  n_participants int not null default 0,
  source         text not null default 'blend',
  frozen_at      timestamptz not null default now(),
  constraint q_is_triple check (array_length(q, 1) = 3),
  constraint q_sums_to_one check (abs((q[1] + q[2] + q[3]) - 1) < 0.0001)
);

-- 모델 사전확률. 크라우드가 모이기 전까지의 근거 (명세 2.2)
create table fixture_priors (
  fixture_id bigint primary key references fixtures(id) on delete cascade,
  q          numeric[] not null,
  constraint prior_is_triple check (array_length(q, 1) = 3)
);

-- ------------------------------------------------------------------ 유저

create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  handle          text not null unique,
  favorite_team_id int references teams(id),
  league_order    int[] not null default '{39,140,78,135}',
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now()
);

create table ratings (
  user_id         uuid not null references profiles(id) on delete cascade,
  season          int not null,
  rating          int not null default 1000,
  lifetime_points int not null default 0,   -- 레벨의 근거, 절대 감소하지 않는다 (명세 4.1)
  balance         int not null default 0,   -- 상점 재화, 감소한다
  streak          int not null default 0,
  settled_matches int not null default 0,
  percentile      numeric,
  updated_at      timestamptz not null default now(),
  primary key (user_id, season)
);

create table rating_history (
  user_id uuid not null references profiles(id) on delete cascade,
  season  int not null,
  day     date not null,
  rating  int not null,
  rank    int,
  primary key (user_id, season, day)
);

-- ------------------------------------------------------------------ 예측과 정산

-- 점수 컬럼을 두지 않는다. 클라이언트가 쓸 수 있는 테이블이기 때문이다 (명세 14.2)
create table predictions (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  fixture_id bigint not null references fixtures(id) on delete cascade,
  pick       match_outcome not null,
  confidence smallint not null check (confidence between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fixture_id)
);
create index predictions_fixture_idx on predictions (fixture_id);

-- 불변 기록. 공식을 나중에 바꿔도 과거 점수를 재현할 수 있어야 한다 (명세 7장)
create table settlements (
  prediction_id bigint primary key references predictions(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  fixture_id    bigint not null references fixtures(id) on delete cascade,
  season        int not null,
  q_snapshot    jsonb not null,
  p_user        jsonb not null,
  actual        match_outcome not null,
  delta_rating  int not null,
  points        int not null,
  settled_at    timestamptz not null default now()
);
create index settlements_user_idx on settlements (user_id, settled_at desc);

-- 모든 포인트 증감이 통과하는 원장 (명세 4.7)
create table point_ledger (
  id              bigserial primary key,
  user_id         uuid not null references profiles(id) on delete cascade,
  source          ledger_source not null,
  amount          int not null,
  ref_type        text,
  ref_id          bigint,
  balance_after   int,
  idempotency_key text not null unique,
  created_at      timestamptz not null default now()
);
create index ledger_user_idx on point_ledger (user_id, created_at desc);

-- ------------------------------------------------------------------ 뱃지 · 채팅

create table badge_definitions (
  id     text primary key,
  name   text not null,
  grp    text not null,
  tier   text not null check (tier in ('bronze', 'silver', 'gold')),
  rule   jsonb not null,
  active boolean not null default true
);

create table user_badges (
  user_id   uuid not null references profiles(id) on delete cascade,
  badge_id  text not null references badge_definitions(id) on delete cascade,
  progress  int not null default 0,
  target    int not null,
  earned_at timestamptz,
  primary key (user_id, badge_id)
);

create table chat_messages (
  id         bigserial primary key,
  channel    text not null,               -- 'match:123' | 'league:39'
  fixture_id bigint references fixtures(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index chat_channel_idx on chat_messages (channel, created_at desc);

-- ------------------------------------------------------------------ RLS (명세 14.2)

alter table leagues            enable row level security;
alter table teams              enable row level security;
alter table fixtures           enable row level security;
alter table fixture_baselines  enable row level security;
alter table fixture_priors     enable row level security;
alter table profiles           enable row level security;
alter table ratings            enable row level security;
alter table rating_history     enable row level security;
alter table predictions        enable row level security;
alter table settlements        enable row level security;
alter table point_ledger       enable row level security;
alter table badge_definitions  enable row level security;
alter table user_badges        enable row level security;
alter table chat_messages      enable row level security;

-- 읽기만 열려 있는 공개 데이터
create policy read_leagues  on leagues           for select using (true);
create policy read_teams    on teams             for select using (true);
create policy read_fixtures on fixtures          for select using (true);
create policy read_badges   on badge_definitions for select using (true);
-- 기준선은 마감 후에만 공개한다. 마감 전 노출은 사후 조작의 빌미가 된다.
create policy read_baselines on fixture_baselines for select
  using (exists (select 1 from fixtures f where f.id = fixture_id and now() >= f.lock_at));

-- 공개 랭킹은 leaderboard 뷰가 담당한다. ratings 원본은 본인 것만 읽는다 —
-- 여기에는 보유 포인트와 스트릭처럼 남에게 보일 이유가 없는 값이 들어 있다.
create policy read_own_rating on ratings for select using (auth.uid() = user_id);
-- 프로필은 채팅에 닉네임을 띄워야 하므로 공개다.
create policy read_profiles on profiles for select using (true);

create policy write_own_profile on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- 예측: 본인 것만, 그리고 마감 전에만
create policy read_own_predictions on predictions for select
  using (auth.uid() = user_id);

-- 예측 창 밖에서는 쓰지 못한다. 이 조건이 곧 '당일 경기만 예측 가능' 규칙이다.
create policy insert_in_window on predictions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from fixtures f
       where f.id = fixture_id and now() between f.opens_at and f.lock_at
    )
  );

create policy update_in_window on predictions for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from fixtures f
       where f.id = fixture_id and now() between f.opens_at and f.lock_at
    )
  );

-- 점수가 붙는 테이블: 읽기만. 쓰기 정책이 없으므로 service_role 외에는 기본 거부.
create policy read_own_settlements on settlements  for select using (auth.uid() = user_id);
create policy read_own_ledger      on point_ledger for select using (auth.uid() = user_id);
create policy read_own_badges      on user_badges  for select using (auth.uid() = user_id);
create policy read_own_history     on rating_history for select using (auth.uid() = user_id);

-- 채팅: 모두 읽고, 본인 이름으로만 쓴다
create policy read_chat  on chat_messages for select using (deleted_at is null);
create policy write_chat on chat_messages for insert with check (auth.uid() = user_id);
