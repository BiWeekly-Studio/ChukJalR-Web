/**
 * 비밀번호 검증.
 *
 * 서버(Supabase Auth)도 최소 길이를 강제하지만, 거기서 걸리면 영어 오류 메시지가
 * 그대로 튀어나온다. 그래서 같은 규칙을 여기서 먼저 보고, 무엇이 모자란지
 * 입력하는 동안 한국어로 알려준다.
 *
 * 대시보드의 Authentication → Password Requirements 를 이 규칙보다 느슨하게 두면
 * 여기서 막은 것이 서버에서는 통과한다. 둘을 같이 맞춰 둘 것.
 */

/** Supabase 기본값은 6이지만 6자는 너무 짧다 */
export const MIN_LENGTH = 8;
export const MAX_LENGTH = 72; // bcrypt 가 72바이트에서 자른다

/** 유출 목록 상위에 늘 있는 것들. 길이·조합 규칙을 통과하는 것만 골라 담았다. */
const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssword',
  'qwerty123', 'qwertyui', 'asdfasdf', 'asdf1234', 'zxcvbnm1',
  '12345678', '123456789', '1234567890', '11111111', '00000000',
  'iloveyou', 'sunshine', 'princess', 'football', 'baseball',
  'abcd1234', 'a1234567', 'admin123', 'welcome1', 'letmein1',
  'chukjalal', '축잘알', 'chukjalal1',
]);

export interface Rule {
  id: string;
  label: string;
  pass: boolean;
}

export interface PasswordCheck {
  /** 가입/변경을 허용해도 되는지 */
  ok: boolean;
  /** 0(위험) ~ 4(아주 좋음). 막는 기준이 아니라 안내용이다 */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  rules: Rule[];
}

const STRENGTH_LABEL = ['너무 약해요', '약해요', '보통이에요', '좋아요', '아주 좋아요'];

/** 같은 문자 4번 이상 (aaaa) */
function hasRun(pw: string): boolean {
  return /(.)\1{3,}/.test(pw);
}

/** 키보드·숫자 연속 4자 이상 (abcd, 1234, qwer) */
function hasSequence(pw: string): boolean {
  const lower = pw.toLowerCase();
  const rows = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  for (const row of rows) {
    for (let i = 0; i + 4 <= row.length; i++) {
      const seq = row.slice(i, i + 4);
      const rev = [...seq].reverse().join('');
      if (lower.includes(seq) || lower.includes(rev)) return true;
    }
  }
  return false;
}

/** 이메일 아이디나 닉네임을 그대로 담았는지 */
function containsIdentity(pw: string, email?: string, handle?: string): boolean {
  const lower = pw.toLowerCase();
  const parts = [email?.split('@')[0], handle]
    .map((v) => v?.trim().toLowerCase())
    .filter((v): v is string => Boolean(v) && v!.length >= 3);
  return parts.some((v) => lower.includes(v));
}

export function checkPassword(
  password: string,
  identity: { email?: string; handle?: string } = {}
): PasswordCheck {
  const pw = password;
  const lower = pw.toLowerCase();

  const rules: Rule[] = [
    { id: 'length', label: `${MIN_LENGTH}자 이상`, pass: pw.length >= MIN_LENGTH && pw.length <= MAX_LENGTH },
    { id: 'letter', label: '영문 포함', pass: /[A-Za-z]/.test(pw) },
    { id: 'digit', label: '숫자 포함', pass: /\d/.test(pw) },
    { id: 'notCommon', label: '흔한 비밀번호가 아님', pass: pw.length > 0 && !COMMON.has(lower) },
    {
      id: 'notIdentity',
      label: '이메일·닉네임과 다름',
      pass: pw.length > 0 && !containsIdentity(pw, identity.email, identity.handle),
    },
  ];

  const ok = rules.every((r) => r.pass);

  // 강도는 통과 여부와 별개로 계산한다. 규칙만 겨우 넘긴 비밀번호도 있기 때문이다.
  let points = 0;
  if (pw.length >= MIN_LENGTH) points += 1;
  if (pw.length >= 12) points += 1;
  const variety =
    Number(/[a-z]/.test(pw)) +
    Number(/[A-Z]/.test(pw)) +
    Number(/\d/.test(pw)) +
    Number(/[^A-Za-z0-9]/.test(pw));
  if (variety >= 3) points += 1;
  if (variety >= 4) points += 1;
  if (hasRun(pw) || hasSequence(pw)) points -= 1;
  if (COMMON.has(lower)) points = 0;

  const score = Math.max(0, Math.min(4, points)) as PasswordCheck['score'];

  return { ok, score, label: STRENGTH_LABEL[score], rules };
}
