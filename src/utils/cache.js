/**
 * NodataNime — Hardened In-Memory TTL Cache with Pinned Key Protection & Bounded In-Flight Deduplication
 */
const PINNED_CORE_KEYS = new Set([
  "home:v3",
  "genres:all",
  "schedule:weekly",
  "community:external:v1",
]);

export class TtlCache {
  constructor(defaultTtlMs = 5 * 60 * 1000, maxEntries = 500, maxInFlight = 120) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
    this.maxInFlight = maxInFlight;
    this.store = new Map();
    this.inFlight = new Map();
    this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0 };
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses += 1;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses += 1;
      return undefined;
    }
    this.stats.hits += 1;
    return entry.value;
  }

  _evictOne() {
    const now = Date.now();
    for (const [k, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(k);
        this.stats.evictions += 1;
        return;
      }
    }
    for (const k of this.store.keys()) {
      if (!PINNED_CORE_KEYS.has(k)) {
        this.store.delete(k);
        this.stats.evictions += 1;
        return;
      }
    }
    const oldestKey = this.store.keys().next().value;
    if (oldestKey !== undefined) {
      this.store.delete(oldestKey);
      this.stats.evictions += 1;
    }
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      this._evictOne();
    }
    this.store.set(key, {
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
    this.stats.sets += 1;
    return value;
  }

  async remember(key, loader, ttlMs = this.defaultTtlMs) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }
    if (this.inFlight.size >= this.maxInFlight && !PINNED_CORE_KEYS.has(key)) {
      return loader();
    }
    const promise = (async () => {
      try {
        const result = await loader();
        if (result !== undefined && result !== null) {
          this.set(key, result, ttlMs);
        }
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, promise);
    return promise;
  }

  clear() {
    this.store.clear();
  }

  getStats() {
    return {
      ...this.stats,
      size: this.store.size,
      inFlight: this.inFlight.size,
    };
  }
}

export const appCache = new TtlCache(5 * 60 * 1000, 600, 120);
