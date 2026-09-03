import test from 'node:test';import assert from 'node:assert/strict';
import {StreamingPcm} from '../caption-stream-pcm.js';import {createStreamingRecognition} from '../caption-stream.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('44.1/48kHz音声を100msごとに送り出し、長い発話の完了を待たない',()=>{
 for(const rate of [44100,48000]){const packets=[];const encoder=new StreamingPcm(rate,p=>packets.push(p));encoder.push(new Float32Array(rate).fill(.1));assert.equal(packets.length,10);assert.equal(packets[0].length,1600);encoder.clear();assert.equal(encoder.buffer.some(x=>x),false)}
});
test('認証後に音声を送信し、途中と確定を同じIDで更新、停止後の結果は無視する',async()=>{
 let socket,node,stops=0;
 class Socket{readyState=1;bufferedAmount=0;sent=[];constructor(){socket=this}send(data){this.sent.push(data)}close(){this.closed=true}}
 class Context{state='running';destination={};audioWorklet={addModule:async()=>{}};resume(){return Promise.resolve()}createMediaStreamSource(){return{connect(){},disconnect(){}}}close(){return Promise.resolve()}}
 class Worklet{constructor(){node=this;this.port={postMessage(){}}}connect(){}disconnect(){}}
 const Recognition=createStreamingRecognition({endpoint:'wss://test',getToken:async()=>'test',getStream:()=>({getAudioTracks:()=>[{enabled:true,readyState:'live',stop(){stops++}}]}),Socket,Context,Worklet});
 const r=new Recognition(),results=[];r.onresult=e=>results.push(e);r.start();await tick();socket.onopen();assert.deepEqual(JSON.parse(socket.sent[0]),{token:'test'});
 socket.onmessage({data:JSON.stringify({type:'ready'})});await tick();node.port.onmessage({data:new Int16Array(1600)});assert.equal(socket.sent[1].byteLength,3200);
 socket.onmessage({data:JSON.stringify({type:'result',id:20,text:'途中',final:false})});socket.onmessage({data:JSON.stringify({type:'result',id:20,text:'確定',final:true})});
 assert.equal(results[0].resultIndex,results[1].resultIndex);assert.equal(results[0].results[20].isFinal,false);assert.equal(results[1].results[20].isFinal,true);
 const late=socket.onmessage;r.abort();late({data:JSON.stringify({type:'result',id:30,text:'遅延',final:true})});assert.equal(results.length,2);assert.equal(socket.closed,true);assert.equal(stops,0);
});
