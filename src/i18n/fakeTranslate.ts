// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// DEVELOPMENT ONLY — a fake page translator that does to the DOM what Chrome's "Translate
// this page" does, so the translation-safety work can be tested without a browser
// translating for real (2026-10-09). Start it with `?fake-translate` in the URL (the value
// is the target language, default `fr`; `?fake-translate=1` also means French). main.tsx
// imports this module only behind import.meta.env.DEV, so a production build drops it.
//
// What it mimics, because these are what break React:
//   • `<html class="translated-ltr">` and `lang` set to the target;
//   • every non-blank text node REPLACED by
//       <font style="vertical-align: inherit;"><font style="vertical-align: inherit;">«…»</font></font>
//     with the original node DETACHED — so React's next write into it goes nowhere (the
//     frozen-readout failure) and its next removal of it throws (the blank-page one, unless
//     the translate guard is installed);
//   • new content translated as it appears (a MutationObserver over <body>, in batches).
// Skipped, as the real thing skips them: anything inside [translate="no"] or .notranslate,
// script, style, textarea, input, and contenteditable. Also skipped: SVG text — a <font>
// inside <svg> would not render at all, which is a failure this tool would be inventing;
// whether Chrome translates SVG text wasn't verified.
//
// The «» marks make translated text visible at a glance; text still bare after a re-walk is
// text React rewrote into a node the translator had already taken — the thing to look for.

const SKIP = '[translate="no"], .notranslate, script, style, textarea, input, [contenteditable], svg, noscript';
const RTL = new Set(['ar', 'he', 'fa', 'ur']);
const DEBOUNCE_MS = 120;

let observer: MutationObserver | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let restore: { lang: string; cls: string } | null = null; // the lang to put back, the class we added
/** Our own inner <font>s, so their text is never wrapped twice. */
const ours = new WeakSet<Node>();
/** Each outer <font> and the text node it replaced, for stopFakeTranslate(). */
const replaced = new Map<Element, Text>();

function shouldWrap(node: Text): boolean {
  if (!node.data.trim()) return false;
  const parent = node.parentElement;
  if (!parent || ours.has(parent)) return false;
  return !parent.closest(SKIP);
}

function wrap(node: Text): void {
  const doc = node.ownerDocument;
  const outer = doc.createElement('font');
  const inner = doc.createElement('font');
  outer.setAttribute('style', 'vertical-align: inherit;');
  inner.setAttribute('style', 'vertical-align: inherit;');
  const text = node.data;
  const lead = text.match(/^\s*/)?.[0] ?? '';
  const trail = text.match(/\s*$/)?.[0] ?? '';
  inner.textContent = `${lead}«${text.trim()}»${trail}`;
  outer.appendChild(inner);
  ours.add(inner);
  replaced.set(outer, node);
  node.parentNode?.replaceChild(outer, node);
}

function walk(root: Node): void {
  const doc = root.ownerDocument ?? document;
  const found: Text[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (shouldWrap(n as Text)) found.push(n as Text);
  }
  for (const node of found) wrap(node);
}

/** What the observer saw change since the last pass: added subtrees, rewritten text. */
const pending = new Set<Node>();

function translate(node: Node): void {
  if (!node.isConnected) return;
  if (node.nodeType === Node.TEXT_NODE) {
    if (shouldWrap(node as Text)) wrap(node as Text);
  } else {
    walk(node);
  }
}

// One pass, with the observer paused so our own replacements don't schedule another.
function translateNow(roots: Iterable<Node>): void {
  observer?.disconnect();
  for (const outer of replaced.keys()) if (!outer.isConnected) replaced.delete(outer);
  for (const root of roots) translate(root);
  observer?.takeRecords();
  observer?.observe(document.body, { subtree: true, childList: true, characterData: true });
}

// A pass at most every DEBOUNCE_MS, over only what changed. Not a trailing debounce: a
// readout that re-renders faster than the window (the timeline in playback) would hold a
// trailing one off forever, and new content would never be translated while it plays.
function onMutations(records: MutationRecord[]): void {
  for (const r of records) {
    if (r.type === 'characterData') pending.add(r.target);
    else r.addedNodes.forEach((n) => pending.add(n));
  }
  if (timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    const roots = [...pending];
    pending.clear();
    translateNow(roots);
  }, DEBOUNCE_MS);
}

/** Starts the fake translator if the URL asks for it. Returns whether it started. */
export function maybeStartFakeTranslate(): boolean {
  if (observer || typeof document === 'undefined') return Boolean(observer);
  const params = new URLSearchParams(location.search);
  if (!params.has('fake-translate')) return false;
  const asked = (params.get('fake-translate') ?? '').toLowerCase();
  const target = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(asked) ? asked : 'fr';

  const html = document.documentElement;
  const cls = RTL.has(target.split('-')[0]) ? 'translated-rtl' : 'translated-ltr';
  restore = { lang: html.lang, cls };
  html.classList.add(cls);
  html.lang = target;

  observer = new MutationObserver(onMutations);
  // The app root, then the rest of <body> — portals and anything else mounted straight into it.
  translateNow([document.getElementById('root') ?? document.body, document.body]);
  console.info(`[fakeTranslate] translating the page to "${target}" — stopFakeTranslate() undoes it`);
  return true;
}

/** Stops translating and puts back every original text node still replaceable — Chrome's
 *  "Show original". */
export function stopFakeTranslate(): void {
  observer?.disconnect();
  observer = null;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  pending.clear();
  for (const [outer, original] of replaced) {
    if (outer.isConnected) outer.parentNode?.replaceChild(original, outer);
  }
  replaced.clear();
  if (restore) {
    document.documentElement.lang = restore.lang;
    document.documentElement.classList.remove(restore.cls);
    restore = null;
  }
}
