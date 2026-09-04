import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateOperatingCost,createCostEstimator,projectCallCost} from '../operating-cost.js';
test('全機能の試算は人数・為替・共有たとえの再利用を反映する',()=>{
 const two=estimateOperatingCost({participants:2,rate:150,mode:'new'}),four=estimateOperatingCost({participants:4,rate:150,mode:'new'});
 assert.ok(Math.abs(two.low-1.3608765)<1e-6);assert.ok(Math.abs(four.high-2.3787555)<1e-6);
 const reuse=estimateOperatingCost({participants:2,rate:150,mode:'reuse'});assert.ok(Math.abs(two.low-reuse.low-.078)<1e-9);
 const cached=estimateOperatingCost({participants:2,rate:150,mode:'cached'});assert.equal(cached.discovery,0);assert.equal(cached.analogy,0);
 assert.equal(estimateOperatingCost({participants:2,rate:300}).low,two.low*2);
 assert.equal(estimateOperatingCost({participants:1}).turn,0);
});
test('人数と利用条件を変えると料金画面・ヒントを同じ試算に更新する',()=>{
 const nodes=new Map();const root={querySelector:key=>{if(!nodes.has(key))nodes.set(key,{value:key==='#costParticipants'?'2':'new',addEventListener(event,fn){this[event]=fn}});return nodes.get(key)}};
 const ui=createCostEstimator(root,()=>150);ui.render();
 assert.equal(nodes.get('#costScenarioTotal').textContent,'1.36円〜1.50円');assert.equal(nodes.has('#appInfoCostSummary'),false);
 nodes.get('#costParticipants').value='4';nodes.get('#costParticipants').change();
 assert.equal(nodes.get('#tipsTenMinuteCost').textContent,'1.51円〜2.38円');
 nodes.get('#costScenario').value='cached';nodes.get('#costScenario').change();assert.equal(nodes.get('#cost-analogy').textContent,'0.00円');assert.equal(nodes.get('#cost-discovery').textContent,'0.00円');
});

test('10分予測は利用量・再利用を反映し開始30秒未満では表示しない',()=>{
 const snapshot={started:1,seconds:60,devices:2,values:{speechSeconds:60,analogy:1,shared:0}};
 assert.equal(projectCallCost({...snapshot,seconds:29},150),null);
 const a=projectCallCost(snapshot,150);assert.ok(Math.abs(a.analogy-.39)<1e-9);
 snapshot.values.shared=1;assert.equal(projectCallCost(snapshot,150).analogy,0);
 snapshot.values.explanation=1;assert.ok(projectCallCost(snapshot,150).explanation>0);
 assert.equal(projectCallCost({...snapshot,seconds:120},150).speech,a.speech/2);
 const nodes=new Map();const root={querySelector:k=>{if(!nodes.has(k))nodes.set(k,{value:k==='#costParticipants'?'2':'new',addEventListener(){}});return nodes.get(k)}};
 const ui=createCostEstimator(root,()=>150,()=>snapshot);ui.render();const before=nodes.get('#costLiveTotal').textContent;snapshot.values.discovery=1;ui.render();assert.notEqual(nodes.get('#costLiveTotal').textContent,before);assert.match(nodes.get('#costLiveConditions').textContent,/60秒間/);
});

