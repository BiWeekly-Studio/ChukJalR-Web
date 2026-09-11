const labels: Record<number, [string, string]> = {
  2: ['UEFA 챔피언스리그', '챔피언스'], 3: ['UEFA 유로파리그', '유로파'], 848: ['UEFA 컨퍼런스리그', '컨퍼런스'],
  1: ['FIFA 월드컵', '월드컵'], 4: ['UEFA 유로', '유로'], 5: ['UEFA 네이션스리그', '네이션스'],
  6: ['아프리카 네이션스컵', '아프리카컵'], 7: ['AFC 아시안컵', '아시안컵'], 9: ['코파 아메리카', '코파'],
  10: ['국가대표 친선경기', 'A매치 친선'], 22: ['CONCACAF 골드컵', '골드컵'], 23: ['EAFF E-1 챔피언십', '동아시안컵'],
  29: ['월드컵 아프리카 예선', '월드컵 아프리카'], 30: ['월드컵 아시아 예선', '월드컵 아시아'],
  31: ['월드컵 북중미 예선', '월드컵 북중미'], 32: ['월드컵 유럽 예선', '월드컵 유럽'],
  33: ['월드컵 오세아니아 예선', '월드컵 오세아니아'], 34: ['월드컵 남미 예선', '월드컵 남미'],
  35: ['아시안컵 예선', '아시안컵 예선'], 36: ['아프리카 네이션스컵 예선', '아프리카컵 예선'],
  37: ['월드컵 대륙간 플레이오프', '월드컵 PO'], 960: ['유로 예선', '유로 예선'],
  15: ['FIFA 클럽 월드컵', '클럽 월드컵'], 17: ['AFC 챔피언스리그 엘리트', 'ACLE'],
  18: ['AFC 챔피언스리그 2', 'ACL2'], 13: ['코파 리베르타도레스', '리베르타도레스'],
  11: ['코파 수다메리카나', '수다메리카나'], 12: ['CAF 챔피언스리그', 'CAF 챔스'],
  20: ['CAF 컨페더레이션컵', 'CAF컵'], 25: ['걸프컵', '걸프컵'],
  666: ['여자 국가대표 친선경기', '여자 친선'], 667: ['클럽 친선경기', '클럽 친선'],
  8: ['FIFA 여자 월드컵', '여자 월드컵'], 920: ['FIFA U-20 여자 월드컵', '여자 U20 월드컵'],
  850: ['UEFA U-21 챔피언십 예선', 'U21 유로 예선'], 886: ['UEFA U-17 챔피언십 예선', 'U17 유로 예선'],
  893: ['UEFA U-19 챔피언십 예선', 'U19 유로 예선'], 880: ['여자 월드컵 유럽 예선', '여자 월드컵 예선'],
  14: ['UEFA 유스리그', '유스리그'], 525: ['UEFA 여자 챔피언스리그', '여자 챔스'],
  1168: ['FIFA 인터콘티넨털컵', '인터콘티넨털컵'],
};

export function competitionLabel(id: number, original: string) {
  const [name, short_name] = labels[id] ?? [original, original];
  return { name, short_name };
}

export function isSupportedCompetition(id: number, worldIds: Set<number>) {
  // Kings League는 7인제·특수 규칙이라 정규 90분 승무패 정산 대상에 포함하지 않는다.
  return [39, 140, 78, 135, 61].includes(id) || (worldIds.has(id) && id !== 1213);
}

export function scheduleDates(now: Date, futureDays: number) {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: futureDays + 4 }, (_, i) => new Date(midnight + (i - 3) * 864e5).toISOString().slice(0, 10));
}
