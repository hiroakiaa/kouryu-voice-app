import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createCallCost,estimateCallCost} from '../call-cost.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fn=name=>{const found=html.match(new RegExp('    function '+name+'\\([^]*?\\n    }'));assert.ok(found,name);return found[0]};
test('current-call totals track usage, reuse, duplicate packets, departed peers and reset',()=>{
 const a=createCallCost(),b=createCallCost();a.start();b.start();a.add('speechSeconds',60);a.add('analogy');a.add('shared');b.add('explanation',2);b.add('sharedExplanation');
 assert.equal(a.receive('b',b.packet({reads:10})),true);a.receive('b',b.packet({reads:10}));
 const snapshot=a.snapshot({reads:5});assert.equal(snapshot.values.reads,15);assert.equal(snapshot.devices,2);assert.equal(estimateCallCost(snapshot.values,150).analogy,0);assert.ok(estimateCallCost(snapshot.values,150).explanation>0);assert.ok(Math.abs(estimateCallCost(snapshot.values,150).speech-.0769395)<1e-9);
 assert.equal(a.receive('bad',{epoch:'x',values:{speechSeconds:-1}}),false);
 a.end();a.add('explanation',100);assert.equal(a.snapshot().values.explanation,2);a.start();assert.equal(a.snapshot().values.explanation,undefined);
});
test('history with saved records draws a graph without the removed free-quota formatter',()=>{
 const el=Object.fromEntries(['Summary','Chart','Recent','Periods'].map(k=>['metricsHistory'+k,{innerHTML:''}]));
 const record={endedAt:Date.now(),tenMinuteCostYen:.01,totalCostYen:.02,durationSeconds:600,participantCount:2};
 const sandbox={el,loadCostHistory:()=>({records:[record,{...record,tenMinuteCostYen:.02}],days:{}}),COST_HISTORY_MAX_RECORDS:20,Date,console};
 const names=['renderMetricsHistory','getWeekKey','getMonthKey','costAverage','costMedian','costMode','roundCostValue','renderHistoryStat','renderCostHistoryChart','renderCostHistoryRow','renderPeriodRow','renderDaySummaryRows','formatYen','formatLocalDateTime','escapeHtml','sumBy'];
 vm.runInNewContext(names.map(fn).join('\n')+'\nrenderMetricsHistory();',sandbox);
 assert.match(el.metricsHistoryChart.innerHTML,/<svg/);assert.match(el.metricsHistoryChart.innerHTML,/<polyline/);assert.match(el.metricsHistoryRecent.innerHTML,/0.020/);
});
test('leave always stops locally when presence or invitation cleanup throws',()=>{
 for(const failed of ['cancel','mark']){let stopped=false;vm.runInNewContext(fn('leaveCall')+'\nleaveCall();',{console:{warn(){}},cancelOutgoingInvitation(){if(failed==='cancel')throw Error('offline')},markLeft(){if(failed==='mark')throw Error('offline')},stopLocalCall(){stopped=true}});assert.equal(stopped,true)}
});

test('microphone, peer and UI cleanup completes even when history or captions throw',()=>{
 let stopped=0,closed=0,updated=0;
 const sandbox={console:{warn(){}},joined:true,metrics:{},currentCostExtras:()=>({}),callCost:{end(){}},localStream:{getTracks:()=>[{stop(){stopped++}}]},rawLocalStream:null,localAudioContext:null,captionController:{sync(){throw Error('caption')}},unsubOutgoingCall:null,outgoingInviteHeartbeatTimer:null,autoReconnectTimers:new Map(),autoReconnectAttempts:new Map(),peers:new Map([['peer',{}]]),realtimeParticipantState:new Map(),el:{mute:{},reconnect:{}},window:{clearTimeout(){},setTimeout(){}},CLEANUP_AUDIT_DELAY_MS:1,markMetricMilestone(){throw Error('history')},closePeer(){closed++},updateJoinButton(){updated++}};
 for(const name of ['clearJoinSlowTimer','clearParticipantNoticeQueue','stopCallSafetyTimers','clearMetricTimers','stopStatsMonitor','stopHeartbeat','stopParticipantSweep','stopLiveWatchers','stopStabilityAudit','clearConnectionStuckTimer','clearNoRemoteAudioTimer','stopSpeakingMonitor','renderParticipants','updateConnectionPill','setCallPhase','setStatus'])sandbox[name]=()=>{};
 sandbox.verifyListenerCleanup=()=>0;
 vm.runInNewContext(fn('stopLocalCall')+'\nstopLocalCall(true);',sandbox);
 assert.ok(stopped>0);assert.equal(closed,1);assert.equal(sandbox.joined,false);assert.equal(sandbox.localStream,null);assert.equal(sandbox.peers.size,0);assert.ok(updated>0);assert.equal(sandbox.el.mute.disabled,true);
});
