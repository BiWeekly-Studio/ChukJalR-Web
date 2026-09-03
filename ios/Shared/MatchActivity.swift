import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// 경기 채팅방에 들어가 있는 동안 잠금화면·다이나믹 아일랜드에 띄우는 실황.
///
/// 앱을 닫아도 남아 있어야 하므로 Live Activity 로 만든다.
/// 정적인 값(팀 이름·킥오프)은 attributes 에, 바뀌는 값(점수·분)은 ContentState 에 둔다.
struct MatchActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var homeGoals: Int
        var awayGoals: Int
        /// 경과 분. 전반 45분이면 45. 아직 시작 전이면 nil
        var minute: Int?
        var status: Status
        /// 내가 이 경기에 건 예측이 지금 맞고 있는지 (없으면 nil)
        var myPickLeading: Bool?

        enum Status: String, Codable, Hashable {
            case scheduled, live, halftime, finished
            var label: String {
                switch self {
                case .scheduled: return "곧 시작"
                case .live:      return "진행 중"
                case .halftime:  return "하프타임"
                case .finished:  return "종료"
                }
            }
        }
    }

    let fixtureId: Int
    let homeName: String
    let awayName: String
    let homeAbbr: String
    let awayAbbr: String
    /// 내 예측 (없으면 nil)
    let myPick: String?
}
#endif
