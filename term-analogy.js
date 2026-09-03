// On-demand analogies; only the chosen term and genre leave this controller.
export function createTermAnalogy({root,getTerm,getCall,getAnalogy}) {
  const canLookup=()=>getCall().lookupAllowed??getCall().joined;
  const node=name=>root.querySelector('[data-analogy-'+name+']');
  const genre=node('genre'),button=node('button'),status=node('status'),result=node('result');
  const refresh=node('refresh');let current=null;
  const fields=['example','similarity','limit'].map(node),cache=new Map();
  let request=null,generation=0,timeout=null,displayTimer=null;
  function blank(){current=null;result.hidden=true;for(const field of fields)field.textContent=''}
  function reset(){
    generation++;request?.abort();request=null;clearTimeout(timeout);clearTimeout(displayTimer);
    blank();status.textContent='';button.disabled=!getAnalogy;button.textContent='たとえを見る';
  }
  function show(value,until){
    current=value;if(refresh)refresh.disabled=!value.revision;result.hidden=false;fields.forEach((field,i)=>{field.textContent=value[['example','similarity','limit'][i]]});
    status.textContent=value.source==='shared'?'共有済みのたとえを表示しています。':value.source==='generated'?'新しいたとえを作成し、共有辞典に保存しました。':'';
    const body=result.closest?.('.caption-dialog-body');
    if(body){
      const reduced=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      body.scrollTo({top:body.scrollTop+result.getBoundingClientRect().top-body.getBoundingClientRect().top-16,behavior:reduced?'auto':'smooth'});
      result.focus?.({preventScroll:true});
    }
    displayTimer=setTimeout(()=>{blank();status.textContent='たとえの表示期限が過ぎました。もう一度取得できます。'},Math.max(0,until-Date.now()));
  }
  async function generate(action,revision){
    const term=getTerm();if(!term||!canLookup()||!getAnalogy)return;
    reset();const id=generation,chosen=genre.value||'daily',key=JSON.stringify([term.toLowerCase(),chosen]);
    const saved=cache.get(key);if(!action&&saved&&saved.until>Date.now()){show(saved.value,saved.until);return}
    if(saved){clearTimeout(saved.timer);cache.delete(key)}
    const controller=new AbortController();request=controller;button.disabled=true;status.textContent='たとえを取得しています…';
    timeout=setTimeout(()=>{
      if(id!==generation)return;controller.abort();request=null;generation++;button.disabled=false;
      status.textContent='時間がかかっています。もう一度お試しください。';
    },20000);
    try{
      const value=await getAnalogy(term,chosen,{signal:controller.signal,action,revision});
      if(id!==generation||controller.signal.aborted||!canLookup())return;
      if(!['example','similarity','limit'].every(k=>typeof value?.[k]==='string'&&value[k].trim()&&value[k].length<=240))throw Error('format');
      const until=Date.now()+60000;
      if(cache.size>=30){const oldest=cache.keys().next().value;clearTimeout(cache.get(oldest).timer);cache.delete(oldest)}
      cache.set(key,{value,until,timer:setTimeout(()=>cache.delete(key),60000)});show(value,until);
    }catch(_){if(id===generation&&!controller.signal.aborted)status.textContent='たとえを取得できませんでした。時間をおいてもう一度お試しください。'}
    finally{if(id===generation){clearTimeout(timeout);request=null;button.disabled=false}}
  }
  refresh?.addEventListener('click',()=>{if(current?.revision)void generate('refresh',current.revision)});
  genre.addEventListener('change',reset);button.addEventListener('click',()=>{void generate()});
  reset();
  return {reset,clear(){reset();for(const saved of cache.values())clearTimeout(saved.timer);cache.clear()}};
}
