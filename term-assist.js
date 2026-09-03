import {createTermDiscovery} from './learned-terms.js?v=2026-09-03-quiet-terms';
import { findTermSpans } from './captions.js?v=2026-09-03-svg-rss';
import { createTermAnalogy } from './term-analogy.js?v=2026-09-03-no-rebuild';

// Only validated terms survive recognition. No transcript is stored or sent to peers.
export function extractTerms(text) {
  if (typeof text !== 'string') return [];
  const normalized = text.slice(0, 600).normalize('NFKC')
    .replace(/エー[・ ]?ピー[・ ]?アイ/g, 'API')
    .replace(/ウェブ[・ ]?アール[・ ]?ティー[・ ]?シー/gi, 'WebRTC')
    .replace(/エス[・ ]*(?:ブイ|ヴイ|ヴィー|ビー)[・ ]*ジー/g, 'SVG')
    .replace(/アール[・ ]*エス[・ ]*エス/g, 'RSS')
    .replace(/(^|[^A-Za-z0-9_])S[ .・]*V[ .・]*G(?=$|[^A-Za-z0-9_])/gi, '$1SVG')
    .replace(/(^|[^A-Za-z0-9_])R[ .・]*S[ .・]*S(?=$|[^A-Za-z0-9_])/gi, '$1RSS');
  return findTermSpans(normalized, 20).map(span => normalized.slice(span.start, span.end));
}
const keyOf = term => term.toLowerCase().replace(/\s+/g, ' ');

