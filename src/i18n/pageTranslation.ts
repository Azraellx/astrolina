// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The bridge between a browser's page translator and the app's own catalogs (2026-10-09).
// A page translator works on the DOM behind React's back, and nothing tells a page it is
// being translated — so this watches for the marks one leaves, and reports
// { active, target }: whether the page is being translated, and into which language when
// that can be read. Two things act on it:
//   • the translate offer (components/TranslateOffer), which, when the target is a language
//     we ship, offers our own catalog in that language's own words;
//   • a language pick (runtime.ts setLocale's after-pick hook, installed here), which reloads
//     while a translator is at work, because the translation outlives a switch and a reload
//     does not.
//
// The marks, in the order they are cheap to see:
//   • a class on <html> — `translated-ltr` / `translated-rtl`, which Chrome's translator sets;
//   • a `lang` on <html> that the runtime did not write (lastWrittenLang). A translator
//     re-declares the page in the language it produced, which is also where `target` comes
//     from — only ever that, never a guess;
//   • its own nodes under the page: Chrome wraps each text it translates in
//     `<font style="vertical-align: inherit;">`, and Edge's translator marks elements with
//     `_msttexthash`. Nothing announces these, so they are PROBED for — every 5 s while the
//     tab is visible, and not at all once the page is known to be translated (the answer
//     cannot get more true) or while the tab is hidden (nobody is reading it).
// The first two are watched by a MutationObserver on <html>, so they are seen at once. Any
// change there also re-probes on the spot, which is how the probe's answer clears when the
// reader asks for the original back.
//
// Never writes storage, never writes the DOM. Starts with its first subscriber
// (usePageTranslation) and stops with its last, so a build that mounts nothing reading it pays
// nothing. Touches no DOM at import time.
import { useSyncExternalStore } from 'react';
import { lastWrittenLang, setAfterLocalePick } from './runtime';

export interface PageTranslation {
  /** A browser's page translator is translating this page now. */
  active: boolean;
  /** The base language tag ('es', 'pt') the translator declared the page in, or null when it
   *  can't be read — translated, but into what, the page doesn't say. */
  target: string | null;
}

const IDLE: PageTranslation = { active: false, target: null };
const PROBE_MS = 5000;
const TRANSLATED_CLASSES = ['translated-ltr', 'translated-rtl'];
const TRANSLATED_NODES = '#root font[style*="vertical-align"], [_msttexthash]';

let state: PageTranslation = IDLE;
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;
let probeTimer: ReturnType<typeof setInterval> | null = null;
let probeHit = false;
let langAtStart: string | null = null;
let reloading = false;

function baseTag(lang: string): string | null {
  const base = lang.trim().toLowerCase().split('-')[0];
  return /^[a-z]{2,3}$/.test(base) ? base : null;
}

// The `lang` this app put on <html>: the runtime's last write, or — for a build that mounted
// this without running initI18n — whatever was there when the bridge started (index.html's
// boot script, or its static attribute).
function ourLang(): string {
  return (lastWrittenLang() ?? langAtStart ?? '').trim().toLowerCase();
}

function read(): PageTranslation {
  const html = document.documentElement;
  const lang = (html.getAttribute('lang') ?? '').trim();
  const foreign = lang !== '' && lang.toLowerCase() !== ourLang();
  const classed = TRANSLATED_CLASSES.some((c) => html.classList.contains(c));
  const active = classed || foreign || probeHit;
  return { active, target: active && foreign ? baseTag(lang) : null };
}

function probe(): void {
  try {
    probeHit = document.querySelector(TRANSLATED_NODES) !== null;
  } catch {
    probeHit = false;
  }
}

// Probing runs only while it could still learn something and someone could be reading it.
function syncProbe(): void {
  const want = observer !== null && !state.active && document.visibilityState === 'visible';
  if (want && probeTimer === null) {
    probeTimer = setInterval(() => {
      probe();
      update();
    }, PROBE_MS);
  } else if (!want && probeTimer !== null) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
}

function update(): void {
  const next = read();
  if (next.active !== state.active || next.target !== state.target) {
    state = next;
    for (const fn of [...listeners]) fn();
  }
  syncProbe();
}

function onHtmlChange(): void {
  probe();
  update();
}

// A pick that moved the language, made while a translator is at work: reload (runtime.ts
// setLocale says why). Re-read first — the class and lang are always current, but the probe
// may be up to 5 s behind.
function onPick(): void {
  probe();
  update();
  if (state.active) reloadUntranslated();
}

function start(): void {
  if (observer || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  langAtStart = document.documentElement.getAttribute('lang');
  observer = new MutationObserver(onHtmlChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'lang'] });
  document.addEventListener('visibilitychange', syncProbe);
  setAfterLocalePick(onPick);
  // A translator may already be at work: one set to translate this site automatically can
  // start before the app has mounted, and its marks were made before anything watched.
  probe();
  update();
}

function stop(): void {
  if (!observer) return;
  observer.disconnect();
  observer = null;
  document.removeEventListener('visibilitychange', syncProbe);
  setAfterLocalePick(null);
  if (probeTimer !== null) clearInterval(probeTimer);
  probeTimer = null;
  probeHit = false;
  state = IDLE;
}

/** The bridge's current answer — the same object until it changes. IDLE until something
 *  subscribes. */
export function getPageTranslation(): PageTranslation {
  return state;
}

/** Calls `fn` whenever the answer changes; the first subscriber starts the bridge, the last
 *  one out stops it. Returns the unsubscribe. */
export function subscribePageTranslation(fn: () => void): () => void {
  listeners.add(fn);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) stop();
  };
}

/** The bridge's answer, for a component: { active, target }. */
export function usePageTranslation(): PageTranslation {
  return useSyncExternalStore(subscribePageTranslation, getPageTranslation, () => IDLE);
}

/** Reloads the page, once however many callers ask. The way out of a browser's page
 *  translation: it lasts for the page load, and the reload comes back untranslated because
 *  index.html's boot script declares the reader's language before the browser looks. */
export function reloadUntranslated(): void {
  if (reloading) return;
  reloading = true;
  try {
    location.reload();
  } catch {
    reloading = false;
  }
}
