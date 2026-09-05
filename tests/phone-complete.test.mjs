import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../phone-app.js',import.meta.url),'utf8');
const rules=fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');

test('通知・発信確認を設定画面から利用し、廃止した費用設定を表示しない',()=>{
 for(const id of ['phoneNotificationToggle','phoneNotificationTest','phoneNotificationStatus','phoneDialConfirm']) assert.match(html,new RegExp(`id="${id}"`));
 assert.match(app,/showNotification|notifications\.test/);
 assert.match(app,/notifications\.disable/);
 assert.match(app,/const toggle=event\.currentTarget;toggle\.disabled=true/);
 assert.doesNotMatch(app,/finally\{event\.currentTarget\.disabled=false/);
 assert.match(app,/addEventListener\('click',async event=>[\s\S]*?await fn\(event\)/);
 assert.match(html,/\/push\/unregister/);
 for(const id of ['phoneBudgetYen','phoneMonthlyBudget','phoneCloudflareActual','phoneMonthlyStatus']) assert.doesNotMatch(html,new RegExp(`id="${id}"`));
 assert.doesNotMatch(app,/kouryu-monthly-budget-yen-v1|kouryu-cost-budget-yen-v1/);
});

test('説明を普段は隠し必要なときだけ開ける',()=>{
 assert.match(html,/id="defaultModeHelpToggle"/);
 assert.match(html,/id="defaultModeHelpPanel" class="dial-support-help-panel phone-collapsible" inert aria-hidden="true"/);
 assert.match(app,/setCollapsible\('defaultModeHelpToggle','defaultModeHelpPanel'/);
 assert.match(html,/class="support-mode-picker dial-mode-toggle phone-default-mode"/);
 assert.match(html,/id="groupSupportHelpToggle"[^>]*aria-controls="groupSupportHelpPanel"/);
 assert.match(app,/setCollapsible\('groupSupportHelpToggle','groupSupportHelpPanel'/);
 assert.match(html,/name="groupSupportMode" value="plain"><span><i[^>]*><\/i> 通常通話/);
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

test('QR読み取り後は電話帳追加モーダルを開いて名前入力へ移る',()=>{
 assert.match(app,/function useQrValue[\s\S]*?openContactForm\('name'\)/);
 assert.match(app,/const openContactForm=\(focus='number'\)=>/);
 assert.match(app,/focus==='name'\?'phoneContactName':'phoneContactNumber'/);
});

test('名前入力中のかなをよみがな候補にし手動編集後は上書きしない',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(app,/const readingFromKana=/);
 assert.match(app,/contactName\.addEventListener\('compositionupdate'/);
 assert.match(app,/if\(readingWasEdited\)return/);
 assert.match(css,/\.contact-form-dialog>#phoneAddContact\{[^}]*width:100%;[^}]*min-height:58px;[^}]*font-size:19px/);
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

test('電話帳とグループの追加ボタンは同じ位置で下部タブと重ならない',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(html,/<section id="phoneContactsPanel"[\s\S]*?id="phoneContactAddToggle"[\s\S]*?<\/section>/);
 assert.match(css,/#phoneContactsPanel,#phoneGroupsPanel\{position:relative;padding-bottom:90px!important\}/);
 assert.match(css,/#phoneContactsPanel \.phone-add-fab,#phoneGroupsPanel \.phone-add-fab\{position:absolute;right:14px;bottom:14px\}/);
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
test('グループカードの操作ボタンは常に右端へ寄せる',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(css,/\.group-row>div:first-child\{flex:1 1 auto;min-width:0\}/);
 assert.match(css,/\.group-row-actions\{[^}]*justify-content:flex-end;[^}]*margin-left:auto/);
 assert.doesNotMatch(css,/\.group-row-actions\{width:100%\}/);
 assert.match(css,/\.group-row-actions button:last-child\{[^}]*min-width:108px;[^}]*background:#f4fce9;[^}]*border-color:#a0cd79;[^}]*box-shadow:0 3px 0 #e0edcc/);
});

test('グループの招待操作は必要なときだけ開き、期限切れ招待を表示しない',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(html,/id="groupInviteToggle"[^>]*aria-controls="groupInviteArea"[^>]*aria-expanded="false"/);
 assert.match(html,/id="groupInviteArea" class="group-invite-area phone-collapsible" inert aria-hidden="true"/);
 assert.match(app,/setCollapsible\('groupInviteToggle','groupInviteArea'/);
 assert.match(app,/!d\.expiresAt\|\|d\.expiresAt>now/);
 assert.match(css,/\.group-section-toggle\{[^}]*width:100%;[^}]*min-height:46px/);
});

test('説明は一度に一つだけ開き、参加者とモーダルは狭い画面に収まる',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(app,/const helpPairs=\[/);
 assert.match(app,/for\(const \[otherButtonId,otherPanelId\] of helpPairs\)/);
 assert.match(css,/@media\(max-width:670px\)[\s\S]*?\.group-detail-dialog\{width:calc\(100% - 18px\)/);
 assert.match(css,/body\.is-in-call \.participants-card \.participants\{[^}]*justify-content:flex-start/);
});

test('自分の番号は外側のクリックで閉じ、電話タブは各画面の下に固定する',()=>{
 assert.match(app,/document\.addEventListener\('click',event=>\{if\(\$\('phoneOwnToggle'\)\.getAttribute\('aria-expanded'\)!=='true'\)return;/);
 assert.match(app,/\$\('phoneOwnDetails'\)\.contains\(event\.target\)\|\|\$\('phoneOwnToggle'\)\.contains\(event\.target\)/);
 const settings=html.indexOf('<section id="phoneSettingsPanel"'),tabs=html.indexOf('<nav class="phone-tabs"');
 assert.ok(settings>=0&&tabs>settings);
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(css,/\.phone-home-card>\.phone-tabs\{[^}]*order:3;[^}]*margin-top:auto;[^}]*border-top:/);
 assert.match(css,/\.phone-home-card>\.phone-tabs\{[^}]*padding:9px 2px 4px/);
 assert.match(css,/\.phone-home-card>\[role="tabpanel"\]\{order:1\}/);
 assert.match(css,/@media\(min-width:640px\)\{body\.phone-home \.phone-home-card\{padding-bottom:0\}\.phone-home-card>\.phone-tabs\{padding:9px 2px\}\}/);
});

test('アプリ情報から接続診断と通話品質パネルを廃止する',()=>{
 assert.doesNotMatch(html,/id="diagnosticsToggleBtn"/);
 assert.doesNotMatch(html,/id="diagnosticsPanel"/);
 assert.doesNotMatch(html,/id="callReliabilityPanel"/);
});

test('管理者パスワードの照合後だけ料金詳細を開く',()=>{
 assert.match(html,/id="appInfoTitle"[^>]*>[\s\S]*?管理者メニュー/);
 assert.match(html,/id="adminLoginForm"/);
 assert.match(html,/id="adminPassword" type="password"/);
 assert.doesNotMatch(html,/id="metricsToggleBtn"/);
 assert.match(html,/const ADMIN_PASSWORD_SHA256 = "[a-f0-9]{64}"/);
 assert.doesNotMatch(html,/Wakaru!7284/);
 assert.match(html,/crypto\.subtle\.digest\('SHA-256'/);
 assert.match(html,/hash!==ADMIN_PASSWORD_SHA256/);
 assert.match(html,/hideAppInfoTooltip\(\);openMetricsModal\(\)/);
 assert.match(html,/function openMetricsModal\(\)[\s\S]*?renderMetrics\(\)/);
 assert.match(html,/const ADMIN_ACCESS_KEY = "wakaru-phone-admin-access-v1"/);
 assert.match(html,/localStorage\.setItem\(ADMIN_ACCESS_KEY,ADMIN_PASSWORD_SHA256\)/);
 assert.match(html,/localStorage\.getItem\(ADMIN_ACCESS_KEY\)===ADMIN_PASSWORD_SHA256\)\{openMetricsModal\(\);return;\}/);
});

test('電話番号は直接編集できない表示専用エリアにする',()=>{
 assert.match(html,/<output id="phoneDialNumber"[^>]*aria-live="polite"><\/output>/);
 assert.doesNotMatch(html,/<input id="phoneDialNumber"/);
 assert.match(app,/import \{bindDialDisplay\} from '\.\/dial-input\.js'/);
 assert.match(app,/const editDial=bindDialDisplay\(\$\('phoneDialNumber'\)\)/);
 assert.match(app,/backspace\.addEventListener\('mousedown'/);
 assert.match(app,/if\(e\.button===0\)startBackspaceHold\(\)/);
 assert.match(app,/backspace\.addEventListener\('touchstart',startBackspaceHold/);
 assert.match(app,/window\.addEventListener\('touchend',cancelBackspaceHold\)/);
 assert.match(app,/editDial\.clear\(\)/);
 assert.match(app,/backspaceDidClear/);
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(css,/#phoneDialNumber\{[^}]*cursor:default/);
 assert.match(html,/id="phoneBackspace"[^>]*aria-label="1文字消す。長押しですべて消去"[^>]*>[\s\S]*?<span>長押し<\/span><span>全消去<\/span>/);
 assert.match(css,/#phoneDialForm #phoneBackspace small\{[^}]*flex-direction:column/);
});

test('グループ詳細の共通開閉処理は詳細ボタンから参照できる範囲に置く',()=>{
 const helper=app.indexOf('const setCollapsible='), opener=app.indexOf('async function openGroup(');
 assert.ok(helper>=0&&helper<opener);
 assert.match(app,/if\(d\.openGroup\)await openGroup\(d\.openGroup\)\.catch/);
 assert.match(app,/グループの詳細を開けませんでした/);
});

test('着信応答ではアプリを再読み込みせず同じ画面で通話へ移る',()=>{
 assert.match(app,/function prepareCallNavigation\(\)/);
 assert.match(app,/for\(const id of \['numberIncoming','phoneOutgoingDialog','phoneDialConfirm','phoneCallResultDialog','groupDialog','phoneConfirmDialog'\]\)/);
 assert.match(app,/go\(callId,supportMode,'callee'\)/);
 assert.match(html,/navigate:enterPhoneCallWithoutReload/);
 assert.match(html,/function enterPhoneCallWithoutReload\(id, supportMode, role\)/);
 assert.match(html,/history\.pushState\(\{ callId: nextCallId \}, "", url\)/);
 assert.match(html,/numberCalls\?\.enterCall\(\);[\s\S]*?maybeAutoJoinCall\(\)/);
 const transition=html.slice(html.indexOf('function enterPhoneCallWithoutReload'),html.indexOf('async function ensureAnonymousAuth'));
 assert.doesNotMatch(transition,/location\.assign|location\.href\s*=/);
});

test('着信応答後は初期化中からローディングを表示し参加権限は参加処理内で確認する',()=>{
 assert.match(html,/params\.get\("autoJoin"\) === "1"[\s\S]*?応答を準備中…[\s\S]*?el\.join\.disabled = true/);
 assert.doesNotMatch(html,/numberCalls\.allowed\(\)\)\s*\{?setNotice/);
 assert.match(html,/const waits = automatic \? \[0, 120, 220, 360, 550\] : \[0\]/);
 assert.match(html,/acquired = await numberCalls\.acquire\(\)[\s\S]*?if \(acquired\) break/);
});

test('新しい着信への応答は古い通話中情報の固定待機なしで接続する',()=>{
 assert.doesNotMatch(app,/const retryWaits=\[0,400,800,1200,1800\]/);
 assert.doesNotMatch(app,/前回通話の終了待ち/);
 assert.match(app,/t\.set\(busyRef\(person\),\{callId,until:/);
 assert.match(app,/active:true,expiresAt:/);
 const rules=fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
 assert.match(rules,/leaseFree\(uid\)[\s\S]*?numberInvitations\/\$\(uid\)[\s\S]*?status == 'accepted'/);
});

test('発信側はリアルタイム通知が止まっても応答済みルームへ直ちに参加する',()=>{
 assert.match(app,/ringPollTimer=setInterval/);
 assert.match(app,/handleOutgoingState\(\(await read\(requestRef\(uid\)\)\)\.data\(\)\)/);
 assert.match(app,/r\.status==='accepted'&&r\.roomId&&!outgoingNavigating/);
 assert.match(app,/history\(id,\{number,name:activeHistory\.name[\s\S]*?\}\);go\(r\.roomId,supportMode,'caller'\)/);
 assert.match(app,/clearInterval\(ringPollTimer\);ringPollTimer=null/);
});

test('相手の古いオンライン表示に関係なく着信Pushを毎回送る',()=>{
 const dial=app.slice(app.indexOf('async function dialNow'),app.indexOf('function finishRing'));
 assert.match(dial,/trace\('Push通知送信'[\s\S]*?push\?\.\(to,\{action:'ring'/);
 assert.doesNotMatch(dial,/targetBusy|isLeaseLive/);
});

test('通話終了後は30秒待たずにすぐ再発信できる',()=>{
 assert.doesNotMatch(rules,/resource\.data\.createdAt \+ duration\.value\(30,'s'\) <= request\.time/);
 assert.match(rules,/allow update: if validNumberRequest\(uid\)\s*&& \(resource\.data\.status != 'ringing' \|\| resource\.data\.expiresAt <= request\.time\)/);
 assert.doesNotMatch(app,/連続発信の場合は30秒以上待ってください/);
 assert.match(app,/async function clearPreviousOutgoingRequest\(\)[\s\S]*?status==='ringing'[\s\S]*?status:'cancelled'/);
 assert.match(app,/const id=uid\+'_'\+Date\.now\(\);await clearPreviousOutgoingRequest\(\)/);
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
 assert.match(css,/#numberIncoming \.incoming-actions button\{[^}]*outline:0!important/);
 assert.match(css,/#numberIncoming #numberDecline i\{background:#d95761\}/);
 assert.match(css,/#numberIncoming #numberAccept i\{background:#60b83d\}/);
});

test('発信確認は名前と電話操作を主役にし、通話種類を控えめなトグルにする',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.doesNotMatch(html,/この相手に電話しますか？/);
 assert.match(html,/class="support-mode-picker dial-mode-toggle"/);
 assert.match(html,/通常通話/);
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

test('再着信は前回の通話状態の読み取りを待たずに表示する',()=>{
 const receive=app.slice(app.indexOf('async function receive(items)'),app.indexOf('async function handlePushState'));
 assert.match(receive,/if\(state\(\)\.joined\)/);
 assert.doesNotMatch(receive,/await available/);
 assert.match(receive,/showModal\(\)/);
 assert.match(app,/t\.set\(ref\('numberVoiceCalls',callId\)/);
 assert.doesNotMatch(app,/const selfFree=await available\(t,uid\),otherFree=await available\(t,r\.from\)/);
});

test('相手側の終了時は保存処理より先に終了モーダルを開始する',()=>{
 assert.match(html,/const endedNotice = finishRemoteCallWithNotice[\s\S]*?await Promise\.race\(\[markLeft\(\)/);
 assert.match(app,/const endedNotice=remoteEnded\(remoteName,message\);await leave\(\);await endedNotice/);
});

test('発着信の各段階を匿名で診断し、復帰時に着信を再確認する',()=>{
 assert.match(app,/trace=\(\)=>\{\}/);
 for(const label of ['発信操作','発信データ作成','Push通知送信','Push通知到着','着信データ受信','着信画面表示','応答操作','通話状態初期化']) assert.match(app,new RegExp(label));
 assert.match(app,/const refreshIncoming=async\(\)=>/);
 assert.match(app,/document\.addEventListener\('visibilitychange'/);
 assert.match(app,/window\.addEventListener\('online'/);
 assert.match(app,/activeHistory=null;currentRoom=null;incoming=null;finishRing\(\);stopRingtone\(\)/);
});

test('6種類の着信音を試聴・保存し、実際の着信に使用する',()=>{
 for(const tone of ['gentle','sunny','drop','classic','normal','rotary']) assert.match(html,new RegExp('data-ringtone-preview="'+tone+'"'));
 assert.match(app,/ringtonePatterns=\{\s*gentle:/);
 assert.match(app,/localStorage\.setItem\(ringtoneToneKey,radio\.value\)/);
 assert.match(app,/async function previewRingtone\(key,button\)/);
 assert.match(app,/playRingtonePattern\(ringAudio,selectedRingtone\(\)\)/);
 assert.match(app,/if\(!\$\('phoneRingtone'\)\.checked\|\|ringAudioTimer\)return/);
 for(const title of ['はじまり','青空ホーム','そよかぜ','出発ベル','通常の電話','黒電話']) assert.match(html,new RegExp('<b>'+title+'</b>'));
 assert.match(app,/createBiquadFilter\(\)/);
 assert.match(app,/createDynamicsCompressor\(\)/);
 assert.match(app,/createDelay\(\)/);
 assert.match(app,/ringtonePatterns\[selectedRingtone\(\)\]\?\.loop\|\|2\.4/);
 assert.match(app,/voices:\[\[1,1,'triangle'/);
 assert.match(app,/voices:\[\[1,1,'sine'/);
 assert.match(app,/voices:\[\[1,1,'square'/);
 assert.match(app,/normal:\{kind:'warble'/);
 assert.match(app,/rotary:\{kind:'mechanical'/);
 assert.match(app,/drop:\{kind:'breeze'/);
 assert.match(app,/vibrato\.frequency\.value=\.42/);
 assert.match(app,/airFilter\.frequency\.linearRampToValueAtTime\(3100/);
 assert.match(html,/風が抜ける、のびやかな音/);
 assert.match(app,/lfo\.frequency\.value=pattern\.rate/);
 assert.match(app,/for\(let strike=0;strike<pattern\.strikes;strike\+\+\)/);
 assert.match(app,/createBuffer\(1,Math\.ceil\(context\.sampleRate\*\.025\)/);
 assert.match(app,/motor\.type='sawtooth'/);
 assert.match(app,/\[5\.12,\.06\]/);
 assert.match(html,/昭和のジリリリリーン/);
 assert.match(app,/echo\.delayTime\.value=pattern\.echoDelay/);
 assert.match(app,/for\(let repeat=0;repeat<5;repeat\+\+\)playRingtonePattern/);
 assert.match(app,/context\.suspend\(\)/);
 assert.match(app,/context\.resume\(\)/);
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(css,/\.ringtone-option>button i\{[^}]*transform:translateX\(1px\)/);
 assert.match(css,/\.ringtone-option>button \.fa-pause\{transform:none\}/);
});

test('呼び出し中は取消ボタンを表示し、ページ終了時も相手へ取消を送る',()=>{
 assert.match(html,/id="phoneOutgoingDialog"[^>]*outgoing-call-dialog/);
 assert.match(html,/id="phoneCancel"[^>]*>[\s\S]*?呼び出しをやめる/);
 assert.match(app,/phoneOutgoingDialog'\)\.showModal\(\)/);
 assert.match(app,/bind\('phoneCancel',\(\)=>cancel\(\)\)/);
 assert.match(app,/const cancelOnPageExit=[\s\S]*?if\(outgoing\)[\s\S]*?cancel\(\)/);
 assert.match(app,/window\.addEventListener\('pagehide',cancelOnPageExit\)/);
 assert.match(app,/window\.addEventListener\('beforeunload',cancelOnPageExit\)/);
 assert.match(html,/keepalive: true/);
 assert.match(html,/cachedPushAuthToken \|\| await authUser\.getIdToken\(\)/);
 assert.match(app,/data\.action==='cancel'[\s\S]*?await receive\(\[\]\)/);
});

test('スマホの発信ボタンは縦横同寸の真円を維持する',()=>{
 const css=fs.readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
 assert.match(css,/#phoneDialForm \.phone-dial-actions \.phone-call\{[^}]*inline-size:calc\(var\(--dial-key\) \+ 8px\)!important;[^}]*block-size:calc\(var\(--dial-key\) \+ 8px\)!important;/);
 assert.match(css,/#phoneDialForm \.phone-dial-actions \.phone-call\{[^}]*aspect-ratio:1\/1;[^}]*border-radius:50%!important/);
});

test('通話中の接続表示は3本のバーが滑らかに伸縮する',()=>{
 assert.match(html,/class="signal-wave"[^>]*><i><\/i><i><\/i><i><\/i>/);
 assert.match(html,/@keyframes signal-wave-stretch/);
 assert.match(html,/\.signal-wave > i:nth-child\(3\)/);
 assert.match(html,/@media \(prefers-reduced-motion: reduce\)/);
 assert.match(html,/callPhase === "connected"[\s\S]*?class="signal-wave"/);
});

test('会話中の参加者アンテナも3本が別々に滑らかに伸縮する',()=>{
 assert.match(html,/@keyframes participant-signal-stretch/);
 assert.match(html,/\.participant\.is-speaking \.speaking-bars span \{/);
 assert.match(html,/\.participant\.is-speaking \.speaking-bars span:nth-child\(3\)/);
 assert.match(html,/prefers-reduced-motion: reduce[\s\S]*?\.participant\.is-speaking \.speaking-bars span/);
});

test('応答後はTURN取得と参加準備を並行し自動参加の待機を短くする',()=>{
 assert.match(html,/ensureParticipantWatcher\(\);\s*ensureTurnConfiguration\(\);\s*maybeAutoJoinCall\(\)/);
 assert.match(html,/const turnReady = ensureTurnConfiguration\(\)/);
 assert.match(html,/\[0, 120, 220, 360, 550\]/);
 assert.match(html,/await turnReady;\s*startLiveWatchers\(\)/);
 assert.match(html,/turnAbortController\.abort\(\)[\s\S]*?2500/);
});

test('1対1の応答後は履歴保存と重複した参加枠処理を待たない',()=>{
 assert.match(app,/activeHistory=\{id,startedAt:Date\.now\(\)[\s\S]*?\};history\(id,[\s\S]*?\);go\(callId,supportMode,'callee'\)/);
 assert.doesNotMatch(app,/activeHistory=\{id,startedAt:Date\.now\(\)[\s\S]{0,300}?await history\(/);
 assert.match(app,/existing\.data\(\)\.callId===id\)return true/);
 assert.match(html,/callSlot = callId\.startsWith\("n_"\) \? "" : await claimCallSlot\(\)/);
});
