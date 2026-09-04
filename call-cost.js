// Per-call numeric telemetry only. Token-dependent costs use the existing model assumptions.
const keys=['speechSeconds','discovery','discoveryExtract','discoveryReview','explanation','sharedExplanation','analogy','shared','reads','writes','deletes','turnBytes'];
export function estimateCallCost(u={},rate=150){
 const discovery=(u.discoveryExtract||0)*.00014+(u.discoveryReview||0)*.00018+(u.discovery||0)*.00032;
 const money={speech:(u.speechSeconds||0)/60*46.63*.011/1000,discovery,explanation:Math.max(0,(u.explanation||0)-(u.sharedExplanation||0))*.00011,analogy:Math.max(0,(u.analogy||0)-(u.shared||0))*.00026,firestore:((u.reads||0)*.03+(u.writes||0)*.09+(u.deletes||0)*.01)/100000,turn:(u.turnBytes||0)/1e9*.05};
 for(const k in money)money[k]*=rate;return {...money,total:Object.values(money).reduce((a,b)=>a+b,0)};
}
export function createCallCost(){
 let own={},epoch='',started=0,ended=0;const remote=new Map();
 return {
 start(now=Date.now()){own={};remote.clear();epoch=String(now);started=now;ended=0},
 end(){ended=Date.now()},
 add(key,value=1){if(started&&!ended&&keys.includes(key)&&Number.isFinite(value)&&value>=0)own[key]=(own[key]||0)+value},
 packet(extra={}){return {epoch,values:{...own,...extra}}},
 receive(id,p){if(!started||ended||!p||typeof p.epoch!=='string'||p.epoch.length>40||!p.values)return false;const v={};for(const k of keys){const n=p.values[k]??0;if(!Number.isFinite(n)||n<0||n>1e12)return false;v[k]=n}const key=id+':'+p.epoch;if(!remote.has(key)&&remote.size>=40)return false;const last=remote.get(key)||{};for(const k of keys)v[k]=Math.max(v[k],last[k]||0);remote.set(key,v);return true},
 snapshot(extra={}){const values={...own,...extra};for(const v of remote.values())for(const k of keys)values[k]=(values[k]||0)+(v[k]||0);return {values,devices:started?remote.size+1:0,seconds:started?Math.max(0,((ended||Date.now())-started)/1000):0,started,ended}}
 };
}
export function bindCostTabs(root){
 const tabs=[...root.querySelectorAll('[data-cost-tab]')];
 function select(tab){for(const b of tabs){const selected=b===tab;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;root.querySelector('#'+b.getAttribute('aria-controls')).hidden=!selected}}
 for(const tab of tabs){tab.addEventListener('click',()=>select(tab));tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(tabs.indexOf(tab)+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;select(tabs[i]);tabs[i].focus()})}
}
