import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const standaloneHtml = await readFile(new URL("../voice-standalone/index.html", import.meta.url), "utf8");

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
  assert.match(rootHtml, /setNotice\(name \+ "さんが参加しました。"\)/);
  assert.match(rootHtml, /setNotice\(name \+ "さんが退室しました。"\)/);
  assert.doesNotMatch(rootHtml, /showCallEventNotice\(name \+ "さんが(?:参加|退室)しました。"\)/);
});
