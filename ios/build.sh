#!/bin/bash
# Live Activity 가 들어오면서 위젯 익스텐션이 필요해졌다 → swiftc 단일 빌드로는 안 된다.
# 프로젝트는 project.yml 에서 생성한다 (xcodegen). .xcodeproj 는 저장소에 넣지 않는다.
set -euo pipefail
cd "$(dirname "$0")"

export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
DEVICE=${DEVICE:-"iPhone 17 Pro"}

# Supabase 설정은 .env 에서 생성한다. 키를 소스에 박지 않는다.
ENV_FILE=${ENV_FILE:-../.env}
SUPA_URL=$(grep -E '^VITE_SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
SUPA_KEY=$(grep -E '^VITE_SUPABASE_ANON_KEY=' "$ENV_FILE" | cut -d= -f2-)
cat > Sources/Config.swift <<EOF
// build.sh 가 .env 에서 생성한다. 직접 고치지 말 것.
enum Config {
    static let supabaseURL = "$SUPA_URL"
    static let supabaseAnonKey = "$SUPA_KEY"
    static let urlScheme = "chukjalal"
    static let redirectURI = "chukjalal://auth"
}
EOF

# 실기기·아카이브 빌드에 필요한 팀 ID (없으면 시뮬레이터 빌드만 된다)
[ -f .env.local ] && set -a && . ./.env.local && set +a
export DEVELOPMENT_TEAM=${DEVELOPMENT_TEAM:-}

command -v xcodegen >/dev/null || { echo "xcodegen 이 필요합니다: brew install xcodegen"; exit 1; }
xcodegen generate >/dev/null

xcodebuild -project Chukjalal.xcodeproj -scheme Chukjalal \
  -destination "platform=iOS Simulator,name=$DEVICE" \
  -derivedDataPath build/dd -allowProvisioningUpdates build "$@" | grep -E "error:|warning: unused|BUILD" || true

APP=$(find build/dd/Build/Products -name 'Chukjalal.app' -maxdepth 3 | head -1)
[ -n "$APP" ] || { echo "빌드 산출물을 찾지 못했습니다"; exit 1; }
echo "빌드 완료: $APP"

if [ "${RUN:-1}" = "1" ]; then
  xcrun simctl boot "$DEVICE" 2>/dev/null || true
  xcrun simctl install "$DEVICE" "$APP"
  xcrun simctl launch "$DEVICE" com.jalr.chukjalal
fi
