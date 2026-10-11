// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The on-device tier's engine (2026-10-10): turns the English catalog into a language the device
// can translate into, key by key, and hands the result to the runtime as a layer over English.
// A lazy chunk — loaded by the Language menu's click (i18n/machineMenu) or by boot for a stored
// `mt:` choice (runtime.ts) — so a reader who never chooses such a language never fetches it.
//
// ONE translator per language, called strictly in sequence. The order is what the reader is
// looking at first: every key asked of t() this session (runtime requestedKeys), and every key
// of a namespace a build read whole (useNs / nsStatic → noteNamespaceRead); then a background
// sweep of the rest of the catalog. Results land in the layer the runtime composes over English
// (publishMachine) — at most once every 1.5 s while keys on screen are being translated, and once
// more when the sweep ends; never per key, because each publish is a new catalog, every component
// re-renders, and the map's popup effects (Map.tsx, keyed on `t` — around lines 7608, 9016 and
// 9301) tear their open popups down when it changes.
//
// The tier's OWN sentences — the Language menu's device section, the disclosure under it, the
// held-language notice — never go to the translator: they are the ones that must be right, the
// disclosure above all, since it is what tells the reader the rest may not be. They come written
// (ownStrings.ts), are laid into the layer the moment a session starts, and are never cached; a
// language without a written one — or a sentence whose English has changed since it was written —
// shows English for it. (2026-10-10)
//
// A pick (runPick): the menu has already called Translator.create() inside the reader's click;
// this awaits it (the download, with progress in the menu), brings in the cache, translates what
// is on screen, and switches — stored, `<html lang>`, notified — when that is done or after 15 s,
// whichever comes first. The sweep carries on after. Choosing any other language aborts it all,
// and a pick's line under the menu goes with its abort, whatever stage it had reached.
//
// A later session (resumeMachine, from boot): the cache shows at once; where the translator is
// 'available' it is created without a click (no download is needed, so no activation is), and
// carries on; 'downloadable' / 'downloading' serves from the cache alone ("partial" — the row says a
// tap finishes the download); no translator at all serves from the cache, and with nothing cached
// the choice is HELD (runtime holdMachine): stored as chosen, the app in the detected language or
// English, the row greyed with its reason.
//
// A translator that THROWS (rather than answering badly) says nothing about the string: it may be
// busy, or crashed, or gone. Such a key is left English for this session only and never cached —
// a stored null would keep it English until the English or the engine changed. Five in a row and
// the translator is taken to be broken: the loop stops, and the menu says the language couldn't
// be set up, as a failed pick does; choosing its row again starts a fresh translator.
//
// A build's own text (translateFree, reached through onDevice.ts's translateOnDevice, 2026-10-10):
// longer passages that are not in the catalog go to the SAME translator, through the same masking
// and checks, one passage at a time between the catalog's keys — so the translator is still called
// strictly in sequence, and never by two loops at once. The order: what the catalog has on screen,
// then passages asked for 'now', then the sweep, then passages asked for in the background. Their
// translations go back to the caller alone, never into the layer, so they cost the app no
// re-render; and they are cached in a key space of their own (cache.ts), so boot's read of a
// language never carries them. A translator's exception counts toward the five in a row like any
// other — it is one translator — and is stored nowhere.
import { GLYPH_RUN } from '../../components/ui/glyphify';
import { LANGUAGES_HELD } from '../languageHold';
import { composeEnglish, isMachineExcluded, isMarkerPath, onRegistryChange } from '../registry';
import { PLURAL_RE, samePlaceholders } from '../plural';
import {
  adoptMachine,
  getI18n,
  holdMachine,
  namespacesReadWhole,
  publishMachine,
  requestedKeys,
  setMachineSession,
  currentMachineSession,
  targetLocale,
  type MachineEntry,
} from '../runtime';
import { resolvePath } from '../t';
import type { MachineLocale } from '../types';
import {
  translatorApi,
  updateMachineMenu,
  getMachineMenu,
  type TranslatorAvailability,
  type TranslatorLike,
} from '../machineMenu';
import { entryHash, fnv1a32, machineCache, type CacheRecord, type MachineCache } from './cache';
import { translatePlural } from './forms';
import {
  MAX_RATIO,
  MIN_RATIO,
  SENTINEL_CLOSE,
  SENTINEL_OPEN,
  STRAY_CHARS,
  WIDE,
  mask,
  unmask,
  untranslatable,
} from './mask';
import type { OnDeviceItem, OnDeviceOptions } from './onDevice';
import { OWN_STRINGS, OWN_STRINGS_SOURCE } from './ownStrings';
import { PROTECTED_TERMS } from './terms';

// ── The engine's version ─────────────────────────────────────────────────────

/** The engine's own revision — bump it when what the engine makes of a string changes in a way
 *  the ingredients below can't see: the plural sampling, the capital rule, what gets cached.
 *  mt-2 (2026-10-10): first letters capitalised as the English's (mask capitaliseLike), and a
 *  translator's exceptions no longer cached as failures — so mt-1's stored nulls are retried.
 *  mt-3 (2026-10-10): the capital rule skips a line's leading punctuation and symbols ("+ Text"),
 *  so mt-2's cached "+ texte" is retranslated. */
