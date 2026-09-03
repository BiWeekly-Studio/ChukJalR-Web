import SwiftUI

/// 홈 화면 위에서 진행하는 첫 실행 안내.
///
/// 별도 튜토리얼 화면을 두지 않는 이유: 축잘알의 규칙은 '보기를 누르면 확신도가 열린다'는
/// 손의 동작이라, 설명을 읽는 것보다 실제 카드에서 한 번 눌러보는 편이 빠르다.
/// 그래서 진짜 화면을 그대로 두고 그 위에 구멍을 뚫는다 — 강조된 부분은 실제로 눌린다.
///
/// 대상은 .tour("키") 로 표시한다. 대상이 없으면(예: 오늘 경기가 없어 카드가 하나도
/// 없을 때) 그 단계는 조용히 건너뛴다.

// MARK: - 대상 표시

struct TourAnchorKey: PreferenceKey {
    static var defaultValue: [String: Anchor<CGRect>] = [:]
    static func reduce(value: inout [String: Anchor<CGRect>],
                       nextValue: () -> [String: Anchor<CGRect>]) {
        value.merge(nextValue()) { first, _ in first }
    }
}

extension View {
    /// 코치마크가 이 뷰를 찾을 수 있게 표시한다
    func tour(_ key: String) -> some View {
        anchorPreference(key: TourAnchorKey.self, value: .bounds) { [key: $0] }
    }
    /// 조건부 표시 — 첫 번째 카드에만 붙이는 식으로 쓴다
    @ViewBuilder func tour(_ key: String, when condition: Bool) -> some View {
        if condition { self.tour(key) } else { self }
    }
}

// MARK: - 단계

struct TourStep {
    let key: String
    let title: String
    let body: String
    /// 이 대상이 화면에 나타나면 자동으로 다음 단계로 넘어간다 (사용자가 실제로 눌렀다는 뜻)
    var waitFor: String?
    var pad: CGFloat = 8
}

enum Tour {
    static let steps: [TourStep] = [
        .init(key: "hud",
              title: "여기가 내 성적표예요",
              body: "레벨과 XP, 그리고 오늘 몇 경기를 예측했는지가 여기 모입니다."),
        .init(key: "options",
              title: "이길 팀을 고르세요",
              body: "홈 승 · 무승부 · 원정 승 중 하나. 지금 한번 눌러보세요.",
              waitFor: "confidence", pad: 6),
        .init(key: "confidence",
              title: "얼마나 확신하세요?",
              body: "확신이 클수록 맞혔을 때 많이 얻고, 틀렸을 때 많이 잃어요. 여기가 축잘알의 핵심입니다.",
              pad: 6),
        .init(key: "nav",
              title: "매일 아침 8시에 순위 확정",
              body: "20경기를 채우면 순위표에 이름이 올라가요."),
    ]

    private static let seenKey = "chukjalal.tutorial.v1"
    static var seen: Bool {
        get { UserDefaults.standard.bool(forKey: seenKey) }
        set { UserDefaults.standard.set(newValue, forKey: seenKey) }
    }
}

// MARK: - 오버레이

struct Coachmarks: View {
    /// 지금 화면에 있는 대상들. HomeView 가 preference 로 모아서 넘겨준다.
    let anchors: [String: Anchor<CGRect>]
    let space: GeometryProxy
    let onDone: () -> Void

    @State private var index = 0
    /// 대상 좌표가 도착하기 전에는 시작하지 않는다.
    /// 첫 프레임의 anchors 는 비어 있어서, 그때 단계를 찾으면 "대상이 하나도 없다"로
    /// 오해하고 튜토리얼을 본 것으로 표시해 버린다.
    @State private var started = false

