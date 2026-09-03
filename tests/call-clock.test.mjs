import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fn=name=>html.match(new RegExp('    function '+name+'\\([^]*?\\n    }'))[0];
test('clock starts only on first peer connection, advances and resets on leaving',()=>{
 let now=100000;const clock={textContent:''};
 const s={document:{getElementById:()=>clock},joined:true,metrics:{connectedAt:0},Date:{now:()=>now}};
 for(const name of ['recordConnectionStep','setCallPhase','pushDiagnostic','startStatsMonitor','markMetricMilestone','scheduleMetricMilestones'])s[name]=()=>{};
 vm.runInNewContext(fn('renderCallElapsed')+'\n'+fn('markConnectedOnce'),s);
 s.renderCallElapsed();assert.equal(clock.textContent,'接続待ち');now+=60000;s.renderCallElapsed();assert.equal(clock.textContent,'接続待ち');
 s.markConnectedOnce();assert.equal(clock.textContent,'00:00');now+=65000;s.renderCallElapsed();assert.equal(clock.textContent,'01:05');
 s.markConnectedOnce();assert.equal(s.metrics.connectedAt,160000);
 now+=3600000;s.renderCallElapsed();assert.equal(clock.textContent,'61:05');
 s.joined=false;s.renderCallElapsed();assert.equal(clock.textContent,'接続待ち');
 s.metrics.connectedAt=0;s.joined=true;s.renderCallElapsed();assert.equal(clock.textContent,'接続待ち');
});
