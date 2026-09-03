#!/bin/bash
# 캡처한 전체 스크린샷에서 아이프레임 영역만 잘라 앱인토스 규격(636x1048)으로 맞춘다.
# 아이프레임은 화면 가운데 있고 CSS 392x646, 캡처 배율은 이미지 폭 / 뷰포트 폭 이다.
set -e
SRC="$1"; OUT="$2"
VW=400            # CSS 뷰포트 폭
IW=392; IH=646    # CSS 아이프레임 크기
W=$(sips -g pixelWidth "$SRC" | awk '/pixelWidth/{print $2}')
SCALE=$(echo "scale=6; $W / $VW" | bc)
CW=$(echo "($IW * $SCALE + 0.5)/1" | bc)
CH=$(echo "($IH * $SCALE + 0.5)/1" | bc)
cp "$SRC" "$OUT"
sips -c "$CH" "$CW" "$OUT" >/dev/null      # 중앙 크롭 (높이 폭 순서)
sips -z 1048 636 "$OUT" >/dev/null          # 규격에 맞춰 축소
sips -s format png "$OUT" --out "$OUT" >/dev/null
sips -g pixelWidth -g pixelHeight "$OUT" | tail -2
