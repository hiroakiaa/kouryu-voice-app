import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const standaloneHtml = await readFile(new URL("../voice-standalone/index.html", import.meta.url), "utf8");
const firestoreRules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
const turnWorker = await readFile(new URL("../cloudflare-turn-worker/src/index.js", import.meta.url), "utf8");

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
    "localStream.getTracks().forEach(function(track) { track.stop(); })"
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
  assert.match(rootHtml, /const userId = deviceId \+ "-" \+ sessionId\.slice\(-12\)/);
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
  assert.match(rootHtml, /await ensureTurnConfiguration\(\)/);
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
  assert.match(rootHtml, /参加端末数を含めた通話全体/);
  assert.match(rootHtml, /function getActiveParticipantCount/);
  assert.match(rootHtml, /tenMinuteReads \* participantCount/);
  assert.match(rootHtml, /participantCountForEstimate/);
});

test("料金履歴の点はホバー・クリック・タップで最新からの位置と縦軸値を表示する", () => {
  assert.match(rootHtml, /pointerover/);
  assert.match(rootHtml, /focusin/);
  assert.match(rootHtml, /最新から.*つ前/);
  assert.match(rootHtml, /縦軸: /);
  assert.match(rootHtml, /chart-dot\.is-selected/);
});
