// @ts-nocheck
const ALLOWED_ORIGINS = new Set(["https://hiroakiaa.github.io"]);
const FIREBASE_PROJECT_ID = "test-project-579c6";
const rateBuckets = new Map();
const TEN_MINUTES = 10 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

function allowRequest(key, max, windowMs) {
  const now = Date.now();
  const recent = (rateBuckets.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  rateBuckets.set(key, recent);
  if (rateBuckets.size > 2000) {
    for (const [bucketKey, times] of rateBuckets) {
      if (!times.length || now - times[times.length - 1] > ONE_DAY) rateBuckets.delete(bucketKey);
    }
  }
  return true;
}

function response(body, status, origin) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Vary": "Origin",
      ...(origin ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      } : {})
    }
  });
}

async function authenticatedUid(request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("missing_token");
  const token = authorization.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_token");
  const header = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
  if (header.alg !== "RS256" || !header.kid) throw new Error("invalid_header");
  const keysResponse = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  const keySet = await keysResponse.json();
  const jwk = Array.isArray(keySet.keys) ? keySet.keys.find((item) => item.kid === header.kid) : null;
  if (!jwk) throw new Error("unknown_key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromBase64Url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  const now = Math.floor(Date.now() / 1000);
  if (!valid || payload.aud !== FIREBASE_PROJECT_ID || payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`
    || Number(payload.exp) <= now || Number(payload.iat) > now) throw new Error("invalid_claims");
  const uid = String(payload.sub || "");
  if (!uid || uid.length > 128) throw new Error("invalid_uid");
  return uid;
}

function fromBase64Url(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function toBase64Url(value) {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrays) {
  const size = arrays.reduce((sum, item) => sum + item.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const item of arrays) { result.set(item, offset); offset += item.length; }
  return result;
}

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

async function hkdfExtract(salt, ikm) { return hmac(salt, ikm); }
async function hkdfExpand(prk, info, length) {
  const output = [];
  let previous = new Uint8Array();
  let counter = 1;
  while (output.reduce((sum, item) => sum + item.length, 0) < length) {
    previous = await hmac(prk, concat(previous, info, new Uint8Array([counter++])));
    output.push(previous);
  }
  return concat(...output).slice(0, length);
}

async function vapidAuthorization(endpoint, env) {
  const encoder = new TextEncoder();
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const audience = new URL(endpoint).origin;
  const payload = toBase64Url(encoder.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 43200, sub: env.VAPID_SUBJECT })));
  const privateKey = await crypto.subtle.importKey("pkcs8", fromBase64Url(env.VAPID_PRIVATE_KEY), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, encoder.encode(header + "." + payload));
  return `vapid t=${header}.${payload}.${toBase64Url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

async function sendWebPush(subscription, payload, env) {
  const encoder = new TextEncoder();
  const receiverPublic = fromBase64Url(subscription.keys.p256dh);
  const authSecret = fromBase64Url(subscription.keys.auth);
  const localKeys = /** @type {CryptoKeyPair} */ (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
  const senderPublic = new Uint8Array(/** @type {ArrayBuffer} */ (await crypto.subtle.exportKey("raw", localKeys.publicKey)));
  const receiverKey = await crypto.subtle.importKey("raw", receiverPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, localKeys.privateKey, 256));
  const authPrk = await hkdfExtract(authSecret, sharedSecret);
  const ikm = await hkdfExpand(authPrk, concat(encoder.encode("WebPush: info"), new Uint8Array([0]), receiverPublic, senderPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdfExtract(salt, ikm);
  const cek = await hkdfExpand(prk, concat(encoder.encode("Content-Encoding: aes128gcm"), new Uint8Array([0])), 16);
  const nonce = await hkdfExpand(prk, concat(encoder.encode("Content-Encoding: nonce"), new Uint8Array([0])), 12);
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]));
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext));
  const recordSize = new Uint8Array([0, 0, 16, 0]);
  const body = concat(salt, recordSize, new Uint8Array([senderPublic.length]), senderPublic, ciphertext);
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": await vapidAuthorization(subscription.endpoint, env),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "90",
      "Urgency": "high"
    },
    body
  });
}

function validSubscription(value) {
  return value && typeof value.endpoint === "string" && value.endpoint.startsWith("https://")
    && value.endpoint.length <= 2000 && value.keys && typeof value.keys.p256dh === "string"
    && typeof value.keys.auth === "string";
}

