import { useEffect, useRef, useState } from 'react';
import { leagues } from '../data/catalog';
import { isMajorCompetition, MAJOR_COMPETITION_IDS, moveLeague, normalizeLeagueOrder } from '../lib/competitions';
import { useApp, useOrderedLeagues } from '../store';
import { LeagueMark } from './LeagueMark';

export function LeagueOrderEditor({ initialGroup, close, onSaved }: {
  initialGroup: 'major' | 'other';
  close: () => void;
  onSaved: () => void;
}) {
  const { saveLeagueOrder } = useApp();
  const ordered = useOrderedLeagues();
  const [initial] = useState(() => ordered.map(l => l.id));
  const [draft, setDraft] = useState(initial);
  const [group, setGroup] = useState(initialGroup);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [announcement, announce] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  const visible = draft.filter(id => isMajorCompetition(id) === (group === 'major'));
  const changed = draft.some((id, i) => id !== initial[i]);
  const move = (id: number, direction: -1 | 1) => {
    const next = moveLeague(draft, id, direction);
    setDraft(next);
    setError('');
    const position = next.filter(candidate => isMajorCompetition(candidate) === isMajorCompetition(id)).indexOf(id) + 1;
    announce(`${ordered.find(l => l.id === id)?.name}, ${position}번째로 이동했어요.`);
  };
  const save = async () => {
    if (saving.current || !changed) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await saveLeagueOrder(draft);
      onSaved();
    } catch {
      setError('순서를 저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.');
      setBusy(false);
      saving.current = false;
    }
  };

  return <dialog ref={dialog} className="league-order-dialog" aria-labelledby="league-order-title"
    aria-describedby="league-order-description" onCancel={event => {
      event.preventDefault();
      if (!busy) close();
    }}>
    <header className="league-order-header">
      <div><p className="eyebrow">YOUR LEAGUES</p><h2 id="league-order-title">리그 순서 편집</h2></div>
      <button className="league-order-close" disabled={busy} onClick={close}>취소</button>
    </header>
    <p id="league-order-description" className="league-order-description">자주 보는 리그부터 만나보세요.<br />화살표를 눌러 각 분류 안에서 순서를 바꿀 수 있어요.</p>
    <div className="league-order-groups competition-groups" aria-label="순서를 편집할 대회 분류">
      <button aria-pressed={group === 'major'} disabled={busy} onClick={() => setGroup('major')}>메이저 대회</button>
      <button aria-pressed={group === 'other'} disabled={busy} onClick={() => setGroup('other')}>기타 대회</button>
    </div>
    <div className="league-order-scroll" aria-busy={busy}>
      <ol className="league-order-list" aria-label={`${group === 'major' ? '메이저' : '기타'} 대회 순서`}>
        {visible.map((id, index) => {
          const league = ordered.find(l => l.id === id)!;
          return <li key={id}>
            <span className="league-order-position" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <LeagueMark leagueId={id} size={22} />
            <span className="league-order-name">{league.name}</span>
            <div className="league-order-arrows">
              <button disabled={busy || index === 0} onClick={() => move(id, -1)} aria-label={`${league.name} 위로 이동`}><Arrow up /></button>
              <button disabled={busy || index === visible.length - 1} onClick={() => move(id, 1)} aria-label={`${league.name} 아래로 이동`}><Arrow /></button>
            </div>
          </li>;
        })}
      </ol>
      {!visible.length && <p className="league-order-empty">아직 등록된 대회가 없어요.</p>}
    </div>
    <span className="sr-only" role="status">{announcement}</span>
    <footer className="league-order-footer">
      {error && <p className="league-order-error" role="alert">{error}</p>}
      <button className="league-order-reset" disabled={busy} onClick={() => {
        setDraft(normalizeLeagueOrder(MAJOR_COMPETITION_IDS, leagues().map(l => l.id)));
        setError('');
        announce('전체 대회를 기본 순서로 되돌렸어요. 저장하면 적용돼요.');
      }}>기본 순서로 되돌리기</button>
      <button className="cta" disabled={busy || !changed} onClick={() => void save()}>{busy ? '저장 중…' : '순서 저장'}</button>
    </footer>
  </dialog>;
}

function Arrow({ up = false }: { up?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={up ? { transform: 'rotate(180deg)' } : undefined}>
    <path d="M12 5v14m-5-5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
