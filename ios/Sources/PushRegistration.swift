import UIKit
import UserNotifications

/// APNs 기기 토큰을 서버에 올린다.
///
/// 로컬 알림과 달리 푸시는 서버가 이 기기를 알아야 보낼 수 있다. 토큰은 앱을
/// 다시 깔거나 기기를 복원하면 바뀌므로, 받을 때마다 올려 덮어쓴다.
///
/// 시뮬레이터에서는 토큰이 오지 않는다 — 확인은 실기기에서 한다.
@MainActor
final class PushRegistration: NSObject {
    static let shared = PushRegistration()

    /// 권한이 있으면 등록을 건다. 권한이 없으면 아무것도 하지 않는다 —
    /// 등록만 해두고 알림을 못 띄우면 서버가 죽은 토큰에 계속 쏘게 된다.
    func registerIfAllowed() async {
        guard await Notifications.authorized else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// AppDelegate 가 받은 토큰을 넘겨준다
    func received(_ deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task {
            do { try await Supabase.shared.savePushToken(token) }
            catch {
                // 알림이 안 오는 것과 앱이 죽는 것은 다르다. 다음 실행에서 다시 시도한다.
                print("[축잘알] 푸시 토큰 등록 실패: \(error)")
            }
        }
    }
}

/// SwiftUI 앱에도 AppDelegate 가 필요하다 — 원격 알림 등록 결과는 여기로만 온다.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in PushRegistration.shared.received(deviceToken) }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // 시뮬레이터에서는 늘 실패한다. 로컬 알림은 그대로 동작한다.
        print("[축잘알] 원격 알림 등록 실패: \(error.localizedDescription)")
    }
}
