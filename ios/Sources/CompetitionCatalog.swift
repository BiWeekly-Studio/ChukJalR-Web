import Foundation

enum CompetitionCatalog {
    static let majorIds = [39,78,61,140,135,2,3,848]
    static func isMajor(_ id: Int) -> Bool { majorIds.contains(id) }
    static func ordered(_ leagues: [League], preferred: [Int]) -> [League] {
        var seen = Set<Int>()
        let byId = Dictionary(uniqueKeysWithValues: leagues.map { ($0.id, $0) })
        return (preferred + leagues.map(\.id)).compactMap { id in
            guard seen.insert(id).inserted else { return nil }
            return byId[id]
        }
    }
}

enum CatalogPaging {
    enum Failure: Error { case invalidResponse }

    /// PostgREST 기본 1,000행 제한에 걸리지 않게 안정된 정렬 쿼리를 페이지별로 읽는다.
    static func load(_ path: String, fetch: (String) async throws -> Data) async throws -> Data {
        var rows: [[String: Any]] = []
        var offset = 0
        while true {
            let data = try await fetch(path + "&limit=500&offset=\(offset)")
            guard let page = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                throw Failure.invalidResponse
            }
            rows.append(contentsOf: page)
            if page.count < 500 { break }
            offset += 500
        }
        return try JSONSerialization.data(withJSONObject: rows)
    }
}
