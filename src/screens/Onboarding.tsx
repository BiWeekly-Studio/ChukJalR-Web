import { useMemo, useState } from 'react';
import { Crest } from '../components/Crest';
import { LeagueMark } from '../components/LeagueMark';
import { IconCheck, IconX } from '../components/icons';
import { leagues as allLeagues, league, teams as allTeams } from '../data/catalog';
import type { Team } from '../data/types';
import { matches } from '../lib/hangul';
import { useApp } from '../store';

const MAX_FAVORITES = 5;

/**
 * 온보딩: 리그 선택(순서가 곧 탭 순서) → 최애 팀 → 완료. (명세 5.1)
 * 앱인토스는 토스 로그인만 허용하므로 별도 계정 생성 단계는 두지 않는다.
 */
export function Onboarding() {
  const { completeOnboarding } = useApp();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [query, setQuery] = useState('');

  const LEAGUES = allLeagues();

  function toggleLeague(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleTeam(id: number) {
    setFavorites((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_FAVORITES) return prev;
      return [...prev, id];
    });
  }

  function finish() {
    const rest = LEAGUES.map((l) => l.id).filter((id) => !picked.includes(id));
    completeOnboarding([...picked, ...rest], favorites);
  }

  return (
    <div className="app">
      {step === 0 ? (
        <LeagueStep leagues={LEAGUES} picked={picked} onToggle={toggleLeague} />
      ) : (
        <TeamStep
          leagueIds={picked}
          favorites={favorites}
          query={query}
          onQuery={setQuery}
          onToggle={toggleTeam}
        />
      )}

      <div className="pad" style={{ paddingBottom: 'calc(20px + var(--safe-bottom))', paddingTop: 12 }}>
        {step === 0 ? (
          <button className="cta" disabled={picked.length === 0} onClick={() => setStep(1)}>
            {picked.length === 0 ? '리그를 하나 이상 골라주세요' : `${picked.length}개 리그로 시작하기`}
          </button>
        ) : (
          <button className="cta" onClick={finish}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <IconCheck size={16} />
              {favorites.length > 0 ? `${favorites.length}팀 선택 · 시작하기` : '건너뛰고 시작하기'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function LeagueStep({
  leagues, picked, onToggle,
}: { leagues: ReturnType<typeof allLeagues>; picked: number[]; onToggle: (id: number) => void }) {
  return (
    <div className="scroll pad" style={{ paddingTop: 'calc(var(--safe-top) + 40px)' }}>
      <h1 className="h1" style={{ fontSize: 27 }}>
        어느 리그를
        <br />
        보시나요?
      </h1>
      <p className="small muted" style={{ marginTop: 10 }}>
        고른 순서대로 홈 화면 탭이 정렬돼요. 나중에 설정에서 바꿀 수 있어요.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 26 }}>
        {leagues.map((l) => {
          const idx = picked.indexOf(l.id);
          const on = idx >= 0;
          return (
            <button
              key={l.id}
              type="button"
              className="card"
              style={{
                padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12,
                border: on ? '2px solid var(--accent)' : '1px solid transparent',
              }}
              aria-pressed={on}
              onClick={() => onToggle(l.id)}
            >
              <span
                style={{
                  width: 26, height: 26, borderRadius: 999, flexShrink: 0,
                  background: on ? 'var(--accent)' : 'var(--card-2)',
                  color: on ? '#fff' : 'var(--ink-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--display)', fontWeight: 900, fontSize: 12,
                }}
              >
                {on ? idx + 1 : ''}
              </span>
              <LeagueMark leagueId={l.id} size={26} />
              <span style={{ textAlign: 'left' }}>
                <span className="h3" style={{ display: 'block', fontSize: 15 }}>{l.name}</span>
                <span className="tiny muted">{l.country}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TeamStep({
  leagueIds, favorites, query, onQuery, onToggle,
}: {
  leagueIds: number[];
  favorites: number[];
  query: string;
  onQuery: (q: string) => void;
  onToggle: (id: number) => void;
}) {
  const pool = useMemo(
    () => allTeams().filter((t) => leagueIds.includes(t.leagueId)),
    [leagueIds]
  );

  // 검색어가 있으면 평평한 결과, 없으면 리그별로 묶어서 보여준다.
  const results = useMemo(
    () => pool.filter((t) => matches(query, t.name, t.nameEn, t.abbr)),
    [pool, query]
  );
  const grouped = useMemo(() => {
    const map = new Map<number, Team[]>();
    for (const t of results) {
      const list = map.get(t.leagueId) ?? [];
      list.push(t);
      map.set(t.leagueId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return leagueIds.map((id) => [id, map.get(id) ?? []] as const).filter(([, l]) => l.length > 0);
  }, [results, leagueIds]);

  const full = favorites.length >= MAX_FAVORITES;

  return (
    <div className="scroll pad" style={{ paddingTop: 'calc(var(--safe-top) + 32px)' }}>
      <h1 className="h1" style={{ fontSize: 26 }}>최애 팀을 골라주세요</h1>
      <p className="small muted" style={{ marginTop: 8 }}>
        내 팀 경기는 피드 맨 위에 따로 모아드려요. 최대 {MAX_FAVORITES}팀까지 고를 수 있고,
        점수 규칙은 똑같아요.
      </p>

      <div className="searchbox" style={{ marginTop: 18 }}>
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="팀 이름 검색 (아스날, arsenal, ㅇㅅㄴ)"
          aria-label="팀 검색"
        />
        {query && (
          <button type="button" onClick={() => onQuery('')} aria-label="검색어 지우기">
            <IconX size={14} color="var(--ink-3)" />
          </button>
        )}
      </div>

      {favorites.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
          {favorites.map((id) => (
            <SelectedChip key={id} teamId={id} onRemove={() => onToggle(id)} />
          ))}
        </div>
      )}

      <div style={{ marginTop: 6, paddingBottom: 12 }}>
        {results.length === 0 ? (
          <p className="small muted" style={{ textAlign: 'center', padding: '40px 20px' }}>
            &lsquo;{query}&rsquo; 와 맞는 팀이 없어요.
          </p>
        ) : (
          grouped.map(([leagueId, list]) => (
            <div key={leagueId}>
              <div className="grouphead">{league(leagueId).name}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map((t) => {
                  const on = favorites.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="teamrow"
                      aria-pressed={on}
                      disabled={!on && full}
                      style={!on && full ? { opacity: 0.4 } : undefined}
                      onClick={() => onToggle(t.id)}
                    >
                      <Crest teamId={t.id} size={30} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="small" style={{ display: 'block', fontWeight: on ? 700 : 600 }}>
                          {t.name}
                        </span>
                        {t.nameEn && t.nameEn !== t.name && (
                          <span className="tiny muted">{t.nameEn}</span>
                        )}
                      </span>
                      {on && (
                        <span className="tick" style={{ flexShrink: 0 }}>
                          <IconCheck />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {full && (
        <p className="tiny muted" style={{ textAlign: 'center', paddingBottom: 8 }}>
          {MAX_FAVORITES}팀을 다 골랐어요. 바꾸려면 위에서 하나를 빼주세요.
        </p>
      )}
    </div>
  );
}

function SelectedChip({ teamId, onRemove }: { teamId: number; onRemove: () => void }) {
  const t = allTeams().find((x) => x.id === teamId);
  if (!t) return null;
  return (
    <button
      type="button"
      onClick={onRemove}
      className="pill"
      aria-pressed
      style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff', gap: 7 }}
    >
      {t.name}
      <IconX size={12} color="#fff" strokeWidth={3} />
    </button>
  );
}

function SearchIcon() {
  return (
    <svg
      width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round"
      style={{ flexShrink: 0 }}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}
