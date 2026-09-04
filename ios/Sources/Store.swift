import SwiftUI

/// 앱 상태. 웹의 store.tsx 와 같은 자리다.
/// 서버가 계산하고 클라이언트는 표시한다 — 여기서 만드는 유일한 숫자는 잠재 점수 미리보기뿐이다.
@MainActor
final class Store: ObservableObject {
    @Published private(set) var ready = false
    /// 첫 로드가 실패했는지.
    ///
    /// 이걸 구분하지 않으면 통신이 한 번 어긋났을 때 me 가 기본값으로 남고,
    /// 화면은 '온보딩을 안 마친 사람'으로 읽어 이미 가입한 사람을 가입 화면에
    /// 떨어뜨린다. 빈 리그 목록까지 보여서 앱이 고장 난 것처럼 보인다.
    @Published private(set) var loadFailed = false
    @Published private(set) var me = Me()
    @Published private(set) var leagues: [League] = []
    @Published private(set) var fixtures: [Fixture] = []
    @Published private(set) var predictions: [Int: Prediction] = [:]
    @Published private(set) var ranking: [RankRow] = []
    @Published private(set) var stats = MyStats()
    @Published private(set) var badges: [BadgeDef] = []
    @Published var error: String?
    /// 예측 확정 순간의 연출을 띄우기 위한 방아쇠.
    /// stamp 는 같은 경기를 다시 확정했을 때도 연출이 한 번 더 재생되게 하는 도장이다.
    struct Celebration {
        let fixtureId: Int
        let points: Int?
        let stamp: Int
    }
    @Published var celebrated: Celebration?

    @Published private(set) var teams: [Team] = []
    private var teamsById: [Int: Team] = [:]
    private let repo: any Repository = Repositories.current

    func team(_ id: Int) -> Team {
        teamsById[id] ?? Team(id: id, leagueId: 0, name: "—", abbr: "—", logoUrl: nil,
                              colorHex: 0x9C9385, tintHex: 0xF0EBE0)
    }
    func league(_ id: Int) -> League {
        leagues.first { $0.id == id } ?? League(id: id, name: "—", short: "—", country: "")
    }

    var level: LevelState { Progression.level(fromPoints: me.lifetimePoints) }
    var tier: Tier? { Progression.tier(topPercent: me.topPercent, settledMatches: me.settledMatches) }

    /// 유저가 고른 순서대로 정렬된 리그
    var orderedLeagues: [League] {
        let order = me.leagueOrder.isEmpty ? leagues.map(\.id) : me.leagueOrder
        return order.compactMap { id in leagues.first { $0.id == id } }
    }

    func isFavorite(_ f: Fixture) -> Bool {
        me.favoriteTeamIds.contains(f.homeTeamId) || me.favoriteTeamIds.contains(f.awayTeamId)
    }

    func load() async {
        loadFailed = false
        do {
            let catalog = try await repo.loadCatalog()
            leagues = catalog.leagues
            fixtures = catalog.fixtures
            teams = catalog.teams
            teamsById = Dictionary(uniqueKeysWithValues: catalog.teams.map { ($0.id, $0) })
            me = try await repo.loadMe()
            predictions = Dictionary(uniqueKeysWithValues:
                try await repo.loadPredictions().map { ($0.fixtureId, $0) })
            // 랭킹·통계·뱃지는 없어도 앱이 떠야 한다. 실패하면 빈 채로 둔다.
            ranking = (try? await repo.loadRanking()) ?? []
            stats = (try? await repo.loadMyStats()) ?? MyStats()
            badges = (try? await repo.loadBadges()) ?? []
            await scheduleReminders()
        } catch {
            self.error = error.localizedDescription
            loadFailed = true
        }
        ready = true
    }

    /// 알림 재예약. 예측·최애 팀·일정이 바뀌면 기존 예약이 어긋나므로 통째로 다시 깐다.
    func scheduleReminders() async {
        await Notifications.reschedule(
            // 지난 경기는 뺀다. 예약 상한(64)이 있어서 자리를 낭비하면 안 된다.
            fixtures: fixtures.filter { $0.kickoffAt > .now },
            predicted: Set(predictions.keys),
            isFavorite: { [weak self] in self?.isFavorite($0) ?? false },
            teamName: { [weak self] in self?.team($0).name ?? "" })
    }

    /// 온보딩 완료. 고른 순서가 그대로 홈의 리그 탭 순서가 된다 (명세 5.1).
    func completeOnboarding(leagueOrder: [Int], favoriteTeamIds: [Int]) async {
        // 고르지 않은 리그도 뒤에 붙여서 전체 순서를 만든다
        let rest = leagues.map(\.id).filter { !leagueOrder.contains($0) }
        let order = leagueOrder + rest
        do {
            try await repo.saveOnboarding(leagueOrder: order, favoriteTeamIds: favoriteTeamIds)
            me.leagueOrder = order
            me.favoriteTeamIds = favoriteTeamIds
            me.onboarded = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: 프로필 편집

    /// 닉네임 변경. 서버가 검증·유일성·쿨다운을 본다.
    func setHandle(_ handle: String) async throws {
        me.handle = try await repo.setHandle(handle)
    }

    func setAvatar(_ jpeg: Data) async throws {
        me.avatarUrl = try await repo.setAvatar(jpeg)
    }

    func removeAvatar() async throws {
        try await repo.removeAvatar()
        me.avatarUrl = nil
    }

    func predict(_ f: Fixture, _ pick: Outcome, _ confidence: Confidence) {
        let previous = predictions[f.id]
        predictions[f.id] = Prediction(fixtureId: f.id, pick: pick, confidence: confidence)  // 낙관적 반영

        // 기준선이 없으면 얻을 점수를 계산할 근거가 없다. 숫자를 지어내지 않는다.
        let points = f.baseline.map {
            Scoring.preview($0, pick, confidence, streak: me.streak).pointsIfCorrect
        }
        celebrated = Celebration(fixtureId: f.id, points: points,
                                 stamp: Int(Date().timeIntervalSince1970 * 1000))

        Task {
            do {
                try await repo.upsertPrediction(fixtureId: f.id, pick: pick, confidence: confidence)
                // 권한은 첫 예측 직후에 묻는다. 앱을 켜자마자 물으면 무슨 알림인지
                // 모르는 채로 거절하고, 한 번 거절하면 앱 안에서 되돌릴 수 없다.
                if await Notifications.canAsk {
                    // 확정 연출이 끝난 뒤에 뜨게 한다
                    try? await Task.sleep(nanoseconds: 1_400_000_000)
                    await Notifications.requestPermission()
                }
                await scheduleReminders()
            } catch {
                predictions[f.id] = previous     // 되돌린다
                self.error = error.localizedDescription
            }
        }
    }
}
