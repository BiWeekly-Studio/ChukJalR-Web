import Foundation
import UserNotifications

/// 알림 종류. 사용자가 각각 끌 수 있어야 한다 —
/// 마감 알림은 반갑지만 킥오프 알림은 성가신 사람이 있다.
enum NotificationKind: String, CaseIterable, Identifiable {
    case lock, kickoff, chat

    var id: String { rawValue }

    var title: String {
        switch self {
        case .lock:    return "예측 마감 임박"
        case .kickoff: return "경기 시작"
        case .chat:    return "채팅 열림"
        }
    }

    var detail: String {
        switch self {
        case .lock:    return "아직 예측하지 않은 경기가 닫히기 전에"
        case .kickoff: return "내가 예측한 경기가 곧 시작할 때"
        case .chat:    return "내 팀 경기의 채팅이 열릴 때"
        }
    }

    /// 몇 분 전에 알릴지
    var leadMinutes: Int {
        switch self {
        case .lock:    return 15   // 마감(킥오프 5분 전) 기준
        case .kickoff: return 10
        case .chat:    return 0    // 채팅이 열리는 순간(킥오프 1시간 전)
        }
    }

    /// 켜져 있는지. 기본은 전부 켬 — 권한을 준 사람은 받겠다는 뜻이다.
    var isOn: Bool {
        get { UserDefaults.standard.object(forKey: key) as? Bool ?? true }
        nonmutating set { UserDefaults.standard.set(newValue, forKey: key) }
    }
    private var key: String { "chukjalal.notify.\(rawValue)" }
}

/// 알림.
///
/// 전부 기기 안에서 예약하는 로컬 알림이다. 시각이 미리 정해진 것들이라 서버가
/// 필요 없다 — 마감도 킥오프도 채팅 개방도 일정에서 계산된다.
/// 정산 결과처럼 서버만 아는 것은 APNs 가 붙어야 한다 (아직 없음).
@MainActor
enum Notifications {
    /// iOS 는 앱당 예약을 64개까지만 들고 있고, 넘으면 조용히 버린다.
    /// 가까운 것부터 채우고 여유를 남긴다.
    private static let maxPending = 56

    static var authorized: Bool {
        get async {
            await UNUserNotificationCenter.current().notificationSettings()
                .authorizationStatus == .authorized
        }
    }

    /// 아직 물어본 적이 없는지. 물어본 뒤에는 설정 앱으로 안내해야 한다.
    static var canAsk: Bool {
        get async {
            await UNUserNotificationCenter.current().notificationSettings()
                .authorizationStatus == .notDetermined
        }
    }

    @discardableResult
    static func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// 예약을 통째로 다시 깐다.
    ///
    /// 예측을 하거나, 최애 팀을 바꾸거나, 일정이 갱신되면 기존 예약이 어긋난다.
    /// 증분으로 고치는 것보다 매번 새로 까는 편이 단순하고 어긋날 일이 없다.
    static func reschedule(
        fixtures: [Fixture],
        predicted: Set<Int>,
        isFavorite: (Fixture) -> Bool,
        teamName: (Int) -> String
    ) async {
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()
        guard await authorized else { return }

        var planned: [(at: Date, request: UNNotificationRequest)] = []

        for f in fixtures {
            let home = teamName(f.homeTeamId), away = teamName(f.awayTeamId)
            let match = "\(home) vs \(away)"

            if NotificationKind.lock.isOn, !predicted.contains(f.id) {
                let at = f.lockAt.addingTimeInterval(-Double(NotificationKind.lock.leadMinutes) * 60)
                planned.append((at, make(.lock, f, "곧 마감돼요",
                                         "\(match) · \(NotificationKind.lock.leadMinutes)분 뒤 예측이 닫혀요", at)))
            }
            if NotificationKind.kickoff.isOn, predicted.contains(f.id) {
                let at = f.kickoffAt.addingTimeInterval(-Double(NotificationKind.kickoff.leadMinutes) * 60)
                planned.append((at, make(.kickoff, f, "곧 시작해요",
                                         "\(match) · 채팅도 열려 있어요", at)))
            }
            if NotificationKind.chat.isOn, isFavorite(f) {
                let at = f.chatOpensAt
                planned.append((at, make(.chat, f, "채팅이 열렸어요",
                                         "\(match) · 같이 보면서 이야기해요", at)))
            }
        }

        // 이미 지난 것은 버리고, 가까운 순으로 상한까지만 건다
        for item in planned.filter({ $0.at > .now }).sorted(by: { $0.at < $1.at }).prefix(maxPending) {
            try? await center.add(item.request)
        }
    }

    private static func make(_ kind: NotificationKind, _ f: Fixture,
                             _ title: String, _ body: String, _ at: Date) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        // 알림을 누르면 그 경기로 들어가야 한다. 어느 경기인지 여기 실어 보낸다.
        content.userInfo = ["fixtureId": f.id, "kind": kind.rawValue]

        return UNNotificationRequest(
            identifier: "\(kind.rawValue)-\(f.id)",
            content: content,
            trigger: UNCalendarNotificationTrigger(
                dateMatching: Calendar.current.dateComponents(
                    [.year, .month, .day, .hour, .minute], from: at),
                repeats: false))
    }

    /// 예약된 알림 수. 설정 화면에서 "지금 n건 예약됨"을 보여주는 데 쓴다.
    static var pendingCount: Int {
        get async { await UNUserNotificationCenter.current().pendingNotificationRequests().count }
    }
}

/// 알림을 눌렀을 때 해당 경기로 보낸다.
///
/// 델리게이트는 앱이 뜨자마자 붙어 있어야 한다 — 알림으로 앱을 열면 SwiftUI 뷰가
/// 그려지기 전에 이 콜백이 먼저 온다.
final class NotificationRouter: NSObject, UNUserNotificationCenterDelegate {
    private let onOpen: @Sendable (Int) -> Void

    init(onOpen: @escaping @Sendable (Int) -> Void) {
        self.onOpen = onOpen
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                               didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        // 로컬 알림은 경기 id 를, 서버 푸시(정산 결과)는 예측 id 를 실어 보낸다.
        if let id = info["fixtureId"] as? Int {
            onOpen(id)
        } else if let predictionId = info["predictionId"] as? Int,
                  let fixtureId = try? await Repositories.current
                    .fixtureId(forPrediction: predictionId) {
            onOpen(fixtureId)
        }
    }

    /// 앱을 보고 있는 중에도 배너를 띄운다. 마감 임박은 지금 봐야 의미가 있다.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                               willPresent notification: UNNotification) async
        -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
