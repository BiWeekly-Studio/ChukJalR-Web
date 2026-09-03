-- 계정 삭제 (App Store 심사 지침 5.1.1(v))
--
-- 계정을 만들 수 있는 앱은 앱 안에서 삭제도 할 수 있어야 한다. 고객센터로 보내면
-- 리젝 사유가 된다.
--
-- auth.users 를 지우면 profiles 로 캐스케이드되고, 거기서 예측·정산·원장·채팅까지
-- 전부 따라 지워진다. 지운 사람의 순위·기준선은 남지 않는다.
--
-- 남는 것이 하나 있다: 이미 정산에 반영된 남의 점수다. 기준선(fixture_baselines)은
-- 마감 시점에 동결된 값이라 누가 나가도 다시 계산하지 않는다 — 그게 정산을
-- 재현 가능하게 만드는 조건이다 (명세 7장).
create or replace function delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- 내가 남긴 채팅은 지우는 대신 가린다. 대화 맥락은 남기고 사람만 지운다 —
  -- 통째로 없애면 남의 대화가 앞뒤 없이 끊긴다.
  update chat_messages set deleted_at = now() where user_id = v_uid and deleted_at is null;

  delete from auth.users where id = v_uid;
end $$;

revoke all on function delete_my_account() from public;
grant execute on function delete_my_account() to authenticated;
