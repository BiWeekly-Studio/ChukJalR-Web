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

                trend.padding(.horizontal, 20).padding(.top, 12)

                StatTabs(stats: stats,
                         minCalibrationN: minCalibrationN,
                         minFanBiasN: minFanBiasN)
                    .environmentObject(store)
                    .padding(.horizontal, 20).padding(.top, 12)

                // 열린 뱃지가 없으면 자리를 만들지 않는다. 빈 상자를 두면
                // '뭔가 고장 났나' 로 읽힌다.
                if !store.badges.isEmpty {
                    section("모은 뱃지", hint: "\(store.badges.filter(\.earned).count)개 획득") {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4),
                                  spacing: 14) {
                            ForEach(store.badges.prefix(8)) { b in BadgeCell(badge: b) }
                        }
                    }
                }

                NotificationSettingsCard()
                    .environmentObject(store)
                    .padding(.horizontal, 20).padding(.top, 12)

                chatPolicy.padding(.horizontal, 20).padding(.top, 24)
                accountCard.padding(.horizontal, 20).padding(.top, 24)
                deleteRow.frame(maxWidth: .infinity)
                    .padding(.top, 16).padding(.bottom, 28)
            }
        }
        .background(T.paper)
    }

    // MARK: 흐름

    /// 지수가 어떻게 움직였는지와 최근 10경기.
    ///
    /// 숫자 세 개(적중률·누적·연속)는 '지금'만 말해준다. 사람이 궁금한 건
    /// 올라가는 중인지 내려가는 중인지다.
    private var trend: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("흐름").font(T.display(14, .heavy))
                Spacer()
                if !stats.recent.isEmpty {
                    Text("최근 \(stats.recent.count)경기 · \(stats.recent.filter(\.correct).count) 적중")
                        .font(T.body(11)).foregroundStyle(T.ink3)
                }
            }

            if stats.curve.count >= 2 {
                RatingCurve(values: stats.curve).padding(.top, 12)
                HStack {
                    Text("\(Fmt.comma(stats.curve.min() ?? 0))")
                    Spacer()
                    Text("\(Fmt.comma(stats.curve.max() ?? 0))")
                }
                .font(T.body(10)).foregroundStyle(T.ink4).padding(.top, 2)
            }

            if stats.recent.isEmpty {
                Text("첫 경기가 정산되면 지수가 어떻게 움직이는지 여기에 그려집니다.")
                    .font(T.body(12)).foregroundStyle(T.ink3).lineSpacing(3)
                    .padding(.top, 10)
            } else {
                HStack(spacing: 6) {
                    // 최근이 오른쪽에 오도록 뒤집는다 — 선 그래프와 방향을 맞춘다
                    ForEach(Array(stats.recent.reversed())) { r in
                        RoundedRectangle(cornerRadius: 9)
                            .fill(r.correct ? AnyShapeStyle(T.gradWin) : AnyShapeStyle(T.line))
                            .frame(height: 28)
                            .overlay {
                                Text(Fmt.signed(r.delta))
                                    .font(T.num(10))
                                    .foregroundStyle(r.correct ? .white : T.ink3)
                            }
                    }
                }
                .padding(.top, stats.curve.count >= 2 ? 12 : 10)
            }
        }
        .padding(EdgeInsets(top: 14, leading: 16, bottom: 16, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(T.card, in: RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.08), radius: 12, y: 5)
    }

    // MARK: 프로필 카드

    private var profileCard: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 11) {
                    Group {
                        if let url = store.me.avatarUrl {
                            Avatar(url: url, initial: store.me.handle, size: 54)
                        } else {
                            // 사진이 없을 때는 그라데이션 카드 위라서 Avatar 의 기본
                            // 배경(같은 그라데이션)이 묻힌다. 여기서는 반투명 원을 쓴다.
                            Text(String(store.me.handle.prefix(1)))
                                .font(T.display(21))
                                .frame(width: 54, height: 54)
                                .background(.white.opacity(0.2), in: Circle())
                        }
                    }
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
                        CountUpInt(target: store.me.rating, font: T.num(26), duration: 1.2)
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
            // 적중률은 아직 정산된 경기가 없으면 값 자체가 없다. 0% 로 굴리면 없는 성적이 생긴다.
            statTile(stats.accuracy.map { Int(($0 * 100).rounded()) }, "적중률",
                     suffix: "%", icon: "target", accent: true)
            statTile(stats.settled, "누적 예측")
            statTile(store.me.streak, "연속 적중", icon: "flame.fill", gold: true)
        }
    }

    private func statTile(_ value: Int?, _ label: String, suffix: String = "",
                          icon: String? = nil, accent: Bool = false, gold: Bool = false) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 3) {
                if let icon {
                    Image(systemName: icon).font(.system(size: 14))
                        .foregroundStyle(gold ? T.goldInk : T.accent)
                }
                Group {
                    if let value {
                        CountUpInt(target: value, font: T.num(25), duration: 1.0) { "\($0)\(suffix)" }
                    } else {
                        Text("—").font(T.num(25))
                    }
                }
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

    @State private var editing = false
    @State private var confirmingDelete = false
    @State private var deleting = false

    private var accountCard: some View {
        HStack(spacing: 10) {
            Avatar(url: store.me.avatarUrl, initial: store.me.handle, size: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(store.me.handle).font(T.display(13, .heavy)).lineLimit(1)
                Button("프로필 편집") { editing = true }
                    .font(T.body(11)).foregroundStyle(T.accent)
            }
            Spacer()
            Button("로그아웃", action: auth.signOut)
                .font(T.body(12, .heavy)).foregroundStyle(T.ink2)
                .padding(.horizontal, 12).frame(height: 32)
                .background(T.card2, in: Capsule())
        }
        .padding(16)
        .background(T.card, in: RoundedRectangle(cornerRadius: 18))
        .sheet(isPresented: $editing) { ProfileEditView().environmentObject(store) }
    }

    /// 계정 삭제.
    ///
    /// 계정을 만들 수 있는 앱은 앱 안에서 삭제도 할 수 있어야 한다 (App Store 5.1.1(v)).
    /// 눈에 잘 안 띄게 두되 찾을 수는 있게 — 실수로 누르는 자리에 두지 않는다.
    private var deleteRow: some View {
        Button("계정 삭제") { confirmingDelete = true }
            .font(T.body(11)).foregroundStyle(T.ink4)
            .disabled(deleting)
            .confirmationDialog("계정을 삭제할까요?", isPresented: $confirmingDelete,
                                titleVisibility: .visible) {
                Button("삭제", role: .destructive) { deleteAccount() }
                Button("취소", role: .cancel) {}
            } message: {
                Text("예측 기록·지수·포인트가 모두 사라지고 되돌릴 수 없어요. "
                     + "채팅에 남긴 글은 가려집니다.")
            }
    }

    private func deleteAccount() {
        deleting = true
        Task {
            do {
                try await Repositories.current.deleteAccount()
                auth.signOut()
            } catch {
                store.error = error.localizedDescription
            }
            deleting = false
        }
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
