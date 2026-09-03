-- 라이브 스코어와 이벤트를 경기 채널로 내보낸다 (명세 14.4)
--
-- 클라이언트가 따로 폴링하지 않는다. 채팅이 이미 'match:<id>' 채널을 구독하고 있으므로
-- 같은 채널에 얹으면 웹과 iOS 양쪽이 추가 작업 없이 받는다.

create or replace function broadcast_live_score() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'home', new.home_goals_live,
      'away', new.away_goals_live,
      'elapsed', new.elapsed,
      'state', new.state,
      'status', new.status_short
    ),
    'match.live',
    'match:' || new.id,
    false
  );
  return new;
end $$;

-- 값이 실제로 바뀐 경우에만 내보낸다. 수집기는 1분마다 같은 값을 다시 쓰기 때문에,
-- 조건이 없으면 조용한 경기에서도 매분 브로드캐스트가 나간다.
create trigger fixtures_live_broadcast
  after update on fixtures
  for each row
  when (
    old.home_goals_live is distinct from new.home_goals_live
    or old.away_goals_live is distinct from new.away_goals_live
    or old.elapsed        is distinct from new.elapsed
    or old.state          is distinct from new.state
  )
  execute function broadcast_live_score();

create or replace function broadcast_match_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'seq', new.seq, 'minute', new.minute, 'extra', new.extra,
      'teamId', new.team_id, 'type', new.type, 'detail', new.detail,
      'player', new.player, 'assist', new.assist
    ),
    'match.event',
    'match:' || new.fixture_id,
    false
  );
  return new;
end $$;

-- insert 에만 건다. 수집기는 매번 전체 이벤트를 upsert 하므로, update 까지 잡으면
-- 이미 본 이벤트가 계속 다시 날아온다.
create trigger fixture_events_broadcast
  after insert on fixture_events
  for each row execute function broadcast_match_event();
