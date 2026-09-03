import SwiftUI

/// 경기 상세 — 대진, 여론 분포, 내 예측, 그리고 경기 채팅.
/// 웹의 src/screens/MatchDetail.tsx 와 같은 구성이다.
struct MatchDetailView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    let fixture: Fixture

    @StateObject private var chat: MatchChat
    @State private var draft = ""
    @State private var settlement: Settlement?
    @State private var reporting: ChatMessage?
    @FocusState private var composing: Bool

    init(fixture: Fixture) {
        self.fixture = fixture
        _chat = StateObject(wrappedValue: MatchChat(fixtureId: fixture.id))
    }

    private var home: Team { store.team(fixture.homeTeamId) }
    private var away: Team { store.team(fixture.awayTeamId) }
    private var saved: Prediction? { store.predictions[fixture.id] }
    private var finished: Bool { fixture.window() == .finished }
    /// 진행 중 점수. 브로드캐스트로 받은 값이 있으면 그게 최신이다.
    private var liveHome: Int? { chat.live?.home ?? fixture.liveHome }
    private var liveAway: Int? { chat.live?.away ?? fixture.liveAway }
    private var elapsed: Int? { chat.live?.elapsed ?? fixture.elapsed }
    private var inPlay: Bool { !finished && liveHome != nil && liveAway != nil }
    private var chatState: ChatState { fixture.chat() }
    private var crowd: CrowdLevel { crowdLevel(fixture.participants) }
    private var showCrowd: Bool { fixture.baseline != nil && crowd != .none }

    private var pickLabel: String? {
        guard let saved else { return nil }
        switch saved.pick {
        case .home: return "\(home.name) 승"
        case .draw: return "무승부"
        case .away: return "\(away.name) 승"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            appbar
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        versus.padding(.horizontal, 20).padding(.top, 10)
                        distribution.padding(.horizontal, 20).padding(.top, 12)
                        myPick.padding(.horizontal, 20)
                        info.padding(.horizontal, 20)
                        chatHead.padding(.horizontal, 20).padding(.top, 20)
                        chatBody.padding(.top, 4)
                        Color.clear.frame(height: 8).id(bottomAnchor)
                    }
                    .padding(.bottom, 12)
                }
                .onChange(of: chat.visible.count) { _ in
                    withAnimation(T.ease) { proxy.scrollTo(bottomAnchor, anchor: .bottom) }
                }
            }
            if chatState == .open { composer }
        }
        .background(T.paper)
        .overlay(alignment: .bottom) { toast }
        .task {
            await chat.start()
            settlement = try? await Repositories.current.loadSettlement(fixtureId: fixture.id)
            startLiveActivity()
        }
        .onChange(of: chat.live?.home) { _ in pushLiveActivity() }
        .onChange(of: chat.live?.away) { _ in pushLiveActivity() }
        .onChange(of: chat.live?.elapsed) { _ in pushLiveActivity() }
        .onDisappear { chat.stop() }
        .confirmationDialog("이 메시지를 신고할까요?", isPresented: reportingBinding, titleVisibility: .visible) {
            if let m = reporting {
                ForEach(ReportReason.allCases, id: \.self) { reason in
                    Button(reason.label) { Task { await chat.report(m, reason) } }
                }
                Button("이 사람 차단", role: .destructive) { Task { await chat.block(m) } }
            }
            Button("취소", role: .cancel) {}
        }
    }

    // MARK: Live Activity
    //
    // 채팅방에 들어가면 띄우고, 나가도 경기가 끝날 때까지 남긴다 — 앱을 닫아도
    // 점수를 보는 게 이 기능의 존재 이유다. 그래서 onDisappear 에서 끝내지 않는다.

    private func startLiveActivity() {
        guard #available(iOS 16.2, *), fixture.chat() == .open else { return }
        LiveScore.start(fixture: fixture, home: home, away: away, myPick: saved?.pick)
        pushLiveActivity()
    }

    private func pushLiveActivity() {
        guard #available(iOS 16.2, *), let h = liveHome, let a = liveAway else { return }
        // 내 예측이 지금 맞고 있는지. 예측이 없으면 nil 이고, 위젯도 그 자리를 비운다.
        let leading: Bool? = saved.map { p in
            switch p.pick {
            case .home: return h > a
            case .draw: return h == a
            case .away: return a > h
            }
        }
        let status: MatchActivityAttributes.ContentState.Status =
            finished ? .finished : (chat.live?.state == "FINISHED" ? .finished : .live)

        Task {
            if status == .finished {
                await LiveScore.end(fixtureId: fixture.id, home: h, away: a, myPickLeading: leading)
            } else {
                await LiveScore.update(fixtureId: fixture.id, home: h, away: a,
                                       minute: elapsed, status: status, myPickLeading: leading)
            }
        }
    }

    private let bottomAnchor = "chat-bottom"
    private var reportingBinding: Binding<Bool> {
        Binding(get: { reporting != nil }, set: { if !$0 { reporting = nil } })
    }

    // MARK: 머리

    private var appbar: some View {
        HStack(spacing: 8) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(T.ink)
                    .frame(width: 40, height: 40)
                    .background(T.card, in: Circle())
            }
            Spacer(minLength: 0)
            Text("\(home.name) vs \(away.name)")
                .font(T.display(15, .heavy))
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
            Color.clear.frame(width: 40, height: 40)
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 8)
        .background(T.paper)
    }

    // MARK: 대진 배너

    private var versus: some View {
        VStack(spacing: 0) {
            HStack {
                Text(leagueLine)
                    .font(T.body(11, .semibold)).foregroundStyle(T.accentDeep)
                Spacer(minLength: 6)
                if let v = fixture.venue {
                    Text(v).font(T.body(11)).foregroundStyle(T.ink3).lineLimit(1)
                }
            }
            HStack(alignment: .top, spacing: 6) {
                side(home)
                VStack(spacing: 7) {
                    if inPlay {
                        LivePill()
                    } else {
                        Text(finished ? "FT" : "VS")
                            .font(T.display(10, .heavy)).foregroundStyle(.white)
                            .padding(.horizontal, 9).padding(.vertical, 4)
                            .background(T.gradAccent, in: Capsule())
                    }
                    Text(scoreLine)
                        .font(T.num(finished || inPlay ? 26 : 20, .heavy))
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text(finished ? "경기 종료"
                         : inPlay ? (elapsed.map { "\($0)분 진행" } ?? "진행 중")
                         : "킥오프")
                        .font(T.body(11)).foregroundStyle(T.ink3)
                }
                .padding(.horizontal, 4)
                side(away)
            }
            .padding(.top, 16)
        }
        .padding(16)
        .background(T.card, in: RoundedRectangle(cornerRadius: 22))
        .shadow(color: .black.opacity(0.10), radius: 14, y: 6)
    }

    private var scoreLine: String {
        if finished { return "\(fixture.homeGoals ?? 0) : \(fixture.awayGoals ?? 0)" }
        if inPlay { return "\(liveHome ?? 0) : \(liveAway ?? 0)" }
        return Fmt.kickoff(fixture.kickoffAt)
    }

    private var leagueLine: String {
        let l = store.league(fixture.leagueId).name
        return fixture.round.map { "\(l) \($0)R" } ?? l
    }

    private func side(_ t: Team) -> some View {
        VStack(spacing: 9) {
            Crest(team: t, size: 50)
            Text(t.name)
                .font(T.body(13, .heavy)).multilineTextAlignment(.center)
                .lineLimit(2).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: 여론 분포

    @ViewBuilder private var distribution: some View {
        if showCrowd, let q = fixture.baseline {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(crowd == .solid ? "다른 사람들은 이렇게 봤어요" : "지금까지의 예상 확률")
                        .font(T.display(14, .heavy))
                    Spacer(minLength: 6)
                    if let n = fixture.participants {
                        Label("\(Fmt.comma(n))명", systemImage: "person.2.fill")
                            .font(T.body(10.5, .semibold)).foregroundStyle(T.ink2)
                    }
                }
                distBar(q).padding(.top, 12)
                if crowd == .thin, let n = fixture.participants {
                    Text("아직 예측이 \(n)명뿐이라, 이 확률은 대부분 기본 예상치예요. "
                         + "사람이 모일수록 실제 판단 쪽으로 옮겨갑니다.")
                        .font(T.body(11)).foregroundStyle(T.ink3)
                        .lineSpacing(3).padding(.top, 10)
                }
                legend(q).padding(.top, 11)
            }
            .padding(EdgeInsets(top: 14, leading: 16, bottom: 16, trailing: 16))
            .background(T.card, in: RoundedRectangle(cornerRadius: 20))
            .shadow(color: .black.opacity(0.08), radius: 12, y: 5)
        } else {
            // 여론이 없으면 분포를 그리지 않는다 — 빈 자리를 그럴듯한 숫자로 채우면 그게 가짜다
            VStack(spacing: 6) {
                Text("아직 아무도 예측하지 않았어요").font(T.display(13, .heavy))
                Text("예측이 모이면 사람들이 어느 쪽을 봤는지 여기에 나와요.")
                    .font(T.body(11)).foregroundStyle(T.ink3).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18).padding(.horizontal, 16)
            .background(T.card, in: RoundedRectangle(cornerRadius: 20))
            .shadow(color: .black.opacity(0.08), radius: 12, y: 5)
        }
    }

    /// 홈 · 무 · 원정. 키 컬러와 반대편 색을 써서 한눈에 갈린다.
    private func segment(_ i: Int) -> AnyShapeStyle {
        switch i {
        case 0: return AnyShapeStyle(T.gradAccent)
        case 1: return AnyShapeStyle(T.lineStrong)
        default: return AnyShapeStyle(LinearGradient(
            colors: [Color(hex: 0xFF7A4A), Color(hex: 0xD1492A)],
            startPoint: .leading, endPoint: .trailing))
        }
    }
    private func dot(_ i: Int) -> Color { [T.accent, T.lineStrong, T.cool][i] }

    private func distBar(_ q: Distribution) -> some View {
        GeometryReader { geo in
            HStack(spacing: 2) {
                ForEach(0..<3, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 4)
                        .fill(segment(i))
                        .frame(width: max(0, (geo.size.width - 4) * q[i]))
                }
            }
        }
        .frame(height: 12)
    }

    private func legend(_ q: Distribution) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(Outcome.allCases.enumerated()), id: \.element) { i, o in
                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 3).fill(dot(i)).frame(width: 8, height: 8)
                    Text(o == .home ? home.name : o == .away ? away.name : "무")
                        .font(T.body(11)).foregroundStyle(T.ink3).lineLimit(1)
                    Text(Fmt.pct(q[i])).font(T.num(14, .heavy))
                }
                .frame(maxWidth: i == 1 ? nil : .infinity,
                       alignment: i == 2 ? .trailing : .leading)
            }
        }
    }

    // MARK: 내 예측 · 결과

    @ViewBuilder private var myPick: some View {
        if let saved, let label = pickLabel {
            if finished, let s = settlement {
                banner(win: s.won,
                       title: "\(s.won ? "적중" : "실패") · \(label)",
                       trailing: "지수 \(Fmt.signed(s.deltaRating)) · +\(s.points)점")
                    .padding(.top, 12)
            } else if !finished, let q = fixture.baseline {
                let p = Scoring.preview(q, saved.pick, saved.confidence, streak: store.me.streak)
                banner(win: true,
                       title: "내 예측 · \(label)",
                       trailing: "\(saved.confidence.label) · \(Fmt.signed(p.ifCorrect))")
                    .padding(.top, 12)
            }
        }
    }

    private func banner(win: Bool, title: String, trailing: String) -> some View {
        HStack(spacing: 10) {
            Tick(win: win)
            Text(title).font(T.display(14, .heavy))
            Spacer(minLength: 6)
            Text(trailing).font(T.body(11)).opacity(0.92)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 14).frame(minHeight: 54)
        .frame(maxWidth: .infinity)
        .background(win ? AnyShapeStyle(T.gradAccent) : AnyShapeStyle(T.ink2),
                    in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: 곁들이 정보

    @ViewBuilder private var info: some View {
        VStack(spacing: 12) {
            EventTimeline(events: chat.info.events, homeTeamId: fixture.homeTeamId)
            MatchStatsView(stats: chat.info.stats, homeTeamId: fixture.homeTeamId)
            LineupsView(lineups: chat.info.lineups, homeTeamId: fixture.homeTeamId)
            if let h2h = chat.info.h2h {
                HeadToHeadView(h2h: h2h, homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId)
            }
        }
        .padding(.top, 12)
    }

    // MARK: 채팅

    private var chatHead: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 9) {
                Circle()
                    .fill(chatState == .open ? T.accent : T.lineStrong)
                    .frame(width: 8, height: 8)
                Text("경기 채팅").font(T.display(14, .heavy))
                if chatState == .open {
                    Text("LIVE").font(T.display(10, .heavy)).foregroundStyle(.white)
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(T.gradAccent, in: Capsule())
                }
                Text(chatStatus).font(T.body(11)).foregroundStyle(T.ink3)
                    .lineLimit(1).minimumScaleFactor(0.85)
                Spacer(minLength: 0)
            }
            if chatState != .before {
                Text("욕설·도배·홍보는 신고할 수 있어요. 신고 3건이 쌓이면 자동으로 가려지고 운영자가 확인합니다.")
                    .font(T.body(10.5)).foregroundStyle(T.ink3).lineSpacing(2)
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(T.card2, in: RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private var chatStatus: String {
        switch chatState {
        case .before: return "\(Fmt.kickoff(fixture.chatOpensAt))에 열려요"
        case .closed: return "채팅이 끝났어요"
        case .open:   return chat.viewers > 1 ? "\(chat.viewers)명이 함께 보고 있어요" : "지금은 혼자 보고 있어요"
        }
    }

    @ViewBuilder private var chatBody: some View {
        if chatState == .before {
            Text("경기 시작 1시간 전에 채팅이 열려요.\n그때 같이 보면서 이야기해요.")
                .font(T.body(13)).foregroundStyle(T.ink3)
                .multilineTextAlignment(.center).lineSpacing(4)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 32).padding(.top, 28).padding(.bottom, 20)
        } else if chat.visible.isEmpty {
            Text(chatState == .closed ? "오간 이야기가 없어요." : "아직 아무도 말이 없어요. 먼저 열어보세요.")
                .font(T.body(13)).foregroundStyle(T.ink3)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 32).padding(.top, 28).padding(.bottom, 20)
        } else {
            LazyVStack(alignment: .leading, spacing: 12) {
                ForEach(chat.visible) { m in
                    MessageRow(message: m) { reporting = m }
                }
            }
            .padding(.horizontal, 20).padding(.top, 10)
        }
    }

    private var composer: some View {
        HStack(spacing: 9) {
            TextField("이 경기 어떻게 보세요?", text: $draft, axis: .vertical)
                .font(T.body(14))
                .lineLimit(1...4)
                .focused($composing)
                .submitLabel(.send)
                .onChange(of: draft) { v in
                    // 서버가 300자에서 자른다. 넘겨 보내고 거절당하기보다 여기서 막는다.
                    if v.count > 300 { draft = String(v.prefix(300)) }
                }
                .padding(.horizontal, 16).frame(minHeight: 44)
                .background(T.card, in: Capsule())
                .overlay(Capsule().stroke(T.line, lineWidth: 1))

            Button {
                let body = draft
                draft = ""
                Task { await chat.send(body) }
            } label: {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(T.gradAccent, in: Circle())
            }
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || chat.sending)
            .opacity(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.4 : 1)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Rectangle().fill(T.line).frame(height: 1) }
    }

    @ViewBuilder private var toast: some View {
        if let notice = chat.notice {
            Text(notice)
                .font(T.body(12.5, .semibold)).foregroundStyle(.white)
                .padding(.horizontal, 16).padding(.vertical, 11)
                .background(T.ink.opacity(0.92), in: Capsule())
                .padding(.bottom, 78)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .onTapGesture { chat.notice = nil }
                .task {
                    try? await Task.sleep(nanoseconds: 3_200_000_000)
                    chat.notice = nil
                }
        }
    }
}

