#!/usr/bin/env bash
# 진행 중인 경기를 하나 만들어 라이브 화면을 확인한다.
#
# 실제 경기가 도는 시간이 유럽 새벽뿐이라, 라이브 스코어·이벤트·Live Activity 를
# 눈으로 보려면 이 방법밖에 없다. id 는 9,900,001 로 API-Football 대역(150만대)
# 바깥이고, 수집기는 9,000,000 이상을 아예 건드리지 않는다.
#
#   ./scripts/test-match.sh start        진행 중 경기 생성 (킥오프 30분 전, 0:0)
#   ./scripts/test-match.sh goal home    득점 (+이벤트)
#   ./scripts/test-match.sh goal away
#   ./scripts/test-match.sh card away    경고
#   ./scripts/test-match.sh minute 63    경과 분만 바꾸기
#   ./scripts/test-match.sh finish       종료 (정규 결과까지 채운다)
#   ./scripts/test-match.sh stop         지우기
#
# ⚠ finish 는 정규 결과를 채우므로, 이 경기에 예측을 걸어뒀다면 정산이 돈다.
#   지수와 포인트가 실제로 움직인다. 확인만 할 거면 finish 대신 stop 을 쓴다.
set -euo pipefail
cd "$(dirname "$0")/.."

ID=9900001
HOME_TEAM=33   # Manchester United
AWAY_TEAM=34   # Newcastle
LEAGUE=39

q() { supabase db query --linked "$1" -o json >/dev/null; }

case "${1:-}" in
start)
  # 킥오프 30분 전으로 둔다 — 채팅 창(킥오프 1시간 전 ~ 종료 4시간 후)이 열려 있고
  # 예측은 이미 마감된 상태다. 라이브 화면을 보는 게 목적이니 그게 맞다.
  q "
    insert into fixtures (id, league_id, season, round, home_team_id, away_team_id, venue,
                          kickoff_at, opens_at, lock_at, state, status_short,
                          home_goals_live, away_goals_live, elapsed)
    values ($ID, $LEAGUE, 2026, 'Regular Season - 99', $HOME_TEAM, $AWAY_TEAM, '테스트 경기장',
            now() - interval '30 minutes', now(), now(), 'LIVE', '2H', 0, 0, 30)
    on conflict (id) do update set
      kickoff_at = now() - interval '30 minutes',
      state = 'LIVE', status_short = '2H',
      home_goals_live = 0, away_goals_live = 0, elapsed = 30,
      home_goals_ft = null, away_goals_ft = null;
    delete from fixture_events where fixture_id = $ID;"
  echo "진행 중 경기 생성됨 (id $ID). 앱을 새로 고치면 '오늘의 경기'에 보인다."
  ;;

goal)
  side="${2:-home}"
  team=$([ "$side" = home ] && echo $HOME_TEAM || echo $AWAY_TEAM)
  col=$([ "$side" = home ] && echo home_goals_live || echo away_goals_live)
  q "
    with e as (
      insert into fixture_events (fixture_id, seq, minute, team_id, type, detail, player, assist)
      select $ID, coalesce(max(seq) + 1, 0), coalesce((select elapsed from fixtures where id = $ID), 0),
             $team, 'Goal', 'Normal Goal', '테스트 선수', '테스트 도움'
        from fixture_events where fixture_id = $ID
      returning 1
    )
    update fixtures set $col = coalesce($col, 0) + 1 where id = $ID;"
  echo "$side 득점"
  ;;

card)
  side="${2:-home}"
  team=$([ "$side" = home ] && echo $HOME_TEAM || echo $AWAY_TEAM)
  q "
    insert into fixture_events (fixture_id, seq, minute, team_id, type, detail, player)
    select $ID, coalesce(max(seq) + 1, 0), coalesce((select elapsed from fixtures where id = $ID), 0),
           $team, 'Card', 'Yellow Card', '테스트 선수'
      from fixture_events where fixture_id = $ID;"
  echo "$side 경고"
  ;;

minute)
  q "update fixtures set elapsed = ${2:-45} where id = $ID;"
  echo "경과 ${2:-45}분"
  ;;

finish)
  q "
    update fixtures set
      state = 'FINISHED', status_short = 'FT', elapsed = 90,
      home_goals_ft = coalesce(home_goals_live, 0),
      away_goals_ft = coalesce(away_goals_live, 0)
    where id = $ID;"
  echo "종료. 예측을 걸어뒀다면 다음 정산 주기(1분)에 지수가 움직인다."
  ;;

stop)
  q "delete from fixtures where id = $ID;"
  echo "테스트 경기 삭제됨 (예측·채팅·이벤트도 함께 사라진다)"
  ;;

*)
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
  ;;
esac
