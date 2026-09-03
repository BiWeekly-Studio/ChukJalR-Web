import AuthenticationServices
import SwiftUI
import UIKit

/// 로그인 화면. 앱에 들어오는 유일한 문이다 — 게스트는 두지 않는다.
struct LoginView: View {
    @EnvironmentObject var auth: Auth

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            PlateLogo(width: 260)
            Text("찍는 게 아니라 읽는 사람들의 리그.")
                .font(T.body(13))
                .foregroundStyle(T.ink3)
                .padding(.top, 16)

            if let error = auth.error {
                Text(error)
                    .font(T.body(12.5, .semibold))
                    .foregroundStyle(T.cool)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(T.coolSoft, in: RoundedRectangle(cornerRadius: 12))
                    .padding(.top, 22)
                    .padding(.horizontal, 20)
            }

            Spacer()

            VStack(spacing: 10) {
                // 애플이 정한 규격 버튼을 그대로 쓴다. 직접 그리면 심사에서 지적받는다.
                SignInWithAppleButton(.continue) { _ in
                    auth.signInWithApple()
                } onCompletion: { _ in }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 52)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .allowsHitTesting(!auth.busy)

                Button(action: auth.signInWithGoogle) {
                    HStack(spacing: 9) {
                        GoogleMark().frame(width: 17, height: 17)
                        Text("Google로 계속하기").font(T.display(14.5, .heavy))
                    }
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .foregroundStyle(Color(hex: 0x1F1F1F))
                    .background(.white, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(T.lineStrong, lineWidth: 1.5))
                }
                .disabled(auth.busy)

                Text("예측 기록과 순위는 이 계정에 저장돼요.")
                    .font(T.body(11))
                    .foregroundStyle(T.ink3)
                    .padding(.top, 6)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
            .opacity(auth.busy ? 0.5 : 1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(T.paper)
    }
}

/// 구글 G. 브랜드 규정에 따라 공식 경로를 그대로 쓴다 —
/// 근사 도형으로 그리면 규정 위반이고, 무엇보다 구글 로고로 안 보인다.
struct GoogleMark: View {
    private static let paths: [(String, Color)] = [
        ("M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z",
         Color(hex: 0x4285F4)),
        ("M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z",
         Color(hex: 0x34A853)),
        ("M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z",
         Color(hex: 0xFBBC05)),
        ("M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z",
         Color(hex: 0xEA4335)),
    ]

    var body: some View {
        Canvas { ctx, size in
            let rect = CGRect(origin: .zero, size: size)
            for (d, color) in Self.paths {
                ctx.fill(Path(svg: d, in: rect, viewBox: 48), with: .color(color))
            }
        }
    }
}

/// 워드마크 — '알'의 ㅇ 자리에 공. 웹과 같은 구성이다.
///
/// 자모를 따로 그리면 글꼴마다 어긋난다. '축잘알'을 통째로 그린 뒤,
/// UIFont 로 '축잘' 과 '축잘알' 의 폭을 재서 '알' 이 놓인 칸을 구하고
/// 그 칸 안의 비율로 공을 얹는다 — 글꼴이 바뀌어도 자리가 따라간다.
struct Wordmark: View {
    var size: CGFloat = 28
    var tone: Color = T.accent

    /// '알' 칸 기준 비율. 시뮬레이터에서 눈으로 맞춘 값이다.
    private static let ballX = 0.045
    private static let ballY = 0.255
    private static let ballScale = 0.56

    var body: some View {
        let pt = size * 1.18
        let uiFont = UIFont.systemFont(ofSize: pt, weight: .black)
        let attrs: [NSAttributedString.Key: Any] = [.font: uiFont]
        let full = ("축잘알" as NSString).size(withAttributes: attrs).width
        let head = ("축잘" as NSString).size(withAttributes: attrs).width
        let block = full - head
        let height = uiFont.lineHeight

        ZStack(alignment: .topLeading) {
            Text("축잘알")
                .font(.system(size: pt, weight: .black))
                .foregroundStyle(tone)
            Ball(diameter: block * Self.ballScale, ink: tone)
                .offset(x: head + block * Self.ballX, y: height * Self.ballY)
        }
        .frame(width: full, height: height, alignment: .topLeading)
        .accessibilityElement()
        .accessibilityLabel("축잘알")
    }
}

/// 축구공 — 원 + 오각형 + 다섯 이음선. 작아지면 이음선을 뺀다.
struct Ball: View {
    var diameter: CGFloat
    var ink: Color = T.accent

    private let angles: [Double] = [-90, -18, 54, 126, 198]

    var body: some View {
        Canvas { ctx, size in
            let r = size.width / 2
            let c = CGPoint(x: r, y: r)
            ctx.fill(Path(ellipseIn: CGRect(origin: .zero, size: size)), with: .color(.white))
            ctx.stroke(Path(ellipseIn: CGRect(origin: .zero, size: size).insetBy(dx: r * 0.08, dy: r * 0.08)),
                       with: .color(ink), lineWidth: r * 0.16)

            let pent = r * 0.42
            var p = Path()
            for (i, a) in angles.enumerated() {
                let t = a * .pi / 180
                let pt = CGPoint(x: c.x + cos(t) * pent, y: c.y + sin(t) * pent)
                i == 0 ? p.move(to: pt) : p.addLine(to: pt)
            }
            p.closeSubpath()
            ctx.fill(p, with: .color(ink))

            if size.width >= 15 {
                for a in angles {
                    let t = a * .pi / 180
                    var line = Path()
                    line.move(to: CGPoint(x: c.x + cos(t) * pent, y: c.y + sin(t) * pent))
                    line.addLine(to: CGPoint(x: c.x + cos(t) * r * 0.93, y: c.y + sin(t) * r * 0.93))
                    ctx.stroke(line, with: .color(ink), style: .init(lineWidth: r * 0.16, lineCap: .round))
                }
            }
        }
        .frame(width: diameter, height: diameter)
    }
}
