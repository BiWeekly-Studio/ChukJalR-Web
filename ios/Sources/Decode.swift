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
                result: (r["result"] as? String).flatMap(Outcome.init(rawValue:)),
                liveHome: r["home_goals_live"] as? Int, liveAway: r["away_goals_live"] as? Int,
                elapsed: r["elapsed"] as? Int)
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
        me.avatarUrl = p["avatar_url"] as? String
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
                isMe: me != nil && (r["user_id"] as? String) == me,
                avatarUrl: r["avatar_url"] as? String)
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
        s.byOutcome = (o["byOutcome"] as? [[String: Any]] ?? []).compactMap {
            guard let pick = ($0["pick"] as? String).flatMap(Outcome.init(rawValue:)) else { return nil }
            return PickAccuracy(pick: pick, n: $0["n"] as? Int ?? 0,
                                accuracy: ($0["accuracy"] as? NSNumber)?.doubleValue ?? 0)
        }
        s.curve = (o["curve"] as? [Any] ?? []).compactMap { ($0 as? NSNumber)?.intValue }
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


    // MARK: 경기 상세

    /// PostgREST 의 임베드는 profiles 를 객체로 준다 (`profiles(handle)`).
    /// 프로필이 지워진 사람의 옛 메시지도 남을 수 있어 닉네임이 없을 수 있다.
    static func chat(_ data: Data, me: String?) -> [ChatMessage] {
        rows(data).compactMap { r in
            guard let id = r["id"] as? Int,
                  let userId = r["user_id"] as? String,
                  let body = r["body"] as? String else { return nil }
            let handle = ((r["profiles"] as? [String: Any])?["handle"] as? String)?
                .trimmingCharacters(in: .whitespaces)
            return ChatMessage(
                id: id,
                userId: userId,
                handle: handle?.isEmpty == false ? handle! : "알 수 없음",
                avatarUrl: (r["profiles"] as? [String: Any])?["avatar_url"] as? String,
                body: body,
                at: date(r["created_at"] as? String) ?? Date(),
                mine: me != nil && userId == me)
        }
    }

    static func settlement(_ data: Data) -> Settlement? {
        guard let r = rows(data).first,
              let fixtureId = r["fixture_id"] as? Int,
              let delta = r["delta_rating"] as? Int,
              let points = r["points"] as? Int else { return nil }
        return Settlement(fixtureId: fixtureId, deltaRating: delta, points: points)
    }

    // MARK: 경기 부가 정보

    static func events(_ data: Data) -> [MatchEvent] {
        rows(data).compactMap(event)
    }

    /// REST 는 snake_case, 브로드캐스트는 camelCase 로 준다. 한 자리에서 흡수한다.
    static func event(_ r: [String: Any]) -> MatchEvent? {
        guard let seq = r["seq"] as? Int, let type = r["type"] as? String else { return nil }
        return MatchEvent(
            seq: seq,
            minute: r["minute"] as? Int,
            extra: r["extra"] as? Int,
            teamId: (r["team_id"] as? Int) ?? (r["teamId"] as? Int),
            type: type,
            detail: r["detail"] as? String,
            player: r["player"] as? String,
            assist: r["assist"] as? String)
    }

    static func lineups(_ data: Data) -> [Lineup] {
        rows(data).compactMap { r in
            guard let teamId = r["team_id"] as? Int else { return nil }
            func people(_ key: String) -> [LineupPlayer] {
                (r[key] as? [[String: Any]] ?? []).map {
                    LineupPlayer(name: $0["name"] as? String,
                                 number: $0["number"] as? Int,
                                 pos: $0["pos"] as? String)
                }
            }
            return Lineup(teamId: teamId,
                          formation: r["formation"] as? String,
                          coach: r["coach"] as? String,
                          starters: people("starters"),
                          bench: people("bench"))
        }
    }

    static func h2h(_ data: Data) -> HeadToHead? {
        guard let r = rows(data).first, let played = r["played"] as? Int else { return nil }
        let recent = (r["recent"] as? [[String: Any]] ?? []).compactMap { m -> H2HMatch? in
            guard let home = m["home_id"] as? Int, let away = m["away_id"] as? Int else { return nil }
            return H2HMatch(date: date(m["date"] as? String), homeId: home, awayId: away,
                            hg: m["hg"] as? Int, ag: m["ag"] as? Int)
        }
        return HeadToHead(played: played,
                          homeWins: r["home_wins"] as? Int ?? 0,
                          draws: r["draws"] as? Int ?? 0,
                          awayWins: r["away_wins"] as? Int ?? 0,
                          recent: recent)
    }

    static func stats(_ data: Data) -> [TeamStats] {
        rows(data).compactMap { r in
            guard let teamId = r["team_id"] as? Int else { return nil }
            // 값이 숫자로도 문자열로도 온다 ("54%" / 14 / null). 문자열로 통일한다.
            let raw = r["stats"] as? [String: Any] ?? [:]
            var out: [String: String] = [:]
            for (k, v) in raw where !(v is NSNull) {
                out[k] = (v as? String) ?? String(describing: v)
            }
            return TeamStats(teamId: teamId, stats: out)
        }
    }

    // MARK: 예측 기록

    /// predictions 에 fixtures 와 settlements 를 임베드해서 받은 것을 편다.
    static func history(_ data: Data) -> [PredictionRecord] {
        rows(data).compactMap { r in
            guard let id = r["id"] as? Int,
                  let pick = (r["pick"] as? String).flatMap(Outcome.init(rawValue:)),
                  let conf = (r["confidence"] as? Int).flatMap(Confidence.init(rawValue:)),
                  let f = r["fixtures"] as? [String: Any],
                  let home = f["home_team_id"] as? Int,
                  let away = f["away_team_id"] as? Int,
                  let kickoff = date(f["kickoff_at"] as? String) else { return nil }

            // 정산은 예측당 최대 하나지만, PostgREST 는 관계에 따라 배열로도 준다
            let s = (r["settlements"] as? [String: Any])
                ?? (r["settlements"] as? [[String: Any]])?.first

            return PredictionRecord(
                id: id,
                fixtureId: r["fixture_id"] as? Int ?? 0,
                homeTeamId: home, awayTeamId: away,
                leagueId: f["league_id"] as? Int ?? 0,
                kickoffAt: kickoff,
                pick: pick, confidence: conf,
                state: f["state"] as? String ?? "SCHEDULED",
                actual: (f["result"] as? String).flatMap(Outcome.init(rawValue:)),
                homeGoals: f["home_goals_ft"] as? Int,
                awayGoals: f["away_goals_ft"] as? Int,
                deltaRating: s?["delta_rating"] as? Int,
                points: s?["points"] as? Int)
        }
    }

    // MARK: 리그 순위표

    static func standings(_ data: Data) -> [StandingRow] {
        rowsPublic(data).compactMap { r in
            guard let league = r["league_id"] as? Int,
                  let team = r["team_id"] as? Int,
                  let rank = r["rank"] as? Int else { return nil }
            func n(_ k: String) -> Int { r[k] as? Int ?? 0 }
            return StandingRow(
                leagueId: league, teamId: team, rank: rank,
                points: n("points"), played: n("played"),
                win: n("win"), draw: n("draw"), lose: n("lose"),
                goalsFor: n("goals_for"), goalsAgainst: n("goals_against"),
                goalDiff: n("goal_diff"),
                form: r["form"] as? String)
        }
    }
}
