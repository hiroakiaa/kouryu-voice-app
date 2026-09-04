import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const standaloneHtml = await readFile(new URL("../voice-standalone/index.html", import.meta.url), "utf8");
const firestoreRules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
const turnWorker = await readFile(new URL("../cloudflare-turn-worker/src/index.js", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
const phoneApp = await readFile(new URL("../phone-app.js", import.meta.url), "utf8");

test("アプリのJavaScript構文が有効", () => {
  const scripts = [...rootHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  let source = scripts.at(-1)[1];
  while (/^\s*import/.test(source)) source = source.replace(/^\s*import[\s\S]*?;\s*/, "");
  assert.doesNotThrow(() => new Function(source));
});

test("配布用HTMLは同一", () => {
  assert.equal(standaloneHtml, rootHtml);
});

test("4人制限と5人目の参加前停止がある", () => {
  assert.match(rootHtml, /const MAX_CALL_PARTICIPANTS = 4;/);
  assert.match(rootHtml, /activeOtherParticipants\.length >= MAX_CALL_PARTICIPANTS/);
  assert.match(rootHtml, /参加情報やマイクを開始する前に停止しました/);
});

test("放置と長時間通話の自動退室がある", () => {
  assert.match(rootHtml, /const HIDDEN_AUTO_LEAVE_MS = 2 \* 60 \* 1000;/);
  assert.match(rootHtml, /const MAX_CALL_DURATION_MS = 60 \* 60 \* 1000;/);
  assert.match(rootHtml, /scheduleHiddenAutoLeave\(\)/);
  assert.match(rootHtml, /maxCallDurationTimer = window\.setTimeout/);
});

test("復帰時に音声と参加状態を回復する", () => {
  assert.match(rootHtml, /window\.addEventListener\("pageshow"/);
  assert.match(rootHtml, /navigator\.mediaDevices\.addEventListener\("devicechange"/);
  assert.match(rootHtml, /localAudioContext\.resume\(\)/);
  assert.match(rootHtml, /state\.audio\.play\(\)/);
});

test("終了時にlistener・timer・peer・マイクを停止する", () => {
  for (const required of [
    "stopCallSafetyTimers();",
    "stopHeartbeat();",
    "stopParticipantSweep();",
    "stopLiveWatchers();",
    "Array.from(peers.keys()).forEach(closePeer);",
    "localStream.getTracks().forEach(function(track){try{track.stop()}catch(_){}})"
  ]) assert.ok(rootHtml.includes(required), required);
});

test("表示名を正規化し、改行と制御文字を除去する", () => {
  assert.match(rootHtml, /\.normalize\("NFKC"\)/);
  assert.match(rootHtml, /\.replace\(\/\[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029\]\/g, " "\)/);
  assert.match(rootHtml, /Array\.from\(normalized\)\.slice\(0, 8\)\.join\(""\)/);
});

test("参加・退室メッセージはnoticeに表示する", () => {
  assert.match(rootHtml, /queueParticipantNotice\(name \+ "さんが参加しました。"\)/);
  assert.match(rootHtml, /queueParticipantNotice\(name \+ "さんが退室しました。"\)/);
  assert.match(rootHtml, /participantNoticeQueue\.length > 4/);
  assert.doesNotMatch(rootHtml, /showCallEventNotice\(name \+ "さんが(?:参加|退室)しました。"\)/);
  assert.doesNotMatch(rootHtml, /callEventNotice|call-event-notice|showCallEventNotice|hideCallEventNotice/);
  assert.doesNotMatch(rootHtml, /が参加しています。/);
});

test("参加者表示はセッション競合と監視切断から復帰する", () => {
  assert.match(rootHtml, /let userId = deviceId \+ "-" \+ sessionId\.slice\(-12\)/);
  assert.match(rootHtml, /participantWatcherRetryTimer = window\.setTimeout/);
  assert.match(rootHtml, /const retryDelay = Math\.min\(30000/);
  assert.match(rootHtml, /await markLeft\(\);\s+stopLocalCall\(false\);/);
  assert.match(rootHtml, /markSupersededParticipant\(item, data\)/);
  assert.match(rootHtml, /参加者情報を再接続中です。/);
  assert.match(rootHtml, /参加者情報の接続が戻りました。/);
});

test("無記名参加者を参加順の匿名A・B表示にする", () => {
  assert.match(rootHtml, /assignAnonymousParticipantNames\(allowedParticipants\)/);
  assert.match(rootHtml, /userName: "匿名さん" \+ letter/);
  assert.match(rootHtml, /activeUserName = userName/);
  assert.match(rootHtml, /return '匿<span class="anonymous-letter">'/);
  assert.match(rootHtml, /\.anonymous-letter[\s\S]*font-size: 0\.62em/);
});

test("固定4枠をTransactionで取得・更新・解放する", () => {
  assert.match(rootHtml, /const CALL_SLOT_NAMES = \["A", "B", "C", "D"\]/);
  assert.match(rootHtml, /runTransaction\(db, async function\(transaction\)/);
  assert.match(rootHtml, /async function claimCallSlot/);
  assert.match(rootHtml, /async function refreshCallSlot/);
  assert.match(rootHtml, /async function releaseCallSlot/);
});

test("異常終了整理とバージョン自動表示がある", () => {
  assert.match(rootHtml, /const PARTICIPANT_STALE_MS = 240 \* 1000/);
  assert.match(rootHtml, /api\.github\.com\/repos\/hiroakiaa\/kouryu-voice-app\/commits\/main/);
  assert.match(rootHtml, /applyDeployVersion\(sha\)/);
});

test("匿名Firebase Authentication完了後だけFirestoreを使う", () => {
  assert.match(rootHtml, /getAuth, signInAnonymously/);
  assert.match(rootHtml, /await ensureAnonymousAuth\(\)/);
  assert.match(rootHtml, /authUid: authUser\.uid/);
  assert.match(firestoreRules, /request\.auth != null/);
  assert.match(firestoreRules, /request\.resource\.data\.authUid == request\.auth\.uid/);
});

test("Cloudflare TURN uses short-lived credentials with a STUN fallback", () => {
  assert.match(rootHtml, /stun:stun\.cloudflare\.com:3478/);
  assert.match(rootHtml, /function ensureTurnConfiguration/);
  assert.match(rootHtml, /ensureTurnConfiguration\(\)\.catch/);
  assert.match(turnWorker, /TURN_KEY_API_TOKEN/);
  assert.match(turnWorker, /ttl: 7200/);
  assert.match(turnWorker, /https:\/\/hiroakiaa\.github\.io/);
});

test("料金画面にCloudflare TURNの通話中継量だけを表示する", () => {
  assert.doesNotMatch(rootHtml, /Cloudflare無料枠|月1,000 GB/);
  assert.match(rootHtml, /id="turnUsageStatus"/);
  assert.match(rootHtml, /id="turnUsageBytes"/);
  assert.match(rootHtml, /candidateType === "relay"/);
});

test("callTipsで利用者への請求がないことと通常の通信量を案内する", () => {
  assert.match(rootHtml, /利用者の料金は0円/);
  assert.match(rootHtml, /参加者に請求されることはありません/);
  assert.match(rootHtml, /通常のデータ通信量は使用します/);
});

test("料金推移グラフに軸名と数値目盛りがある", () => {
  assert.match(rootHtml, /縦軸：概算料金（円）／横軸：通話記録（古い→新しい）/);
  assert.match(rootHtml, /chart-axis-label/);
  assert.match(rootHtml, /chart-tick/);
  assert.match(rootHtml, /通話記録（古い → 新しい）/);
});

test("連続操作とTURN認証情報の発行を制限する", () => {
  assert.match(rootHtml, /JOIN_RATE_LIMIT/);
  assert.match(rootHtml, /NEW_CALL_RATE_LIMIT/);
  assert.match(rootHtml, /TURN_DAILY_SAFETY_BYTES/);
  assert.match(turnWorker, /CF-Connecting-IP/);
  assert.match(turnWorker, /rate_limited/);
  assert.match(turnWorker, /TURN_DISABLED/);
});

test("TURN使用量・接続方式・プライバシー説明を記録表示する", () => {
  assert.match(rootHtml, /connectionMethod: turnUsage\.relayActive/);
  assert.match(rootHtml, /turnBytes: Math\.round/);
  assert.match(rootHtml, /接続環境によっては通話を成立させるためCloudflare TURNを経由/);
  assert.match(rootHtml, /data-chart-detail/);
});

test("App Checkと匿名化した障害記録を準備する", () => {
  assert.match(rootHtml, /ReCaptchaEnterpriseProvider/);
  assert.match(rootHtml, /firebase-app-check-site-key/);
  assert.match(rootHtml, /DIAGNOSTIC_LOG_KEY/);
  assert.match(rootHtml, /音声・名前・通話URLは含みません/);
  assert.match(rootHtml, /障害記録をコピー/);
});

test("TURN制限時は一般向けの回線切替案内を表示する", () => {
  assert.match(rootHtml, /中継接続を一時調整/);
  assert.match(rootHtml, /Wi-Fiとモバイル回線を切り替えてから再接続/);
});

test("料金目安は参加端末数を含めた通話全体で計算する", () => {
  assert.match(rootHtml, /10分間の料金試算/);
  assert.match(rootHtml, /function getActiveParticipantCount/);
  assert.match(rootHtml, /costParticipants/);
  assert.match(rootHtml, /participantCountForEstimate/);
});

test("料金履歴の点はホバー・クリック・タップで最新からの位置と縦軸値を表示する", () => {
  assert.match(rootHtml, /pointerover/);
  assert.match(rootHtml, /focusin/);
  assert.match(rootHtml, /最新から.*つ前/);
  assert.match(rootHtml, /縦軸: /);
  assert.match(rootHtml, /chart-dot\.is-selected/);
});

test("電話帳は双方の承認後だけ登録し、発信ごとに新しい通話URLを作る", () => {
  assert.match(rootHtml, /id="contactsBtn"/);
  assert.match(rootHtml, /acceptContactInviteFromUrl/);
  assert.match(rootHtml, /voiceContactInvites/);
  assert.match(rootHtml, /voiceConnections/);
  assert.match(rootHtml, /const nextCallId = createCallId\(\)/);
  assert.match(rootHtml, /CONTACT_INVITE_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(rootHtml, /sanitizeName\(/);
  assert.match(rootHtml, /return getDisplayName\(el\.name\.value\)/);
  assert.match(rootHtml, /showContactsMessage\("登録用URLをコピーしました。相手に送ってください。/);
  assert.match(rootHtml, /setTimeout\(clearContactsMessage, 3500\)/);
  assert.match(rootHtml, /id="confirmContactInviteBtn"/);
  assert.match(rootHtml, /async function confirmContactInvite\(\)/);
  assert.match(rootHtml, /電話帳に登録しますか/);
});

test("電話帳の着信は応答・拒否と90秒の期限を持つ", () => {
  assert.match(rootHtml, /voiceCallInvitations/);
  assert.match(rootHtml, /INCOMING_CALL_TTL_MS = 90 \* 1000/);
  assert.match(rootHtml, /acceptIncomingCall/);
  assert.match(rootHtml, /declineIncomingCall/);
  assert.match(rootHtml, /status: "accepted"/);
  assert.match(rootHtml, /status: "declined"/);
  assert.match(rootHtml, /Notification\.requestPermission\(\)/);
  assert.match(rootHtml, /showSystemIncomingNotification/);
  assert.match(rootHtml, /応答して通話を始める/);
  assert.match(rootHtml, /url\.searchParams\.set\("autoJoin", "1"\)/);
  assert.match(rootHtml, /function maybeAutoJoinCall\(\)/);
  assert.doesNotMatch(rootHtml, /muted = !startedFromPhonebook/);
  assert.match(rootHtml, /マイクはONです。そのまま話せます。/);
  assert.match(rootHtml, /setJoinBusy\(true, "自動参加中"\)/);
  assert.match(rootHtml, /if \(joined && localStream\)/);
  assert.doesNotMatch(rootHtml, /await ensureTurnConfiguration\(\)/);
  assert.doesNotMatch(rootHtml, /callFlowStatus|CallFlowStatus|call-flow-status|showCallFlowStatus/);
  assert.match(rootHtml, /setNotice\(\(data\.calleeName \|\| "相手"\) \+ "さんが応答しました。音声を接続しています。"\)/);
  assert.match(rootHtml, /応答中…/);
  assert.match(rootHtml, /Promise\.race\(\[responseWrite/);
  assert.match(rootHtml, /finally \{\s*navigateToAcceptedCall\(incoming\)/);
});

test("アプリを閉じた後の着信通知を安全なWeb Pushで受け取る", () => {
  assert.match(rootHtml, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(rootHtml, /navigator\.serviceWorker\.register\("\.\/service-worker\.js"/);
  assert.match(rootHtml, /pushManager\.subscribe/);
  assert.match(rootHtml, /authUser\.getIdToken\(\)/);
  assert.match(rootHtml, /\/push\/register/);
  assert.match(rootHtml, /\/push\/notify/);
  assert.match(rootHtml, /ホーム画面に追加/);
  assert.match(rootHtml, /sendClosedAppCallNotification\(contact, nextCallId, invitationRef\.id\)/);
  assert.match(rootHtml, /await Promise\.race\(\[\s*sendClosedAppCallNotification/);
});

test("重複した着信は最新1件だけを残し、拒否時にまとめて終了する", () => {
  assert.match(rootHtml, /ringingCalls\.slice\(1\)\.forEach/);
  assert.match(rootHtml, /status: "superseded"/);
  assert.match(rootHtml, /const callsToDecline = currentRingingCalls\.filter/);
  assert.match(rootHtml, /Promise\.all\(\(callsToDecline\.length \? callsToDecline : \[incoming\]\)/);
});

test("caller liveness cancels stale incoming calls", () => {
  assert.match(rootHtml, /callerActiveUntilMs: now \+ 30000/);
  assert.match(rootHtml, /Number\(item\.callerActiveUntilMs \|\| 0\) > now/);
  assert.match(rootHtml, /function refreshOutgoingInvitation\(invitationId\)/);
  assert.match(rootHtml, /function cancelOutgoingInvitation\(\)/);
  assert.match(rootHtml, /status: "cancelled"/);
  assert.match(rootHtml, /incomingCallExpiryTimer/);
  assert.match(rootHtml, /previousIncomingId !== incoming\.id/);
});

test("電話帳通話を安全に開始・取消・終了し端末内履歴へ残す", () => {
  assert.match(rootHtml, /id="cancelOutgoingBtn"/);
  assert.match(rootHtml, /function stopOutgoingCall\(\)/);
  assert.match(rootHtml, /if \(!navigator\.onLine\)/);
  assert.match(rootHtml, /await authUser\.getIdToken\(\)/);
  assert.match(rootHtml, /function endPhonebookCallAfterRemoteLeave\(name\)/);
  assert.match(rootHtml, /CALL_HISTORY_KEY = "kouryu-voice-call-history-v1"/);
  assert.match(rootHtml, /CALL_HISTORY_MAX_RECORDS = 20/);
  assert.match(rootHtml, /この端末の着信・発信履歴/);
});

test("Cloudflare Workerは同じ着信通知を短時間に再送しない", () => {
  assert.match(turnWorker, /const deliveryKey = "push-sent:" \+ uid \+ ":" \+ invitationId/);
  assert.match(turnWorker, /duplicate: true/);
  assert.match(turnWorker, /expirationTtl: 120/);
});

test("料金履歴は通話種類・1対1かグループか・全機能の内訳を保存する", () => {
  assert.match(rootHtml, /supportMode: ACTIVE_SUPPORT_MODE/);
  assert.match(rootHtml, /callType: callId\.startsWith\("g_"\)/);
  assert.match(rootHtml, /speechCostYen: roundCostValue\(fullCost\.speech\)/);
  assert.match(rootHtml, /今回の全機能/);
  assert.match(rootHtml, /id="currentSupportProof"/);
  assert.match(rootHtml, /AI処理なし：音声認識0秒/);
});

test("着信と発信取消をPush経由で開いている画面へ即時反映する", () => {
  assert.match(serviceWorker, /client\.postMessage\(\{ type: "kouryu-phone-state", action, callerUid \}\)/);
  assert.match(serviceWorker, /if \(action === "cancel"\)/);
  assert.match(turnWorker, /invitationId \+ ":" \+ action/);
  assert.match(turnWorker, /callerUid: uid, action/);
  assert.match(rootHtml, /navigator\.serviceWorker\.addEventListener\("message"/);
  assert.match(phoneApp, /data\.action==='cancel'/);
  assert.match(phoneApp, /Promise\.allSettled\(tasks\)/);
});

test("音声到着前を通話中と表示せずiPhoneは低遅延のマイク経路を使う", () => {
  assert.match(rootHtml, /localStream = isIosDevice\(\) \? rawLocalStream : createCleanAudioStream\(rawLocalStream\)/);
  assert.match(rootHtml, /peer\.ontrack = function\(event\)[\s\S]*?markConnectedOnce\(\)/);
  assert.doesNotMatch(rootHtml, /onconnectionstatechange[\s\S]{0,800}markConnectedOnce\(\)/);
  assert.match(rootHtml, /isPeerConnected\(item\.peer\) && item\.remoteTrackReceived/);
});
