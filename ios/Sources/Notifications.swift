import Foundation
import UserNotifications

/// 알림.
///
/// 지금은 기기 안에서 예약하는 로컬 알림만 쓴다. 서버 푸시(APNs)는 키와 발송 경로가
/// 준비되면 붙인다 — 예측 마감처럼 시각이 이미 정해진 건 로컬로 충분하고,
/// 정산·랭킹 발표처럼 서버만 아는 건 푸시가 필요하다.
@MainActor
enum Notifications {
    /// 마감 몇 분 전에 알릴지
    private static let lockLeadMinutes = 15

    static func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// 예측하지 않은 경기의 마감 임박 알림을 예약한다.
    /// 이미 예측했거나 지난 경기는 건너뛴다.
    static func scheduleLockReminders(fixtures: [Fixture], predicted: Set<Int>, teamName: (Int) -> String) async {
        let center = UNUserNotificationCenter.current()
        // 예측을 하거나 경기가 지나면 예약이 어긋나므로 매번 다시 깐다
        center.removePendingNotificationRequests(withIdentifiers: await pendingIds())

        for f in fixtures where !predicted.contains(f.id) {
            let fireAt = f.lockAt.addingTimeInterval(-Double(lockLeadMinutes) * 60)
            guard fireAt > .now else { continue }

            let content = UNMutableNotificationContent()
            content.title = "곧 마감돼요"
            content.body = "\(teamName(f.homeTeamId)) vs \(teamName(f.awayTeamId)) · \(lockLeadMinutes)분 뒤 예측이 닫혀요"
            content.sound = .default

            let trigger = UNCalendarNotificationTrigger(
                dateMatching: Calendar.current.dateComponents(
                    [.year, .month, .day, .hour, .minute], from: fireAt),
                repeats: false)

            try? await center.add(UNNotificationRequest(
                identifier: "lock-\(f.id)", content: content, trigger: trigger))
        }
    }

    private static func pendingIds() async -> [String] {
        await UNUserNotificationCenter.current().pendingNotificationRequests()
            .map(\.identifier).filter { $0.hasPrefix("lock-") }
    }
}
