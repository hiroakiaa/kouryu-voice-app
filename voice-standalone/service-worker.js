const CACHE_NAME = "kouryu-voice-shell-v58";
const APP_SCOPE_URL = new URL("./", self.location.href).toString();

self.addEventListener("install", function(event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function(cache) {
    return cache.addAll(["./", "./manifest.webmanifest", "./app-icon.svg"]);
  }).catch(function() {}).then(function() { return self.skipWaiting(); }));
});

self.addEventListener("activate", function(event) {
  event.waitUntil(caches.keys().then(function(names) {
    return Promise.all(names.filter(function(name) { return name !== CACHE_NAME; }).map(function(name) { return caches.delete(name); }));
  }).then(function() { return self.clients.claim(); }));
});

// Installed PWAs must not stay on an older broken HTML shell.
self.addEventListener("fetch", function(event) {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request, { cache: "no-store" }).catch(function() {
    return caches.match("./");
  }));
});

self.addEventListener("push", function(event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const isTest = data.kind === "test";
  const callerName = String(data.callerName || "匿名さん").slice(0, 40);
  const callId = String(data.callId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);
  const invitationId = String(data.invitationId || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 64);
  const callerUid = String(data.callerUid || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 128);
  const action = isTest ? "test" : data.action === "cancel" ? "cancel" : data.action === "notice" ? "notice" : "ring";
  const target = new URL("./", APP_SCOPE_URL);
  if (action === "notice") target.searchParams.set("notice", invitationId || "1");
  else if (callId) target.searchParams.set("call", callId);
  if (action !== "notice" && invitationId) target.searchParams.set("incomingInvite", invitationId);
  if (action !== "notice" && callerUid) target.searchParams.set("incomingCaller", callerUid);
  if (action !== "notice" && callerName) target.searchParams.set("incomingName", callerName);
  target.searchParams.set("fromPush", "1");
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(windows) {
    if (!isTest) windows.forEach(function(client) { client.postMessage({ type: "kouryu-phone-state", action, callerUid }); });
    if (action === "cancel") {
      return self.registration.getNotifications({ tag: "kouryu-call-" + (invitationId || callId || "incoming") })
        .then(function(items) { items.forEach(function(item) { item.close(); }); });
    }
    const hasVisibleApp = !isTest && windows.some(function(client) { return client.visibilityState === "visible"; });
    if (hasVisibleApp) return;
    return self.registration.showNotification(isTest ? "わかる電話のテスト通知" : action === "notice" ? "新しい連絡があります" : callerName + "さんから着信です", {
    body: isTest ? "アプリを閉じていても通知を受け取れる状態です。" : action === "notice" ? "アプリを開いて内容を確認してください。" : "タップして応答画面を開きます。",
    icon: "./app-icon.svg",
    badge: "./app-icon.svg",
    tag: isTest ? "kouryu-notification-test" : (action === "notice" ? "kouryu-notice-" : "kouryu-call-") + (invitationId || callId || "incoming"),
    renotify: true,
    requireInteraction: true,
    data: { url: target.toString(), callerUid, callerName, callId, invitationId, action }
    });
  }));
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  const notificationData = event.notification.data || {};
  const targetUrl = notificationData.url || APP_SCOPE_URL;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(windows) {
    for (const client of windows) {
      client.postMessage({ type: "kouryu-phone-state", action: notificationData.action === "notice" ? "notice" : "ring", callerUid: notificationData.callerUid || "" });
      return client.focus();
    }
    return clients.openWindow(targetUrl);
  }));
});
