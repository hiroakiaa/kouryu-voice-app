import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../phone-app.js',import.meta.url),'utf8');
const rules=fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');

test('通知・月間費用・発信確認を設定画面から利用できる',()=>{
 for(const id of ['phoneNotificationEnable','phoneNotificationTest','phoneNotificationStatus','phoneMonthlyBudget','phoneCloudflareActual','phoneMonthlySave','phoneMonthlyStatus','phoneDialConfirm']) assert.match(html,new RegExp(`id="${id}"`));
 assert.match(app,/showNotification|notifications\.test/);
 assert.match(app,/kouryu-monthly-budget-yen-v1/);
});

test('発信確認は背景だけで画面を塞がず、連続操作でも二重に開かない',()=>{
 assert.match(html,/\.number-modal\.incoming-call\[open\]\s*\{[^}]*display:block/);
 assert.match(app,/if\(!dialog\.open\)dialog\.showModal\(\)/);
});

test('QR読み取りはBarcodeDetector非対応ブラウザでもjsQRを使う',()=>{
 assert.match(html,/jsQR\.js/);
 assert.match(html,/id="phoneQrCanvas"/);
 assert.match(app,/BarcodeDetector/);
 assert.match(app,/window\.jsQR/);
});

test('お気に入りを保存でき、ルールは任意のbooleanだけを許可する',()=>{
 assert.match(app,/data-favorite/);
 assert.match(app,/favorite:!c\?\.favorite/);
 assert.match(rules,/\['name','number','uid','favorite'\]/);
 assert.match(rules,/favorite is bool/);
});

test('公開用の追加ファイルも同一',()=>{
 for(const name of ['index.html','phone-app.js','phone-theme.css','jsQR.js','jsQR.LICENSE']) assert.equal(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'),fs.readFileSync(new URL('../voice-standalone/'+name,import.meta.url),'utf8'),name);
});
