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
}

/// 실제 백엔드. 스키마와 RLS 는 웹과 완전히 같다.
struct SupabaseRepository: Repository {
    func loadCatalog() async throws -> Catalog {
        async let leaguesData = Supabase.shared.get("leagues?select=id,name,short_name,country")
        async let teamsData = Supabase.shared.get("teams?select=id,league_id,name,name_ko,abbr,color,tint,logo_url")
        let horizon = ISO8601DateFormatter().string(from: Date().addingTimeInterval(14 * 86400))
        async let fixturesData = Supabase.shared.get(
            "fixtures?select=id,league_id,round,home_team_id,away_team_id,venue,kickoff_at,opens_at,lock_at,state,home_goals_ft,away_goals_ft,result"
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
            "profiles?select=handle,league_order,favorite_team_ids,onboarded_at&id=eq.\(uid)")
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
                "leaderboard?select=user_id,rank,handle,rating,accuracy,prev_rank&order=rank&limit=50"),
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
