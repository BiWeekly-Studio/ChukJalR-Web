#!/usr/bin/env bash
# App Store 제출용 아카이브를 만들고 .ipa 로 내보낸다.
#
#   ./release.sh            아카이브 + 내보내기
#   ./release.sh upload     위 과정 + App Store Connect 업로드
#
# 필요한 것 (전부 이 기계의 Xcode/키체인에 있어야 한다):
#   - ios/.env.local 의 DEVELOPMENT_TEAM
#   - 배포 인증서와 프로비저닝 프로파일 (Xcode 가 자동으로 받아온다)
#   - upload 를 쓰려면 App Store Connect API 키 또는 Xcode 로그인
#
# 빌드 번호는 자동으로 올린다. 같은 번호로 두 번 올리면 App Store Connect 가 거절한다.
set -euo pipefail
cd "$(dirname "$0")"

export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}

[ -f .env.local ] || { echo "ios/.env.local 이 없습니다 (DEVELOPMENT_TEAM=...)"; exit 1; }
set -a; . ./.env.local; set +a
[ -n "${DEVELOPMENT_TEAM:-}" ] || { echo ".env.local 에 DEVELOPMENT_TEAM 이 없습니다"; exit 1; }

# 설정 파일과 프로젝트는 build.sh 와 같은 방식으로 만든다
ENV_FILE=${ENV_FILE:-../.env}
SUPA_URL=$(grep -E '^VITE_SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
SUPA_KEY=$(grep -E '^VITE_SUPABASE_ANON_KEY=' "$ENV_FILE" | cut -d= -f2-)
cat > Sources/Config.swift <<EOF
// build.sh / release.sh 가 .env 에서 생성한다. 직접 고치지 말 것.
enum Config {
    static let supabaseURL = "$SUPA_URL"
    static let supabaseAnonKey = "$SUPA_KEY"
    static let urlScheme = "chukjalal"
    static let redirectURI = "chukjalal://auth"
}
EOF

# 빌드 번호를 하나 올린다. project.yml 이 진실의 원천이므로 거기를 고친다.
CURRENT=$(grep -E '^\s+CURRENT_PROJECT_VERSION:' project.yml | sed 's/[^0-9]//g')
NEXT=$((CURRENT + 1))
sed -i '' "s/CURRENT_PROJECT_VERSION: \"$CURRENT\"/CURRENT_PROJECT_VERSION: \"$NEXT\"/" project.yml
echo "빌드 번호 $CURRENT → $NEXT"

command -v xcodegen >/dev/null || { echo "xcodegen 이 필요합니다: brew install xcodegen"; exit 1; }
xcodegen generate >/dev/null

VERSION=$(grep -E '^\s+MARKETING_VERSION:' project.yml | cut -d'"' -f2)
OUT="build/release-${VERSION}-${NEXT}"
mkdir -p "$OUT"

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$DEVELOPMENT_TEAM</string>
  <key>signingStyle</key><string>automatic</string>
  <!-- 심볼을 같이 올려야 크래시 로그가 사람이 읽을 수 있는 형태로 온다 -->
  <key>uploadSymbols</key><true/>
  <!-- 비트코드는 폐지됐다. 켜두면 최근 Xcode 가 경고를 낸다. -->
  <key>compileBitcode</key><false/>
</dict>
</plist>
PLIST

echo "아카이브 중…"
xcodebuild archive \
  -project Chukjalal.xcodeproj \
  -scheme Chukjalal \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$OUT/Chukjalal.xcarchive" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
  > "$OUT/archive.log" 2>&1 || { tail -80 "$OUT/archive.log"; exit 1; }

[ -d "$OUT/Chukjalal.xcarchive" ] || { echo "아카이브 실패"; exit 1; }

echo "내보내는 중…"
xcodebuild -exportArchive \
  -archivePath "$OUT/Chukjalal.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/export" \
  -allowProvisioningUpdates \
  > "$OUT/export.log" 2>&1 || { tail -80 "$OUT/export.log"; exit 1; }

IPA=$(find "$OUT/export" -name '*.ipa' | head -1)
[ -n "$IPA" ] || { echo "내보내기 실패"; exit 1; }
echo "완료: $IPA"

if [ "${1:-}" = "upload" ]; then
  echo "업로드 중…"
  if [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ]; then
    xcrun altool --upload-app -f "$IPA" -t ios \
      --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
  else
    cp "$OUT/ExportOptions.plist" "$OUT/UploadOptions.plist"
    /usr/libexec/PlistBuddy -c 'Add :destination string upload' "$OUT/UploadOptions.plist"
    /usr/libexec/PlistBuddy -c 'Add :manageAppVersionAndBuildNumber bool false' "$OUT/UploadOptions.plist"
    xcodebuild -exportArchive -archivePath "$OUT/Chukjalal.xcarchive" \
      -exportOptionsPlist "$OUT/UploadOptions.plist" -exportPath "$OUT/upload" \
      -allowProvisioningUpdates > "$OUT/upload.log" 2>&1 || { tail -60 "$OUT/upload.log"; exit 1; }
    echo "App Store Connect 업로드 완료: $VERSION ($NEXT)"
  fi
else
  echo
  echo "업로드하려면:  ./release.sh upload"
  echo "또는 Xcode 의 Organizer 에서 $OUT/Chukjalal.xcarchive 를 연다."
fi
