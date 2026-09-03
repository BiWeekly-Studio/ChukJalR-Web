#!/usr/bin/env bash
# App Store 스크린샷을 6.9인치(1320x2868)로 찍는다.
#
# 애플이 요구하는 크기는 6.9인치 하나뿐이고, iPhone 17 Pro Max 시뮬레이터가
# 정확히 그 해상도다. 나머지 크기는 App Store Connect 가 알아서 줄여 쓴다.
#
#   ./screenshots.sh setup        빌드·설치·상태바 고정·실행
#   ./screenshots.sh shot 1-예측   지금 시뮬레이터에 보이는 화면을 저장
#   ./screenshots.sh done         상태바 원래대로
#
# 화면 전환은 시뮬레이터에서 직접 누른다. 합성 클릭으로 자동화해 봤지만 창이
# 활성 상태냐에 따라 먹기도 하고 안 먹기도 해서, 조용히 같은 화면을 네 장 찍는
# 일이 생긴다. 잘못된 스크린샷을 올리는 것보다 세 번 더 누르는 편이 낫다.
set -euo pipefail
cd "$(dirname "$0")"

export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
DEVICE=${DEVICE:-"iPhone 17 Pro Max"}
OUT="../design/appstore"
BUNDLE=com.jalr.chukjalal

case "${1:-setup}" in
setup)
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

  cat <<'GUIDE'

준비됐습니다. 시뮬레이터에서 화면을 옮겨가며 아래를 실행하세요.

  예측 탭        ./screenshots.sh shot 1-예측
  경기 상세      ./screenshots.sh shot 2-경기상세
  경기 채팅      ./screenshots.sh shot 3-채팅
  랭킹 탭        ./screenshots.sh shot 4-랭킹
  나 탭          ./screenshots.sh shot 5-내기록

다 찍었으면  ./screenshots.sh done

GUIDE
  ;;

shot)
  NAME="${2:?이름이 필요합니다: ./screenshots.sh shot 1-예측}"
  mkdir -p "$OUT"
  xcrun simctl io "$DEVICE" screenshot --type=png "$OUT/$NAME.png" >/dev/null 2>&1
  SIZE=$(sips -g pixelWidth -g pixelHeight "$OUT/$NAME.png" | awk '/pixel/{printf "%s ", $2}')
  echo "저장: design/appstore/$NAME.png  (${SIZE% })"
  ;;

done)
  xcrun simctl status_bar "$DEVICE" clear
  echo "상태바 원래대로. 스크린샷은 design/appstore/ 에 있습니다."
  ;;

*)
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
  ;;
esac
