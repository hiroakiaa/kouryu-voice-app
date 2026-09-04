import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDuration,groupHistory,filterPhoneItems} from '../phone-presentation.js';
test('formats call duration',()=>{assert.equal(formatDuration(9),'9秒');assert.equal(formatDuration(125),'2分5秒');});
test('groups consecutive calls',()=>{const a=Date.UTC(2026,8,4,3),r=groupHistory([{number:'1',direction:'outgoing',at:a},{number:'1',direction:'outgoing',at:a-1},{number:'2',direction:'incoming',at:a-2}]);assert.equal(r.length,2);assert.equal(r[0].count,2);});
test('filters names and formatted numbers',()=>{const items=[{name:'田中さん',number:'12345678'},{name:'母',number:'87654321'}];assert.deepEqual(filterPhoneItems(items,'田中'),[items[0]]);assert.deepEqual(filterPhoneItems(items,'6543'),[items[1]]);assert.equal(filterPhoneItems(items,'').length,2);});
