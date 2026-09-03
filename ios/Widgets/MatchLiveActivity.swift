import SwiftUI
import WidgetKit
import ActivityKit

/// 잠금화면과 다이나믹 아일랜드에 뜨는 경기 실황.
///
/// 채팅방에 들어가면 시작되고, 경기가 끝나면 스스로 닫힌다.
/// 앱을 닫아도 남아 있어야 하는 정보이므로 위젯 익스텐션에서 그린다.
@main
struct ChukjalalWidgets: WidgetBundle {
    var body: some Widget { MatchLiveActivity() }
}

struct MatchLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MatchActivityAttributes.self) { context in
            // 잠금화면 / 배너
            LockScreenView(context: context)
                .padding(16)
                .activityBackgroundTint(Color(white: 0.06))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    TeamBlock(abbr: context.attributes.homeAbbr, goals: context.state.homeGoals)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    TeamBlock(abbr: context.attributes.awayAbbr, goals: context.state.awayGoals)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text(minuteText(context)).font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white.opacity(0.75))
                        if let leading = context.state.myPickLeading {
                            Text(leading ? "내 예측 적중 중" : "내 예측 빗나가는 중")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(leading ? .green : .orange)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("\(context.attributes.homeName) vs \(context.attributes.awayName)")
                        .font(.system(size: 11)).foregroundStyle(.white.opacity(0.6))
                }
            } compactLeading: {
                Text(context.attributes.homeAbbr).font(.system(size: 12, weight: .heavy))
            } compactTrailing: {
                Text("\(context.state.homeGoals):\(context.state.awayGoals)")
                    .font(.system(size: 12, weight: .heavy)).monospacedDigit()
            } minimal: {
                Text("\(context.state.homeGoals):\(context.state.awayGoals)")
                    .font(.system(size: 11, weight: .heavy)).monospacedDigit()
            }
        }
    }

    private func minuteText(_ context: ActivityViewContext<MatchActivityAttributes>) -> String {
        if let m = context.state.minute, context.state.status == .live { return "\(m)'" }
        return context.state.status.label
    }
}

private struct TeamBlock: View {
    let abbr: String
    let goals: Int
    var body: some View {
        VStack(spacing: 3) {
            Text(abbr).font(.system(size: 11, weight: .bold)).foregroundStyle(.white.opacity(0.7))
            Text("\(goals)").font(.system(size: 26, weight: .black)).monospacedDigit()
                .foregroundStyle(.white)
        }
    }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<MatchActivityAttributes>

    var body: some View {
        HStack(spacing: 14) {
            TeamBlock(abbr: context.attributes.homeAbbr, goals: context.state.homeGoals)
            VStack(spacing: 3) {
                Text(context.state.status == .live && context.state.minute != nil
                     ? "\(context.state.minute!)'" : context.state.status.label)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white.opacity(0.75))
                if let leading = context.state.myPickLeading {
                    Text(leading ? "적중 중" : "빗나가는 중")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(leading ? .green : .orange)
                }
            }
            TeamBlock(abbr: context.attributes.awayAbbr, goals: context.state.awayGoals)
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("축잘알").font(.system(size: 11, weight: .black))
                    .foregroundStyle(Color(red: 0.29, green: 0.39, blue: 1))
                if let pick = context.attributes.myPick {
                    Text("내 예측 \(pick)").font(.system(size: 10))
                        .foregroundStyle(.white.opacity(0.55))
                }
            }
        }
    }
}
