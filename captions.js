// Ephemeral caption UI. Recognition is injected; conversation data is never persisted.
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

const TERM_DICTIONARY = [
  'ICE Candidate', 'NAT Traversal', 'WebRTC', 'TURN', 'STUN', 'OAuth', 'OpenID Connect', 'API', 'SDK', 'HTTP', 'HTTPS', 'DNS', 'IPアドレス',
  'TCP', 'UDP', 'TLS', 'VPN', 'LAN', 'NAT', 'ICE', 'P2P', 'SFU', 'SVG', 'RSS', 'WebSocket', 'WebTransport', 'Webhook', 'Firestore', 'Firebase',
  'クラウド', 'シグナリング', 'エンドツーエンド暗号化', 'トランザクション', 'キャッシュ', 'データベース', 'アルゴリズム', '機械学習', '生成AI', 'LLM',
  '内生性', '外生性', '操作変数法', '限界効用', '機会費用', '需要曲線', '供給曲線', '回帰分析', '相関係数', '因果推論', '標準偏差', '有意水準', '帰無仮説',
  '契約不適合責任', '善管注意義務', '債務不履行', '損害賠償', '瑕疵担保責任', '成年後見制度', 'インボイス制度', '著作権', '個人情報保護法',
  'GDP', 'CPI', 'NISA', 'ETF', '投資信託', '複利', '分散投資', '減価償却', '流動資産', '損益計算書', '貸借対照表', '稟議', '決裁',
  'HbA1c', 'MRI', 'CT', '高血圧', '糖尿病', '抗体', '抗原', '炎症', 'インフォームドコンセント', 'インフィールドフライ', 'オフサイド'
];
const termRegex = new RegExp(TERM_DICTIONARY.slice().sort((a,b) => b.length-a.length)
  .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ 　]+')).join('|'), 'gi');

export function findTermSpans(text, limit = 4) {
  const selected = [], seen = new Set();
  for (const match of text.matchAll(termRegex)) {
    const start = match.index, end = start + match[0].length;
    if (/[A-Za-z0-9]/.test(match[0][0]) && /[A-Za-z0-9_]/.test(text[start-1] || '')) continue;
    if (/[A-Za-z0-9]/.test(match[0].at(-1)) && /[A-Za-z0-9_]/.test(text[end] || '')) continue;
    const key = match[0].toLowerCase().replace(/[ 　]+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key); selected.push({start,end,kind:'用語候補'});
    if (selected.length >= limit) break;
  }
  return selected;
}

