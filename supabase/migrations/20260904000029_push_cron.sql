-- 정산 결과 푸시 스케줄
--
-- invoke_sync 는 함수 이름이 sync-fixtures 로 박혀 있다. 부를 함수가 늘었으니
-- 이름을 받는 쪽으로 일반화한다. 인증(x-sync-token)과 타임아웃은 그대로다.
create or replace function invoke_function(p_name text, p_query text default '')
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_url   text;
  v_token text;
begin
  select value into v_url   from app_secrets where name = 'project_url';
  select value into v_token from app_secrets where name = 'sync_token';

  if v_url is null then
    raise warning 'invoke_function: project_url 이 없어 건너뜀';
    return null;
  end if;

  return net.http_post(
    url     := v_url || '/functions/v1/' || p_name
               || case when p_query = '' then '' else '?' || p_query end,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-sync-token', coalesce(v_token, '')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;

-- 기존 invoke_sync 는 그대로 두되 새 함수를 쓰게 한다. 크론 정의를 다 고치지 않아도 된다.
create or replace function invoke_sync(p_mode text)
returns bigint language sql security definer set search_path = public as $$
  select invoke_function('sync-fixtures', 'mode=' || p_mode);
$$;

-- 정산은 1분마다 돈다. 푸시를 같은 주기로 보내면 APNs 인증 토큰을 계속 새로 만들게
-- 되고(20분 안에 다시 만들면 거절당한다) 호출도 낭비다. 5분마다 모아서 보낸다.
-- 보낼 게 없으면 함수가 바로 돌아온다.
select cron.schedule('push-settlements', '*/5 * * * *',
  $$ select invoke_function('push-settlements', 'minutes=60'); $$);
