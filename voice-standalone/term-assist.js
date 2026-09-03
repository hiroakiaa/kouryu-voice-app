import { findTermSpans } from './captions.js?v=2026-09-03-svg-rss';
import { createTermAnalogy } from './term-analogy.js?v=2026-09-03-shared-analogies';

// Only dictionary terms survive recognition. No transcript is stored or sent to peers.
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

export function createTermAssist({root, getCall, send, speakerName, Recognition, getExplanation, getAnalogy}) {
  const node = name => root.querySelector('[data-term-' + name + ']');
  const toggle=node('toggle'), status=node('status'), list=node('list'), count=node('count');
  const dialog=node('dialog'), title=node('title'), answer=node('answer'), close=node('close'), retry=node('retry');
  const form=node('form'), input=node('input'), submit=node('submit');
  const entries=new Map(), cache=new Map();
  let enabled=false, speech=null, generation=0, failed=false, selected=null, request=null, requestId=0, timeout=null, expiry=null;
  let sequence=0;
  const instance=Math.random().toString(36).slice(2,10);
  const offText='自動検出ON中は自分の音声をCloudflareへ送り、専門用語だけを相手と共有します。音声・会話全文は保存しません。';
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
    generation++;
    if(speech){const old=speech;speech=null;old.onresult=old.onstart=old.onerror=old.onend=null;try{old.abort()}catch(_){}}
  }
  function render() {
    const fragment=document.createDocumentFragment();
    if(!entries.size){const empty=document.createElement('p');empty.className='term-empty';empty.textContent='会話に出てきた用語がここに並びます。気になる語を入力して調べることもできます。';fragment.append(empty)}
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
  function publish(text) {
    const fresh=[];let changed=false;
    for(const term of extractTerms(text)){
      // A term seen from another speaker still needs to be shared by this sender.
      if(!sent.has(keyOf(term))){sent.add(keyOf(term));fresh.push(term)}
      if(!entries.has(keyOf(term))){add(term,getCall().userId);changed=true}
    }
    if(fresh.length){try{send({type:'terms',id:instance+'-'+(++sequence),terms:fresh})}catch(_){}}
    if(changed)render();
  }
  const sent=new Set();
  async function explain(key) {
    if(!getCall().joined||!entries.has(key))return;
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
      if(id!==requestId||controller.signal.aborted||!getCall().joined)return;
      if(typeof result!=='string'||!result.trim())throw Error('empty');
      const text=result.trim().slice(0,240);answer.textContent=text;
      cache.set(key,{text,until:Date.now()+60000,timer:setTimeout(()=>cache.delete(key),60000)});
      expiry=setTimeout(()=>{cache.delete(key);if(selected===key){answer.textContent='説明の表示期限が過ぎました。もう一度取得できます。';retry.hidden=false}},60000);
    }catch(_){if(id===requestId&&!controller.signal.aborted){answer.textContent='説明を取得できませんでした。時間をおいてお試しください。';retry.hidden=false}}
    finally{if(id===requestId){clearTimeout(timeout);request=null}}
  }
  function clear() {closeDialog();analogies.clear();entries.clear();for(const entry of cache.values())clearTimeout(entry.timer);cache.clear();sent.clear();render()}
  function stop() {enabled=false;failed=false;stopSpeech();clear();toggle.textContent='自動検出をON';toggle.setAttribute('aria-pressed','false');status.textContent=offText}
  function sync() {
    const call=getCall();toggle.disabled=!call.joined;input.disabled=submit.disabled=!call.joined;
    if(!call.joined){stop();return}
    if(!enabled)return;
    if(call.muted){stopSpeech();status.textContent='マイクOFF中は自分の検出を休止します。相手から届く用語は追加されます。';return}
    if(speech||failed)return;
    const token=++generation;
    try{
      const current=new Recognition();speech=current;status.textContent='音声から用語を探す準備をしています…';
      current.onstart=()=>{if(token===generation)status.textContent='用語を検出中です。数秒ごとに追加します。相手の発言には相手側でも自動検出ONが必要です。'};
      current.onresult=event=>{
        if(token!==generation||!enabled||!getCall().joined||getCall().muted)return;
        for(let i=event.resultIndex;i<event.results.length;i++){const r=event.results[i];if(r?.isFinal)publish(r[0]?.transcript)}
      };
      const failure=event=>{if(token!==generation)return;stopSpeech();failed=true;status.textContent=event?.error==='quota'?'自動検出の利用上限に達しました。通話と受信は続けられます。':'自動検出を停止しました。マイクや通信を確認し、自動検出をOFF→ONにしてください。'};
      current.onerror=failure;current.onend=failure;current.start();
    }catch(_){stopSpeech();failed=true;status.textContent='自動検出を開始できませんでした。手入力で用語を調べられます。'}
  }
  toggle.addEventListener('click',()=>{
    if(enabled){stop();return}if(!getCall().joined)return;
    enabled=true;failed=false;toggle.textContent='自動検出をOFF';toggle.setAttribute('aria-pressed','true');sync();
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!getCall().joined)return;
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
    let changed=false;
    for(const term of terms){if(typeof term!=='string'||term.length>80)continue;const found=extractTerms(term);if(found.length!==1||keyOf(found[0])!==keyOf(term))continue;
      if(!entries.has(keyOf(term))){add(term,speaker);changed=true}}
    if(changed)render();
  }};
}
