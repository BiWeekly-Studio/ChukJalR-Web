import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { Prediction, SettlementResult } from './data/types';
import type { Confidence, Outcome } from './lib/scoring';
import { levelFromPoints, previewScore, tierFromPercentile } from './lib/scoring';
import { fixture, fixtures, hydrate, leagues } from './data/catalog';
import { windowState } from './lib/window';
import { repository } from './data';
import type { AuthUser, MeSnapshot } from './data/repository';

/**
 * 앱인토스 주의: LocalStorage 는 미니앱이 삭제되면 함께 사라진다.
 * 목업 모드에서만 캐시로 쓰고, Supabase 모드에서는 서버가 유일한 진실이다.
 */
const STORAGE_KEY = 'chukjalal.v1';

export interface AppState extends Omit<MeSnapshot, 'predictions' | 'settlements'> {
  error: string | null;
  predictions: Record<number, Prediction>;
  /** 경기별 내 정산 결과 */
  settlements: Record<number, SettlementResult>;
  /** 로그인된 사람. 세션이 없으면 null → 로그인 화면 */
  authUser: AuthUser | null;
  /** 카탈로그(리그·팀·경기)가 도착했는지. 로그인과 무관하게 한 번만 받는다 */
  catalogReady: boolean;
  /** 첫 세션 확인이 끝났는지. 끝나기 전에는 로그인 화면도 띄우지 않는다 */
  authChecked: boolean;
  /** 로그인된 사람의 프로필·기록이 도착했는지 */
  meReady: boolean;
}

/** 아직 아무것도 못 받은 상태. 실제 값은 전부 loadMe 가 채운다. */
const INITIAL: AppState = {
  error: null,
  onboarded: false,
  handle: '',
  leagueOrder: [],
  favoriteTeamIds: [],
  predictions: {},
  settlements: {},
  rating: 1000,   // ratings.rating 기본값과 같아야 한다
  lifetimePoints: 0,
  balance: 0,
  streak: 0,
  settledMatches: 0,
  topPercent: null,
  authUser: null,
  catalogReady: false,
  authChecked: false,
  meReady: false,
};

