#!/usr/bin/env bash
set -euo pipefail
CHECK_DIR=$(mktemp -d /tmp/chukjalr-ios-baselines.XXXXXX)
trap 'rm -rf "$CHECK_DIR"' EXIT
cat ios/Sources/Scoring.swift ios/Sources/Models.swift ios/Sources/Decode.swift > "$CHECK_DIR/main.swift"
cat >> "$CHECK_DIR/main.swift" <<'SWIFT'
struct Catalog { let leagues:[League]; let teams:[Team]; let fixtures:[Fixture] }
enum Supabase { enum Failure: Error { case http(Int,String) } }
let fixtureJSON = #"[{"id":1,"league_id":39,"home_team_id":42,"away_team_id":50,"kickoff_at":"2026-09-12T14:00:00Z","opens_at":"2026-09-11T21:00:00Z","lock_at":"2026-09-12T13:55:00Z"}]"#.data(using:.utf8)!
let empty = Data("[]".utf8)
let valid = Data(#"[{"fixture_id":1,"q":[0.45,0.26,0.29],"n":23}]"#.utf8)
let catalog = try Decode.catalog(leagues:empty,teams:empty,fixtures:fixtureJSON,baselines:valid)
precondition(catalog.fixtures[0].baseline == [0.45,0.26,0.29])
precondition(catalog.fixtures[0].participants == 23)
for bad in [empty,Data(#"[{"fixture_id":1,"q":[0,0.5,0.5],"n":23}]"#.utf8)] {
 let catalog = try Decode.catalog(leagues:empty,teams:empty,fixtures:fixtureJSON,baselines:bad)
 precondition(catalog.fixtures[0].baseline == nil)
}
print("PASS: iOS maps server baseline and participation count; missing/invalid data stays absent.")
SWIFT
swift "$CHECK_DIR/main.swift"
