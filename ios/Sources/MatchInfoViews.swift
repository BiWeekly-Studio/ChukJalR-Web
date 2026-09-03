import SwiftUI

/// 경기 상세의 곁들이 정보 — 기록 · 선발 명단 · 맞대결 · 팀 기록.
///
/// 전부 "있으면 보여주고 없으면 아예 그리지 않는다". 선발 명단은 킥오프 한 시간쯤
/// 전에야 나오고, 이벤트는 경기가 시작해야 생긴다. 빈 카드를 미리 깔아두면
/// 화면이 고장 난 것처럼 보인다. 웹 src/components/MatchInfo.tsx 와 같은 구성이다.

/// 공통 껍데기. 카드 모양을 네 곳에서 반복하지 않는다.
struct InfoCard<Content: View>: View {
    let title: String
    var trailing: String?
    /// 넘기면 제목줄이 버튼이 되고 오른쪽에 화살표가 붙는다
    var collapsed: Binding<Bool>?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let collapsed {
                Button {
                    Haptics.tap()
                    withAnimation(T.ease) { collapsed.wrappedValue.toggle() }
                } label: {
                    head.overlay(alignment: .trailing) {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(T.ink3)
                            .rotationEffect(.degrees(collapsed.wrappedValue ? 0 : 180))
                    }
                }
                .buttonStyle(.plain)
            } else {
                head
            }
            content
        }
        .padding(EdgeInsets(top: 14, leading: 16, bottom: 16, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(T.card, in: RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.08), radius: 12, y: 5)
    }

    private var head: some View {
        HStack {
            Text(title).font(T.display(14, .heavy))
            Spacer(minLength: 6)
            if let trailing {
                Text(trailing).font(T.body(11)).foregroundStyle(T.ink3)
                    // 화살표 자리를 비워둔다. 겹치면 경기 수가 가려진다.
                    .padding(.trailing, collapsed == nil ? 0 : 20)
            }
        }
        .contentShape(Rectangle())
    }
}

// MARK: - 경기 기록 (이벤트)

struct EventTimeline: View {
    let events: [MatchEvent]
    let homeTeamId: Int

    private var shown: [MatchEvent] { events.filter { $0.mark != nil } }

    var body: some View {
        if !shown.isEmpty {
            InfoCard(title: "경기 기록") {
                VStack(spacing: 9) {
                    ForEach(shown) { e in row(e) }
                }
                .padding(.top, 12)
            }
        }
    }

    /// 홈은 왼쪽, 원정은 오른쪽으로 붙여 어느 팀 일인지 한눈에 보인다
    private func row(_ e: MatchEvent) -> some View {
        let home = e.teamId == homeTeamId
        return HStack(spacing: 8) {
            if !home { Spacer(minLength: 20) }
            if home { minute(e) }
            Text(e.mark ?? "").font(.system(size: 13)).frame(width: 18)
            VStack(alignment: home ? .leading : .trailing, spacing: 2) {
                Text(e.player ?? "—")
                    .font(T.body(13, .semibold)).foregroundStyle(tone(e))
                if let assist = e.assist {
                    Text(e.type == "subst" ? "→ \(assist)" : "도움 \(assist)")
                        .font(T.body(11)).foregroundStyle(T.ink3)
                }
            }
            .lineLimit(1)
            if !home { minute(e) }
            if home { Spacer(minLength: 20) }
        }
    }

    private func minute(_ e: MatchEvent) -> some View {
        Text(e.minuteLabel)
            .font(T.num(11)).foregroundStyle(T.ink3)
            .frame(width: 34, alignment: e.teamId == homeTeamId ? .leading : .trailing)
    }

    private func tone(_ e: MatchEvent) -> Color {
        let d = (e.detail ?? "").lowercased()
        if e.type == "Goal" { return d.contains("missed") ? T.ink3 : T.ink }
        if e.type == "Card" { return d.contains("red") ? T.cool : T.goldInk }
        return T.ink3
    }
}

// MARK: - 선발 명단

struct LineupsView: View {
    @EnvironmentObject var store: Store
    let lineups: [Lineup]
    let homeTeamId: Int

