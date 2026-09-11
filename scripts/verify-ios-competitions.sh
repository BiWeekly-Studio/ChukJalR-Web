#!/usr/bin/env bash
set -euo pipefail
CHECK_DIR=$(mktemp -d /tmp/chukjalr-ios-competitions.XXXXXX)
trap 'rm -rf "$CHECK_DIR"' EXIT
cat ios/Sources/Scoring.swift ios/Sources/Models.swift ios/Sources/Decode.swift ios/Sources/CompetitionCatalog.swift ios/Sources/Config.swift > "$CHECK_DIR/main.swift"
cat >> "$CHECK_DIR/main.swift" <<'SWIFT'
struct Catalog { let leagues:[League]; let teams:[Team]; let fixtures:[Fixture] }
enum Supabase { enum Failure: Error { case http(Int,String) } }
let empty = Data("[]".utf8)
let teamsJSON = Data(#"[{"id":42,"league_id":39,"name":"Arsenal","team_competitions":[{"league_id":39},{"league_id":2}]}]"#.utf8)
let fixturesJSON = Data(#"[{"id":1,"league_id":2,"round":"Quarter-finals","home_team_id":42,"away_team_id":50,"kickoff_at":"2026-10-15T16:45:00Z","opens_at":"2026-10-14T21:00:00Z","lock_at":"2026-10-15T16:40:00Z"}]"#.utf8)
let decoded = try Decode.catalog(leagues:empty,teams:teamsJSON,fixtures:fixturesJSON)
precondition(decoded.teams[0].leagueId == 39)
precondition(decoded.teams[0].participates(in:[2]))
precondition(!decoded.teams[0].participates(in:[848]))
precondition(decoded.fixtures[0].roundLabel == "Quarter-finals")
let leagues = [39,140,2,3,848,10].map { League(id:$0,name:"League",short:"L",country:"") }
precondition(CompetitionCatalog.ordered(leagues,preferred:[140,39,39,999]).map(\.id) == [140,39,2,3,848,10])
let full = (0..<1562).map { ["id":$0] }
let pages = try await CatalogPaging.load("fixture?order=id") { path in
 let offset = Int(path.components(separatedBy:"offset=").last!)!
 return try JSONSerialization.data(withJSONObject:Array(full.dropFirst(offset).prefix(500)))
}
let decodedPages = try JSONSerialization.jsonObject(with:pages) as! [[String:Int]]
precondition(decodedPages.count == 1562)
var threw = false
 do {
  _ = try await CatalogPaging.load("fixture?order=id") { path in
   if path.hasSuffix("offset=500") { throw CatalogPaging.Failure.invalidResponse }
   return try JSONSerialization.data(withJSONObject:Array(full.prefix(500)))
  }
 } catch { threw = true }
precondition(threw)
print("PASS: new competition order, team membership, round label, 1562-row pagination, failure propagation")

// 실제 공개 경기 데이터만 읽는다. 사용자 계정·예측·결제 데이터는 접근하지 않는다.
func get(_ path:String) async throws -> Data {
 var request=URLRequest(url:URL(string:Config.supabaseURL+"/rest/v1/"+path)!)
 request.setValue(Config.supabaseAnonKey,forHTTPHeaderField:"apikey")
 let (data,response)=try await URLSession.shared.data(for:request)
 guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw CatalogPaging.Failure.invalidResponse }
 return data
}
let formatter=ISO8601DateFormatter()
let since=formatter.string(from:Date().addingTimeInterval(-3*86400))
let horizon=formatter.string(from:Date().addingTimeInterval(60*86400))
let liveTeams=try await CatalogPaging.load("teams?select=id,league_id,name,name_ko,abbr,color,tint,logo_url,team_competitions(league_id)&order=id",fetch:get)
let liveFixtures=try await CatalogPaging.load("fixtures?select=*&kickoff_at=gte.\(since)&kickoff_at=lte.\(horizon)&state=neq.VOID&order=kickoff_at,id",fetch:get)
let liveLeagues=try await get("leagues?select=id,name,short_name,country")
let catalog=try Decode.catalog(leagues:liveLeagues,teams:liveTeams,fixtures:liveFixtures)
for id in [2,3,848,10,5] { precondition(catalog.fixtures.contains { $0.leagueId == id }) }
let teamIds=Set(catalog.teams.map(\.id))
precondition(catalog.fixtures.allSatisfy { teamIds.contains($0.homeTeamId) && teamIds.contains($0.awayTeamId) })
precondition(catalog.fixtures.count > 1000)
print("PASS: live iOS catalog \(catalog.leagues.count) competitions / \(catalog.teams.count) teams / \(catalog.fixtures.count) fixtures; all 3 UEFA cups, friendlies and Nations League present")
SWIFT
swift "$CHECK_DIR/main.swift"
