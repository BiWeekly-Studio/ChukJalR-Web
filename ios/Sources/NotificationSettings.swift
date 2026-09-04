import SwiftUI

/// 알림 설정. '나' 탭에 들어간다.
///
/// 권한 상태에 따라 세 모습이다 — 아직 안 물어봤으면 켜기 버튼, 거부했으면 설정 앱
/// 안내, 허용했으면 종류별 토글. 거부한 사람에게 토글만 보여주면 켜도 안 온다.
struct NotificationSettingsCard: View {
    @EnvironmentObject var store: Store

    @State private var authorized = false
    @State private var canAsk = true
    @State private var pending = 0
    /// 토글이 UserDefaults 를 직접 읽으므로 뷰를 다시 그리려면 방아쇠가 필요하다
    @State private var revision = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("알림").font(T.display(14, .heavy))
                Spacer()
                if authorized, pending > 0 {
                    Text("\(pending)건 예약됨").font(T.body(11)).foregroundStyle(T.ink3)
                }
            }

            if authorized {
                VStack(spacing: 0) {
                    ForEach(NotificationKind.allCases) { kind in
                        toggle(kind)
                        if kind != NotificationKind.allCases.last {
                            Divider().overlay(T.line2)
                        }
                    }
                }
                .padding(.top, 6)
            } else if canAsk {
                Text("예측 마감과 경기 시작을 놓치지 않게 알려드릴게요.")
                    .font(T.body(12)).foregroundStyle(T.ink3).padding(.top, 8)
                Button {
                    Task {
                        await Notifications.requestPermission()
                        await refresh()
                        await store.scheduleReminders()
                        await refresh()
                    }
                } label: {
                    Text("알림 켜기")
                        .font(T.display(13, .heavy)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(T.gradAccent, in: RoundedRectangle(cornerRadius: 12))
                }
                .padding(.top, 12)
            } else {
                Text("알림이 꺼져 있어요. 기기 설정에서 켤 수 있어요.")
                    .font(T.body(12)).foregroundStyle(T.ink3).padding(.top, 8)
                Button {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Text("설정 열기")
                        .font(T.body(13, .heavy)).foregroundStyle(T.ink2)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(T.card2, in: RoundedRectangle(cornerRadius: 12))
                }
                .padding(.top, 12)
            }
        }
        .padding(EdgeInsets(top: 14, leading: 16, bottom: 16, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(T.card, in: RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.08), radius: 12, y: 5)
        .task { await refresh() }
    }

    private func toggle(_ kind: NotificationKind) -> some View {
        // revision 을 읽어야 토글 후 다시 그려진다
        let on = Binding(
            get: { _ = revision; return kind.isOn },
            set: { newValue in
                kind.isOn = newValue
                revision += 1
                Task { await store.scheduleReminders(); await refresh() }
            })

        return Toggle(isOn: on) {
            VStack(alignment: .leading, spacing: 2) {
                Text(kind.title).font(T.body(13, .heavy))
                Text(kind.detail).font(T.body(11)).foregroundStyle(T.ink3)
            }
        }
        .tint(T.accent)
        .padding(.vertical, 10)
    }

    private func refresh() async {
        authorized = await Notifications.authorized
        canAsk = await Notifications.canAsk
        pending = await Notifications.pendingCount
    }
}
