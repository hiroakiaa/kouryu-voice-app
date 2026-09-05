import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const phone=fs.readFileSync(new URL('../phone-app.js',import.meta.url),'utf8');

test('発信とグループ参加の前に端末チェックを通す',()=>{
  assert.match(phone,/preflight=async\(\)=>\(\{ok:true\}\)/);
  assert.match(phone,/await preflight\(\{reason:'dial'\}\)/);
  assert.match(phone,/await preflight\(\{reason:'group'\}\)/);
  assert.match(html,/preflight:runDevicePreflight/);
});

test('設定から実行できる端末チェックと匿名診断番号を備える',()=>{
  assert.match(html,/id="deviceCheckDialog"/);
  assert.match(html,/マイク・通信・中継・通知/);
  assert.match(html,/DIAGNOSTIC_SESSION_ID/);
  assert.match(html,/diagnosticId: DIAGNOSTIC_SESSION_ID/);
});

test('初回案内と通知の最終配信確認を保存する',()=>{
  assert.match(html,/id="phoneOnboarding"/);
  assert.match(html,/ONBOARDING_KEY/);
  assert.match(html,/NOTIFICATION_VERIFIED_KEY/);
  assert.match(html,/最終確認：/);
});

test('操作要素では入力カーソルを隠し、入力欄では表示する',()=>{
  assert.match(html,/body \{caret-color:transparent;\}/);
  assert.match(html,/input,textarea,\[contenteditable="true"\][^{]*\{[^}]*caret-color:auto!important/);
});
