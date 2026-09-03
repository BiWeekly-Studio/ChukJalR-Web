import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// 경기 실황을 잠금화면·다이나믹 아일랜드에 띄운다.
///
/// 채팅방에 들어가면 시작하고, 나가도 경기가 끝날 때까지 남긴다 —
/// 앱을 닫아도 점수를 보는 게 이 기능의 존재 이유다.
///
/// 값 갱신은 두 경로가 있다:
///   - 앱이 떠 있을 때: Realtime 으로 받은 점수를 update() 로 반영
///   - 앱이 꺼져 있을 때: APNs Live Activity 푸시 (서버가 보낸다)
@MainActor
enum LiveScore {
    /// 지금 이 기기에서 Live Activity 를 띄울 수 있는지
    static var available: Bool {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
        return false
        #else
        return false
        #endif
    }

    #if canImport(ActivityKit)
    @available(iOS 16.2, *)
    private static var running: [Int: Activity<MatchActivityAttributes>] {
        Dictionary(uniqueKeysWithValues:
            Activity<MatchActivityAttributes>.activities.map { ($0.attributes.fixtureId, $0) })
    }

    /// 채팅방 진입 시 시작. 이미 떠 있으면 아무것도 하지 않는다.
    @available(iOS 16.2, *)
    static func start(fixture: Fixture, home: Team, away: Team, myPick: Outcome?) {
        guard available, running[fixture.id] == nil else { return }

        let attributes = MatchActivityAttributes(
            fixtureId: fixture.id,
            homeName: home.name, awayName: away.name,
            homeAbbr: home.abbr, awayAbbr: away.abbr,
            myPick: myPick.map { pick in
                switch pick {
                case .home: return "\(home.name) 승"
                case .draw: return "무승부"
                case .away: return "\(away.name) 승"
                }
            })

        // 아직 점수가 없으면 0:0 이 아니라 '곧 시작' 상태로 띄운다
        let state = MatchActivityAttributes.ContentState(
            homeGoals: fixture.homeGoals ?? 0,
            awayGoals: fixture.awayGoals ?? 0,
            minute: nil,
            status: fixture.state == "LIVE" ? .live : .scheduled,
            myPickLeading: nil)

        do {
            _ = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: fixture.kickoffAt.addingTimeInterval(4 * 3600)),
                // 서버가 푸시로 갱신하려면 토큰이 필요하다
                pushType: .token)
        } catch {
            // 사용자가 Live Activity 를 꺼두었을 수 있다. 앱 동작에는 영향이 없다.
            print("[축잘알] Live Activity 시작 실패: \(error)")
        }
    }

    /// 앱이 떠 있는 동안의 갱신
    @available(iOS 16.2, *)
    static func update(fixtureId: Int, home: Int, away: Int, minute: Int?,
                       status: MatchActivityAttributes.ContentState.Status,
                       myPickLeading: Bool?) async {
        guard let activity = running[fixtureId] else { return }
        let state = MatchActivityAttributes.ContentState(
            homeGoals: home, awayGoals: away, minute: minute,
            status: status, myPickLeading: myPickLeading)
        await activity.update(.init(state: state, staleDate: nil))
    }

    /// 경기가 끝나면 결과를 잠깐 남기고 닫는다
    @available(iOS 16.2, *)
    static func end(fixtureId: Int, home: Int, away: Int, myPickLeading: Bool?) async {
        guard let activity = running[fixtureId] else { return }
        let final = MatchActivityAttributes.ContentState(
            homeGoals: home, awayGoals: away, minute: nil,
            status: .finished, myPickLeading: myPickLeading)
        await activity.end(.init(state: final, staleDate: nil), dismissalPolicy: .after(.now + 1800))
    }
    #endif
}
