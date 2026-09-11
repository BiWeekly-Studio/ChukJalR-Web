import React from 'react';
import {createRoot} from 'react-dom/client';
import {AppProvider,useApp} from '../../src/store';
import {Predict} from '../../src/screens/Predict';
import {repository} from '../../src/data';
import {LEAGUES,TEAMS,FIXTURES} from '../../src/data/mock';
import '../../src/styles.css';
const originalMe=repository.loadMe;
repository.loadMe=async()=>({...await originalMe(),onboarded:true,leagueOrder:[39,140,78,135]});
repository.loadCatalog=async()=>({leagues:[...LEAGUES,{id:2,name:'UEFA 챔피언스리그',short:'챔피언스',country:'국제'},{id:3,name:'UEFA 유로파리그',short:'유로파',country:'국제'},{id:848,name:'UEFA 컨퍼런스리그',short:'컨퍼런스',country:'국제'},{id:10,name:'국가대표 친선경기',short:'A매치 친선',country:'국제'}],teams:TEAMS,fixtures:[...FIXTURES,{...FIXTURES[0],id:88801,leagueId:2,roundLabel:'League Stage - 1'},{...FIXTURES[1],id:88802,leagueId:10,roundLabel:'Friendlies 1'}]});
function Ready(){const {state}=useApp();return state.catalogReady?<Predict onOpenMatch={()=>{}} showAd={false}/>:<p>불러오는 중</p>;}
createRoot(document.getElementById('root')!).render(<div className="app" style={{maxWidth:390,margin:'0 auto'}}><AppProvider><Ready/></AppProvider></div>);
