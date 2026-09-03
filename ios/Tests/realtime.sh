#!/usr/bin/env bash
# Realtime 클라이언트가 서버와 실제로 말이 통하는지 확인한다.
#
# 목업이 아니라 진짜 Supabase Realtime 에 붙는다. 프레임 인코딩이 틀리면
# 서버는 오류를 주지 않고 그냥 무시하므로 — 붙었는데 아무것도 안 오는 상태가 된다 —
# 단위 테스트로는 잡히지 않고 여기서만 잡힌다.
#
# DB 에 아무것도 쓰지 않는다. 채팅 메시지 대신 클라이언트가 직접 쏜 broadcast 를
# 서버가 되돌려주게 해서(self: true) 수신 경로만 검사한다.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ../.env; set +a

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/Config.swift" <<CONF
enum Config {
    static let supabaseURL = "$VITE_SUPABASE_URL"
    static let supabaseAnonKey = "$VITE_SUPABASE_ANON_KEY"
}
CONF

swiftc -parse-as-library -O \
  Sources/Realtime.swift Tests/realtime_main.swift "$TMP/Config.swift" \
  -o "$TMP/rt" 2>&1 | grep -v "^$" || true

"$TMP/rt"
