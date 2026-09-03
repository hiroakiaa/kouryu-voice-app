import test from 'node:test';
import assert from 'node:assert/strict';
import {createTermAnalogy} from '../term-analogy.js';
const tick=()=>new Promise(r=>setImmediate(r));
function setup(getAnalogy){
 const nodes=new Map(),call={joined:true};
 const root={querySelector:k=>{if(!nodes.has(k))nodes.set(k,{value:'daily',events:{},textContent:'',addEventListener(k,f){this.events[k]=f}});return nodes.get(k)}};
 const api=createTermAnalogy({root,getTerm:()=> 'API',getCall:()=>call,getAnalogy});
 return {api,call,node:k=>nodes.get('[data-analogy-'+k+']')};
}
const value={example:'注文窓口',similarity:'決まった方法で依頼する',limit:'人ではなくプログラム'};

test('報告して作り直す操作はローカルキャッシュを使わず表示中の版を送る',async()=>{
 const calls=[];const h=setup(async(_term,_genre,options)=>{calls.push(options);return {...value,revision:'r'+calls.length,source:calls.length===1?'shared':'generated'}});
 h.node('button').events.click();await tick();assert.match(h.node('status').textContent,/共有済み/);
 h.node('refresh').events.click();await tick();assert.equal(calls.length,2);assert.equal(calls[1].action,'refresh');assert.equal(calls[1].revision,'r1');assert.match(h.node('status').textContent,/保存しました/);h.api.clear();
});
test('ジャンル変更では呼び出さず、押した時だけ生成し、同じ語とジャンルは60秒キャッシュする',async()=>{
 const calls=[];const h=setup(async(...args)=>{calls.push(args);return value});
 h.node('genre').value='cooking';h.node('genre').events.change();assert.equal(calls.length,0);
 h.node('button').events.click();await tick();assert.equal(calls.length,1);assert.equal(calls[0][0],'API');assert.equal(calls[0][1],'cooking');assert.equal(h.node('example').textContent,value.example);
 h.api.reset();assert.equal(h.node('example').textContent,'');h.node('button').events.click();await tick();assert.equal(calls.length,1);
 h.node('genre').value='games';h.node('genre').events.change();h.node('button').events.click();await tick();assert.equal(calls.length,2);h.api.clear();
});
test('閉じる・退室・ジャンル変更で待機中の生成を中断し、遅い回答を表示しない',async()=>{
 for(const action of ['reset','clear','genre']){
  let resolve,signal;const h=setup((_term,_genre,options)=>{signal=options.signal;return new Promise(r=>resolve=r)});
  h.node('button').events.click();if(action==='genre')h.node('genre').events.change();else h.api[action]();
  assert.equal(signal.aborted,true);resolve(value);await tick();assert.equal(h.node('result').hidden,true);assert.equal(h.node('example').textContent,'');h.api.clear();
 }
});
test('不完全な回答を表示せず、失敗後に再試行できる',async()=>{
 const h=setup(async()=>({example:'例えだけ'}));h.node('button').events.click();await tick();
 assert.equal(h.node('result').hidden,true);assert.equal(h.node('button').disabled,false);assert.match(h.node('status').textContent,/取得できません/);h.api.clear();
});
