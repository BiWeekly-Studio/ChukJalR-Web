import SwiftUI
struct LeagueNotification: Decodable, Identifiable {
    let id: Int
    let name: String
    let major: Bool
    let enabled: Bool
}
struct LeagueNotificationSettings: View {
    @EnvironmentObject var store: Store
    @State private var busy = false
    @State private var error = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("대회별 알림").font(T.display(14, .heavy))
            Text("켜둔 알림 종류를 선택한 대회에서만 받아요. 기본 대상은 메이저 8개 대회예요.").font(T.body(11)).foregroundStyle(T.ink3)
            Text("메이저 대회").font(T.body(12, .heavy))
            rows(true)
            DisclosureGroup("기타 대회") { rows(false) }
            if !error.isEmpty { Text(error).font(T.body(12)).foregroundStyle(.red) }
            if store.notificationLeagueError {
                Button("설정을 불러오지 못했어요 · 다시 시도") { Task { await store.scheduleReminders() } }
            }
        }.padding(.top, 16)
        .task { await store.scheduleReminders() }
    }
    private func rows(_ major: Bool) -> some View {
        ForEach(store.notificationLeagues.filter { $0.major == major }) { league in
            Toggle(league.name, isOn: Binding(get: { league.enabled }, set: { value in
                busy = true
                error = ""
                Task {
                    do {
                        store.notificationLeagues = try await SupabaseRepository().leagueNotifications(id: league.id, enabled: value)
                        await store.scheduleReminders()
                    } catch { self.error = "저장하지 못했어요. 다시 시도해 주세요." }
                    busy = false
                }
            })).font(T.body(13)).tint(T.accent).disabled(busy).padding(.vertical, 4)
        }
    }
}
