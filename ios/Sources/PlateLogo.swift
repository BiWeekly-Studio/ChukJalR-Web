import SwiftUI

/// 축잘알 로고.
///
/// 폰트가 아니라 획을 직접 쌓아 그린 글자다. 한 글자를 100x100 칸에 꽉 채우고
/// 세 글자를 붙여 덩어리로 만든 뒤, 판때기에 얹고 살짝 기울인다.
/// 두께는 두꺼운 외곽선과 아래로 밀린 그림자 한 겹으로 낸다.
///
/// 좌표는 design/wordmark-v2.html 과 같다 — 한쪽만 고치면 웹과 갈라진다.
struct PlateLogo: View {
    /// 로고 전체 너비. 높이는 비율로 따라온다.
    var width: CGFloat = 200
    var tone: Tone = .onLight

    enum Tone {
        /// 밝은 배경 — 파란 판때기에 흰·노란 글자
        case onLight
        /// 어두운 배경 — 흰 판때기에 파란·주황 글자
        case onDark
    }

    private var plateFill: Color { tone == .onLight ? Color(hex: 0x3A63FF) : .white }
    private var plateShadow: Color { tone == .onLight ? Color(hex: 0x1B2A7A) : Color(hex: 0xC9D2FF) }
    private var inkA: Color { tone == .onLight ? .white : Color(hex: 0x3A63FF) }
    private var inkB: Color { tone == .onLight ? Color(hex: 0xFFC02E) : Color(hex: 0xFF8A1A) }
    private var ballInk: Color { Color(hex: 0x3A63FF) }
    private let outline = Color(hex: 0x141233)

    // 칸 100, 사이 6 → 덩어리 312 x 100. 판때기 여백 16, 기울기 -4°.
    private static let cell: CGFloat = 100
    private static let gap: CGFloat = 6
    private static let blockW = cell * 3 + gap * 2
    private static let pad: CGFloat = 16
    private static let boxW = blockW + 80          // viewBox 여유
    private static let boxH = cell + 92

    var body: some View {
        Canvas { ctx, size in
            let s = size.width / Self.boxW
            ctx.scaleBy(x: s, y: s)
            ctx.translateBy(x: 40, y: 40)          // viewBox 원점 보정

            // 덩어리째 기울인다
            ctx.translateBy(x: Self.blockW / 2, y: Self.cell / 2)
            ctx.rotate(by: .degrees(-4))
            ctx.translateBy(x: -Self.blockW / 2, y: -Self.cell / 2)

            drawPlate(&ctx, dy: 11, fill: plateShadow)
            drawPlate(&ctx, dy: 0, fill: plateFill)

            // 외곽선 한 겹 → 그 위를 채움이 덮어 내부 이음매를 가린다
            for i in 0..<3 {
                ctx.drawLayer { l in
                    l.translateBy(x: CGFloat(i) * (Self.cell + Self.gap), y: 0)
                    let p = glyph(i)
                    l.stroke(p, with: .color(outline), style: .init(lineWidth: 16, lineJoin: .round))
                    l.fill(p, with: .color(outline))
                }
            }
            for i in 0..<3 {
                ctx.drawLayer { l in
                    l.translateBy(x: CGFloat(i) * (Self.cell + Self.gap), y: 0)
                    l.fill(glyph(i), with: .color(i == 2 ? .white : (i == 1 ? inkB : inkA)))
                    if i == 2 {
                        // '알'의 ㅏ·ㄹ 은 글자색으로, 공 안쪽 무늬는 키 컬러로
                        l.fill(ah().union(rieul(52)), with: .color(inkA))
                        l.fill(ballPanel(), with: .color(ballInk))
                        for spoke in ballSpokes() {
                            l.stroke(spoke, with: .color(ballInk),
                                     style: .init(lineWidth: 5, lineCap: .round))
                        }
                    }
                }
            }
        }
        .frame(width: width, height: width * Self.boxH / Self.boxW)
        .accessibilityLabel("축잘알")
    }

