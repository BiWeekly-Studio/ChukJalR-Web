#!/usr/bin/env bash
# App Store 스크린샷을 6.9인치(1320x2868)로 찍는다.
#
# 애플이 요구하는 크기는 6.9인치 하나뿐이고, iPhone 17 Pro Max 시뮬레이터가
# 정확히 그 해상도다. 나머지 크기는 App Store Connect 가 알아서 줄여 쓴다.
#
#   ./screenshots.sh
#
# 앱은 로그인된 상태여야 한다. 이 시뮬레이터가 처음이면 먼저 한 번 로그인해 둘 것
# (로그인 화면이 찍히면 그대로 나온다).
set -euo pipefail
cd "$(dirname "$0")"

export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
DEVICE=${DEVICE:-"iPhone 17 Pro Max"}
OUT="../design/appstore"
BUNDLE=com.jalr.chukjalal
# 6.9인치의 논리 해상도. 아래 좌표는 전부 이 기준이다.
DEVICE_W=440
DEVICE_H=956

mkdir -p "$OUT"

# 시뮬레이터 창 안의 화면 좌표를 눌러 준다.
# simctl 에는 탭 명령이 없어서 macOS 이벤트를 직접 쏜다. 의존성을 늘리지 않으려고
# JXA 의 ObjC 브리지를 쓴다 (python·cliclick 설치 불필요).
TAPPER=$(mktemp /tmp/chukjalal-tap.XXXXXX.js)
trap 'rm -f "$TAPPER"' EXIT
cat > "$TAPPER" <<'JS'
ObjC.import('CoreGraphics');
function run(argv) {
  const app = Application('System Events').processes['Simulator'];
  const win = app.windows[0];
  const [wx, wy] = win.position();
  const [ww, wh] = win.size();
  // 창은 화면 둘레에 테두리를 두르고 위에는 타이틀바가 더 붙는다.
  // 좌우 여백은 같고, 아래 여백도 그와 같다고 보면 위 여백이 나온다.
  const side = (ww - parseFloat(argv[2])) / 2;
  const top = wh - parseFloat(argv[3]) - side;
  const pt = $.CGPointMake(wx + side + parseFloat(argv[0]), wy + top + parseFloat(argv[1]));
  [$.kCGEventLeftMouseDown, $.kCGEventLeftMouseUp].forEach(k => {
    $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateMouseEvent($(), k, pt, $.kCGMouseButtonLeft));
    delay(0.05);
  });
  return 'ok';
}
JS
tap() {
  osascript -e 'tell application "Simulator" to activate' >/dev/null
  sleep 0.4
  osascript -l JavaScript "$TAPPER" "$1" "$2" "$DEVICE_W" "$DEVICE_H" >/dev/null
  sleep "${3:-2}"
}
shot() { xcrun simctl io "$DEVICE" screenshot --type=png "$OUT/$1.png" >/dev/null; echo "  $1.png"; }

xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl bootstatus "$DEVICE" -b >/dev/null

DEVICE="$DEVICE" ./build.sh >/dev/null
APP=$(find build/dd/Build/Products -name 'Chukjalal.app' -maxdepth 3 | head -1)
xcrun simctl install "$DEVICE" "$APP"

# 상태바를 고정한다 — 시간·배터리가 제각각인 스크린샷은 심사에서 지적받는다
xcrun simctl status_bar "$DEVICE" override \
  --time "9:41" --batteryState charged --batteryLevel 100 \
  --wifiBars 3 --cellularBars 4 --dataNetwork wifi --cellularMode active

xcrun simctl terminate "$DEVICE" "$BUNDLE" 2>/dev/null || true
xcrun simctl launch "$DEVICE" "$BUNDLE" >/dev/null
sleep 9

# 탭바는 화면 맨 아래. 세 칸을 3등분한 가운데를 누른다.
NAV_Y=896
echo "찍는 중…"
shot "1-예측"
tap $((DEVICE_W / 2)) $NAV_Y 2.5;           shot "2-랭킹"
tap $((DEVICE_W * 5 / 6)) $NAV_Y 2.5;       shot "3-내기록"
tap $((DEVICE_W / 6)) $NAV_Y 2.5            # 예측으로 복귀
tap 190 460 4;                              shot "4-경기상세"

xcrun simctl status_bar "$DEVICE" clear
echo
echo "저장 위치: design/appstore/"