type Action =
  | { type: 'hydrate'; state: Partial<AppState> }
  | { type: 'catalogReady' }
  | { type: 'auth'; user: AuthUser | null }
  | { type: 'me'; snapshot: MeSnapshot }
  | { type: 'signedOut' }
  | { type: 'error'; message: string | null }
  | { type: 'completeOnboarding'; leagueOrder: number[]; favoriteTeamIds: number[] }
  | { type: 'predict'; fixtureId: number; pick: Outcome; confidence: Confidence }
  | { type: 'clearPrediction'; fixtureId: number }
  | { type: 'reorderLeagues'; leagueOrder: number[] };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, ...action.state };

    case 'catalogReady':
      return { ...state, catalogReady: true };

    case 'auth': {
      // 사람이 바뀌면 앞사람의 기록을 한 프레임도 보여주지 않는다
      const changed = state.authUser?.id !== action.user?.id;
      if (!changed) return { ...state, authUser: action.user, authChecked: true };
      return {
        ...INITIAL,
        catalogReady: state.catalogReady,
        authUser: action.user,
        authChecked: true,
      };
    }

    case 'me': {
      const { predictions, settlements, ...rest } = action.snapshot;
      return {
        ...state,
        ...rest,
        predictions: Object.fromEntries(predictions.map((p) => [p.fixtureId, p])),
        settlements: Object.fromEntries(settlements.map((r) => [r.fixtureId, r])),
        meReady: true,
      };
    }

    case 'signedOut':
      return { ...INITIAL, catalogReady: state.catalogReady, authChecked: true };

    case 'error':
      return { ...state, error: action.message };

    case 'completeOnboarding':
      return {
        ...state,
        onboarded: true,
        leagueOrder: action.leagueOrder,
        favoriteTeamIds: action.favoriteTeamIds,
        // 온보딩 완료 보상 300포인트 (명세 4.2). 서버 모드에서는 트리거가 이미 지급했다.
        // 보상은 상점 재화(balance)에만 들어간다 — lifetimePoints 는 레벨의 근거라
        // 여기에 섞으면 아무것도 안 한 사람이 Lv.3 으로 시작한다.
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
  /** 첫 화면을 그려도 되는 시점 */
  ready: boolean;
  /** 로그인된 사람. null 이면 App 이 로그인 화면을 띄운다 */
  authUser: AuthUser | null;
  predict: (fixtureId: number, pick: Outcome, confidence: Confidence) => void;
  completeOnboarding: (leagueOrder: number[], favoriteTeamIds: number[]) => void;
  signOut: () => Promise<void>;
  level: ReturnType<typeof levelFromPoints>;
  tier: ReturnType<typeof tierFromPercentile>;
  isFavoriteFixture: (fixtureId: number) => boolean;
  /** 지금 열려 있는데 아직 손대지 않은 경기 수. 하단 탭의 알림 점이 이걸 본다. */
  todoCount: number;
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

  // 1. 카탈로그. 로그인 여부와 상관없이 한 번만 받는다 —
  //    로그인 화면 뒤에서 미리 받아두면 로그인 직후 화면이 바로 뜬다.
  useEffect(() => {
    let cancelled = false;
    repository
      .loadCatalog()
      .then((catalog) => {
        if (cancelled) return;
        hydrate(catalog);
        dispatch({ type: 'catalogReady' });
      })
      .catch((err) => {
        if (cancelled) return;
        dispatch({ type: 'error', message: String(err) });
        dispatch({ type: 'catalogReady' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. 세션. 지금 상태를 한 번 읽고, 이후 변화는 구독으로 따라간다.
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = repository.auth.onChange((user) => {
      if (!cancelled) dispatch({ type: 'auth', user });
    });
    repository.auth
      .current()
      .then((user) => {
        if (!cancelled) dispatch({ type: 'auth', user });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'auth', user: null });
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // 3. 로그인된 사람의 기록. 사람이 바뀌면 다시 받는다.
  const userId = state.authUser?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    repository
      .loadMe()
      .then((me) => {
        if (cancelled) return;
        dispatch({ type: 'me', snapshot: me });
        // 목업에는 서버가 없으니 직전 세션에서 하던 것을 위에 덮어 되살린다
        if (repository.kind === 'mock') {
          const cached = loadCache();
          if (cached) dispatch({ type: 'hydrate', state: cached });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        dispatch({ type: 'error', message: '내 기록을 불러오지 못했어요. ' + String(err) });
        // 기록이 없어도 앱은 떠야 한다 — 예측 화면은 카탈로그만 있으면 그려진다
        dispatch({ type: 'hydrate', state: { meReady: true } });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 목업 캐시. 내 것만 저장한다 — 세션·로딩 플래그는 다음에 다시 계산된다.
  const meReady = state.meReady;
  useEffect(() => {
    if (repository.kind !== 'mock' || !meReady) return;
    try {
      const { authUser, catalogReady, authChecked, meReady: _m, error, ...mine } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mine));
    } catch {
      /* 저장 실패는 무시한다 — 서버가 진실의 원천이다 */
    }
  }, [state, meReady]);

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

  const signOut = useCallback(async () => {
    try {
      await repository.auth.signOut();
      // 목업 캐시가 남아 있으면 다음 사람에게 앞사람 기록이 보인다
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      dispatch({ type: 'error', message: String(err) });
      return;
    }
    dispatch({ type: 'signedOut' });
  }, []);

  const favoriteIds = state.favoriteTeamIds;
  const isFavoriteFixture = useCallback(
    (fixtureId: number) => {
      if (favoriteIds.length === 0) return false;
      const f = fixture(fixtureId);
      if (!f) return false;
      return favoriteIds.includes(f.homeTeamId) || favoriteIds.includes(f.awayTeamId);
    },
    [favoriteIds]
  );

  const todoCount = useMemo(() => {
    if (!state.catalogReady) return 0;
    return fixtures().filter((f) => windowState(f) === 'OPEN' && !state.predictions[f.id]).length;
  }, [state.catalogReady, state.predictions]);

  // 로그인 전에는 카탈로그를 기다릴 필요가 없다. 로그인 화면부터 띄운다.
  const ready = state.authChecked && (state.authUser ? state.catalogReady && state.meReady : true);

  const value = useMemo<Ctx>(
    () => ({
      state,
      dispatch,
      ready,
      authUser: state.authUser,
      predict,
      completeOnboarding,
      signOut,
      level: levelFromPoints(state.lifetimePoints),
      tier: tierFromPercentile(state.topPercent, state.settledMatches),
      isFavoriteFixture,
      todoCount,
    }),
    [state, ready, predict, completeOnboarding, signOut, isFavoriteFixture, todoCount]
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

/**
 * 잠재 점수 미리보기. 서버 preview 응답이 오면 그 값으로 대체한다.
 * 기준선이 아직 없으면(아무도 예측하지 않은 경기) 계산할 근거가 없으므로 null 이다.
 */
export function usePreview(fixtureId: number, pick: Outcome, confidence: Confidence) {
  const { state } = useApp();
  const f = fixture(fixtureId);
  if (!f?.baseline) return null;
  return previewScore(f.baseline, pick, confidence, state.streak);
}
