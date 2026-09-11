export const PROMOTION_CODE = '01M1XAXHHF8KX6JA7H86RXFGZH';
export const AMOUNT = 50;
export const STARTS_AT = Date.parse('2026-09-07T00:00:00+09:00');
export const ENDS_AT = Date.parse('2026-09-22T00:00:00+09:00');
export type RewardStatus = 'paid' | 'pending' | 'retry' | 'ended';
export interface RewardResult { status: RewardStatus; amount: number; newlyPaid: boolean }
export interface RewardRecord {
  status: 'new' | 'pending' | 'paid' | 'failed';
  reward_key: string | null;
  key_created_at: string | null;
  attempted_at: string | null;
  acquired?: boolean;
}
interface ProviderResult { resultType?: string; success?: unknown; error?: { errorCode?: string | number; code?: string | number } }
export interface RewardIO {
  now(): number;
  save(patch: Record<string, unknown>): Promise<void>;
  request(path: string, body?: Record<string, unknown>): Promise<ProviderResult>;
}
const codeOf = (r: ProviderResult) => String(r.error?.errorCode ?? r.error?.code ?? 'UNKNOWN');
const resultOf = (r: ProviderResult) => r.resultType === 'SUCCESS' ? r.success : undefined;
const result = (status: RewardStatus, newlyPaid=false): RewardResult => ({status, amount:AMOUNT, newlyPaid});

/** Query uncertain requests using their saved provider key. Never mint another
 * key after an uncertain payout, including when its one-hour TTL has elapsed. */
export async function settleReward(record: RewardRecord, promotionCode: string, io: RewardIO): Promise<RewardResult> {
  if (record.status === 'paid') return result('paid');
  if (record.acquired === false) return result(record.status === 'failed' ? 'retry' : 'pending');
  let current = {...record};
  const save = async (patch: Record<string, unknown>) => {
    await io.save({...patch, updated_at:new Date(io.now()).toISOString()});
    current = {...current,...patch};
  };
  const paid = async () => {
    await save({status:'paid',paid_at:new Date(io.now()).toISOString(),error_code:null,retry_after:null});
    return result('paid',true);
  };
  const pending = async (code='PENDING') => {
    await save({status:'pending',error_code:code,retry_after:new Date(io.now()+10000).toISOString()});
    return result('pending');
  };
  const failed = async (code: string) => {
    // Only a definitive provider rejection/failure is allowed to reset a key.
    await save({status:'failed',reward_key:null,key_created_at:null,attempted_at:null,error_code:code,
      retry_after:new Date(io.now()+30000).toISOString()});
    return result(code === '4109' ? 'ended' : 'retry');
  };
  const lookup = () => io.request('execution-result',{promotionCode,key:current.reward_key});
  const open = () => io.now() >= STARTS_AT && io.now() < ENDS_AT;

  if (current.attempted_at) {
    const prior = await lookup();
    const state = resultOf(prior);
    if (state === 'SUCCESS') return paid();
    if (state === 'FAILED') return failed('FAILED');
    // A recorded request can be retried with the SAME key only when Toss says
    // no execution exists, the key is still valid, and the campaign is open.
    if (state === 'PENDING' || codeOf(prior) !== '4111' || !open() ||
        !current.key_created_at || io.now()-Date.parse(current.key_created_at) >= 50*60000) {
      return pending(state === 'PENDING' ? 'PENDING' : codeOf(prior));
    }
  }

  if (!current.attempted_at && !open()) return result('ended');
  if (!current.reward_key || (!current.attempted_at &&
      (!current.key_created_at || io.now()-Date.parse(current.key_created_at) >= 50*60000))) {
    const keyResult = await io.request('execute-promotion/get-key');
    const value = resultOf(keyResult) as {key?: unknown} | undefined;
    if (typeof value?.key !== 'string' || !value.key) return failed(codeOf(keyResult));
    await save({reward_key:value.key,key_created_at:new Date(io.now()).toISOString(),status:'new'});
  }
  // Persist BEFORE the external side effect; a process crash can only leave a
  // reconcilable pending record, never an untracked successful payment.
  await save({attempted_at:new Date(io.now()).toISOString(),status:'pending',error_code:null});
  const execution = await io.request('execute-promotion',{promotionCode,key:current.reward_key,amount:AMOUNT});
  const rejection = codeOf(execution);
  if (execution.resultType !== 'SUCCESS' && ['4100','4109','4112','4114','4116'].includes(rejection)) {
    return failed(rejection);
  }
  const confirmed = await lookup();
  if (resultOf(confirmed) === 'SUCCESS') return paid();
  if (resultOf(confirmed) === 'FAILED') return failed('FAILED');
  return pending(resultOf(confirmed) === 'PENDING' ? 'PENDING' : codeOf(confirmed));
}
