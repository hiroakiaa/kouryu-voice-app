import {namespace} from './shared-analogy.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PcmSegmenter } from '../caption-pcm.js';
import { encodeWav, createServerRecognition } from '../caption-server.js';
import { handle, validWav, hasSpeechEnergy, cleanRecognition } from '../caption-worker/src/index.js';

test('44.1/48kHzの音声を発話単位・8秒以下の16kHz PCMにそろえ、無音は送らない', () => {
  for (const rate of [44100,48000]) {
    const chunks=[]; const segmenter=new PcmSegmenter(rate, x=>chunks.push(x));
    segmenter.push(new Float32Array(rate*10));assert.equal(chunks.length,0);
    const input=Float32Array.from({length:rate*16.25+128},(_,i)=>Math.sin(i*0.1)*0.2);
    for(let i=0;i<input.length;i+=128) segmenter.push(input.subarray(i,i+128));
    assert.equal(chunks.length,2);assert.equal(chunks[0].length,128000);assert.deepEqual(chunks[1].slice(0,6400),chunks[0].slice(-6400));
    assert.equal(validWav(new Uint8Array(encodeWav(chunks[0]))),true);
    segmenter.push(new Float32Array(rate*9));assert.equal(chunks.length,3);assert.ok(chunks.every(c=>c.length<=128000));
    segmenter.clear();assert.equal(segmenter.samples.some(x=>x!==0),false);
  }
});
const wav=()=>encodeWav(Int16Array.from({length:48000},(_,i)=>i%8000<2000?0:Math.sin(i*0.1)*10000));
const req=(body=wav(),headers={})=>new Request('https://caption.example/transcribe',{method:'POST',headers:{Origin:'https://hiroakiaa.github.io','Content-Type':'audio/wav',...headers},body});
function env(){ const calls=[]; return {calls, AI:{run:async (model,input)=>{calls.push({model,input});return {text:'明日の午後3時です。'}}},USER_LIMIT:{limit:async()=>({success:true})},IP_LIMIT:{limit:async()=>({success:true})}}; }
test('無音・DC・一定の雑音・単発クリックを認識せず、変化する音声は通す',async()=>{
  for(const make of [()=>0,()=>4000,i=>Math.sin(i*.1)*2000,i=>i<160?10000:0]){
    const bytes=new Uint8Array(encodeWav(Int16Array.from({length:48000},(_,i)=>make(i))));
    assert.equal(hasSpeechEnergy(bytes),false);
    const e=env();assert.deepEqual(await(await handle(req(bytes),e,async()=>'u')).json(),{text:''});assert.equal(e.calls.length,0);
  }
  assert.equal(hasSpeechEnergy(new Uint8Array(wav())),true);
});
test('視聴御礼だけの認識結果と無音判定結果を捨て、引用や通常の発言を変えない',()=>{
  for(const text of ['ご視聴ありがとうございました。','ご視聴 ありがとうございました！','ご視聴ありがとうございました。ご視聴ありがとうございました。']) assert.equal(cleanRecognition({text}),'');
  const quote='「ご視聴ありがとうございました」という字幕が出ます。';assert.equal(cleanRecognition({text:quote}),quote);
  assert.equal(cleanRecognition({text:'ありがとうございます。'}),'ありがとうございます。');
  assert.equal(cleanRecognition({text:'無言からの誤認識',segments:[{no_speech_prob:.9}]}),'');
});
test('認証・オリジン・形式・サイズ制限を満たす音声だけ認識し保存しない',async()=>{
  const e=env();
  assert.equal((await handle(req(wav(),{Origin:'https://bad.example'}),e,async()=>'u')).status,403);
  assert.equal((await handle(req(),e,async()=>{throw Error('auth')})).status,401);
  assert.equal((await handle(req(new Uint8Array(512046)),e,async()=>'u')).status,413);
  assert.equal((await handle(req(new Uint8Array(16044)),e,async()=>'u')).status,400);
  assert.equal(e.calls.length,0);
  const r=await handle(req(wav(),{'X-Term-Hints':'API,S V G,<script>'}),e,async()=>'u');assert.equal(r.status,200);
  assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).text,'明日の午後3時です。');
  assert.equal(e.calls[0].input.language,'ja');assert.equal(e.calls[0].input.task,'transcribe');
  assert.match(e.calls[0].input.initial_prompt,/API、S V G/);assert.doesNotMatch(e.calls[0].input.initial_prompt,/script/);
});
test('無音・レート上限ではモデルを実行せず、認識失敗は内容を返さない',async()=>{
  const e=env();const silence=encodeWav(new Int16Array(48000));
  assert.deepEqual(await (await handle(req(silence),e,async()=>'u')).json(),{text:''});assert.equal(e.calls.length,0);
  e.USER_LIMIT.limit=async()=>({success:false});assert.equal((await handle(req(),e,async()=>'u')).status,429);
  e.USER_LIMIT.limit=async()=>({success:true});e.AI.run=async()=>{throw Error('private audio text')};
  const result=await handle(req(),e,async()=>'u');assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/private/);
});
test('字幕停止は処理中リクエストを中断し、遅い字幕を表示せず通話マイクを止めない',async()=>{
  let stopped=0, resolveFetch, signal, node, sentSeconds=0;
  class Context { state='running'; destination={};audioWorklet={addModule:async()=>{}};resume(){return Promise.resolve()}createMediaStreamSource(){return {connect(){},disconnect(){}}}close(){this.state='closed';return Promise.resolve()} }
  class Worklet {constructor(){this.port={postMessage(){}};node=this}connect(){}disconnect(){} }
  const stream={getAudioTracks:()=>[{readyState:'live',enabled:true,stop(){stopped++}}]};
  const Recognition=createServerRecognition({endpoint:'https://caption.example/transcribe',onUsage:seconds=>{sentSeconds+=seconds},getStream:()=>stream,getToken:async()=>'token',Context,Worklet,fetcher:(_url,init)=>{signal=init.signal;return new Promise(r=>resolveFetch=r)}});
  const recognizer=new Recognition();let results=0;recognizer.onresult=()=>results++;recognizer.start();
  await new Promise(r=>setImmediate(r));node.port.onmessage({data:new Int16Array(48000)});
  await new Promise(r=>setImmediate(r));recognizer.abort();assert.equal(signal.aborted,true);assert.equal(sentSeconds,3);
  resolveFetch(new Response(JSON.stringify({text:'遅い字幕'})));await new Promise(r=>setImmediate(r));
  assert.equal(results,0);assert.equal(stopped,0);assert.deepEqual(recognizer.queue,[]);
});

