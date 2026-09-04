import SwiftUI

/// 경기 카드. 보기를 고르면 확신도 단계가 열린다 — 이 앱의 핵심 동작이다.
struct MatchCardView: View {
    @EnvironmentObject var store: Store
    let fixture: Fixture
    var index: Int = 0
    /// 대진 머리를 누르면 경기 상세로. 보기 버튼은 그대로 예측에 쓰인다.
    var onOpen: () -> Void = {}

    @State private var appeared = false

    @State private var draft: Outcome?
    @State private var hover: Confidence = .fairly

    private var saved: Prediction? { store.predictions[fixture.id] }
    private var phase: WindowState { fixture.window() }
    private var canPredict: Bool { phase == .open }
    private var active: Outcome? { canPredict ? draft : nil }
    private var crowd: CrowdLevel { crowdLevel(fixture.participants) }
    private var showCrowd: Bool { fixture.baseline != nil && crowd != .none }

    private var home: Team { store.team(fixture.homeTeamId) }
    private var away: Team { store.team(fixture.awayTeamId) }

    private func label(_ o: Outcome) -> String {
        switch o {
        case .home: return "\(home.name) 승"
        case .draw: return "무승부"
        case .away: return "\(away.name) 승"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if store.isFavorite(fixture) {
                Rectangle()
                    .fill(Color(hex: store.me.favoriteTeamIds.contains(fixture.homeTeamId)
                                ? home.colorHex : away.colorHex))
                    .frame(height: 5)
                    .padding(.bottom, 14)
            }

            header
            // 코치마크는 첫 카드만 가리킨다 — 같은 키가 여러 개면 어디를 뚫을지 알 수 없다
            options.padding(.top, 14).tour("options", when: index == 0)

            if let active {
                confidence(active).padding(.top, 14).tour("confidence", when: index == 0)
            }
            else { footline.padding(.top, 12) }
        }
        .padding(store.isFavorite(fixture)
                 ? EdgeInsets(top: 0, leading: 15, bottom: 15, trailing: 15)
                 : EdgeInsets(top: 15, leading: 15, bottom: 15, trailing: 15))
        .background(T.card, in: RoundedRectangle(cornerRadius: 22))
        .shadow(color: .black.opacity(0.10), radius: 14, y: 6)
        .overlay { Burst(seed: burstSeed, label: burstLabel) }
        .animation(T.spring, value: draft)
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 16)
        .onAppear {
            withAnimation(T.spring.delay(Double(index) * 0.055)) { appeared = true }
        }
    }

    // MARK: 머리

    private var header: some View {
        Button(action: { Haptics.tap(); onOpen() }) {
        HStack(spacing: 10) {
            CrestPair(home: home, away: away)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(home.name).font(T.display(16, .heavy))
                    RankTag(rank: store.rank(fixture.homeTeamId))
                    Text("vs").font(T.display(16, .heavy)).foregroundStyle(T.ink4)
                    Text(away.name).font(T.display(16, .heavy))
                    RankTag(rank: store.rank(fixture.awayTeamId))
                }
                .lineLimit(1).minimumScaleFactor(0.8)

                Text(subtitle).font(T.body(11)).foregroundStyle(T.ink3).lineLimit(1)
            }
            Spacer(minLength: 4)
            statusChip
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .bold)).foregroundStyle(T.ink4)
        }
        .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var subtitle: String {
        var parts = [store.league(fixture.leagueId).name]
        if let r = fixture.round { parts[0] += " \(r)R" }
        if phase == .finished, let h = fixture.homeGoals, let a = fixture.awayGoals {
            parts.append("종료 \(h) : \(a)")
        } else if let h = fixture.liveHome, let a = fixture.liveAway {
            // 진행 중이면 경기장·킥오프 대신 지금 점수를 보여준다. 그게 더 궁금하다.
            parts.append(fixture.elapsed.map { "\($0)' \(h) : \(a)" } ?? "\(h) : \(a)")
        } else {
            if let v = fixture.venue { parts.append(v) }
            parts.append(Fmt.kickoff(fixture.kickoffAt))
        }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder private var statusChip: some View {
        if phase == .finished, let saved {
            let hit = saved.pick == fixture.result
            Chip(text: hit ? "적중" : "실패", icon: hit ? "checkmark" : "xmark",
                 style: hit ? .win : .plain)
        } else if saved != nil, active == nil {
            Chip(text: "예측함", icon: "checkmark", style: .solid)
        } else if phase == .locked {
            Chip(text: "마감", style: .plain)
        }
    }

    // MARK: 보기

    private var options: some View {
        VStack(spacing: 8) {
            ForEach(Array(Outcome.allCases.enumerated()), id: \.element) { i, o in
                optionRow(o, index: i)
            }
        }
    }

    private func optionRow(_ o: Outcome, index: Int) -> some View {
        let chosen = saved?.pick == o
        let isDraft = active == o
        let isResult = phase == .finished && fixture.result == o
        let hit = isResult && chosen
        let dim = phase == .finished ? (!isResult && !chosen)
                                     : (saved != nil && !chosen && active == nil)

        return Button {
            guard canPredict else { return }
            Haptics.tap()
            draft = (draft == o) ? nil : o
        } label: {
            HStack(spacing: 8) {
                if chosen && (phase == .finished || active == nil) {
                    Tick(win: phase != .finished || hit)
                }
                Text(label(o))
                    .font(T.body(14, chosen || isResult ? .heavy : .semibold))
                    .foregroundStyle(T.ink)
                Spacer(minLength: 8)
                if showCrowd, let q = fixture.baseline {
                    Text(Fmt.pct(q[o.index]))
                        .font(T.num(15, .heavy))
                        .foregroundStyle(hit ? T.win : T.ink2)
                } else if canPredict {
                    // 여론이 없을 때도 누를 수 있는 줄이라는 게 보여야 한다
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(T.ink4)
                }
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 50)
            // 배경(T.card)은 Button 바깥에 있어서 눌리는 범위를 넓혀주지 않는다.
            // 이게 없으면 글자와 화살표만 눌리고 줄 가운데는 죽은 공간이 된다.
            .contentShape(Rectangle())
            // 채움 막대는 배경으로 깐다. GeometryReader 를 본문에 두면
            // 자식이 위쪽에 붙어서, 막대가 없을 때 글자가 위로 쏠린다.
            .background(alignment: .leading) {
                if showCrowd, let q = fixture.baseline {
                    GeometryReader { geo in
                        fillColor(o).frame(width: geo.size.width * q[o.index])
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(!canPredict)
        .background(T.card)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(chosen || isDraft || isResult ? T.accent : T.line,
                        lineWidth: chosen || isDraft || isResult ? 2 : 1.5))
        .opacity(dim || (!canPredict && phase != .finished) ? 0.45 : 1)
    }

    private func fillColor(_ o: Outcome) -> Color {
        switch o {
        case .home: return T.accentSoft
        case .draw: return T.card2
        case .away: return T.coolSoft
        }
    }

    // MARK: 확신도

    private func confidence(_ pick: Outcome) -> some View {
        let preview = fixture.baseline.map {
            Scoring.preview($0, pick, hover, streak: store.me.streak)
        }
        return VStack(alignment: .leading, spacing: 0) {
            Divider().overlay(T.line).padding(.bottom, 14)

            (Text(label(pick)).foregroundColor(T.accent).font(T.body(12, .heavy))
             + Text(" — 얼마나 확신하세요?").font(T.body(12, .semibold)))

            HStack(spacing: 8) {
                ForEach(Confidence.allCases, id: \.self) { c in
                    Button {
                        Haptics.tap()
                        if hover == c { commit(pick, c) } else { hover = c }
                    } label: {
                        VStack(spacing: 3) {
                            HStack(spacing: 3) {
                                ForEach(1...3, id: \.self) { d in
                                    Circle()
                                        .fill(hover == c ? Color.white : T.ink2)
                                        .opacity(d <= c.rawValue ? 1 : 0.3)
                                        .frame(width: 6, height: 6)
                                }
                            }
                            Text(c.label).font(T.body(11.5, .heavy))
                        }
                        .frame(maxWidth: .infinity, minHeight: 58)
                        .foregroundStyle(hover == c ? .white : T.ink2)
                        .background(hover == c ? AnyShapeStyle(T.gradAccent) : AnyShapeStyle(T.card2),
                                    in: RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 10)

            if let preview {
                HStack(spacing: 8) {
                    Text("맞히면").font(T.body(11)).foregroundStyle(T.ink3)
                    Text(Fmt.signed(preview.ifCorrect)).font(T.num(15)).foregroundStyle(T.win)
                    Text("틀리면").font(T.body(11)).foregroundStyle(T.ink3)
                    Text(Fmt.signed(preview.ifWrong)).font(T.num(15)).foregroundStyle(T.ink3)
                    Spacer()
                    Text("+\(preview.pointsIfCorrect)점")
                        .font(T.body(11, .heavy)).foregroundStyle(.white)
                        .padding(.horizontal, 9).frame(height: 23)
                        .background(T.gradGold, in: Capsule())
                }
                .padding(.top, 12)
            } else {
                Text("아직 예측이 모이지 않아 점수 폭이 정해지지 않았어요. 마감 때 서버가 계산합니다.")
                    .font(T.body(11)).foregroundStyle(T.ink3)
                    .padding(.top, 12)
            }

            Button("이걸로 예측하기") { commit(pick, hover) }
                .buttonStyle(CTAStyle())
                .padding(.top, 12)

            if hover == .certain {
                Text("확신은 아껴 쓰세요. 속으로 80% 이상 확신할 때만 이득입니다.")
                    .font(T.body(11)).foregroundStyle(T.ink3)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 9)
            }
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    private func commit(_ pick: Outcome, _ c: Confidence) {
        Haptics.success()
        store.predict(fixture, pick, c)
        draft = nil
    }

    /// 방금 이 경기를 확정했을 때만 값이 생긴다 — 다른 카드에서는 터지지 않는다
    private var burstSeed: Int? {
        store.celebrated?.fixtureId == fixture.id ? store.celebrated?.stamp : nil
    }
    /// 기준선이 없으면 얻을 점수를 계산할 근거가 없다. 숫자를 지어내지 않는다.
    private var burstLabel: String {
        store.celebrated?.points.map { "+\($0)점 예약" } ?? "예측 완료"
    }

    // MARK: 아래 한 줄

    @ViewBuilder private var footline: some View {
        HStack(spacing: 8) {
            if phase == .upcoming {
                Text(Fmt.opens(fixture.opensAt)).font(T.body(11)).foregroundStyle(T.ink3)
                Spacer()
                Text("경기 당일에만 예측할 수 있어요").font(T.body(11)).foregroundStyle(T.ink3)
            } else if let saved {
                Text(saved.confidence.label).font(T.body(11)).foregroundStyle(T.ink3)
                if let q = fixture.baseline {
                    let p = Scoring.preview(q, saved.pick, saved.confidence, streak: store.me.streak)
                    Text("·").foregroundStyle(T.ink3)
                    Text("맞히면 \(Fmt.signed(p.ifCorrect)) / 틀리면 \(Fmt.signed(p.ifWrong))")
                        .font(T.body(11)).foregroundStyle(T.ink3)
                    Spacer()
                    Text("+\(p.pointsIfCorrect)점")
                        .font(T.body(11, .heavy)).foregroundStyle(T.gold)
                        .padding(.horizontal, 9).frame(height: 23)
                        .background(T.goldSoft, in: Capsule())
                } else {
                    Spacer()
                    Text("점수는 마감 때 정해져요").font(T.body(11)).foregroundStyle(T.ink3)
                }
            } else {
                Text(phase == .locked ? "예측이 마감됐어요"
                     : crowd == .none ? "아직 아무도 예측하지 않았어요"
                     : "\(fixture.participants ?? 0)명 예측 중")
                    .font(T.body(11)).foregroundStyle(T.ink3)
                Spacer()
                Text(phase == .locked ? "결과를 기다려요"
                     : crowd == .none ? "첫 예측자가 되어보세요"
                     : "보기를 누르면 확신도를 고를 수 있어요")
                    .font(T.body(11)).foregroundStyle(T.ink3)
            }
        }
        .lineLimit(1).minimumScaleFactor(0.85)
    }
}

/// 체크 표시. 확정 순간 톡 튀어나온다.
struct Tick: View {
    var win = true
    @State private var pop = false
    var body: some View {
        Image(systemName: win ? "checkmark" : "xmark")
            .font(.system(size: 11, weight: .black))
            .foregroundStyle(.white)
            .frame(width: 21, height: 21)
            .background(win ? AnyShapeStyle(T.gradAccent) : AnyShapeStyle(T.ink4), in: Circle())
            .scaleEffect(pop ? 1 : 0.2)
            .onAppear { withAnimation(T.spring) { pop = true } }
    }
}

struct Chip: View {
    enum Style { case solid, plain, win, gold }
    var text: String
    var icon: String?
    var style: Style = .plain

    var body: some View {
        HStack(spacing: 4) {
            if let icon { Image(systemName: icon).font(.system(size: 10, weight: .black)) }
            Text(text).font(T.body(11, .heavy))
        }
        .foregroundStyle(fg)
        .padding(.horizontal, 9).frame(height: 23)
        .background(bg, in: Capsule())
        .fixedSize()
    }

    private var fg: Color {
        switch style {
        case .solid: return .white
        case .plain: return T.ink2
        case .win: return T.win
        case .gold: return T.gold
        }
    }
    private var bg: AnyShapeStyle {
        switch style {
        case .solid: return AnyShapeStyle(T.gradAccent)
        case .plain: return AnyShapeStyle(T.card2)
        case .win: return AnyShapeStyle(T.winSoft)
        case .gold: return AnyShapeStyle(T.goldSoft)
        }
    }
}
