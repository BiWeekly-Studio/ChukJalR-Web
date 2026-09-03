import Foundation

/// Supabase 클라이언트 (GoTrue + PostgREST).
///
/// 공식 Swift SDK 를 쓰지 않는다. 우리가 필요한 건 인증과 몇 개의 테이블 조회뿐인데,
/// SDK 를 넣으면 패키지 해석 때문에 .xcodeproj 없이는 빌드가 안 된다.
/// URLSession 으로 직접 부르면 의존성이 0 이고, 서버 계약(REST)은 웹과 완전히 같다.
actor Supabase {
    static let shared = Supabase()

    private let url = Config.supabaseURL
    private let anonKey = Config.supabaseAnonKey
    private var session: Session?

    struct Session: Codable {
        let access_token: String
        let refresh_token: String
        let expires_at: Double?
        let user: User
    }
    struct User: Codable {
        let id: String
        let email: String?
    }

    enum Failure: LocalizedError {
        case http(Int, String)
        case badResponse
        var errorDescription: String? {
            switch self {
            case .http(_, let message): return message
            case .badResponse: return "서버 응답을 이해하지 못했어요."
            }
        }
    }

    var currentUser: User? { session?.user }

    // MARK: 세션 보관
    // 액세스 토큰은 키체인에 두는 게 원칙이지만, 지금은 리프레시 토큰만 있으면
    // 세션을 다시 세울 수 있으므로 그것만 저장한다.
    private static let refreshKey = "chukjalal.refresh"

    func restore() async {
        guard let refresh = Keychain.read(Self.refreshKey) else { return }
        _ = try? await exchange(path: "/auth/v1/token?grant_type=refresh_token",
                               body: ["refresh_token": refresh])
    }

    func signOut() async {
        session = nil
        Keychain.delete(Self.refreshKey)
    }

    /// 애플이 준 id_token 으로 바로 세션을 받는다 (네이티브 경로, 브라우저 없음)
    func signInWithApple(idToken: String, nonce: String) async throws {
        _ = try await exchange(path: "/auth/v1/token?grant_type=id_token",
                               body: ["provider": "apple", "id_token": idToken, "nonce": nonce])
    }

    /// 구글은 브라우저 왕복(PKCE)으로 받은 인가 코드를 세션으로 바꾼다
    func signInWithPKCE(code: String, verifier: String) async throws {
        _ = try await exchange(path: "/auth/v1/token?grant_type=pkce",
                               body: ["auth_code": code, "code_verifier": verifier])
    }

    @discardableResult
    private func exchange(path: String, body: [String: String]) async throws -> Session {
        var req = URLRequest(url: URL(string: url + path)!)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw Failure.badResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw Failure.http(http.statusCode, Self.message(from: data))
        }
        let s = try JSONDecoder().decode(Session.self, from: data)
        session = s
        Keychain.write(Self.refreshKey, s.refresh_token)
        return s
    }

    /// 로그인한 사용자로 테이블을 읽는다
    func get(_ path: String) async throws -> Data {
        var req = URLRequest(url: URL(string: url + "/rest/v1/" + path)!)
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        if let token = session?.access_token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw Failure.http((response as? HTTPURLResponse)?.statusCode ?? 0, Self.message(from: data))
        }
        return data
    }

    /// 온보딩 결과를 프로필에 저장한다
    func saveOnboarding(leagueOrder: [Int], favoriteTeamIds: [Int]) async throws {
        guard let token = session?.access_token, let userId = session?.user.id else {
            throw Failure.http(401, "로그인이 필요해요.")
        }
        var req = URLRequest(url: URL(string: url + "/rest/v1/profiles?id=eq.\(userId)")!)
        req.httpMethod = "PATCH"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "league_order": leagueOrder,
            "favorite_team_ids": favoriteTeamIds,
            "onboarded_at": ISO8601DateFormatter().string(from: Date()),
        ])
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw Failure.http((response as? HTTPURLResponse)?.statusCode ?? 0, Self.message(from: data))
        }
    }

    /// 집계 RPC 호출
    func rpc(_ name: String, body: [String: Any] = [:]) async throws -> Data {
        var req = URLRequest(url: URL(string: url + "/rest/v1/rpc/" + name)!)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        if let token = session?.access_token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw Failure.http((response as? HTTPURLResponse)?.statusCode ?? 0, Self.message(from: data))
        }
        return data
    }

    /// 예측 저장. 마감 후에는 RLS 가 거부한다 — 버그가 아니라 설계다.
    func upsertPrediction(fixtureId: Int, pick: String, confidence: Int) async throws {
        guard let token = session?.access_token, let userId = session?.user.id else {
            throw Failure.http(401, "로그인이 필요해요.")
        }
        var req = URLRequest(url: URL(string: url + "/rest/v1/predictions")!)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("resolution=merge-duplicates", forHTTPHeaderField: "Prefer")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "user_id": userId, "fixture_id": fixtureId,
            "pick": pick, "confidence": confidence,
        ])
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw Failure.http(code, code == 403 ? "예측이 마감된 경기예요." : Self.message(from: data))
        }
    }

    /// GoTrue 는 영어로만 답한다. 유저가 실제로 마주치는 것만 우리말로 바꾼다.
    private static func message(from data: Data) -> String {
        let raw = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let text = (raw?["error_description"] ?? raw?["msg"] ?? raw?["message"]) as? String
            ?? String(data: data, encoding: .utf8) ?? ""
        let lower = text.lowercased()
        if lower.contains("provider is not enabled") { return "이 로그인은 아직 켜져 있지 않아요." }
        if lower.contains("invalid") && lower.contains("token") { return "로그인 정보가 만료됐어요. 다시 시도해 주세요." }
        return text.isEmpty ? "로그인에 실패했어요." : text
    }
}

/// 리프레시 토큰만 담는 최소 키체인 래퍼
enum Keychain {
    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrAccount as String: key]
    }
    static func write(_ key: String, _ value: String) {
        delete(key)
        var q = query(key)
        q[kSecValueData as String] = Data(value.utf8)
        SecItemAdd(q as CFDictionary, nil)
    }
    static func read(_ key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func delete(_ key: String) { SecItemDelete(query(key) as CFDictionary) }
}
