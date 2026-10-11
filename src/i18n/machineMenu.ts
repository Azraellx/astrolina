// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The Language menu's half of the on-device tier (2026-10-10): which languages the device can
// translate into, the click that starts one, and what the menu shows while it gets ready. This
// file is small and loads with the menu; the work itself — masking, plurals, the cache, the
// translator loop — is i18n/machine/, a lazy chunk fetched only when a row is chosen (or a stored
// choice needs it at boot, runtime.ts).
//
// The browser's on-device Translator API is typed here, minimally: the TypeScript DOM library
// doesn't carry it yet. Nothing here names a browser or vendor to the reader — the copy says
// "on this device", which is what it is.
import { useSyncExternalStore } from 'react';
import { isShippedLocale } from './catalog';
import { LANGUAGES_HELD } from './languageHold';
import { currentMachineSession, getI18n, setMachineSession } from './runtime';
import type { MachineLocale } from './types';

export type TranslatorAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

/** One translator: English into one language. */
export interface TranslatorLike {
  translate(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  measureInputUsage?(input: string, options?: { signal?: AbortSignal }): Promise<number>;
  readonly inputQuota?: number;
  destroy?(): void;
}

export interface TranslatorFactory {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorAvailability>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    signal?: AbortSignal;
    monitor?: (m: EventTarget) => void;
  }): Promise<TranslatorLike>;
}

/** The device's translator API, or null where this browser has none. */
export function translatorApi(): TranslatorFactory | null {
  try {
    if (typeof self === 'undefined' || !('Translator' in self)) return null;
    return ((self as unknown as { Translator?: TranslatorFactory }).Translator ?? null) || null;
  } catch {
    return null;
  }
}

/** The languages offered for translating on the device, each by its own name. Never a language
 *  this app ships (its own catalog is the better translation, and its row is above), and never a
 *  right-to-left one: the layout is left-to-right throughout, and mirroring it is work no
 *  translation of strings can do. A language the device can't translate into is filtered out
 *  when the menu's section opens (availability()), so listing one costs nothing. */
export const MACHINE_CANDIDATES: readonly { lang: string; autonym: string }[] = [
  { lang: 'fr', autonym: 'Français' },
  { lang: 'it', autonym: 'Italiano' },
  { lang: 'nl', autonym: 'Nederlands' },
  { lang: 'pl', autonym: 'Polski' },
  { lang: 'cs', autonym: 'Čeština' },
  { lang: 'sk', autonym: 'Slovenčina' },
  { lang: 'hu', autonym: 'Magyar' },
  { lang: 'ro', autonym: 'Română' },
  { lang: 'bg', autonym: 'Български' },
  { lang: 'uk', autonym: 'Українська' },
  { lang: 'el', autonym: 'Ελληνικά' },
  { lang: 'hr', autonym: 'Hrvatski' },
  { lang: 'da', autonym: 'Dansk' },
  { lang: 'sv', autonym: 'Svenska' },
  { lang: 'no', autonym: 'Norsk' },
  { lang: 'fi', autonym: 'Suomi' },
  { lang: 'ja', autonym: '日本語' },
  { lang: 'ko', autonym: '한국어' },
  { lang: 'zh', autonym: '中文（简体）' },
  { lang: 'zh-Hant', autonym: '中文（繁體）' },
  { lang: 'vi', autonym: 'Tiếng Việt' },
  { lang: 'id', autonym: 'Bahasa Indonesia' },
  { lang: 'th', autonym: 'ไทย' },
  { lang: 'hi', autonym: 'हिन्दी' },
].filter((c) => !isShippedLocale(c.lang));

/** Whether the Language menu offers the on-device section at all. False while the release hold
 *  stands (languageHold.ts, 2026-10-10): the section is then ABSENT, not greyed — a dimmed
 *  section would announce a tier nobody has been told about — and with it every row a stored
 *  `mt:` choice would have kept listed. One answer, read by the menu and by verify-i18n-runtime's
 *  held section, so the two can't come to disagree about it. */
export function machineTierOffered(): boolean {
  return !LANGUAGES_HELD;
}

/** A candidate's own name, or its tag where it isn't listed (a stored choice from elsewhere). */
export function machineAutonym(lang: string): string {
  return MACHINE_CANDIDATES.find((c) => c.lang === lang)?.autonym ?? lang;
}

export interface MachineMenuState {
  /** Each candidate's availability on this device, from the last check (empty before one). */
  availability: Readonly<Record<string, TranslatorAvailability>>;
  /** A pick on its way: downloading the model (`loaded` 0–1 once known), translating what is on
   *  screen, or failed. Null when nothing is being picked. */
  pick: { lang: string; phase: 'download' | 'translate' | 'failed'; loaded: number | null } | null;
  /** The device language on screen and how it is being served:
   *    'live'    — the translator is working; anything new is translated as it appears;
   *    'partial' — from the cache only, because the model needs downloading again, which takes
   *                the reader's tap (the row says so);
   *    'cache'   — from the cache only, because this browser has no translator any more. */
  session: { lang: string; mode: 'live' | 'partial' | 'cache' } | null;
}

let state: MachineMenuState = { availability: {}, pick: null, session: null };
const listeners = new Set<() => void>();

export function getMachineMenu(): MachineMenuState {
  return state;
}

