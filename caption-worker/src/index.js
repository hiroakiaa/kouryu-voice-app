const ORIGIN = 'https://hiroakiaa.github.io';
const PROJECT = 'test-project-579c6';
const MAX_BYTES = 256044;
let publicKeys = null, keysUntil = 0;
const decode = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export async function authenticatedUid(request) {
  const bearer = request.headers.get('Authorization') || '';
  if (!bearer.startsWith('Bearer ') || bearer.length > 8192) throw Error('auth');
  const parts = bearer.slice(7).split('.');
  if (parts.length !== 3) throw Error('auth');
  const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(decode(parts[1])));
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
      payload.aud !== PROJECT || payload.iss !== 'https://securetoken.google.com/' + PROJECT ||
      !Number.isFinite(payload.exp) || payload.exp <= now || !Number.isFinite(payload.iat) || payload.iat > now ||
      typeof payload.sub !== 'string' || !payload.sub.length || payload.sub.length > 128) throw Error('auth');
  if (!publicKeys || Date.now() >= keysUntil) {
    const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error('auth');
    publicKeys = (await response.json()).keys; keysUntil = Date.now() + 3600000;
  }
  const jwk = publicKeys.find(key => key.kid === header.kid);
  if (!jwk) throw Error('auth');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))) throw Error('auth');
  return payload.sub;
}

function reply(body, status = 200, origin = ORIGIN) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization' } : {})
  }});
}

export function validWav(bytes) {
  if (bytes.length < 44 + 16000 || bytes.length > MAX_BYTES || bytes.length % 2) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const word = (at, size) => new TextDecoder().decode(bytes.subarray(at, at + size));
  return word(0,4) === 'RIFF' && word(8,4) === 'WAVE' && word(12,4) === 'fmt ' && word(36,4) === 'data' &&
    view.getUint32(4,true) === bytes.length - 8 && view.getUint32(16,true) === 16 && view.getUint16(20,true) === 1 &&
    view.getUint16(22,true) === 1 && view.getUint32(24,true) === 16000 && view.getUint32(28,true) === 32000 &&
    view.getUint16(32,true) === 2 && view.getUint16(34,true) === 16 && view.getUint32(40,true) === bytes.length - 44;
}

export async function handle(request, env, verify = authenticatedUid) {
  const origin = request.headers.get('Origin');
  if (origin !== ORIGIN) return reply({ error: 'origin' }, 403, null);
  const path = new URL(request.url).pathname;
  if (path !== '/transcribe') return reply({ error: 'not_found' }, 404);
  if (request.method === 'OPTIONS') return reply(null, 204);
  if (request.method !== 'POST') return reply({ error: 'method' }, 405);
  if (request.headers.get('Content-Type') !== 'audio/wav') return reply({ error: 'format' }, 415);
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) return reply({ error: 'size' }, 413);
  let bytes;
  try {
    if (!env.AI || !env.USER_LIMIT || !env.IP_LIMIT) return reply({ error: 'unavailable' }, 503);
    if (!(await env.IP_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' })).success) return reply({ error: 'limit' }, 429);
    let uid;
    try { uid = await verify(request); } catch (_) { return reply({ error: 'auth' }, 401); }
    if (!(await env.USER_LIMIT.limit({ key: uid })).success) return reply({ error: 'limit' }, 429);
    if (!request.body) return reply({ error: 'format' }, 400);
    // Bound memory even if Content-Length is missing or false.
    bytes = new Uint8Array(MAX_BYTES); let size = 0;
    const reader = request.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        if (size + value.length > MAX_BYTES) { await reader.cancel(); return reply({ error: 'size' }, 413); }
        bytes.set(value, size); size += value.length;
      }
    } finally { reader.releaseLock(); }
    const wav = bytes.subarray(0, size);
    if (!validWav(wav)) return reply({ error: 'format' }, 400);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    let energy = 0;
    for (let i = 44; i < wav.length; i += 2) { const sample = view.getInt16(i,true) / 32768; energy += sample * sample; }
    if (Math.sqrt(energy / ((wav.length - 44) / 2)) < 0.004) return reply({ text: '' });
    let binary = '';
    for (let i = 0; i < wav.length; i += 8192) binary += String.fromCharCode(...wav.subarray(i, i + 8192));
    const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
      audio: btoa(binary), language: 'ja', task: 'transcribe', vad_filter: true,
      condition_on_previous_text: false
    });
    const text = result?.text ?? result?.transcription_info?.text;
    if (typeof text !== 'string') return reply({ error: 'recognition' }, 502);
    return reply({ text: text.trim().slice(0, 600) });
  } catch (_) { return reply({ error: 'unavailable' }, 503); }
  finally { bytes?.fill(0); }
}

export default { fetch(request, env) { return handle(request, env); } };
