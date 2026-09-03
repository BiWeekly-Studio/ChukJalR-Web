import SwiftUI

private let maxFavorites = 5

/// 온보딩: 리그 선택(순서가 곧 탭 순서) → 최애 팀 → 완료 (명세 5.1)
struct OnboardingView: View {
    @EnvironmentObject var store: Store
    @State private var step = 0
    @State private var picked: [Int] = []
    @State private var favorites: [Int] = []
    @State private var query = ""
    @State private var saving = false

    var body: some View {
        VStack(spacing: 0) {
            // 진행 표시
            HStack(spacing: 6) {
                ForEach(0..<2, id: \.self) { i in
                    Capsule()
                        .fill(i <= step ? AnyShapeStyle(T.gradAccent) : AnyShapeStyle(T.line))
                        .frame(height: 4)
                }
            }
            .padding(.horizontal, 20).padding(.top, 18)

            if step == 0 { leagueStep } else { teamStep }

            Button(action: advance) {
                HStack(spacing: 7) {
                    if step == 1 { Image(systemName: "checkmark").font(.system(size: 14, weight: .black)) }
                    Text(ctaLabel)
                }
            }
            .buttonStyle(CTAStyle(enabled: canAdvance))
            .disabled(!canAdvance)
            .padding(.horizontal, 20).padding(.top, 12)
            .padding(.bottom, 20)
        }
        .background(T.paper)
    }

    private var canAdvance: Bool {
        saving ? false : (step == 0 ? !picked.isEmpty : true)
    }

    private var ctaLabel: String {
        if saving { return "저장 중…" }
        if step == 0 {
            return picked.isEmpty ? "리그를 하나 이상 골라주세요" : "\(picked.count)개 리그로 시작하기"
        }
        return favorites.isEmpty ? "건너뛰고 시작하기" : "\(favorites.count)팀 선택 · 시작하기"
    }

    private func advance() {
        Haptics.tap()
        if step == 0 { withAnimation(T.spring) { step = 1 }; return }
        saving = true
        Task {
            await store.completeOnboarding(leagueOrder: picked, favoriteTeamIds: favorites)
            saving = false
        }
    }

    // MARK: 리그

    private var leagueStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("어느 리그를\n보시나요?")
                    .font(T.display(27)).lineSpacing(2)
                Text("고른 순서대로 홈 화면 탭이 정렬돼요. 나중에 바꿀 수 있어요.")
                    .font(T.body(12)).foregroundStyle(T.ink3).padding(.top, 10)

                VStack(spacing: 10) {
                    ForEach(store.leagues) { l in
                        let idx = picked.firstIndex(of: l.id)
                        Button {
                            Haptics.tap()
                            withAnimation(T.spring) {
                                if let i = idx { picked.remove(at: i) } else { picked.append(l.id) }
                            }
                        } label: {
                            HStack(spacing: 12) {
                                Text(idx.map { "\($0 + 1)" } ?? "")
                                    .font(T.display(12, .black))
                                    .foregroundStyle(idx == nil ? T.ink3 : .white)
                                    .frame(width: 28, height: 28)
                                    .background(idx == nil ? AnyShapeStyle(T.card2) : AnyShapeStyle(T.gradAccent),
                                                in: Circle())
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(l.name).font(T.display(15, .heavy))
                                    Text(l.country).font(T.body(11)).foregroundStyle(T.ink3)
                                }
                                Spacer()
                            }
                            .padding(EdgeInsets(top: 16, leading: 18, bottom: 16, trailing: 18))
                            .background(T.card, in: RoundedRectangle(cornerRadius: 22))
                            .overlay(RoundedRectangle(cornerRadius: 22)
                                .stroke(idx == nil ? .clear : T.accent, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.top, 26)
            }
            .padding(.horizontal, 20).padding(.top, 28)
        }
    }

    // MARK: 최애 팀

