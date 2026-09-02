-- 마감 전 기준선 공개 (명세 2.2, 8장 /fixtures/{id}/distribution)
--
-- 동결된 기준선(fixture_baselines)은 마감 후에만 읽을 수 있다. 하지만 예측 화면은
-- "맞히면 +79" 같은 잠재 점수를 보여줘야 하고, 그러려면 지금 시점의 기준선이 필요하다.
--
-- 해결: 계산식을 함수 하나로 빼서 동결과 조회가 같은 코드를 쓰게 한다.
-- 집계값만 나가므로 누가 무엇을 골랐는지는 새지 않는다.

create or replace function compute_baseline(p_fixture_id bigint)
returns table (q numeric[], n int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_n int;
  v_crowd numeric[];
  v_prior numeric[];
  v_w numeric;
  v_q numeric[];
  v_sum numeric;
begin
  select count(*),
         array[
           (count(*) filter (where pick = 'HOME') + 1)::numeric / (count(*) + 3),
           (count(*) filter (where pick = 'DRAW') + 1)::numeric / (count(*) + 3),
           (count(*) filter (where pick = 'AWAY') + 1)::numeric / (count(*) + 3)
         ]
    into v_n, v_crowd
    from predictions where fixture_id = p_fixture_id;

  select p.q into v_prior from fixture_priors p where p.fixture_id = p_fixture_id;
  if v_prior is null then
    v_prior := array[0.45, 0.26, 0.29]::numeric[];
  end if;

  v_w := 30::numeric / (30 + v_n);
  v_q := array[
    v_w * v_prior[1] + (1 - v_w) * v_crowd[1],
    v_w * v_prior[2] + (1 - v_w) * v_crowd[2],
    v_w * v_prior[3] + (1 - v_w) * v_crowd[3]
  ];

  for j in 1..3 loop
    v_q[j] := greatest(0.03, least(0.94, v_q[j]));
  end loop;
  v_sum := v_q[1] + v_q[2] + v_q[3];
  for j in 1..3 loop
    v_q[j] := round(v_q[j] / v_sum, 6);
  end loop;
  v_q[3] := 1 - v_q[1] - v_q[2];

  return query select v_q, v_n;
end $$;

-- 동결은 이제 같은 계산을 쓴다. 클라이언트 미리보기와 서버 정산이 절대 어긋나지 않는다.
create or replace function freeze_baseline(p_fixture_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_q numeric[]; v_n int;
begin
  if exists (select 1 from fixture_baselines where fixture_id = p_fixture_id) then
    return;
  end if;

  select c.q, c.n into v_q, v_n from compute_baseline(p_fixture_id) c;

  insert into fixture_baselines (fixture_id, q, n_participants, source)
  values (p_fixture_id, v_q, v_n, case when v_n >= 30 then 'blend' else 'prior-heavy' end)
  on conflict (fixture_id) do nothing;
end $$;

-- 피드 한 번에 여러 경기의 기준선을 받는다. N+1 호출을 막기 위한 것으로,
-- 앱인토스의 요청 한도(명세 13.1)를 아끼는 데도 필요하다.
create or replace function live_baselines(p_fixture_ids bigint[])
returns table (fixture_id bigint, q numeric[], n int)
language sql stable security definer set search_path = public as $$
  select f.id, c.q, c.n
    from unnest(p_fixture_ids) as f(id)
    cross join lateral compute_baseline(f.id) c;
$$;

grant execute on function live_baselines(bigint[]) to anon, authenticated;
