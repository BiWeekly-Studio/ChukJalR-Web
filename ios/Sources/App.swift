import SwiftUI

@main
struct ChukjalalApp: App {
    @StateObject private var auth = Auth()
    @StateObject private var store = Store()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(store)
                .task { await auth.restore() }
        }
    }
}

/// 로그인 이후. 온보딩을 안 마쳤으면 거기부터 보낸다.
struct SignedInView: View {
    @EnvironmentObject var store: Store

    var body: some View {
        if !store.ready {
            VStack { PlateLogo(width: 190) }
                .frame(maxWidth: .infinity, maxHeight: .infinity).background(T.paper)
        } else if !store.me.onboarded {
            OnboardingView()
        } else {
            HomeView()
        }
    }
}

/// 하단 탭. 채팅은 별도 탭이 아니다 — 경기에 들어가야 나온다.
struct HomeView: View {
    @EnvironmentObject var store: Store
    @State private var tab = 0

    var body: some View {
        VStack(spacing: 0) {
            if !store.ready {
                VStack { PlateLogo(width: 190) }
                    .frame(maxWidth: .infinity, maxHeight: .infinity).background(T.paper)
            } else {
                switch tab {
                case 0: PredictView()
                case 1: RankingView()
                case 2: ProfileView()
                default:
                    VStack { Text("준비 중").font(T.display(15, .heavy)).foregroundStyle(T.ink3) }
                        .frame(maxWidth: .infinity, maxHeight: .infinity).background(T.paper)
                }
            }
            TabBar(selection: $tab)
        }
        .background(T.paper)
        .ignoresSafeArea(.keyboard)
    }
}

struct TabBar: View {
    @Binding var selection: Int
    private let items = [("예측", "list.bullet"), ("랭킹", "chart.bar.fill"), ("나", "person.fill")]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                Button {
                    Haptics.tap()
                    withAnimation(T.spring) { selection = i }
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: item.1).font(.system(size: 17, weight: selection == i ? .bold : .regular))
                            .frame(width: 46, height: 27)
                            .background(selection == i ? T.accentSoft : .clear, in: Capsule())
                        Text(item.0).font(T.body(10, selection == i ? .heavy : .semibold))
                    }
                    .foregroundStyle(selection == i ? T.accent : T.ink3)
                    .frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12).padding(.top, 8)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Rectangle().fill(T.line).frame(height: 1) }
    }
}

struct RootView: View {
    @EnvironmentObject var auth: Auth
    @EnvironmentObject var store: Store

    var body: some View {
        switch auth.state {
        case .loading:
            // 세션 확인 전에는 브랜드만 보여준다. 앱이 뭔지 모른 채 빈 화면을 보지 않게.
            VStack { PlateLogo(width: 190) }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(T.paper)
        case .signedOut:
            LoginView()
        case .signedIn:
            // 로그인한 뒤에 내 데이터를 받는다. 그 전에는 아무 숫자도 그리지 않는다.
            SignedInView().task { await store.load() }
        }
    }
}

/// 화면들은 이 다음 단계에서 옮긴다. 지금은 로그인이 통했는지만 확인한다.
struct HomePlaceholder: View {
    @EnvironmentObject var auth: Auth
    var body: some View {
        VStack(spacing: 14) {
            Wordmark(size: 24)
            Text("로그인됨").font(T.display(15, .heavy)).foregroundStyle(T.ink2)
            Button("로그아웃", action: auth.signOut)
                .font(T.body(13, .semibold))
                .foregroundStyle(T.accent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(T.paper)
    }
}
