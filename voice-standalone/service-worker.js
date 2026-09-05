const CACHE_NAME = "kouryu-voice-shell-v28";
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

self.addEventListener("push", function(event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const isTest = data.kind === "test";
  const callerName = String(data.callerName || "匿名さん").slice(0, 40);
  const callId = String(data.callId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);
  const invitationId = String(data.invitationId || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 64);
  const callerUid = String(data.callerUid || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 128);
  const action = isTest ? "test" : data.action === "cancel" ? "cancel" : "ring";
  const target = new URL("./", APP_SCOPE_URL);
  if (callId) target.searchParams.set("call", callId);
  if (invitationId) target.searchParams.set("incomingInvite", invitationId);
  target.searchParams.set("fromPush", "1");
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(windows) {
    if (!isTest) windows.forEach(function(client) { client.postMessage({ type: "kouryu-phone-state", action, callerUid }); });
    if (action === "cancel") {
      return self.registration.getNotifications({ tag: "kouryu-call-" + (invitationId || callId || "incoming") })
        .then(function(items) { items.forEach(function(item) { item.close(); }); });
    }
    const hasVisibleApp = !isTest && windows.some(function(client) { return client.visibilityState === "visible"; });
    if (hasVisibleApp) return;
    return self.registration.showNotification(isTest ? "わかる電話のテスト通知" : callerName + "さんから着信です", {
    body: isTest ? "アプリを閉じていても通知を受け取れる状態です。" : "タップして応答画面を開きます。",
    icon: "./app-icon.svg",
    badge: "./app-icon.svg",
    tag: isTest ? "kouryu-notification-test" : "kouryu-call-" + (invitationId || callId || "incoming"),
    renotify: true,
    requireInteraction: true,
    data: { url: target.toString() }
    });
  }));
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url : APP_SCOPE_URL;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(windows) {
    for (const client of windows) {
      if ("navigate" in client) {
        return client.navigate(targetUrl).then(function() { return client.focus(); });
      }
    }
    return clients.openWindow(targetUrl);
  }));
});
