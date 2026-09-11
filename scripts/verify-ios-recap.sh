#!/usr/bin/env bash
set -euo pipefail
CHECK_DIR=$(mktemp -d /tmp/chukjalr-ios-recap.XXXXXX)
trap 'rm -rf "$CHECK_DIR"' EXIT
cat ios/Sources/Scoring.swift > "$CHECK_DIR/main.swift"
sed '/^struct SettlementRecapView:/,$d;s/import SwiftUI/import Foundation/' ios/Sources/SettlementRecap.swift >> "$CHECK_DIR/main.swift"
cat >> "$CHECK_DIR/main.swift" <<'SWIFT'
let json = #"{"items":[{"id":"123","fixtureId":1,"homeName":"대한민국","awayName":"일본","homeGoals":1,"awayGoals":1,"pick":"HOME","actual":"DRAW","correct":false,"deltaRating":-9,"points":3,"settledAt":"2026-09-09T00:00:00Z"},{"id":"124","fixtureId":2,"homeName":"아스날","awayName":"리버풀","homeGoals":2,"awayGoals":1,"pick":"HOME","actual":"HOME","correct":true,"deltaRating":18,"points":24,"settledAt":"2026-09-09T00:00:00Z"}],"remaining":4}"#
let recap = try JSONDecoder().decode(SettlementRecapData.self, from:Data(json.utf8))
precondition(recap.delta == 9 && recap.points == 27 && recap.correct == 1 && recap.remaining == 4)
precondition(recap.items[0].pickLabel == "대한민국 승")
precondition(recap.items.map(\.id) == ["123","124"])
let empty = try JSONDecoder().decode(SettlementRecapData.self,from:Data(#"{"items":[],"remaining":0}"#.utf8))
precondition(empty.items.isEmpty && empty.delta == 0)
print("PASS: iOS recap payload, hit/miss, signed rating total, separate earned points, exact receipt IDs and empty state")
SWIFT
swift "$CHECK_DIR/main.swift"
