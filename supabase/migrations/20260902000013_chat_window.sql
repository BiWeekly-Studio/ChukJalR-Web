-- 채팅 창: 킥오프 1시간 전 ~ 종료 후 여유 (명세 10장 수정)
--
-- 상시 열어두면 아무도 없는 방이 대부분이라 "지금 누가 보고 있다"는 느낌이 안 산다.
-- 경기 직전으로 좁히면 같은 시간에 사람이 모인다.
-- 클라이언트에서도 막지만, 그것만으로는 강제가 되지 않으므로 정책으로 못 박는다.

drop policy if exists write_chat on chat_messages;

create policy write_chat on chat_messages for insert
  with check (
    auth.uid() = user_id
    and (
      fixture_id is null                       -- 리그 채널은 상시
      or exists (
        select 1 from fixtures f
         where f.id = fixture_id
           and now() >= f.kickoff_at - interval '1 hour'
           and now() <= f.kickoff_at + interval '4 hours'
      )
    )
  );
