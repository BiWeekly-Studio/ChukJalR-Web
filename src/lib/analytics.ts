import { SELF_AUTH } from './env';

/** 서버 저장 성공 후 호출한다. 수정 저장도 포함하며 전환 지표는 고유 유저 수로 집계한다. */
export async function logPredictionSaved(fixtureId: number): Promise<void> {
  if (SELF_AUTH || !import.meta.env.PROD || import.meta.env.VITE_TOSS_ANALYTICS_ENABLED === 'false') return;
  try {
    const { Analytics } = await import('@apps-in-toss/web-framework');
    await Analytics.log({
      log_name: 'chukjalal_prediction_saved',
      log_type: 'event',
      params: { fixture_id: fixtureId },
    });
  } catch { /* 지표 전송 실패를 예측 저장 실패로 처리하지 않는다. */ }
}
