import Foundation

/// 중복 삽입은 실패가 아니라 '이미 처리됨'이다. 호출부가 이 표식을 보고 조용히 넘긴다.
let DuplicateMarker = "__duplicate__"

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

    /// 로그인한 사용자로 한 행을 넣는다.
    ///
    /// 서버 트리거가 막는 경우(레이트 리밋, 링크·금칙어 필터)가 정상 동작이므로,
    /// 실패 메시지를 그대로 흘리지 않고 사람이 읽을 말로 바꿔서 던진다.
    func insert(_ table: String, _ row: [String: Any]) async throws {
        guard let token = session?.access_token else {
            throw Failure.http(401, "로그인이 필요해요.")
        }
        var req = URLRequest(url: URL(string: url + "/rest/v1/" + table)!)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        req.httpBody = try JSONSerialization.data(withJSONObject: row)

        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw Failure.http(code, Self.tableMessage(from: data))
        }
    }

    /// Realtime 이 로그인한 사용자로 붙으려면 액세스 토큰이 필요하다
    var accessToken: String? { session?.access_token }

    /// 닉네임 변경. 검증·유일성·쿨다운은 서버가 본다 (set_handle).
    func setHandle(_ handle: String) async throws -> String {
        let data = try await rpc("set_handle", body: ["p_handle": handle])
        // 스칼라를 돌려주는 RPC 의 응답은 최상위가 문자열인 JSON 이다: "축잘알".
        // .fragmentsAllowed 없이 파싱하면 실패하고, 원문으로 떨어지면 따옴표까지
        // 이름에 들어간다.
        let parsed = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        return (parsed as? String) ?? handle
    }

    /// 프로필 사진 업로드. 사람마다 한 장이므로 이름을 '<uid>/avatar.jpg' 로 고정하고
    /// 덮어쓴다. 정책이 경로 첫 칸의 uid 를 보므로 폴더를 파야 한다.
    /// - Returns: 화면에서 바로 쓸 수 있는 공개 URL (캐시를 뚫는 버전 표시가 붙는다)
    func uploadAvatar(_ jpeg: Data) async throws -> String {
        guard let token = session?.access_token, let uid = session?.user.id else {
            throw Failure.http(401, "로그인이 필요해요.")
        }
        let path = "\(uid)/avatar.jpg"
        var req = URLRequest(url: URL(string: url + "/storage/v1/object/avatars/" + path)!)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        // 같은 경로에 다시 올린다 — 없으면 만들고 있으면 덮는다
        req.setValue("true", forHTTPHeaderField: "x-upsert")
        req.httpBody = jpeg

        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw Failure.http(code, Self.tableMessage(from: data))
        }

        // 경로가 늘 같아서 CDN 이 옛 사진을 계속 준다. 바꾼 시각을 붙여 캐시를 뚫는다.
        let publicUrl = url + "/storage/v1/object/public/avatars/" + path
            + "?v=\(Int(Date().timeIntervalSince1970))"
        try await patchProfile(["avatar_url": publicUrl])
        return publicUrl
    }

    /// 프로필 사진 제거
    func removeAvatar() async throws {
        guard let token = session?.access_token, let uid = session?.user.id else {
            throw Failure.http(401, "로그인이 필요해요.")
        }
        var req = URLRequest(url: URL(string: url + "/storage/v1/object/avatars/\(uid)/avatar.jpg")!)
        req.httpMethod = "DELETE"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        // 파일이 이미 없어도 프로필의 링크는 지워야 한다. 그래서 결과를 보지 않는다.
        _ = try? await URLSession.shared.data(for: req)
        try await patchProfile(["avatar_url": NSNull()])
    }

    private func patchProfile(_ fields: [String: Any]) async throws {
        guard let token = session?.access_token, let uid = session?.user.id else {
            throw Failure.http(401, "로그인이 필요해요.")
        }
        var req = URLRequest(url: URL(string: url + "/rest/v1/profiles?id=eq.\(uid)")!)
        req.httpMethod = "PATCH"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: fields)
        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw Failure.http(code, Self.tableMessage(from: data))
        }
    }

    /// 계정 삭제. 서버가 지우고 나면 이 기기의 세션도 함께 버린다.
    /// 남겨두면 다음 실행에서 이미 없는 계정으로 세션을 복구하려 든다.
    func deleteAccount() async throws {
        _ = try await rpc("delete_my_account")
        await signOut()
    }

    /// PostgREST 오류를 우리말로. 나머지는 원문을 남긴다 — 감추면 진단이 어려워진다.
    private static func tableMessage(from data: Data) -> String {
        let raw = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let text = (raw?["message"] ?? raw?["hint"] ?? raw?["details"]) as? String
            ?? String(data: data, encoding: .utf8) ?? ""
        if text.contains("RATE_LIMIT") { return "너무 빠르게 보내고 있어요. 잠시 후 다시 시도해 주세요." }
        if text.contains("LINK_NOT_ALLOWED") { return "링크는 보낼 수 없어요." }
        if text.contains("BANNED_WORD") { return "보낼 수 없는 표현이 들어 있어요." }
        if text.contains("HANDLE_LENGTH") { return "닉네임은 2~12자로 지어주세요." }
        if text.contains("HANDLE_CHARS") { return "닉네임에 공백은 넣을 수 없어요." }
        if text.contains("HANDLE_TAKEN") { return "이미 쓰고 있는 닉네임이에요." }
        if let r = text.range(of: "HANDLE_COOLDOWN:") {
            let days = text[r.upperBound...].prefix { $0.isNumber }
            return "닉네임은 7일에 한 번 바꿀 수 있어요. \(days)일 뒤에 다시 시도해 주세요."
        }
        // 23505 = unique_violation. 같은 걸 두 번 신고·차단한 것이므로 실패가 아니다.
        if (raw?["code"] as? String) == "23505" { return DuplicateMarker }
        return text.isEmpty ? "요청을 처리하지 못했어요." : text
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