async function handlePush(request, env, origin, path) {
  if (!env.PUSH_SUBSCRIPTIONS || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return response({ error: "push_not_configured" }, 503, origin);
  }
  let uid;
  try { uid = await authenticatedUid(request); }
  catch (_) { return response({ error: "unauthorized" }, 401, origin); }
  let body;
  try { body = await request.json(); }
  catch (_) { return response({ error: "invalid_json" }, 400, origin); }

  if (path === "/push/register") {
    if (!validSubscription(body.subscription)) return response({ error: "invalid_subscription" }, 400, origin);
    await env.PUSH_SUBSCRIPTIONS.put(uid, JSON.stringify({
      subscription: body.subscription,
      updatedAt: Date.now()
    }), { expirationTtl: 60 * 60 * 24 * 120 });
    return response({ ok: true }, 200, origin);
  }
  if (path === "/push/unregister") {
    await env.PUSH_SUBSCRIPTIONS.delete(uid);
    return response({ ok: true }, 200, origin);
  }
  if (path !== "/push/notify") return response({ error: "not_found" }, 404, origin);

  const calleeUid = typeof body.calleeUid === "string" ? body.calleeUid : "";
  const callId = typeof body.callId === "string" && /^[A-Za-z0-9_-]{1,48}$/.test(body.callId) ? body.callId : "";
  const invitationId = typeof body.invitationId === "string" && /^[A-Za-z0-9]{1,64}$/.test(body.invitationId) ? body.invitationId : "";
  const callerName = typeof body.callerName === "string" ? body.callerName.trim().slice(0, 40) : "匿名さん";
  const action = body.action === "cancel" ? "cancel" : "ring";
  if (!calleeUid || calleeUid === uid || !callId || !invitationId) return response({ error: "invalid_request" }, 400, origin);
  if (!allowRequest("push-uid:" + uid, 8, TEN_MINUTES)) return response({ error: "rate_limited" }, 429, origin);

  const deliveryKey = "push-sent:" + uid + ":" + invitationId + ":" + action;
  if (await env.PUSH_SUBSCRIPTIONS.get(deliveryKey)) {
    return response({ ok: true, delivered: false, duplicate: true }, 200, origin);
  }
  await env.PUSH_SUBSCRIPTIONS.put(deliveryKey, String(Date.now()), { expirationTtl: 120 });

  const stored = await env.PUSH_SUBSCRIPTIONS.get(calleeUid, "json");
  if (!stored || !validSubscription(stored.subscription)) return response({ ok: true, delivered: false }, 200, origin);
  try {
    const pushResponse = await sendWebPush(stored.subscription, JSON.stringify({
      callerName: callerName || "匿名さん", callId, invitationId, callerUid: uid, action
    }), env);
    if (!pushResponse.ok) {
      if (pushResponse.status === 404 || pushResponse.status === 410) await env.PUSH_SUBSCRIPTIONS.delete(calleeUid);
      return response({ ok: true, delivered: false }, 200, origin);
    }
    return response({ ok: true, delivered: true }, 200, origin);
  } catch (error) {
    if (error && (error.statusCode === 404 || error.statusCode === 410)) {
      await env.PUSH_SUBSCRIPTIONS.delete(calleeUid);
    }
    return response({ ok: true, delivered: false }, 200, origin);
  }
}

async function handleTurn(request, env, origin) {
  if (String(env.TURN_DISABLED || "").toLowerCase() === "true") return response({ error: "turn_temporarily_disabled" }, 503, origin);
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return response({ error: "service_not_configured" }, 503, origin);
  let callId = "unknown";
  let clientId = "unknown";
  try {
    const body = await request.json();
    if (typeof body.callId === "string" && /^[A-Za-z0-9_-]{1,48}$/.test(body.callId)) callId = body.callId;
    if (typeof body.clientId === "string" && /^[A-Za-z0-9_-]{8,96}$/.test(body.clientId)) clientId = body.clientId;
  } catch (_) {}
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const allowed = allowRequest("ip-10m:" + ip, 20, TEN_MINUTES)
    && allowRequest("device-10m:" + clientId, 12, TEN_MINUTES)
    && allowRequest("ip-day:" + ip, 120, ONE_DAY)
    && allowRequest("device-day:" + clientId, 60, ONE_DAY);
  if (!allowed) return response({ error: "rate_limited" }, 429, origin);
  const upstream = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.TURN_KEY_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: 7200, customIdentifier: callId.slice(0, 48) })
  });
  if (!upstream.ok) return response({ error: "credential_generation_failed" }, 502, origin);
  const data = await upstream.json();
  const iceServers = Array.isArray(data.iceServers) ? data.iceServers : [];
  if (!iceServers.length) return response({ error: "empty_ice_servers" }, 502, origin);
  return response({ iceServers, expiresAtMs: Date.now() + 60 * 60 * 1000 }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.has(origin)) return response({ error: "origin_not_allowed" }, 403, "");
    if (request.method === "OPTIONS") return response(null, 204, origin);
    if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405, origin);
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    if (path.startsWith("/push/")) return handlePush(request, env, origin, path);
    return handleTurn(request, env, origin);
  }
};