    private func drawPlate(_ ctx: inout GraphicsContext, dy: CGFloat, fill: Color) {
        let rect = CGRect(x: -Self.pad, y: -Self.pad + dy,
                          width: Self.blockW + Self.pad * 2, height: Self.cell + Self.pad * 2)
        let p = Path(roundedRect: rect, cornerRadius: 18)
        ctx.fill(p, with: .color(fill))
        ctx.stroke(p, with: .color(outline), lineWidth: 13)
    }

    private func glyph(_ i: Int) -> Path {
        switch i {
        case 0: return chuk()
        case 1: return jal()
        default: return al()
        }
    }

    // MARK: 획

    private func bar(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> Path {
        Path(CGRect(x: x, y: y, width: w, height: h))
    }

    /// 사선 획 — 두께를 가진 사각형으로 만든다
    private func slash(_ x1: CGFloat, _ y1: CGFloat, _ x2: CGFloat, _ y2: CGFloat, _ w: CGFloat) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: x1, y: y1))
        p.addLine(to: CGPoint(x: x2, y: y2))
        return p.strokedPath(.init(lineWidth: w, lineCap: .butt))
    }

    private func chuk() -> Path {
        var p = bar(38, 0, 24, 8)
        p.addPath(bar(0, 11, 100, 13))
        p.addPath(slash(50, 24, 13, 38, 14))
        p.addPath(slash(50, 24, 87, 38, 14))
        p.addPath(bar(0, 45, 100, 12))
        p.addPath(bar(43, 57, 14, 11))
        p.addPath(bar(0, 76, 100, 12))
        p.addPath(bar(86, 88, 14, 12))
        return p
    }

    private func rieul(_ top: CGFloat) -> Path {
        var p = bar(0, top, 100, 12)
        p.addPath(bar(88, top + 12, 12, 6))
        p.addPath(bar(0, top + 18, 100, 12))
        p.addPath(bar(0, top + 30, 12, 6))
        p.addPath(bar(0, top + 36, 100, 12))
        return p
    }

    /// ㅏ — 칸 오른쪽 끝에 붙이지 않는다. 외곽선이 판때기를 넘어간다.
    private func ah() -> Path {
        var p = bar(71, 0, 14, 50)
        p.addPath(bar(85, 18, 11, 13))
        return p
    }

    private func jal() -> Path {
        var p = bar(0, 4, 58, 13)
        p.addPath(slash(29, 17, 4, 46, 14))
        p.addPath(slash(29, 17, 54, 46, 14))
        p.addPath(ah())
        p.addPath(rieul(52))
        return p
    }

    private static let ballCenter = CGPoint(x: 30, y: 25)
    private static let ballRadius: CGFloat = 25
    private static let angles: [Double] = [-90, -18, 54, 126, 198]

    private func al() -> Path {
        var p = Path(ellipseIn: CGRect(x: Self.ballCenter.x - Self.ballRadius,
                                       y: Self.ballCenter.y - Self.ballRadius,
                                       width: Self.ballRadius * 2, height: Self.ballRadius * 2))
        p.addPath(ah())
        p.addPath(rieul(52))
        return p
    }

    private func ballPanel() -> Path {
        let pent = Self.ballRadius * 0.44
        var p = Path()
        for (i, a) in Self.angles.enumerated() {
            let t = a * .pi / 180
            let pt = CGPoint(x: Self.ballCenter.x + cos(t) * pent,
                             y: Self.ballCenter.y + sin(t) * pent)
            i == 0 ? p.move(to: pt) : p.addLine(to: pt)
        }
        p.closeSubpath()
        return p
    }

    private func ballSpokes() -> [Path] {
        let pent = Self.ballRadius * 0.44
        return Self.angles.map { a in
            let t = a * .pi / 180
            var p = Path()
            p.move(to: CGPoint(x: Self.ballCenter.x + cos(t) * pent,
                               y: Self.ballCenter.y + sin(t) * pent))
            p.addLine(to: CGPoint(x: Self.ballCenter.x + cos(t) * Self.ballRadius * 0.88,
                                  y: Self.ballCenter.y + sin(t) * Self.ballRadius * 0.88))
            return p
        }
    }
}

private extension Path {
    /// 두 경로를 하나로 (채움 규칙만 필요하므로 단순 합치기)
    func union(_ other: Path) -> Path {
        var p = self
        p.addPath(other)
        return p
    }
}
