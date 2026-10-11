// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// What the device has already translated, kept between sessions (2026-10-10), so a reader who
// chose French comes back to French at once instead of waiting for the translator again.
//
// IndexedDB database `astrolina-i18n`, object store `mt`, keyed `[lang, msgKey]` (an out-of-line
// array key), value `{ h, v, at }`:
//   h  — FNV-1a of ENGINE_VERSION + the English template. An English string edited since is
//        translated again; so is everything, when the engine (its masking, its checks) changes.
//   v  — the translation, or null for a key the translator could not do validly: its answer
//        failed the checks (mask.ts), or the text was over its input quota. A null is not
//        retried every session — only when its English or the engine changes. So it is stored
//        ONLY for those two, which give the same answer next time; a translator that merely
//        threw (busy, crashed, gone mid-session) says nothing about the key, and is never
//        written here (engine.ts, 2026-10-10).
//   at — when it was made (ms), for whoever looks at the store.
// Everything for a language is read at once (getAll over the key range [lang] … [lang, []]) and
// only hash-matching entries are kept by the engine.
//
// A build's own longer text (translateOnDevice, engine.ts — 2026-10-10) is kept in the same store
// under a key space of its own: `[[lang], cacheKey]`, the language wrapped in an array. An array
// sorts after every string, so no language's catalog range reaches it, and the read above — which
// sits in front of boot — never carries pages of a build's text. That text is read by the keys
// asked for (loadFree), never whole, with the same `{ h, v, at }` record and the same rules for
// what is stored. Its keys are the caller's (namespaced by it, `<ns>:<key>`); a build whose keys
// follow its English leaves an edited passage's old entry behind, unpruned — an entry is the size
// of its passage, and the store is the device's own.
//
// A cache, not a preference: nothing here is the reader's choice, and nothing reads it but the
// engine. Every IndexedDB call is in a try/catch; any failure — no IndexedDB, a private window, a
// blocked upgrade, a full disk — turns the cache off for the session, and the engine carries on
// in memory. Touches nothing at import time.

export interface CacheRecord {
  h: string;
  v: string | null;
  at: number;
}

/** FNV-1a, 32-bit, over UTF-16 code units, as 8 hex digits (the standard function, written out
 *  here because the core imports nothing from a build). */
export function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The `h` of an entry: what it was translated from, under which engine. */
export function entryHash(engineVersion: string, english: string): string {
  return fnv1a32(`${engineVersion}\u0000${english}`);
}

/** One record to write. `free` puts it in a build's own key space (the header says why). */
export interface CacheRow {
  lang: string;
  key: string;
  rec: CacheRecord;
  free?: boolean;
}

/** Where records live. The IndexedDB one in the app; an in-memory one under the verify harness
 *  (which has no IndexedDB) and after a failure. */
export interface CacheBackend {
  /** The catalog's records for `lang`, whole. Never a build's own text. */
  loadAll(lang: string): Promise<Map<string, CacheRecord>>;
  /** A build's own text: the records stored for these keys, where there are any. */
  loadFree(lang: string, keys: readonly string[]): Promise<Map<string, CacheRecord>>;
  putAll(rows: readonly CacheRow[]): Promise<void>;
}

export function memoryBackend(seed: Iterable<[string, string, CacheRecord]> = []): CacheBackend {
  // The two key spaces apart, as IndexedDB keeps them (the header): a build's text is never part
  // of a language's catalog read.
  const rows = new Map<string, Map<string, CacheRecord>>();
  const free = new Map<string, Map<string, CacheRecord>>();
  const put = (space: Map<string, Map<string, CacheRecord>>, lang: string, key: string, rec: CacheRecord) => {
    let m = space.get(lang);
    if (!m) space.set(lang, (m = new Map()));
    m.set(key, rec);
  };
  for (const [lang, key, rec] of seed) put(rows, lang, key, rec);
  return {
    loadAll: async (lang) => new Map(rows.get(lang) ?? []),
    loadFree: async (lang, keys) => {
      const m = free.get(lang);
      const out = new Map<string, CacheRecord>();
      for (const k of keys) {
        const rec = m?.get(k);
        if (rec) out.set(k, rec);
      }
      return out;
    },
    putAll: async (list) => {
      for (const r of list) put(r.free ? free : rows, r.lang, r.key, r.rec);
    },
  };
}

/** Where a build's own text is stored: the language wrapped in an array (the header says why). */
function freeKey(lang: string, key: string): IDBValidKey {
  return [[lang], key];
}

