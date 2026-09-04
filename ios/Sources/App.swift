import SwiftUI

@main
struct ChukjalalApp: App {
    @StateObject private var auth = Auth()
    @StateObject private var store = Store()
    @StateObject private var router = Router()
    /// 원격 알림 등록 결과는 AppDelegate 로만 온다
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    /// 알림 델리게이트는 화면이 그려지기 전에 붙어 있어야 한다 — 알림으로 앱을
    /// 열면 SwiftUI 보다 콜백이 먼저 온다.
    @State private var notifications: NotificationRouter?

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(store)
                .environmentObject(router)
                .task {
                    if notifications == nil {
                        let r = router
                        notifications = NotificationRouter { id in
                            Task { @MainActor in r.open(fixtureId: id) }
                        }
                    }
                    await auth.restore()
                    await PushRegistration.shared.registerIfAllowed()
                }
                .onOpenURL { router.handle($0) }
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
        } else if store.loadFailed {
            // 못 받은 것과 없는 것은 다르다. 여기서 온보딩으로 보내면 이미 가입한
            // 사람이 다시 가입하려 든다.
            LoadFailedView()
        } else if !store.me.onboarded {
            OnboardingView()
        } else {
            HomeView()
        }
    }
}

/// 데이터를 못 받았을 때. 다시 시도하는 것 말고 할 수 있는 게 없으므로 그것만 둔다.
struct LoadFailedView: View {
    @EnvironmentObject var store: Store
    @State private var retrying = false

    var body: some View {
        VStack(spacing: 14) {
            PlateLogo(width: 160)
            Text("데이터를 불러오지 못했어요")
                .font(T.display(16, .heavy)).padding(.top, 6)
            Text(store.error ?? "잠시 후 다시 시도해 주세요.")
                .font(T.body(12)).foregroundStyle(T.ink3)
                .multilineTextAlignment(.center).padding(.horizontal, 40)
            Button {
                retrying = true
                Task { await store.load(); retrying = false }
            } label: {
                Text(retrying ? "불러오는 중…" : "다시 시도")
                    .font(T.display(14, .heavy)).foregroundStyle(.white)
                    .padding(.horizontal, 28).frame(height: 46)
                    .background(T.gradAccent, in: Capsule())
            }
            .disabled(retrying)
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(T.paper)
    }
}

/// 하단 탭. 채팅은 별도 탭이 아니다 — 경기에 들어가야 나온다.
struct HomeView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var router: Router
    @State private var showTour = !Tour.seen

    var body: some View {
        VStack(spacing: 0) {
            if !store.ready {
                VStack { PlateLogo(width: 190) }
                    .frame(maxWidth: .infinity, maxHeight: .infinity).background(T.paper)
            } else {
                switch router.tab {
                case 0: PredictView()
                case 1: RankingView()
                case 2: ProfileView()
                default:
                    VStack { Text("준비 중").font(T.display(15, .heavy)).foregroundStyle(T.ink3) }
                        .frame(maxWidth: .infinity, maxHeight: .infinity).background(T.paper)
                }
            }
            TabBar(selection: $router.tab).tour("nav")
        }
        .background(T.paper)
        .ignoresSafeArea(.keyboard)
        .overlayPreferenceValue(TourAnchorKey.self) { anchors in
            // 안전영역까지 덮어야 대상 좌표와 그리는 좌표가 같은 공간이 된다
            GeometryReader { space in
                // 코치마크는 첫 실행에, 예측 탭에서만. 화면 전체를 덮으므로
                // 온보딩이 끝나고 데이터가 다 온 뒤에 띄운다.
                if showTour, router.tab == 0, store.ready {
                    Coachmarks(anchors: anchors, space: space) { showTour = false }
                }
            }
            .ignoresSafeArea()
        }
        .overlay { LevelUpOverlay() }
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
