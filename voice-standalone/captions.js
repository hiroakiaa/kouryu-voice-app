// Phase 1: ephemeral captions. No storage, logging, fetch, or cloud ASR fallback.
export class CaptionBuffer {
  constructor(now = Date.now) { this.now = now; this.rows = []; }
  prune() { this.rows = this.rows.filter(row => this.now() - row.at < 60000).slice(-80); }
  put(speaker, packet) {
    this.prune();
    if (!packet || typeof packet.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(packet.id) ||
        typeof packet.text !== 'string' || packet.text.length > 600 ||
        !Number.isSafeInteger(packet.seq) || packet.seq < 0 || typeof packet.final !== 'boolean') return false;
    const old = this.rows.find(row => row.speaker === speaker && row.id === packet.id);
    if (old && (old.final || old.seq >= packet.seq)) return false;
    const row = { speaker, id: packet.id, text: packet.text.replace(/[\u0000-\u001f\u007f]/g, ' '),
      seq: packet.seq, final: packet.final, at: old ? old.at : this.now() };
    if (old) Object.assign(old, row); else this.rows.push(row);
    this.prune();
    return true;
  }
  clear() { this.rows = []; }
  removeInterim(speaker) { this.rows = this.rows.filter(row => row.speaker !== speaker || row.final); }
}

