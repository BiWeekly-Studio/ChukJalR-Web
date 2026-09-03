import Foundation

/// Realtime 왕복 검사. 채널에 붙어 내가 쏜 broadcast 가 되돌아오는지 본다.
@main
enum RealtimeCheck {
    static func main() async {
        let topic = "match:selftest-\(UUID().uuidString.prefix(8))"
        let got = Box()

        let channel = RealtimeChannel(
            channel: topic,
            onMessage: { m in Task { await got.received(m) } },
            onPresence: { n in Task { await got.presence(n) } })

        await channel.connect(accessToken: nil)
        try? await Task.sleep(nanoseconds: 1_200_000_000)
        await channel.track()
        try? await Task.sleep(nanoseconds: 800_000_000)

        // 트리거가 보내는 것과 같은 모양으로 쏜다
        await channel.echo(event: "chat.message", payload: [
            "id": 424242, "userId": "00000000-0000-0000-0000-000000000000",
            "handle": "왕복검사", "body": "핑", "at": ISO8601DateFormatter().string(from: Date()),
        ])
        try? await Task.sleep(nanoseconds: 2_500_000_000)
        await channel.disconnect()

        var failures = 0
        func check(_ name: String, _ ok: Bool, _ detail: String = "") {
            if ok { print("  ✔ \(name)") } else { failures += 1; print("  ✖ \(name) \(detail)") }
        }

        print("Realtime")
        let viewers = await got.viewers
        let messages = await got.messages
        check("채널에 붙고 presence 가 나를 센다", viewers >= 1, "viewers=\(viewers)")
        check("broadcast 가 되돌아온다", messages.count == 1, "\(messages.count)건")
        if let m = messages.first {
            check("id 를 읽는다", m.id == 424242, "\(m.id)")
            check("닉네임을 읽는다", m.handle == "왕복검사", m.handle)
            check("본문을 읽는다", m.body == "핑", m.body)
        }

        print(failures == 0 ? "\n통과" : "\n실패 \(failures)건")
        exit(failures == 0 ? 0 : 1)
    }
}

actor Box {
    var messages: [RealtimeChannel.Incoming] = []
    var viewers = 0
    func received(_ m: RealtimeChannel.Incoming) { messages.append(m) }
    func presence(_ n: Int) { viewers = max(viewers, n) }
}