    private var pool: [Team] {
        store.teams.filter { picked.contains($0.leagueId) }
    }
    private var results: [Team] {
        pool.filter { Hangul.matches(query, $0.name, $0.abbr) }
    }
    private var full: Bool { favorites.count >= maxFavorites }

    private var teamStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("최애 팀을 골라주세요").font(T.display(26))
                Text("내 팀 경기는 피드 맨 위에 따로 모아드려요. 최대 \(maxFavorites)팀까지 고를 수 있고, 점수 규칙은 똑같아요.")
                    .font(T.body(12)).foregroundStyle(T.ink3).padding(.top, 8)

                HStack(spacing: 9) {
                    Image(systemName: "magnifyingglass").foregroundStyle(T.ink3)
                    TextField("팀 이름 검색 (아스날, ㅇㅅㄴ)", text: $query)
                        .font(T.body(14)).autocorrectionDisabled()
                    if !query.isEmpty {
                        Button { query = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(T.ink3)
                        }
                    }
                }
                .padding(.horizontal, 14).frame(height: 48)
                .background(T.card, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(T.line, lineWidth: 1.5))
                .padding(.top, 18)

                if !favorites.isEmpty {
                    FlowRow(spacing: 7) {
                        ForEach(favorites, id: \.self) { id in
                            let t = store.team(id)
                            Button {
                                Haptics.tap()
                                favorites.removeAll { $0 == id }
                            } label: {
                                HStack(spacing: 6) {
                                    Text(t.name).font(T.body(13, .heavy))
                                    Image(systemName: "xmark").font(.system(size: 10, weight: .black))
                                }
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12).frame(height: 32)
                                .background(T.gradAccent, in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.top, 14)
                }

                if results.isEmpty {
                    Text("‘\(query)’ 와 맞는 팀이 없어요.")
                        .font(T.body(12)).foregroundStyle(T.ink3)
                        .frame(maxWidth: .infinity).padding(.vertical, 40)
                } else {
                    ForEach(store.orderedLeagues.filter { l in picked.contains(l.id) }) { l in
                        let teams = results.filter { $0.leagueId == l.id }
                            .sorted { $0.name < $1.name }
                        if !teams.isEmpty {
                            Text(l.name)
                                .font(T.body(11, .heavy)).foregroundStyle(T.ink3)
                                .padding(.top, 16).padding(.bottom, 6)
                            VStack(spacing: 6) { ForEach(teams) { teamRow($0) } }
                        }
                    }
                }
            }
            .padding(.horizontal, 20).padding(.top, 24)
        }
    }

    private func teamRow(_ t: Team) -> some View {
        let on = favorites.contains(t.id)
        return Button {
            Haptics.tap()
            withAnimation(T.spring) {
                if on { favorites.removeAll { $0 == t.id } }
                else if !full { favorites.append(t.id) }
            }
        } label: {
            HStack(spacing: 11) {
                Crest(team: t, size: 30)
                Text(t.name).font(T.body(13, on ? .heavy : .semibold))
                Spacer()
                if on {
                    Image(systemName: "checkmark").font(.system(size: 11, weight: .black))
                        .foregroundStyle(.white)
                        .frame(width: 21, height: 21).background(T.gradAccent, in: Circle())
                }
            }
            .padding(.horizontal, 12).frame(height: 58)
            .background(on ? T.accentSoft : T.card, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(on ? T.accent : .clear, lineWidth: 1.5))
            .opacity(!on && full ? 0.4 : 1)
        }
        .buttonStyle(.plain)
        .disabled(!on && full)
    }
}

/// 칩을 줄바꿈해서 흘려 놓는다 (iOS 16 에는 Layout 이 있지만 간단히 직접 계산한다)
struct FlowRow<Content: View>: View {
    var spacing: CGFloat = 7
    @ViewBuilder var content: Content

    var body: some View {
        HStack(spacing: spacing) { content }
    }
}
