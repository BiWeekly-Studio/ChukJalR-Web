import Foundation
import UIKit

enum Fmt {
    static func pct(_ v: Double) -> String { "\(Int((v * 100).rounded()))%" }
    static func signed(_ v: Int) -> String { v > 0 ? "+\(v)" : "−\(abs(v))" }
    /// 3.1 → "3.1", 3.0 → "3"
    static func trim(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v)
    }

    static func comma(_ v: Int) -> String {
        let f = NumberFormatter(); f.numberStyle = .decimal
        return f.string(from: NSNumber(value: v)) ?? "\(v)"
    }

    private static let hhmm: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "HH:mm"; return f
    }()

    /// "오늘 23:42" / "내일 01:12" / "9월 5일 20:00"
    static func kickoff(_ date: Date) -> String {
        let cal = Calendar.current
        let time = hhmm.string(from: date)
        if cal.isDateInToday(date) { return "오늘 \(time)" }
        if cal.isDateInTomorrow(date) { return "내일 \(time)" }
        let c = cal.dateComponents([.month, .day], from: date)
        return "\(c.month!)월 \(c.day!)일 \(time)"
    }

    static func opens(_ date: Date) -> String {
        let cal = Calendar.current
        let time = hhmm.string(from: date)
        if cal.isDateInToday(date) { return "오늘 \(time)에 열려요" }
        if cal.isDateInTomorrow(date) { return "내일 \(time)에 열려요" }
        let c = cal.dateComponents([.month, .day], from: date)
        return "\(c.month!)월 \(c.day!)일 \(time)에 열려요"
    }

    /// "오늘" · "어제" · "9월 2일 화요일" — 기록을 날짜로 묶을 때 쓴다
    static func dayLabel(_ date: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return "오늘" }
        if cal.isDateInYesterday(date) { return "어제" }
        if cal.isDateInTomorrow(date) { return "내일" }
        let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = cal.isDate(date, equalTo: .now, toGranularity: .year)
            ? "M월 d일 EEEE" : "yyyy년 M월 d일"
        return f.string(from: date)
    }

    /// "9월 3일 목요일"
    static func dateHeading(_ date: Date) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "M월 d일 EEEE"
        return f.string(from: date)
    }
}

/// 손끝 반응. 게임 화면에서 이게 있고 없고가 체감을 가른다.
enum Haptics {
    static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}
