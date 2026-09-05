import test from 'node:test';
import assert from 'node:assert/strict';
import {bindDialDisplay} from '../dial-input.js';

test('番号表示はボタン操作だけで8桁まで更新し4桁で区切る',()=>{
  const output={value:''};
  const edit=bindDialDisplay(output);
  for(const digit of '123456789') edit(digit);
  assert.equal(output.value,'1234 5678');
  edit(null);
  assert.equal(output.value,'1234 567');
});
