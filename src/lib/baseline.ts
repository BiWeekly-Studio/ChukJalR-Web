/**
 * 기준선이 얼마나 '사람들의 것'인지.
 *
 * 서버 compute_baseline 은 예측이 한 명도 없어도 기준선을 돌려준다.
 * 가중치가 w = 30/(30+n) 이라 표본이 적을수록 값의 대부분이 기본 예상치(prior)다 —
 * 마이그레이션도 그 구간을 'prior-heavy' 라고 기록한다 (live_baseline.sql).
 *
 * 이 값을 그대로 "다른 사람들은 이렇게 봤어요" 라고 부르면 없는 여론을 지어내는 게 된다.
 * 그래서 표본 수에 따라 부르는 이름을 달리한다.
 */
export const CROWD_MIN = 30;

export type CrowdLevel =
  /** 아무도 예측하지 않음 — 여론이라 부를 것이 없다 */
  | 'none'
  /** 예측이 있지만 표본이 적어 기본 예상치가 크게 섞여 있다 */
  | 'thin'
  /** 사람들의 판단이 값을 주도한다 */
  | 'solid';

export function crowdLevel(participants: number | null | undefined): CrowdLevel {
  if (!participants || participants <= 0) return 'none';
  return participants < CROWD_MIN ? 'thin' : 'solid';
}
