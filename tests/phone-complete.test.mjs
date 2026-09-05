import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../phone-app.js',import.meta.url),'utf8');
const rules=fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');

test('通知・発信確認を設定画面から利用し、廃止した費用設定を表示しない',()=>{
 for(const id of ['phoneNotificationEnable','phoneNotificationTest','phoneNotificationStatus','phoneDialConfirm']) assert.match(html,new RegExp(`id="${id}"`));
 assert.match(app,/showNotification|notifications\.test/);
 for(const id of ['phoneBudgetYen','phoneMonthlyBudget','phoneCloudflareActual','phoneMonthlyStatus']) assert.doesNotMatch(html,new RegExp(`id="${id}"`));
 assert.doesNotMatch(app,/kouryu-monthly-budget-yen-v1|kouryu-cost-budget-yen-v1/);
});

test('説明を普段は隠し必要なときだけ開ける',()=>{
 assert.match(html,/id="defaultModeHelpToggle"/);
 assert.match(html,/id="defaultModeHelpPanel" class="setting-help-panel phone-collapsible" inert aria-hidden="true"/);
 assert.match(app,/setCollapsible\('defaultModeHelpToggle','defaultModeHelpPanel'/);
 assert.doesNotMatch(html,/最後に選んだ種類も次回の初期選択になります/);
});

test('通知説明と空表示を共通デザインで扱う',()=>{
 assert.match(html,/id="notificationHelpToggle"/);
 assert.match(app,/setCollapsible\('notificationHelpToggle','notificationHelpPanel'/);
 assert.match(app,/function emptyState/);
 assert.match(app,/電話帳はまだ空です/);
 assert.match(app,/グループはまだありません/);
});

test('670px以下ではタブ以外のパネルを横スクロールさせない',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(css,/@media\(max-width:670px\)/);
 assert.match(css,/\.phone-home-card \[role="tabpanel"\][^{]*\{[^}]*overflow-x:hidden/);
 assert.match(css,/\.phone-home-card \.phone-tabs\{[^}]*overflow-x:auto/);
});

test('設定のはてなアイコンは狭い画面でも真円を保つ',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(css,/\.phone-help-icon,\.phone-home-card \.account-help-head \.phone-panel-icon\{[^}]*width:40px!important[^}]*height:40px!important[^}]*min-width:40px!important[^}]*aspect-ratio:1\/1[^}]*border-radius:50%!important/);
});

test('設定内のタイトルは同じフォントサイズで表示する',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(css,/#phoneSettingsPanel h2,#phoneSettingsPanel h3\{[^}]*font-size:20px!important[^}]*line-height:1\.35/);
});

