import Foundation

struct Catalog {
    let leagues: [League]
    let teams: [Team]
    let fixtures: [Fixture]
}

/// 화면이 데이터를 얻는 유일한 통로. 웹의 `src/data/repository.ts` 와 같은 역할이다.
protocol Repository {
    func loadCatalog() async throws -> Catalog
    func loadMe() async throws -> Me
    func loadPredictions() async throws -> [Prediction]
    func upsertPrediction(fixtureId: Int, pick: Outcome, confidence: Confidence) async throws
    func loadRanking() async throws -> [RankRow]
    func loadMyStats() async throws -> MyStats
    func loadBadges() async throws -> [BadgeDef]
    func saveOnboarding(leagueOrder: [Int], favoriteTeamIds: [Int]) async throws

    // 경기 상세
    /// 이벤트·선발명단·상대전적·기록. 없는 항목은 빈 값이다.
    func loadMatchDetail(fixtureId: Int) async throws -> MatchDetailData
    func loadChat(fixtureId: Int) async throws -> [ChatMessage]
    func sendChat(fixtureId: Int, body: String) async throws
    /// 신고 3건이 쌓이면 서버가 자동으로 가리고 검토 큐로 넘긴다 (명세 10장)
    func reportMessage(id: Int, reason: ReportReason) async throws
    func blockUser(id: String) async throws
    /// 정산이 끝난 내 예측의 결과. 아직 정산 전이면 nil
    func loadSettlement(fixtureId: Int) async throws -> Settlement?

    /// 계정 삭제. 되돌릴 수 없다 (App Store 심사 지침 5.1.1(v))
    func deleteAccount() async throws

    // 프로필 편집
    /// - Returns: 서버가 확정한 닉네임 (앞뒤 공백이 잘린 값)
    func setHandle(_ handle: String) async throws -> String
    /// - Returns: 새 사진의 공개 URL
    func setAvatar(_ jpeg: Data) async throws -> String
    func removeAvatar() async throws
}

/// 실제 백엔드. 스키마와 RLS 는 웹과 완전히 같다.
struct SupabaseRepository: Repository {
    func loadCatalog() async throws -> Catalog {
        async let leaguesData = Supabase.shared.get("leagues?select=id,name,short_name,country")
        async let teamsData = Supabase.shared.get("teams?select=id,league_id,name,name_ko,abbr,color,tint,logo_url")
        let horizon = ISO8601DateFormatter().string(from: Date().addingTimeInterval(14 * 86400))
        async let fixturesData = Supabase.shared.get(
            "fixtures?select=id,league_id,round,home_team_id,away_team_id,venue,kickoff_at,opens_at,lock_at,state,home_goals_ft,away_goals_ft,result"
            + ",home_goals_live,away_goals_live,elapsed"
            + "&kickoff_at=lte.\(horizon)&state=neq.VOID&order=kickoff_at")

        return try Decode.catalog(
            leagues: await leaguesData, teams: await teamsData, fixtures: await fixturesData)
    }

    func loadMe() async throws -> Me {
        // 반드시 내 행만 집어야 한다.
        // profiles 는 읽기 정책이 public 이라(랭킹·채팅에서 남의 닉네임을 보여줘야 한다)
        // 필터 없이 부르면 아무 사람의 프로필이 딸려온다.
        guard let uid = await Supabase.shared.currentUser?.id else {
            throw Supabase.Failure.http(401, "로그인이 필요해요.")
        }
        let profile = try await Supabase.shared.get(
            "profiles?select=handle,avatar_url,league_order,favorite_team_ids,onboarded_at&id=eq.\(uid)")
        let rating = try await Supabase.shared.get(
            "ratings?select=rating,lifetime_points,balance,streak,settled_matches"
            + "&user_id=eq.\(uid)&order=season.desc&limit=1")
        // leaderboard 도 anon 에게 열려 있다 (랭킹이 공개 데이터라 의도된 것)
        let board = try await Supabase.shared.get("leaderboard?select=top_percent&user_id=eq.\(uid)")
        return try Decode.me(profile: profile, rating: rating, board: board)
    }

    func loadPredictions() async throws -> [Prediction] {
        guard let uid = await Supabase.shared.currentUser?.id else { return [] }
        return Decode.predictions(try await Supabase.shared.get(
            "predictions?select=fixture_id,pick,confidence&user_id=eq.\(uid)"))
    }

    func upsertPrediction(fixtureId: Int, pick: Outcome, confidence: Confidence) async throws {
        try await Supabase.shared.upsertPrediction(fixtureId: fixtureId, pick: pick.rawValue,
                                                   confidence: confidence.rawValue)
    }

    func loadRanking() async throws -> [RankRow] {
        let me = await Supabase.shared.currentUser?.id
        return Decode.ranking(
            try await Supabase.shared.get(
                "leaderboard?select=user_id,rank,handle,avatar_url,rating,accuracy,prev_rank&order=rank&limit=50"),
            me: me)
    }

