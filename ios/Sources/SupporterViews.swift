import SwiftUI
import StoreKit

struct SupporterInfo {
    let teamID: Int
    let expiresAt: Date?
    var active: Bool { expiresAt.map { $0 > .now } ?? true }
}

struct SupporterBadgeView: View {
    @EnvironmentObject var store: Store
    let badge: SupporterInfo?
    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { _ in
            if let badge, badge.active {
                let team = store.team(badge.teamID)
                HStack(spacing: 4) {
                    Image(systemName: "shield.fill").font(.system(size: 10)).foregroundStyle(Color(hex: team.colorHex))
                    Text("\(team.name) 서포터").font(T.body(9, .semibold)).lineLimit(1)
                }
                .foregroundStyle(T.ink2)
                .padding(.horizontal, 6).padding(.vertical, 4)
                .background(T.card2, in: Capsule())
                .accessibilityLabel("응원 팀 \(team.name)")
            }
        }
    }
}

struct SupporterAvatar: View {
    @EnvironmentObject var store: Store
    let url: String?
    let name: String
    let size: CGFloat
    let badge: SupporterInfo?
    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { _ in
            Avatar(url: url, initial: name, size: size)
                .overlay {
                    if let badge, badge.active {
                        Circle().stroke(Color(hex: store.team(badge.teamID).colorHex), lineWidth: 2.5)
                    }
                }
        }
    }
}

struct MembershipView: View {
    @EnvironmentObject var purchases: Purchases
    @EnvironmentObject var store: Store
    @State private var teamPicker = false
    @State private var confirmStart = false
    @State private var subscriptionManagement = false
    @State private var legal: String?

