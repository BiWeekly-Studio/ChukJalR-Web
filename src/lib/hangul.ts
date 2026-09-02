const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

/** "아스날" → "ㅇㅅㄴ". 한글이 아닌 글자는 그대로 둔다. */
export function toChoseong(text: string): string {
  return [...text]
    .map((ch) => {
      const code = ch.charCodeAt(0) - 0xac00;
      return code >= 0 && code <= 11171 ? CHOSEONG[Math.floor(code / 588)] : ch;
    })
    .join('');
}

const ONLY_CHOSEONG = /^[ㄱ-ㅎ]+$/;

/**
 * 한국 앱에서 기대되는 검색: 한글명, 영문명, 초성 셋 다 걸린다.
 * "아스", "arsenal", "ㅇㅅㄴ" 모두 아스날을 찾아야 한다.
 */
export function matches(query: string, ...fields: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  return fields.some((f) => {
    if (!f) return false;
    const lower = f.toLowerCase();
    if (lower.includes(q)) return true;
    // 초성만 입력한 경우에만 초성 대조를 한다
    return ONLY_CHOSEONG.test(q) && toChoseong(f).includes(q);
  });
}