export function findFactSpans(text) {
  // Fullwidth digits have a one-to-one index mapping; the displayed original never changes.
  const normalized = text.replace(/[０-９，．：／％]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const patterns = [
    ['電話番号', /(?:\+81[- ]?[1-9]\d{0,3}[- ]\d{1,4}[- ]\d{4}|0\d{1,4}[-ー]\d{1,4}[-ー]\d{3,4})/g],
    ['日付', /(?:\d{4}年)?(?:1[0-2]|0?[1-9])月(?:3[01]|[12]\d|0?[1-9])日|\d{4}[/-](?:1[0-2]|0?[1-9])[/-](?:3[01]|[12]\d|0?[1-9])|(?:今日|明日|明後日|来週|今週|来月|今月)/g],
    ['時刻', /(?:午前|午後)?(?:2[0-3]|[01]?\d)(?:時(?:[0-5]?\d分|半)?|:[0-5]\d)/g],
    ['金額', /[¥￥$＄]\s*\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?(?:万|億|兆)?(?:円|ドル|ユーロ)|[一二三四五六七八九十百千万億兆]+円/g],
    ['数量', /\d[\d,]*(?:\.\d+)?(?:時間|分間|秒間|か月|ヶ月|キログラム|キロメートル|ミリリットル|センチメートル|メートル|リットル|kg|km|cm|mm|mL|ml|人|個|件|回|台|枚|本|冊|名|歳|％|%)/g],
    ['期限', /本日中|今日中|明日まで|今週中|来週まで|月末まで|締め切り|締切|期限/g]
  ];
  const candidates = [];
  for (const [kind, regex] of patterns) for (const match of normalized.matchAll(regex)) {
    // Do not highlight a suffix cut out of a longer number/identifier.
    if (/\d/.test(match[0][0]) && /[\dA-Za-z]/.test(normalized[match.index - 1] || '')) continue;
    candidates.push({ start: match.index, end: match.index + match[0].length, kind });
  }
  const selected = [];
  candidates.sort((a,b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  for (const span of candidates) {
    if (!selected.length || span.start >= selected.at(-1).end) selected.push(span);
  }
  return selected;
}

export function createCaptions({ root, getCall, send, speakerName, features = { facts: true }, Recognition = window.SpeechRecognition || window.webkitSpeechRecognition }) {
  const button = root.querySelector('[data-caption-toggle]');
  const status = root.querySelector('[data-caption-status]');
  const list = root.querySelector('[data-caption-list]');
  const prepare = root.querySelector('[data-caption-prepare]');
  const factsToggle = root.querySelector('[data-caption-facts]');
  let factsEnabled = !!features.facts;
  if (factsToggle) { factsToggle.checked = factsEnabled; factsToggle.disabled = !features.facts; }
  const buffer = new CaptionBuffer();
  let enabled = false, recognizer = null, generation = 0, timer = null, retry = null;
  let busy = false, errors = 0, runId = 0, seq = 0, lastInterim = 0, suspended = false, runTimer = null;
  const instance = Math.random().toString(36).slice(2, 12);
  const setStatus = text => { status.textContent = text; };
  function render() {
    buffer.prune();
    const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const fragment = document.createDocumentFragment();
    for (const row of buffer.rows) {
      const line = document.createElement('p');
      line.className = row.final ? 'caption-line' : 'caption-line is-interim';
      const name = document.createElement('span');
      name.className = 'caption-speaker';
      name.textContent = speakerName(row.speaker) + (row.final ? '' : '（認識中）');
      const words = document.createElement('span');
      const spans = factsEnabled ? findFactSpans(row.text) : [];
      if (!spans.length) words.textContent = row.text;
      else {
        let cursor = 0;
        for (const span of spans) {
          const plain = document.createElement('span'); plain.textContent = row.text.slice(cursor, span.start); words.append(plain);
          const marked = document.createElement('mark'); marked.className = 'caption-fact'; marked.title = span.kind;
          marked.textContent = row.text.slice(span.start, span.end); words.append(marked); cursor = span.end;
        }
        const tail = document.createElement('span'); tail.textContent = row.text.slice(cursor); words.append(tail);
      }
      line.append(name, words); fragment.append(line);
    }
    list.replaceChildren(fragment);
    if (stick) list.scrollTop = list.scrollHeight;
  }
  function stopRecognition() {
    generation++;
    busy = false;
    clearTimeout(retry); retry = null;
    clearTimeout(runTimer); runTimer = null;
    if (recognizer) {
      const old = recognizer; recognizer = null;
      old.onresult = old.onend = old.onerror = null;
      try { old.abort(); } catch (_) { /* audio call remains independent */ }
    }
    buffer.removeInterim(getCall().userId);
  }
  function disable() {
    enabled = false; suspended = false; stopRecognition();
    clearInterval(timer); timer = null;
    buffer.clear(); render();
    list.hidden = true; prepare.hidden = true;
    button.textContent = '字幕をON'; button.setAttribute('aria-pressed', 'false');
    setStatus('自分の発言を字幕にして通話相手へ共有します。字幕は60秒で消え、保存しません。');
  }
  function fail(text) {
    stopRecognition(); suspended = true;
    setStatus(text + ' 相手から届く字幕は表示できます。');
  }
  async function startRecognition() {
    const call = getCall();
    if (!enabled || !call.joined || call.muted || busy || recognizer || suspended) return;
    const token = ++generation;
    busy = true;
    try {
      if (!Recognition || typeof Recognition.available !== 'function') {
        fail('このブラウザーは端末内の日本語音声認識に未対応です。'); return;
      }
      const available = await Recognition.available({ langs: ['ja-JP'], processLocally: true });
      if (token !== generation || !enabled) return;
      if (available !== 'available') {
        busy = false;
        prepare.hidden = available !== 'downloadable';
        suspended = true;
        setStatus(available === 'downloadable' ? '自分の字幕には日本語音声認識のダウンロードが必要です。' : 'この端末では日本語音声認識をまだ利用できません。相手の字幕は表示できます。');
        return;
      }
      const speech = new Recognition();
      if (!('processLocally' in speech)) { fail('端末内音声認識を利用できません。'); return; }
      speech.processLocally = true;
      speech.lang = 'ja-JP'; speech.continuous = true; speech.interimResults = true;
      recognizer = speech; busy = false;
      const prefix = instance + '-' + (++runId) + '-';
      speech.onresult = event => {
        const live = getCall();
        if (token !== generation || !enabled || !live.joined || live.muted) return;
        errors = 0;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = String(result[0]?.transcript || '').trim().slice(0, 600);
          if (!text) continue;
          const packet = { type: 'caption', id: prefix + i, seq: ++seq, final: !!result.isFinal, text };
          buffer.put(live.userId, packet);
          // Interim updates are disposable; final results always get a send attempt.
          if (packet.final || Date.now() - lastInterim >= 300) {
            lastInterim = Date.now();
            try { send(packet); } catch (_) { /* never affect audio */ }
          }
        }
        render();
      };
      speech.onerror = event => {
        if (token !== generation) return;
        if (event.error === 'no-speech') return;
        fail(event.error === 'not-allowed' ? '字幕用のマイクを利用できませんでした。字幕をOFFにしてから再度ONにできます。' : '自分の字幕を停止しました。字幕をOFFにしてから再度ONにできます。');
        render();
      };
      speech.onend = () => {
        if (token !== generation) return;
        clearTimeout(runTimer); runTimer = null;
        recognizer = null;
        buffer.removeInterim(getCall().userId); render();
        if (++errors > 3) { fail('音声認識が続かなかったため、自分の字幕を停止しました。'); return; }
        retry = setTimeout(() => { retry = null; void startRecognition(); }, 750 * errors);
      };
      speech.start();
      // Bound the recognition engine's result list as well as our own buffer.
      runTimer = setTimeout(() => {
        if (token !== generation) return;
        stopRecognition(); errors = 0; render(); void startRecognition();
      }, 30000);
      setStatus('自分の発言を端末内で字幕にして共有中です。発言者も字幕をONにしてください。');
    } catch (_) {
      if (token === generation) fail('自分の字幕を開始できませんでした。');
    }
  }
  function sync() {
    const call = getCall();
    button.disabled = !call.joined;
    if (!call.joined) { disable(); return; }
    if (!enabled) return;
    if (call.muted) {
      stopRecognition(); render();
      setStatus('マイクOFF中は自分の音声認識を停止します。相手の字幕は表示できます。');
    } else { void startRecognition(); }
  }
  button.addEventListener('click', () => {
    if (enabled) { disable(); return; }
    if (!getCall().joined) return;
    enabled = true; suspended = false; errors = 0;
    list.hidden = false;
    button.textContent = '字幕をOFF'; button.setAttribute('aria-pressed', 'true');
    timer = setInterval(render, 1000);
    sync();
  });
  factsToggle?.addEventListener('change', () => { factsEnabled = !!features.facts && factsToggle.checked; render(); });
  prepare.addEventListener('click', async () => {
    if (!enabled || !Recognition || typeof Recognition.install !== 'function') return;
    prepare.disabled = true;
    const token = generation;
    setStatus('日本語音声認識を準備しています…');
    try {
      const ok = await Recognition.install({ langs: ['ja-JP'], processLocally: true });
      if (token !== generation || !enabled) return;
      prepare.hidden = !!ok; suspended = !ok;
      if (ok) sync(); else setStatus('準備できませんでした。相手の字幕は表示できます。');
    } catch (_) {
      if (token === generation && enabled) setStatus('準備できませんでした。相手の字幕は表示できます。');
    } finally { prepare.disabled = false; }
  });
  sync();
  return {
    sync, stop: disable,
    receive(speaker, packet) {
      if (!enabled || !getCall().joined) return;
      if (buffer.put(speaker, packet)) render();
    },
    removePeer(speaker) { buffer.removeInterim(speaker); render(); }
  };
}
