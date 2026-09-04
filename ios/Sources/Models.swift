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
    /// 진행 중 점수. 표시 전용이다 — 정산은 오직 homeGoals/awayGoals(정규 결과)만 본다.
    let liveHome: Int?
    let liveAway: Int?
    /// 경과 분. 하프타임에는 45 에서 멈춘다
    let elapsed: Int?

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

// MARK: - 리그 순위표

struct StandingRow: Identifiable, Equatable {
    let leagueId: Int
    let teamId: Int
    let rank: Int
    let points: Int
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let goalDiff: Int
    /// 최근 5경기 "WWDLW". API 가 준 그대로 — 우리가 다시 세지 않는다.
    let form: String?

    var id: Int { teamId }
}

// MARK: - 경기 부가 정보

struct MatchEvent: Identifiable, Equatable {
    let seq: Int
    let minute: Int?
    let extra: Int?
    let teamId: Int?
    /// Goal | Card | subst | Var
    let type: String
    let detail: String?
    let player: String?
    let assist: String?

    var id: Int { seq }

    var minuteLabel: String {
        guard let minute else { return "" }
        return extra.map { "\(minute)+\($0)'" } ?? "\(minute)'"
    }

    /// 화면에 그릴 표시. 아는 종류만 그리고, 모르는 건 통째로 건너뛴다.
    var mark: String? {
        let d = (detail ?? "").lowercased()
        switch type {
        case "Goal": return d.contains("missed") ? "✖" : "⚽"
        case "Card": return d.contains("red") ? "🟥" : "🟨"
        case "subst": return "↔"
        default: return nil
        }
    }
}

struct LineupPlayer: Equatable {
    let name: String?
    let number: Int?
    let pos: String?
}

struct Lineup: Identifiable, Equatable {
    let teamId: Int
    let formation: String?
    let coach: String?
    let starters: [LineupPlayer]
    let bench: [LineupPlayer]

    var id: Int { teamId }
}

struct H2HMatch: Identifiable, Equatable {
    let date: Date?
    let homeId: Int
    let awayId: Int
    let hg: Int?
    let ag: Int?

    var id: String { "\(homeId)-\(awayId)-\(date?.timeIntervalSince1970 ?? 0)" }
}

struct HeadToHead: Equatable {
    let played: Int
    let homeWins: Int
    let draws: Int
    let awayWins: Int
    let recent: [H2HMatch]
}

struct TeamStats: Identifiable, Equatable {
    let teamId: Int
    /// API 가 주는 이름을 그대로 쓴다 ("Ball Possession" 등)
    let stats: [String: String]

    var id: Int { teamId }
}

/// 경기 상세가 한 번에 받아오는 묶음. 없는 항목은 빈 값이다.
struct MatchDetailData: Equatable {
    var events: [MatchEvent] = []
    var lineups: [Lineup] = []
    var h2h: HeadToHead?
    var stats: [TeamStats] = []
}

// MARK: - 채팅

enum ChatState { case before, open, closed }

extension Fixture {
    /// 채팅은 킥오프 1시간 전에 열리고, 경기가 끝나고 얼마 뒤 닫힌다.
    func chat(now: Date = .now) -> ChatState {
        if now < kickoffAt.addingTimeInterval(-3600) { return .before }
        if now > kickoffAt.addingTimeInterval(4 * 3600) { return .closed }
        return .open
    }
    /// 채팅이 열리는 시각
    var chatOpensAt: Date { kickoffAt.addingTimeInterval(-3600) }
}

struct ChatMessage: Identifiable, Equatable {
    let id: Int
    /// 브로드캐스트에도 실려 오지만, 차단은 보낸 사람 id 로 건다
    let userId: String
    let handle: String
    let avatarUrl: String?
    let body: String
    let at: Date
    let mine: Bool
    var initial: String { String(handle.prefix(1)) }
}

enum ReportReason: String, CaseIterable {
    case abuse, spam, ad, other
    var label: String {
        switch self {
        case .abuse: return "욕설·비하"
        case .spam:  return "도배"
        case .ad:    return "홍보·광고"
        case .other: return "기타"
        }
    }
}

/// 내가 한 예측 하나와 그 결말.
///
/// 정산 전에는 결과 칸이 비어 있다 — '아직 모른다' 와 '틀렸다' 는 다르므로
/// 없는 값을 0 으로 채우지 않는다.
struct PredictionRecord: Identifiable {
    let id: Int
    let fixtureId: Int
    let homeTeamId: Int
    let awayTeamId: Int
    let leagueId: Int
    let kickoffAt: Date
    let pick: Outcome
    let confidence: Confidence
    let state: String

    /// 정규 결과. 아직 안 끝났으면 nil
    let actual: Outcome?
    let homeGoals: Int?
    let awayGoals: Int?
    /// 정산 결과. 경기가 끝나도 정산 전이면 nil
    let deltaRating: Int?
    let points: Int?

    var settled: Bool { deltaRating != nil }
    var hit: Bool? { actual.map { $0 == pick } }
}

/// 정산이 끝난 내 예측의 결과. 서버 기록이 유일한 진실이다 (명세 11.1).
struct Settlement {
    let fixtureId: Int
    let deltaRating: Int
    let points: Int
    var won: Bool { deltaRating > 0 }
}

struct Prediction: Codable {
    let fixtureId: Int
    let pick: Outcome
    let confidence: Confidence
}

/// 내 상태. 서버가 유일한 진실이고 클라이언트는 표시만 한다 (명세 11.1).
struct Me {
    var handle: String = ""
    /// 프로필 사진. 없으면 닉네임 첫 글자로 떨어진다.
    var avatarUrl: String?
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
    let avatarUrl: String?
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

struct PickAccuracy: Identifiable {
    let pick: Outcome
    let n: Int
    let accuracy: Double
    var id: Outcome { pick }
}

struct MyStats {
    var settled = 0
    var hits = 0
    var byLeague: [LeagueAccuracy] = []
    var calibration: [CalibrationRow] = []
    /// 어느 쪽에 걸었을 때 잘 맞히는지
    var byOutcome: [PickAccuracy] = []
    /// 내 팀 경기에서의 경기당 평균 지수 차이. 표본이 적으면 nil
    var fanBias: (bias: Int, n: Int)?
    var recent: [RecentResult] = []
    /// 정산 순서대로 쌓아 올린 지수. 경기마다 한 점이라 첫 경기부터 선이 그려진다.
    var curve: [Int] = []
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
    /// 0~1. 목표를 모르면 0 — 진행도를 지어내지 않는다.
    var closeness: Double {
        guard let target, target > 0 else { return 0 }
        return min(1, Double(progress) / Double(target))
    }
}
