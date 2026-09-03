import type {
  BadgeDef, ChatMessage, Fixture, League, MatchDetailData, MatchEvent, MyStats,
  Prediction, RankRow, ReportReason, SettlementResult, Team,
} from './types';
import type { Confidence, Outcome } from '../lib/scoring';

export interface Catalog {
  leagues: League[];
  teams: Team[];
  fixtures: Fixture[];
}

export interface MeSnapshot {
  handle: string;
  leagueOrder: number[];
  favoriteTeamIds: number[];
  onboarded: boolean;
  rating: number;
  lifetimePoints: number;
  balance: number;
  streak: number;
  settledMatches: number;
  /** 상위 몇 %. 아직 순위표에 오르지 않았으면 null */
  topPercent: number | null;
  predictions: Prediction[];
  /** 이미 정산된 예측의 결과. 피드에서 결과를 보여주는 데 쓴다 */
  settlements: SettlementResult[];
}

/**
 * 소셜 로그인 제공자.
 * 네이버는 Supabase 가 기본 제공하지 않는다 — 넣으려면 커스텀 OIDC 나 Auth Hook 이 필요하다.
 */
export type OAuthProvider = 'google' | 'apple' | 'kakao';

/** 경기 채널로 들어오는 진행 중 점수 */
export interface LiveScore {
  home: number | null;
  away: number | null;
  elapsed: number | null;
  state: Fixture['state'];
}

/** 지금 앱을 쓰고 있는 사람. 로그인 없이는 앱에 들어올 수 없다. */
export interface AuthUser {
  id: string;
  /** 토스 로그인 세션처럼 이메일이 없는 경로도 있으므로 null 을 허용한다 */
  email: string | null;
}

/**
 * 계정.
 *
 * 프로덕션(앱인토스)에서는 토스 로그인 브리지가 세션을 세워주므로 이 화면들이 뜨지 않는다.
 * 토스 앱 밖에서 직접 써 보려면 이메일로 가입해야 해서 이 통로를 둔다. (명세 14.5)
 */
export interface Auth {
  /** 지금 로그인된 사람. 세션이 없으면 null */
  current(): Promise<AuthUser | null>;
  /**
   * 이메일 가입. handle 은 raw_user_meta_data 로 넘어가고
   * on_auth_user_created 트리거가 그대로 프로필 닉네임으로 쓴다.
   * @returns needsConfirmation — 프로젝트가 이메일 확인을 요구하면 true (아직 세션 없음)
   */
  signUp(email: string, password: string, handle: string): Promise<{ needsConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  /**
   * 토스 로그인. 앱인토스 웹뷰 안에서만 동작한다.
   * TossAuth.login() 이 준 인가 코드를 Edge Function 이 세션으로 바꿔준다 (명세 14.5).
   */
  signInWithToss(): Promise<void>;
  /**
   * 소셜 로그인. 제공자 페이지로 넘어갔다가 redirectTo 로 돌아온다 →
   * 이 함수는 정상일 때 반환되지 않고 페이지가 떠난다.
   */
  signInWithProvider(provider: OAuthProvider): Promise<void>;
  /**
   * 이 프로젝트에서 실제로 켜져 있는 소셜 로그인 목록.
   * 대시보드 설정을 그대로 읽으므로, provider 를 켜면 버튼이 저절로 생긴다.
   */
  listProviders(): Promise<OAuthProvider[]>;
  signOut(): Promise<void>;
  /** 세션이 바뀔 때마다 호출된다. 반환값은 구독 해제 함수 */
  onChange(cb: (user: AuthUser | null) => void): () => void;
}

/**
 * 화면이 데이터를 얻는 유일한 통로.
 * 목업과 Supabase 구현이 이 인터페이스를 공유하므로, 백엔드가 붙어도 화면은 바뀌지 않는다.
 */
export interface Repository {
  readonly kind: 'mock' | 'supabase';
  readonly auth: Auth;
  loadCatalog(): Promise<Catalog>;
  loadMe(): Promise<MeSnapshot>;
  /** 최애 팀은 최대 5개 */
  saveOnboarding(leagueOrder: number[], favoriteTeamIds: number[]): Promise<void>;
  upsertPrediction(fixtureId: number, pick: Outcome, confidence: Confidence): Promise<void>;
  loadRanking(): Promise<RankRow[]>;
  /** 순위표에 오른 경우 내 행. 배치 중이면 null */
  loadMyRank(): Promise<RankRow | null>;
  loadBadges(): Promise<BadgeDef[]>;
  /** 프로필 화면 집계. 한 번의 호출로 전부 받는다 */
  loadMyStats(): Promise<MyStats>;
  /**
   * 경기 상세의 부가 정보. 이벤트·선발명단·상대전적·통계를 한 번에 받는다.
   * 없는 항목은 빈 값이다 — 아직 안 받은 것과 없는 것을 구분하지 않는다.
   */
  loadMatchDetail(fixtureId: number): Promise<MatchDetailData>;
  loadChat(fixtureId: number): Promise<ChatMessage[]>;
  sendChat(fixtureId: number, body: string): Promise<void>;
  /**
   * 메시지 신고. 3건이 쌓이면 서버가 자동으로 가리고 검토 큐로 넘긴다 (명세 10장).
   * 같은 사람이 같은 메시지를 두 번 신고할 수는 없다.
   */
  reportMessage(messageId: string, reason: ReportReason): Promise<void>;
  /** 사용자 차단. 이후 그 사람의 메시지는 서버가 내려보내지 않는다 */
  blockUser(userId: string): Promise<void>;
  /**
   * 경기 채팅 구독. 반환값은 구독 해제 함수.
   * onPresence 는 지금 이 채널을 보고 있는 사람 수를 알려준다 (Realtime Presence).
   */
  subscribeChat(
    fixtureId: number,
    onMessage: (m: ChatMessage) => void,
    onPresence?: (count: number) => void,
    /** 진행 중 점수가 바뀌면 호출된다 */
    onLive?: (live: LiveScore) => void,
    /** 새 이벤트(득점·카드·교체)가 들어오면 호출된다 */
    onEvent?: (event: MatchEvent) => void
  ): () => void;
}
