import SwiftUI

/// 숫자가 0에서 목표까지 굴러 올라간다. 게임 화면에서 숫자는 그냥 나타나면 안 된다.
///
/// View 가 Animatable 을 채택하면 SwiftUI 가 value 를 프레임마다 보간해 준다 —
/// 타이머를 돌리는 것보다 정확하고, 화면이 사라지면 알아서 멈춘다.
struct CountUp: View, Animatable {
    var value: Double
    var font: Font
    var format: (Double) -> String

    var animatableData: Double {
        get { value }
        set { value = newValue }
    }

    var body: some View { Text(format(value)).font(font) }
}

/// 정수 카운트업. 표시용이라 반올림해서 보여준다.
struct CountUpInt: View {
    let target: Int
    var font: Font = T.num(20, .heavy)
    var duration: Double = 0.9
    /// 숫자 앞뒤에 붙는 것(예: "%", "위")까지 여기서 만든다
    var format: (Int) -> String = { Fmt.comma($0) }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown: Double = 0

    var body: some View {
        CountUp(value: shown, font: font) { format(Int($0.rounded())) }
            .onAppear { run() }
            .onChange(of: target) { _ in run() }
    }

    private func run() {
        guard !reduceMotion else { shown = Double(target); return }
        // ease-out — 처음엔 빠르게, 끝에서 부드럽게 멎는다
        withAnimation(.easeOut(duration: duration)) { shown = Double(target) }
    }
}

/// 값이 늘어난 순간에만 켜지는 방아쇠.
///
/// 앱을 열자마자 축하가 터지면 안 되므로, 기준값을 잡기 전의 변화는 무시한다 —
/// 로그인 직후 기본값 1 에서 실제 레벨로 올라가는 건 '레벨업'이 아니다.
@MainActor
final class RiseTrigger: ObservableObject {
    @Published private(set) var fired = false
    private var baseline: Int?

    func observe(_ value: Int, ready: Bool, hold: Double = 3.2) {
        guard ready else { return }
        defer { baseline = value }
        guard let before = baseline else { return }   // 첫 값은 기준으로만 쓴다
        guard value > before else { return }
        fired = true
        Task {
            try? await Task.sleep(nanoseconds: UInt64(hold * 1_000_000_000))
            fired = false
        }
    }

    func dismiss() { fired = false }
}
