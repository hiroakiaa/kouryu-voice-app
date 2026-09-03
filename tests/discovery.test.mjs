import test from 'node:test';
import assert from 'node:assert/strict';
import {handle,TermDictionary} from '../caption-worker/src/index.js';
import {createTermDiscovery,matchLearned,sanitizeFragment} from '../learned-terms.js';
const request=(path,body)=>new Request('https://caption.example/'+path,{method:'POST',headers:{Origin:'https://hiroakiaa.github.io','Content-Type':'application/json'},body:JSON.stringify(body)});
function setup(){
 const persisted=new Map(),calls=[];let stage=0;
 const env={IP_LIMIT:{limit:async()=>({success:true})},DISCOVERY_LIMIT:{limit:async()=>({success:true})},AI:{run:async(_model,input)=>{calls.push(input);return {response:JSON.stringify(++stage%2?{terms:['冪等性','山田さん','捏造語']}: {accepted:[{term:'冪等性',definition:'同じ操作を繰り返しても結果が変わらない性質'}]})}}}};
 const object=new TermDictionary({storage:{get:async key=>persisted.get(key),put:async(key,value)=>persisted.set(key,structuredClone(value))}});
 env.TERM_DICTIONARY={idFromName:k=>k,get:()=>object};return {env,persisted,calls};
}
test('AI候補は原文との一致と語だけの再審査を経て保存、会話と利用者は保存しない',async()=>{
 const h=setup();const r=await handle(request('discover',{text:'山田さんと冪等性について話す。連絡先 a@example.com、090-1234-5678'}),h.env,async()=>'secret-user');
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{terms:['冪等性']});assert.equal(h.calls.length,2);
 assert.doesNotMatch(h.calls[0].messages[1].content,/example.com|090-1234/);
 assert.deepEqual(JSON.parse(h.calls[1].messages[1].content),{terms:['冪等性']});
 assert.deepEqual([...h.persisted.values()],[['冪等性']]);
 assert.deepEqual(await (await handle(request('dictionary',{}),h.env,async()=>'other-user')).json(),{terms:['冪等性']});
 assert.ok(h.calls.every(c=>c.store===false));
});
test('認証・頻度・サイズ・モデル失敗で辞書を汚さない',async()=>{
 const h=setup();assert.equal((await handle(request('discover',{text:'冪等性'}),h.env,async()=>{throw Error()})).status,401);
 assert.equal((await handle(request('discover',{text:'a'.repeat(2000)}),h.env,async()=>'u')).status,413);
 h.env.DISCOVERY_LIMIT.limit=async()=>({success:false});assert.equal((await handle(request('discover',{text:'冪等性'}),h.env,async()=>'u')).status,429);assert.equal(h.calls.length,0);
 h.env.DISCOVERY_LIMIT.limit=async()=>({success:true});h.env.AI.run=async()=>({response:'invalid'});
 assert.equal((await handle(request('discover',{text:'冪等性'}),h.env,async()=>'u')).status,503);assert.equal(h.persisted.size,0);
});
test('共有辞書は1000語に制限し、再起動後も読み出せる',async()=>{
 let saved;const state={storage:{get:async()=>saved,put:async(_key,v)=>{saved=structuredClone(v)}}};
 const object=new TermDictionary(state);await object.fetch(request('internal',{op:'add',terms:Array.from({length:1005},(_,i)=>'Term'+i.toString(36))}));
 assert.equal(saved.length,1000);const restored=new TermDictionary(state);assert.equal((await(await restored.fetch(request('internal',{op:'read'}))).json()).terms.length,1000);
});
test('共有語はローカル一致し、認識文を蓄積せず、停止後のAI応答を捨てる',async()=>{
 assert.deepEqual(matchLearned('gRPCと冪等性。mygRPCClientは別。',['gRPC','冪等性']),['gRPC','冪等性']);assert.deepEqual(matchLearned('mygRPCClient',['gRPC']),[]);
 assert.doesNotMatch(sanitizeFragment('mail a@example.com URL https://example.com 090-1234-5678'),/example|090/);
 let resolve,active=true;const emitted=[],calls=[];
 const controller=createTermDiscovery({getDictionary:async()=>['冪等性'],discoverTerms:(text,{signal})=>{calls.push({text,signal});return new Promise(r=>resolve=r)},isActive:()=>active,onTerms:t=>emitted.push(t),onStatus:()=>{},knownTerms:()=>[]});
 controller.start();await new Promise(r=>setImmediate(r));assert.deepEqual(controller.match('冪等性です'),['冪等性']);
 controller.observe('古い断片');controller.observe('最新の専門用語');await new Promise(r=>setTimeout(r,5));assert.equal(calls.length,1);assert.equal(calls[0].text,'古い断片 最新の専門用語');
 controller.observe('次の断片');controller.stop();active=false;assert.equal(calls[0].signal.aborted,true);resolve(['gRPC']);await new Promise(r=>setImmediate(r));assert.equal(emitted.length,0);
});
test('相手が勝手に送った語は共有辞書の確認が取れるまで表示しない',async()=>{
 const emitted=[];const c=createTermDiscovery({getDictionary:async()=>['冪等性'],isActive:()=>true,onTerms:(terms,share,speaker)=>emitted.push({terms,share,speaker}),onStatus:()=>{},knownTerms:()=>[]});
 await c.receive(['冪等性','勝手な語'],'speaker');assert.deepEqual(emitted,[{terms:['冪等性'],share:false,speaker:'speaker'}]);c.stop();
});
test('未知語の待機は6秒で、待機中の断片を300文字以内にまとめて送り退室で消す',async()=>{
 let time=0,id=0;const timers=new Map(),calls=[];
 const c=createTermDiscovery({isActive:()=>true,knownTerms:()=>[],onTerms(){},onStatus(){},now:()=>time,setTimer:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id},clearTimer:id=>timers.delete(id),discoverTerms:async text=>{calls.push(text);return []}});
 const advance=async ms=>{time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn()}await new Promise(r=>setImmediate(r))};
 c.observe('最初の専門語');await advance(0);assert.equal(calls.length,1);
 c.observe('途中の専門語');c.observe('最後の専門語');await advance(5999);assert.equal(calls.length,1);await advance(1);assert.equal(calls.length,2);assert.match(calls[1],/途中.*最後/);
 c.observe('長い断片'.repeat(200));await advance(6000);assert.ok(calls[2].length<=300);
 c.observe('消える語');c.stop();await advance(6000);assert.equal(calls.length,3);
});
