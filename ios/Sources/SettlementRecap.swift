import SwiftUI

struct RecapItem: Decodable, Identifiable {
    let id: String
    let fixtureId: Int
    let homeName: String
    let awayName: String
    let homeGoals: Int?
    let awayGoals: Int?
    let pick: Outcome
    let actual: Outcome
    let correct: Bool
    let deltaRating: Int
    let points: Int
    let settledAt: String

    var pickLabel: String { pick == .draw ? "무승부" : "\(pick == .home ? homeName : awayName) 승" }
}

struct SettlementRecapData: Decodable {
    var items: [RecapItem] = []
    var remaining: Int = 0
    var correct: Int { items.filter(\.correct).count }
    var delta: Int { items.reduce(0) { $0 + $1.deltaRating } }
    var points: Int { items.reduce(0) { $0 + $1.points } }
}

struct SettlementRecapView: View {
    @EnvironmentObject var store: Store
    @Environment(\.scenePhase) private var scenePhase
    let blocked: Bool
    @State private var recap = SettlementRecapData()
    @State private var loading = false
    @State private var saving = false
    @State private var error: String?
    private let repository = SupabaseRepository()

    var body: some View {
        Color.clear.allowsHitTesting(false)
            .task { await refresh() }
            .onChange(of: scenePhase) { phase in
                if phase == .active { Task { await refresh() } }
            }
            .sheet(isPresented: Binding(get: { !blocked && !recap.items.isEmpty }, set: { _ in })) {
                VStack(alignment: .leading, spacing: 16) {
                    Text("예측 결과가 도착했어요").font(T.display(23, .heavy))
                    Text("맞힌 경기 \(recap.correct) · 틀린 경기 \(recap.items.count - recap.correct)")
                        .font(T.body(13)).foregroundStyle(T.ink3)
                    HStack {
                        Text("이번 결과 지수 변화").font(T.body(13))
                        Spacer()
                        Text("\(Fmt.signed(recap.delta))점").font(T.num(26, .heavy))
                    }.padding(16).background(T.accentSoft, in: RoundedRectangle(cornerRadius: 14))
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 18) {
                            ForEach(recap.items) { item in
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(alignment: .top) {
                                        Text("\(item.homeName) vs \(item.awayName)").font(T.body(14, .heavy))
                                        Spacer()
                                        Text(item.correct ? "적중" : "실패").font(T.body(13, .heavy))
                                            .foregroundStyle(item.correct ? T.win : T.cool)
                                    }
                                    Text("내 예측: \(item.pickLabel)").font(T.body(12)).foregroundStyle(T.ink3)
                                    if let home = item.homeGoals, let away = item.awayGoals {
                                        Text("결과 \(home):\(away)").font(T.body(12)).foregroundStyle(T.ink3)
                                    }
                                    HStack {
                                        Text("지수 \(Fmt.signed(item.deltaRating))점")
                                        Spacer()
                                        Text("획득 포인트 \(Fmt.signed(item.points))P")
                                    }.font(T.body(12, .semibold))
                                    Divider()
                                }
                            }
                        }
                    }
                    Text("획득 포인트 합계 \(Fmt.signed(recap.points))P · 이미 내 기록에 반영됐어요.")
                        .font(T.body(11)).foregroundStyle(T.ink3)
                    if recap.remaining > 0 {
                        Text("확인할 결과가 \(recap.remaining)경기 더 있어요.").font(T.body(12))
                    }
                    if let error { Text(error).font(T.body(12)).foregroundStyle(T.cool) }
                    Button { Task { await acknowledge() } } label: {
                        Text(saving ? "저장 중…" : recap.remaining > 0 ? "확인하고 다음 결과 보기" : "확인했어요")
                            .font(T.body(15, .heavy)).foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 50)
                            .background(T.gradAccent, in: RoundedRectangle(cornerRadius: 14))
                    }.disabled(saving)
                }
                .padding(24).padding(.top, 8).background(T.paper)
                .interactiveDismissDisabled()
            }
    }

    @MainActor private func refresh() async {
        guard !loading, recap.items.isEmpty else { return }
        loading = true
        defer { loading = false }
        do {
            let result = try await repository.loadSettlementRecap()
            guard !Task.isCancelled else { return }
            recap = result
            if !result.items.isEmpty { await store.refreshResultProfile() }
        } catch { /* 미확인 결과는 지우지 않고 다음 진입 때 다시 조회한다. */ }
    }

    @MainActor private func acknowledge() async {
        guard !saving else { return }
        saving = true; error = nil
        defer { saving = false }
        do {
            try await repository.acknowledgeSettlementRecap(ids: recap.items.map(\.id))
            recap = SettlementRecapData()
            await refresh()
        } catch { self.error = "확인 내용을 저장하지 못했어요. 다시 눌러 주세요." }
    }
}
