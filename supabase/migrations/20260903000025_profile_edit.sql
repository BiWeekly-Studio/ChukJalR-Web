-- 프로필 편집 — 닉네임과 사진
--
-- 채팅과 순위표에 사람이 드러나는 앱이라, 이름과 얼굴을 바꿀 수 있어야 한다.

alter table profiles
  add column if not exists avatar_url text,
  -- 닉네임을 언제 바꿨는지. 채팅에서 이름을 자주 갈아끼우면 사칭이 쉬워진다.
  add column if not exists handle_changed_at timestamptz;

-- ------------------------------------------------------------------ 닉네임

-- 유일성 제약이 이미 걸려 있다. 그걸 붙잡아 사람이 읽을 코드로 바꿔 던진다 —
-- 클라이언트가 23505 를 해석하게 두면 화면마다 같은 처리를 반복하게 된다.
create or replace function set_handle(p_handle text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := btrim(p_handle);
  v_last timestamptz;
  v_days int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  if char_length(v_name) < 2 or char_length(v_name) > 12 then
    raise exception 'HANDLE_LENGTH';
  end if;
  -- 공백과 제어문자는 막는다. 이름 사이의 공백까지 허용하면 '홍  길동' 처럼
  -- 보이지 않는 차이로 남을 흉내 낼 수 있다.
  if v_name ~ '[[:space:][:cntrl:]]' then
    raise exception 'HANDLE_CHARS';
  end if;

  select handle_changed_at into v_last from profiles where id = v_uid;
  if v_last is not null and v_last > now() - interval '7 days' then
    v_days := ceil(extract(epoch from (v_last + interval '7 days' - now())) / 86400);
    raise exception 'HANDLE_COOLDOWN:%', v_days;
  end if;

  begin
    update profiles set handle = v_name, handle_changed_at = now() where id = v_uid;
  exception when unique_violation then
    raise exception 'HANDLE_TAKEN';
  end;

  return v_name;
end $$;

revoke all on function set_handle(text) from public;
grant execute on function set_handle(text) to authenticated;

-- ------------------------------------------------------------------ 사진

-- 공개 버킷이다. 순위표와 채팅에서 남의 사진을 봐야 하고, 그때마다 서명 URL 을
-- 만들면 목록 한 번에 수십 번의 요청이 더 붙는다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 파일 이름은 '<uid>.jpg' 하나로 고정한다. 사람마다 한 장이면 되고,
-- 경로에 uid 를 박아두면 정책이 단순해진다.
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------------ 순위표·채팅에 노출

-- 순위표는 뷰다. 사진을 보여주려면 뷰도 같이 넓혀야 한다.

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
       p.avatar_url,
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

refresh materialized view leaderboard;

-- 채팅 브로드캐스트에도 사진을 싣는다. 과거 메시지는 profiles 조인으로 받으므로
-- 두 경로가 같은 것을 보게 하려면 여기도 넓혀야 한다.
create or replace function broadcast_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_handle text;
  v_avatar text;
begin
  select handle, avatar_url into v_handle, v_avatar from profiles where id = new.user_id;

  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'userId', new.user_id,
      'handle', coalesce(v_handle, '알 수 없음'),
      'avatar', v_avatar,
      'body', new.body,
      'at', new.created_at
    ),
    'chat.message',
    new.channel,
    false
  );
  return new;
end $$;
