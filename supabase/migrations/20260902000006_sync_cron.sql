-- 수집 스케줄 (명세 12.1, 14.3)
--
-- DB 안에서 도는 작업은 이미 1분마다 돌고 있다. 여기서는 외부 API 를 쓰는 수집만
-- 주기를 크게 벌려서 등록한다. 호출 예산은 주당 약 225회다.

create extension if not exists pg_net;

-- 프로젝트 URL 과 sync 토큰 보관용.
-- RLS 를 켜고 정책을 만들지 않으므로 service_role 과 security definer 함수만 읽는다.
-- 값은 마이그레이션이 아니라 배포 시 API 로 넣는다 — 저장소에 비밀이 남지 않게.
create table if not exists app_secrets (
  name  text primary key,
  value text not null
);
alter table app_secrets enable row level security;

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
    body    := '{}'::jsonb
  );
end $$;

-- 일정: 주 1회, 월요일 04:00 KST (= 일요일 19:00 UTC). 향후 1개월치, 4회 호출.
select cron.schedule('sync-schedule', '0 19 * * 0', $$ select invoke_sync('schedule'); $$);

-- 팀: 월 1회. 시즌 중 거의 변하지 않는다. 4회 호출.
select cron.schedule('sync-teams', '0 18 1 * *', $$ select invoke_sync('teams'); $$);

-- 결과: 10분마다. 열려 있고 안 끝난 경기가 없으면 함수가 API 를 부르지 않는다.
select cron.schedule('sync-results', '*/10 * * * *', $$ select invoke_sync('results'); $$);
