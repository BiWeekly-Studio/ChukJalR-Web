import SwiftUI

/// 예측을 확정한 순간 카드에서 터지는 색종이와 획득 점수.
///
/// 조각의 방향을 매번 무작위로 뽑으면 튄다. 부채꼴로 고정해 두고
/// 거리·회전·지연만 조각마다 다르게 준다 (웹 Burst.tsx 와 같은 값).
struct Burst: View {
    /// 이 값이 바뀔 때마다 한 번 재생된다. nil 이면 그리지 않는다.
    let seed: Int?
    let label: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// 재생 중에만 조각을 그린다. 늘 그려두고 투명도로만 감추면,
    /// 애니메이션이 시작되기 전 한 프레임 동안 색종이가 카드에 얹혀 보인다.
    @State private var playing = false
    @State private var fired = false

    private static let colors: [Color] = [
        Color(hex: 0x3A63FF), Color(hex: 0x7B46F0), Color(hex: 0xFFC02E),
        Color(hex: 0xFF7A1A), Color(hex: 0x22C97E), Color(hex: 0xFF5F2E),
    ]
    private static let count = 14

    private struct Piece {
        let dx: CGFloat, dy: CGFloat, rotation: Double, color: Color, delay: Double
    }

    private static let pieces: [Piece] = (0..<count).map { i in
        let angle = (-160 + (140 / Double(count - 1)) * Double(i)) * .pi / 180
        let dist = 62 + Double((i * 37) % 46)
        return Piece(
            dx: CGFloat(cos(angle) * dist),
            dy: CGFloat(sin(angle) * dist),
            rotation: Double((i * 97) % 2 == 1 ? 1 : -1) * (180 + Double((i * 53) % 240)),
            color: colors[i % colors.count],
            delay: Double(i % 5) * 0.022)
    }

    var body: some View {
        ZStack {
            if playing {
            ForEach(Array(Self.pieces.enumerated()), id: \.offset) { i, p in
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(p.color)
                    .frame(width: 7, height: 10)
                    .rotationEffect(.degrees(fired ? p.rotation : 0))
                    .offset(x: fired ? p.dx : 0, y: fired ? p.dy : 0)
                    .opacity(fired ? 0 : 1)
                    .animation(.easeOut(duration: 0.9).delay(p.delay), value: fired)
            }
            Text(label)
                .font(T.display(15, .heavy))
                .foregroundStyle(.white)
                .padding(.horizontal, 13).padding(.vertical, 7)
                .background(T.gradAccent, in: Capsule())
                .shadow(color: T.accent.opacity(0.45), radius: 12, y: 4)
                .scaleEffect(fired ? 1 : 0.6)
                .opacity(fired ? 1 : 0)
                .offset(y: fired ? -10 : 0)
                .animation(.spring(response: 0.42, dampingFraction: 0.6), value: fired)
            }
        }
        .allowsHitTesting(false)
        .onChange(of: seed) { _ in play() }
        .onAppear { play() }
    }

    private func play() {
        // 모션을 끈 사용자에게는 아무것도 터뜨리지 않는다.
        // 정지 화면으로 남으면 색종이가 화면에 눌어붙은 것처럼 보인다.
        guard seed != nil, !reduceMotion else { return }
        fired = false
        playing = true
        Task {
            try? await Task.sleep(nanoseconds: 16_000_000)
            fired = true
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            playing = false
            fired = false
        }
    }
}