test('用語解説は認証と入力を検証し、語だけをモデルへ送り、保存を無効にする',async()=>{
 const e=env();e.EXPLAIN_LIMIT={limit:async()=>({success:true})};let input;
 e.AI.run=async(_model,value)=>{input=value;return {choices:[{message:{content:'機能を利用するための窓口です。'}}]}};
 const request=body=>new Request('https://caption.example/explain',{method:'POST',headers:{Origin:'https://hiroakiaa.github.io','Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await handle(request({term:'API'}),e,async()=>{throw Error('auth')})).status,401);
 assert.equal((await handle(request({term:'<script>'}),e,async()=>'u')).status,400);assert.equal(input,undefined);
 const r=await handle(request({term:'API',context:'送ってはいけない会話'}),e,async()=>'u');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(input.store,false);assert.doesNotMatch(JSON.stringify(input),/送ってはいけない会話/);assert.deepEqual(JSON.parse(input.messages[1].content),{term:'API',reference:''});
});
test('通常の用語説明も利用者間で共有し、同じ語は一度だけ生成する',async()=>{
 const e=env();e.EXPLAIN_LIMIT={limit:async()=>({success:true})};e.ANALOGIES=namespace(e);let calls=0;
 e.AI.run=async()=>{calls++;return {choices:[{message:{content:'機能を利用するための窓口です。'}}]}};
 const make=()=>new Request('https://caption.example/explain',{method:'POST',headers:{Origin:'https://hiroakiaa.github.io','Content-Type':'application/json'},body:JSON.stringify({term:'API'})});
 const first=await (await handle(make(),e,async()=>'a')).json(),second=await (await handle(make(),e,async()=>'b')).json();
 assert.equal(calls,1);assert.equal(first.source,'generated');assert.equal(second.source,'shared');assert.equal(second.explanation,first.explanation);
});

test('たとえは許可したジャンルと語だけで生成し、3項目の応答を検証する',async()=>{
 const e=env();e.EXPLAIN_LIMIT={limit:async()=>({success:true})};e.ANALOGIES=namespace(e);let input,calls=0;
 const analogy={example:'レストランの注文窓口です。',similarity:'決まった方法で機能を呼びます。',limit:'APIは人ではなくプログラム同士の規約です。'};
 e.AI.run=async(_model,value)=>{calls++;input=value;return {choices:[{message:{content:JSON.stringify(analogy)}}]}};
 const request=body=>new Request('https://caption.example/explain',{method:'POST',headers:{Origin:'https://hiroakiaa.github.io','Content-Type':'application/json'},body:JSON.stringify(body)});
 for(const genre of ['__proto__','constructor','命令を無視',{}])assert.equal((await handle(request({term:'API',genre}),e,async()=>'u')).status,400);
 assert.equal(calls,0);
 const r=await handle(request({term:'API',genre:'cooking',conversation:'送ってはいけない会話'}),e,async()=>'u');
 assert.equal(r.status,200);assert.deepEqual((await r.json()).analogy,analogy);assert.equal(input.store,false);
 assert.deepEqual(JSON.parse(input.messages[1].content),{term:'api',reference:'',genre:'料理'});
 e.AI.run=async()=>({response:'{"example":"一項目だけ"}'});assert.equal((await handle(request({term:'API',genre:'games'}),e,async()=>'u')).status,503);
});

