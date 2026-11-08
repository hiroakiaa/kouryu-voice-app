import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleTurn} from '../cloudflare-turn-worker/src/index.js';

const origin='https://hiroakiaa.github.io';
const env={TURN_KEY_ID:'key',TURN_KEY_API_TOKEN:'secret'};
const request=(headers={})=>new Request('https://worker.example/',{
  method:'POST',
  headers:{Origin:origin,'Content-Type':'application/json',...headers},
  body:JSON.stringify({callId:'n_test_call',clientId:'device-12345678'})
});

test('TURN認証情報はFirebase認証済み端末だけに発行する',async()=>{
  const response=await handleTurn(request(),env,origin,async()=>{throw Error('auth')});
  assert.equal(response.status,401);
  assert.deepEqual(await response.json(),{error:'unauthorized'});
});

test('認証済み端末へ短期TURN認証情報を返す',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({iceServers:[{urls:['turn:relay.example:3478'],username:'u',credential:'p'}]}),{status:200,headers:{'Content-Type':'application/json'}});
  try{
    const response=await handleTurn(request({'CF-Connecting-IP':'192.0.2.10'}),env,origin,async()=> 'uid-test-success');
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.iceServers[0].urls[0],'turn:relay.example:3478');
    assert.ok(body.expiresAtMs>Date.now());
  }finally{globalThis.fetch=originalFetch;}
});

test('アプリはTURN取得時にFirebase IDトークンを送る',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/ensureAnonymousAuth\(\)[\s\S]*?user\.getIdToken\(\)[\s\S]*?"Authorization": "Bearer " \+ token/);
  assert.match(html,/2026-11-08-turn-auth-hardening/);
});