export function createCaptions({ root, getCall, send, speakerName, getExplanation, features = { facts: true, replay: true, terms: true }, recognitionMode = 'local', Recognition = window.SpeechRecognition || window.webkitSpeechRecognition }) {
  const serverRecognition = recognitionMode === 'server';
  const button = root.querySelector('[data-caption-toggle]');
  const status = root.querySelector('[data-caption-status]');
  const list = root.querySelector('[data-caption-list]');
  const prepare = root.querySelector('[data-caption-prepare]');
  const factsToggle = root.querySelector('[data-caption-facts]');
  const replayButton = root.querySelector('[data-caption-replay-button]');
  const replayPanel = root.querySelector('[data-caption-replay-panel]');
  const replayList = root.querySelector('[data-caption-replay-list]');
  const replayClose = root.querySelector('[data-caption-replay-close]');
  const termsToggle = root.querySelector('[data-caption-terms]');
  const termPanel = root.querySelector('[data-caption-term-panel]');
  const termTitle = root.querySelector('[data-caption-term-title]');
  const termContext = root.querySelector('[data-caption-term-context]');
  const termClose = root.querySelector('[data-caption-term-close]');
  const explanationPanel = root.querySelector('[data-caption-explanation-panel]');
  const explanationText = root.querySelector('[data-caption-explanation]');
  const explanationRetry = root.querySelector('[data-caption-explanation-retry]');
  let explanationRequest = null, explanationGeneration = 0, explanationTimer = null;
  function clearExplanation() {
    explanationGeneration++; explanationRequest?.abort(); explanationRequest = null;
    clearTimeout(explanationTimer); explanationTimer = null;
    if(explanationText)explanationText.textContent='';
    if(explanationPanel)explanationPanel.hidden=true;
    if(explanationRetry)explanationRetry.hidden=true;
  }
  async function explainSelected() {
    clearExplanation();
    if(!features.explanations||!getExplanation||!selectedTerm||!explanationText)return;
    const row=buffer.rows.find(r=>r.speaker===selectedTerm.speaker&&r.id===selectedTerm.id);
    if(!row)return;
    const term=row.text.slice(selectedTerm.start,selectedTerm.end), token=explanationGeneration;
    explanationPanel.hidden=false;explanationText.textContent='意味を確認しています…';
    explanationRequest=new AbortController();
    explanationTimer=setTimeout(()=>explanationRequest?.abort(),15000);
    try{
      const text=await getExplanation(term,{signal:explanationRequest.signal});
      if(token!==explanationGeneration||!enabled||!selectedTerm)return;
      explanationText.textContent=text;
    }catch(_){
      if(token!==explanationGeneration||!enabled)return;
      explanationText.textContent='解説を取得できませんでした。';if(explanationRetry)explanationRetry.hidden=false;
    }finally{if(token===explanationGeneration){clearTimeout(explanationTimer);explanationTimer=null;explanationRequest=null}}
  }
  explanationRetry?.addEventListener('click',()=>{void explainSelected()});
  let selectedTerm = null, termsEnabled = !!features.terms, lastSignature = '';
  const annotationCache = new WeakMap();
  if (termsToggle) { termsToggle.checked = termsEnabled; termsToggle.disabled = !features.terms; }
  let replayKeys = null;
  if (replayButton) { replayButton.hidden = !features.replay; replayButton.disabled = true; }
  let factsEnabled = !!features.facts;
  if (factsToggle) { factsToggle.checked = factsEnabled; factsToggle.disabled = !features.facts; }
  const buffer = new CaptionBuffer();
  let enabled = false, recognizer = null, generation = 0, timer = null, retry = null;
  let busy = false, errors = 0, runId = 0, seq = 0, lastInterim = 0, suspended = false, runTimer = null;
  const instance = Math.random().toString(36).slice(2, 12);
  const setStatus = text => { status.textContent = text; };
  let scrollFrame = null;
  function followLatest() {
    const scroll = () => {
      scrollFrame = null;
      if (!enabled || list.hidden) return;
      const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (list.scrollTo) list.scrollTo({ top: list.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
      else list.scrollTop = list.scrollHeight;
    };
    if (typeof requestAnimationFrame === 'function') {
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(scroll);
    } else scroll();
  }
  const sizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(followLatest) : null;
  function annotations(row) {
    let cached = row.final && annotationCache.get(row);
    if (!cached) {
      const facts = features.facts ? findFactSpans(row.text) : [];
      const terms = features.terms && row.final ? findTermSpans(row.text).filter(t => !facts.some(f => t.start < f.end && t.end > f.start)) : [];
      cached = {facts,terms}; if (row.final) annotationCache.set(row,cached);
    }
    return [...(factsEnabled ? cached.facts : []), ...(termsEnabled ? cached.terms : [])].sort((a,b) => a.start-b.start);
  }
  function showPanel(panel, visible) {
    panel.hidden = !visible;
    if (visible && !panel.open) panel.showModal?.();
    if (!visible && panel.open) panel.close?.();
  }
  function renderTerm() {
    if (!termPanel || !termTitle || !termContext) return;
    const row = selectedTerm && buffer.rows.find(r => r.text && r.speaker === selectedTerm.speaker && r.id === selectedTerm.id);
    if (!row) { selectedTerm = null; clearExplanation(); }
    termTitle.textContent = row ? row.text.slice(selectedTerm.start,selectedTerm.end) : '';
    termContext.textContent = row ? row.text : '';
    showPanel(termPanel, !!row);
  }
  function render() {
    buffer.prune();
    const signature = JSON.stringify([factsEnabled, termsEnabled, buffer.rows.map(r => [r.speaker,r.id,r.seq,r.final,speakerName(r.speaker)])]);
    if (signature === lastSignature) { renderReplay(); renderTerm(); return; }
    lastSignature = signature;
    const fragment = document.createDocumentFragment();
    for (const row of buffer.rows) {
      if (!row.text) continue;
      const line = document.createElement('p');
      line.className = row.final ? 'caption-line' : 'caption-line is-interim';
      const name = document.createElement('span');
      name.className = 'caption-speaker';
      name.textContent = speakerName(row.speaker) + (row.final ? '' : '（認識中）');
      const words = document.createElement('span');
      let spans = [];
      try { spans = annotations(row); } catch (_) { /* display the original on detection failure */ }
      if (!spans.length) words.textContent = row.text;
      else {
        let cursor = 0;
        for (const span of spans) {
          const plain = document.createElement('span'); plain.textContent = row.text.slice(cursor, span.start); words.append(plain);
          const isTerm = span.kind === '用語候補';
          const marked = document.createElement(isTerm ? 'button' : 'mark');
          marked.className = isTerm ? 'caption-term' : 'caption-fact'; marked.title = span.kind;
          if (isTerm) {
            marked.type = 'button'; marked.setAttribute('aria-label', '用語候補：' + row.text.slice(span.start,span.end));
            marked.setAttribute('aria-controls','captionTermCard');
            marked.addEventListener('click', () => {
              selectedTerm = {speaker:row.speaker,id:row.id,start:span.start,end:span.end};
              closeReplay(); renderTerm(); termClose?.focus?.();
              void explainSelected();
            });
          }
          marked.textContent = row.text.slice(span.start, span.end); words.append(marked); cursor = span.end;
        }
        const tail = document.createElement('span'); tail.textContent = row.text.slice(cursor); words.append(tail);
      }
      line.append(name, words); fragment.append(line);
    }
    list.replaceChildren(fragment);
    followLatest();
    renderReplay();
    renderTerm();
  }
  function renderReplay() {
    if (!replayPanel || !replayList) return;
    showPanel(replayPanel, !!replayKeys);
    if (!replayKeys) { replayList.replaceChildren(); return; }
    const fragment = document.createDocumentFragment();
    const rows = buffer.rows.filter(row => row.final && row.text && replayKeys.has(JSON.stringify([row.speaker, row.id])));
    for (const row of rows) {
      const line = document.createElement('p'); line.className = 'caption-line';
      const name = document.createElement('span'); name.className = 'caption-speaker'; name.textContent = speakerName(row.speaker);
      const words = document.createElement('span'); words.textContent = row.text;
      line.append(name, words); fragment.append(line);
    }
    if (!rows.length) { const empty = document.createElement('p'); empty.textContent = '直近60秒の確定字幕はありません。'; fragment.append(empty); }
    replayList.replaceChildren(fragment);
  }
  function closeReplay() {
    replayKeys = null;
    replayButton?.setAttribute('aria-expanded', 'false'); renderReplay();
  }
  function stopRecognition() {
    generation++;
    busy = false;
    clearTimeout(retry); retry = null;
    clearTimeout(runTimer); runTimer = null;
    if (recognizer) {
      const old = recognizer; recognizer = null;
      old.onresult = old.onend = old.onerror = old.onstart = null;
      try { old.abort(); } catch (_) { /* audio call remains independent */ }
    }
    buffer.removeInterim(getCall().userId);
  }
  function disable() {
    enabled = false; suspended = false; stopRecognition();
    sizeObserver?.disconnect();
    if (scrollFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
    closeReplay(); if (replayButton) replayButton.disabled = true;
    selectedTerm = null;
    clearInterval(timer); timer = null;
    buffer.clear(); render();
    list.hidden = true; prepare.hidden = true;
    button.textContent = '字幕をON'; button.setAttribute('aria-pressed', 'false');
    setStatus(serverRecognition ? '字幕をONにすると、自分のマイク音声をCloudflareの音声認識へ送信し、字幕を通話相手に共有します。音声・字幕を保存せず、字幕は60秒で消えます。' : '自分の発言を字幕にして通話相手へ共有します。字幕は60秒で消え、保存しません。');
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
      if (!serverRecognition) {
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
      }
      const speech = new Recognition();
      if (!serverRecognition && !('processLocally' in speech)) { fail('端末内音声認識を利用できません。'); return; }
      if (!serverRecognition) speech.processLocally = true;
      speech.lang = 'ja-JP'; speech.continuous = true; speech.interimResults = true;
      recognizer = speech; busy = false;
      setStatus('音声認識を開始しています…');
      speech.onstart = () => {
        if (token !== generation || !enabled) return;
        setStatus(serverRecognition ? '自分の音声を認識中です。途中の字幕から順次表示・共有します。相手の発言には相手側でも字幕ONが必要です。' : '自分の音声を端末内で認識中です。');
      };
      const prefix = instance + '-' + (++runId) + '-';
      speech.onresult = event => {
        const live = getCall();
        if (token !== generation || !enabled || !live.joined || live.muted) return;
        errors = 0;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = String(result[0]?.transcript || '').trim().slice(0, 600);
          if (!text && !result.isFinal) continue;
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
        if (serverRecognition) {
          const messages = {
            quota: '字幕の利用上限に達しました。時間をおいて字幕をOFF→ONにしてください。',
            auth: '字幕の認証が切れました。通話に入り直してください。',
            interrupted: '字幕の音声処理が中断しました。この画面を開き、字幕をOFF→ONにしてください。',
            overloaded: '字幕の認識が追いつかないため停止しました。時間をおいて字幕をOFF→ONにしてください。',
            'audio-capture': '字幕用の音声処理を開始できませんでした。マイクをONにし、字幕をOFF→ONにしてください。'
          };
          fail(messages[event.error] || '字幕サーバーに接続できませんでした。時間をおいて字幕をOFF→ONにしてください。');
          render(); return;
        }
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
      if (!serverRecognition) runTimer = setTimeout(() => {
        if (token !== generation) return;
        stopRecognition(); errors = 0; render(); void startRecognition();
      }, 30000);
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
    if (replayButton) replayButton.disabled = !features.replay;
    list.hidden = false;
    sizeObserver?.observe(list);
    button.textContent = '字幕をOFF'; button.setAttribute('aria-pressed', 'true');
    timer = setInterval(render, 1000);
    sync();
  });
  factsToggle?.addEventListener('change', () => { factsEnabled = !!features.facts && factsToggle.checked; render(); });
  termsToggle?.addEventListener('change', () => { termsEnabled = !!features.terms && termsToggle.checked; selectedTerm = null; render(); });
  termClose?.addEventListener('click', () => { selectedTerm = null; renderTerm(); list.focus?.(); });
  termPanel?.addEventListener('cancel', event => { event.preventDefault(); selectedTerm = null; renderTerm(); list.focus?.(); });
  termPanel?.addEventListener('keydown', event => { if (event.key === 'Escape') { selectedTerm = null; renderTerm(); list.focus?.(); } });
  replayButton?.addEventListener('click', () => {
    if (!enabled || !features.replay) return;
    if (replayKeys) { closeReplay(); return; }
    selectedTerm = null; renderTerm();
    buffer.prune();
    // Keep identifiers only, so opening the panel never extends text retention.
    replayKeys = new Set(buffer.rows.filter(row => row.final).map(row => JSON.stringify([row.speaker, row.id])));
    replayButton.setAttribute('aria-expanded', 'true'); renderReplay();
    replayClose?.focus?.();
  });
  replayClose?.addEventListener('click', () => { closeReplay(); replayButton?.focus?.(); });
  replayPanel?.addEventListener('cancel', event => { event.preventDefault(); closeReplay(); replayButton?.focus?.(); });
  replayPanel?.addEventListener('keydown', event => { if (event.key === 'Escape') { closeReplay(); replayButton?.focus?.(); } });
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
