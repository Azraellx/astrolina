// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Minor-body SOURCES — lets a downstream build add another place catalog minor
// bodies can come from, WITHOUT editing the window that picks them (a sibling of
// the place-search providers seam, whose idiom it follows). The core's own source
// is the curated set bundled in public/ephe/ (lib/minorBodies/bundled.ts); a
// registered source adds a second search scope — a hosted catalog, a specialist
// list — which appears as an extra chip in the Minor bodies window's scope row.
//
// A source answers two questions: which bodies match a query, and what the bytes
// of a body's ephemeris file are. The core validates those bytes itself before
// the engine ever sees them (lib/minorBodies/se1Header.ts), so a source only has
// to fetch. Sources own their strings, network discipline and (optional) access
// gate; the window only drives them. The open core registers none, so the window
// shows the bundled set alone and no chip row at all.
import type { EpheSpan } from '../minorBodies/ids';

/** One search result. */
export interface MinorBodyHit {
  /** MPC number. */
  n: number;
  /** Display name. May be empty for a numbered body whose name the source doesn't
   *  know yet (the name then arrives with the file's own header). */
  name: string;
  /** Optional second line under the name (a class, a note). */
  sub?: string;
}

/** A source's access state — the place-search gate's shape and semantics.
 *  `locked` renders its chip and its bodies inert with `note` shown; `hidden`
 *  withholds the scope entirely (closed is not the same as not-on-offer). */
export interface MinorBodySourceGate {
  locked: boolean;
  note: string;
  /** Short badge on the chip / a held row while locked (a tier tag, say). */
  pill?: string;
  hidden?: boolean;
}

export interface MinorBodySource {
  /** Stable id, persisted with every body the user adds from this source; must
   *  not collide with the built-in 'bundled'. */
  id: string;
  /** Scope-chip label (already localized). */
  label: string;
  /** Input placeholder while THIS scope is active (omit to keep the window's). */
  placeholder?: string;
  /** Below this many characters the scope reports nothing (a number always searches). */
  minQueryLen: number;
  /** Keystroke settle time before this scope is queried. */
  debounceMs: number;
  /** Called per render; return null (or omit) when the source is always open.
   *  While locked, bodies already on the reader's list from this source are HELD —
   *  kept, shown, never fetched — and return by themselves when it opens again. */
  gate?: () => MinorBodySourceGate | null;
  search(query: string, opts: { limit: number; signal?: AbortSignal }): Promise<MinorBodyHit[]>;
  /** Which of body `n`'s two files this source serves it from. Omit it and every body is
   *  served SHORT — the bundled set's case. A source says 'long' for a body whose short
   *  file it can't serve and whose long one it can (a hosted catalog whose copy of that
   *  short file failed its checks). The loader asks this first, then asks
   *  {@link fetchFile} for that span and checks the bytes as THAT span's file — so a
   *  source can't hand over one file while naming the other. May throw, as fetchFile
   *  may, and the body's row reads the same way. */
  spanFor?(n: number): EpheSpan | Promise<EpheSpan>;
  /** The raw bytes of body `n`'s ephemeris file in `span` — 'short' unless
   *  {@link spanFor} said otherwise. Throw a {@link MinorBodySourceFailure}
   *  to put a specific sentence on the body's row (no session, not in the catalog,
   *  upstream down); anything else reads as a generic load failure. */
  fetchFile(n: number, span: EpheSpan, signal?: AbortSignal): Promise<ArrayBuffer>;
}

/** Thrown by a source to put a SPECIFIC, user-facing sentence on a body's row
 *  instead of the generic failure line — the source knows why it failed. */
export class MinorBodySourceFailure extends Error {
  readonly note: string;
  constructor(note: string) {
    super(note);
    this.name = 'MinorBodySourceFailure';
    this.note = note;
  }
}

const sources: MinorBodySource[] = [];

/** Register a source (downstream builds only). Call once at startup, before the
 *  app first renders. Registration order = chip order (after the bundled set). */
export function registerMinorBodySource(s: MinorBodySource): void {
  if (s.id === 'bundled' || sources.some((x) => x.id === s.id)) return;
  sources.push(s);
}

/** Every registered source (empty in the open core). The built-in bundled
 *  source is not in this list — see lib/minorBodies/bundled.ts. */
export function getMinorBodySources(): MinorBodySource[] {
  return sources;
}
