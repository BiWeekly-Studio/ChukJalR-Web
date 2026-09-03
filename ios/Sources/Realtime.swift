import Foundation

/// Supabase Realtime (Phoenix 채널) 최소 클라이언트.
///
/// 우리가 쓰는 건 두 가지뿐이다 — 경기 채팅 Broadcast 와, 지금 몇 명이 보고 있는지
/// 알려주는 Presence. 그래서 공식 SDK 대신 URLSessionWebSocketTask 로 직접 붙는다
/// (REST 쪽도 같은 이유로 직접 부른다 — Supabase.swift 참고).
///
/// 프레임은 Phoenix serializer v1 의 객체 인코딩이다:
/// {topic, event, payload, ref, join_ref}. vsn=2.0.0 의 배열 인코딩을 보내면
/// 서버가 오류도 없이 그냥 버린다 — 붙기는 하는데 아무것도 안 오는 상태가 된다.
actor RealtimeChannel {
    struct Incoming {
        let id: Int
        let userId: String
        let handle: String
        let body: String
        let at: Date
    }

    private let topic: String
    private var task: URLSessionWebSocketTask?
    private var ref = 0
    private let joinRef = "1"
    private var heartbeat: Task<Void, Never>?
    private var closed = false

    /// 진행 중 점수
    struct Live {
        let home: Int?
        let away: Int?
        let elapsed: Int?
        let state: String
    }

    private let onMessage: @Sendable (Incoming) -> Void
    private let onPresence: @Sendable (Int) -> Void
    private var onLive: (@Sendable (Live) -> Void)?
    private var onEvent: (@Sendable ([String: Any]) -> Void)?

    /// - Parameter channel: 서버가 쓰는 채널 이름 그대로 ("match:123")
    init(channel: String,
         onMessage: @escaping @Sendable (Incoming) -> Void,
         onPresence: @escaping @Sendable (Int) -> Void,
         onLive: (@Sendable (Live) -> Void)? = nil,
         onEvent: (@Sendable ([String: Any]) -> Void)? = nil) {
        self.topic = "realtime:" + channel
        self.onMessage = onMessage
        self.onPresence = onPresence
        self.onLive = onLive
        self.onEvent = onEvent
    }

    func connect(accessToken: String?) {
        guard task == nil, !closed else { return }

        var comps = URLComponents(string: Config.supabaseURL + "/realtime/v1/websocket")!
        comps.scheme = comps.scheme == "https" ? "wss" : "ws"
        comps.queryItems = [
            .init(name: "apikey", value: Config.supabaseAnonKey),
            .init(name: "vsn", value: "1.0.0"),
        ]
        let socket = URLSession.shared.webSocketTask(with: comps.url!)
        task = socket
        socket.resume()

        // 로그인한 사람으로 붙어야 RLS 가 건 채널을 읽을 수 있다.
        // broadcast.self 를 켜서 내가 보낸 말도 되돌아오게 한다 — 보내는 쪽에서
        // 화면에 미리 붙이면 서버가 거절했을 때 없는 메시지가 남는다.
        var payload: [String: Any] = [
            "config": [
                "broadcast": ["self": true],
                "presence": ["key": ""],
                "private": false,
            ],
        ]
        if let accessToken { payload["access_token"] = accessToken }
        send(event: "phx_join", payload: payload)
        receive()
        startHeartbeat()
    }

    func disconnect() {
        closed = true
        heartbeat?.cancel()
        heartbeat = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    /// 이 채널로 직접 broadcast 를 쏜다. self:true 로 붙었으므로 나에게도 되돌아온다 —
    /// DB 를 건드리지 않고 수신 경로만 검사할 때 쓴다 (Tests/realtime.sh).
    func echo(event: String, payload: [String: Any]) {
        send(event: "broadcast", payload: ["type": "broadcast", "event": event, "payload": payload])
    }

    /// 이 채널을 보고 있다고 알린다. Presence 인원수는 여기 참여한 사람만 센다.
    func track() {
        send(event: "presence", payload: [
            "type": "presence",
            "event": "track",
            "payload": ["at": Date().timeIntervalSince1970],
        ])
    }

    // MARK: 내부

    private func nextRef() -> String {
        ref += 1
        return String(ref)
    }

    private func send(event: String, payload: [String: Any], topic: String? = nil) {
        guard let task else { return }
        let frame: [String: Any] = [
            "topic": topic ?? self.topic,
            "event": event,
            "payload": payload,
            "ref": nextRef(),
            "join_ref": joinRef,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: frame),
              let text = String(data: data, encoding: .utf8) else { return }
        task.send(.string(text)) { _ in }
    }

    /// Phoenix 는 30초 안에 하트비트가 없으면 연결을 끊는다
    private func startHeartbeat() {
        heartbeat = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 25 * 1_000_000_000)
                guard let self else { return }
                await self.ping()
            }
        }
    }

    private func ping() {
        send(event: "heartbeat", payload: [:], topic: "phoenix")
    }

    private func receive() {
        guard let task else { return }
        task.receive { [weak self] result in
            guard let self else { return }
            Task { await self.handle(result) }
        }
    }

    private func handle(_ result: Result<URLSessionWebSocketTask.Message, Error>) {
        switch result {
        case .failure:
            // 끊기면 조용히 멈춘다. 채팅이 안 붙는 것과 앱이 죽는 것은 다르다.
            task = nil
            heartbeat?.cancel()
        case .success(let message):
            if case .string(let text) = message { decode(text) }
            receive()
        }
    }

    private func decode(_ text: String) {
        guard let frame = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any],
              let event = frame["event"] as? String,
              let payload = frame["payload"] as? [String: Any] else { return }

        switch event {
        case "broadcast":
            guard let name = payload["event"] as? String,
                  let body = payload["payload"] as? [String: Any] else { return }
            switch name {
            case "chat.message":
                if let m = Self.message(from: body) { onMessage(m) }
            case "match.live":
                onLive?(Live(home: body["home"] as? Int,
                             away: body["away"] as? Int,
                             elapsed: body["elapsed"] as? Int,
                             state: body["state"] as? String ?? "LIVE"))
            case "match.event":
                onEvent?(body)
            default:
                break
            }

        case "presence_state":
            // 붙자마자 오는 전체 상태. 여기서 기준을 잡는다.
            viewers = payload.keys.count
            onPresence(viewers)

        case "presence_diff":
            // 이후로는 차이만 온다. 전체를 다시 물어볼 방법이 없으므로 누적한다.
            let joins = (payload["joins"] as? [String: Any])?.count ?? 0
            let leaves = (payload["leaves"] as? [String: Any])?.count ?? 0
            viewers = max(0, viewers + joins - leaves)
            onPresence(viewers)

        default:
            break
        }
    }

    /// 지금 이 채널을 열어둔 사람 수. presence_state 로 기준을 잡고 diff 로 누적한다.
    private var viewers = 0

    /// Postgres 는 소수점 초를 붙여 보낸다. 둘 다 받아준다.
    private static func timestamp(_ s: String?) -> Date? {
        guard let s else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }

    private static func message(from body: [String: Any]) -> Incoming? {
        guard let id = body["id"] as? Int,
              let userId = body["userId"] as? String,
              let text = body["body"] as? String else { return nil }
        let handle = (body["handle"] as? String)?.trimmingCharacters(in: .whitespaces)
        let at = timestamp(body["at"] as? String) ?? Date()
        return Incoming(id: id, userId: userId,
                        handle: handle?.isEmpty == false ? handle! : "알 수 없음",
                        body: text, at: at)
    }
}
