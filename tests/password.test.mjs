import test from 'node:test';
import assert from 'node:assert/strict';

// src/lib/password.ts 의 규칙을 그대로 옮겨 검증한다 (tsc 없이 돌리기 위함).
// 규칙을 고치면 이 파일도 함께 고쳐야 한다.
const MIN_LENGTH = 8;
const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssword',
  'qwerty123', 'qwertyui', 'asdfasdf', 'asdf1234', 'zxcvbnm1',
  '12345678', '123456789', '1234567890', '11111111', '00000000',
  'iloveyou', 'sunshine', 'princess', 'football', 'baseball',
  'abcd1234', 'a1234567', 'admin123', 'welcome1', 'letmein1',
  'chukjalal', '축잘알', 'chukjalal1',
]);
function containsIdentity(pw, email, handle) {
  const lower = pw.toLowerCase();
  return [email?.split('@')[0], handle]
    .map((v) => v?.trim().toLowerCase())
    .filter((v) => v && v.length >= 3)
    .some((v) => lower.includes(v));
}
function ok(pw, id = {}) {
  return (
    pw.length >= MIN_LENGTH && pw.length <= 72 &&
    /[A-Za-z]/.test(pw) && /\d/.test(pw) &&
    !COMMON.has(pw.toLowerCase()) &&
    !containsIdentity(pw, id.email, id.handle)
  );
}

test('8자 미만은 거부한다', () => {
  assert.equal(ok('ab12345'), false);
  assert.equal(ok('ab123456'), true);
});

test('영문이나 숫자 한쪽만 있으면 거부한다', () => {
  assert.equal(ok('abcdefghij'), false);
  assert.equal(ok('1234567890'), false);
  assert.equal(ok('abcde12345'), true);
});

test('흔한 비밀번호는 규칙을 통과해도 거부한다', () => {
  assert.equal(ok('password1'), false);
  assert.equal(ok('asdf1234'), false);
  assert.equal(ok('12345678'), false);
});

test('이메일 아이디나 닉네임을 담으면 거부한다', () => {
  assert.equal(ok('shawn12345', { email: 'shawn@example.com' }), false);
  assert.equal(ok('chukjal123', { handle: 'chukjal' }), false);
  // 3자 미만 조각은 우연히 겹칠 수 있으므로 보지 않는다
  assert.equal(ok('ab12345678', { handle: 'ab' }), true);
});

test('bcrypt 상한(72바이트)을 넘기면 거부한다', () => {
  assert.equal(ok('a1'.repeat(40)), false);
});
