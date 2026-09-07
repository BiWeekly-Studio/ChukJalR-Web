import { useEffect, useRef, useState, type ReactNode } from 'react';
import { repository } from '../data';
import type { PredictionRecord } from '../data/repository';
import type { MyStats } from '../data/types';
import { team } from '../data/catalog';
import { CONFIDENCE_LABEL } from '../lib/scoring';
import { comma } from '../lib/format';
import { useApp } from '../store';
import { Avatar } from './Avatar';

export function ProfileSheet({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="profile-sheet" onCancel={close}>
    <header className="row"><h2 className="h2">{title}</h2><button className="pill" onClick={close}>닫기</button></header>
    <div className="profile-sheet-body">{children}</div>
  </dialog>;
}

export function RatingTrend({ stats }: { stats: MyStats | null }) {
  const curve = stats?.curve ?? [];
  const min = Math.min(...curve), max = Math.max(...curve);
  const points = curve.map((n,i) => `${8+i/(curve.length-1)*304},${72-(n-min)/Math.max(1,max-min)*56}`).join(' ');
  return <section className="card feature-card"><h3 className="h3">흐름</h3>
    {curve.length >= 2 ? <>
      <svg viewBox="0 0 320 88" role="img" aria-label={`최근 지수 추이: ${curve.join(', ')}`} style={{ width: '100%' }}>
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg><div className="row tiny muted" style={{ justifyContent: 'space-between' }}><span>{comma(min)}</span><span>{comma(max)}</span></div>
    </> : <p className="small muted">경기가 정산되면 지수가 어떻게 움직이는지 보여드려요.</p>}
  </section>;
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${comma(n)}`;
const settlement = (r: PredictionRecord) => Array.isArray(r.settlements) ? r.settlements[0] : r.settlements;
export function History({ close }: { close: () => void }) {
  const [rows, setRows] = useState<PredictionRecord[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { let live = true; repository.loadHistory().then(r => { if(live) setRows(r); }).catch(() => { if(live) setError(true); }); return () => {live=false;}; }, []);
  const settled = rows?.filter(r => settlement(r)) ?? [];
  const hits = settled.filter(r => r.pick === r.fixtures.result).length;
  return <ProfileSheet title="예측 기록" close={close}>
    {error ? <p role="alert">기록을 불러오지 못했어요. 잠시 후 다시 열어주세요.</p>
      : rows === null ? <p role="status">기록을 불러오는 중…</p>
      : !rows.length ? <p>아직 예측한 경기가 없어요.</p> : <>
        <div className="history-summary">{[[rows.length,'예측'],[hits,'적중'],[settled.length ? `${Math.round(hits/settled.length*100)}%` : '—','적중률'],[signed(settled.reduce((n,r)=>n+settlement(r)!.delta_rating,0)),'지수 합']].map(([n,label])=><div className="stat" key={label}><strong className="num">{n}</strong><span className="tiny muted">{label}</span></div>)}</div>
        {rows.map((r,i) => {
          const f=r.fixtures, date=new Date(f.kickoff_at).toLocaleDateString('ko-KR');
          const home=team(f.home_team_id).name, away=team(f.away_team_id).name, s=settlement(r);
          const previous=i ? new Date(rows[i-1].fixtures.kickoff_at).toLocaleDateString('ko-KR') : '';
          return <div key={r.id}>{date!==previous && <h3 className="tiny muted" style={{ marginTop:22 }}>{date}</h3>}
            <div className="card history-row"><div><strong className="small">{home} vs {away}</strong>
              <p className="tiny muted">{r.pick==='DRAW'?'무승부':`${r.pick==='HOME'?home:away} 승`} · {CONFIDENCE_LABEL[r.confidence]}</p></div>
              <div style={{textAlign:'right'}}><strong className="small">{s ? `${r.pick===f.result?'적중':'실패'} ${signed(s.delta_rating)}` : f.state==='VOID'?'취소':'정산 대기'}</strong>
                <p className="tiny muted">{s ? `+${s.points} XP` : new Date(f.kickoff_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</p>
                {f.home_goals_ft!=null && f.away_goals_ft!=null && <span className="tiny">{f.home_goals_ft} : {f.away_goals_ft}</span>}
              </div></div></div>;
        })}
      </>}
  </ProfileSheet>;
}

async function jpeg(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('사진 파일을 선택해 주세요.');
  if (file.size > 20*1024*1024) throw new Error('20MB 이하의 사진을 선택해 주세요.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1,512/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d'); if(!ctx) {bitmap.close();throw new Error('사진을 처리하지 못했어요.');}
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('사진을 처리하지 못했어요.')),'image/jpeg',0.85));
}

export function ProfileEditor({ close }: { close: () => void }) {
  const {state,dispatch}=useApp();
  const [handle,setHandle]=useState(state.handle), [photo,setPhoto]=useState<Blob|null>(null);
  const [preview,setPreview]=useState<string|null>(null), [remove,setRemove]=useState(false);
  const [busy,setBusy]=useState(false), [error,setError]=useState('');
  useEffect(()=>()=>{if(preview) URL.revokeObjectURL(preview);},[preview]);
  async function save() {
    setBusy(true);setError('');
    try {
      if(photo) {const avatarUrl=await repository.setAvatar(photo);dispatch({type:'hydrate',state:{avatarUrl}});setPhoto(null);}
      else if(remove) {await repository.removeAvatar();dispatch({type:'hydrate',state:{avatarUrl:null}});setRemove(false);}
      if(handle.trim()!==state.handle) {const saved=await repository.setHandle(handle);dispatch({type:'hydrate',state:{handle:saved}});}
      close();
    } catch(e) {setError(e instanceof Error?e.message:String(e));} finally {setBusy(false);}
  }
  return <ProfileSheet title="프로필 편집" close={()=>{if(!busy)close();}}>
    <div className="profile-edit-photo"><Avatar url={remove?null:preview??state.avatarUrl} name={state.handle} size={96}/>
      <label className="pill">사진 바꾸기<input aria-label="프로필 사진" type="file" accept="image/*" disabled={busy} onChange={async e=>{
        const file=e.target.files?.[0];if(!file)return;setBusy(true);setError('');try{const b=await jpeg(file);setPhoto(b);setPreview(URL.createObjectURL(b));setRemove(false);}catch(e){setError(e instanceof Error?e.message:'사진을 읽지 못했어요.');}finally{setBusy(false);}
      }}/></label>
      {(preview||state.avatarUrl)&&<button className="pill" disabled={busy} onClick={()=>{setPhoto(null);setPreview(null);setRemove(true);}}>사진 지우기</button>}
    </div>
    <label className="small">닉네임<input className="profile-name" value={handle} disabled={busy} onChange={e=>setHandle(e.target.value)} maxLength={24}/></label>
    <p className="tiny muted">2~12자, 공백 없이 입력해 주세요. 7일에 한 번 바꿀 수 있어요.</p>
    {error&&<p className="autherror" role="alert">{error}</p>}
    <button className="cta" onClick={()=>void save()} disabled={busy||handle.trim().length<2||handle.trim().length>12||(!photo&&!remove&&handle.trim()===state.handle)}>{busy?'저장 중…':'저장'}</button>
  </ProfileSheet>;
}

export function ProfileAccount() {
  const {state,signOut,dispatch}=useApp();
  const [edit,setEdit]=useState(false),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false);
  async function remove() {setBusy(true);try{await repository.deleteAccount();await signOut();}catch(e){dispatch({type:'error',message:e instanceof Error?e.message:String(e)});}finally{setBusy(false);}}
  return <>
    <div className="card feature-card row"><Avatar url={state.avatarUrl} name={state.handle}/><div style={{flex:1}}><strong className="small">{state.handle}</strong><br/><button className="profile-text-button" onClick={()=>setEdit(true)}>프로필 편집</button></div><button className="pill" onClick={()=>void signOut()}>로그아웃</button></div>
    <button className="profile-delete" onClick={()=>setConfirm(true)}>계정 삭제</button>
    {edit&&<ProfileEditor close={()=>setEdit(false)}/>}
    {confirm&&<ProfileSheet title="계정을 삭제할까요?" close={()=>{if(!busy)setConfirm(false);}}><p className="small">예측 기록·지수·포인트가 모두 사라지고 되돌릴 수 없어요. 채팅에 남긴 글은 가려집니다.</p><button className="cta" style={{background:'#b42318'}} disabled={busy} onClick={()=>void remove()}>{busy?'삭제 중…':'계정과 기록 삭제'}</button></ProfileSheet>}
  </>;
}
