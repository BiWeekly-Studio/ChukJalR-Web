import SwiftUI

/// 아주 작은 SVG path 파서.
///
/// 브랜드 로고(구글 G)처럼 규정된 도형은 근사해서 그리면 안 된다.
/// 원본 path 문자열을 그대로 쓰기 위한 최소 구현 — M/L/H/V/C/S/Z 와 상대 좌표만 다룬다.
/// 로고에 필요한 명령이 이게 전부다.
extension Path {
    init(svg d: String, in rect: CGRect, viewBox: CGFloat) {
        self.init()
        let scale = min(rect.width, rect.height) / viewBox
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x * scale, y: rect.minY + y * scale)
        }

        var current = CGPoint.zero
        var start = CGPoint.zero
        var lastControl: CGPoint?
        var scanner = SVGScanner(d)

        while let cmd = scanner.nextCommand() {
            let relative = cmd.isLowercase
            switch Character(String(cmd).uppercased()) {
            case "M":
                guard let x = scanner.number(), let y = scanner.number() else { break }
                current = relative ? CGPoint(x: current.x + x, y: current.y + y) : CGPoint(x: x, y: y)
                start = current
                move(to: p(current.x, current.y))
                lastControl = nil
            case "L":
                while let x = scanner.number(), let y = scanner.number() {
                    current = relative ? CGPoint(x: current.x + x, y: current.y + y) : CGPoint(x: x, y: y)
                    addLine(to: p(current.x, current.y))
                }
                lastControl = nil
            case "H":
                while let x = scanner.number() {
                    current.x = relative ? current.x + x : x
                    addLine(to: p(current.x, current.y))
                }
                lastControl = nil
            case "V":
                while let y = scanner.number() {
                    current.y = relative ? current.y + y : y
                    addLine(to: p(current.x, current.y))
                }
                lastControl = nil
            case "C":
                while let x1 = scanner.number(), let y1 = scanner.number(),
                      let x2 = scanner.number(), let y2 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() {
                    let c1 = relative ? CGPoint(x: current.x + x1, y: current.y + y1) : CGPoint(x: x1, y: y1)
                    let c2 = relative ? CGPoint(x: current.x + x2, y: current.y + y2) : CGPoint(x: x2, y: y2)
                    let end = relative ? CGPoint(x: current.x + x, y: current.y + y) : CGPoint(x: x, y: y)
                    addCurve(to: p(end.x, end.y), control1: p(c1.x, c1.y), control2: p(c2.x, c2.y))
                    lastControl = c2
                    current = end
                }
            case "S":
                // 앞 곡선의 제어점을 반사해서 첫 제어점으로 쓴다
                while let x2 = scanner.number(), let y2 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() {
                    let reflected = lastControl.map {
                        CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y)
                    } ?? current
                    let c2 = relative ? CGPoint(x: current.x + x2, y: current.y + y2) : CGPoint(x: x2, y: y2)
                    let end = relative ? CGPoint(x: current.x + x, y: current.y + y) : CGPoint(x: x, y: y)
                    addCurve(to: p(end.x, end.y), control1: p(reflected.x, reflected.y),
                             control2: p(c2.x, c2.y))
                    lastControl = c2
                    current = end
                }
            case "Z":
                closeSubpath()
                current = start
                lastControl = nil
            default:
                break
            }
        }
    }
}

/// path 문자열을 명령과 숫자로 끊어 읽는다
private struct SVGScanner {
    private let chars: [Character]
    private var i = 0
    init(_ s: String) { chars = Array(s) }

    private mutating func skipSeparators() {
        while i < chars.count, chars[i] == " " || chars[i] == "," || chars[i] == "\n" { i += 1 }
    }

    mutating func nextCommand() -> Character? {
        skipSeparators()
        guard i < chars.count, chars[i].isLetter else { return nil }
        defer { i += 1 }
        return chars[i]
    }

    /// 다음 숫자. 명령 글자를 만나면 nil 을 돌려 반복을 끝낸다.
    mutating func number() -> CGFloat? {
        skipSeparators()
        guard i < chars.count else { return nil }
        // 부호는 구분자 없이 붙어 오기도 한다 (예: 24-4.5)
        if chars[i].isLetter { return nil }

        var s = ""
        if chars[i] == "-" || chars[i] == "+" { s.append(chars[i]); i += 1 }
        var seenDot = false
        while i < chars.count {
            let c = chars[i]
            if c.isNumber { s.append(c); i += 1 }
            else if c == ".", !seenDot { seenDot = true; s.append(c); i += 1 }
            else { break }
        }
        return Double(s).map { CGFloat($0) }
    }
}
