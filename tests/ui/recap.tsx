import React from 'react';
import {createRoot} from 'react-dom/client';
import {AppProvider} from '../../src/store';
import {SettlementRecap} from '../../src/components/SettlementRecap';
import {repository} from '../../src/data';
import type {RecapItem} from '../../src/lib/settlementRecap';
import '../../src/styles.css';
let confirmed=false, attempts=0;
const items:RecapItem[]=[
 {id:'1',fixtureId:1,homeName:'아스날',awayName:'레알 마드리드',homeGoals:2,awayGoals:1,pick:'HOME',actual:'HOME',correct:true,deltaRating:18,points:24,settledAt:'2026-09-09T00:00:00Z'},
 {id:'2',fixtureId:2,homeName:'대한민국',awayName:'일본',homeGoals:1,awayGoals:1,pick:'HOME',actual:'DRAW',correct:false,deltaRating:-9,points:3,settledAt:'2026-09-09T00:00:00Z'},
 {id:'3',fixtureId:3,homeName:'바르셀로나',awayName:'리버풀',homeGoals:0,awayGoals:2,pick:'HOME',actual:'AWAY',correct:false,deltaRating:-15,points:3,settledAt:'2026-09-09T00:00:00Z'},
];
repository.loadSettlementRecap=async()=>({items:confirmed?[]:items,remaining:0});
repository.acknowledgeSettlementRecap=async()=>{attempts++;if(new URLSearchParams(location.search).has('fail')&&attempts===1)throw Error('offline');confirmed=true;};
createRoot(document.getElementById('root')!).render(<AppProvider><p>화면 검증용 · 실제 경기/점수가 아닙니다.</p><SettlementRecap blocked={false} onOpenChange={()=>{}}/></AppProvider>);
