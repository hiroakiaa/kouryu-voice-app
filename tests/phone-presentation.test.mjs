import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDuration,groupHistory} from '../phone-presentation.js';
test('formats call duration',()=>{assert.equal(formatDuration(9),'9秒');assert.equal(formatDuration(125),'2分5秒');});
test('groups consecutive calls',()=>{const a=Date.UTC(2026,8,4,3),r=groupHistory([{number:'1',direction:'outgoing',at:a},{number:'1',direction:'outgoing',at:a-1},{number:'2',direction:'incoming',at:a-2}]);assert.equal(r.length,2);assert.equal(r[0].count,2);});
