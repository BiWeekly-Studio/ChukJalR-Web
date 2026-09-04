#!/usr/bin/env bash
# App Store 스크린샷을 6.9인치(1320x2868)로 찍는다.
#
# 애플이 요구하는 크기는 6.9인치 하나뿐이고, iPhone 17 Pro Max 시뮬레이터가
# 정확히 그 해상도다. 나머지 크기는 App Store Connect 가 알아서 줄여 쓴다.
#
#   ./screenshots.sh              전부 자동으로
#   ./screenshots.sh shot 이름     지금 보이는 화면만 저장
#   ./screenshots.sh done         상태바 원래대로
#
# 화면 전환은 합성 클릭으로 한다. 클릭이 먹었는지는 추측하지 않고 화면이 실제로
# 바뀌었는지 해시로 확인한다 — 안 바뀌면 다시 누르고, 그래도 안 되면 멈춘다.
# 조용히 같은 화면을 여러 장 찍어놓고 다 된 것처럼 끝나는 게 제일 나쁘다.
set -euo pipefail
cd "$(dirname "$0")"

export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
DEVICE=${DEVICE:-"iPhone 17 Pro Max"}
OUT="../design/appstore"
BUNDLE=com.jalr.chukjalal
DEVICE_W=440    # 6.9인치의 논리 해상도
DEVICE_H=956

TAPPER=$(mktemp /tmp/chukjalal-tap.XXXXXX.js)
trap 'rm -f "$TAPPER"' EXIT
cat > "$TAPPER" <<'JS'
ObjC.import('CoreGraphics');
function run(argv) {
  const wins = Application('System Events').processes['Simulator'].windows();
  // 시뮬레이터가 여럿 떠 있으면 창도 여럿이다. 제목으로 찾지 않으면 엉뚱한 기기를 누른다.
  const win = wins.find(w => w.name().indexOf(argv[4]) === 0) || wins[0];
  const [wx, wy] = win.position(), [ww, wh] = win.size();
  const side = (ww - parseFloat(argv[2])) / 2;
  const top = wh - parseFloat(argv[3]) - side;
  const pt = $.CGPointMake(wx + side + parseFloat(argv[0]), wy + top + parseFloat(argv[1]));
  // 커서를 먼저 옮긴다. 이동 없이 다운/업만 보내면 눌린 자리를 갱신하지 않아
  // 클릭이 통째로 무시되는 일이 있다.
  $.CGEventPost($.kCGHIDEventTap,
    $.CGEventCreateMouseEvent($(), $.kCGEventMouseMoved, pt, $.kCGMouseButtonLeft));
  delay(0.12);
  [$.kCGEventLeftMouseDown, $.kCGEventLeftMouseUp].forEach(k => {
    $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateMouseEvent($(), k, pt, $.kCGMouseButtonLeft));
    delay(0.09);
  });
  return 'ok';
}
JS

frame() { xcrun simctl io "$DEVICE" screenshot --type=png /tmp/chukjalal-frame.png >/dev/null 2>&1; md5 -q /tmp/chukjalal-frame.png; }
click() { osascript -l JavaScript "$TAPPER" "$1" "$2" "$DEVICE_W" "$DEVICE_H" "$DEVICE" >/dev/null; }

# 눌렀는데 화면이 그대로면 안 먹은 것이다. 한 번 더 누르고, 그래도 안 되면 멈춘다.
tap() {
  local before after
  before=$(frame)
  click "$1" "$2"; sleep "${3:-2}"
  after=$(frame)
  if [ "$before" = "$after" ]; then
    click "$1" "$2"; sleep "${3:-2}"
    after=$(frame)
  fi
  [ "$before" != "$after" ] || { echo "  ✖ ($1, $2) 클릭이 먹지 않았습니다"; return 1; }
}

shot() {
  mkdir -p "$OUT"
  xcrun simctl io "$DEVICE" screenshot --type=png "$OUT/$1.png" >/dev/null 2>&1
  echo "  $1.png  ($(sips -g pixelWidth -g pixelHeight "$OUT/$1.png" | awk '/pixel/{printf "%s ", $2}'))"
}

case "${1:-all}" in
shot) shift; shot "${1:?이름이 필요합니다}" ;;
done) xcrun simctl status_bar "$DEVICE" clear; echo "상태바 원래대로" ;;
all)
  mkdir -p "$OUT"
  xcrun simctl boot "$DEVICE" 2>/dev/null || true
  xcrun simctl bootstatus "$DEVICE" -b >/dev/null

  DEVICE="$DEVICE" ./build.sh >/dev/null
  APP=$(find build/dd/Build/Products -name 'Chukjalal.app' -maxdepth 3 | head -1)
  xcrun simctl install "$DEVICE" "$APP"

  # 시간·배터리가 제각각인 스크린샷은 심사에서 지적받는다. 9:41 은 애플의 관례다.
  xcrun simctl status_bar "$DEVICE" override \
    --time "9:41" --batteryState charged --batteryLevel 100 \
    --wifiBars 3 --cellularBars 4 --dataNetwork wifi --cellularMode active

  xcrun simctl terminate "$DEVICE" "$BUNDLE" 2>/dev/null || true
  xcrun simctl launch "$DEVICE" "$BUNDLE" >/dev/null
  open -a Simulator
  sleep 10

  # 탭바는 화면 맨 아래. 세 칸을 3등분한 가운데다.
  NAV_Y=896
  PREDICT_X=73; RANK_X=220; ME_X=359

  echo "찍는 중…"
  shot "1-예측"
  tap 190 414 3.5 && shot "2-경기상세"      # 경기 카드 머리 → 상세
  tap 355 130 2.5 && shot "3-경기정보"      # 상세 안의 '정보' 탭
  tap 45 130 2.5                            # 뒤로
  tap $RANK_X $NAV_Y 2.5 && shot "4-랭킹"
  tap $ME_X $NAV_Y 2.5   && shot "5-내기록"
  tap $PREDICT_X $NAV_Y 2

  echo
  echo "저장 위치: design/appstore/"
  echo "상태바를 되돌리려면: ./screenshots.sh done"
  ;;
*) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
