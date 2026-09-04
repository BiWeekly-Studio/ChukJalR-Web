import SwiftUI

/// 팀 이름 옆의 현재 등수.
///
/// 순위표를 못 받았거나 승격팀이라 표에 없으면 아무것도 그리지 않는다 —
/// '0위' 나 '-' 를 붙이면 없는 정보를 있는 것처럼 만든다.
struct RankTag: View {
    let rank: Int?

    var body: some View {
        if let rank {
            Text("\(rank)위")
                .font(T.num(10, .heavy))
                .foregroundStyle(tint)
                .padding(.horizontal, 5).padding(.vertical, 2)
                .background(tint.opacity(0.13), in: RoundedRectangle(cornerRadius: 5))
                .fixedSize()
        }
    }

    /// 상위권과 강등권만 색으로 가른다. 나머지는 조용히 둔다.
    private var tint: Color {
        guard let rank else { return T.ink3 }
        if rank <= 4 { return T.accent }
        if rank >= 18 { return T.cool }
        return T.ink3
    }
}

/// 리그 순위표.
struct StandingsView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    let leagueId: Int

    private var rows: [StandingRow] {
        store.standings.values
            .filter { $0.leagueId == leagueId }
            .sorted { $0.rank < $1.rank }
    }

    var body: some View {
        NavigationStack {
            Group {
                if rows.isEmpty {
                    Text("순위표를 아직 받지 못했어요")
                        .font(T.body(13)).foregroundStyle(T.ink3)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    table
                }
            }
            .background(T.paper)
            .navigationTitle(store.league(leagueId).name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기") { dismiss() }.font(T.body(14))
                }
            }
        }
    }

    private var table: some View {
        ScrollView {
            VStack(spacing: 0) {
                header
                ForEach(rows) { row($0) }
                Text("최근 5경기는 왼쪽이 최근이에요.")
                    .font(T.body(11)).foregroundStyle(T.ink3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20).padding(.top, 14)
            }
            .padding(.vertical, 8).padding(.bottom, 24)
        }
    }

    private var header: some View {
        HStack(spacing: 0) {
            Text("").frame(width: 26)
            Text("팀").font(T.body(11)).foregroundStyle(T.ink3)
                .frame(maxWidth: .infinity, alignment: .leading)
            ForEach(["경기", "승", "무", "패", "득실", "승점"], id: \.self) { c in
                Text(c).font(T.body(11)).foregroundStyle(T.ink3)
                    .frame(width: c == "승점" ? 34 : (c == "득실" ? 34 : 26))
            }
        }
        .padding(.horizontal, 16).padding(.bottom, 8)
    }

    private func row(_ r: StandingRow) -> some View {
        let team = store.team(r.teamId)
        let mine = store.me.favoriteTeamIds.contains(r.teamId)
        return HStack(spacing: 0) {
            Text("\(r.rank)")
                .font(T.num(12, .heavy))
                .foregroundStyle(r.rank <= 4 ? T.accent : r.rank >= 18 ? T.cool : T.ink2)
                .frame(width: 26, alignment: .leading)

            HStack(spacing: 7) {
                Crest(team: team, size: 20)
                Text(team.name)
                    .font(T.body(12.5, mine ? .heavy : .semibold))
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text("\(r.played)").font(T.num(12)).foregroundStyle(T.ink3).frame(width: 26)
            Text("\(r.win)").font(T.num(12)).frame(width: 26)
            Text("\(r.draw)").font(T.num(12)).frame(width: 26)
            Text("\(r.lose)").font(T.num(12)).frame(width: 26)
            Text(r.goalDiff > 0 ? "+\(r.goalDiff)" : "\(r.goalDiff)")
                .font(T.num(12)).foregroundStyle(T.ink3).frame(width: 34)
            Text("\(r.points)").font(T.num(13, .heavy)).frame(width: 34)
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
        .background(mine ? T.accentFill : T.card)
        .overlay(alignment: .bottom) {
            Rectangle().fill(T.line2).frame(height: 1).padding(.leading, 16)
        }
    }
}
