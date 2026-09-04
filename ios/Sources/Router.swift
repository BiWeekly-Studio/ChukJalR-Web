import SwiftUI

/// 앱 바깥에서 들어오는 이동 요청을 한 곳으로 모은다.
///
/// 지금 들어오는 길은 둘이다 — 알림을 눌렀을 때, 그리고 chukjalal:// 링크.
/// 화면마다 따로 받으면 어디서 무엇이 열리는지 추적이 안 되므로 여기로 모은다.
@MainActor
final class Router: ObservableObject {
    /// 0 예측 · 1 랭킹 · 2 나
    @Published var tab = 0
    /// 열어야 할 경기. 목록에서 그 경기를 찾으면 열고 비운다.
    @Published var pendingFixtureId: Int?

    func open(fixtureId: Int) {
        tab = 0
        pendingFixtureId = fixtureId
    }

    /// chukjalal://match/1570392 · chukjalal://tab/ranking
    func handle(_ url: URL) {
        guard url.scheme == "chukjalal" else { return }
        // URL(string:) 은 host 에 첫 칸을, path 에 나머지를 넣는다
        let parts = [url.host].compactMap { $0 } + url.pathComponents.filter { $0 != "/" }
        guard let head = parts.first else { return }

        switch head {
        case "match":
            if let id = parts.dropFirst().first.flatMap(Int.init) { open(fixtureId: id) }
        case "tab":
            switch parts.dropFirst().first {
            case "ranking": tab = 1
            case "me":      tab = 2
            default:        tab = 0
            }
        default:
            break
        }
    }
}
