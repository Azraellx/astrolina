// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Whether the reader has accepted the translations' notice on this device (2026-10-13) — the one
// sentence on what a translation is worth (settings.languageNotice). Two places show it: the
// Language menu, before its list, and a card for a translation that reached the screen some other
// way (components/LanguageNoticeCard). One answer covers both, so a reader who accepts it in one is
// not asked again in the other, in this tab or any other. Only the reader's own Understood writes
// it; nothing here is written on their behalf.
import { useSyncExternalStore } from 'react';

const KEY = 'astro:language-notice-accepted:v1';

let accepted: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function notify(): void {
  for (const fn of listeners) fn();
}

/** True once the reader has pressed Understood on this device (or in this page load, where storage
 *  is blocked). */
export function languageNoticeAccepted(): boolean {
  if (accepted === null) accepted = read();
  return accepted;
}

/** The reader's Understood, from the menu or the card. */
export function acceptLanguageNotice(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Storage blocked: accepted for this page load; it asks again on the next.
  }
  accepted = true;
  notify();
}

// Another tab's answer: the card or the menu there wrote the key.
function onStorage(e: StorageEvent): void {
  if (e.key !== KEY && e.key !== null) return;
  const now = read();
  if (now === accepted) return;
  accepted = now;
  notify();
}

function subscribe(fn: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** languageNoticeAccepted(), live. */
export function useLanguageNoticeAccepted(): boolean {
  return useSyncExternalStore(subscribe, languageNoticeAccepted, languageNoticeAccepted);
}
