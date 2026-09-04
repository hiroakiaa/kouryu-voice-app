import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDuration,groupHistory,filterPhoneItems,preferredHistoryName} from '../phone-presentation.js';
test('formats call duration',()=>{assert.equal(formatDuration(9),'9秒');assert.equal(formatDuration(125),'2分5秒');});
test('groups consecutive calls and retains their details',()=>{const a=Date.UTC(2026,8,4,3),r=groupHistory([{number:'1',direction:'outgoing',at:a},{number:'1',direction:'outgoing',at:a-1},{number:'2',direction:'incoming',at:a-2}]);assert.equal(r.length,2);assert.equal(r[0].count,2);assert.equal(r[0].entries.length,2);});
test('filters names and formatted numbers',()=>{const items=[{name:'田中さん',number:'12345678'},{name:'母',number:'87654321'}];assert.deepEqual(filterPhoneItems(items,'田中'),[items[0]]);assert.deepEqual(filterPhoneItems(items,'6543'),[items[1]]);assert.equal(filterPhoneItems(items,'').length,2);});
test('uses the latest contact name before the saved history name',()=>{assert.equal(preferredHistoryName({number:'12345678',name:'以前の名前'},[{number:'12345678',name:'新しい名前'}]),'新しい名前');assert.equal(preferredHistoryName({number:'12345678',name:'履歴の名前'},[]),'履歴の名前');});
