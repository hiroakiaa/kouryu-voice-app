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

test('削除などの確認は統一モーダルを使いブラウザ標準confirmを使わない',()=>{
 for(const id of ['phoneConfirmDialog','phoneConfirmTitle','phoneConfirmMessage','phoneConfirmCancel','phoneConfirmOk']) assert.match(html,new RegExp(`id="${id}"`));
 assert.match(app,/function askConfirmation/);
 assert.doesNotMatch(app,/\bconfirm\s*\(/);
});

test('通話終了通知はレイアウト外でフェード表示する',()=>{
 assert.match(html,/\.participants-card \.notice \{[^}]*position:absolute/);
 assert.match(html,/\.notice\.is-visible/);
 assert.match(html,/friendly === "通話が終了しました。" \? 2200 : 3500/);
});

test('ボタン操作でテキスト入力カーソルや文字選択を出さない',()=>{
 assert.match(html,/button,button \*,\[role="button"\],\[role="button"\] \*,summary,summary \* \{[^}]*user-select:none[^}]*caret-color:transparent/);
 assert.match(html,/button,\[role="button"\],summary \{cursor:pointer;touch-action:manipulation/);
});

test('履歴からの再発信は応答なしになっても保存済みの相手名を保持する',()=>{
 assert.match(app,/data-dial-name="\$\{esc\(displayName\)\}"/);
 assert.match(app,/if\(d\.dial\)dial\(d\.dial,d\.dialName\)/);
 assert.match(app,/const targetName=contacts\.find\(c=>c\.number===number\)\?\.name\|\|savedName\|\|formatNumber\(number\)/);
 assert.match(app,/history\(id,\{number,name:targetName,status:r\.status,direction:'outgoing'\}\)/);
});

test('応答なし画面から再発信・登録・履歴へ移動できる',()=>{
 for(const id of ['phoneCallResultDialog','phoneCallResultName','phoneCallResultNumber','phoneCallResultHistory','phoneCallResultRegister','phoneCallResultRedial']) assert.match(html,new RegExp(`id="${id}"`));
 assert.match(app,/function showCallResult/);
 assert.match(app,/showCallResult\('応答なし',targetName,number\)/);
});

test('履歴は最新の電話帳名、番号、個別の詳細を表示する',()=>{
 assert.match(app,/preferredHistoryName\(h,contacts\)/);
 assert.match(app,/history-details/);
 assert.match(app,/h\.entries\.map/);
 assert.match(html,/保存した番号・電話帳・履歴・グループが同じアカウントの端末に同期/);
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
 assert.match(rules,/\['name','number','uid','favorite','reading'\]/);
 assert.match(rules,/favorite is bool/);
});

test('履歴の検索はアイコンから滑らかに開閉し電話帳追加は統一モーダルを使う',()=>{
 for(const id of ['phoneHistoryToolsToggle','phoneHistoryTools','phoneContactAddToggle','phoneContactForm']) assert.match(html,new RegExp(`id="${id}"`));
 assert.match(app,/const setCollapsible=/);
 assert.match(html,/class="phone-list-tools phone-collapsible" inert aria-hidden="true"/);
 assert.match(html,/<dialog id="phoneContactForm" class="number-modal contact-form-dialog"/);
 assert.match(app,/if\(e\.target===\$\('phoneContactForm'\)\)closeContactForm\(\)/);
});

test('履歴は人物アイコンとよく使う3件を表示し登録済みなら登録ボタンを省く',()=>{
 assert.match(html,/id="phoneFrequent"/);
 assert.match(app,/frequentHistoryTargets\(historyItems,contacts\)/);
 assert.match(app,/registered=contacts\.some/);
 assert.match(app,/fa-solid fa-user/);
});

test('電話帳はよみがな対応の行見出しで並べる',()=>{
 assert.match(html,/id="phoneContactReading"/);
 assert.match(app,/groupContacts\(shown\)/);
 assert.match(app,/contact-section/);
 assert.match(rules,/reading is string/);
});

test('履歴操作は登録・削除・電話の順でアイコンを持ち狭い画面では文字を隠す',()=>{
 const register=app.indexOf('fa-address-book'),remove=app.indexOf('fa-trash-can'),dial=app.indexOf('data-dial="${esc(h.number)}"');
 assert.ok(register>=0&&register<remove&&remove<dial);
 assert.match(html,/phone-theme\.css/);
 assert.match(fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8'),/@media\(max-width:540px\)\{\.history-row>button span\{display:none\}/);
});

test('電話帳追加ボタンはphoneHome内の右下固定で、よく使う人物アイコンを拡大する',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(css,/\.phone-home-card\{position:relative/);
 assert.match(css,/\.phone-home-card \.phone-add-fab\{position:absolute;right:18px;bottom:18px/);
 assert.match(app,/addButton\.hidden=id!==\'contacts\'/);
 assert.match(css,/\.frequent-card>i\{font-size:52px\}/);
});

test('公開用の追加ファイルも同一',()=>{
 for(const name of ['index.html','phone-app.js','phone-theme.css','jsQR.js','jsQR.LICENSE']) assert.equal(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'),fs.readFileSync(new URL('../voice-standalone/'+name,import.meta.url),'utf8'),name);
});
