import Foundation

// 웹 tests/scoring.test.mjs 와 같은 검증을 Swift 쪽에서도 돌린다.
// 두 클라이언트가 다른 숫자를 보여주면 유저는 어느 쪽을 믿어야 할지 모른다.
var failures = 0
func check(_ name: String, _ ok: Bool, _ detail: String = "") {
    if ok { print("  ✔ \(name)") } else { failures += 1; print("  ✖ \(name) \(detail)") }
}

let q: Distribution = [0.45, 0.26, 0.29]

print("점수 엔진")
// 명세 2.5 — 맞으면 얻고 틀리면 잃는다, 확신이 클수록 폭이 커진다
let p1 = Scoring.preview(q, .home, .hunch)
let p2 = Scoring.preview(q, .home, .fairly)
let p3 = Scoring.preview(q, .home, .certain)
check("확신이 클수록 얻는 폭이 커진다", p1.ifCorrect < p2.ifCorrect && p2.ifCorrect < p3.ifCorrect,
      "\(p1.ifCorrect) \(p2.ifCorrect) \(p3.ifCorrect)")
check("확신이 클수록 잃는 폭도 커진다", p1.ifWrong > p2.ifWrong && p2.ifWrong > p3.ifWrong,
      "\(p1.ifWrong) \(p2.ifWrong) \(p3.ifWrong)")

// 명세 2.5 — 틀렸을 때 손해는 어떤 오답이든 같다
let wrongDraw = Scoring.deltaRating(q, .home, .fairly, actual: .draw)
let wrongAway = Scoring.deltaRating(q, .home, .fairly, actual: .away)
check("틀렸을 때 손해는 어떤 오답이든 같다", wrongDraw == wrongAway, "\(wrongDraw) vs \(wrongAway)")

// 소수 의견을 맞히면 다수 의견보다 크게 얻는다
let majority = Scoring.preview(q, .home, .fairly).ifCorrect
let minority = Scoring.preview(q, .draw, .fairly).ifCorrect
check("소수 의견 적중이 더 크다", minority > majority, "\(minority) vs \(majority)")

// 확률 분포의 합은 항상 1
for c in Confidence.allCases {
    for pick in Outcome.allCases {
        let sum = Scoring.userDistribution(q, pick, c).reduce(0, +)
        check("분포 합 = 1 (\(pick.rawValue)/\(c.rawValue))", abs(sum - 1) < 1e-9, "\(sum)")
    }
}

// 정직성 — 확신을 부풀리면 기대값이 떨어진다
// 실제 확률이 기준선과 같을 때, 확신을 올릴수록 기대 지수는 낮아져야 한다
func expected(_ c: Confidence) -> Double {
    let correct = Double(Scoring.deltaRating(q, .home, c, actual: .home))
    let wrong = Double(Scoring.deltaRating(q, .home, c, actual: .draw))
    return q[0] * correct + (1 - q[0]) * wrong
}
check("확신을 부풀리면 기대값이 떨어진다", expected(.hunch) > expected(.certain),
      "\(expected(.hunch)) vs \(expected(.certain))")

print("레벨 · 티어")
check("Lv.1 시작", Progression.level(fromPoints: 0).level == 1)
check("2910점 → Lv.13", Progression.level(fromPoints: 2910).level == 13,
      "\(Progression.level(fromPoints: 2910).level)")
check("배치 전에는 PLACEMENT", Progression.tier(topPercent: 3.1, settledMatches: 5) == .placement)
check("배치 후 순위 없으면 nil", Progression.tier(topPercent: nil, settledMatches: 50) == nil)
check("상위 3.1% → 마스터", Progression.tier(topPercent: 3.1, settledMatches: 50) == .master)
check("상위 0.5% → 그랜드마스터", Progression.tier(topPercent: 0.5, settledMatches: 50) == .grandmaster)

// 웹과 값이 같은지 — 아래 기대값은 node 로 뽑아 붙인 것이다
print("웹과 값 일치")
let cases: [(Outcome, Confidence, Int, Int)] = WEB_EXPECTED
for (pick, conf, correct, wrong) in cases {
    let p = Scoring.preview(q, pick, conf)
    check("\(pick.rawValue)/\(conf.rawValue) → +\(correct)/\(wrong)",
          p.ifCorrect == correct && p.ifWrong == wrong,
          "실제 +\(p.ifCorrect)/\(p.ifWrong)")
}

print(failures == 0 ? "\n전부 통과" : "\n\(failures)건 실패")
exit(failures == 0 ? 0 : 1)
