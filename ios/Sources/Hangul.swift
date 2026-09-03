import Foundation

/// 한글 초성 검색. '아스날'을 'ㅇㅅㄴ' 으로도 찾을 수 있어야 한다 —
/// 팀 이름을 다 치게 하면 최애 팀 고르기가 지루해진다.
enum Hangul {
    private static let initials: [Character] = [
        "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ",
    ]

    /// 문자열의 초성만 뽑는다. 한글이 아니면 그대로 둔다.
    static func chosung(_ s: String) -> String {
        String(s.unicodeScalars.map { u -> Character in
            let v = Int(u.value)
            guard v >= 0xAC00, v <= 0xD7A3 else { return Character(u) }
            return initials[(v - 0xAC00) / 588]
        })
    }

    /// 이름·영문명·약어 중 하나라도 걸리면 통과
    static func matches(_ query: String, _ candidates: String...) -> Bool {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return true }
        // 질의가 초성만으로 이루어졌으면 초성끼리 비교한다
        let isChosungOnly = q.allSatisfy { initials.contains($0) }
        return candidates.contains { c in
            let lower = c.lowercased()
            if lower.contains(q) { return true }
            if isChosungOnly { return chosung(lower).contains(q) }
            return false
        }
    }
}
