// USD unit prices checked 2026-09-03. Estimates, never account billing telemetry.
export function estimateOperatingCost({participants=2,rate=150,mode='new'}={}){
 const n=Math.min(4,Math.max(1,Math.round(Number(participants)||2)));
 const yen=Number.isFinite(Number(rate))&&Number(rate)>0?Number(rate):150;
 const busy=mode!=='cached',fresh=mode==='new';
 const speech=46.63*.011/1000*10*n*yen;
 const explanation=(500*.1+200*.3)/1e6*10*yen;
 const discovery=busy?((800*.1+200*.3)+(600*.1+400*.3))/1e6*20*n*yen:0;
 const analogy=fresh?(800*.1+600*.3)/1e6*10*yen:0;
 const firestore=(1000*.03+200*.09+20*.01)/100000*yen;
 const turn=64000/8*600*n*(n-1)*2/1e9*.05*yen;
 const low=speech+explanation+discovery+analogy+firestore;
 return {participants:n,rate:yen,speech,explanation,discovery,analogy,firestore,turn,low,high:low+turn};
}
export function createCostEstimator(root,getRate){
 const node=id=>root.querySelector('#'+id),people=node('costParticipants'),mode=node('costScenario');
 function render(){
  if(!people||!mode)return;
  const c=estimateOperatingCost({participants:people.value,mode:mode.value,rate:getRate()});
  const money=n=>n.toFixed(2)+'円',range=money(c.low)+'〜'+money(c.high);
  const conditions=mode.value==='cached'?'登録済み中心・たとえ再利用':mode.value==='reuse'?'AI補助多め・たとえ再利用':'AI補助多め・たとえ新規10回';
  const text=(id,value)=>{const el=node(id);if(el)el.textContent=value};
  text('costScenarioTotal',range);
  text('tipsTenMinuteCost',range);text('tipsCostConditions',c.participants+'人・'+conditions+'の試算。実際の請求額ではありません。');
  for(const key of ['speech','explanation','discovery','analogy','firestore'])text('cost-'+key,money(c[key]));
  text('cost-turn','0円〜'+money(c.turn));
  text('costAssumptions',c.participants+'端末すべてで音声認識10分、説明は全体で10回。'+(mode.value==='cached'?'AI補助0回、たとえはすべて再利用。':'AI補助は各端末20回、毎回抽出と審査を実行。たとえは'+(mode.value==='new'?'全体で10回新規生成。':'すべて再利用。'))+' 1ドル＝'+c.rate.toFixed(2)+'円。');
 }
 people?.addEventListener('change',render);mode?.addEventListener('change',render);
 return {render};
}
