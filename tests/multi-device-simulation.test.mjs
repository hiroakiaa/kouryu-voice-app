import assert from "node:assert/strict";
import test from "node:test";

const SLOT_NAMES = ["A", "B", "C", "D"];
const STALE_MS = 240_000;

class PresenceModel {
  constructor() {
    this.slots = new Map();
    this.notices = [];
    this.now = 1_000_000;
  }

  join(deviceId, sessionId) {
    const reusable = SLOT_NAMES.find((slot) => {
      const value = this.slots.get(slot);
      return !value || !value.active || this.now - value.updatedAt > STALE_MS || value.deviceId === deviceId;
    });
    if (!reusable) return null;
    const previous = this.slots.get(reusable);
    this.slots.set(reusable, { deviceId, sessionId, active: true, updatedAt: this.now });
    this.notices.push(`匿名さん${reusable}が参加しました。`);
    if (previous?.deviceId === deviceId) previous.active = false;
    return reusable;
  }

  leave(deviceId, sessionId) {
    for (const [slot, value] of this.slots) {
      if (value.deviceId === deviceId && value.sessionId === sessionId && value.active) {
        value.active = false;
        this.notices.push(`匿名さん${slot}が退室しました。`);
      }
    }
  }

  activeCount() {
    return [...this.slots.values()].filter((value) => value.active).length;
  }
}

test("5台同時相当でも固定枠は4台まで", () => {
  const model = new PresenceModel();
  const results = [1, 2, 3, 4, 5].map((id) => model.join(`device-${id}`, `session-${id}`));
  assert.deepEqual(results, ["A", "B", "C", "D", null]);
  assert.equal(model.activeCount(), 4);
});

test("PC・iPad・iPhoneの参加・退室・再参加を10周", () => {
  const model = new PresenceModel();
  const devices = ["pc", "ipad", "iphone"];
  for (let round = 0; round < 10; round += 1) {
    for (const device of devices) assert.ok(model.join(device, `${device}-${round}`));
    assert.equal(model.activeCount(), 3);
    for (const device of devices) model.leave(device, `${device}-${round}`);
    assert.equal(model.activeCount(), 0);
    model.now += 1_000;
  }
  assert.equal(model.notices.length, 60);
  assert.match(model.notices[0], /参加しました/);
  assert.match(model.notices.at(-1), /退室しました/);
});

test("異常終了した枠は4分後に再利用", () => {
  const model = new PresenceModel();
  assert.equal(model.join("old-device", "old-session"), "A");
  model.now += STALE_MS + 1;
  assert.equal(model.join("new-device", "new-session"), "A");
  assert.equal(model.activeCount(), 1);
});