test('設定項目のタイトル間には判別できる余白を置く',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(css,/#phoneSettingsPanel>\.account-help-head,#phoneSettingsPanel>\.setting-subtitle-row\{margin-top:32px\}/);
 assert.match(css,/#phoneSettingsPanel>h3\{margin-top:32px!important;margin-bottom:12px!important\}/);
});

test('アプリ名とPWA名はわかる電話に統一する',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
 assert.match(html,/<title>わかる電話<\/title>/);
 assert.match(html,/<h1>わかる電話<\/h1>/);
 assert.equal(manifest.name,'わかる電話');
 assert.equal(manifest.short_name,'わかる電話');
});
test('本文は丸文字にし、タイトルとアプリ名の書体は維持する',()=>{
 assert.match(html,/family=Zen\+Maru\+Gothic:wght@400;500;700/);
 assert.match(html,/body,\s*button,\s*input,\s*select,\s*textarea \{\s*font-family: "Zen Maru Gothic"/);
 assert.match(html,/h1,\s*h2,\s*h3 \{\s*font-family: "FOT-ロダン Pro M"/);
 assert.match(html,/\.brand h1,[\s\S]*?font-family: "Mochiy Pop One"/);
});

test('電話帳検索とグループ作成は必要なときだけ開く',()=>{
 for(const id of ['phoneContactToolsToggle','phoneContactTools','phoneGroupAddToggle','phoneGroupCreateDialog','phoneGroupCreateClose'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(app,/setCollapsible\('phoneContactToolsToggle','phoneContactTools'/);
 assert.match(app,/const openGroupCreate=/);
});

test('グループ作成後にモーダルを連続表示せず一覧の操作状態へ戻す',()=>{
 const create=app.match(/async function createGroup\(\)\{([\s\S]*?)\n function renderInvites/)[1];
 assert.match(create,/close\(\);tab\('groups'\);/);
 assert.match(create,/msg\('グループを作成しました。一覧のカードから開けます。'\)/);
 assert.doesNotMatch(create,/await openGroup/);
 assert.match(app,/phoneContactAddToggle'\)\.focus\?\.\(\)/);
 assert.match(app,/phoneGroupAddToggle'\)\.focus\?\.\(\)/);
});

test('設定の着信音カードは縦方向へ引き伸ばさない',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(css,/#phoneSettingsPanel>\.phone-setting-check\{flex:0 0 auto;min-height:54px\}/);
});

test('空表示から次の操作へ進めて履歴詳細は折りたためる',()=>{
 assert.match(app,/data-empty-add-contact/);
 assert.match(app,/data-empty-add-group/);
 assert.match(app,/data-empty-dial/);
 assert.match(app,/<summary>詳細<\/summary>/);
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

test('電話画面のメッセージは配置を動かさず4秒後に消える',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(app,/messageTimer=setTimeout/);
 assert.match(app,/classList\.remove\('is-visible'\)/);
 assert.match(app,/\},4000\)/);
 assert.match(css,/#phoneMessage\{position:absolute/);
 assert.match(css,/#phoneMessage\.is-visible/);
});

test('ボタン操作でテキスト入力カーソルや文字選択を出さない',()=>{
 assert.match(html,/button,button \*,\[role="button"\],\[role="button"\] \*,summary,summary \* \{[^}]*user-select:none[^}]*caret-color:transparent/);
 assert.match(html,/button,\[role="button"\],summary \{cursor:pointer;touch-action:manipulation/);
});

test('履歴からの再発信は応答なしになっても保存済みの相手名を保持する',()=>{
 assert.match(app,/data-dial-name="\$\{esc\(displayName\)\}"/);
 assert.match(app,/if\(d\.dial\)dial\(d\.dial,d\.dialName,d\.dialMode\|\|null\)/);
 assert.match(app,/const targetName=contacts\.find\(c=>c\.number===number\)\?\.name\|\|savedName\|\|formatNumber\(number\)/);
 assert.match(app,/history\(id,\{number,name:targetName,status:r\.status,direction:'outgoing',supportMode\}\)/);
});

test('応答なし画面から再発信・登録・履歴へ移動できる',()=>{
 for(const id of ['phoneCallResultDialog','phoneCallResultName','phoneCallResultNumber','phoneCallResultHistory','phoneCallResultRegister','phoneCallResultRedial']) assert.match(html,new RegExp(`id="${id}"`));
 assert.match(app,/function showCallResult/);
 assert.match(app,/showCallResult\('応答なし',targetName,number,supportMode\)/);
});

test('履歴は最新の電話帳名、番号、個別の詳細を表示する',()=>{
 assert.match(app,/preferredHistoryName\(h,contacts\)/);
 assert.match(app,/history-details/);
 assert.match(app,/h\.entries\.map/);
 assert.match(html,/番号・電話帳・履歴・グループが引き継がれます/);
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
 assert.match(app,/fa-solid fa-circle-user/);
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

test('グループ画面に不要な説明文を表示しない',()=>{
 assert.doesNotMatch(html,/同じテーマで話す、最大4人の場所です/);
 assert.doesNotMatch(app,/同じテーマで話すグループを作れます/);
});

test('グループ詳細は状態・通話・メンバー・管理操作を分けて表示する',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(html,/class="number-modal group-detail-dialog"/);
 assert.match(html,/class="group-call-status"/);
 assert.match(html,/class="group-dialog-section"><h3><i class="fa-solid fa-phone"/);
 assert.match(html,/class="group-dialog-section"><h3><i class="fa-solid fa-users"/);
 assert.match(html,/class="group-danger-actions"/);
 assert.match(css,/\.group-detail-dialog\{width:min\(570px/);
 assert.match(css,/@media\(max-width:480px\)\{\.group-detail-dialog/);
});

test('グループは招待状態・参加状況・履歴からの再参加を扱う',()=>{
 assert.match(html,/id="groupPendingInvites"/);
 assert.match(html,/id="groupManageToggle"/);
 assert.match(app,/groupOutgoingInvites/);
 assert.match(app,/data-cancel-group-invite/);
 assert.match(app,/この相手には招待済みです/);
 assert.match(app,/activeGroupMembers=new Set/);
 assert.match(app,/data-join-group/);
 assert.match(app,/callType:'group'/);
 assert.match(rules,/request\.resource\.data\.status == 'cancelled'/);
 assert.match(rules,/'groupId','callType','participantCount'/);
});

test('着信応答では元画面を通話画面に見せず通話URLへ確実に移動する',()=>{
 assert.match(app,/function prepareCallNavigation\(\)/);
 assert.doesNotMatch(app,/document\.body\.classList\.remove\('phone-home'\)/);
 assert.match(app,/for\(const id of \['numberIncoming','phoneDialConfirm','phoneCallResultDialog','groupDialog','phoneConfirmDialog'\]\)/);
 assert.match(app,/go\(callId,supportMode,'callee'\)/);
 assert.match(html,/if \(\/\^n_\|\^g_\/\.test\(callId\)\) \{\s*document\.body\.classList\.remove\("phone-home"\)/);
 assert.match(html,/PENDING_CALL_NAVIGATION_KEY/);
 assert.match(html,/sessionStorage\.setItem\(PENDING_CALL_NAVIGATION_KEY/);
 assert.match(html,/window\.location\.assign\(u\.toString\(\)\)/);
 assert.match(html,/params\.get\("call"\) !== pendingNavigation\.callId/);
});

test('発信側はリアルタイム通知が止まっても応答済みルームへ直ちに参加する',()=>{
 assert.match(app,/ringPollTimer=setInterval/);
 assert.match(app,/handleOutgoingState\(\(await read\(requestRef\(uid\)\)\)\.data\(\)\)/);
 assert.match(app,/r\.status==='accepted'&&r\.roomId&&!outgoingNavigating/);
 assert.match(app,/history\(id,\{number,name:activeHistory\.name[\s\S]*?\}\);go\(r\.roomId,supportMode,'caller'\)/);
 assert.match(app,/clearInterval\(ringPollTimer\);ringPollTimer=null/);
});

test('通話終了後は30秒待たずにすぐ再発信できる',()=>{
 assert.doesNotMatch(rules,/resource\.data\.createdAt \+ duration\.value\(30,'s'\) <= request\.time/);
 assert.match(rules,/allow update: if validNumberRequest\(uid\)\s*&& \(resource\.data\.status != 'ringing' \|\| resource\.data\.expiresAt <= request\.time\)/);
 assert.doesNotMatch(app,/連続発信の場合は30秒以上待ってください/);
});

test('発信前に理解サポートありと通話だけを選び、着信・履歴・グループへ引き継ぐ',()=>{
 assert.match(html,/name="phoneSupportMode" value="support"/);
 assert.match(html,/name="phoneSupportMode" value="plain"/);
 assert.match(html,/name="groupSupportMode"/);
 assert.match(app,/supportMode,status:'ringing'/);
 assert.match(app,/1対1・'\+modeLabel\(supportMode\)/);
 assert.match(app,/navigate\(id,selected,role\)/);
 assert.match(rules,/supportMode.*\['support','plain'\]/);
});

test('前回の通話種類を保存し、履歴と再発信で同じ種類を初期選択する',()=>{
 assert.match(html,/name="phoneDefaultMode" value="support"/);
 assert.match(html,/name="phoneDefaultMode" value="plain"/);
 assert.match(app,/kouryu-default-support-mode-v1/);
 assert.match(app,/localStorage\.setItem\(defaultModeKey,supportMode\)/);
 assert.match(app,/data-dial-mode/);
 assert.match(app,/dial\(d\.dial,d\.dialName,d\.dialMode\|\|null\)/);
 assert.match(app,/dialog\.dataset\.mode=mode\(supportMode\)/);
});

test('番号引き継ぎの説明を開閉し、両方の入力後だけ操作を表示する',()=>{
 assert.match(html,/id="accountHelpToggle"/);
 assert.match(html,/id="accountHelpPanel" class="account-help-panel phone-collapsible" inert aria-hidden="true"/);
 assert.match(html,/id="accountActions" class="phone-form-row" hidden/);
 assert.match(html,/この端末の番号を保存する/);
 assert.match(html,/別の端末で使う/);
 assert.match(app,/phoneEmail'\)\.value\.length>0&&\$\('phonePassword'\)\.value\.length>0/);
 assert.match(app,/accountHelpToggle'\)\.onclick/);
});

test('通話中のグループ種類変更を止め、古いURLの異なる種類を拒否する',()=>{
 assert.match(app,/通話中は種類を変更できません/);
 assert.match(app,/lastSeenAt\?\.toMillis/);
 assert.match(app,/mode\(currentRoom\.supportMode\)===mode\(state\(\)\.supportMode\)/);
 assert.match(app,/mode\(g\.supportMode\)===mode\(state\(\)\.supportMode\)/);
});

test('公開用の追加ファイルも同一',()=>{
 for(const name of ['index.html','phone-app.js','phone-theme.css','jsQR.js','jsQR.LICENSE']) assert.equal(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'),fs.readFileSync(new URL('../voice-standalone/'+name,import.meta.url),'utf8'),name);
});

test('着信画面は名前を主役にし、拒否と応答を円形アイコンで見分けられる',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(css,/#numberIncoming #numberCaller\{[^}]*font-size:30px/);
 assert.match(css,/#numberIncoming \.incoming-actions button i\{[^}]*border-radius:50%/);
 assert.match(css,/#numberIncoming #numberDecline i\{background:#d95761\}/);
 assert.match(css,/#numberIncoming #numberAccept i\{background:#60b83d\}/);
});

test('発信確認は名前と電話操作を主役にし、通話種類を控えめなトグルにする',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.doesNotMatch(html,/この相手に電話しますか？/);
 assert.match(html,/class="support-mode-picker dial-mode-toggle"/);
 assert.match(html,/通常電話/);
 assert.match(css,/#phoneDialConfirmName\{[^}]*font-size:32px/);
 assert.match(css,/#phoneDialConfirmCall\{[^}]*min-height:70px/);
 assert.doesNotMatch(html,/id="phoneDialConfirmCancel"/);
 assert.match(html,/id="phoneSupportHelpToggle"[^>]*aria-controls="phoneSupportHelpPanel"/);
 assert.match(css,/\.dial-mode-toggle\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/#phoneDialConfirmCall\{[^}]*background:linear-gradient\(135deg,#efffd3,#dff8bd\)!important/);
 assert.match(css,/\.dial-mode-row\{[^}]*width:min\(280px,100%\)/);
 assert.match(css,/#phoneDialConfirmCall\{[^}]*width:min\(280px,100%\)/);
 assert.match(css,/\.dial-support-help\{[^}]*border-radius:50%!important/);
 assert.match(css,/#phoneDialConfirmCall::after\{[^}]*border:2px dashed/);
 assert.match(css,/\.dial-mode-toggle label\{[^}]*display:flex;align-items:stretch/);
 assert.match(css,/\.dial-mode-toggle span\{[^}]*height:38px;min-height:38px/);
 assert.match(css,/#phoneDialConfirmCall span,#phoneDialConfirmCall i\{[^}]*color:#31582a!important/);
});

test('まとめた履歴カードは含まれる全履歴を削除し、失敗時は表示を戻す',()=>{
 assert.match(app,/async function deleteHistoryCard\(id\)/);
 assert.match(app,/card\?\.entries/);
 assert.match(app,/await Promise\.all\(ids\.map\(historyId=>remove/);
 assert.match(app,/historyItems=before;renderHistory\(\)/);
 assert.match(app,/await deleteHistoryCard\(d\.removeHistory\)/);
});