const DB_NAME = 'astrolina-i18n';
const STORE = 'mt';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** The IndexedDB backend, or null where there is no IndexedDB. Opens lazily, on first use. */
export function indexedDbBackend(): CacheBackend | null {
  if (typeof indexedDB === 'undefined') return null;
  let db: Promise<IDBDatabase> | null = null;
  const open = () => {
    db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('astrolina-i18n: upgrade blocked'));
    });
    return db;
  };
  return {
    async loadAll(lang) {
      const store = (await open()).transaction(STORE, 'readonly').objectStore(STORE);
      const range = IDBKeyRange.bound([lang], [lang, []]);
      // Both in key order, in one transaction, so they line up.
      const [keys, values] = await Promise.all([
        request(store.getAllKeys(range)),
        request(store.getAll(range) as IDBRequest<CacheRecord[]>),
      ]);
      const out = new Map<string, CacheRecord>();
      keys.forEach((k, i) => {
        const key = Array.isArray(k) ? k[1] : undefined;
        const rec = values[i];
        if (typeof key === 'string' && rec && typeof rec.h === 'string') out.set(key, rec);
      });
      return out;
    },
    async loadFree(lang, keys) {
      const out = new Map<string, CacheRecord>();
      if (!keys.length) return out;
      const store = (await open()).transaction(STORE, 'readonly').objectStore(STORE);
      // Every request made before the first await, so the one transaction serves them all.
      const values = await Promise.all(
        keys.map((k) => request(store.get(freeKey(lang, k)) as IDBRequest<CacheRecord | undefined>)),
      );
      keys.forEach((k, i) => {
        const rec = values[i];
        if (rec && typeof rec.h === 'string') out.set(k, rec);
      });
      return out;
    },
    async putAll(rows) {
      const tx = (await open()).transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const r of rows) store.put(r.rec, r.free ? freeKey(r.lang, r.key) : [r.lang, r.key]);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('astrolina-i18n: write aborted'));
      });
    },
  };
}

/** How long the first read of a language may take before the engine stops waiting for it
 *  (2026-10-10). IndexedDB can stall without failing — an upgrade blocked by another tab that
 *  never closes, a browser busy with its own storage — and the read sits in front of both a pick
 *  (the reader is watching the menu) and boot (the app is waiting on the language). Past this,
 *  the cache is treated as failed: the session carries on in memory with nothing cached, so a
 *  pick translates afresh and a resume shows the language from its translator or holds it. */
export const CACHE_LOAD_TIMEOUT_MS = 2500;

/** The engine's view of the cache: reads a language whole, buffers writes and sends them in
 *  batches. Falls back to memory, quietly and for good, at the first failure — or the first
 *  read that takes longer than CACHE_LOAD_TIMEOUT_MS. */
export class MachineCache {
  private backend: CacheBackend;
  private queue: CacheRow[] = [];
  private flushing: Promise<void> | null = null;
  private readonly loadTimeoutMs: number;
  /** True once a failure has turned the stored cache off for this session. */
  memoryOnly: boolean;

  constructor(backend: CacheBackend | null, opts: { loadTimeoutMs?: number } = {}) {
    this.memoryOnly = backend === null;
    this.backend = backend ?? memoryBackend();
    this.loadTimeoutMs = opts.loadTimeoutMs ?? CACHE_LOAD_TIMEOUT_MS;
  }

  private fail(err: unknown): void {
    if (this.memoryOnly) return;
    console.warn('[i18n] the device-translation cache is unavailable; translating in memory only', err);
    this.memoryOnly = true;
    this.backend = memoryBackend();
  }

  /** Everything stored for `lang`; an empty map on a failure or a read that stalls (the
   *  database's open counts — it is where a blocked upgrade waits). Never rejects. */
  load(lang: string): Promise<Map<string, CacheRecord>> {
    return this.bounded(() => this.backend.loadAll(lang));
  }

  /** A build's own text: what is stored for `keys` in `lang`, bounded and failing over exactly as
   *  load() does. Never rejects. */
  loadFree(lang: string, keys: readonly string[]): Promise<Map<string, CacheRecord>> {
    if (!keys.length) return Promise.resolve(new Map());
    return this.bounded(() => this.backend.loadFree(lang, keys));
  }

  private async bounded(read: () => Promise<Map<string, CacheRecord>>): Promise<Map<string, CacheRecord>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`astrolina-i18n: no answer in ${this.loadTimeoutMs} ms`)),
        this.loadTimeoutMs,
      );
    });
    try {
      return await Promise.race([read(), stalled]);
    } catch (err) {
      this.fail(err);
      return new Map();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Queues one record; `free` for a build's own text (its own key space). */
  put(lang: string, key: string, rec: CacheRecord, free = false): void {
    this.queue.push(free ? { lang, key, rec, free } : { lang, key, rec });
    if (this.queue.length >= 100) void this.flush();
  }

  /** Writes everything queued. Never rejects. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing.then(() => (this.queue.length ? this.flush() : undefined));
    if (!this.queue.length) return Promise.resolve();
    const rows = this.queue;
    this.queue = [];
    this.flushing = this.backend
      .putAll(rows)
      .catch((err) => {
        this.fail(err);
        return this.backend.putAll(rows).catch(() => {});
      })
      .finally(() => {
        this.flushing = null;
      });
    return this.flushing;
  }
}

let shared: MachineCache | null = null;

/** The page's one cache (IndexedDB where there is one). */
export function machineCache(): MachineCache {
  if (!shared) {
    let backend: CacheBackend | null;
    try {
      backend = indexedDbBackend();
    } catch {
      backend = null;
    }
    shared = new MachineCache(backend);
  }
  return shared;
}

/** Test seam (verify-i18n-machine): stand a cache in for the page's. */
export function __setMachineCacheForTest(cache: MachineCache | null): void {
  shared = cache;
}
