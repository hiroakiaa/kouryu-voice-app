// On-demand analogies; only the chosen term and genre leave this controller.
export function createTermAnalogy({root,getTerm,getCall,getAnalogy}) {
  const node=name=>root.querySelector('[data-analogy-'+name+']');
  const genre=node('genre'),button=node('button'),status=node('status'),result=node('result');
  const fields=['example','similarity','limit'].map(node),cache=new Map();
  let request=null,generation=0,timeout=null,displayTimer=null;
  function blank(){result.hidden=true;for(const field of fields)field.textContent=''}
  function reset(){
    generation++;request?.abort();request=null;clearTimeout(timeout);clearTimeout(displayTimer);
    blank();status.textContent='';button.disabled=!getAnalogy;button.textContent='AIでたとえを作る';
  }
  function show(value,until){
    result.hidden=false;fields.forEach((field,i)=>{field.textContent=value[['example','similarity','limit'][i]]});
    status.textContent='';
    const body=result.closest?.('.caption-dialog-body');
    if(body){
      const reduced=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      body.scrollTo({top:body.scrollTop+result.getBoundingClientRect().top-body.getBoundingClientRect().top-16,behavior:reduced?'auto':'smooth'});
      result.focus?.({preventScroll:true});
    }
    displayTimer=setTimeout(()=>{blank();status.textContent='たとえの表示期限が過ぎました。もう一度取得できます。'},Math.max(0,until-Date.now()));
  }
  async function generate(){
    const term=getTerm();if(!term||!getCall().joined||!getAnalogy)return;
    reset();const id=generation,chosen=genre.value||'daily',key=JSON.stringify([term.toLowerCase(),chosen]);
    const saved=cache.get(key);if(saved&&saved.until>Date.now()){show(saved.value,saved.until);return}
    if(saved){clearTimeout(saved.timer);cache.delete(key)}
    const controller=new AbortController();request=controller;button.disabled=true;status.textContent='たとえを作っています…';
    timeout=setTimeout(()=>{
      if(id!==generation)return;controller.abort();request=null;generation++;button.disabled=false;
      status.textContent='時間がかかっています。もう一度お試しください。';
    },20000);
    try{
      const value=await getAnalogy(term,chosen,{signal:controller.signal});
      if(id!==generation||controller.signal.aborted||!getCall().joined)return;
      if(!['example','similarity','limit'].every(k=>typeof value?.[k]==='string'&&value[k].trim()&&value[k].length<=240))throw Error('format');
      const until=Date.now()+60000;
      if(cache.size>=30){const oldest=cache.keys().next().value;clearTimeout(cache.get(oldest).timer);cache.delete(oldest)}
      cache.set(key,{value,until,timer:setTimeout(()=>cache.delete(key),60000)});show(value,until);
    }catch(_){if(id===generation&&!controller.signal.aborted)status.textContent='たとえを取得できませんでした。時間をおいてもう一度お試しください。'}
    finally{if(id===generation){clearTimeout(timeout);request=null;button.disabled=false}}
  }
  genre.addEventListener('change',reset);button.addEventListener('click',()=>{void generate()});
  reset();
  return {reset,clear(){reset();for(const saved of cache.values())clearTimeout(saved.timer);cache.clear()}};
}
