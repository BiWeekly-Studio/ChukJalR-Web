-- ------------------------------------------------------------------
-- 채팅 신고·차단·필터 (명세 10장, 앱인토스 정책 13.2)
--
-- 앱인토스는 "신고·차단·제재 정책·운영자 검토를 UI에 실제로 노출"할 것을 요구한다.
-- 정책 문서만 있고 기능이 없으면 심사에서 걸린다.
--
-- 판정은 전부 서버에서 한다. 클라이언트에서만 가리면 API 를 직접 호출해 뚫을 수 있고,
-- 차단한 사람의 메시지가 그대로 흘러들어온다.
-- ------------------------------------------------------------------

alter table chat_messages add column if not exists hidden_at    timestamptz;
alter table chat_messages add column if not exists report_count int not null default 0;

comment on column chat_messages.hidden_at is
  '신고 누적으로 자동 숨김된 시각. 운영자 검토 큐로 넘어간다';

-- ---------------------------------------------------------------- 신고

create table if not exists message_reports (
  message_id  bigint      not null references chat_messages(id) on delete cascade,
  reporter_id uuid        not null references profiles(id)      on delete cascade,
  reason      text        not null check (reason in ('SPAM', 'ABUSE', 'SEXUAL', 'ADVERT', 'OTHER')),
  created_at  timestamptz not null default now(),
  -- 같은 사람이 같은 메시지를 여러 번 신고해 자동 숨김을 조작하지 못하게 한다
  primary key (message_id, reporter_id)
);

-- ---------------------------------------------------------------- 차단

create table if not exists user_blocks (
  blocker_id uuid        not null references profiles(id) on delete cascade,
  blocked_id uuid        not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocker_idx on user_blocks (blocker_id);

-- ---------------------------------------------------------------- 금칙어

create table if not exists banned_words (
  word   text primary key,
  active boolean not null default true
);

-- 초기 목록은 이 앱에서 실제로 들어오는 스팸(도박·홍보) 위주로만 채운다.
-- 욕설 사전은 관리되는 목록을 따로 적재할 것 — 여기에 박아두면 갱신이 안 된다.
insert into banned_words (word) values
  ('토토'), ('사설토토'), ('배팅'), ('베팅'), ('먹튀'), ('꽁머니'),
  ('입금'), ('출금'), ('환전'), ('카지노'), ('바카라'), ('슬롯'),
  ('텔레그램'), ('카톡문의'), ('디비팝니다')
on conflict (word) do nothing;

-- ---------------------------------------------------------------- 필터

/**
 * 메시지 저장 전 검사. 링크와 금칙어를 막는다 (명세 10장).
 * 예외로 던지므로 클라이언트에는 에러로 도착한다.
 */
create or replace function filter_chat_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 초기에는 링크를 통째로 막는다. 축구 얘기에 링크가 필요할 일이 거의 없고,
  -- 스팸은 대부분 링크로 들어온다.
  if new.body ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|kr|me|io|co)\M)' then
    raise exception 'LINK_NOT_ALLOWED';
  end if;

  if exists (
    select 1 from banned_words w
     where w.active and new.body ilike '%' || w.word || '%'
  ) then
    raise exception 'BANNED_WORD';
  end if;

  return new;
end $$;

drop trigger if exists chat_filter on chat_messages;
create trigger chat_filter before insert on chat_messages
  for each row execute function filter_chat_message();

-- ---------------------------------------------------------------- 자동 숨김

/** 신고 3건이 쌓이면 자동으로 가리고 검토 큐로 넘긴다 (명세 10장) */
create or replace function on_message_reported() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update chat_messages
     set report_count = report_count + 1,
         hidden_at = case when report_count + 1 >= 3 and hidden_at is null
                          then now() else hidden_at end
   where id = new.message_id
   returning report_count into v_count;
  return new;
end $$;

drop trigger if exists on_report on message_reports;
create trigger on_report after insert on message_reports
  for each row execute function on_message_reported();

/** 운영자 검토 큐. service_role 로만 읽는다 */
create or replace view moderation_queue as
  select m.id, m.channel, m.fixture_id, m.user_id, m.body,
         m.report_count, m.hidden_at, m.created_at,
         array_agg(r.reason) as reasons
    from chat_messages m
    join message_reports r on r.message_id = m.id
   where m.hidden_at is not null and m.deleted_at is null
   group by m.id
   order by m.hidden_at desc;

-- ---------------------------------------------------------------- RLS

alter table message_reports enable row level security;
alter table user_blocks     enable row level security;
alter table banned_words    enable row level security;

-- 신고는 본인 것만 넣고 본인 것만 본다. 남이 무엇을 신고했는지는 알 수 없어야 한다.
create policy insert_own_report on message_reports for insert
  with check (auth.uid() = reporter_id);
create policy read_own_report on message_reports for select
  using (auth.uid() = reporter_id);

-- 차단은 본인 목록만 읽고 쓰고 지운다
create policy manage_own_blocks on user_blocks for all
  using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- 금칙어 목록은 클라이언트가 읽을 이유가 없다. 정책을 만들지 않아 기본 거부로 둔다.

-- 읽기 정책 교체: 숨김 처리된 메시지와 내가 차단한 사람의 메시지는 내려보내지 않는다.
-- 내가 쓴 글은 숨겨져도 나에게는 보인다 — 사라진 것처럼 보이면 오히려 혼란스럽다.
drop policy if exists read_chat on chat_messages;
create policy read_chat on chat_messages for select using (
  deleted_at is null
  and (hidden_at is null or user_id = auth.uid())
  and not exists (
    select 1 from user_blocks b
     where b.blocker_id = auth.uid() and b.blocked_id = chat_messages.user_id
  )
);
