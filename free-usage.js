const LIMITS={reads:50000,writes:20000,deletes:20000,aiNeurons:10000,turnBytes:1000e9,workerRequests:100000};
const TEN_MINUTE={reads:1120,writes:260,deletes:20};

function number(value){return Math.max(0,Number(value)||0)}
function aiNeurons(values={}){
 const speech=number(values.speechSeconds)/60*46.63;
 const discovery=(number(values.discoveryExtract)*.00014+number(values.discoveryReview)*.00018+number(values.discovery)*.00032)/.011*1000;
 const explanation=Math.max(0,number(values.explanation)-number(values.sharedExplanation))*.00011/.011*1000;
 const analogy=Math.max(0,number(values.analogy)-number(values.shared))*.00026/.011*1000;
 return speech+discovery+explanation+analogy;
}
function scenarioUsage(participants=2,mode='new'){
 const n=Math.min(4,Math.max(1,Math.round(number(participants)||2))),plain=mode==='plain';
 const speechMinutes=Math.min(n*10,Math.max(7,5+n));
 const speech=plain?0:speechMinutes*46.63;
 const explanation=plain?0:50;
 const discovery=!plain&&mode!=='cached'?(.00384/.011*1000):0;
 const analogy=mode==='new'?(.00052/.011*1000):0;
 return {...TEN_MINUTE,aiNeurons:speech+explanation+discovery+analogy,turnBytes:64000/8*600*n*(n-1)*2};
}
function remainingCalls(used,scenario){
 const values=[(LIMITS.reads-used.reads)/scenario.reads,(LIMITS.writes-used.writes)/scenario.writes,(LIMITS.deletes-used.deletes)/scenario.deletes];
 if(scenario.aiNeurons)values.push((LIMITS.aiNeurons-used.aiNeurons)/scenario.aiNeurons);
 return Math.max(0,Math.floor(Math.min(...values)));
}
function percent(value,limit){return Math.min(100,number(value)/limit*100)}
function formatInt(value){return Math.round(number(value)).toLocaleString('ja-JP')}
function card(label,used,limit,unit,note){
 const ratio=percent(used,limit),level=ratio>=90?'is-danger':ratio>=70?'is-warning':'';
 return `<article class="free-usage-card ${level}"><div><strong>${label}</strong><span>${formatInt(used)} / ${formatInt(limit)} ${unit}</span></div><div class="free-usage-meter" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio)}"><i style="width:${ratio.toFixed(2)}%"></i></div><small>${note}</small></article>`;
}
export function createFreeUsageDashboard(root,{getHistory,getCurrent,getParticipants,getMode}){
 const host=root.querySelector('#freeUsageCards'),summary=root.querySelector('#freeUsageSummary'),updated=root.querySelector('#freeUsageUpdated');
 function render(){
  if(!host)return;
  const now=new Date(),dateKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,monthKey=dateKey.slice(0,7);
  const history=getHistory?.()||{records:[]},records=Array.isArray(history.records)?history.records:[];
  const today=records.filter(record=>record.dateKey===dateKey),month=records.filter(record=>record.monthKey===monthKey);
  const used={reads:0,writes:0,deletes:0,aiNeurons:0,turnBytes:0};
  for(const record of today){
   used.reads+=number(record.reads);used.writes+=number(record.writes);used.deletes+=number(record.deletes);
   const savedAi=number(record.aiNeurons),rate=number(record.yenPerDollar)||158,aiYen=number(record.speechCostYen)+number(record.discoveryCostYen)+number(record.explanationCostYen)+number(record.analogyCostYen);
   used.aiNeurons+=savedAi||(aiYen/rate/.011*1000);
  }
  for(const record of month)used.turnBytes+=number(record.turnBytes);
  const current=getCurrent?.();
  if(current&&!current.saved){used.reads+=number(current.values?.reads);used.writes+=number(current.values?.writes);used.deletes+=number(current.values?.deletes);used.aiNeurons+=aiNeurons(current.values);used.turnBytes+=number(current.values?.turnBytes)}
  const scenario=scenarioUsage(getParticipants?.(),getMode?.()),calls=remainingCalls(used,scenario);
  summary.innerHTML=`<strong>この条件なら、あと約${calls}回</strong><span>10分通話で約${Math.floor(calls/6)}時間${calls%6*10}分。選択中の人数・利用条件で換算しています。</span>`;
  host.innerHTML=card('Firestore 読み取り',used.reads,LIMITS.reads,'回','毎日リセット。接続・同期・連絡で使います。')+card('Firestore 書き込み',used.writes,LIMITS.writes,'回','毎日リセット。参加状態や連絡の更新で使います。')+card('Firestore 削除',used.deletes,LIMITS.deletes,'回','毎日リセット。古い接続情報の整理で使います。')+card('Workers AI',used.aiNeurons,LIMITS.aiNeurons,'ニューロン','毎日リセット。理解サポートを使った分だけ増えます。')+card('TURN 中継',used.turnBytes/1e9,LIMITS.turnBytes/1e9,'GB','月ごとの無料枠。直接接続の音声は含みません。');
  if(updated)updated.textContent=`この端末の記録から ${now.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})} に再計算`;
 }
 return {render};
}

export {LIMITS,scenarioUsage,aiNeurons,remainingCalls};