    /// 프로필 집계는 서버 RPC 한 번으로 받는다 (명세 5장)
    func loadMyStats() async throws -> MyStats {
        Decode.myStats(try await Supabase.shared.rpc("my_stats"))
    }

    func saveOnboarding(leagueOrder: [Int], favoriteTeamIds: [Int]) async throws {
        try await Supabase.shared.saveOnboarding(leagueOrder: leagueOrder,
                                                 favoriteTeamIds: favoriteTeamIds)
    }

    // MARK: 경기 상세

    func loadMatchDetail(fixtureId: Int) async throws -> MatchDetailData {
        // 네 개를 병렬로. 하나가 없어도 나머지는 보여야 하므로 실패를 삼킨다 —
        // 경기 상세의 핵심은 예측과 채팅이고, 이건 곁들이는 정보다.
        async let events = try? Supabase.shared.get(
            "fixture_events?select=seq,minute,extra,team_id,type,detail,player,assist"
            + "&fixture_id=eq.\(fixtureId)&order=seq")
        async let lineups = try? Supabase.shared.get(
            "fixture_lineups?select=team_id,formation,coach,starters,bench&fixture_id=eq.\(fixtureId)")
        async let h2h = try? Supabase.shared.get(
            "fixture_h2h?select=played,home_wins,draws,away_wins,recent&fixture_id=eq.\(fixtureId)")
        async let stats = try? Supabase.shared.get(
            "fixture_stats?select=team_id,stats&fixture_id=eq.\(fixtureId)")

        return MatchDetailData(
            events: await events.map(Decode.events) ?? [],
            lineups: await lineups.map(Decode.lineups) ?? [],
            h2h: await h2h.flatMap(Decode.h2h),
            stats: await stats.map(Decode.stats) ?? [])
    }

    func loadChat(fixtureId: Int) async throws -> [ChatMessage] {
        let me = await Supabase.shared.currentUser?.id
        // 최근 50건을 역순으로 받아 뒤집는다 — 오래된 것부터 위로 쌓아야 읽힌다.
        let data = try await Supabase.shared.get(
            "chat_messages?select=id,body,created_at,user_id,profiles(handle,avatar_url)"
            + "&channel=eq.match:\(fixtureId)&deleted_at=is.null"
            + "&order=created_at.desc&limit=50")
        return Decode.chat(data, me: me).reversed()
    }

    func sendChat(fixtureId: Int, body: String) async throws {
        guard let uid = await Supabase.shared.currentUser?.id else {
            throw Supabase.Failure.http(401, "로그인이 필요해요.")
        }
        try await Supabase.shared.insert("chat_messages", [
            "channel": "match:\(fixtureId)",
            "fixture_id": fixtureId,
            "user_id": uid,
            "body": body,
        ])
    }

    func reportMessage(id: Int, reason: ReportReason) async throws {
        guard let uid = await Supabase.shared.currentUser?.id else {
            throw Supabase.Failure.http(401, "로그인이 필요해요.")
        }
        do {
            try await Supabase.shared.insert("message_reports", [
                "message_id": id, "reporter_id": uid, "reason": reason.rawValue,
            ])
        } catch let e as Supabase.Failure {
            // 같은 메시지를 두 번 신고한 것뿐이다. 사용자에게는 접수된 것으로 보이면 된다.
            if case .http(_, DuplicateMarker) = e { return }
            throw e
        }
    }

    func blockUser(id: String) async throws {
        guard let uid = await Supabase.shared.currentUser?.id else {
            throw Supabase.Failure.http(401, "로그인이 필요해요.")
        }
        do {
            try await Supabase.shared.insert("user_blocks", ["blocker_id": uid, "blocked_id": id])
        } catch let e as Supabase.Failure {
            if case .http(_, DuplicateMarker) = e { return }
            throw e
        }
    }

    func loadSettlement(fixtureId: Int) async throws -> Settlement? {
        guard let uid = await Supabase.shared.currentUser?.id else { return nil }
        let data = try await Supabase.shared.get(
            "settlements?select=fixture_id,delta_rating,points"
            + "&user_id=eq.\(uid)&fixture_id=eq.\(fixtureId)&limit=1")
        return Decode.settlement(data)
    }

    func deleteAccount() async throws {
        try await Supabase.shared.deleteAccount()
    }

    func setHandle(_ handle: String) async throws -> String {
        try await Supabase.shared.setHandle(handle)
    }

    func setAvatar(_ jpeg: Data) async throws -> String {
        try await Supabase.shared.uploadAvatar(jpeg)
    }

    func removeAvatar() async throws {
        try await Supabase.shared.removeAvatar()
    }

    func loadBadges() async throws -> [BadgeDef] {
        Decode.badges(try await Supabase.shared.get(
            "badge_definitions?select=id,name,tier,user_badges(progress,target)&active=eq.true"))
    }
}

/// 데이터는 서버에서만 온다. 가짜 데이터로 화면을 채우지 않는다 —
/// 없으면 없다고 말하는 편이 그럴듯한 숫자를 보여주는 것보다 낫다.
enum Repositories {
    static let current: any Repository = SupabaseRepository()
}
