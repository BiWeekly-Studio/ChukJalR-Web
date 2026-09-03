import SwiftUI

/// 경기 채팅의 상태를 한 곳에 모은다.
///
/// 과거 50건은 REST 로 받고, 그 뒤로는 Realtime Broadcast 로 들어온다.
/// 내가 보낸 말도 브로드캐스트로 되돌아온다 — 화면에 미리 붙이면 서버가
/// 거절했을 때(레이트 리밋·금칙어) 없는 메시지가 남는다.
@MainActor
final class MatchChat: ObservableObject {
    @Published private(set) var messages: [ChatMessage] = []
    @Published private(set) var viewers = 0
    @Published var notice: String?
    @Published private(set) var sending = false

    /// 신고·차단은 서버에 남지만, 지금 화면에서도 즉시 치워야 조치된 느낌이 든다
    @Published private(set) var hidden: Set<Int> = []
    @Published private(set) var blocked: Set<String> = []

    private let fixtureId: Int
    private let repo: any Repository = Repositories.current
    private var channel: RealtimeChannel?

    init(fixtureId: Int) { self.fixtureId = fixtureId }

    var visible: [ChatMessage] {
        messages.filter { !hidden.contains($0.id) && !blocked.contains($0.userId) }
    }

    func start() async {
        myId = await Supabase.shared.currentUser?.id
        // 채팅을 못 불러와도 경기 정보는 보여야 한다
        messages = (try? await repo.loadChat(fixtureId: fixtureId)) ?? []

        let channel = RealtimeChannel(
            channel: "match:\(fixtureId)",
            onMessage: { [weak self] m in
                Task { @MainActor in self?.append(m) }
            },
            onPresence: { [weak self] n in
                Task { @MainActor in self?.viewers = n }
            })
        self.channel = channel
        let token = await Supabase.shared.accessToken
        await channel.connect(accessToken: token)
        await channel.track()
    }

    func stop() {
        let channel = self.channel
        self.channel = nil
        Task { await channel?.disconnect() }
    }

    func send(_ raw: String) async {
        let body = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !sending else { return }
        sending = true
        defer { sending = false }
        Haptics.tap()
        do {
            try await repo.sendChat(fixtureId: fixtureId, body: body)
        } catch {
            // 필터에 걸렸으면 왜 막혔는지 알려줘야 한다. 조용히 사라지면 버그로 보인다.
            notice = error.localizedDescription
        }
    }

    func report(_ m: ChatMessage, _ reason: ReportReason) async {
        hidden.insert(m.id)
        do {
            try await repo.reportMessage(id: m.id, reason: reason)
            notice = "신고했어요. 운영자가 확인합니다."
        } catch {
            hidden.remove(m.id)
            notice = error.localizedDescription
        }
    }

    func block(_ m: ChatMessage) async {
        blocked.insert(m.userId)
        do {
            try await repo.blockUser(id: m.userId)
            notice = "차단했어요. 이 사람의 메시지는 보이지 않아요."
        } catch {
            blocked.remove(m.userId)
            notice = error.localizedDescription
        }
    }

    private func append(_ incoming: RealtimeChannel.Incoming) {
        guard !messages.contains(where: { $0.id == incoming.id }) else { return }
        messages.append(ChatMessage(
            id: incoming.id,
            userId: incoming.userId,
            handle: incoming.handle,
            body: incoming.body,
            at: incoming.at,
            mine: incoming.userId == myId))
    }

    /// 내 메시지인지 가리는 데만 쓴다. start() 에서 한 번 채운다.
    private var myId: String?
}
