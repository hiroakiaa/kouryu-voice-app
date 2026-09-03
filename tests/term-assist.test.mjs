import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTermAssist,extractTerms} from '../term-assist.js';

function setup(getExplanation=async()=> '短い解説') {
 class Element {
  constructor(){this.children=[];this.events={};this.textContent='';this.value=''}
  append(...nodes){this.children.push(...nodes)}
  replaceChildren(...nodes){this.children=nodes}
  setAttribute(k,v){this[k]=v}
  addEventListener(k,f){this.events[k]=f}
  click(){return this.events.click?.()}
  showModal(){this.open=true}
  close(){this.open=false}
 }
 globalThis.document={createElement:()=>new Element(),createDocumentFragment:()=>new Element()};
 const nodes=new Map();const root={querySelector:s=>{if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s)}};
 const call={joined:true,muted:false,userId:'self'},sent=[],instances=[];
 class Recognition {constructor(){instances.push(this)}start(){this.onstart?.()}abort(){this.aborted=true}}
 const api=createTermAssist({root,getCall:()=>call,send:p=>sent.push(p),speakerName:x=>x,Recognition,getExplanation});
 return {api,call,sent,instances,node:k=>nodes.get('[data-term-'+k+']'),result:text=>{const r=[{transcript:text}];r.isFinal=true;instances.at(-1).onresult({resultIndex:0,results:[r]})}};
}
const tick=()=>new Promise(r=>setImmediate(r));

test('用語候補だけを抽出し、重複と普通の文章を除外する',()=>{
 assert.deepEqual(extractTerms('明日はAPIとAPI、機械学習について話します。'),['API','機械学習']);
 assert.deepEqual(extractTerms('お昼に会いましょう。'),[]);
 assert.deepEqual(extractTerms('エーピーアイを使います。'),['API']);
 assert.deepEqual(extractTerms('SVGとRSSを使います。'),['SVG','RSS']);
 assert.deepEqual(extractTerms('ＳＶＧ、ｒｓｓ、S V G、R.S.S'),['SVG','RSS']);
 assert.deepEqual(extractTerms('エスブイジーとアールエスエスです。'),['SVG','RSS']);
 assert.deepEqual(extractTerms('エス・ヴィー・ジー、アール エス エス'),['SVG','RSS']);
 assert.deepEqual(extractTerms('ASVGやRSSFeedという識別子'),[]);
});
test('認識全文を表示・送信せず、新しい語だけ共有する。ミュートと退室で停止する',()=>{
 const h=setup();h.node('toggle').click();h.result('秘密の議題はAPIとWebRTCです。');
 assert.equal(h.sent.length,1);assert.deepEqual(h.sent[0].terms,['API','WebRTC']);assert.equal(h.sent[0].type,'terms');assert.equal('text' in h.sent[0],false);
 assert.doesNotMatch(JSON.stringify(h.node('list').children),/秘密の議題/);
 h.result('APIです。');assert.equal(h.sent.length,1);
 h.call.muted=true;h.api.sync();assert.equal(h.instances[0].aborted,true);
 h.call.joined=false;h.api.sync();assert.equal(h.node('count').textContent,'0語');h.api.stop();
});
test('相手からの用語を検証し、旧字幕も全文表示せず、同じ語をまとめる',()=>{
 const h=setup();h.node('toggle').click();
 h.api.receive('A',{type:'terms',terms:['API','自由な会話全文','<script>']});
 h.api.receive('B',{type:'caption',final:true,text:'秘密の相談です。APIとWebRTC。'});
 assert.equal(h.node('count').textContent,'2語');assert.equal(h.sent.length,0);h.api.stop();
});
test('解説はクリック時だけ取得し、短時間の再表示は再課金せず、OFFで消す',async()=>{
 let calls=0;const h=setup(async()=>{calls++;return 'APIの説明'});h.node('toggle').click();h.result('APIについて。');assert.equal(calls,0);
 h.node('list').children[0].children[0].click();await tick();assert.equal(calls,1);assert.equal(h.node('answer').textContent,'APIの説明');
 h.node('close').click();h.node('list').children[0].children[0].click();await tick();assert.equal(calls,1);
 h.node('toggle').click();assert.equal(h.node('answer').textContent,'');assert.equal(h.node('dialog').open,false);h.api.stop();
});
test('解説待機中に退室すると要求を中断し遅い回答を表示しない',async()=>{
 let resolve,signal;const h=setup((term,options)=>{signal=options.signal;return new Promise(r=>resolve=r)});
 h.node('input').value='相対性理論';h.node('form').events.submit({preventDefault(){}});assert.equal(h.instances.length,0);
 h.call.joined=false;h.api.sync();assert.equal(signal.aborted,true);resolve('遅い説明');await tick();assert.equal(h.node('answer').textContent,'');h.api.stop();
});
test('本番は低価格のバッチ認識を使用し、配布用モジュールが一致する',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/createServerRecognition/);assert.doesNotMatch(html,/createStreamingRecognition|wss:\/\/kouryu-captions/);
 assert.equal(await readFile(new URL('../term-assist.js',import.meta.url),'utf8'),await readFile(new URL('../voice-standalone/term-assist.js',import.meta.url),'utf8'));
 delete globalThis.document;
});