export const ENGINE_REVISION = 'mt-3 2026-10-10';

/** What else a cached translation depends on, as data: the protected terms, the glyph pattern,
 *  the sentinel's shape and the validation rules. Folded into ENGINE_VERSION (2026-10-10), so
 *  changing any of them retranslates every cache by itself — an edit to terms.ts or a new
 *  sentinel used to need someone to remember a bump, and a forgotten one left translations made
 *  under the old rules standing, unchecked by the new ones. */
export function engineIngredients(): readonly unknown[] {
  return [
    JSON.stringify(PROTECTED_TERMS),
    GLYPH_RUN.source,
    SENTINEL_OPEN,
    SENTINEL_CLOSE,
    MIN_RATIO,
    MAX_RATIO,
    STRAY_CHARS.join(''),
    WIDE.source,
  ];
}

/** A revision and its ingredients as one version string (exported for the verify harness, which
 *  moves each ingredient and requires the version to move with it). */
export function engineVersionOf(revision: string, ingredients: readonly unknown[]): string {
  return `${revision} ${fnv1a32(JSON.stringify(ingredients))}`;
}

/** Part of every cache entry's hash (cache.ts): when it changes, every cached translation is made
 *  again. */
export const ENGINE_VERSION = engineVersionOf(ENGINE_REVISION, engineIngredients());

/** The longest a re-render is held back while keys on screen are being translated. */
export const PUBLISH_EVERY_MS = 1500;
/** How long a pick waits for the keys on screen before switching anyway. */
export const PICK_WAIT_MS = 15_000;
/** How many translator exceptions in a row stop a session (the header says why). */
export const MAX_CONSECUTIVE_ERRORS = 5;

// ── The tier's own sentences ────────────────────────────────────────────────

/** The keys that are the tier's own (ownStrings.ts): never machine-translated. */
const OWN_PREFIXES = ['settings.machine.', 'autoFlip.language-held.'];

export function isOwnKey(key: string): boolean {
  return OWN_PREFIXES.some((p) => key.startsWith(p));
}

/** The written translation of one of the tier's own keys into `lang`, or null — English then
 *  shows. Only while it was made from the English the catalog has now (OWN_STRINGS_SOURCE): a
 *  sentence edited since is stale, and the edit may be the very correction the disclosure needed.
 *  And held to English's placeholders like any translation (the runtime would refuse it anyway;
 *  refused here it is never put in the layer). */
export function ownText(lang: string, key: string, english: string): string | null {
  if (OWN_STRINGS_SOURCE[key] !== english) return null;
  const text = OWN_STRINGS[lang]?.[key];
  return typeof text === 'string' && text.trim() !== '' && samePlaceholders(text, english) ? text : null;
}

/** Every key of the tier's own in `en`. */
function ownLeaves(en: unknown): string[] {
  const out: string[] = [];
  for (const prefix of OWN_PREFIXES) {
    const path = prefix.slice(0, -1);
    let node: unknown = en;
    for (const part of path.split('.')) {
      node = node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
    }
    leafKeys(node, path, out);
  }
  return out;
}

// ── One key ─────────────────────────────────────────────────────────────────

const SENTENCE_END = /(?<=[.!?。！？])\s+/;

function isAbort(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'AbortError';
}

function isQuota(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'QuotaExceededError';
}

/** One line through the translator, split at sentence ends if it is over the translator's input
 *  quota (measured 2026-10-10: the quota was Infinity and no string came near it, so this is a
 *  guard, not a path anyone has seen). Null — English for the key, and cached so — for what will
 *  be the same next time: a QuotaExceededError, or an answer that isn't text. Any other exception is THROWN, for
 *  the loop to keep out of the cache (the header says why); an abort is thrown as it came. */
async function translateLine(tr: TranslatorLike, text: string, signal: AbortSignal): Promise<string | null> {
  try {
    const quota = tr.inputQuota;
    if (typeof quota === 'number' && Number.isFinite(quota) && tr.measureInputUsage) {
      const usage = await tr.measureInputUsage(text, { signal });
      if (usage > quota) {
        const parts = text.split(SENTENCE_END);
        if (parts.length < 2) return null;
        const out: string[] = [];
        for (const part of parts) {
          const t = await translateLine(tr, part, signal);
          if (t === null) return null;
          out.push(t);
        }
        return out.join(' ');
      }
    }
    const out: unknown = await tr.translate(text, { signal });
    return typeof out === 'string' ? out : null;
  } catch (err) {
    if (isAbort(err) || signal.aborted) throw err;
    if (isQuota(err)) return null;
    throw err;
  }
}

/** A plain template (no plural block) translated and checked, or null. */
async function translatePlain(
  tr: TranslatorLike,
  template: string,
  marker: boolean,
  lang: string,
  signal: AbortSignal,
): Promise<string | null> {
  const m = mask(template, { marker });
  if (untranslatable(m)) return template;
  const outputs: (string | null)[] = [];
  for (const line of m.lines) {
    outputs.push(line.translate ? await translateLine(tr, line.text, signal) : null);
    if (line.translate && outputs[outputs.length - 1] === null) return null;
  }
  return unmask(m, outputs, { lang });
}

