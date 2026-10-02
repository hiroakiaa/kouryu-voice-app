import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.match(/    function monitorRemoteMediaFlow\([^]*?\n    }/)?.[0];
assert.ok(source,'monitorRemoteMediaFlow');

function harness(realtime){
  const recoveries=[];
  const context={
    realtimeParticipantState:new Map([['peer',realtime]]),
    DATA_CHANNEL_STALE_MS:15000,
    MEDIA_STALL_SAMPLES:2,
    Date:{now:()=>100000},
    recoverPeerMedia(state,reason){recoveries.push({state,reason})}
  };
  vm.runInNewContext(source,context);
  return {run:context.monitorRemoteMediaFlow,recoveries};
}

test('相手が発話中なのに受信パケットが2回止まった時だけ修復する',()=>{
  const h=harness({speaking:true,muted:false,dataAt:99000});
  const state={id:'peer',mediaStallSamples:0};
  h.run(state,true,false);
  assert.equal(h.recoveries.length,0);
  h.run(state,true,false);
  assert.equal(h.recoveries.length,1);
  assert.equal(h.recoveries[0].reason,'voice-packets-stalled');
  assert.equal(state.mediaStallSamples,0);
});

test('沈黙・ミュート・正常受信は障害として扱わない',()=>{
  for(const realtime of [
    {speaking:false,muted:false,dataAt:99000},
    {speaking:true,muted:true,dataAt:99000},
    {speaking:true,muted:false,dataAt:70000}
  ]){
    const h=harness(realtime),state={id:'peer',mediaStallSamples:1};
    h.run(state,true,false);
    assert.equal(h.recoveries.length,0);
    assert.equal(state.mediaStallSamples,0);
  }
  const h=harness({speaking:true,muted:false,dataAt:99000}),state={id:'peer',mediaStallSamples:1};
  h.run(state,true,true);
  assert.equal(h.recoveries.length,0);
  assert.equal(state.mediaStallSamples,0);
});

test('ICE再試行後も発話パケットが止まった時だけPeer再作成へ進む',()=>{
  const verifySource=html.match(/    function scheduleMediaRecoveryVerification\([^]*?\n    }/)?.[0];
  assert.ok(verifySource,'scheduleMediaRecoveryVerification');
  let callback=null,recreated=0,diagnosed=0;
  const state={id:'peer',mediaRecoveryPacketBaseline:10,remoteAudioPackets:10,mediaRecoveryVerifyTimer:null};
  const context={
    window:{clearTimeout(){},setTimeout(fn,ms){assert.equal(ms,12000);callback=fn;return 1}},
    MEDIA_RECOVERY_VERIFY_MS:12000,
    peers:new Map([['peer',state]]),joined:true,localStream:{},
    realtimeParticipantState:new Map([['peer',{speaking:true,muted:false,dataAt:99000}]]),
    DATA_CHANNEL_STALE_MS:15000,Date:{now:()=>100000},
    requestPeerRecreation(){recreated++},pushDiagnostic(){diagnosed++}
  };
  vm.runInNewContext(verifySource,context);
  context.scheduleMediaRecoveryVerification(state,'test'); callback();
  assert.equal(recreated,1);assert.equal(diagnosed,0);

  state.remoteAudioPackets=11;recreated=0;
  context.scheduleMediaRecoveryVerification(state,'test'); callback();
  assert.equal(recreated,0);assert.equal(diagnosed,1);
});

test('管理者の2端末比較と貼り付け診断に復旧履歴を含める',()=>{
  assert.match(html,/id="adminCallTestRun"/);
  assert.match(html,/id="endpointMetricsA"/);
  assert.match(html,/id="endpointMetricsB"/);
  assert.match(html,/"qualityHistory: "/);
  assert.match(html,/"recentQualitySessions: "/);
  assert.match(html,/peerRecreations: peerRecreationCount/);
  assert.match(html,/deviceContext:/);
});
