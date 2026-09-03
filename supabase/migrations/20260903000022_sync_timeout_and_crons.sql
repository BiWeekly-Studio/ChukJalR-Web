-- 수집 호출의 타임아웃과, 새 모드들의 스케줄
--
-- pg_net 의 기본 타임아웃은 5초다. 경기별로 한 번씩 부르는 모드(배당·상대전적)는
-- 그보다 오래 걸려서 응답을 못 받고 끊긴다 — 함수는 끝까지 돌아 데이터는 들어오지만
-- 성공했는지 알 수가 없다. 30초로 늘린다.
create or replace function invoke_sync(p_mode text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_url   text;
  v_token text;
begin
  select value into v_url   from app_secrets where name = 'project_url';
  select value into v_token from app_secrets where name = 'sync_token';

  if v_url is null then
    raise warning 'invoke_sync: project_url 이 없어 건너뜀';
    return null;
  end if;

  return net.http_post(
    url     := v_url || '/functions/v1/sync-fixtures?mode=' || p_mode,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-sync-token', coalesce(v_token, '')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;

-- 라이브: 1분마다. 진행 중인 경기가 없으면 API 를 아예 부르지 않는다.
select cron.schedule('sync-live', '* * * * *', $$ select invoke_sync('live'); $$);

-- 선발 명단: 5분마다. 킥오프 75분 전부터 열리고, 한 경기당 한 번만 받는다.
select cron.schedule('sync-lineups', '*/5 * * * *', $$ select invoke_sync('lineups'); $$);

-- 배당: 하루 두 번. 킥오프가 가까울수록 배당이 정확해지므로 마감 전에 한 번 더 본다.
-- (KST 09:00 / 21:00)
select cron.schedule('sync-odds', '0 0,12 * * *', $$ select invoke_sync('odds'); $$);

-- 상대 전적: 하루 1회. 새로 들어온 경기만 받으므로 평소에는 0회다. (KST 10:00)
select cron.schedule('sync-h2h', '0 1 * * *', $$ select invoke_sync('h2h'); $$);

-- 경기 통계: 하루 1회, 유럽 경기가 다 끝난 뒤. (KST 11:00)
select cron.schedule('sync-stats', '0 2 * * *', $$ select invoke_sync('stats'); $$);
