const DEFAULT_KEY = "wakaru-phone-active-tab-v1";
const DEFAULT_CHANNEL = "wakaru-phone-tab-coordination-v1";

export function createSingleTabCoordinator({
  storage = window.localStorage,
  channelFactory = typeof BroadcastChannel === "function" ? name => new BroadcastChannel(name) : null,
  now = () => Date.now(),
  tabId = crypto.randomUUID(),
  leaseKey = DEFAULT_KEY,
  channelName = DEFAULT_CHANNEL,
  heartbeatMs = 2000,
  leaseTimeoutMs = 7000,
  takeoverWaitMs = 2400,
  onRoleChange = () => {},
  onReleaseRequested = async () => {},
  onOwnershipLost = async () => {}
} = {}) {
  let role = "starting";
  let channel = null;
  let heartbeatTimer = 0;
  let takeoverCount = 0;
  let conflictDetected = false;
  let lastReason = "startup";
  let startResolve = null;
  let takeoverTimer = 0;
  let destroyed = false;

  const readLease = () => {
    try { return JSON.parse(storage.getItem(leaseKey) || "null"); } catch (_) { return null; }
  };
  const isFresh = lease => !!lease && lease.tabId && now() - Number(lease.at || 0) < leaseTimeoutMs;
  const writeLease = reason => {
    const lease = { tabId, at: now(), reason };
    storage.setItem(leaseKey, JSON.stringify(lease));
    return lease;
  };
  const send = message => { try { channel?.postMessage({ ...message, from: tabId, at: now() }); } catch (_) {} };
  const notify = () => onRoleChange(getState());

  function becomeOwner(reason) {
    if (destroyed) return;
    lastReason = reason;
    writeLease(reason);
    role = "owner";
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = window.setInterval(() => {
      const lease = readLease();
      if (isFresh(lease) && lease.tabId !== tabId) {
        becomeStandby("ownership-replaced");
        return;
      }
      writeLease("heartbeat");
    }, heartbeatMs);
    send({ type: "owner-active" });
    notify();
    if (startResolve) { startResolve(true); startResolve = null; }
  }

  function becomeStandby(reason) {
    const wasOwner = role === "owner";
    lastReason = reason;
    conflictDetected = true;
    role = "standby";
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = 0;
    notify();
    if (wasOwner) Promise.resolve(onOwnershipLost({ reason })).catch(() => {});
  }

  async function releaseFor(nextTabId) {
    if (role !== "owner") return;
    role = "releasing";
    lastReason = "takeover-requested";
    notify();
    try { await onReleaseRequested({ nextTabId }); } catch (_) {}
    const lease = readLease();
    if (!lease || lease.tabId === tabId) storage.removeItem(leaseKey);
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = 0;
    role = "standby";
    send({ type: "released", to: nextTabId });
    notify();
  }

  function handleMessage(event) {
    const message = event?.data || {};
    if (!message.type || message.from === tabId) return;
    if (message.type === "who-is-owner" && role === "owner") send({ type: "owner-active", to: message.from });
    if (message.type === "takeover-request" && role === "owner") releaseFor(message.from);
    if (message.type === "released" && message.to === tabId && role === "taking-over") becomeOwner("takeover-acknowledged");
    if (message.type === "owner-active" && role !== "owner" && role !== "taking-over") becomeStandby("another-tab-active");
  }

  function handleStorage(event) {
    if (event.key !== leaseKey) return;
    const lease = readLease();
    if (role === "owner" && isFresh(lease) && lease.tabId !== tabId) becomeStandby("storage-owner-changed");
  }

  function start() {
    if (destroyed) return Promise.resolve(false);
    if (channelFactory) {
      try { channel = channelFactory(channelName); channel.addEventListener("message", handleMessage); } catch (_) { channel = null; }
    }
    window.addEventListener("storage", handleStorage);
    const lease = readLease();
    if (!isFresh(lease) || lease.tabId === tabId) {
      becomeOwner(isFresh(lease) ? "same-tab" : "lease-free");
      return Promise.resolve(true);
    }
    becomeStandby("startup-conflict");
    send({ type: "who-is-owner" });
    return new Promise(resolve => { startResolve = resolve; });
  }

  function takeOver() {
    if (role === "owner" || role === "taking-over") return;
    takeoverCount += 1;
    role = "taking-over";
    lastReason = "user-takeover";
    notify();
    send({ type: "takeover-request" });
    window.clearTimeout(takeoverTimer);
    takeoverTimer = window.setTimeout(() => {
      if (role !== "taking-over") return;
      const lease = readLease();
      if (!isFresh(lease) || lease.tabId !== tabId) becomeOwner("takeover-timeout");
    }, takeoverWaitMs);
  }

  function release() {
    if (role === "owner") {
      const lease = readLease();
      if (!lease || lease.tabId === tabId) storage.removeItem(leaseKey);
      send({ type: "released" });
    }
    window.clearInterval(heartbeatTimer);
    window.clearTimeout(takeoverTimer);
    role = "released";
  }

  function destroy() {
    release();
    destroyed = true;
    window.removeEventListener("storage", handleStorage);
    try { channel?.removeEventListener("message", handleMessage); channel?.close(); } catch (_) {}
  }

  function getState() {
    return {
      tabId,
      role,
      conflictDetected,
      takeoverCount,
      lastReason,
      broadcastChannel: !!channel,
      leaseTimeoutMs
    };
  }

  return { start, takeOver, release, destroy, getState };
}