    private var member: PurchaseState.Supporter { purchases.state.supporter }
    private var selected: Int? { member.teamId ?? store.me.favoriteTeamIds.first }
    var body: some View {
        VStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 14) {
                Text("SUPPORT YOUR TEAM").font(T.body(10, .bold)).tracking(1.5).foregroundStyle(DesignTokens.lime)
                Text("응원도, 내 스타일로.").font(T.display(25)).foregroundStyle(.white)
                Text("응원 프로필 팩").font(T.display(15)).foregroundStyle(.white)
                Text("채팅 · 랭킹 · 프로필에\n내 팀 배지와 컬러 테두리를 더해요.")
                    .font(T.body(13)).foregroundStyle(DesignTokens.matchSecondary).lineSpacing(4)
                if let selected {
                    HStack(spacing: 10) {
                        SupporterAvatar(url: store.me.avatarUrl, name: store.me.handle, size: 42,
                                        badge: SupporterInfo(teamID: selected, expiresAt: nil))
                        VStack(alignment: .leading, spacing: 5) {
                            Text(store.me.handle).font(T.display(13)).foregroundStyle(.white)
                            SupporterBadgeView(badge: SupporterInfo(teamID: selected, expiresAt: nil))
                        }
                        Spacer()
                        Text("미리보기").font(T.body(10)).foregroundStyle(DesignTokens.matchMuted)
                    }
                    .padding(12).background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                }
                if member.active {
                    Text("이용 중" + (member.expiresAt.flatMap(Decode.date).map { " · \(Fmt.kickoff($0))까지" } ?? ""))
                        .font(T.body(12, .semibold)).foregroundStyle(DesignTokens.lime)
                    Button("응원 팀 선택·변경") { teamPicker = true }.buttonStyle(MatchdayButtonStyle(lime: true))
                    if !member.autoRenew {
                        Text("갱신 상태는 Apple 구독 관리에서 확인할 수 있어요.").font(T.body(10)).foregroundStyle(DesignTokens.matchSecondary)
                    }
                } else {
                    Button {
                        Task { await purchases.buy(Purchases.supporterID); await store.refreshSupporters() }
                    } label: {
                        Text(purchases.product(Purchases.supporterID).map { "월 \($0.displayPrice) · 구독하기" } ?? (purchases.productsLoaded ? "상품 준비 중 · 잠시 후 확인해주세요" : "상품을 불러오는 중"))
                    }
                    .buttonStyle(MatchdayButtonStyle(lime: true))
                    .disabled(purchases.busy || !purchases.state.storeReady || purchases.product(Purchases.supporterID) == nil)
                }
                Text("1개월 자동 갱신 구독 · 해지 전까지 매월 결제\n해지 후에도 남은 기간은 이용할 수 있어요.")
                    .font(T.body(10)).foregroundStyle(DesignTokens.matchSecondary).lineSpacing(3)
            }
            .padding(20).background(DesignTokens.matchSurface, in: RoundedRectangle(cornerRadius: 22))

            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("새로운 도전, 같은 실력.").font(T.display(18))
                    Spacer()
                    Image(systemName: "arrow.counterclockwise").foregroundStyle(T.accent)
                }
                Text("새 출발권 1회").font(T.body(12, .bold)).foregroundStyle(T.ink2)
                Text("개인 도전 지수를 1,000점부터 다시 시작해요. 공식 지수·순위·예측 기록은 그대로예요.")
                    .font(T.body(12)).foregroundStyle(T.ink3).lineSpacing(4)
                if let challenge = purchases.state.freshStart.challenges.first(where: { $0.ended_at == nil }) {
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("현재 개인 도전").font(T.body(10)).foregroundStyle(T.ink3)
                            Text(Fmt.comma(challenge.rating)).font(T.num(28))
                        }
                        Spacer()
                        Text("\(challenge.predicted)경기 예측\n\(challenge.hits) / \(challenge.settled)경기 적중")
                            .font(T.body(11)).foregroundStyle(T.ink3).multilineTextAlignment(.trailing)
                    }.padding(14).background(T.paper, in: RoundedRectangle(cornerRadius: 12))
                }
                if let ticket = purchases.state.freshStart.tickets.first {
                    Button("보유 \(purchases.state.freshStart.tickets.count)장 · 1장 사용하기") { confirmStart = true }
                        .buttonStyle(MatchdayButtonStyle()).disabled(purchases.busy)
                        .confirmationDialog("개인 도전을 새로 시작할까요?", isPresented: $confirmStart, titleVisibility: .visible) {
                            Button("새 출발권 1장 사용") { Task { await purchases.start(ticket.orderId) } }
                            Button("취소", role: .cancel) {}
                        } message: { Text("사용 전에 제출한 예측은 이전 도전에 남아요. 공식 지수와 순위는 바뀌지 않아요.") }
                }
                Button { Task { await purchases.buy(Purchases.ticketID) } } label: {
                    Text(purchases.product(Purchases.ticketID).map { "\($0.displayPrice) · 1회 구매" } ?? (purchases.productsLoaded ? "상품 준비 중 · 잠시 후 확인해주세요" : "상품을 불러오는 중"))
                }
                .buttonStyle(MatchdayButtonStyle())
                .disabled(purchases.busy || !purchases.state.storeReady || purchases.product(Purchases.ticketID) == nil)
                Text("구매 후 원하는 때 1회 사용 · 정기 결제 없음").font(T.body(10)).foregroundStyle(T.ink3)
                let history = purchases.state.freshStart.challenges.filter { $0.ended_at != nil }
                if !history.isEmpty {
                    DisclosureGroup("지난 개인 도전 \(history.count)회") {
                        ForEach(history) { challenge in
                            HStack {
                                Text(challenge.refunded ? "환불로 종료" : "지난 도전")
                                Spacer()
                                Text("\(challenge.rating)점 · \(challenge.hits)/\(challenge.settled) 적중")
                            }.font(T.body(11)).padding(.vertical, 6)
                        }
                    }.font(T.body(12)).tint(T.ink2)
                }
            }
            .padding(18).background(T.card, in: RoundedRectangle(cornerRadius: 20))

            if let notice = purchases.notice {
                Text(notice).font(T.body(12)).foregroundStyle(T.ink2)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(14)
                    .background(T.accentSoft, in: RoundedRectangle(cornerRadius: 12)).accessibilityAddTraits(.updatesFrequently)
            }
            HStack {
                Button("구매 복원") { Task { await purchases.restore(); await store.refreshSupporters() } }
                Spacer()
                Button("구독 관리") { subscriptionManagement = true }
                Spacer()
                Button("새로고침") { Task { await purchases.refresh() } }
            }.font(T.body(12, .semibold)).disabled(purchases.busy)
            Text("구매는 현재 축잘알 계정에 연결돼요. 구독은 계정 삭제로 해지되지 않으니 Apple 구독 관리에서 해지해주세요. 구단 공식 상품이 아니며 예측 점수에는 영향을 주지 않아요.")
                .font(T.body(10)).foregroundStyle(T.ink3).lineSpacing(4)
            HStack {
                Button("이용약관") { legal = "terms" }
                Text("·")
                Button("개인정보 처리방침") { legal = "privacy" }
                Text("·")
                Link("Apple 이용약관", destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!)
            }.font(T.body(10)).foregroundStyle(T.ink3)
        }
        .sheet(isPresented: $teamPicker) {
            SupporterTeamPicker(selected: member.teamId) { id in
                Task { await purchases.selectTeam(id); await store.refreshSupporters() }
            }
        }
        .manageSubscriptionsSheet(isPresented: $subscriptionManagement)
        .sheet(item: Binding(get: { legal.map { LegalPage(id: $0) } }, set: { legal = $0?.id })) { page in
            LegalView(page: page.id)
        }
    }
}

struct SupporterTeamPicker: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var store: Store
    let selected: Int?
    let save: (Int) -> Void
    @State private var query = ""
    var body: some View {
        NavigationStack {
            List(store.teams.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }) { team in
                Button {
                    save(team.id); dismiss()
                } label: {
                    HStack {
                        Circle().fill(Color(hex: team.colorHex)).frame(width: 14, height: 14)
                        Text(team.name).font(T.body(14)).foregroundStyle(T.ink)
                        Spacer()
                        if selected == team.id { Image(systemName: "checkmark").foregroundStyle(T.accent) }
                    }.frame(minHeight: 38)
                }
            }.searchable(text: $query, prompt: "응원 팀 검색")
                .navigationTitle("응원 팀").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } } }
        }
    }
}

struct MatchdayButtonStyle: ButtonStyle {
    var lime = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(T.display(14, .heavy))
            .frame(maxWidth: .infinity, minHeight: 48)
            .foregroundStyle(lime ? T.ink : .white)
            .background(lime ? DesignTokens.lime : T.accent, in: RoundedRectangle(cornerRadius: 13))
            .opacity(!enabled ? 0.45 : configuration.isPressed ? 0.7 : 1)
    }
}

private struct LegalPage: Identifiable { let id: String }
