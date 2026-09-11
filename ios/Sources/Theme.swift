import SwiftUI

/// 디자인 토큰. 웹(styles.css :root)과 같은 값을 쓴다.
/// 한쪽만 고치면 두 플랫폼이 갈라지므로, 색을 바꿀 때는 반드시 양쪽을 함께 본다.
enum T {
    // 바탕과 글자
    static let paper      = DesignTokens.paper
    static let paper2     = DesignTokens.paper2
    static let card       = DesignTokens.card
    static let card2      = DesignTokens.card2
    static let ink        = DesignTokens.ink
    static let ink2       = DesignTokens.ink2
    static let ink3       = DesignTokens.ink3
    static let ink4       = DesignTokens.ink4
    static let line       = DesignTokens.line
    static let line2      = DesignTokens.line2
    static let lineStrong = DesignTokens.lineStrong

    // Matchday 네이비. 원본은 design/system/tokens.json.
    static let accent     = DesignTokens.accent
    static let accent2    = DesignTokens.accent2
    static let accentDeep = DesignTokens.accentDeep
    static let accentSoft = DesignTokens.accentSoft
    static let accentFill = DesignTokens.accentFill
    static let accentLine = DesignTokens.accentLine

    // 포인트·스트릭
    static let gold     = DesignTokens.gold
    static let goldInk  = DesignTokens.goldInk
    static let goldSoft = DesignTokens.goldSoft

    static let hot     = DesignTokens.hot
    static let win     = DesignTokens.win
    static let winSoft = DesignTokens.winSoft
    static let cool     = DesignTokens.cool
    static let coolSoft = DesignTokens.coolSoft

    static let gradAccent = LinearGradient(
        colors: [DesignTokens.accentDeep, DesignTokens.accent],
        startPoint: .topLeading, endPoint: .bottomTrailing)

    static let gradGold = LinearGradient(
        colors: [Color(hex: 0xAA780B), Color(hex: 0x986511)],
        startPoint: .topLeading, endPoint: .bottomTrailing)

    static let gradWin = LinearGradient(
        colors: [DesignTokens.win, DesignTokens.win],
        startPoint: .topLeading, endPoint: .bottomTrailing)

    /// 웹과 같은 가족을 쓴다. iOS 에는 이 폰트가 없어 Resources/Fonts 에 번들한다 —
    /// 안 하면 한글이 Apple SD Gothic Neo 로 떨어져 두 앱의 인상이 갈린다.
    ///
    /// Plex Sans KR 은 Bold(700) 이 최대라 .black/.heavy 도 Bold 로 떨어진다.
    /// 시스템 폰트처럼 900 을 기대하고 부르면 굵기 층이 뭉개지므로,
    /// 웹과 같이 700/600/500/400 네 단으로만 나눈다.
    private static func face(_ weight: Font.Weight) -> String {
        switch weight {
        case .black, .heavy, .bold: return "IBMPlexSansKR-Bold"
        case .semibold:             return "IBMPlexSansKR-SemiBold"
        case .medium:               return "IBMPlexSansKR-Medium"
        default:                    return "IBMPlexSansKR-Regular"
        }
    }

    static func display(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        .custom(face(weight), size: size)
    }
    static func body(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .custom(face(weight), size: size)
    }
    /// 숫자가 흔들리지 않게 고정폭으로 (웹의 font-variant-numeric: tabular-nums)
    static func num(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        .custom(face(weight), size: size).monospacedDigit()
    }

    /// 웹의 --spring. 게임 UI 는 감속 곡선이 성격을 결정한다.
    static let spring = Animation.spring(response: 0.38, dampingFraction: 0.62)
    static let ease   = Animation.easeOut(duration: 0.24)
}

/// Primary Matchday action, shared across onboarding and prediction controls.
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
            .opacity(configuration.isPressed ? 0.85 : 1)
            .offset(y: configuration.isPressed ? 2 : 0)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}
