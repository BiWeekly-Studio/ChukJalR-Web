import AuthenticationServices
import CryptoKit
import SwiftUI

/// 로그인. 애플과 구글 두 가지만 둔다.
///
/// 애플은 시스템이 제공하는 네이티브 시트(ASAuthorizationController)로 받고,
/// 구글은 SDK 없이 ASWebAuthenticationSession + PKCE 로 받는다 —
/// GoogleSignIn SDK 를 넣으면 의존성 해석 때문에 빌드가 무거워지고, 얻는 게 없다.
///
/// iOS 에 다른 소셜 로그인을 넣는 순간 애플 로그인은 심사상 필수다.
@MainActor
final class Auth: NSObject, ObservableObject {
    enum State: Equatable { case loading, signedOut, signedIn(String) }

    @Published private(set) var state: State = .loading
    @Published var error: String?
    @Published private(set) var busy = false

    /// 애플이 요구하는 nonce. 재생 공격을 막으려고 요청마다 새로 만든다.
    private var currentNonce: String?

    func restore() async {
        await Supabase.shared.restore()
        let user = await Supabase.shared.currentUser
        state = user.map { .signedIn($0.id) } ?? .signedOut
    }

    // MARK: 애플

    func signInWithApple() {
        let nonce = Self.randomNonce()
        currentNonce = nonce

        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        // 애플에는 해시를 보내고, 서버 검증에는 원본을 쓴다
        request.nonce = Self.sha256(nonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        busy = true
        controller.performRequests()
    }

    // MARK: 구글

    func signInWithGoogle() {
        busy = true
        Task {
            do {
                let verifier = Self.randomNonce(length: 64)
                let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))

                var components = URLComponents(string: Config.supabaseURL + "/auth/v1/authorize")!
                components.queryItems = [
                    .init(name: "provider", value: "google"),
                    .init(name: "redirect_to", value: Config.redirectURI),
                    .init(name: "code_challenge", value: challenge),
                    .init(name: "code_challenge_method", value: "s256"),
                ]

                let callback = try await WebAuth.start(
                    url: components.url!, scheme: Config.urlScheme, anchor: self)

                guard let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?
                    .queryItems?.first(where: { $0.name == "code" })?.value else {
                    throw Supabase.Failure.badResponse
                }
                try await Supabase.shared.signInWithPKCE(code: code, verifier: verifier)
                await finish()
            } catch is CancellationError {
                busy = false
            } catch {
                fail(error)
            }
        }
    }

    func signOut() {
        Task {
            await Supabase.shared.signOut()
            state = .signedOut
        }
    }

    private func finish() async {
        busy = false
        let user = await Supabase.shared.currentUser
        state = user.map { .signedIn($0.id) } ?? .signedOut
    }

    private func fail(_ error: Error) {
        busy = false
        // 사용자가 시트를 닫은 것은 오류가 아니다
        if (error as NSError).code == ASAuthorizationError.canceled.rawValue { return }
        if case ASWebAuthenticationSessionError.canceledLogin = error { return }
        self.error = error.localizedDescription
    }

    // MARK: nonce

    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

extension Auth: ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithAuthorization authorization: ASAuthorization) {
        guard
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let tokenData = credential.identityToken,
            let idToken = String(data: tokenData, encoding: .utf8),
            let nonce = currentNonce
        else {
            fail(Supabase.Failure.badResponse); return
        }
        Task {
            do {
                try await Supabase.shared.signInWithApple(idToken: idToken, nonce: nonce)
                await finish()
            } catch { fail(error) }
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        fail(error)
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        ASPresentationAnchor()
    }
}

/// ASWebAuthenticationSession 을 async 로 감싼다
enum WebAuth {
    @MainActor
    static func start(url: URL, scheme: String, anchor: ASWebAuthenticationPresentationContextProviding)
        async throws -> URL
    {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callback, error in
                if let callback { continuation.resume(returning: callback) }
                else { continuation.resume(throwing: error ?? Supabase.Failure.badResponse) }
            }
            session.presentationContextProvider = anchor
            session.prefersEphemeralWebBrowserSession = false
            session.start()
        }
    }
}

extension Auth: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        ASPresentationAnchor()
    }
}
