import SwiftUI

/// 레벨이 오른 순간에만 뜨는 축하 오버레이.
/// 앱을 켜자마자 터지면 안 되므로 RiseTrigger 가 첫 값을 기준으로만 쓴다.
struct LevelUpOverlay: View {
    @EnvironmentObject var store: Store
    @StateObject private var rise = RiseTrigger()
    @State private var open = false

    var body: some View {
        ZStack {
            if open {
                Color.black.opacity(0.55).ignoresSafeArea()
                    .onTapGesture { close() }
                box.transition(.scale(scale: 0.9).combined(with: .opacity))
            }
        }
        .animation(T.spring, value: open)
        .onChange(of: store.level.level) { level in
            rise.observe(level, ready: store.ready)
        }
        .onChange(of: store.ready) { ready in
            // 로그인 직후 기본값에서 실제 값으로 올라가는 건 레벨업이 아니다.
            // 데이터가 다 온 시점의 레벨을 기준으로 삼는다.
            if ready { rise.observe(store.level.level, ready: true) }
        }
        .onChange(of: rise.fired) { fired in
            guard fired else { return }
            open = true
            Haptics.success()
        }
    }

    private func close() { open = false; rise.dismiss() }

    private var box: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle()
                    .fill(T.gradAccent)
                    .frame(width: 96, height: 96)
                    .shadow(color: T.accent.opacity(0.5), radius: 22, y: 8)
                Text("\(store.level.level)")
                    .font(T.num(38, .heavy)).foregroundStyle(.white)
                Burst(seed: store.level.level, label: "LEVEL UP")
            }
            .frame(height: 130)

            Text("레벨 업!").font(T.display(22, .heavy)).padding(.top, 6)
            Text("Lv.\(store.level.level)\(tierSuffix) 달성. 계속 이 감으로 가요.")
                .font(T.body(13)).foregroundStyle(T.ink3)
                .multilineTextAlignment(.center)
                .padding(.top, 8)

            Button(action: close) {
                Text("좋아요")
                    .font(T.display(15, .heavy)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(T.gradAccent, in: RoundedRectangle(cornerRadius: 15))
            }
            .padding(.top, 18)
        }
        .padding(EdgeInsets(top: 22, leading: 22, bottom: 22, trailing: 22))
        .background(T.paper, in: RoundedRectangle(cornerRadius: 26))
        .padding(.horizontal, 36)
    }

    private var tierSuffix: String {
        store.tier.map { " \($0.label)" } ?? ""
    }
}