/// 말풍선 한 줄. 내 말은 오른쪽, 남의 말은 왼쪽에 붙는다.
private struct MessageRow: View {
    let message: ChatMessage
    let onReport: () -> Void

    private static let hhmm: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "HH:mm"; return f
    }()

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if message.mine { Spacer(minLength: 40) }
            if !message.mine {
                Text(message.initial)
                    .font(T.display(12, .heavy)).foregroundStyle(T.ink2)
                    .frame(width: 30, height: 30)
                    .background(T.card2, in: Circle())
            }
            VStack(alignment: message.mine ? .trailing : .leading, spacing: 4) {
                HStack(spacing: 6) {
                    if !message.mine {
                        Text(message.handle).font(T.body(11, .heavy)).foregroundStyle(T.ink2)
                    }
                    Text(Self.hhmm.string(from: message.at))
                        .font(T.body(11)).foregroundStyle(T.ink4)
                    if !message.mine {
                        Button(action: onReport) {
                            Image(systemName: "ellipsis")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(T.ink4)
                                .frame(width: 22, height: 18)
                        }
                    }
                }
                Text(message.body)
                    .font(T.body(14)).foregroundStyle(message.mine ? .white : T.ink)
                    .padding(.horizontal, 13).padding(.vertical, 9)
                    .background(message.mine ? AnyShapeStyle(T.gradAccent) : AnyShapeStyle(T.card),
                                in: RoundedRectangle(cornerRadius: 15))
                    .frame(maxWidth: 260, alignment: message.mine ? .trailing : .leading)
            }
            if !message.mine { Spacer(minLength: 40) }
        }
        .frame(maxWidth: .infinity, alignment: message.mine ? .trailing : .leading)
    }
}
