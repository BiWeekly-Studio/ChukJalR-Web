import SwiftUI

struct RankingView: View {
    @EnvironmentObject var store: Store
    private var inPlacement: Bool { store.me.settledMatches < Progression.placementMatches }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("MATCHDAY RANKING").font(T.body(10, .bold)).tracking(1.5).foregroundStyle(T.ink3)
                    Text("오늘의 축잘알").font(T.display(27))
                    Text("예측으로 증명한 실력, 순위로 만나보세요.").font(T.body(12)).foregroundStyle(T.ink3)
                }
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("MY RANKING").font(T.body(10, .bold)).tracking(1.5).foregroundStyle(DesignTokens.matchMuted)
                        Spacer()
                        TierChip(tier: store.tier)
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(inPlacement ? "\(max(0, Progression.placementMatches - store.me.settledMatches))경기" : store.myRank.map { "\(Fmt.comma($0.rank))위" } ?? "집계 대기")
                            .font(T.num(36)).foregroundStyle(DesignTokens.lime)
                        Text(inPlacement ? "순위 진입까지" : store.me.topPercent.map { "상위 \(Fmt.trim($0))%" } ?? "다음 발표를 기다려주세요")
                            .font(T.body(12)).foregroundStyle(DesignTokens.matchSecondary)
                    }
                    if inPlacement {
                        XPTrack(progress: Double(store.me.settledMatches) / Double(Progression.placementMatches))
                        Text("정산된 \(store.me.settledMatches) / \(Progression.placementMatches)경기 · 배치를 마치면 순위가 열려요.")
                            .font(T.body(11)).foregroundStyle(DesignTokens.matchSecondary)
                    } else {
                        HStack {
                            Text("나의 축잘알 지수").font(T.body(12))
                            Spacer()
                            Text(Fmt.comma(store.me.rating)).font(T.num(18))
                        }.foregroundStyle(.white)
                    }
                }.padding(20).background(DesignTokens.matchSurface, in: RoundedRectangle(cornerRadius: 22))
                HStack {
                    Text("전체 순위").font(T.display(17))
                    Spacer()
                    Text("매일 오전 8시 갱신").font(T.body(10)).foregroundStyle(T.ink3)
                }
                if store.rankingFailed {
                    Text("순위표를 불러오지 못했어요.").font(T.body(13))
                    Button("다시 시도") { Task { await store.refreshRanking() } }.buttonStyle(MatchdayButtonStyle())
                } else if store.ranking.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "chart.bar.fill").font(.system(size: 28)).foregroundStyle(T.ink3)
                        Text("첫 순위의 주인공을 기다려요").font(T.display(17))
                        Text("배치 \(Progression.placementMatches)경기를 마치면 순위표가 열려요.").font(T.body(12)).foregroundStyle(T.ink3)
                    }.frame(maxWidth: .infinity).padding(.vertical, 35)
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(store.ranking) { row in
                            HStack(spacing: 11) {
                                Text(String(format: "%02d", row.rank)).font(T.num(20))
                                    .foregroundStyle(row.rank <= 3 ? T.accent : T.ink3).frame(width: 35)
                                SupporterAvatar(url: row.avatarUrl, name: row.handle, size: 36, badge: store.supporters[row.userID])
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(row.handle + (row.isMe ? " · 나" : "")).font(T.display(13)).lineLimit(1)
                                    SupporterBadgeView(badge: store.supporters[row.userID])
                                    Text("적중 \(Int((row.accuracy * 100).rounded()))%").font(T.body(10)).foregroundStyle(T.ink3)
                                }
                                Spacer(minLength: 4)
                                VStack(alignment: .trailing, spacing: 5) {
                                    Text(Fmt.comma(row.rating)).font(T.num(17))
                                    ChangeMark(value: row.change)
                                }
                            }.padding(.horizontal, 12).padding(.vertical, 15)
                                .background(row.isMe ? DesignTokens.limeSoft : T.card)
                            Divider().overlay(T.line2)
                        }
                    }.clipShape(RoundedRectangle(cornerRadius: 18))
                }
                Text("한 경기보다 꾸준한 예측이 실력을 보여줘요.").font(T.body(11)).foregroundStyle(T.ink3)
            }.padding(20)
        }.background(T.paper).refreshable { await store.refreshRanking() }
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
