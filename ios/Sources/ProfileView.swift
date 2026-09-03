import SwiftUI

/// 캘리브레이션 표본이 이보다 적으면 숫자를 보여주지 않는다. 오해를 부른다.
private let minCalibrationN = 5
/// 팬심 편향은 최애 팀 경기가 이만큼 쌓여야 의미가 있다 (명세 5.4)
private let minFanBiasN = 10

struct ProfileView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var auth: Auth
    @State private var policyOpen = false

    private var stats: MyStats { store.stats }
    private var inPlacement: Bool { store.me.settledMatches < Progression.placementMatches }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("내 기록").font(T.display(22))
                    Spacer()
                    Chip(text: "\(Fmt.comma(store.me.balance))점", icon: "bolt.fill", style: .gold)
                }
                .padding(.horizontal, 20).padding(.top, 8)

                profileCard.padding(.horizontal, 20).padding(.top, 12)
                statRow.padding(.horizontal, 20).padding(.top, 12)

                section("리그별 적중률") {
                    if stats.byLeague.isEmpty {
                        pending("경기가 정산되면 리그별로 어디에 강한지 보여드려요.")
                    } else {
                        VStack(spacing: 10) {
                            ForEach(store.leagues) { l in
                                let row = stats.byLeague.first { $0.leagueId == l.id }
                                HStack(spacing: 11) {
                                    Text(l.short).font(T.body(12)).foregroundStyle(T.ink3)
                                        .frame(width: 60, alignment: .leading)
                                    Bar(value: row?.accuracy ?? 0)
                                    Text(row.map { "\(Int(($0.accuracy * 100).rounded()))%" } ?? "—")
                                        .font(T.num(14)).frame(width: 44, alignment: .trailing)
                                    Text(row.map { "\($0.n)건" } ?? "")
                                        .font(T.body(11)).foregroundStyle(T.ink3)
                                        .frame(width: 30, alignment: .trailing)
                                }
                            }
                        }
                    }
                }

                section("확신도는 정확한가", hint: "건 만큼 맞히고 있는지") {
                    let usable = stats.calibration.filter { $0.n >= minCalibrationN }
                    if usable.isEmpty {
                        pending("확신도마다 \(minCalibrationN)건씩은 쌓여야 의미가 생겨요. 그때부터 확신을 부풀리고 있는지 알려드릴게요.")
                    } else {
                        VStack(spacing: 9) {
                            ForEach(stats.calibration) { c in
                                let enough = c.n >= minCalibrationN
                                HStack(spacing: 11) {
                                    Text(c.confidence.label).font(T.body(12, .semibold))
                                        .frame(width: 84, alignment: .leading)
                                    Bar(value: enough ? c.actual : 0,
                                        tint: c.actual - c.expected < -0.08 ? AnyShapeStyle(T.ink4) : nil)
                                    Text(enough ? "\(Int((c.actual * 100).rounded()))%" : "—")
                                        .font(T.num(14)).frame(width: 40, alignment: .trailing)
                                    Text(enough ? "건 값 \(Int((c.expected * 100).rounded()))%" : "\(c.n)건")
                                        .font(T.body(11)).foregroundStyle(T.ink3)
                                        .frame(width: 62, alignment: .trailing)
                                }
                            }
                        }
                        calibrationNote(usable)
                    }
                }

                if !store.me.favoriteTeamIds.isEmpty {
                    section("팬심 편향") {
                        if let fb = stats.fanBias, fb.n >= minFanBiasN {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(spacing: 8) {
                                    Text(fb.bias > 0 ? "+\(fb.bias)" : "−\(abs(fb.bias))")
                                        .font(T.num(26))
                                        .foregroundStyle(fb.bias < 0 ? T.cool : T.win)
                                    Text("경기당 평균 지수").font(T.body(11)).foregroundStyle(T.ink3)
                                }
                                Text(fb.bias < 0
                                     ? "내 팀 경기에서 평균 \(abs(fb.bias))점을 손해 보고 있어요. 다른 경기에서는 잘 보시는데요."
                                     : "내 팀 경기에서 오히려 더 잘 맞히는 드문 유형이에요.")
                                    .font(T.body(12)).foregroundStyle(T.ink3)
                            }
                            .padding(14)
                            .overlay(RoundedRectangle(cornerRadius: 16).stroke(T.line, lineWidth: 1.5))
                        } else {
                            pending("내 팀 경기가 \(minFanBiasN)건 쌓이면, 팬심이 예측을 흐리는지 알려드려요.")
                        }
                    }
                }

                section("최근 10경기",
                        hint: stats.recent.isEmpty ? nil
                            : "\(stats.recent.filter(\.correct).count) 적중 · \(stats.recent.filter { !$0.correct }.count) 실패") {
                    if stats.recent.isEmpty {
                        pending("첫 경기가 정산되면 여기에 쌓입니다.")
                    } else {
                        HStack(spacing: 6) {
                            ForEach(0..<10, id: \.self) { i in
                                let r = i < stats.recent.count ? stats.recent[i] : nil
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(r == nil ? AnyShapeStyle(T.line2)
                                          : r!.correct ? AnyShapeStyle(T.gradWin) : AnyShapeStyle(T.line))
                                    .frame(height: 32)
                            }
                        }
                    }
                }

                section("모은 뱃지",
                        hint: store.badges.isEmpty ? nil : "\(store.badges.filter(\.earned).count)개 획득") {
                    if store.badges.isEmpty {
                        pending("아직 열린 뱃지가 없어요. 준비되면 여기에 생깁니다.")
                    } else {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4),
                                  spacing: 14) {
                            ForEach(store.badges.prefix(8)) { b in BadgeCell(badge: b) }
                        }
                    }
                }

                chatPolicy.padding(.horizontal, 20).padding(.top, 24)
                accountCard.padding(.horizontal, 20).padding(.top, 24).padding(.bottom, 28)
            }
        }
        .background(T.paper)
    }

    // MARK: 프로필 카드

    private var profileCard: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 11) {
                    Text(String(store.me.handle.prefix(1)))
                        .font(T.display(21))
                        .frame(width: 54, height: 54)
                        .background(.white.opacity(0.2), in: Circle())
                        .overlay(Circle().stroke(.white.opacity(0.55), lineWidth: 2.5))
                    VStack(alignment: .leading, spacing: 5) {
                        Text(store.me.handle).font(T.display(18))
                        HStack(spacing: 6) {
                            Text("Lv.\(store.level.level)").font(T.display(11, .heavy))
                                .padding(.horizontal, 8).frame(height: 22)
                                .background(.white.opacity(0.24), in: Capsule())
                            TierChip(tier: store.tier)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(Fmt.comma(store.me.rating)).font(T.num(26))
                        Text("축잘알 지수").font(T.body(11)).opacity(0.8)
                    }
                }
                HStack(alignment: .firstTextBaseline, spacing: 9) {
                    if inPlacement {
                        Text("아직").font(T.body(12)).opacity(0.85)
                        Text("배치 중").font(T.num(32))
                    } else if let p = store.me.topPercent {
                        Text("전체 유저 중").font(T.body(12)).opacity(0.85)
                        Text("상위 \(Fmt.trim(p))%").font(T.num(36))
                    } else {
                        // 배치는 끝났지만 아직 발표 전. 없는 등수를 만들지 않는다.
                        Text("다음 발표에").font(T.body(12)).opacity(0.85)
                        Text("순위 첫 등록").font(T.num(30))
                    }
                }
                .padding(.top, 18)
            }
            .foregroundStyle(.white)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(T.gradAccent)

            VStack(spacing: 9) {
                XPTrack(progress: store.level.progress)
                HStack {
                    Text("다음 레벨까지 \(max(0, store.level.need - store.level.into))점")
                    Spacer()
                    Text(inPlacement
                         ? "순위까지 \(Progression.placementMatches - store.me.settledMatches)경기"
                         : "Lv.\(store.level.level + 1)까지 \(store.level.into)/\(store.level.need)")
                }
                .font(T.body(11)).foregroundStyle(T.ink3)
            }
            .padding(EdgeInsets(top: 14, leading: 18, bottom: 16, trailing: 18))
            .background(T.card)
        }
        .clipShape(RoundedRectangle(cornerRadius: 26))
        .shadow(color: .black.opacity(0.10), radius: 14, y: 6)
    }

    private var statRow: some View {
        HStack(spacing: 9) {
            statTile(stats.accuracy.map { "\(Int(($0 * 100).rounded()))%" } ?? "—", "적중률",
                     icon: "target", accent: true)
            statTile("\(stats.settled)", "누적 예측")
            statTile("\(store.me.streak)", "연속 적중", icon: "flame.fill", gold: true)
        }
    }

    private func statTile(_ value: String, _ label: String,
                          icon: String? = nil, accent: Bool = false, gold: Bool = false) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 3) {
                if let icon {
                    Image(systemName: icon).font(.system(size: 14))
                        .foregroundStyle(gold ? T.goldInk : T.accent)
                }
                Text(value).font(T.num(25))
                    .foregroundStyle(gold ? T.gold : accent ? T.accent : T.ink)
            }
            Text(label).font(T.body(11)).foregroundStyle(gold ? T.gold : T.ink3)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 14)
        .background(gold ? AnyShapeStyle(T.goldSoft) : AnyShapeStyle(T.card),
                    in: RoundedRectangle(cornerRadius: 18))
    }

    /// 가장 크게 어긋난 확신도 한 줄만 짚어준다. 세 줄 다 설명하면 아무도 안 읽는다.
    @ViewBuilder
    private func calibrationNote(_ rows: [CalibrationRow]) -> some View {
        if let worst = rows.min(by: { ($0.actual - $0.expected) < ($1.actual - $1.expected) }) {
            let gap = Int(((worst.actual - worst.expected) * 100).rounded())
            Text(gap >= -8
                 ? "확신한 만큼 맞히고 있어요. 이게 진짜 축잘알의 조건입니다."
                 : "‘\(worst.confidence.label)’에서 실제 적중률이 건 값보다 \(abs(gap))%p 낮아요. 확신을 조금 아껴 쓰면 지수가 올라갑니다.")
                .font(T.body(11)).foregroundStyle(T.ink3).padding(.top, 11)
        }
    }

    // MARK: 운영정책 · 계정

    private var chatPolicy: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(T.spring) { policyOpen.toggle() } } label: {
                HStack {
                    sectionTitle("채팅 운영정책")
                    Spacer()
                    Text(policyOpen ? "접기" : "보기").font(T.body(11)).foregroundStyle(T.ink3)
                }
            }
            .buttonStyle(.plain)

            if policyOpen {
                VStack(alignment: .leading, spacing: 12) {
                    policyBlock("이런 메시지는 보낼 수 없어요", [
                        "욕설 · 비하 · 차별 표현", "같은 내용 반복(도배)과 스팸",
                        "홍보, 그리고 도박 사이트로 유도하는 내용",
                        "선정적이거나 불쾌감을 주는 내용", "링크 — 초기에는 모든 링크를 자동으로 막습니다"])
                    policyBlock("신고하면 이렇게 처리돼요", [
                        "메시지 오른쪽 ··· 를 눌러 사유와 함께 신고합니다",
                        "신고가 3건 쌓이면 자동으로 가려지고 운영자 검토로 넘어갑니다",
                        "검토 결과에 따라 경고 → 채팅 제한 → 이용 정지 순으로 조치합니다"])
                    policyBlock("직접 차단할 수도 있어요", [
                        "같은 ··· 메뉴에서 차단하면, 그 사람의 메시지는 보이지 않습니다",
                        "차단은 내 계정에만 적용되고 상대에게 알려지지 않습니다"])
                }
                .padding(15)
                .background(T.card, in: RoundedRectangle(cornerRadius: 16))
                .padding(.top, 12)
            }
        }
    }

    private func policyBlock(_ title: String, _ items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(T.body(12.5, .heavy))
            ForEach(items, id: \.self) { item in
                HStack(alignment: .top, spacing: 6) {
                    Text("·").font(T.body(12.5))
                    Text(item).font(T.body(12.5)).foregroundStyle(T.ink2)
                }
            }
        }
    }

    private var accountCard: some View {
        HStack(spacing: 10) {
            Text(String((store.me.handle.first ?? "·").description))
                .font(T.display(13, .heavy)).foregroundStyle(.white)
                .frame(width: 34, height: 34).background(T.gradAccent, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text("로그인됨").font(T.display(13, .heavy))
                Text(store.me.handle).font(T.body(11)).foregroundStyle(T.ink3).lineLimit(1)
            }
            Spacer()
            Button("로그아웃", action: auth.signOut)
                .font(T.body(12, .heavy)).foregroundStyle(T.ink2)
                .padding(.horizontal, 12).frame(height: 32)
                .background(T.card2, in: Capsule())
        }
        .padding(16)
        .background(T.card, in: RoundedRectangle(cornerRadius: 18))
    }

    // MARK: 조각

    private func sectionTitle(_ text: String) -> some View {
        HStack(spacing: 7) {
            RoundedRectangle(cornerRadius: 2).fill(T.gradAccent).frame(width: 3, height: 13)
            Text(text).font(T.display(14, .heavy))
        }
    }

    private func section<C: View>(_ title: String, hint: String? = nil,
                                  @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionTitle(title)
                Spacer()
                if let hint { Text(hint).font(T.body(11)).foregroundStyle(T.ink3) }
            }
            content()
        }
        .padding(.horizontal, 20).padding(.top, 24)
    }

    /// 아직 데이터가 없는 구간. 가짜 숫자 대신 무엇을 기다리는지 말한다.
    private func pending(_ text: String) -> some View {
        Text(text)
            .font(T.body(12)).foregroundStyle(T.ink3).lineSpacing(3)
            .frame(maxWidth: .infinity, alignment: .leading).padding(14)
            .overlay(RoundedRectangle(cornerRadius: 14)
                .strokeBorder(T.lineStrong, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
    }
}

struct Bar: View {
    var value: Double
    var tint: AnyShapeStyle?

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(T.line2)
                Capsule().fill(tint ?? AnyShapeStyle(T.gradAccent))
                    .frame(width: max(0, geo.size.width * value))
            }
        }
        .frame(height: 10)
    }
}

struct BadgeCell: View {
    let badge: BadgeDef

    var body: some View {
        VStack(spacing: 7) {
            Image(systemName: badge.earned ? "bolt.fill" : "lock.fill")
                .font(.system(size: badge.earned ? 22 : 18))
                .foregroundStyle(badge.earned ? .white : T.ink4)
                .frame(width: 50, height: 50)
                .background {
                    if badge.earned {
                        RoundedRectangle(cornerRadius: 16)
                            .fill(badge.tier == "gold" ? AnyShapeStyle(T.gradGold) : AnyShapeStyle(T.gradAccent))
                    } else {
                        RoundedRectangle(cornerRadius: 16)
                            .strokeBorder(T.lineStrong, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                    }
                }
            Text(badge.name).font(T.body(11, badge.earned ? .heavy : .regular))
                .foregroundStyle(badge.earned ? T.ink2 : T.ink4)
                .multilineTextAlignment(.center).lineLimit(2)
            // 목표치를 모르면 진행도를 지어내지 않는다
            if !badge.earned, let target = badge.target {
                Text("\(badge.progress)/\(target)").font(T.body(10)).foregroundStyle(T.ink4)
            }
        }
    }
}
