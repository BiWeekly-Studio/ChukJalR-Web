import SwiftUI

/// 팀 엠블럼. 로고를 쓰고, 없거나 실패하면 팀 색 + 약어로 떨어진다.
/// 실패해도 자리와 색은 유지된다.
struct Crest: View {
    let team: Team
    var size: CGFloat = 28

    var body: some View {
        Group {
            if let urlString = team.logoUrl, let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFit()
                            .padding(size * 0.08)
                            .background(.white)
                    } else {
                        fallback
                    }
                }
            } else {
                fallback
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(.white, lineWidth: 2))
    }

    private var fallback: some View {
        Text(team.abbr)
            .font(T.display(size <= 30 ? 9 : size * 0.28, .black))
            .minimumScaleFactor(0.6).lineLimit(1)
            .foregroundStyle(Color(hex: team.colorHex))
            .frame(width: size, height: size)
            .background(Color(hex: team.tintHex))
    }
}

/// 두 팀의 엠블럼.
///
/// 로고가 둘 다 있을 때만 겹친다. 약어로 떨어진 상태에서 겹치면 글자가 잘려
/// 'ARS' 가 'AR' 로 보인다 — 팀을 잘못 읽게 만드는 건 디자인보다 나쁘다.
struct CrestPair: View {
    let home: Team
    let away: Team
    var size: CGFloat = 28

    private var canOverlap: Bool { home.logoUrl != nil && away.logoUrl != nil }

    var body: some View {
        HStack(spacing: canOverlap ? -size * 0.32 : 3) {
            Crest(team: home, size: size).zIndex(1)
            Crest(team: away, size: size)
        }
    }
}

/// 티어 칩. 등급마다 색이 확실히 달라야 한다. 티어가 없으면 아무것도 그리지 않는다.
struct TierChip: View {
    let tier: Tier?

    var body: some View {
        if let tier {
            Text(tier.label)
                .font(T.display(11, .heavy))
                .foregroundStyle(.white)
                .padding(.horizontal, 9).frame(height: 22)
                .background(gradient(tier), in: Capsule())
        }
    }

    private func gradient(_ t: Tier) -> LinearGradient {
        let pair: [UInt32]
        switch t {
        case .placement:   pair = [0xA49A89, 0x857C6D]
        case .bronze:      pair = [0xD08C53, 0xA35F2C]
        case .silver:      pair = [0xB9C2CC, 0x7F8B98]
        case .gold:        pair = [0xFFC02E, 0xFF7A1A]
        case .platinum:    pair = [0x56D6C4, 0x1F9E97]
        case .diamond:     pair = [0x64C8FF, 0x2F6BF2]
        case .master:      pair = [0xA06BFF, 0x6127E0]
        case .grandmaster: pair = [0xFF7AD1, 0xFF4D4D]
        }
        return LinearGradient(colors: pair.map { Color(hex: $0) },
                              startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

/// XP 트랙. 채워진 부분에 빛이 훑고 지나간다.
struct XPTrack: View {
    var progress: Double
    var height: CGFloat = 9
    @State private var shine = false

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(T.line2)
                Capsule().fill(T.gradAccent)
                    .frame(width: max(0, geo.size.width * progress))
                    .overlay(alignment: .leading) {
                        Capsule()
                            .fill(LinearGradient(colors: [.clear, .white.opacity(0.75), .clear],
                                                 startPoint: .leading, endPoint: .trailing))
                            .frame(width: geo.size.width * 0.35)
                            .offset(x: shine ? geo.size.width : -geo.size.width * 0.4)
                            .clipped()
                    }
                    .clipShape(Capsule())
            }
        }
        .frame(height: height)
        .onAppear {
            withAnimation(.linear(duration: 2.4).repeatForever(autoreverses: false)) { shine = true }
        }
    }
}

/// 오늘의 진행 링. 숫자만 있는 것보다 "채워야 할 것"이 눈에 남는다.
struct ProgressRing: View {
    let value: Int
    let total: Int
    var size: CGFloat = 44

    private var ratio: Double { total > 0 ? min(1, Double(value) / Double(total)) : 0 }
    private var done: Bool { total > 0 && value >= total }

    var body: some View {
        ZStack {
            Circle().stroke(T.line2, lineWidth: 5)
            Circle()
                .trim(from: 0, to: ratio)
                .stroke(done ? T.gradWin : T.gradAccent,
                        style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(T.spring, value: ratio)
            Text("\(value)/\(total)")
                .font(T.num(11))
                .foregroundStyle(done ? T.win : T.ink2)
        }
        .frame(width: size, height: size)
        .accessibilityLabel("오늘 \(total)경기 중 \(value)경기 예측함")
    }
}

/// 연속 적중. 3연승부터는 칩이 불타오른다.
struct StreakChip: View {
    let streak: Int
    @State private var flicker = false

    var body: some View {
        let hot = streak >= 3
        HStack(spacing: 4) {
            Image(systemName: "flame.fill")
                .font(.system(size: 12))
                .foregroundStyle(hot ? .white : T.ink3)
                .scaleEffect(hot && flicker ? 1.14 : 1)
                .rotationEffect(.degrees(hot && flicker ? -5 : 3))
            Text("\(streak)").font(T.num(13))
            Text("연속").font(T.body(11, .semibold))
        }
        .foregroundStyle(hot ? .white : T.ink2)
        .padding(.horizontal, 11).frame(height: 28)
        .background(hot ? AnyShapeStyle(T.gradGold) : AnyShapeStyle(T.card2), in: Capsule())
        .onAppear {
            guard hot else { return }
            withAnimation(.easeInOut(duration: 0.75).repeatForever(autoreverses: true)) { flicker = true }
        }
    }
}

/// 섹션 라벨 — 왼쪽에 짧은 색 막대
struct SectionLabel: View {
    let text: String
    var accent = false

    var body: some View {
        HStack(spacing: 7) {
            RoundedRectangle(cornerRadius: 2)
                .fill(accent ? AnyShapeStyle(T.gradAccent) : AnyShapeStyle(T.lineStrong))
                .frame(width: 3, height: 13)
            Text(text)
                .font(T.body(11, .heavy))
                .foregroundStyle(accent ? T.accent : T.ink3)
            Spacer()
        }
    }
}