/**
 * One catalog template into `lang`, or null when it can't be done validly (English then shows
 * for the key, and the null is cached). THROWS when the translator itself threw — a failure that
 * says nothing about the key — and on an abort. Exported for the verify harness, which drives it
 * with fake translators.
 */
export async function translateTemplate(
  tr: TranslatorLike,
  template: string,
  key: string,
  lang: string,
  signal: AbortSignal,
): Promise<string | null> {
  const blocks = template.match(PLURAL_RE)?.length ?? 0;
  if (blocks > 1) return null;
  if (blocks === 1) {
    return translatePlural(template, lang, (sentence) => translatePlain(tr, sentence, false, lang, signal));
  }
  return translatePlain(tr, template, isMarkerPath(key), lang, signal);
}

// ── The work for one language ────────────────────────────────────────────────

/** Every string leaf under `node`, as dot-paths. */
function leafKeys(node: unknown, path: string, out: string[]): string[] {
  if (typeof node === 'string') {
    out.push(path);
  } else if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) leafKeys(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

type SessionHandle = { id: MachineLocale; stop: () => void };

/** One call's worth of a build's own text, waiting for the translator (translateFree). */
interface FreeJob {
  /** The passages still needing the translator, in the caller's order; `at` is the next. */
  items: OnDeviceItem[];
  at: number;
  results: Map<string, string>;
  /** The call's distinct keys settled so far (found before queueing counts), and in all. */
  done: number;
  total: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  settled: boolean;
  /** Resolves the caller's promise with `results` and takes the job off its queue. Runs once. */
  settle: () => void;
}

interface Session {
  id: MachineLocale;
  lang: string;
  ctrl: AbortController;
  /** The handle given to the runtime for this session's work (register, or a re-tap's), so a
   *  late stop() clears only its own and never a newer pick's of the same language. */
  handle: SessionHandle | null;
  translator: TranslatorLike | null;
  cache: MachineCache;
  /** What the cache held for this language at the start, consulted before translating a key. */
  cached: Map<string, CacheRecord>;
  /** Validated translations, by key, with the English each was made from. */
  entries: Map<string, MachineEntry>;
  /** Keys the translator couldn't do validly, with the English that failed. */
  failed: Map<string, string>;
  /** Keys the translator threw on this session, with their English: English for now, never
   *  cached, and tried again by a fresh translator (attach). */
  skipped: Map<string, string>;
  /** Translator exceptions in a row; MAX_CONSECUTIVE_ERRORS breaks the session. */
  errors: number;
  /** The translator threw too often in a row: the loop has stopped (breakSession). */
  broken: boolean;
  /** stop() has run: everything after it is a no-op. */
  stopped: boolean;
  /** The runtime is showing this language (its pick was adopted, or boot resumed it). */
  adopted: boolean;
  running: boolean;
  /** The loop's promise while it runs (the verify harness waits on it). */
  loop: Promise<void> | null;
  lastPublish: number;
  unpublished: boolean;
  publishTimer: ReturnType<typeof setTimeout> | null;
  /** Called once the keys on screen are all done (the pick's wait). */
  onScreenDone: (() => void) | null;
  queue: KeyQueue;
  /** A build's own text this session, by its cache key: the English and what became of it (null:
   *  it failed the checks or the quota, as a catalog key's null). Nothing a translator threw on. */
  free: Map<string, { src: string; text: string | null }>;
  /** Calls waiting for the translator: 'now' ones go ahead of the sweep, the rest after it. */
  freeNow: FreeJob[];
  freeLater: FreeJob[];
  /** A translator on its way without a click (boot's resume, the model on the device): a build's
   *  text asked for meanwhile waits for it rather than finding no translator. */
  arriving: Promise<void> | null;
}

/** Keys on screen first, then the sweep. Rebuilds its on-screen list only when the requested
 *  set, the namespaces read whole or the English catalog has grown. */
class KeyQueue {
  private english: unknown = null;
  private sweep: string[] = [];
  private sweepAt = 0;
  private onScreen: string[] = [];
  private onScreenAt = 0;
  private seenRequested = -1;
  private seenNamespaces = -1;

  isOnScreen(key: string): boolean {
    return requestedKeys().has(key) || namespacesReadWhole().has(key.split('.', 1)[0]);
  }

  /** The next key not done: on screen first, then the sweep. `onScreenOnly` stops short of the
   *  sweep (null when nothing on screen is waiting) without moving it on — so a build's text
   *  asked for now can go between the two (translateFree). */
  next(done: (key: string) => boolean, onScreenOnly = false): { key: string; onScreen: boolean } | null {
    const en = composeEnglish();
    if (en !== this.english) {
      this.english = en;
      this.sweep = leafKeys(en, '', []);
      this.sweepAt = 0;
      this.seenRequested = -1;
    }
    const requested = requestedKeys();
    const namespaces = namespacesReadWhole();
    if (requested.size !== this.seenRequested || namespaces.size !== this.seenNamespaces) {
      this.seenRequested = requested.size;
      this.seenNamespaces = namespaces.size;
      const list = [...requested];
      for (const ns of namespaces) leafKeys((en as Record<string, unknown>)[ns], ns, list);
      this.onScreen = list.filter((k) => !done(k));
      this.onScreenAt = 0;
    }
    while (this.onScreenAt < this.onScreen.length) {
      const key = this.onScreen[this.onScreenAt++];
      if (!done(key)) return { key, onScreen: true };
    }
    if (onScreenOnly) return null;
    while (this.sweepAt < this.sweep.length) {
      const key = this.sweep[this.sweepAt++];
      if (!done(key)) return { key, onScreen: false };
    }
    return null;
  }
}

let session: Session | null = null;

function newSession(id: MachineLocale, ctrl: AbortController): Session {
  return {
    id,
    lang: id.slice(3),
    ctrl,
    handle: null,
    translator: null,
    cache: machineCache(),
    cached: new Map(),
    entries: new Map(),
    failed: new Map(),
    skipped: new Map(),
    errors: 0,
    broken: false,
    stopped: false,
    adopted: false,
    running: false,
    loop: null,
    lastPublish: 0,
    unpublished: false,
    publishTimer: null,
    onScreenDone: null,
    queue: new KeyQueue(),
    free: new Map(),
    freeNow: [],
    freeLater: [],
    arriving: null,
  };
}

function destroyTranslator(tr: TranslatorLike | null): void {
  try {
    tr?.destroy?.();
  } catch {
    // already gone
  }
}

/** Lets `s`'s translator go (the loop sees it gone at its next key and ends). */
function releaseTranslator(s: Session): void {
  const tr = s.translator;
  s.translator = null;
  destroyTranslator(tr);
}

/** Stops `s`: aborts its work, lets its translator go, writes what it has. Its layer stays in
 *  the runtime for as long as the runtime shows it. Runs once; a second call is a no-op — so a
 *  pick that finds itself aborted can always stop its session without first asking who already
 *  has. */
function stop(s: Session): void {
  if (s.stopped) return;
  s.stopped = true;
  s.ctrl.abort();
  if (s.publishTimer) clearTimeout(s.publishTimer);
  s.publishTimer = null;
  releaseTranslator(s);
  settleFree(s);
  void s.cache.flush();
  if (session === s) session = null;
  if (s.handle && currentMachineSession() === s.handle) setMachineSession(null);
  if (getMachineMenu().session?.lang === s.lang) {
    // Still on screen (another device language's pick under way, say): served from what it
    // has, and choosing its row again brings a translator back. Off screen: nothing to say.
    // targetLocale, not the language shown now: a pick of another language stops this AFTER
    // deciding where the store is going (runtime setLocale), and the store is still on this
    // language until the switch lands — reading that would leave a line for a language the
    // reader has just left. (2026-10-10)
    updateMachineMenu({ session: targetLocale() === s.id ? { lang: s.lang, mode: 'partial' } : null });
  }
}

/** The translator threw MAX_CONSECUTIVE_ERRORS times in a row: stop asking it. What was made
 *  stays (published, if the language is on screen); the menu says the language couldn't be set
 *  up — the failed state a pick shows — and the row is live again ('partial'), so choosing it
 *  brings a fresh translator (runPick's re-tap → attach). A pick still waiting is let go, and
 *  fails (runPick). */
function breakSession(s: Session, err: unknown): void {
  console.warn(`[i18n] the device translator failed ${MAX_CONSECUTIVE_ERRORS} times in a row; translating into ${s.lang} has stopped`, err);
  s.broken = true;
  releaseTranslator(s);
  settleFree(s);
  void s.cache.flush();
  if (s.adopted) {
    if (s.unpublished) publishNow(s);
    updateMachineMenu({
      pick: { lang: s.lang, phase: 'failed', loaded: null },
      session: { lang: s.lang, mode: 'partial' },
    });
  }
  const done = s.onScreenDone;
  s.onScreenDone = null;
  done?.();
}

// A namespace a build registers after the sweep has ended brings keys the sweep never saw:
// the loop starts again for them. Installed once, with the first session.
let watchingRegistry = false;

function register(s: Session): void {
  if (session && session !== s) stop(session);
  session = s;
  s.handle = { id: s.id, stop: () => stop(s) };
  setMachineSession(s.handle);
  if (!watchingRegistry) {
    watchingRegistry = true;
    onRegistryChange(() => {
      const live = session;
      if (live?.translator && live.adopted && !live.running && !live.broken && !live.stopped) live.loop = run(live);
    });
  }
}

/** Whether `key` needs nothing more from the translator for the English it has now. */
function isDone(s: Session, key: string): boolean {
  const src = resolvePath(composeEnglish(), key);
  if (src === undefined || isMachineExcluded(key)) return true;
  if (s.entries.get(key)?.src === src) return true;
  return s.failed.get(key) === src || s.skipped.get(key) === src;
}

/** One of the tier's own keys into the session: its written text, or English (in memory only —
 *  nothing about an own key is ever cached). */
function applyOwn(s: Session, key: string, src: string): void {
  const text = ownText(s.lang, key, src);
  if (text === null) {
    s.entries.delete(key);
    s.failed.set(key, src);
    return;
  }
  s.failed.delete(key);
  s.entries.set(key, { src, text });
}

/** Lays what the cache holds for the current English into the session, and the tier's own
 *  sentences with it (so the first layer published already carries the disclosure). */
async function loadCache(s: Session): Promise<void> {
  s.cached = await s.cache.load(s.lang);
  const en = composeEnglish();
  for (const [key, rec] of s.cached) {
    if (isOwnKey(key)) continue; // a machine copy an older engine made: the written one stands
    const src = resolvePath(en, key);
    if (src === undefined || isMachineExcluded(key) || rec.h !== entryHash(ENGINE_VERSION, src)) continue;
    if (rec.v === null) s.failed.set(key, src);
    else s.entries.set(key, { src, text: rec.v });
  }
  for (const key of ownLeaves(en)) {
    const src = resolvePath(en, key);
    if (src !== undefined && !isMachineExcluded(key)) applyOwn(s, key, src);
  }
}

/** Whether the session holds anything translated besides the tier's own sentences — what decides
 *  between showing a stored language and holding it. */
function hasTranslations(s: Session): boolean {
  for (const key of s.entries.keys()) if (!isOwnKey(key)) return true;
  return false;
}

function publishNow(s: Session): void {
  if (s.publishTimer) clearTimeout(s.publishTimer);
  s.publishTimer = null;
  if (s.ctrl.signal.aborted || !s.adopted) return;
  s.lastPublish = Date.now();
  s.unpublished = false;
  publishMachine(s.id, new Map(s.entries));
  void s.cache.flush();
}

function schedulePublish(s: Session): void {
  if (s.publishTimer || !s.adopted) return;
  const wait = Math.max(0, s.lastPublish + PUBLISH_EVERY_MS - Date.now());
  s.publishTimer = setTimeout(() => {
    s.publishTimer = null;
    publishNow(s);
  }, wait);
}

/** A key's outcome — a translation, or null for one that failed the checks or the quota — into
 *  the session and the cache. Never called for a translator's exception (run keeps those out). */
function record(s: Session, key: string, src: string, text: string | null): void {
  const rec: CacheRecord = { h: entryHash(ENGINE_VERSION, src), v: text, at: Date.now() };
  s.cache.put(s.lang, key, rec);
  if (text === null) {
    s.failed.set(key, src);
    return;
  }
  s.failed.delete(key);
  s.entries.set(key, { src, text });
  s.unpublished = true;
}

// ── A build's own text ──────────────────────────────────────────────────────

/** Every call still waiting resolves with what it has (the session stopped or broke). */
function settleFree(s: Session): void {
  for (const job of [...s.freeNow, ...s.freeLater]) job.settle();
}

/** The first call in `queue` with a passage left for the translator; any that was aborted or has
 *  nothing left is settled on the way. */
function nextFreeJob(queue: FreeJob[]): FreeJob | null {
  while (queue.length) {
    const job = queue[0];
    if (job.settled) {
      queue.shift();
      continue;
    }
    if (job.signal?.aborted || job.at >= job.items.length) {
      job.settle(); // takes it off the queue
      continue;
    }
    return job;
  }
  return null;
}

/** One more of `job`'s keys settled: the caller told, and the call resolved after its last. A
 *  caller's progress callback that throws is the caller's, and never stops the loop. */
function advance(job: FreeJob): void {
  if (job.settled) return;
  job.done += 1;
  try {
    job.onProgress?.(job.done, job.total);
  } catch (err) {
    console.warn('[i18n] a device-translation progress callback threw', err);
  }
  if (job.at >= job.items.length) job.settle();
}

/** The next passage of `job` through the translator. True when the loop must end — the session
 *  was stopped, or the translator broke. A passage whose job was aborted while it was with the
 *  translator is still kept (session and cache) for the next call that asks for it. */
async function freeStep(s: Session, tr: TranslatorLike, job: FreeJob): Promise<boolean> {
  const item = job.items[job.at++];
  const { signal } = s.ctrl;
  let text: string | null;
  const known = s.free.get(item.cacheKey);
  if (known && known.src === item.text) {
    // Done since this call was queued, by an earlier one asking for the same passage.
    text = known.text;
  } else {
    try {
      text = await translatePlain(tr, item.text, false, s.lang, signal);
    } catch (err) {
      if (signal.aborted || isAbort(err)) return true;
      // The translator threw: absent from this answer, stored nowhere — as for a catalog key.
      s.errors += 1;
      if (s.errors >= MAX_CONSECUTIVE_ERRORS) {
        breakSession(s, err); // settles this call with the rest
        return true;
      }
      advance(job);
      return false;
    }
    if (signal.aborted) return true;
    s.errors = 0;
    s.free.set(item.cacheKey, { src: item.text, text });
    s.cache.put(s.lang, item.cacheKey, { h: entryHash(ENGINE_VERSION, item.text), v: text, at: Date.now() }, true);
  }
  if (text !== null && !job.settled) job.results.set(item.cacheKey, text);
  advance(job);
  return false;
}

/** The loop: one key at a time, on-screen keys first, until the catalog is done or the session
 *  is stopped — with a build's own text in between (the header gives the order). Safe to call
 *  again — a second call while it runs does nothing. */
async function run(s: Session): Promise<void> {
  if (s.running || !s.translator || s.broken || s.stopped) return;
  s.running = true;
  const { signal } = s.ctrl;
  const done = (k: string) => isDone(s, k);
  try {
    for (;;) {
      // Read each time: a session whose translator was let go (stopped, broken) ends here.
      const tr = s.translator;
      if (signal.aborted || !tr) return;
      let next = s.queue.next(done, true);
      if (!next) {
        // Nothing on screen is waiting.
        if (s.onScreenDone) {
          s.onScreenDone();
          s.onScreenDone = null;
        }
        const now = nextFreeJob(s.freeNow);
        if (now) {
          if (await freeStep(s, tr, now)) return;
          continue;
        }
        next = s.queue.next(done);
        if (!next) {
          const later = nextFreeJob(s.freeLater);
          if (later) {
            // The sweep's own last re-render doesn't wait behind a build's background text.
            if (s.unpublished) publishNow(s);
            if (await freeStep(s, tr, later)) return;
            continue;
          }
          break;
        }
      }
      const src = resolvePath(composeEnglish(), next.key);
      if (src === undefined) continue;
      const onScreen = next.onScreen || s.queue.isOnScreen(next.key);
      // The tier's own sentence: written, never sent (the header says why).
      if (isOwnKey(next.key)) {
        applyOwn(s, next.key, src);
        if (s.entries.has(next.key)) {
          s.unpublished = true;
          if (onScreen) schedulePublish(s);
        }
        continue;
      }
      // A key the cache had for this very English (a namespace registered after the cache was
      // read): taken from there, not translated again.
      const rec = s.cached.get(next.key);
      let text: string | null;
      if (rec && rec.h === entryHash(ENGINE_VERSION, src)) {
        text = rec.v;
      } else {
        try {
          text = await translateTemplate(tr, src, next.key, s.lang, signal);
        } catch (err) {
          if (signal.aborted || isAbort(err)) return;
          // The translator threw: English for this key for now, in memory only.
          s.skipped.set(next.key, src);
          s.errors += 1;
          if (s.errors >= MAX_CONSECUTIVE_ERRORS) {
            breakSession(s, err);
            return;
          }
          continue;
        }
        if (signal.aborted) return;
        s.errors = 0;
      }
      record(s, next.key, src, text);
      if (text !== null && onScreen) schedulePublish(s);
    }
    // The sweep is done: everything that can be translated is. One last re-render for it.
    if (s.unpublished) publishNow(s);
    void s.cache.flush();
  } finally {
    s.running = false;
  }
}

/** A translator for a session already on screen (boot's resume, a re-tap): it starts afresh —
 *  anything the last one threw on is tried again. */
function attach(s: Session, tr: TranslatorLike): void {
  if (s.ctrl.signal.aborted || s.stopped) {
    destroyTranslator(tr);
    return;
  }
  if (s.translator && s.translator !== tr) releaseTranslator(s);
  s.translator = tr;
  s.broken = false;
  s.errors = 0;
  s.skipped.clear();
  // And a fresh queue: the old one's sweep has moved past the keys just un-skipped, and would
  // never offer them again. Rescanning costs a lookup per key; everything done is passed over.
  s.queue = new KeyQueue();
  updateMachineMenu({ session: { lang: s.lang, mode: 'live' } });
  if (!s.running) s.loop = run(s);
}

function abortable(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Entry points ────────────────────────────────────────────────────────────

/**
 * A reader's pick, continued from the menu's click (machineMenu chooseMachineLanguage), which
 * already called Translator.create() — `created` — inside the click. Resolves once the language
 * is on screen, or the pick failed or was aborted.
 *
 * Every way out after an abort stops the session it registered (stop() runs once, so it doesn't
 * matter who got there first), and the pick's line under the menu goes with the abort itself —
 * adopted or not, at whatever stage — so no "Downloading…" outlives the work it described.
 */
export async function runPick(lang: string, created: Promise<TranslatorLike>, ctrl: AbortController): Promise<void> {
  const id = `mt:${lang}` as MachineLocale;
  const clearPick = () => {
    if (getMachineMenu().pick?.lang === lang) updateMachineMenu({ pick: null });
  };
  // Aborted while this chunk loaded (another row, another language): register nothing — a
  // session registered now would stop whatever replaced this pick.
  if (ctrl.signal.aborted) {
    clearPick();
    created.then(destroyTranslator, () => {});
    return;
  }
  ctrl.signal.addEventListener('abort', clearPick, { once: true });

  // The language already on screen, served from its cache: the tap that finishes the download
  // (or brings a fresh translator to a session whose last one broke). Its handle is the pick's
  // AND the session's: a pick of anything else must abort the download under way (its ctrl went
  // to create()) as well as stop the session, or the download carries on and the menu keeps
  // waiting on it.
  if (session && session.id === id && session.adopted && !session.stopped) {
    const s = session;
    s.handle = {
      id,
      stop: () => {
        ctrl.abort();
        stop(s);
      },
    };
    setMachineSession(s.handle);
    let tr: TranslatorLike;
    try {
      tr = await created;
    } catch (err) {
      if (ctrl.signal.aborted) {
        stop(s);
        return;
      }
      console.warn('[i18n] the device translator could not be created', err);
      updateMachineMenu({ pick: { lang, phase: 'failed', loaded: null } });
      return;
    }
    if (ctrl.signal.aborted || s.stopped) {
      destroyTranslator(tr);
      stop(s);
      return;
    }
    updateMachineMenu({ pick: null });
    attach(s, tr);
    return;
  }

  const s = newSession(id, ctrl);
  register(s);
  let tr: TranslatorLike;
  try {
    tr = await created;
  } catch (err) {
    stop(s);
    if (ctrl.signal.aborted) return;
    console.warn('[i18n] the device translator could not be created', err);
    updateMachineMenu({ pick: { lang, phase: 'failed', loaded: null } });
    return;
  }
  if (ctrl.signal.aborted || s.stopped) {
    destroyTranslator(tr);
    stop(s);
    return;
  }
  s.translator = tr;
  updateMachineMenu({ pick: { lang, phase: 'translate', loaded: 1 } });
  await loadCache(s);
  if (ctrl.signal.aborted || s.stopped) {
    stop(s);
    return;
  }

  // Translate what is on screen; switch when it is done, or after PICK_WAIT_MS.
  const onScreen = new Promise<void>((resolve) => {
    s.onScreenDone = resolve;
  });
  if (!s.running) s.loop = run(s);
  await Promise.race([onScreen, sleep(PICK_WAIT_MS), abortable(ctrl.signal)]);
  s.onScreenDone = null;
  if (ctrl.signal.aborted || s.stopped) {
    stop(s);
    return;
  }
  if (s.broken) {
    // The translator kept throwing before anything could be shown: the pick failed.
    stop(s);
    updateMachineMenu({ pick: { lang, phase: 'failed', loaded: null } });
    return;
  }
  s.adopted = true;
  s.lastPublish = Date.now();
  s.unpublished = false;
  updateMachineMenu({ pick: null, session: { lang, mode: 'live' } });
  await adoptMachine(id, new Map(s.entries));
  void s.cache.flush();
}

/**
 * Boot, for a stored `mt:` choice (runtime initI18n awaits this, within its wait): the cache in
 * at once, then the translator if the device has one ready; held if there is nothing to show.
 * The cache's read is bounded (cache.ts CACHE_LOAD_TIMEOUT_MS): a stalled store counts as an
 * empty one, so boot goes on to show the language from its translator, or hold it.
 */
export async function resumeMachine(id: MachineLocale): Promise<void> {
  const ctrl = new AbortController();
  const s = newSession(id, ctrl);
  register(s);
  await loadCache(s);
  if (ctrl.signal.aborted) {
    stop(s);
    return;
  }
  // The tier's own sentences don't count: on their own they are no translation to show.
  const cachedAny = hasTranslations(s);
  // What is cached shows straight away; the translator's answer can follow.
  if (cachedAny) {
    s.adopted = true;
    s.lastPublish = Date.now();
    publishMachine(id, new Map(s.entries));
  }

  const api = translatorApi();
  let availability: TranslatorAvailability | 'unsupported' = 'unsupported';
  if (api) {
    try {
      availability = await api.availability({ sourceLanguage: 'en', targetLanguage: s.lang });
    } catch {
      availability = 'unavailable';
    }
  }
  if (ctrl.signal.aborted) {
    stop(s);
    return;
  }

  if (api && availability === 'available') {
    if (!s.adopted) {
      // Nothing cached (the store was cleared, say), but the translator is ready: the language
      // comes up English-filled and fills in as keys are translated.
      s.adopted = true;
      s.lastPublish = Date.now();
      publishMachine(id, new Map(s.entries));
    }
    updateMachineMenu({ session: { lang: s.lang, mode: 'live' } });
    // No click needed: the model is on the device, so no download — and no activation — is.
    // Noted as arriving, so a build's text asked for in the meantime waits for it (translateFree).
    s.arriving = api
      .create({ sourceLanguage: 'en', targetLanguage: s.lang, signal: ctrl.signal })
      .then((tr) => attach(s, tr))
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        console.warn('[i18n] the device translator could not be created', err);
        updateMachineMenu({ session: { lang: s.lang, mode: 'partial' } });
      })
      .finally(() => {
        s.arriving = null;
      });
    return;
  }

  const needsTap = availability === 'downloadable' || availability === 'downloading';
  if (cachedAny) {
    updateMachineMenu({ session: { lang: s.lang, mode: needsTap ? 'partial' : 'cache' } });
    return;
  }
  // Nothing to show: held (rule 2) — the choice stays stored, the row says why.
  stop(s);
  holdMachine(id, needsTap ? 'needs-download' : 'unsupported');
}

