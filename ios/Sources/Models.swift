import Foundation

struct League: Identifiable, Codable, Hashable {
    let id: Int
    let name: String
    let short: String
    let country: String
}

struct Team: Identifiable, Codable, Hashable {
    let id: Int
    let leagueId: Int
    let name: String
    let abbr: String
    /// 팀 엠블럼. 없거나 로딩에 실패하면 아래 색 + 약어로 떨어진다.
    let logoUrl: String?
    /// 팀 상징색 (엠블럼을 못 받았을 때의 대체 표시에 쓴다)
    let colorHex: UInt32
    let tintHex: UInt32
}

enum WindowState { case upcoming, open, locked, finished }

struct Fixture: Identifiable, Codable {
    let id: Int
    let leagueId: Int
    /// 원본에 없으면 nil — 0R 같은 지어낸 값을 만들지 않는다
    let round: Int?
    let homeTeamId: Int
    let awayTeamId: Int
    let venue: String?
    let kickoffAt: Date
    /// 예측 창이 열리는 시각 = 매치데이 시작 (KST 06:00)
    let opensAt: Date
    let lockAt: Date
    /// 지금까지 모인 사람들의 확률분포. 못 받았으면 nil —
    /// 여기에 그럴듯한 숫자를 채우면 없는 여론을 지어내는 게 된다.
    let baseline: Distribution?
    /// 예측한 사람 수. 집계를 못 받았으면 nil (0 과 다르다)
    let participants: Int?
    let state: String
    let homeGoals: Int?
    let awayGoals: Int?
    let result: Outcome?

    /// 지금 매치데이에 속한 경기인지.
    ///
    /// opensAt 이 지났는지만 보면, 결과를 못 받은 지난 경기가 '오늘의 경기'에 영원히 남는다.
    /// 어느 매치데이 것인지까지 봐야 한다.
    func isCurrentMatchday(now: Date = .now) -> Bool {
        opensAt >= Fixture.matchdayStart(now: now)
    }

    /// 지금 매치데이가 시작된 시각 (가장 최근 KST 06:00).
    /// 매치데이는 자정이 아니라 06:00 에 시작해 22시간 이어진다 (명세 2.1).
    static func matchdayStart(now: Date = .now) -> Date {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Seoul")!
        let sixAM = cal.date(bySettingHour: 6, minute: 0, second: 0, of: now)!
        return now < sixAM ? cal.date(byAdding: .day, value: -1, to: sixAM)! : sixAM
    }

    /// 예측 창 상태. 서버 RLS 가 같은 조건을 강제하므로 여기서는 표시만 담당한다.
    func window(now: Date = .now) -> WindowState {
        if state == "FINISHED", result != nil { return .finished }
        if now < opensAt { return .upcoming }
        if now >= lockAt { return .locked }
        return .open
    }
}

struct Prediction: Codable {
    let fixtureId: Int
    let pick: Outcome
    let confidence: Confidence
}

/// 내 상태. 서버가 유일한 진실이고 클라이언트는 표시만 한다 (명세 11.1).
struct Me {
    var handle: String = ""
    var leagueOrder: [Int] = []
    var favoriteTeamIds: [Int] = []
    var onboarded = false
    var rating = 1000
    var lifetimePoints = 0
    var balance = 0
    var streak = 0
    var settledMatches = 0
    /// 상위 몇 %. 아직 순위표에 오르지 않았으면 nil
    var topPercent: Double?
}

// MARK: - 여론의 두께

/// 서버 compute_baseline 은 예측이 0명이어도 prior 로 기준선을 돌려준다.
/// 가중치가 w = 30/(30+n) 이라 표본이 적을수록 값의 대부분이 기본 예상치다.
/// 그걸 "다른 사람들은 이렇게 봤어요"라고 부르면 없는 여론을 지어내는 게 된다.
enum CrowdLevel { case none, thin, solid }

func crowdLevel(_ participants: Int?) -> CrowdLevel {
    guard let n = participants, n > 0 else { return .none }
    return n < 30 ? .thin : .solid   // 30 은 freeze_baseline 의 prior-heavy/blend 경계와 같다
}


// MARK: - 랭킹 · 기록

struct RankRow: Identifiable {
    var id: String { handle }
    let rank: Int
    let handle: String
    let accuracy: Double
    let rating: Int
    /// 직전 발표보다 순위가 올라가면 양수. 처음 오른 사람은 nil
    let change: Int?
    let isMe: Bool
    var initial: String { String(handle.prefix(1)) }
}

struct LeagueAccuracy: Identifiable {
    var id: Int { leagueId }
    let leagueId: Int
    let n: Int
    let accuracy: Double
}

struct CalibrationRow: Identifiable {
    var id: Int { confidence.rawValue }
    let confidence: Confidence
    let n: Int
    /// 실제 적중률
    let actual: Double
    /// 그 확신도로 건 값 (스스로 주장한 확률)
    let expected: Double
}

struct RecentResult: Identifiable {
    let id: Int
    let correct: Bool
    let delta: Int
}

struct MyStats {
    var settled = 0
    var hits = 0
    var byLeague: [LeagueAccuracy] = []
    var calibration: [CalibrationRow] = []
    /// 내 팀 경기에서의 경기당 평균 지수 차이. 표본이 적으면 nil
    var fanBias: (bias: Int, n: Int)?
    var recent: [RecentResult] = []
    var accuracy: Double? { settled > 0 ? Double(hits) / Double(settled) : nil }
}

struct BadgeDef: Identifiable {
    let id: String
    let name: String
    let tier: String        // bronze | silver | gold
    let progress: Int
    /// 목표치는 user_badges 행에만 있다. 아직 시작하지 않은 뱃지는 알 수 없다 —
    /// 1 같은 값을 넣으면 '0/1' 이라는 없는 진행도가 생긴다.
    let target: Int?
    var earned: Bool { target.map { progress >= $0 } ?? false }
}
