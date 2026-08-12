const ALLOWED_ORIGINS = new Set([
  "https://hiroakiaa.github.io"
]);

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Vary": "Origin"
};

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
    headers: Object.assign({}, JSON_HEADERS, origin ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    } : {})
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.has(origin)) return response({ error: "origin_not_allowed" }, 403, "");
    if (request.method === "OPTIONS") return response(null, 204, origin);
    if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405, origin);
    if (String(env.TURN_DISABLED || "").toLowerCase() === "true") {
      return response({ error: "turn_temporarily_disabled" }, 503, origin);
    }
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
      return response({ error: "service_not_configured" }, 503, origin);
    }

    let callId = "unknown";
    let clientId = "unknown";
    try {
      const body = await request.json();
      if (typeof body.callId === "string" && /^[A-Za-z0-9_-]{1,48}$/.test(body.callId)) callId = body.callId;
      if (typeof body.clientId === "string" && /^[A-Za-z0-9_-]{8,96}$/.test(body.clientId)) clientId = body.clientId;
    } catch (_) {}

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const allowed =
      allowRequest("ip-10m:" + ip, 20, TEN_MINUTES) &&
      allowRequest("device-10m:" + clientId, 12, TEN_MINUTES) &&
      allowRequest("ip-day:" + ip, 120, ONE_DAY) &&
      allowRequest("device-day:" + clientId, 60, ONE_DAY);
    if (!allowed) return response({ error: "rate_limited" }, 429, origin);

    const upstream = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.TURN_KEY_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ttl: 7200, customIdentifier: callId.slice(0, 48) })
      }
    );
    if (!upstream.ok) return response({ error: "credential_generation_failed" }, 502, origin);
    const payload = await upstream.json();
    return response({ iceServers: payload.iceServers }, 201, origin);
  }
};
