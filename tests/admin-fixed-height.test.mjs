import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../metrics-theme.css", import.meta.url), "utf8");
const standaloneCss = fs.readFileSync(new URL("../voice-standalone/metrics-theme.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

for (const source of [css, standaloneCss]) {
  assert.match(source, /#metricsModal>\.metrics-modal-card\{[^}]*height:min\(56rem,calc\(100dvh - 32px\)\)/);
  assert.match(source, /#metricsModal>\.metrics-modal-card\{[^}]*grid-template-rows:auto auto minmax\(0,1fr\)/);
  assert.match(source, /\.admin-main-panel\{[^}]*min-height:0[^}]*overflow:auto/);
}

assert.match(html, /2026-10-08-admin-fixed-height/);
assert.equal(css, standaloneCss);
console.log("admin fixed-height modal contract: ok");
