// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Discreet mode — blank the details, keep the app.
//
// A chart library is a list of real people and the exact minute and place each
// was born. That is ordinary working data right up until someone else can see
// the screen: a client glancing over while you look something up, a friend
// beside you, a shared screen. The names alone are enough to be a problem, and
// a birth date and place together are more identifying than most people expect.
//
// So: one toggle that blanks every identifying value, the way a banking app
// blanks balances. Everything stays navigable — rows are still there, still in
// order, still selectable — because a mode that makes the app unusable is a mode
// nobody turns on.
//
// What is NOT hidden is as deliberate as what is. The map and its lines stay
// exactly as they were: a line across the Pacific says nothing about whose chart
// it is, and blanking the actual work would defeat the point of being able to
// keep working. Neither does this touch anything being deliberately produced —
// the chart editor, an export, a share link — where hiding the data from the
// person who asked for it would be a bug rather than a feature.
//
// This is a courtesy against shoulders, not a security control. It is a
// per-device preference with no password, and anything already exported stays
// exported. Said plainly here so nobody mistakes it for more than it is.

import { useSyncExternalStore } from 'react';

const KEY = 'astro:discreet:v1';

const DOT = '•';

/** Long values are blanked to a fixed run of dots rather than their true length:
 *  a 24-dot blob would leak how long the name is and wreck the layout besides. */
const MAX_DOTS = 8;

function load(): boolean {
  try {
    // Default OFF. A library that opened blank every time would train people to
    // switch it off and leave it off.
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let on = load();
const listeners = new Set<() => void>();

/** Whether discreet mode is on. Readable outside React. */
export function isDiscreet(): boolean {
  return on;
}

export function subscribeDiscreet(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function setDiscreet(next: boolean): void {
  if (next === on) return;
  on = next;
  try {
    localStorage.setItem(KEY, next ? '1' : '0');
  } catch {
    // An unavailable store costs the preference its memory, not its effect.
  }
  for (const l of listeners) l();
}

export function toggleDiscreet(): void {
  setDiscreet(!on);
}

/** Subscribe a component to the mode. */
export function useDiscreet(): boolean {
  return useSyncExternalStore(subscribeDiscreet, isDiscreet, () => false);
}

// ── Masks ───────────────────────────────────────────────────────────────────

function dots(n: number): string {
  return DOT.repeat(Math.max(1, Math.min(n, MAX_DOTS)));
}

/**
 * A name with its initials left standing: "Lina Grosso" becomes "L•••• G•••••".
 *
 * The initials are what make the mode usable rather than merely private — you
 * can still find the row you meant among twenty, and still tell two charts
 * apart, without the name being readable across a table.
 */
export function maskName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return dots(3);
  return words
    .slice(0, 3)
    .map((w) => {
      const chars = [...w];
      return chars.length <= 1 ? chars[0] ?? DOT : chars[0] + dots(chars.length - 1);
    })
    .join(' ');
}

/** Any other identifying text — a place, a folder name — blanked outright.
 *  No initial here: a place's first letter narrows it down far more than a
 *  person's does, and there is no list to navigate by it. */
export function maskText(text: string): string {
  const t = text.trim();
  return t ? dots(t.length) : '';
}

export const MASK_DATE = '•• ••• ••••';
export const MASK_TIME = '••:••';

/** Everything a surface needs, already resolved for the current mode. Callers
 *  render `id.name(chart.name)` and stop thinking about it. */
export interface Identity {
  on: boolean;
  name: (value: string) => string;
  text: (value: string) => string;
  date: (value: string) => string;
  time: (value: string) => string;
}

const PLAIN: Identity = {
  on: false,
  name: (v) => v,
  text: (v) => v,
  date: (v) => v,
  time: (v) => v,
};

const MASKED: Identity = {
  on: true,
  name: maskName,
  text: maskText,
  date: () => MASK_DATE,
  time: () => MASK_TIME,
};

/** The mask set for the current mode. Stable between changes, so it can sit in
 *  a dependency array without re-running everything downstream. */
export function identityFor(discreet: boolean): Identity {
  return discreet ? MASKED : PLAIN;
}

export function useIdentity(): Identity {
  return identityFor(useDiscreet());
}
