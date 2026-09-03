// Transient recognition fragments only; no browser persistence or transcript history.
export const termKey=term=>term.normalize('NFKC').trim().toLowerCase();
export const validLearnedTerm=term=>typeof term==='string'&&/^[\p{L}][\p{L}\p{N} +・／/_-]{1,39}$/u.test(term)&&!/[0-9]{4}|(?:さん|様|先生|株式会社|有限会社)$/.test(term);
export function sanitizeFragment(text){return String(text||'').normalize('NFKC').slice(0,600)
 .replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+|\b\d[\d .+()-]{3,}\d\b/gi,' ').slice(0,300)}
export function matchLearned(text,terms){
 const normalized=String(text||'').normalize('NFKC').toLowerCase();
 return terms.filter(term=>{
  const key=termKey(term);let at=normalized.indexOf(key);
  while(at!==-1){const before=normalized[at-1]||'',after=normalized[at+key.length]||'';
   if(!(/[a-z0-9_]/i.test(key[0])&&/[a-z0-9_]/i.test(before))&&!(/[a-z0-9_]/i.test(key.at(-1))&&/[a-z0-9_]/i.test(after)))return true;
   at=normalized.indexOf(key,at+1);
  }return false;
 }).slice(0,20);
}
export function createTermDiscovery({getDictionary,discoverTerms,isActive,onTerms,onStatus,knownTerms,now=Date.now}){
 let dictionary=[],epoch=0,request=null,loading=null,timer=null,pending='',nextAt=0;
 const remember=terms=>{const values=new Map(dictionary.map(t=>[termKey(t),t]));for(const t of terms||[])if(validLearnedTerm(t))values.set(termKey(t),t);dictionary=[...values.values()].slice(-1000)};
 async function refresh(){
  if(!getDictionary||!isActive())return;
  if(loading)return loading.promise;
  const id=epoch,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  const promise=(async()=>{try{const terms=await getDictionary({signal:controller.signal});if(id===epoch&&!controller.signal.aborted&&isActive())remember(terms)}catch(_){}finally{clearTimeout(timeout);if(id===epoch)loading=null}})();
  loading={promise,controller};return promise;
 }
 async function flush(){
  timer=null;if(!isActive()||request||!pending)return;
  let text=pending;pending='';
  let residual=text.toLowerCase();for(const t of [...knownTerms(text),...matchLearned(text,dictionary)])residual=residual.replaceAll(t.toLowerCase(),'');
  if(!/[A-Za-z]{2,}|[ァ-ヶー]{3,}|[\p{Script=Han}]{2,}/u.test(residual))return;
  nextAt=now()+30000;const id=epoch,controller=new AbortController();request=controller;const timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const terms=await discoverTerms(text,{signal:controller.signal});text='';
   if(id!==epoch||controller.signal.aborted||!isActive())return;
   remember(terms);onTerms((terms||[]).filter(validLearnedTerm).slice(0,3));onStatus('AI補助は最大30秒に1回。登録済みの語は辞書で検出します。');
  }catch(_){if(id===epoch&&isActive())onStatus('AI補助を利用できません。辞書での検出は続いています。')}
  finally{clearTimeout(timeout);text='';if(id===epoch){request=null;if(pending)schedule()}}
 }
 function schedule(){if(!timer&&!request)timer=setTimeout(()=>{void flush()},Math.max(0,nextAt-now()))}
 return {
  start(){void refresh()},match:text=>matchLearned(text,dictionary),
  observe(text){if(!discoverTerms||!isActive())return;pending=sanitizeFragment(text);schedule()},
  async receive(terms,speaker){await refresh();if(isActive())onTerms(terms.filter(t=>dictionary.some(d=>termKey(d)===termKey(t))),false,speaker)},
  stop(){epoch++;request?.abort();loading?.controller.abort();request=loading=null;clearTimeout(timer);timer=null;pending='';dictionary=[];onStatus('')}
 };
}