    var body: some View {
        if !lineups.isEmpty {
            // 홈을 왼쪽에 둔다. API 순서를 믿지 않는다.
            let ordered = lineups.sorted { a, _ in a.teamId == homeTeamId }
            InfoCard(title: "선발 명단") {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(ordered) { column($0) }
                }
                .padding(.top, 12)
            }
        }
    }

    private func column(_ l: Lineup) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(store.team(l.teamId).name)
                    .font(T.body(13, .heavy)).lineLimit(1)
                if let f = l.formation {
                    Text(f).font(T.body(10, .semibold)).foregroundStyle(T.ink2)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(T.card2, in: Capsule())
                }
            }
            VStack(alignment: .leading, spacing: 5) {
                ForEach(Array(l.starters.enumerated()), id: \.offset) { _, p in
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(p.number.map(String.init) ?? "")
                            .font(T.num(11)).foregroundStyle(T.ink3)
                            .frame(width: 16, alignment: .trailing)
                        Text(p.name ?? "—")
                            .font(T.body(11)).foregroundStyle(T.ink2).lineLimit(1)
                    }
                }
            }
            if let coach = l.coach {
                Text("감독 \(coach)").font(T.body(10)).foregroundStyle(T.ink3).padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - 맞대결

struct HeadToHeadView: View {
    @EnvironmentObject var store: Store
    let h2h: HeadToHead
    let homeTeamId: Int
    let awayTeamId: Int

    /// 접힘 상태는 사람마다 취향이 갈린다. 한 번 접은 사람은 다음 경기에서도 접힌 걸
    /// 보고 싶어 하므로 기기에 남긴다 — 경기별이 아니라 이 섹션 하나에 대한 취향이다.
    @AppStorage("chukjalal.h2h.collapsed") private var collapsed = false

    var body: some View {
        if h2h.played > 0 {
            InfoCard(title: "최근 맞대결", trailing: "\(h2h.played)경기",
                     collapsed: $collapsed) {
                VStack(spacing: 0) {
                    bar.padding(.top, 12)
                    HStack {
                        Text("\(store.team(homeTeamId).name) \(h2h.homeWins)승")
                        Spacer()
                        Text("무 \(h2h.draws)")
                        Spacer()
                        Text("\(store.team(awayTeamId).name) \(h2h.awayWins)승")
                    }
                    .font(T.body(11)).foregroundStyle(T.ink3)
                    .lineLimit(1).padding(.top, 10)

                    // 접어도 요약 막대는 남긴다. 카드의 값은 거기 있고,
                    // 길이를 만드는 건 아래 목록이다.
                    if !h2h.recent.isEmpty, !collapsed {
                        Divider().overlay(T.line2).padding(.top, 12)
                        VStack(spacing: 7) {
                            ForEach(h2h.recent) { m in recentRow(m) }
                        }
                        .padding(.top, 10)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
            }
        }
    }

    private var bar: some View {
        GeometryReader { geo in
            let total = max(1, h2h.played)
            let w = geo.size.width - 4
            HStack(spacing: 2) {
                seg(AnyShapeStyle(T.gradAccent), w * CGFloat(h2h.homeWins) / CGFloat(total))
                seg(AnyShapeStyle(T.lineStrong), w * CGFloat(h2h.draws) / CGFloat(total))
                seg(AnyShapeStyle(LinearGradient(colors: [Color(hex: 0xFF7A4A), Color(hex: 0xD1492A)],
                                                 startPoint: .leading, endPoint: .trailing)),
                    w * CGFloat(h2h.awayWins) / CGFloat(total))
            }
        }
        .frame(height: 12)
    }

    private func seg(_ style: AnyShapeStyle, _ width: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 4).fill(style).frame(width: max(0, width))
    }

    private static let day: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "yy.MM.dd"; return f
    }()

    private func recentRow(_ m: H2HMatch) -> some View {
        HStack(spacing: 8) {
            Text(m.date.map(Self.day.string(from:)) ?? "")
                .font(T.body(11)).foregroundStyle(T.ink3).frame(width: 58, alignment: .leading)
            Text(store.team(m.homeId).abbr)
                .font(T.body(11)).frame(maxWidth: .infinity, alignment: .trailing).lineLimit(1)
            Text("\(m.hg.map(String.init) ?? "-") : \(m.ag.map(String.init) ?? "-")")
                .font(T.num(12))
            Text(store.team(m.awayId).abbr)
                .font(T.body(11)).frame(maxWidth: .infinity, alignment: .leading).lineLimit(1)
        }
    }
}

// MARK: - 팀 기록

struct MatchStatsView: View {
    let stats: [TeamStats]
    let homeTeamId: Int

    /// 화면에 낼 항목만 고른다. API 는 20가지쯤 주는데 대부분 잡음이다.
    private static let rows: [(key: String, label: String)] = [
        ("Ball Possession", "점유율"),
        ("Total Shots", "슈팅"),
        ("Shots on Goal", "유효 슈팅"),
        ("Corner Kicks", "코너킥"),
        ("Fouls", "파울"),
        ("Yellow Cards", "경고"),
    ]

    var body: some View {
        if let home = stats.first(where: { $0.teamId == homeTeamId }),
           let away = stats.first(where: { $0.teamId != homeTeamId }) {
            let shown = Self.rows.filter { home.stats[$0.key] != nil || away.stats[$0.key] != nil }
            if !shown.isEmpty {
                InfoCard(title: "팀 기록") {
                    VStack(spacing: 0) {
                        ForEach(shown, id: \.key) { r in
                            row(r.label, home.stats[r.key], away.stats[r.key])
                        }
                    }
                    .padding(.top, 10)
                }
            }
        }
    }

    /// "54%" / "14" / nil 이 섞여 온다. 막대 길이용 숫자만 뽑고 표시는 원문 그대로.
    private func number(_ v: String?) -> Double {
        Double((v ?? "").replacingOccurrences(of: "%", with: "")) ?? 0
    }

    private func row(_ label: String, _ h: String?, _ a: String?) -> some View {
        let hn = number(h), an = number(a)
        let total = hn + an
        return HStack(spacing: 10) {
            Text(h ?? "-").font(T.num(12)).frame(width: 42, alignment: .leading)
            VStack(spacing: 4) {
                Text(label).font(T.body(11)).foregroundStyle(T.ink3)
                GeometryReader { geo in
                    let w = geo.size.width - 2
                    HStack(spacing: 2) {
                        RoundedRectangle(cornerRadius: 3).fill(T.accent)
                            .frame(width: total > 0 ? w * hn / total : w / 2)
                        RoundedRectangle(cornerRadius: 3).fill(T.cool)
                    }
                }
                .frame(height: 5)
            }
            Text(a ?? "-").font(T.num(12)).frame(width: 42, alignment: .trailing)
        }
        .padding(.vertical, 7)
    }
}

/// 진행 중 배지. 점이 뛰어야 '지금'이라는 게 전달된다.
struct LivePill: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var on = false

    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(.white).frame(width: 5, height: 5).opacity(on ? 0.25 : 1)
            Text("LIVE").font(T.display(10, .heavy))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 9).frame(height: 22)
        .background(T.cool, in: Capsule())
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.55).repeatForever(autoreverses: true)) { on = true }
        }
    }
}
