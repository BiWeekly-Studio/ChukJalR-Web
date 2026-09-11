// Isolated visual fixture. This entry is never included in the production build.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {FreshStartCard} from '../../src/components/FreshStart';
import {repository} from '../../src/data';
import {FRESH_START_SKU, type FreshStartState} from '../../src/lib/freshStart';
import '../../src/styles.css';
const state:FreshStartState={sku:FRESH_START_SKU,tickets:[],challenges:[{id:'original',started_at:'2026-09-01T00:00:00Z',ended_at:null,refunded:false,predicted:12,settled:10,hits:6,rating:1080}]};
repository.freshStart=async (action,orderId)=>{
 if(action==='grant' && !state.tickets.length) state.tickets.push({orderId:orderId!});
 if(action==='start' && state.tickets.length){state.tickets=[];state.challenges[0].ended_at=new Date().toISOString();state.challenges.unshift({id:'new',started_at:new Date().toISOString(),ended_at:null,refunded:false,predicted:0,settled:0,hits:0,rating:1000});}
 return structuredClone(state);
};
createRoot(document.getElementById('root')!).render(<React.StrictMode><main style={{maxWidth:390,margin:'0 auto',padding:16}}><p>화면 확인용 · 실제 과금 없음</p><FreshStartCard/></main></React.StrictMode>);
