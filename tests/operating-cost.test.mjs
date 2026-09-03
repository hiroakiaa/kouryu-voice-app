import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateOperatingCost,createCostEstimator} from '../operating-cost.js';
test('全機能の試算は人数・為替・共有たとえの再利用を反映する',()=>{
 const two=estimateOperatingCost({participants:2,rate:150,mode:'new'}),four=estimateOperatingCost({participants:4,rate:150,mode:'new'});
 assert.ok(Math.abs(two.low-4.08609)<1e-6);assert.ok(Math.abs(four.high-8.40888)<1e-6);
 const reuse=estimateOperatingCost({participants:2,rate:150,mode:'reuse'});assert.ok(Math.abs(two.low-reuse.low-.39)<1e-9);
 const cached=estimateOperatingCost({participants:2,rate:150,mode:'cached'});assert.equal(cached.discovery,0);assert.equal(cached.analogy,0);
 assert.equal(estimateOperatingCost({participants:2,rate:300}).low,two.low*2);
 assert.equal(estimateOperatingCost({participants:1}).turn,0);
});
test('人数と利用条件を変えると情報欄・料金画面・ヒントを同じ試算に更新する',()=>{
 const nodes=new Map();const root={querySelector:key=>{if(!nodes.has(key))nodes.set(key,{value:key==='#costParticipants'?'2':'new',addEventListener(event,fn){this[event]=fn}});return nodes.get(key)}};
 const ui=createCostEstimator(root,()=>150);ui.render();
 assert.equal(nodes.get('#costScenarioTotal').textContent,'4.09円〜4.23円');assert.match(nodes.get('#appInfoCostSummary').textContent,/2人/);
 nodes.get('#costParticipants').value='4';nodes.get('#costParticipants').change();
 assert.equal(nodes.get('#tipsTenMinuteCost').textContent,'7.54円〜8.41円');
 nodes.get('#costScenario').value='cached';nodes.get('#costScenario').change();assert.equal(nodes.get('#cost-analogy').textContent,'0.00円');assert.equal(nodes.get('#cost-discovery').textContent,'0.00円');
});
