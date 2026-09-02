-- 운영 점검용. cron 등록 상태와 최근 수집 호출 결과를 한눈에 본다.
-- cron 과 net 스키마는 PostgREST 에 노출되지 않으므로 public 함수로 감싼다.
-- service_role 만 호출할 수 있게 실행 권한을 좁힌다.

create or replace function sync_status()
returns jsonb language sql security definer set search_path = public, cron, net stable as $$
  select jsonb_build_object(
    'jobs', (
      select coalesce(jsonb_agg(jsonb_build_object(
                'name', jobname, 'schedule', schedule, 'active', active
              ) order by jobname), '[]'::jsonb)
        from cron.job
    ),
    'recent_runs', (
      select coalesce(jsonb_agg(jsonb_build_object(
                'job', j.jobname, 'started', r.start_time,
                'status', r.status, 'message', left(coalesce(r.return_message, ''), 120)
              ) order by r.start_time desc), '[]'::jsonb)
        from (select * from cron.job_run_details order by start_time desc limit 10) r
        join cron.job j on j.jobid = r.jobid
    ),
    'recent_http', (
      select coalesce(jsonb_agg(jsonb_build_object(
                'id', id, 'status', status_code, 'body', left(coalesce(content, ''), 160)
              ) order by id desc), '[]'::jsonb)
        from (select * from net._http_response order by id desc limit 5) h
    )
  );
$$;

revoke execute on function sync_status() from public, anon, authenticated;
