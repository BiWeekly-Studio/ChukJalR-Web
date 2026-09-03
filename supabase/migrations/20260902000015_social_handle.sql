-- ------------------------------------------------------------------
-- 소셜 로그인으로 들어온 사람의 닉네임
--
-- 기존 handle_new_user 는 raw_user_meta_data.handle 만 봤다. 그 키는 우리가 이메일
-- 가입에서 직접 넣어주는 값이라, 소셜로 들어오면 항상 비어 있고 전원이
-- '축잘알a1b2c3' 같은 자동 생성 닉네임을 받게 된다.
--
-- 제공자마다 이름이 실려 오는 키가 다르다:
--   카카오  nickname / preferred_username
--   구글    full_name / name
--   애플    full_name (첫 인증에서만 오고, 그마저 비어 있을 수 있다)
-- 그래서 순서대로 훑고, 아무것도 없으면 종전처럼 자동 생성한다.
-- ------------------------------------------------------------------

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_base   text;
  v_handle text;
  v_try    int := 0;
begin
  v_base := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'handle'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'nickname'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    ''
  );

  -- 줄바꿈·연속 공백을 하나로 접고, 화면에서 쓰는 길이(12자)로 자른다.
  -- 제공자가 주는 이름은 길이 제한이 없어서 그대로 넣으면 랭킹 줄이 깨진다.
  v_base := left(regexp_replace(v_base, '\s+', ' ', 'g'), 12);

  if v_base = '' then
    v_base := '축잘알' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;

  -- 닉네임은 unique 다. 같은 이름이 이미 있으면 뒤에 숫자를 붙이되,
  -- 붙일 자리만큼 앞을 잘라 12자를 넘기지 않는다.
  v_handle := v_base;
  while exists (select 1 from public.profiles where handle = v_handle) loop
    v_try := v_try + 1;
    if v_try > 99 then
      -- 흔한 이름이 몰린 경우. 충돌할 일이 없는 값으로 빠진다.
      v_handle := '축잘알' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      exit;
    end if;
    v_handle := left(v_base, greatest(1, 12 - length(v_try::text))) || v_try::text;
  end loop;

  insert into public.profiles (id, handle) values (new.id, v_handle);
  return new;
end $$;
