import Foundation

/// PostgREST 응답 → 모델. snake_case 컬럼명을 그대로 받는다.
enum Decode {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static func date(_ s: String?) -> Date? {
        guard let s else { return nil }
        return iso.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }

    private static func rows(_ data: Data) -> [[String: Any]] {
        (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
    }

    /// '#RRGGBB' → 0xRRGGBB
    private static func hex(_ s: Any?) -> UInt32 {
        guard let t = (s as? String)?.trimmingCharacters(in: CharacterSet(charactersIn: "#")),
              let v = UInt32(t, radix: 16) else { return 0x9C9385 }
        return v
    }

    static func catalog(leagues: Data, teams: Data, fixtures: Data) throws -> Catalog {
        let ls = rows(leagues).compactMap { r -> League? in
            guard let id = r["id"] as? Int, let name = r["name"] as? String else { return nil }
            return League(id: id, name: name,
                          short: r["short_name"] as? String ?? name,
                          country: r["country"] as? String ?? "")
        }
        let ts = rows(teams).compactMap { r -> Team? in
            guard let id = r["id"] as? Int, let leagueId = r["league_id"] as? Int else { return nil }
            let name = (r["name_ko"] as? String) ?? (r["name"] as? String) ?? ""
            return Team(id: id, leagueId: leagueId, name: name,
                        abbr: r["abbr"] as? String ?? String(name.prefix(3)),
                        logoUrl: r["logo_url"] as? String,
                        colorHex: hex(r["color"]), tintHex: hex(r["tint"]))
        }
        let fs = rows(fixtures).compactMap { r -> Fixture? in
            guard let id = r["id"] as? Int, let leagueId = r["league_id"] as? Int,
                  let home = r["home_team_id"] as? Int, let away = r["away_team_id"] as? Int,
                  let kickoff = date(r["kickoff_at"] as? String),
                  let opens = date(r["opens_at"] as? String),
                  let lock = date(r["lock_at"] as? String) else { return nil }
            // 라운드 문자열('Regular Season - 6')에서 숫자만. 없으면 nil.
            let digits = (r["round"] as? String)?.filter(\.isNumber) ?? ""
            let venue = (r["venue"] as? String)?.trimmingCharacters(in: .whitespaces)
            return Fixture(
                id: id, leagueId: leagueId, round: digits.isEmpty ? nil : Int(digits),
                homeTeamId: home, awayTeamId: away,
                venue: (venue?.isEmpty ?? true) ? nil : venue,
                kickoffAt: kickoff, opensAt: opens, lockAt: lock,
                // 기준선은 live_baselines RPC 로 따로 받는다. 여기서 기본값을 만들지 않는다.
                baseline: nil, participants: nil,
                state: r["state"] as? String ?? "SCHEDULED",
                homeGoals: r["home_goals_ft"] as? Int, awayGoals: r["away_goals_ft"] as? Int,
                result: (r["result"] as? String).flatMap(Outcome.init(rawValue:)))
        }
        return Catalog(leagues: ls, teams: ts, fixtures: fs)
    }

    static func me(profile: Data, rating: Data, board: Data) throws -> Me {
        var me = Me()
        // 내 프로필이 없으면 기본값으로 넘어가면 안 된다 — 남의 값이나 빈 값을 내 것처럼 보여준다
        guard let p = rows(profile).first else {
            throw Supabase.Failure.http(404, "내 프로필을 찾지 못했어요.")
        }
        me.handle = p["handle"] as? String ?? ""
        me.leagueOrder = p["league_order"] as? [Int] ?? []
        me.favoriteTeamIds = p["favorite_team_ids"] as? [Int] ?? []
        me.onboarded = p["onboarded_at"] != nil && !(p["onboarded_at"] is NSNull)
        if let r = rows(rating).first {
            me.rating = r["rating"] as? Int ?? 1000
            me.lifetimePoints = r["lifetime_points"] as? Int ?? 0
            me.balance = r["balance"] as? Int ?? 0
            me.streak = r["streak"] as? Int ?? 0
            me.settledMatches = r["settled_matches"] as? Int ?? 0
        }
        // 순위표에 없으면 '상위 100%' 가 아니라 '아직 순위 없음' 이다
        me.topPercent = rows(board).first?["top_percent"] as? Double
        return me
    }

    static func predictions(_ data: Data) -> [Prediction] {
        rows(data).compactMap { r in
            guard let id = r["fixture_id"] as? Int,
                  let pick = (r["pick"] as? String).flatMap(Outcome.init(rawValue:)),
                  let c = (r["confidence"] as? Int).flatMap(Confidence.init(rawValue:)) else { return nil }
            return Prediction(fixtureId: id, pick: pick, confidence: c)
        }
    }
}

extension Decode {
    static func ranking(_ data: Data, me: String?) -> [RankRow] {
        rowsPublic(data).compactMap { r in
            guard let rank = r["rank"] as? Int, let handle = r["handle"] as? String else { return nil }
            let prev = r["prev_rank"] as? Int
            return RankRow(
                rank: rank, handle: handle,
                accuracy: (r["accuracy"] as? NSNumber)?.doubleValue ?? 0,
                rating: r["rating"] as? Int ?? 0,
                // 직전 발표가 없으면 '처음 오름' — 0 으로 만들지 않는다
                change: prev.map { $0 - rank },
                isMe: me != nil && (r["user_id"] as? String) == me)
        }
    }

    static func myStats(_ data: Data) -> MyStats {
        guard let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            return MyStats()
        }
        var s = MyStats()
        s.settled = o["settled"] as? Int ?? 0
        s.hits = o["hits"] as? Int ?? 0
        s.byLeague = (o["byLeague"] as? [[String: Any]] ?? []).compactMap {
            guard let id = $0["leagueId"] as? Int else { return nil }
            return LeagueAccuracy(leagueId: id, n: $0["n"] as? Int ?? 0,
                                  accuracy: ($0["accuracy"] as? NSNumber)?.doubleValue ?? 0)
        }
        s.calibration = (o["calibration"] as? [[String: Any]] ?? []).compactMap {
            guard let c = ($0["confidence"] as? Int).flatMap(Confidence.init(rawValue:)) else { return nil }
            return CalibrationRow(confidence: c, n: $0["n"] as? Int ?? 0,
                                  actual: ($0["actual"] as? NSNumber)?.doubleValue ?? 0,
                                  expected: ($0["expected"] as? NSNumber)?.doubleValue ?? 0)
        }
        if let fb = o["fanBias"] as? [String: Any], let bias = fb["bias"] as? Int {
            s.fanBias = (bias, fb["n"] as? Int ?? 0)
        }
        s.recent = (o["recent"] as? [[String: Any]] ?? []).enumerated().map { i, r in
            RecentResult(id: i, correct: r["correct"] as? Bool ?? false, delta: r["delta"] as? Int ?? 0)
        }
        return s
    }

    static func badges(_ data: Data) -> [BadgeDef] {
        rowsPublic(data).compactMap { r in
            guard let id = r["id"] as? String, let name = r["name"] as? String else { return nil }
            let mine = (r["user_badges"] as? [[String: Any]])?.first
            return BadgeDef(id: id, name: name, tier: r["tier"] as? String ?? "bronze",
                            progress: mine?["progress"] as? Int ?? 0,
                            target: mine?["target"] as? Int)
        }
    }

    static func rowsPublic(_ data: Data) -> [[String: Any]] {
        (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
    }
}
