import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../phone-theme.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const standaloneCss=readFileSync(new URL('../voice-standalone/phone-theme.css',import.meta.url),'utf8');
const standaloneHtml=readFileSync(new URL('../voice-standalone/index.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');

test('100項目の改善を10分野すべて配布する',()=>{
 for(const range of ['001-010','011-020','021-030','031-040','041-050','051-060','061-070','071-080','081-090','091-100']){
  assert.match(css,new RegExp(range.replace('-','\\-')));
 }
 assert.match(css,/min-height:44px/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/prefers-contrast:more/);
 assert.match(css,/forced-colors:active/);
 assert.match(css,/safe-area-inset-bottom/);
});

test('更新番号と配布ファイルを同期する',()=>{
 assert.match(html,/2026-11-08-quality-30/);
 assert.match(worker,/kouryu-voice-shell-v152/);
 assert.equal(standaloneHtml,html);
 assert.equal(standaloneCss,css);
});
