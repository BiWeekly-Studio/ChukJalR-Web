import {createRoot} from 'react-dom/client';
import {LogoIcon,Wordmark} from '../src/components/Logo';
import '../src/styles.css';
import './brand.css';
function BrandGuide(){
 return <main className="brand-guide">
  <header className="brand-guide-nav"><span>축잘알 / WORDMARK</span><a href="/design/preview.html">앱에서 보기 ↗</a></header>
  <section className="brand-hero">
   <div><p className="brand-caption">기존 워드로고를 이어가는 디자인</p><h1>익숙한 형태,<br/><span>새로운 컬러.</span></h1><p className="brand-hero-copy">‘축잘알’ 세 글자와 알에 들어간 축구공,<br/>기울어진 판의 형태를 그대로 살렸습니다.</p></div>
   <div className="brand-hero-mark"><Wordmark width={420}/><span>축잘알 · NAVY / WHITE / LIME</span></div>
  </section>
  <section className="brand-lockups" aria-label="기존 워드로고와 색상 변경 비교">
   <div className="brand-light"><span>01 / 기존 워드로고</span><img src="/brand/wordmark-original.svg" width={320} height={157} alt="기존 파랑·흰색·노랑 축잘알 워드로고"/><p>기준이 되는 글자와 형태</p></div>
   <div className="brand-light"><span>02 / 새 화면에 맞춘 컬러</span><Wordmark width={320}/><p>같은 형태에 네이비·화이트·라임</p></div>
  </section>
  <section className="brand-detail-grid">
   <div><p className="brand-section-index">03 / 어두운 배경</p><div className="brand-reverse"><Wordmark width={280} tone="onDark"/></div></div>
   <div><p className="brand-section-index">04 / 기존 ‘축’ 아이콘</p><h2>앱 아이콘도 같은 글자에서.</h2><div className="brand-size-row">{[32,48,72].map(size=><div key={size}><LogoIcon size={size}/><span>{size}px</span></div>)}</div></div>
  </section>
  <section className="brand-downloads"><div><p className="brand-section-index">05 / 파일</p><h2>워드로고와 앱 아이콘</h2><p>워드로고는 투명 배경 SVG·PNG, 앱 아이콘은 불투명 정사각형 PNG입니다.</p></div><div className="brand-download-links">
   <a download href="/brand/wordmark-light.svg"><span>기본 워드로고</span><b>SVG ↓</b></a>
   <a download href="/brand/wordmark-dark.svg"><span>어두운 배경용 워드로고</span><b>SVG ↓</b></a>
   <a download href="/brand/wordmark-light.png"><span>투명 배경 워드로고</span><b>PNG ↓</b></a>
   <a download href="/brand/icon-1024.png"><span>앱 아이콘</span><b>1024 × 1024 PNG ↓</b></a>
   <a download href="/brand/icon-600.png"><span>앱 로고</span><b>600 × 600 PNG ↓</b></a>
  </div></section>
  <footer className="brand-guide-nav"><span>축잘알 · MATCHDAY</span><a href="/design/system.html">디자인 시스템 ↗</a></footer>
 </main>;
}
const host=document.getElementById('brand-root')!;
const root=import.meta.hot?.data.root??createRoot(host);
root.render(<BrandGuide/>);
if(import.meta.hot)import.meta.hot.data.root=root;
