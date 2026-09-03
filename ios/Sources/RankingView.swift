import SwiftUI

/// 랭킹. 순위는 매일 08:00 KST 에 확정된다 (명세 3.3).
struct RankingView: View {
    @EnvironmentObject var store: Store
    @State private var scope = 0
    private let scopes = ["전체", "리그별", "친구"]

    private var rows: [RankRow] { store.ranking }
    private var podium: [RankRow] { Array(rows.prefix(3)) }
    private var rest: [RankRow] { Array(rows.dropFirst(3)) }
    private var inPlacement: Bool { store.me.settledMatches < Progression.placementMatches }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("랭킹").font(T.display(22))
                    Spacer()
                    Chip(text: nextPublish, style: .plain)
                }
                .padding(.horizontal, 20).padding(.top, 8)

                scopeTabs.padding(.top, 14)

                if scope == 2 {
                    empty("아직 친구가 없어요",
                          "친구를 초대하면, 그 친구가 배치 20경기를 마쳤을 때 200점을 드려요.")
                } else if rows.isEmpty {
                    empty("아직 순위가 없어요",
                          "배치 \(Progression.placementMatches)경기를 마친 사람이 나오면 순위표가 열려요. 운으로 오른 순위를 막기 위한 장치예요.")
                } else {
                    podiumRow.padding(.horizontal, 20).padding(.top, 22)
                    VStack(spacing: 0) {
                        ForEach(Array(rest.enumerated()), id: \.element.id) { i, r in
                            rankRow(r)
                            if i < rest.count - 1 { Divider().overlay(T.line2) }
                        }
                    }
                    .padding(.horizontal, 20).padding(.top, 10)
                }

                myCard.padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 28)
            }
        }
        .background(T.paper)
    }

    /// 다음 발표까지 남은 시간 (매일 08:00 KST)
    private var nextPublish: String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Seoul")!
        let hour = cal.component(.hour, from: .now)
        let left = hour < 8 ? 8 - hour : 32 - hour
        return left <= 1 ? "곧 발표돼요" : "다음 발표까지 \(left)시간"
    }

    private var scopeTabs: some View {
        HStack(spacing: 8) {
            ForEach(Array(scopes.enumerated()), id: \.offset) { i, name in
                let on = scope == i
                Button {
                    Haptics.tap()
                    withAnimation(T.spring) { scope = i }
                } label: {
                    Text(name)
                        .font(T.display(13, .heavy))
                        .foregroundStyle(on ? .white : T.ink3)
                        .padding(.horizontal, 14).frame(height: 34)
                        .background(on ? AnyShapeStyle(T.gradAccent) : AnyShapeStyle(T.card), in: Capsule())
                        .overlay(Capsule().stroke(on ? .clear : T.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.horizontal, 20)
    }

    private var podiumRow: some View {
        HStack(alignment: .bottom, spacing: 10) {
            podiumColumn(podium.count > 1 ? podium[1] : nil, rank: 2, height: 54)
            podiumColumn(podium.first, rank: 1, height: 78)
            podiumColumn(podium.count > 2 ? podium[2] : nil, rank: 3, height: 40)
        }
    }

    @ViewBuilder
    private func podiumColumn(_ row: RankRow?, rank: Int, height: CGFloat) -> some View {
        if let row {
            let top = rank == 1
            VStack(spacing: 6) {
                if top {
                    Image(systemName: "crown.fill").font(.system(size: 18))
                        .foregroundStyle(T.goldInk)
                }
                Text(row.initial)
                    .font(T.display(top ? 20 : 15))
                    .foregroundStyle(top ? .white : T.ink2)
                    .frame(width: top ? 58 : 44, height: top ? 58 : 44)
                    .background(top ? AnyShapeStyle(T.gradGold) : AnyShapeStyle(T.card2), in: Circle())
                Text(row.handle)
                    .font(T.display(top ? 14 : 12, top ? .black : .semibold))
                    .foregroundStyle(top ? T.ink : T.ink2)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text(Fmt.comma(row.rating))
                    .font(T.num(top ? 14 : 13))
                    .foregroundStyle(top ? T.gold : T.ink3)
                ZStack {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(top ? AnyShapeStyle(T.gradGold)
                                  : AnyShapeStyle(rank == 2 ? T.paper2 : T.line2))
                    Text("\(rank)").font(T.num(top ? 34 : 24))
                        .foregroundStyle(top ? .white : T.ink3)
                }
                .frame(height: height)
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: 16, topTrailingRadius: 16))
            }
            .frame(maxWidth: .infinity)
        } else {
            Color.clear.frame(maxWidth: .infinity)
        }
    }

    private func rankRow(_ r: RankRow) -> some View {
        HStack(spacing: 11) {
            Text("\(r.rank)").font(T.num(17))
                .foregroundStyle(r.isMe ? T.accent : T.ink2).frame(width: 24, alignment: .leading)
            ChangeMark(value: r.change)
            Text(r.initial).font(T.display(11, .heavy)).foregroundStyle(T.ink2)
                .frame(width: 32, height: 32).background(T.card2, in: Circle())
            Text(r.handle).font(T.body(12, r.isMe ? .heavy : .semibold)).lineLimit(1)
            Spacer()
            Text("적중 \(Int((r.accuracy * 100).rounded()))%")
                .font(T.body(11)).foregroundStyle(T.ink3)
            Text(Fmt.comma(r.rating)).font(T.num(14)).frame(width: 58, alignment: .trailing)
        }
        .frame(height: 56)
        .padding(.horizontal, r.isMe ? 8 : 0)
        .background(r.isMe ? T.accentFill : .clear, in: RoundedRectangle(cornerRadius: 14))
    }

    @ViewBuilder private var myCard: some View {
        if inPlacement {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    TierChip(tier: .placement)
                    Text("순위 진입까지").font(T.display(14, .heavy))
                    Spacer()
                    Text("\(store.me.settledMatches)").font(T.num(15))
                    Text("/ \(Progression.placementMatches)").font(T.body(12)).foregroundStyle(T.ink3)
                }
                XPTrack(progress: Double(store.me.settledMatches) / Double(Progression.placementMatches))
                    .padding(.top, 12)
                Text(store.me.settledMatches < Progression.placementMatches
                     ? "\(Progression.placementMatches - store.me.settledMatches)경기만 더 예측하면 순위에 올라요."
                     : "내일 아침 발표에 처음 이름이 올라갑니다.")
                    .font(T.body(12)).foregroundStyle(T.ink3).padding(.top, 11)
            }
            .padding(16)
            .background(T.card, in: RoundedRectangle(cornerRadius: 18))
            .shadow(color: .black.opacity(0.08), radius: 10, y: 4)
        } else if let mine = rows.first(where: \.isMe) {
            HStack(spacing: 11) {
                Text("\(mine.rank)").font(T.num(19)).frame(width: 26, alignment: .leading)
                Text(mine.initial).font(T.display(13, .heavy))
                    .frame(width: 36, height: 36)
                    .background(.white.opacity(0.22), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(mine.handle).font(T.display(14, .heavy))
                    Text(store.me.topPercent.map { "상위 \(Fmt.trim($0))% · 내 순위" } ?? "내 순위")
                        .font(T.body(11)).opacity(0.86)
                }
                Spacer()
                ChangeMark(value: mine.change, onDark: true)
                CountUpInt(target: mine.rating, font: T.num(16), duration: 1.1)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 15).frame(height: 68)
            .background(T.gradAccent, in: RoundedRectangle(cornerRadius: 20))
        }
    }

    private func empty(_ title: String, _ body: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "chart.bar.fill").font(.system(size: 26)).foregroundStyle(T.ink4)
                .frame(width: 66, height: 66)
                .background(T.card, in: RoundedRectangle(cornerRadius: 22))
            Text(title).font(T.display(15, .heavy))
            Text(body).font(T.body(12)).foregroundStyle(T.ink3)
                .multilineTextAlignment(.center).lineSpacing(3)
        }
        .frame(maxWidth: .infinity).padding(.horizontal, 32).padding(.vertical, 52)
    }
}

/// 순위 변동. 처음 오른 사람은 NEW.
struct ChangeMark: View {
    let value: Int?
    var onDark = false

    var body: some View {
        Group {
            if let v = value {
                if v > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "arrow.up").font(.system(size: 9, weight: .black))
                        Text("\(v)").font(T.body(11, .heavy))
                    }
                    .foregroundStyle(onDark ? Color(hex: 0xB7FFD9) : T.win)
                } else if v < 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "arrow.down").font(.system(size: 9, weight: .black))
                        Text("\(abs(v))").font(T.body(11))
                    }
                    .foregroundStyle(onDark ? .white.opacity(0.7) : T.ink4)
                } else {
                    Capsule().fill(onDark ? .white.opacity(0.5) : T.lineStrong).frame(width: 10, height: 2.5)
                }
            } else {
                Text("NEW").font(T.body(10, .black))
                    .foregroundStyle(onDark ? .white : T.accent)
            }
        }
        .frame(width: 26)
    }
}
