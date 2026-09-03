import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../captions.js', import.meta.url), 'utf8');
function harness(available = async () => 'available') {
  class Element {
    constructor() { this.children = []; this.events = {}; this.hidden = false; this.textContent = ''; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(name, fn) { this.events[name] = fn; }
    click() { return this.events.click?.(); }
  }
  const nodes = new Map();
  const root = { querySelector: key => { if (!nodes.has(key)) nodes.set(key, new Element()); return nodes.get(key); } };
  const instances = [], sent = [], intervals = new Map(), timeouts = new Map();
  class Recognition {
    static available = available;
    processLocally = false;
    constructor() { instances.push(this); }
    start() { assert.equal(this.processLocally, true); this.started = true; }
    abort() { this.aborted = true; }
  }
  const context = vm.createContext({ Date, Math, console, setInterval: fn => { const id = intervals.size + 1; intervals.set(id,fn); return id; },
    clearInterval: id => intervals.delete(id), setTimeout: fn => { const id = timeouts.size + 1; timeouts.set(id,fn); return id; }, clearTimeout: id => timeouts.delete(id),
    document: { createElement: () => new Element(), createDocumentFragment: () => new Element() } });
  vm.runInContext(source.replaceAll('export ', '') + '\nthis.api = { CaptionBuffer, createCaptions };', context);
  const call = { joined: true, muted: false, userId: 'self' };
  const controller = context.api.createCaptions({ root, getCall: () => call, send: packet => sent.push(packet), speakerName: id => id, Recognition });
  return { ...context.api, controller, call, instances, sent, intervals, timeouts, nodes,
    toggle: () => nodes.get('[data-caption-toggle]').click(), list: nodes.get('[data-caption-list]') };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const packet = (text = 'WebRTCを使います', seq = 1, final = false) => ({ id: 'utterance-1', seq, final, text });

test('字幕は原文のまま更新され、確定後の逆順・重複到着は無視する', () => {
  const { CaptionBuffer } = harness(); let now = 0;
  const buffer = new CaptionBuffer(() => now);
  assert.equal(buffer.put('A', packet()), true);
  assert.equal(buffer.put('A', packet('WebRTCを使います。', 3, true)), true);
  assert.equal(buffer.put('A', packet('古い字幕', 2)), false);
  assert.equal(buffer.rows.length, 1);
  assert.equal(buffer.rows[0].text, 'WebRTCを使います。');
  now = 60000; buffer.prune(); assert.equal(buffer.rows.length, 0);
});
test('4人の同じ発言IDを区別し、受信量と文字数を制限する', () => {
  const { CaptionBuffer } = harness(); const buffer = new CaptionBuffer();
  for (const id of ['A','B','C','D']) buffer.put(id, packet());
  assert.equal(buffer.rows.length, 4);
  assert.equal(buffer.put('A', packet('x'.repeat(601))), false);
  for (let i = 0; i < 150; i++) buffer.put('A', { ...packet(), id: 'new-'+i });
  assert.equal(buffer.rows.length, 80);
  buffer.clear(); assert.equal(buffer.rows.length, 0);
});
test('字幕ONだけで端末内認識を開始し、OFFで認識とタイマーを破棄する', async () => {
  const h = harness(); assert.equal(h.instances.length, 0);
  h.toggle(); await flush();
  const speech = h.instances[0]; assert.equal(speech.started, true);
  const result = [{ transcript: '<img src=x onerror=alert(1)>' }]; result.isFinal = true;
  speech.onresult({ resultIndex: 0, results: [result] });
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].text, '<img src=x onerror=alert(1)>');
  assert.equal(h.list.children[0].children[0].children[1].textContent, h.sent[0].text);
  const late = speech.onresult;
  h.toggle(); late({ resultIndex: 0, results: [result] });
  assert.equal(h.sent.length, 1); assert.equal(speech.aborted, true);
  assert.equal(h.intervals.size, 0); assert.equal(h.timeouts.size, 0);
  assert.equal(h.list.children[0].children.length, 0);
});
test('ミュートで認識を中止し、解除時だけ再開する', async () => {
  const h = harness(); h.toggle(); await flush();
  h.call.muted = true; h.controller.sync(); assert.equal(h.instances[0].aborted, true);
  h.call.muted = false; h.controller.sync(); await flush(); assert.equal(h.instances.length, 2);
  h.call.joined = false; h.controller.sync(); assert.equal(h.instances[1].aborted, true);
  assert.equal(h.intervals.size, 0);
});
test('準備中に退室したら遅い完了通知で認識を開始しない', async () => {
  let resolve;
  const h = harness(() => new Promise(done => { resolve = done; }));
  h.toggle(); h.call.joined = false; h.controller.sync(); resolve('available'); await flush();
  assert.equal(h.instances.length, 0); assert.equal(h.intervals.size, 0);
});
test('日本語認識未対応でも4人分の受信ができ、外部認識へ切り替わらない', async () => {
  const h = harness(async () => 'unavailable'); h.toggle(); await flush();
  assert.equal(h.instances.length, 0);
  for (const id of ['A','B','C','D']) h.controller.receive(id, packet(id,1,true));
  assert.equal(h.list.children[0].children.length, 4);
  h.toggle(); h.controller.receive('A', packet());
  assert.equal(h.list.children[0].children.length, 0);
});
test('公開用字幕モジュールは同一で、永続保存や会話内容のログがない', async () => {
  assert.equal(source, await readFile(new URL('../voice-standalone/captions.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|console\.|fetch\(|setDoc\(/);
});
