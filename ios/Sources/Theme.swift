import SwiftUI

/// 디자인 토큰. 웹(styles.css :root)과 같은 값을 쓴다.
/// 한쪽만 고치면 두 플랫폼이 갈라지므로, 색을 바꿀 때는 반드시 양쪽을 함께 본다.
enum T {
    // 바탕과 글자
    static let paper      = Color(hex: 0xF5F2EA)
    static let paper2     = Color(hex: 0xECE6D9)
    static let card       = Color(hex: 0xFFFFFF)
    static let card2      = Color(hex: 0xF4EFE4)
    static let ink        = Color(hex: 0x16140F)
    static let ink2       = Color(hex: 0x645D51)
    static let ink3       = Color(hex: 0x9C9385)
    static let ink4       = Color(hex: 0xBDB5A6)
    static let line       = Color(hex: 0xE7E0D3)
    static let line2      = Color(hex: 0xF0EBE0)
    static let lineStrong = Color(hex: 0xD8CFBE)

    // 키 컬러 — 단색이 아니라 인디고→바이올렛 그라데이션이 기본이다
    static let accent     = Color(hex: 0x2F57F2)
    static let accent2    = Color(hex: 0x7B46F0)
    static let accentDeep = Color(hex: 0x1B36AD)
    static let accentSoft = Color(hex: 0xE9EDFF)
    static let accentFill = Color(hex: 0xF0F3FF)
    static let accentLine = Color(hex: 0xC6D0FB)

    // 포인트·스트릭
    static let gold     = Color(hex: 0x8A5C05)
    static let goldInk  = Color(hex: 0xD98B0B)
    static let goldSoft = Color(hex: 0xFDF0D5)

    static let hot     = Color(hex: 0xFF5F2E)
    static let win     = Color(hex: 0x0FA968)
    static let winSoft = Color(hex: 0xE2F7ED)
    static let cool     = Color(hex: 0xD1492A)
    static let coolSoft = Color(hex: 0xFBE6DD)

    static let gradAccent = LinearGradient(
        colors: [Color(hex: 0x3A63FF), Color(hex: 0x7B46F0)],
        startPoint: .topLeading, endPoint: .bottomTrailing)

    static let gradGold = LinearGradient(
        colors: [Color(hex: 0xFFC02E), Color(hex: 0xFF7A1A)],
        startPoint: .topLeading, endPoint: .bottomTrailing)

    static let gradWin = LinearGradient(
        colors: [Color(hex: 0x22C97E), Color(hex: 0x0B8F57)],
        startPoint: .topLeading, endPoint: .bottomTrailing)

    /// 웹은 Gothic A1 900 을 쓴다. iOS 에는 그 폰트가 없어 시스템 폰트의 가장 굵은 단계를
    /// 쓴다 — 한글은 Apple SD Gothic Neo 로 떨어지고, 이 굵기에서 인상이 가장 가깝다.
    /// 완전히 맞추려면 Gothic A1 을 번들해야 한다.
    static func display(_ size: CGFloat, _ weight: Font.Weight = .black) -> Font {
        .system(size: size, weight: weight)
    }
    static func body(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }
    /// 숫자가 흔들리지 않게 고정폭으로 (웹의 font-variant-numeric: tabular-nums)
    static func num(_ size: CGFloat, _ weight: Font.Weight = .black) -> Font {
        .system(size: size, weight: weight).monospacedDigit()
    }

    /// 웹의 --spring. 게임 UI 는 감속 곡선이 성격을 결정한다.
    static let spring = Animation.spring(response: 0.38, dampingFraction: 0.62)
    static let ease   = Animation.easeOut(duration: 0.24)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue:  Double(hex & 0xFF) / 255,
            opacity: 1)
    }
}

/// 웹의 .cta — 눌리면 살짝 내려앉는 두꺼운 버튼
struct CTAStyle: ButtonStyle {
    var fill: AnyShapeStyle = AnyShapeStyle(T.gradAccent)
    var foreground: Color = .white
    var enabled: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(T.display(16, .heavy))
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(enabled ? fill : AnyShapeStyle(T.lineStrong), in: RoundedRectangle(cornerRadius: 16))
            .shadow(color: enabled ? T.accent.opacity(0.35) : .clear, radius: 12, y: 6)
            .offset(y: configuration.isPressed ? 2 : 0)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}
