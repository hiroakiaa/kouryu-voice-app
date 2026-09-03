import test from 'node:test';
import assert from 'node:assert/strict';
import {AnalogyCache,handle} from '../caption-worker/src/index.js';
const analogy={example:'注文窓口',similarity:'決まった方法で依頼',limit:'人ではなく通信の規約'};
export function namespace(env){
 const objects=new Map();
 return {idFromName:key=>key,get(key){if(!objects.has(key)){let value;objects.set(key,new AnalogyCache({storage:{get:async()=>structuredClone(value),put:async(_key,next)=>{value=structuredClone(next)}}},env))}return objects.get(key)}};
}
const req=body=>new Request('https://caption.example/explain',{method:'POST',headers:{Origin:'https://hiroakiaa.github.io','Content-Type':'application/json'},body:JSON.stringify(body)});
test('different users and equivalent terms share one generation, including concurrent clicks',async()=>{
 let calls=0;const e={IP_LIMIT:{limit:async()=>({success:true})},EXPLAIN_LIMIT:{limit:async()=>({success:true})},AI:{run:async()=>{calls++;await new Promise(r=>setTimeout(r,10));return {response:JSON.stringify(analogy)}}}};e.ANALOGIES=namespace(e);
 const responses=await Promise.all(['API',' api ','ＡＰＩ'].map((term,i)=>handle(req({term,genre:'cooking',conversation:'private'}),e,async()=>'user'+i)));
 const data=await Promise.all(responses.map(r=>r.json()));assert.equal(calls,1);assert.equal(new Set(data.map(d=>d.revision)).size,1);assert.equal(data.filter(d=>d.source==='generated').length,1);
 await handle(req({term:'API',genre:'games'}),e,async()=>'user');assert.equal(calls,2);
});
test('persistent answers survive restart and rebuild requests are rejected without AI calls',async()=>{
 let value,calls=0;const storage={get:async()=>structuredClone(value),put:async(_key,next)=>{value=structuredClone(next)}};
 const env={IP_LIMIT:{limit:async()=>({success:true})},EXPLAIN_LIMIT:{limit:async()=>({success:true})},AI:{run:async()=>{calls++;return {response:JSON.stringify(analogy)}}}};
 const request=(extra={})=>new Request('https://cache',{method:'POST',body:JSON.stringify({term:'api',genre:'cooking',...extra})});
 let object=new AnalogyCache({storage},env);const first=await (await object.fetch(request())).json();object=new AnalogyCache({storage},env);
 assert.equal((await (await object.fetch(request())).json()).revision,first.revision);
 assert.equal((await object.fetch(request({action:'refresh',revision:first.revision}))).status,400);
 assert.equal((await handle(req({term:'api',genre:'cooking',action:'refresh',revision:first.revision}),env,async()=>'user')).status,400);
 assert.equal(calls,1);assert.equal(value.reported,undefined);
 assert.equal((await (await object.fetch(request())).json()).revision,first.revision);
});
