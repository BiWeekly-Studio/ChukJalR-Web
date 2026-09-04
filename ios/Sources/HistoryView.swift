import SwiftUI

/// 내가 뭘 걸었고 어떻게 끝났는지.
///
/// '나' 탭의 숫자들은 합계만 말해준다. 어제 무엇을 골랐고 왜 틀렸는지는 여기서 본다 —
/// 다음에 뭘 고칠지는 합계가 아니라 개별 경기에서 나온다.
struct HistoryView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    @State private var records: [PredictionRecord] = []
    @State private var loading = true
    @State private var failed = false

    /// 날짜별로 묶는다. 킥오프 기준이라 '어제 경기'가 어제로 간다.
    private var days: [(label: String, items: [PredictionRecord])] {
        let cal = Calendar.current
        let groups = Dictionary(grouping: records) { cal.startOfDay(for: $0.kickoffAt) }
        return groups.keys.sorted(by: >).map { (Fmt.dayLabel($0), groups[$0] ?? []) }
    }

    private var settled: [PredictionRecord] { records.filter(\.settled) }

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if records.isEmpty {
                    empty
                } else {
                    list
                }
            }
            .background(T.paper)
            .navigationTitle("예측 기록")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기") { dismiss() }.font(T.body(14))
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        do {
            records = try await Repositories.current.loadHistory()
            failed = false
        } catch {
            failed = true
        }
        loading = false
    }

    private var empty: some View {
        VStack(spacing: 10) {
            Text(failed ? "기록을 불러오지 못했어요" : "아직 예측한 경기가 없어요")
                .font(T.display(15, .heavy))
            Text(failed ? "잠시 후 다시 열어주세요." : "오늘의 경기에서 하나 골라보세요.")
                .font(T.body(13)).foregroundStyle(T.ink3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var list: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                summary.padding(.horizontal, 20).padding(.top, 8)

                ForEach(days, id: \.label) { day in
                    Text(day.label)
                        .font(T.body(12, .heavy)).foregroundStyle(T.ink3)
                        .padding(.horizontal, 20).padding(.top, 22).padding(.bottom, 8)
                    VStack(spacing: 8) {
                        ForEach(day.items) { row($0) }
                    }
                    .padding(.horizontal, 20)
                }
            }
            .padding(.bottom, 28)
        }
    }

    private var summary: some View {
        HStack(spacing: 10) {
            tile("\(records.count)", "예측")
            tile("\(settled.filter { $0.hit == true }.count)", "적중", tint: T.win)
            tile(settled.isEmpty ? "—"
                 : "\(Int((Double(settled.filter { $0.hit == true }.count) / Double(settled.count) * 100).rounded()))%",
                 "적중률", tint: T.accent)
            tile(Fmt.signed(settled.compactMap(\.deltaRating).reduce(0, +)), "지수 합",
                 tint: settled.compactMap(\.deltaRating).reduce(0, +) >= 0 ? T.win : T.cool)
        }
    }

    private func tile(_ value: String, _ label: String, tint: Color = T.ink) -> some View {
        VStack(spacing: 3) {
            Text(value).font(T.num(18, .heavy)).foregroundStyle(tint)
            Text(label).font(T.body(10.5)).foregroundStyle(T.ink3)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 12)
        .background(T.card, in: RoundedRectangle(cornerRadius: 14))
    }

    // MARK: 한 줄

    private func row(_ r: PredictionRecord) -> some View {
        let home = store.team(r.homeTeamId), away = store.team(r.awayTeamId)
        return HStack(spacing: 11) {
            CrestPair(home: home, away: away, size: 26)

            VStack(alignment: .leading, spacing: 3) {
                Text("\(home.name) vs \(away.name)")
                    .font(T.body(13, .heavy)).lineLimit(1)
                HStack(spacing: 5) {
                    Text(pickLabel(r, home: home, away: away))
                        .font(T.body(11, .semibold)).foregroundStyle(T.accent)
                    Text("·").foregroundStyle(T.ink4)
                    Text(r.confidence.label).font(T.body(11)).foregroundStyle(T.ink3)
                }
                .lineLimit(1)
            }

            Spacer(minLength: 6)

            VStack(alignment: .trailing, spacing: 3) {
                outcome(r)
                if let h = r.homeGoals, let a = r.awayGoals {
                    Text("\(h) : \(a)").font(T.num(11)).foregroundStyle(T.ink3)
                } else {
                    Text(Fmt.kickoff(r.kickoffAt)).font(T.body(10.5)).foregroundStyle(T.ink4)
                }
            }
        }
        .padding(EdgeInsets(top: 12, leading: 14, bottom: 12, trailing: 14))
        .background(T.card, in: RoundedRectangle(cornerRadius: 16))
    }

    private func pickLabel(_ r: PredictionRecord, home: Team, away: Team) -> String {
        switch r.pick {
        case .home: return "\(home.name) 승"
        case .draw: return "무승부"
        case .away: return "\(away.name) 승"
        }
    }

    /// 셋을 구분한다 — 적중 / 실패 / 아직. 정산 전을 실패로 보이게 하면 안 된다.
    @ViewBuilder private func outcome(_ r: PredictionRecord) -> some View {
        if let delta = r.deltaRating {
            let win = r.hit == true
            HStack(spacing: 4) {
                Image(systemName: win ? "checkmark" : "xmark")
                    .font(.system(size: 9, weight: .black))
                Text(Fmt.signed(delta)).font(T.num(12, .heavy))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 8).frame(height: 22)
            .background(win ? AnyShapeStyle(T.gradWin) : AnyShapeStyle(T.ink3), in: Capsule())
        } else if r.actual != nil {
            // 결과는 나왔는데 정산이 아직. 1분마다 도니까 곧 채워진다.
            Text("정산 중").font(T.body(10.5, .semibold)).foregroundStyle(T.ink3)
                .padding(.horizontal, 8).frame(height: 22)
                .background(T.card2, in: Capsule())
        } else {
            Text("결과 대기").font(T.body(10.5, .semibold)).foregroundStyle(T.accent)
                .padding(.horizontal, 8).frame(height: 22)
                .background(T.accentSoft, in: Capsule())
        }
    }
}