export function subscribeMachineMenu(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** For machine/engine.ts and this file: merge `patch` into the menu's state and notify. */
export function updateMachineMenu(patch: Partial<MachineMenuState>): void {
  state = { ...state, ...patch };
  for (const fn of [...listeners]) fn();
}

/** The menu's state, for a component. */
export function useMachineMenu(): MachineMenuState {
  return useSyncExternalStore(subscribeMachineMenu, getMachineMenu, getMachineMenu);
}

let checking: Promise<void> | null = null;

/** Asks the device which candidates it can translate into. Called when the Language section
 *  opens and when its menu does — never at boot: a reader who never opens it costs the device
 *  nothing. Writes nothing anywhere. */
export function refreshMachineAvailability(): Promise<void> {
  // Under the release hold the device isn't asked at all: there is no section to fill.
  if (!machineTierOffered()) return Promise.resolve();
  const api = translatorApi();
  if (!api) return Promise.resolve();
  if (checking) return checking;
  checking = (async () => {
    const next: Record<string, TranslatorAvailability> = {};
    await Promise.all(
      MACHINE_CANDIDATES.map(async (c) => {
        try {
          next[c.lang] = await api.availability({ sourceLanguage: 'en', targetLanguage: c.lang });
        } catch {
          next[c.lang] = 'unavailable';
        }
      }),
    );
    updateMachineMenu({ availability: next });
  })().finally(() => {
    checking = null;
  });
  return checking;
}

let pending: { lang: string; ctrl: AbortController } | null = null;

/**
 * The reader chose a device language. MUST be called synchronously from the click that chose it
 * — HintMenu's row onClick → onSelect → onChange is synchronous all the way down — because the
 * first thing it does is `Translator.create()`, and a model that still has to download may only
 * be fetched inside the reader's own activation, which create() then uses up (tested 2026-10-10:
 * a second create() in the same handler was refused for want of a gesture). Everything after
 * it — loading the engine, the cache, translating what is on screen, switching — happens later,
 * and choosing any other language aborts all of it (one AbortController, handed to the runtime
 * as the work in progress, so a pick made anywhere stops it).
 */
export function chooseMachineLanguage(lang: string): Promise<void> {
  // Refused under the release hold, before the translator is touched or the engine's chunk is
  // fetched: the menu offers no such row then, and this keeps any other route from starting one.
  if (!machineTierOffered()) return Promise.resolve();
  const api = translatorApi();
  if (!api) return Promise.resolve();
  const id = `mt:${lang}` as MachineLocale;
  if (pending?.lang === lang) return Promise.resolve(); // already on its way
  const s = getI18n();
  if (s.locale === id && state.session?.lang === lang && state.session.mode === 'live') return Promise.resolve();
  pending?.ctrl.abort();
  const ctrl = new AbortController();
  pending = { lang, ctrl };
  // The pick's line under the menu goes with its abort — whoever aborts it (another row, a
  // shipped language, the session handle below) and at whatever stage, including before the
  // engine's chunk has loaded or when that load then fails, where the engine's own clearing
  // never runs and "Downloading…" would otherwise stay up for work that has stopped. At the
  // abort itself, synchronously, so a newer pick's line (set after this abort) is never the one
  // cleared. (2026-10-10)
  ctrl.signal.addEventListener(
    'abort',
    () => {
      if (state.pick?.lang === lang) updateMachineMenu({ pick: null });
    },
    { once: true },
  );
  // A language the device reported 'available' has its model already: nothing downloads, so the
  // pick is translating from the first moment, and any progress event the translator still sends
  // for the model it has is ignored — the line never flashes "Downloading… 0%" for a download
  // that isn't happening. (2026-10-10)
  const ready = state.availability[lang] === 'available';
  let created: Promise<TranslatorLike>;
  try {
    created = api.create({
      sourceLanguage: 'en',
      targetLanguage: lang,
      signal: ctrl.signal,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          if (ready || pending?.ctrl !== ctrl || ctrl.signal.aborted) return;
          const { loaded, total } = e as ProgressEvent;
          // The current API reports a fraction; an older shape reported bytes of a total.
          const fraction = total > 1 ? loaded / total : loaded;
          updateMachineMenu({ pick: { lang, phase: 'download', loaded: Math.max(0, Math.min(1, fraction)) } });
        });
      },
    });
  } catch (err) {
    created = Promise.reject(err);
  }
  // The engine attaches its own handler once its chunk has loaded; until then a rejection (an
  // abort, an unsupported pair) must not surface as an unhandled one.
  created.catch(() => {});
  updateMachineMenu({ pick: ready ? { lang, phase: 'translate', loaded: 1 } : { lang, phase: 'download', loaded: null } });
  // Until the engine registers its own session, the pick is the work in progress: choosing any
  // other language — from this menu or anywhere else — aborts it, and stops whatever the engine
  // was still doing for the device language before it.
  const before = currentMachineSession();
  setMachineSession({
    id,
    stop: () => {
      ctrl.abort();
      if (before && before.id !== id) before.stop();
    },
  });
  return import('./machine/engine')
    .then((m) => {
      if (!m?.runPick) throw new Error('the on-device translation module did not load');
      return m.runPick(lang, created, ctrl);
    })
    .catch((err) => {
      if (ctrl.signal.aborted) return;
      console.warn('[i18n] device translation could not start', err);
      updateMachineMenu({ pick: { lang, phase: 'failed', loaded: null } });
    })
    .finally(() => {
      if (pending?.ctrl === ctrl) pending = null;
    });
}

/** Forgets a failed pick's line under the menu (the reader has seen it and moved on). */
export function clearMachinePick(): void {
  if (state.pick?.phase === 'failed') updateMachineMenu({ pick: null });
}

/** Test seam (verify-i18n-machine): back to a fresh page. */
export function __resetMachineMenuForTest(): void {
  pending?.ctrl.abort();
  pending = null;
  checking = null;
  state = { availability: {}, pick: null, session: null };
}