    private var step: TourStep? {
        index < Tour.steps.count ? Tour.steps[index] : nil
    }
    private var frame: CGRect? {
        guard let step, let anchor = anchors[step.key] else { return nil }
        return space[anchor].insetBy(dx: -step.pad, dy: -step.pad)
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            if started, let step, let hole = frame {
                mask(hole)
                ring(hole)
                tip(step, hole)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .onAppear { startIfReady() }
        .onChange(of: anchors.keys.sorted()) { _ in
            guard started else { startIfReady(); return }
            // 사용자가 실제로 눌러서 다음 대상이 나타나면 자동으로 넘어간다
            if let waitFor = step?.waitFor, anchors[waitFor] != nil { advance(from: index + 1) }
            // 대상이 사라졌으면(카드가 접혔다든지) 남은 단계로 넘긴다
            else if step != nil && frame == nil { advance(from: index) }
        }
    }

    /// 홈 화면의 기준점(hud)이 잡히면 그때 시작한다. 이 대상은 예측 화면에 늘 있으므로,
    /// 여기서 시작하면 나머지 단계의 좌표도 같이 도착해 있다.
    private func startIfReady() {
        guard !started, anchors[Tour.steps[0].key] != nil else { return }
        started = true
        advance(from: 0)
    }

    /// 대상이 있는 다음 단계로. 남은 게 없으면 끝낸다.
    private func advance(from: Int) {
        for i in from..<Tour.steps.count where anchors[Tour.steps[i].key] != nil {
            withAnimation(T.ease) { index = i }
            return
        }
        finish()
    }

    private func next() {
        Haptics.tap()
        advance(from: index + 1)
    }

    private func finish() {
        Tour.seen = true
        onDone()
    }

    // 구멍을 뺀 네 조각으로 화면을 덮는다. 구멍 안은 그대로 눌린다.
    //
    // 오버레이의 GeometryReader 가 안전영역까지 덮고 있어서(App.swift), 여기서 재는
    // 좌표와 그리는 좌표가 같은 공간이다. 한쪽만 ignoresSafeArea 를 걸면 구멍이
    // 상단 인셋만큼 밀려 엉뚱한 곳에 뚫린다.
    private func mask(_ hole: CGRect) -> some View {
        let w = space.size.width
        let h = space.size.height
        return ZStack(alignment: .topLeading) {
            panel(CGRect(x: 0, y: 0, width: w, height: max(0, hole.minY)))
            panel(CGRect(x: 0, y: hole.maxY, width: w, height: max(0, h - hole.maxY)))
            panel(CGRect(x: 0, y: hole.minY, width: max(0, hole.minX), height: hole.height))
            panel(CGRect(x: hole.maxX, y: hole.minY, width: max(0, w - hole.maxX), height: hole.height))
        }
    }

    private func panel(_ r: CGRect) -> some View {
        Color.black.opacity(0.62)
            .frame(width: r.width, height: r.height)
            .offset(x: r.minX, y: r.minY)
            .onTapGesture { next() }
    }

    private func ring(_ hole: CGRect) -> some View {
        RoundedRectangle(cornerRadius: 16)
            .strokeBorder(Color.white.opacity(0.9), lineWidth: 2)
            .frame(width: hole.width, height: hole.height)
            .offset(x: hole.minX, y: hole.minY)
            .allowsHitTesting(false)
    }

    private func tip(_ step: TourStep, _ hole: CGRect) -> some View {
        // 강조 영역 아래에 말풍선을 두되, 아래 공간이 부족하면 위로 올린다
        let h = space.size.height
        let below = hole.maxY + 14
        let placeBelow = h - below > 210

        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("\(index + 1) / \(Tour.steps.count)")
                    .font(T.display(10, .heavy)).foregroundStyle(.white)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(T.gradAccent, in: Capsule())
                Spacer()
                Button("건너뛰기", action: finish)
                    .font(T.body(11)).foregroundStyle(T.ink3)
            }
            Text(step.title).font(T.display(15, .heavy)).padding(.top, 10)
            Text(step.body)
                .font(T.body(13)).foregroundStyle(T.ink3)
                .lineSpacing(4).padding(.top, 6)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: next) {
                Text(index == Tour.steps.count - 1 ? "시작하기" : "다음")
                    .font(T.display(14, .heavy)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(T.gradAccent, in: RoundedRectangle(cornerRadius: 14))
            }
            .padding(.top, 14)
        }
        .padding(16)
        .background(T.paper, in: RoundedRectangle(cornerRadius: 20))
        .frame(width: min(320, space.size.width - 40))
        .offset(x: 20, y: placeBelow ? below : max(20, hole.minY - 14 - tipHeight))
        .transition(.opacity)
    }

    /// 위로 올릴 때 쓰는 어림 높이. 실측하려면 한 프레임 늦게 그려져 튄다.
    private var tipHeight: CGFloat { 196 }
}
