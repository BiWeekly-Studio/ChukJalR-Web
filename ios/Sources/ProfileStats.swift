import SwiftUI

/// 지수 추이 — 정산될 때마다 한 점씩 찍힌 선.
///
/// 하루 한 점(rating_history)이 아니라 경기마다 한 점이다. 첫 경기부터 선이 그려지고,
/// 어디서 꺾였는지가 보인다. 축 눈금은 그리지 않는다 — 절대값은 위 카드에 이미 있고,
/// 여기서 볼 것은 모양이다.
struct RatingCurve: View {
    let values: [Int]
    var height: CGFloat = 88

    private var low: Int { values.min() ?? 0 }
    private var high: Int { values.max() ?? 0 }
    /// 변동이 거의 없으면 선이 바닥에 눌린다. 최소 폭을 줘서 가운데로 띄운다.
    private var span: CGFloat { CGFloat(max(high - low, 20)) }

    var body: some View {
        GeometryReader { geo in
            let points = self.points(in: geo.size)
            ZStack {
                if points.count >= 2 {
                    area(points, in: geo.size)
                        .fill(LinearGradient(
                            colors: [T.accent.opacity(0.22), T.accent.opacity(0.02)],
                            startPoint: .top, endPoint: .bottom))
                    line(points)
                        .stroke(T.gradAccent, style: .init(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                    // 마지막 점만 찍는다. 지금 어디에 있는지가 제일 궁금하다.
                    Circle().fill(T.accent)
                        .frame(width: 8, height: 8)
                        .overlay(Circle().stroke(T.card, lineWidth: 2.5))
                        .position(points[points.count - 1])
                } else if let only = points.first {
                    Circle().fill(T.accent).frame(width: 8, height: 8).position(only)
                }
            }
        }
        .frame(height: height)
    }

    private func points(in size: CGSize) -> [CGPoint] {
        guard !values.isEmpty else { return [] }
        let inset: CGFloat = 6
        let usableH = size.height - inset * 2
        let mid = CGFloat(low + high) / 2
        return values.enumerated().map { i, v in
            let x = values.count == 1 ? size.width / 2
                : size.width * CGFloat(i) / CGFloat(values.count - 1)
            // 값을 중앙 기준으로 놓고 span 으로 나눈다 — 변동이 작아도 가운데에 머문다
            let t = 0.5 - (CGFloat(v) - mid) / span
            return CGPoint(x: x, y: inset + usableH * min(max(t, 0), 1))
        }
    }

    private func line(_ pts: [CGPoint]) -> Path {
        var p = Path()
        p.move(to: pts[0])
        for pt in pts.dropFirst() { p.addLine(to: pt) }
        return p
    }

    private func area(_ pts: [CGPoint], in size: CGSize) -> Path {
        var p = line(pts)
        p.addLine(to: CGPoint(x: pts[pts.count - 1].x, y: size.height))
        p.addLine(to: CGPoint(x: pts[0].x, y: size.height))
        p.closeSubpath()
        return p
    }
}

/// 통계 묶음 — 리그별 · 확신도 · 픽 성향 · 팬심을 한 카드에 담고 위에서 고른다.
///
/// 넷을 따로 세우면 정산이 없는 사람에게는 빈 상자가 넷이 된다. 하나로 묶으면
/// 빈 말도 한 번만 하면 되고, 쌓이고 나서는 서로 견주며 보게 된다.
struct StatTabs: View {
    @EnvironmentObject var store: Store
    let stats: MyStats
    /// 확신도는 표본이 얇으면 뜻이 없다
    let minCalibrationN: Int
    let minFanBiasN: Int

    enum Kind: String, CaseIterable {
        case league = "리그별"
        case calibration = "확신도"
        case pick = "픽 성향"
        case fan = "팬심"
    }

    @State private var kind: Kind = .league

    private var kinds: [Kind] {
        // 최애 팀이 없으면 팬심 칸은 아예 만들지 않는다 — 누를 수 없는 탭을 두지 않는다
        store.me.favoriteTeamIds.isEmpty ? [.league, .calibration, .pick] : Kind.allCases
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("통계").font(T.display(14, .heavy))

            if stats.settled == 0 {
                Text("경기가 정산되면 리그별 강약과 확신도 정확도, 어느 쪽에 잘 거는지가 여기 모입니다.")
                    .font(T.body(12)).foregroundStyle(T.ink3).lineSpacing(3)
                    .padding(.top, 10)
            } else {
                picker.padding(.top, 12)
                Group {
                    switch kind {
                    case .league:      league
                    case .calibration: calibration
                    case .pick:        pick
                    case .fan:         fan
                    }
                }
                .padding(.top, 14)
            }
        }
        .padding(EdgeInsets(top: 14, leading: 16, bottom: 16, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(T.card, in: RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.08), radius: 12, y: 5)
    }

    private var picker: some View {
        HStack(spacing: 4) {
            ForEach(kinds, id: \.self) { k in
                Button {
                    Haptics.tap()
                    withAnimation(T.ease) { kind = k }
                } label: {
                    Text(k.rawValue)
                        .font(T.body(12, kind == k ? .heavy : .semibold))
                        .foregroundStyle(kind == k ? .white : T.ink3)
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(kind == k ? AnyShapeStyle(T.gradAccent) : AnyShapeStyle(T.card2),
                                    in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: 리그별

    private var league: some View {
        VStack(spacing: 10) {
            ForEach(store.leagues) { l in
                let row = stats.byLeague.first { $0.leagueId == l.id }
                HStack(spacing: 11) {
                    Text(l.short).font(T.body(12)).foregroundStyle(T.ink3)
                        .frame(width: 60, alignment: .leading)
                    Bar(value: row?.accuracy ?? 0)
                    Text(row.map { "\(Int(($0.accuracy * 100).rounded()))%" } ?? "—")
                        .font(T.num(14)).frame(width: 44, alignment: .trailing)
                    Text(row.map { "\($0.n)건" } ?? "")
                        .font(T.body(11)).foregroundStyle(T.ink3)
                        .frame(width: 30, alignment: .trailing)
                }
            }
        }
    }

    // MARK: 확신도

    private var calibration: some View {
        let usable = stats.calibration.filter { $0.n >= minCalibrationN }
        return VStack(alignment: .leading, spacing: 9) {
            if usable.isEmpty {
                Text("확신도마다 \(minCalibrationN)건씩은 쌓여야 의미가 생겨요. 그때부터 확신을 부풀리고 있는지 알려드릴게요.")
                    .font(T.body(12)).foregroundStyle(T.ink3).lineSpacing(3)
            } else {
                ForEach(stats.calibration) { c in
                    let enough = c.n >= minCalibrationN
                    HStack(spacing: 11) {
                        Text(c.confidence.label).font(T.body(12, .semibold))
                            .frame(width: 84, alignment: .leading)
                        Bar(value: enough ? c.actual : 0,
                            tint: c.actual - c.expected < -0.08 ? AnyShapeStyle(T.ink4) : nil)
                        Text(enough ? "\(Int((c.actual * 100).rounded()))%" : "—")
                            .font(T.num(14)).frame(width: 40, alignment: .trailing)
                        Text(enough ? "건 값 \(Int((c.expected * 100).rounded()))%" : "\(c.n)건")
                            .font(T.body(11)).foregroundStyle(T.ink3)
                            .frame(width: 62, alignment: .trailing)
                    }
                }
            }
        }
    }

    // MARK: 픽 성향

    private var pick: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Outcome.allCases, id: \.self) { o in
                let row = stats.byOutcome.first { $0.pick == o }
                HStack(spacing: 11) {
                    Text(label(o)).font(T.body(12)).foregroundStyle(T.ink3)
                        .frame(width: 60, alignment: .leading)
                    Bar(value: row?.accuracy ?? 0)
                    Text(row.map { "\(Int(($0.accuracy * 100).rounded()))%" } ?? "—")
                        .font(T.num(14)).frame(width: 44, alignment: .trailing)
                    Text(row.map { "\($0.n)건" } ?? "")
                        .font(T.body(11)).foregroundStyle(T.ink3)
                        .frame(width: 30, alignment: .trailing)
                }
            }
            if let note = pickNote {
                Text(note).font(T.body(11)).foregroundStyle(T.ink3).lineSpacing(3).padding(.top, 2)
            }
        }
    }

    private func label(_ o: Outcome) -> String {
        switch o {
        case .home: return "홈 승"
        case .draw: return "무승부"
        case .away: return "원정 승"
        }
    }

    /// 한쪽으로 쏠려 있으면 그 사실만 말한다. 어느 쪽이 옳다고 하지 않는다 —
    /// 홈에만 거는 게 틀린 전략은 아니고, 본인이 모르는 게 문제다.
    private var pickNote: String? {
        let total = stats.byOutcome.reduce(0) { $0 + $1.n }
        guard total >= 10, let top = stats.byOutcome.max(by: { $0.n < $1.n }) else { return nil }
        let share = Double(top.n) / Double(total)
        guard share >= 0.6 else { return nil }
        return "예측의 \(Int((share * 100).rounded()))%가 \(label(top.pick))이에요."
    }

    // MARK: 팬심

    @ViewBuilder private var fan: some View {
        if let fb = stats.fanBias, fb.n >= minFanBiasN {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(fb.bias > 0 ? "+\(fb.bias)" : "−\(abs(fb.bias))")
                        .font(T.num(26))
                        .foregroundStyle(fb.bias < 0 ? T.cool : T.win)
                    Text("경기당 평균 지수").font(T.body(11)).foregroundStyle(T.ink3)
                }
                Text(fb.bias < 0
                     ? "내 팀 경기에서 평균 \(abs(fb.bias))점을 손해 보고 있어요. 다른 경기에서는 잘 보시는데요."
                     : "내 팀 경기에서 오히려 더 잘 맞히는 드문 유형이에요.")
                    .font(T.body(12)).foregroundStyle(T.ink3).lineSpacing(3)
            }
        } else {
            Text("내 팀 경기가 \(minFanBiasN)건 쌓이면, 팬심이 예측을 흐리는지 알려드려요.")
                .font(T.body(12)).foregroundStyle(T.ink3).lineSpacing(3)
        }
    }
}
