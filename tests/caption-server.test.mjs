import test from 'node:test';
import assert from 'node:assert/strict';
import { PcmSegmenter } from '../caption-pcm.js';
import { encodeWav, createServerRecognition } from '../caption-server.js';
import { handle, validWav, hasSpeechEnergy, cleanRecognition } from '../caption-worker/src/index.js';

test('44.1/48kHzの音声を8秒以下の16kHz PCMにそろえ、先行無音を除き、無音は送らない', () => {
  for (const rate of [44100,48000]) {
    const chunks=[]; const segmenter=new PcmSegmenter(rate, x=>chunks.push(x));
    segmenter.push(new Float32Array(rate*10));assert.equal(chunks.length,0);
    const input=Float32Array.from({length:rate*7.75+128},(_,i)=>Math.sin(i*0.1)*0.2);
    for(let i=0;i<input.length;i+=128) segmenter.push(input.subarray(i,i+128));
    assert.equal(chunks.length,1);assert.equal(chunks[0].length,128000);
    assert.equal(validWav(new Uint8Array(encodeWav(chunks[0]))),true);
    segmenter.push(new Float32Array(rate*9));assert.equal(chunks.length,1);
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
  assert.equal((await handle(req(new Uint8Array(256046)),e,async()=>'u')).status,413);
  assert.equal((await handle(req(new Uint8Array(16044)),e,async()=>'u')).status,400);
  assert.equal(e.calls.length,0);
  const r=await handle(req(),e,async()=>'u');assert.equal(r.status,200);
  assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).text,'明日の午後3時です。');
  assert.equal(e.calls[0].input.language,'ja');assert.equal(e.calls[0].input.task,'transcribe');
});
test('無音・レート上限ではモデルを実行せず、認識失敗は内容を返さない',async()=>{
  const e=env();const silence=encodeWav(new Int16Array(48000));
  assert.deepEqual(await (await handle(req(silence),e,async()=>'u')).json(),{text:''});assert.equal(e.calls.length,0);
  e.USER_LIMIT.limit=async()=>({success:false});assert.equal((await handle(req(),e,async()=>'u')).status,429);
  e.USER_LIMIT.limit=async()=>({success:true});e.AI.run=async()=>{throw Error('private audio text')};
  const result=await handle(req(),e,async()=>'u');assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/private/);
});
test('字幕停止は処理中リクエストを中断し、遅い字幕を表示せず通話マイクを止めない',async()=>{
  let stopped=0, resolveFetch, signal, node;
  class Context { state='running'; destination={};audioWorklet={addModule:async()=>{}};resume(){return Promise.resolve()}createMediaStreamSource(){return {connect(){},disconnect(){}}}close(){this.state='closed';return Promise.resolve()} }
  class Worklet {constructor(){this.port={postMessage(){}};node=this}connect(){}disconnect(){} }
  const stream={getAudioTracks:()=>[{readyState:'live',enabled:true,stop(){stopped++}}]};
  const Recognition=createServerRecognition({endpoint:'https://caption.example/transcribe',getStream:()=>stream,getToken:async()=>'token',Context,Worklet,fetcher:(_url,init)=>{signal=init.signal;return new Promise(r=>resolveFetch=r)}});
  const recognizer=new Recognition();let results=0;recognizer.onresult=()=>results++;recognizer.start();
  await new Promise(r=>setImmediate(r));node.port.onmessage({data:new Int16Array(48000)});
  await new Promise(r=>setImmediate(r));recognizer.abort();assert.equal(signal.aborted,true);
  resolveFetch(new Response(JSON.stringify({text:'遅い字幕'})));await new Promise(r=>setImmediate(r));
  assert.equal(results,0);assert.equal(stopped,0);assert.equal(recognizer.pending,null);
});
