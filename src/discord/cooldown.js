class CooldownManager {
  constructor(cooldownMs = 4000) {
    this.cooldownMs = cooldownMs;
    this.map = new Map();
  }
  check(key, now = Date.now()) {
    const last = this.map.get(key);
    if (last === undefined) {
      this.map.set(key, now);
      return { allowed: true, retryAfterMs: 0 };
    }
    const wait = this.cooldownMs - (now - last);
    if (wait > 0) return { allowed: false, retryAfterMs: wait };
    this.map.set(key, now);
    if (this.map.size > 5000) {
      for (const [k, t] of this.map) if (now - t > this.cooldownMs * 10) this.map.delete(k);
    }
    return { allowed: true, retryAfterMs: 0 };
  }
  reset(key) { this.map.delete(key); }
}

module.exports = { CooldownManager };
