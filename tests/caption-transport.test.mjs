import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('    function setupCaptionChannel('),html.indexOf('    function setupPeerDataChannel('));
function setup() {
 const created=[];const state={id:'B',remoteSessionId:'session-B',peer:{createDataChannel(label,options){const ch={label,options,close(){this.closed=true}};created.push(ch);return ch}}};
 const ctx=vm.createContext({CAPTIONS_ENABLED:true,peers:new Map([['B',state]]),shouldCreateOffer:()=>true,handlePeerDataMessage:()=>{}});
 vm.runInContext(code,ctx);return {ctx,state,created};
}
test('旧クライアントと古いセッションには字幕専用チャネルを作らない',()=>{
 const {ctx,state,created}=setup();ctx.negotiateCaptionChannel(state,{sessionId:'session-B'});
 ctx.negotiateCaptionChannel(state,{sessionId:'stale',captionProtocol:1});assert.equal(created.length,0);
 ctx.negotiateCaptionChannel(state,{sessionId:'session-B',captionProtocol:1});assert.equal(created.length,1);
 assert.equal(created[0].options.ordered,true);assert.equal(created[0].options.maxPacketLifeTime,5000);
 ctx.negotiateCaptionChannel(state,{sessionId:'session-B',captionProtocol:1});assert.equal(created.length,1);
 created[0].onclose();assert.equal(state.captionChannel,null);
});
test('再接続前の古いpeerや無効化中のチャネルは閉じる',()=>{
 const {ctx,state,created}=setup();ctx.CAPTIONS_ENABLED=false;
 ctx.negotiateCaptionChannel(state,{sessionId:'session-B',captionProtocol:1});assert.equal(created.length,0);
 const ch={close(){this.closed=true}};ctx.setupCaptionChannel(state,ch);assert.equal(ch.closed,true);
 ctx.CAPTIONS_ENABLED=true;ctx.peers.clear();ctx.negotiateCaptionChannel(state,{sessionId:'session-B',captionProtocol:1});assert.equal(created.length,0);
});
