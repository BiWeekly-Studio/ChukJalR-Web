import Foundation
import StoreKit

struct PurchaseState: Decodable {
    struct Ticket: Decodable, Identifiable { let orderId: String; var id: String { orderId } }
    struct Challenge: Decodable, Identifiable {
        let id: String
        let started_at: String
        let ended_at: String?
        let refunded: Bool
        let predicted: Int
        let settled: Int
        let hits: Int
        let rating: Int
    }
    struct FreshStart: Decodable { var tickets: [Ticket] = []; var challenges: [Challenge] = [] }
    struct Supporter: Decodable {
        var active = false
        var teamId: Int?
        var expiresAt: String?
        var autoRenew = false
        var pending = false
    }
    var storeReady = false
    var freshStart = FreshStart()
    var supporter = Supporter()
}

@MainActor
final class Purchases: ObservableObject {
    static let ticketID = "com.jalr.chukjalal.freshstart"
    static let supporterID = "com.jalr.chukjalal.supporter.monthly"
    @Published private(set) var state = PurchaseState()
    @Published private(set) var products: [Product] = []
    @Published private(set) var busy = false
    @Published private(set) var loaded = false
    @Published private(set) var productsLoaded = false
    @Published var notice: String?
    private var listener: Task<Void, Never>?
    private var userID: String?
    private var deliveries: [UInt64: Task<Void, Error>] = [:]

    init() {
        listener = Task { [weak self] in
            for await result in Transaction.updates {
                guard !Task.isCancelled else { return }
                do { try await self?.deliver(result) }
                catch { self?.notice = Self.message(error) }
            }
        }
    }
    deinit { listener?.cancel() }
    func product(_ id: String) -> Product? { products.first { $0.id == id } }

    func setUser(_ id: String?) async {
        guard userID != id else { return }
        userID = id
        state = PurchaseState(); loaded = false; notice = nil
        guard id != nil else { return }
        await refresh()
    }
    func refresh() async {
        guard let id = userID else { return }
        notice = nil
        do {
            let fetched = try await Product.products(for: [Self.ticketID, Self.supporterID])
            guard userID == id else { return }
            productsLoaded = true
            products = fetched.filter {
                ($0.id == Self.ticketID && $0.type == .consumable) ||
                ($0.id == Self.supporterID && $0.type == .autoRenewable &&
                 $0.subscription?.subscriptionPeriod.unit == .month && $0.subscription?.subscriptionPeriod.value == 1)
            }
            for await result in Transaction.unfinished { try await deliver(result) }
            for await result in Transaction.currentEntitlements { try await deliver(result) }
            try await request(["action": "status"], user: id)
        } catch {
            if userID == id {
                notice = Self.message(error)
                // A StoreKit outage must not hide tickets already saved on the server.
                try? await request(["action": "status"], user: id)
            }
        }
    }
    func buy(_ id: String) async {
        guard !busy, state.storeReady, let user = userID, let token = UUID(uuidString: user), let item = product(id) else { return }
        busy = true; notice = nil
        defer { busy = false }
        do {
            let result = try await item.purchase(options: [.appAccountToken(token)])
            switch result {
            case .success(let transaction):
                try await deliver(transaction)
                if userID == user { notice = id == Self.ticketID ? "새 출발권 1회가 추가됐어요." : "응원 프로필 팩이 활성화됐어요. 응원 팀을 골라보세요." }
            case .pending: notice = "결제 승인 대기 중이에요. 승인되면 자동으로 반영돼요."
            case .userCancelled: break
            @unknown default: notice = "구매 상태를 다시 확인해주세요."
            }
        } catch { if userID == user { notice = Self.message(error) } }
    }
    func restore() async {
        guard !busy else { return }
        busy = true; notice = nil
        defer { busy = false }
        do {
            try await AppStore.sync()
            await refresh()
            if notice == nil { notice = "구매 내역을 확인했어요. 사용한 새 출발권은 다시 지급되지 않아요." }
        } catch { notice = Self.message(error) }
    }
    func start(_ order: String) async {
        guard !busy, let user = userID else { return }
        busy = true; notice = nil
        defer { busy = false }
        do {
            try await request(["action": "start", "orderId": order], user: user)
            notice = "개인 도전을 1,000점에서 새로 시작했어요."
        } catch { notice = Self.message(error) }
    }
    func selectTeam(_ team: Int) async {
        guard !busy, let user = userID else { return }
        busy = true; notice = nil
        defer { busy = false }
        do { try await request(["action": "team", "teamId": team], user: user) }
        catch { notice = Self.message(error) }
    }
    private func deliver(_ result: VerificationResult<Transaction>) async throws {
        guard case .verified(let transaction) = result else { throw Supabase.Failure.http(400, "INVALID_SIGNATURE") }
        guard [Self.ticketID, Self.supporterID].contains(transaction.productID),
              let user = userID else { return }
        guard transaction.appAccountToken?.uuidString.lowercased() == user.lowercased() else {
            throw Supabase.Failure.http(400, "ORDER_OWNER_MISMATCH")
        }
        if let delivery = deliveries[transaction.id] { try await delivery.value; return }
        let delivery = Task { [weak self] in
            guard let self else { throw CancellationError() }
            try await self.request(["action": "verify", "signedTransaction": result.jwsRepresentation], user: user)
            // Finish only after the server committed the grant. Concurrent StoreKit
            // updates and the purchase result await this same delivery task.
            await transaction.finish()
        }
        deliveries[transaction.id] = delivery
        defer { deliveries[transaction.id] = nil }
        try await delivery.value
    }

    private func request(_ body: [String: Any], user: String) async throws {
        let data = try await Supabase.shared.invoke("apple-iap", body: body, userID: user)
        let result = try JSONDecoder().decode(PurchaseState.self, from: data)
        guard userID == user else { return }
        state = result; loaded = true
    }
    private static func message(_ error: Error) -> String {
        switch error.localizedDescription {
        case "STORE_NOT_READY": return "상품을 준비하고 있어요. 잠시 후 다시 확인해주세요."
        case "ORDER_OWNER_MISMATCH": return "이 구매는 다른 축잘알 계정에 연결돼 있어요. 구매한 계정으로 로그인해주세요."
        case "ORDER_REFUNDED": return "환불된 이용권이에요. 구매 내역을 다시 확인해주세요."
        case "LOGIN_REQUIRED": return "로그인을 다시 해주세요."
        default: return "구매 내역을 확인하지 못했어요. 결제했다면 다시 구매하지 말고 구매 복원을 눌러주세요."
        }
    }
}
