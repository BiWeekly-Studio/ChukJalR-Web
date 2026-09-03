import SwiftUI

/// 예측 홈. 앱을 열면 가장 먼저 보이는 화면이다.
struct PredictView: View {
    @EnvironmentObject var store: Store
    @State private var tab: Int?
    /// 경기 상세는 별도 탭이 아니라 이 화면 위에 덮인다 — 채팅이 경기에 속하기 때문이다
    @State private var opened: Fixture?

    private var activeLeague: Int { tab ?? store.orderedLeagues.first?.id ?? 0 }

    private var inLeague: [Fixture] { store.fixtures.filter { $0.leagueId == activeLeague } }
    /// 예측은 매치데이가 열린 경기만 가능하다. 나머지는 예고로만 보여준다 (명세 2.1).
    /// 지난 매치데이 경기는 뺀다 — 결과를 못 받으면 '마감' 상태로 영원히 남는다.
    private var today: [Fixture] {
        inLeague.filter { $0.window() != .upcoming && $0.isCurrentMatchday() }
    }
    private var upcoming: [Fixture] { inLeague.filter { $0.window() == .upcoming } }
    private var favMatches: [Fixture] { today.filter { store.isFavorite($0) } }
    private var rest: [Fixture] { today.filter { !store.isFavorite($0) } }
    private var predicted: Int { today.filter { store.predictions[$0.id] != nil }.count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header.padding(.horizontal, 20).padding(.top, 8)
                hud.padding(.horizontal, 20).padding(.top, 12).tour("hud")
                leagueTabs.padding(.top, 14)
                sectionHead.padding(.horizontal, 20).padding(.top, 16)

                VStack(alignment: .leading, spacing: 13) {
                    if !favMatches.isEmpty {
                        SectionLabel(text: "내 팀 경기", accent: true)
                        ForEach(Array(favMatches.enumerated()), id: \.element.id) { i, f in
                            MatchCardView(fixture: f, index: i) { opened = f }
                        }
                        SectionLabel(text: "\(store.league(activeLeague).name)의 남은 경기")
                    }
                    ForEach(Array(rest.enumerated()), id: \.element.id) { i, f in
                        MatchCardView(fixture: f, index: favMatches.count + i) { opened = f }
                    }

                    if today.isEmpty { emptyToday }

                    if !upcoming.isEmpty {
                        SectionLabel(text: "다가오는 경기").padding(.top, 6)
                        ForEach(upcoming.prefix(6)) { f in
                            UpcomingRow(fixture: f) { opened = f }
                        }
                    }
                }
                .padding(.horizontal, 20).padding(.top, 10).padding(.bottom, 28)
            }
        }
        .background(T.paper)
        .fullScreenCover(item: $opened) { f in
            MatchDetailView(fixture: f).environmentObject(store)
        }
    }

    private var header: some View {
        HStack {
            PlateLogo(width: 132)
            Spacer()
            StreakChip(streak: store.me.streak)
        }
    }

    /// 화면 최상단 상태창.
    ///
    /// 예전엔 레벨·티어·XP·배치·오늘진행을 한꺼번에 늘어놨는데, 신규 사용자에게는
    /// 같은 말("아직 아무것도 없다")을 네 번 하는 꼴이었다.
    /// 지금 무엇을 향해 가고 있는지 한 줄로 말하고, 나머지는 보조로 내린다.
    private var hud: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text("Lv.\(store.level.level)")
                    .font(T.display(13, .black)).foregroundStyle(.white)
                    .padding(.horizontal, 9).frame(height: 28)
                    .background(T.gradAccent, in: RoundedRectangle(cornerRadius: 9))
                TierChip(tier: store.tier)
                Spacer()
                if !today.isEmpty {
                    Text("오늘 \(predicted)/\(today.count)")
                        .font(T.body(11, .heavy))
                        .foregroundStyle(predicted == today.count && predicted > 0 ? T.win : T.ink3)
                }
            }

            // 지금 향하는 목표 — 이 카드에서 제일 큰 글자
            Text(goalHeadline)
                .font(T.display(inPlacement ? 22 : 26))
                .foregroundStyle(T.ink)
                .padding(.top, 10)

            XPTrack(progress: goalProgress, height: 8).padding(.top, 10)

            Text(goalCaption)
                .font(T.body(11)).foregroundStyle(T.ink3)
                .padding(.top, 7)
        }
        .padding(EdgeInsets(top: 15, leading: 16, bottom: 15, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(T.card, in: RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.08), radius: 12, y: 5)
    }

    private var inPlacement: Bool { store.me.settledMatches < Progression.placementMatches }

    /// 배치 중이면 순위 진입이 목표, 끝났으면 순위 자체가 성적표다
    private var goalHeadline: String {
        if inPlacement {
            let left = Progression.placementMatches - store.me.settledMatches
            return left == Progression.placementMatches ? "첫 예측을 해보세요" : "순위까지 \(left)경기"
        }
        guard let p = store.me.topPercent else { return "순위 집계 중" }
        return "상위 \(Fmt.trim(p))%"
    }

    private var goalProgress: Double {
        inPlacement
            ? Double(store.me.settledMatches) / Double(Progression.placementMatches)
            : store.level.progress
    }

    private var goalCaption: String {
        if inPlacement {
            return "\(Progression.placementMatches)경기를 채우면 순위표에 이름이 올라가요"
        }
        return "Lv.\(store.level.level + 1)까지 \(store.level.into) / \(store.level.need)"
    }

    private var leagueTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(store.orderedLeagues) { l in
                    let on = activeLeague == l.id
                    Button {
                        Haptics.tap()
                        withAnimation(T.spring) { tab = l.id }
                    } label: {
                        Text(l.short)
                            .font(T.display(13, .heavy))
                            .foregroundStyle(on ? .white : T.ink3)
                            .padding(.horizontal, 14).frame(height: 34)
                            .background(on ? AnyShapeStyle(T.gradAccent) : AnyShapeStyle(T.card),
                                        in: Capsule())
                            .overlay(Capsule().stroke(on ? .clear : T.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private var sectionHead: some View {
        HStack {
            Text(today.isEmpty ? "오늘 경기 없음"
                 : "오늘의 경기 · \(Fmt.dateHeading(today[0].kickoffAt))")
                .font(T.display(13, .heavy))
            Spacer()
            if !today.isEmpty {
                let done = predicted == today.count
                Chip(text: done ? "오늘 예측 완료" : "\(today.count - predicted)경기 남음",
                     style: done ? .win : .plain)
            }
        }
    }

    private var emptyToday: some View {
        VStack(spacing: 8) {
            Image(systemName: "lock.fill").font(.system(size: 26)).foregroundStyle(T.ink4)
                .frame(width: 66, height: 66)
                .background(T.card, in: RoundedRectangle(cornerRadius: 22))
            Text("오늘 예측할 경기가 없어요").font(T.display(15, .heavy))
            Text("다른 리그 탭을 눌러보거나, 아래 예고를 확인해 보세요.")
                .font(T.body(12)).foregroundStyle(T.ink3).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 40)
    }
}

/// 아직 예측 창이 열리지 않은 경기. 예고만 보여준다.
struct UpcomingRow: View {
    @EnvironmentObject var store: Store
    let fixture: Fixture
    var onOpen: () -> Void = {}

    var body: some View {
        Button(action: { Haptics.tap(); onOpen() }) {
        HStack(spacing: 11) {
            CrestPair(home: store.team(fixture.homeTeamId),
                      away: store.team(fixture.awayTeamId), size: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(store.team(fixture.homeTeamId).name) vs \(store.team(fixture.awayTeamId).name)")
                    .font(T.body(12, .heavy)).lineLimit(1)
                Text(Fmt.kickoff(fixture.kickoffAt)).font(T.body(11)).foregroundStyle(T.ink3)
            }
            Spacer()
            Chip(text: Fmt.opens(fixture.opensAt), icon: "lock.fill", style: .plain)
        }
        .padding(.horizontal, 14).frame(height: 62)
        .contentShape(Rectangle())
        .overlay(RoundedRectangle(cornerRadius: 16)
            .strokeBorder(T.lineStrong, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
        }
        .buttonStyle(.plain)
    }
}
