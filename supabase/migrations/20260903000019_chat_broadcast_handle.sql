-- 브로드캐스트에 보낸 사람의 닉네임을 함께 싣는다.
--
-- 지금은 id·userId·body·at 만 나간다. 받는 쪽은 닉네임을 그릴 방법이 없어
-- undefined 를 만지다 터지고, 그 자리에서 구독 콜백이 죽는다 —
-- 즉 실시간 메시지가 한 건도 화면에 붙지 않는다.
--
-- 등급(상위 N%)은 싣지 않는다. 과거 메시지를 불러오는 경로도 등급을 채우지 않으므로,
-- 실시간에만 뱃지가 붙으면 같은 사람의 말이 경로에 따라 다르게 보인다.
create or replace function broadcast_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_handle text;
begin
  select handle into v_handle from profiles where id = new.user_id;

  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'userId', new.user_id,
      'handle', coalesce(v_handle, '알 수 없음'),
      'body', new.body,
      'at', new.created_at
    ),
    'chat.message',
    new.channel,
    false
  );
  return new;
end $$;