export function createTermAssist({root, getCall, send, speakerName, Recognition, getExplanation, getAnalogy, getDictionary, discoverTerms}) {
  const node = name => root.querySelector('[data-term-' + name + ']');
  const toggle=node('toggle'), status=node('status'), list=node('list'), count=node('count');
  const dialog=node('dialog'), title=node('title'), answer=node('answer'), close=node('close'), retry=node('retry');
  const form=node('form'), input=node('input'), submit=node('submit');
  const entries=new Map(), cache=new Map();
  let enabled=false, speech=null, generation=0, failed=false, selected=null, request=null, requestId=0, timeout=null, expiry=null;
  let sequence=0,lastJoined=null;
  const canLookup=()=>getCall().joined;
  const instance=Math.random().toString(36).slice(2,10);
  const offText='';
  const discovery=createTermDiscovery({getDictionary,discoverTerms,isActive:()=>enabled&&getCall().joined,knownTerms:extractTerms,
    onStatus:text=>{const hint=node('discovery-status');if(hint)hint.textContent=text},
    onTerms:(terms,share=true,speaker=getCall().userId)=>publishTerms(terms,share,speaker)});
  const analogies=createTermAnalogy({root,getTerm:()=>entries.get(selected)?.term,getCall,getAnalogy});

  function cancelRequest() {
    requestId++;request?.abort();request=null;clearTimeout(timeout);clearTimeout(expiry);timeout=null;expiry=null;
  }
  function closeDialog() {
    analogies.reset();
    cancelRequest();selected=null;answer.textContent='';retry.hidden=true;
    if(dialog.open)dialog.close();dialog.hidden=true;
  }
  function stopSpeech() {
    generation++;discovery.stop();
    if(speech){const old=speech;speech=null;old.onresult=old.onstart=old.onerror=old.onend=null;try{old.abort()}catch(_){}}
  }
  function render() {
    const fragment=document.createDocumentFragment();
    if(!entries.size){const empty=document.createElement('p');empty.className='term-empty';empty.textContent='用語はまだありません。';fragment.append(empty)}
    for(const [key,entry] of entries){
      const button=document.createElement('button');button.type='button';button.className='term-item';
      button.setAttribute('aria-label','用語を調べる：'+entry.term);
      const label=document.createElement('strong');label.textContent=entry.term;
      const source=document.createElement('span');source.textContent=entry.manual?'自分で入力':speakerName(entry.speaker);
      button.append(label,source);button.addEventListener('click',()=>{void explain(key)});fragment.append(button);
    }
    list.replaceChildren(fragment);count.textContent=entries.size+'語';
  }
  function add(term,speaker,manual=false) {
    const key=keyOf(term);if(entries.has(key))return key;
    if(entries.size>=80){const oldest=entries.keys().next().value;entries.delete(oldest);clearTimeout(cache.get(oldest)?.timer);cache.delete(oldest);if(selected===oldest)closeDialog()}
    entries.set(key,{term,speaker,manual});return key;
  }
  function publishTerms(terms,share=true,speaker=getCall().userId) {
    const fresh=[];
    let changed=false;
    for(const term of terms.slice(0,20)){
      // A term seen from another speaker still needs to be shared by this sender.
      if(share&&!sent.has(keyOf(term))){sent.add(keyOf(term));fresh.push(term)}
      if(!entries.has(keyOf(term))){add(term,speaker);changed=true}
    }
    if(fresh.length){try{send({type:'terms',id:instance+'-'+(++sequence),terms:fresh})}catch(_){}}
    if(changed)render();
  }
  function publish(text){publishTerms([...extractTerms(text),...discovery.match(text)]);discovery.observe(text)}
  const sent=new Set();
  async function explain(key) {
    if(!canLookup()||!entries.has(key))return;
    analogies.reset();
    cancelRequest();selected=key;title.textContent=entries.get(key).term;answer.textContent='調べています…';retry.hidden=true;
    dialog.hidden=false;if(!dialog.open)dialog.showModal();close.focus?.();
    const saved=cache.get(key);
    if(saved&&saved.until>Date.now()){
      answer.textContent=saved.text;expiry=setTimeout(()=>{if(selected===key){cache.delete(key);answer.textContent='説明の表示期限が過ぎました。もう一度取得できます。';retry.hidden=false}},saved.until-Date.now());return;
    }
    cache.delete(key);
    const id=requestId, controller=new AbortController();request=controller;
    timeout=setTimeout(()=>{if(id!==requestId)return;controller.abort();requestId++;answer.textContent='取得に時間がかかっています。もう一度お試しください。';retry.hidden=false},15000);
    try{
      const result=await getExplanation(entries.get(key).term,{signal:controller.signal});
      if(id!==requestId||controller.signal.aborted||!canLookup())return;
      if(typeof result!=='string'||!result.trim())throw Error('empty');
      const text=result.trim().slice(0,240);answer.textContent=text;
      cache.set(key,{text,until:Date.now()+60000,timer:setTimeout(()=>cache.delete(key),60000)});
      expiry=setTimeout(()=>{cache.delete(key);if(selected===key){answer.textContent='説明の表示期限が過ぎました。もう一度取得できます。';retry.hidden=false}},60000);
    }catch(_){if(id===requestId&&!controller.signal.aborted){answer.textContent='説明を取得できませんでした。時間をおいてお試しください。';retry.hidden=false}}
    finally{if(id===requestId){clearTimeout(timeout);request=null}}
  }
  function clear() {closeDialog();analogies.clear();entries.clear();for(const entry of cache.values())clearTimeout(entry.timer);cache.clear();sent.clear();render()}
  function stop() {enabled=false;failed=false;stopSpeech();clear();toggle.textContent='検出を再開';toggle.hidden=true;status.textContent=offText}
  function sync() {
    const call=getCall();toggle.disabled=!call.joined;form.hidden=!call.joined;input.disabled=submit.disabled=!call.joined;
    if(!call.joined){if(lastJoined!==false)stop();lastJoined=false;return}
    lastJoined=true;
    enabled=true;toggle.hidden=!failed;
    if(call.muted){stopSpeech();failed=false;toggle.hidden=true;status.textContent='マイクOFF・相手の用語は受信中';return}
    if(speech||failed)return;
    discovery.start();
    const token=++generation;
    try{
      const current=new Recognition();speech=current;status.textContent='準備中…';
      current.onstart=()=>{if(token===generation)status.textContent='検出中'};
      current.onresult=event=>{
        if(token!==generation||!enabled||!getCall().joined||getCall().muted)return;
        for(let i=event.resultIndex;i<event.results.length;i++){const r=event.results[i];if(r?.isFinal)publish(r[0]?.transcript)}
      };
      const failure=event=>{if(token!==generation)return;stopSpeech();failed=true;toggle.hidden=false;status.textContent=event?.error==='quota'?'自動検出の利用上限に達しました。通話と受信は続けられます。':'検出が止まりました。「検出を再開」を押してください。'};
      current.onerror=failure;current.onend=failure;current.start();
    }catch(_){stopSpeech();failed=true;toggle.hidden=false;status.textContent='検出を開始できません。「検出を再開」を押してください。'}
  }
  toggle.addEventListener('click',()=>{
    if(!getCall().joined||!failed)return;
    failed=false;toggle.hidden=true;sync();
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!canLookup())return;
    const term=input.value.trim().normalize('NFKC');
    if(!/^[\p{L}\p{N} .+／/ー_-]{1,80}$/u.test(term)){input.setCustomValidity?.('用語を80文字以内で入力してください。');input.reportValidity?.();return}
    input.setCustomValidity?.('');const key=add(term,getCall().userId,true);input.value='';render();void explain(key);
  });
  input.addEventListener('input',()=>input.setCustomValidity?.(''));
  close.addEventListener('click',()=>{closeDialog();list.focus?.()});
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();list.focus?.()});
  retry.addEventListener('click',()=>{if(selected)void explain(selected)});
  sync();render();
  return {sync,stop,removePeer(){},receive(speaker,packet){
    if(!enabled||!getCall().joined)return;
    // During rollout, old full-caption clients are parsed locally, never displayed.
    const terms=packet?.type==='caption'&&packet.final?extractTerms(packet.text):packet?.type==='terms'&&Array.isArray(packet.terms)&&packet.terms.length<=20?packet.terms:[];
    const unknown=terms.filter(t=>typeof t==='string'&&t.length<=40&&!extractTerms(t).some(v=>keyOf(v)===keyOf(t)));
    if(unknown.length)void discovery.receive(unknown,speaker);
    let changed=false;
    for(const term of terms){if(typeof term!=='string'||term.length>80)continue;const found=extractTerms(term);if(found.length!==1||keyOf(found[0])!==keyOf(term))continue;
      if(!entries.has(keyOf(term))){add(term,speaker);changed=true}}
    if(changed)render();
  }};
}

