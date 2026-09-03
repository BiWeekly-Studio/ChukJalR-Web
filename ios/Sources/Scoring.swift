import Foundation

/// 축잘알 점수 엔진 — 기술 명세 2장. 웹 `src/lib/scoring.ts` 와 같은 공식이다.
///
/// 여기 계산은 "미리보기" 용도다. 실제 지수·포인트는 서버 정산이 진실의 원천이며,
/// 결과가 오면 서버 값으로 덮어쓴다 (명세 11.1).
/// 두 클라이언트가 다른 숫자를 보여주면 안 되므로 상수는 웹과 반드시 같아야 한다.
enum Outcome: String, CaseIterable, Codable {
    case home = "HOME", draw = "DRAW", away = "AWAY"
    var index: Int { Outcome.allCases.firstIndex(of: self)! }
}

enum Confidence: Int, CaseIterable, Codable {
    case hunch = 1, fairly = 2, certain = 3
    var label: String {
        switch self {
        case .hunch:   return "감이 와요"
        case .fairly:  return "꽤 확신해요"
        case .certain: return "이건 확실해요"
        }
    }
}

typealias Distribution = [Double]   // 항상 [HOME, DRAW, AWAY] 순서

enum Scoring {
    /// 로그 스코어 배율. 경제 파라미터가 아니라 실력 측정 단위라 함부로 바꾸지 않는다.
    static let K = 40.0
    static let clampMin = -60.0
    static let clampMax = 90.0
    static let participationPoints = 3

    /// 확신도 → 기준선에서 내 픽 쪽으로 이동하는 비율
    static let shift: [Confidence: Double] = [.hunch: 0.15, .fairly: 0.35, .certain: 0.6]

    /// 유저 확률분포. 확신도는 절대 확률이 아니라 기준선에서의 상대 이동이다.
    /// 이 설계 덕분에 "맞혔는데 점수가 깎이는" 경우가 생기지 않는다 (명세 2.3).
    static func userDistribution(_ q: Distribution, _ pick: Outcome, _ c: Confidence) -> Distribution {
        let i = pick.index
        var p = [0.0, 0.0, 0.0]
        p[i] = q[i] + shift[c]! * (1 - q[i])

        let rest = 1 - p[i]
        let otherSum = q.enumerated().reduce(0.0) { $1.offset == i ? $0 : $0 + $1.element }
        for j in 0..<3 where j != i { p[j] = rest * q[j] / otherSum }
        return p
    }

    /// Δ지수 = round(K · log2(p(실제) / q(실제))), clamp 적용 (명세 2.4)
    static func deltaRating(_ q: Distribution, _ pick: Outcome, _ c: Confidence, actual: Outcome) -> Int {
        let p = userDistribution(q, pick, c)
        let a = actual.index
        let raw = K * log2(p[a] / q[a])
        return Int(max(clampMin, min(clampMax, raw.rounded())))
    }

    /// 스트릭 보너스 = min(연속적중, 10) × 2 (명세 2.8)
    static func streakBonus(_ streak: Int) -> Int { min(max(streak, 0), 10) * 2 }

    struct Preview {
        let ifCorrect: Int
        let ifWrong: Int
        let pointsIfCorrect: Int
        let pointsIfWrong: Int
    }

    static func preview(_ q: Distribution, _ pick: Outcome, _ c: Confidence, streak: Int = 0) -> Preview {
        // 틀렸을 때 손해는 어떤 오답이든 같다 (명세 2.5) → 아무 오답이나 하나로 계산한다
        let wrong = Outcome.allCases[(pick.index + 1) % 3]
        let ifCorrect = deltaRating(q, pick, c, actual: pick)
        let ifWrong = deltaRating(q, pick, c, actual: wrong)
        return Preview(
            ifCorrect: ifCorrect,
            ifWrong: ifWrong,
            pointsIfCorrect: max(0, ifCorrect) + participationPoints + streakBonus(streak),
            pointsIfWrong: participationPoints)
    }
}

// MARK: - 레벨 · 티어

struct LevelState {
    let level: Int
    let into: Int
    let need: Int
    let progress: Double
}

enum Tier: String {
    case placement = "PLACEMENT", bronze = "BRONZE", silver = "SILVER", gold = "GOLD"
    case platinum = "PLATINUM", diamond = "DIAMOND", master = "MASTER", grandmaster = "GRANDMASTER"

    var label: String {
        switch self {
        case .placement: return "배치 중"
        case .bronze: return "브론즈"
        case .silver: return "실버"
        case .gold: return "골드"
        case .platinum: return "플래티넘"
        case .diamond: return "다이아몬드"
        case .master: return "마스터"
        case .grandmaster: return "그랜드마스터"
        }
    }
}

enum Progression {
    static let maxLevel = 50
    static let placementMatches = 20

    static func pointsForNextLevel(_ level: Int) -> Int { 100 + 25 * (level - 1) }

    /// 레벨 L 도달에 필요한 누적 포인트 = (L−1)(75 + 12.5L)
    static func cumulativePoints(_ level: Int) -> Int {
        Int((Double(level - 1) * (75 + 12.5 * Double(level))).rounded())
    }

    static func level(fromPoints points: Int) -> LevelState {
        var level = 1
        while level < maxLevel && cumulativePoints(level + 1) <= points { level += 1 }
        let base = cumulativePoints(level)
        let need = level >= maxLevel ? 0 : pointsForNextLevel(level)
        let into = points - base
        return LevelState(
            level: level, into: into, need: need,
            progress: need == 0 ? 1 : min(1, Double(into) / Double(need)))
    }

    /// 배치를 마쳤는데 아직 순위표에 오르지 않았으면 티어는 '없음'이다.
    /// 브론즈로 떨어뜨리면 실제로 받은 적 없는 등급을 보여주게 된다.
    static func tier(topPercent: Double?, settledMatches: Int) -> Tier? {
        if settledMatches < placementMatches { return .placement }
        guard let p = topPercent else { return nil }
        switch p {
        case ...1:  return .grandmaster
        case ...5:  return .master
        case ...15: return .diamond
        case ...30: return .platinum
        case ...50: return .gold
        case ...75: return .silver
        default:    return .bronze
        }
    }
}
