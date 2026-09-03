#!/usr/bin/env bash
# IBM Plex Sans KR 을 iOS 번들용으로 서브셋한다.
#
# 원본 4벌은 11MB 다. 한자·가나를 빼면 8.8MB 로 줄고, 한글 음절은 전부(11172자)
# 남는다 — 닉네임에 어떤 글자가 와도 시스템 폰트로 튀지 않게 하려면 여기서 더
# 줄이면 안 된다.
set -euo pipefail
BASE=https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsanskr
OUT="$(cd "$(dirname "$0")/.." && pwd)/ios/Resources/Fonts"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

python3 -m venv "$TMP/venv" && "$TMP/venv/bin/pip" -q install "fonttools[woff]" brotli

# 한글 음절 전체 + 호환 자모(초성 검색 UI 가 ㄱㄴㄷ 을 그린다) + 라틴 + 문장부호
RANGES="U+0020-007E,U+00A0-00FF,U+2000-206F,U+20A9,U+20AC,U+2122,U+3000-303F,U+3131-318E,U+AC00-D7A3,U+FF01-FF5E"

mkdir -p "$OUT"
for f in Regular Medium SemiBold Bold; do
  curl -sL "$BASE/IBMPlexSansKR-$f.ttf" -o "$TMP/$f.ttf"
  "$TMP/venv/bin/pyftsubset" "$TMP/$f.ttf" \
    --unicodes="$RANGES" --layout-features='*' --no-hinting --desubroutinize \
    --output-file="$OUT/IBMPlexSansKR-$f.ttf"
  printf "%-9s %s\n" "$f" "$(du -h "$OUT/IBMPlexSansKR-$f.ttf" | cut -f1)"
done
curl -sL "$BASE/OFL.txt" -o "$OUT/OFL.txt"
