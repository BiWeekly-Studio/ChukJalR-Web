import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { Prediction, SettlementResult } from './data/types';
import type { Confidence, Outcome } from './lib/scoring';
import { levelFromPoints, previewScore, tierFromPercentile } from './lib/scoring';
import { fixture, hydrate, leagues } from './data/catalog';
import { repository } from './data';
import type { MeSnapshot } from './data/repository';

/**
 * 앱인토스 주의: LocalStorage 는 미니앱이 삭제되면 함께 사라진다.
 * 목업 모드에서만 캐시로 쓰고, Supabase 모드에서는 서버가 유일한 진실이다.
 */
const STORAGE_KEY = 'chukjalal.v1';

export interface AppState extends Omit<MeSnapshot, 'predictions' | 'settlements'> {
  ready: boolean;
  error: string | null;
  predictions: Record<number, Prediction>;
  /** 경기별 내 정산 결과 */
  settlements: Record<number, SettlementResult>;
}

const INITIAL: AppState = {
  ready: false,
  error: null,
  onboarded: false,
  handle: '샤라포바',
  leagueOrder: [],
  favoriteTeamIds: [],
  predictions: {},
  settlements: {},
  rating: 1240,
  lifetimePoints: 2610,
  balance: 1322,
  streak: 7,
  settledMatches: 50,
  topPercent: 3.1,
};

type Action =
  | { type: 'hydrate'; state: Partial<AppState> }
  | { type: 'ready' }
  | { type: 'error'; message: string | null }
  | { type: 'completeOnboarding'; leagueOrder: number[]; favoriteTeamIds: number[] }
  | { type: 'predict'; fixtureId: number; pick: Outcome; confidence: Confidence }
  | { type: 'clearPrediction'; fixtureId: number }
  | { type: 'reorderLeagues'; leagueOrder: number[] };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, ...action.state };

    case 'ready':
      return { ...state, ready: true };

    case 'error':
      return { ...state, error: action.message };

    case 'completeOnboarding':
      return {
        ...state,
        onboarded: true,
        leagueOrder: action.leagueOrder,
        favoriteTeamIds: action.favoriteTeamIds,
        // 온보딩 완료 보상 300포인트 (명세 4.2). 서버 모드에서는 트리거가 이미 지급했다.
        lifetimePoints:
          repository.kind === 'mock' ? state.lifetimePoints + 300 : state.lifetimePoints,
        balance: repository.kind === 'mock' ? state.balance + 300 : state.balance,
      };

    case 'predict': {
      const prev = state.predictions[action.fixtureId];
      return {
        ...state,
        predictions: {
          ...state.predictions,
          [action.fixtureId]: {
            fixtureId: action.fixtureId,
            pick: action.pick,
            confidence: action.confidence,
            createdAt: prev?.createdAt ?? new Date().toISOString(),
          },
        },
      };
    }

    case 'clearPrediction': {
      const next = { ...state.predictions };
      delete next[action.fixtureId];
      return { ...state, predictions: next };
    }

    case 'reorderLeagues':
      return { ...state, leagueOrder: action.leagueOrder };

    default:
      return state;
  }
}

interface Ctx {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  predict: (fixtureId: number, pick: Outcome, confidence: Confidence) => void;
  completeOnboarding: (leagueOrder: number[], favoriteTeamIds: number[]) => void;
  level: ReturnType<typeof levelFromPoints>;
  tier: ReturnType<typeof tierFromPercentile>;
  isFavoriteFixture: (fixtureId: number) => boolean;
}

const AppContext = createContext<Ctx | null>(null);

function loadCache(): Partial<AppState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<AppState>) : null;
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const catalog = await repository.loadCatalog();
      if (cancelled) return;
      hydrate(catalog);

      if (repository.kind === 'mock') {
        const cached = loadCache();
        dispatch({
          type: 'hydrate',
          state: cached ?? { leagueOrder: catalog.leagues.map((l) => l.id) },
        });
      } else {
        const me = await repository.loadMe();
        if (cancelled) return;
        const { predictions, settlements, ...rest } = me;
        dispatch({
          type: 'hydrate',
          state: {
            ...rest,
            predictions: Object.fromEntries(predictions.map((p) => [p.fixtureId, p])),
            settlements: Object.fromEntries(settlements.map((r) => [r.fixtureId, r])),
          },
        });
      }
      dispatch({ type: 'ready' });
    })().catch((err) => {
      dispatch({ type: 'error', message: String(err) });
      dispatch({ type: 'ready' });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (repository.kind !== 'mock' || !state.ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* 저장 실패는 무시한다 — 서버가 진실의 원천이다 */
    }
  }, [state]);

  const predict = useCallback(
    (fixtureId: number, pick: Outcome, confidence: Confidence) => {
      dispatch({ type: 'predict', fixtureId, pick, confidence }); // 낙관적 반영
      repository.upsertPrediction(fixtureId, pick, confidence).catch((err) => {
        dispatch({ type: 'clearPrediction', fixtureId });
        dispatch({
          type: 'error',
          message:
            String(err).includes('PREDICTION_LOCKED')
              ? '예측이 마감된 경기예요.'
              : '예측을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
        });
      });
    },
    []
  );

  const completeOnboarding = useCallback(
    (leagueOrder: number[], favoriteTeamIds: number[]) => {
      dispatch({ type: 'completeOnboarding', leagueOrder, favoriteTeamIds });
      repository.saveOnboarding(leagueOrder, favoriteTeamIds).catch(() => {
        dispatch({ type: 'error', message: '설정을 저장하지 못했어요.' });
      });
    },
    []
  );

  const isFavoriteFixture = useCallback(
    (fixtureId: number) => {
      if (state.favoriteTeamIds.length === 0) return false;
      const f = fixture(fixtureId);
      if (!f) return false;
      return (
        state.favoriteTeamIds.includes(f.homeTeamId) ||
        state.favoriteTeamIds.includes(f.awayTeamId)
      );
    },
    [state.favoriteTeamIds]
  );

  const value = useMemo<Ctx>(
    () => ({
      state,
      dispatch,
      predict,
      completeOnboarding,
      level: levelFromPoints(state.lifetimePoints),
      tier: tierFromPercentile(state.topPercent, state.settledMatches),
      isFavoriteFixture,
    }),
    [state, predict, completeOnboarding, isFavoriteFixture]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** 유저가 고른 순서대로 정렬된 리그 목록 */
export function useOrderedLeagues() {
  const { state } = useApp();
  return useMemo(() => {
    const all = leagues();
    const order = state.leagueOrder.length ? state.leagueOrder : all.map((l) => l.id);
    return order.map((id) => all.find((l) => l.id === id)).filter((l): l is NonNullable<typeof l> => Boolean(l));
  }, [state.leagueOrder]);
}

/** 잠재 점수 미리보기. 서버 preview 응답이 오면 그 값으로 대체한다. */
export function usePreview(fixtureId: number, pick: Outcome, confidence: Confidence) {
  const { state } = useApp();
  const f = fixture(fixtureId);
  if (!f) return null;
  return previewScore(f.baseline, pick, confidence, state.streak);
}