/**
 * A build's own text into the device language on screen (onDevice.ts's translateOnDevice, which
 * says what a caller gets). What this session already made comes first, then the store — one read
 * of the keys asked for — and only what neither had goes to the translator, queued behind what
 * the catalog has on screen and, for 'now', ahead of the sweep. With no translator (a language
 * served from its cache, or a translator that broke) the answer is what the store had. Refused
 * while the languages are held or the screen is not in a device language; never rejects.
 */
export async function translateFree(
  items: readonly OnDeviceItem[],
  opts: OnDeviceOptions = {},
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const locale = getI18n().locale;
  if (LANGUAGES_HELD || !locale.startsWith('mt:') || opts.signal?.aborted) return results;
  // One entry per key: the first passage given for it.
  const byKey = new Map<string, OnDeviceItem>();
  for (const it of items) {
    if (typeof it?.cacheKey === 'string' && typeof it.text === 'string' && !byKey.has(it.cacheKey)) byKey.set(it.cacheKey, it);
  }
  const total = byKey.size;
  if (!total) return results;
  const lang = locale.slice(3);
  // The session serving the language on screen. None is a gap between two (a switch landing):
  // the store alone answers.
  const s = session && session.id === locale && !session.stopped ? session : null;
  const cache = s?.cache ?? machineCache();
  let done = 0;
  const found = (it: OnDeviceItem, text: string | null) => {
    if (text !== null) results.set(it.cacheKey, text);
    done += 1;
  };

  const misses: OnDeviceItem[] = [];
  for (const it of byKey.values()) {
    const known = s?.free.get(it.cacheKey);
    if (known && known.src === it.text) found(it, known.text);
    else misses.push(it);
  }
  const left: OnDeviceItem[] = [];
  if (misses.length) {
    const stored = await cache.loadFree(lang, misses.map((it) => it.cacheKey));
    for (const it of misses) {
      const rec = stored.get(it.cacheKey);
      if (rec && rec.h === entryHash(ENGINE_VERSION, it.text)) {
        s?.free.set(it.cacheKey, { src: it.text, text: rec.v });
        found(it, rec.v);
      } else {
        left.push(it);
      }
    }
  }
  try {
    opts.onProgress?.(done, total);
  } catch (err) {
    console.warn('[i18n] a device-translation progress callback threw', err);
  }
  if (!left.length || !s || s.stopped || opts.signal?.aborted) return results;
  if (!s.translator && s.arriving) {
    await Promise.race([s.arriving, opts.signal ? abortable(opts.signal) : new Promise<void>(() => {})]);
  }
  if (!s.translator || s.broken || s.stopped || opts.signal?.aborted) return results;

  return new Promise<Map<string, string>>((resolve) => {
    const job: FreeJob = {
      items: left,
      at: 0,
      results,
      done,
      total,
      onProgress: opts.onProgress,
      signal: opts.signal,
      settled: false,
      settle: () => {
        if (job.settled) return;
        job.settled = true;
        opts.signal?.removeEventListener('abort', job.settle);
        for (const q of [s.freeNow, s.freeLater]) {
          const i = q.indexOf(job);
          if (i >= 0) q.splice(i, 1);
        }
        void s.cache.flush();
        resolve(job.results);
      },
    };
    // An abort settles the call at once — between passages, from the caller's side: whatever is
    // with the translator then finishes and is kept, and nothing more of this call is sent.
    opts.signal?.addEventListener('abort', job.settle, { once: true });
    (opts.priority === 'background' ? s.freeLater : s.freeNow).push(job);
    if (!s.running) s.loop = run(s);
  });
}

/** Test seam (verify-i18n-machine): resolves when the running session's loop has ended — the
 *  sweep done, or the session stopped. */
export async function __whenIdleForTest(): Promise<void> {
  for (let i = 0; i < 10_000; i += 1) {
    const s = session;
    if (!s?.loop) return;
    await s.loop;
    if (session === s && !s.running) return;
  }
}

/** Test seam (verify-i18n-machine): the running session's state, for the checks that a broken
 *  translator stopped it — and whether a translator is attached, and how many calls of a build's
 *  text are waiting, for the checks on translateFree. */
export function __sessionForTest(): {
  lang: string;
  broken: boolean;
  running: boolean;
  skipped: number;
  translator: boolean;
  freeWaiting: number;
} | null {
  return session
    ? {
        lang: session.lang,
        broken: session.broken,
        running: session.running,
        skipped: session.skipped.size,
        translator: session.translator !== null,
        freeWaiting: session.freeNow.length + session.freeLater.length,
      }
    : null;
}

/** Test seam (verify-i18n-machine): stop everything, as on a fresh page. */
export function __resetEngineForTest(): void {
  if (session) stop(session);
  session = null;
}
