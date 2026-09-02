-- 브로드캐스트 페이로드에 발화자 정보를 싣는다.
-- 채팅에서 "누구 말을 믿을지" 판단하는 근거가 티어와 상위 % 이므로,
-- 메시지를 받자마자 그릴 수 있어야 한다. 매 메시지 조회를 시키면 안 된다. (명세 10장)

create or replace function broadcast_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_handle text;
  v_top numeric;
  v_settled int;
begin
  select p.handle into v_handle from profiles p where p.id = new.user_id;

  select l.top_percent into v_top from leaderboard l where l.user_id = new.user_id;
  select r.settled_matches into v_settled
    from ratings r where r.user_id = new.user_id
   order by r.season desc limit 1;

  perform realtime.send(
    jsonb_build_object(
      'id',      new.id,
      'userId',  new.user_id,
      'handle',  coalesce(v_handle, '익명'),
      'topPercent', v_top,                                  -- 배치 중이면 null
      'tier',    tier_of(coalesce(v_top, 100), coalesce(v_settled, 0)),
      'body',    new.body,
      'at',      new.created_at
    ),
    'chat.message',
    new.channel,
    false
  );
  return new;
end $$;
