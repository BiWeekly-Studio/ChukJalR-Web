-- 푸시 알림 (명세 12.2)
--
-- 마감·킥오프처럼 시각이 미리 정해진 것은 기기가 알아서 예약한다. 정산 결과는
-- 서버만 아는 시점이라 푸시가 아니면 알릴 방법이 없다 — 그래서 이것만 서버가 보낸다.

create table if not exists push_tokens (
  -- 같은 사람이 기기를 여럿 쓸 수 있다. 토큰이 키다.
  token      text primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  platform   text not null default 'ios',
  -- 배포 빌드와 개발 빌드는 APNs 서버가 다르다. 토큰만 봐서는 구분할 수 없어 같이 받는다.
  environment text not null default 'production',
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on push_tokens (user_id);

-- 같은 것을 두 번 보내지 않기 위한 기록. 발송이 중간에 끊겨도 다시 돌리면
-- 안 보낸 것만 나간다.
create table if not exists push_log (
  user_id uuid not null references profiles(id) on delete cascade,
  kind    text not null,
  ref_id  bigint not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref_id)
);

alter table push_tokens enable row level security;
alter table push_log    enable row level security;

-- 내 토큰만 등록·삭제할 수 있다. 읽기는 열지 않는다 — 남의 기기 토큰을 볼 이유가 없고,
-- 발송은 service_role 이 한다.
create policy write_own_token on push_tokens
  for insert to authenticated with check (auth.uid() = user_id);
create policy update_own_token on push_tokens
  for update to authenticated using (auth.uid() = user_id);
create policy delete_own_token on push_tokens
  for delete to authenticated using (auth.uid() = user_id);

-- 아직 안 보낸 정산 결과. Edge Function 이 이것만 읽고 보낸다.
-- security definer 로 두어 service_role 이 조인을 한 번에 받게 한다.
create or replace function pending_settlement_pushes(p_since_minutes int default 60)
returns table (
  user_id uuid, prediction_id bigint, delta_rating int, points int,
  hit boolean, home_name text, away_name text, tokens text[]
)
language sql security definer set search_path = public stable as $$
  select s.user_id,
         s.prediction_id,
         s.delta_rating,
         s.points,
         s.delta_rating > 0                    as hit,
         coalesce(h.name_ko, h.name)           as home_name,
         coalesce(a.name_ko, a.name)           as away_name,
         array_agg(t.token)                    as tokens
    from settlements s
    join fixtures f on f.id = s.fixture_id
    join teams h    on h.id = f.home_team_id
    join teams a    on a.id = f.away_team_id
    join push_tokens t on t.user_id = s.user_id
   where s.settled_at > now() - make_interval(mins => p_since_minutes)
     and not exists (
       select 1 from push_log l
        where l.user_id = s.user_id and l.kind = 'settlement' and l.ref_id = s.prediction_id
     )
   group by s.user_id, s.prediction_id, s.delta_rating, s.points,
            h.name_ko, h.name, a.name_ko, a.name;
$$;

revoke all on function pending_settlement_pushes(int) from public;
grant execute on function pending_settlement_pushes(int) to service_role;

-- 죽은 토큰 정리. APNs 가 410 을 주면 그 기기는 앱을 지운 것이다.
create or replace function drop_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token;
$$;
revoke all on function drop_push_token(text) from public;
grant execute on function drop_push_token(text) to service_role;
