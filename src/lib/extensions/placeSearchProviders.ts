// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Place-search SCOPES — lets a downstream build add another way of resolving a
// typed query to a point, WITHOUT editing the surfaces that ask for one (a
// sibling of the local-space anchors seam next door). The core's own scope
// searches the bundled offline place index; a registered provider adds a second
// scope — a finer-grained index, a specialist gazetteer, an online service —
// which appears as an extra chip in the shared place-search field's scope row,
// on every surface that mounts the field, at once.
//
// Providers own their own strings, network discipline and (optional) access
// gate; the field only drives them. The open core registers none, so the field
// renders a single scope and no chip row at all.

import type { PlaceKind } from '../atlas/cityLookup';

/** One search result. `lat`/`lng` are what the host ultimately consumes. */
export interface PlaceSearchHit {
  label: string;
  lat: number;
  lng: number;
  /** Precision class, when the provider knows it (the offline index does). */
  kind?: PlaceKind;
  /** A map zoom that frames this hit — hosts that fly the camera read it. */
  zoom?: number;
  /** Optional second line under the label (a district, a region, a note). */
  sub?: string;
}

export interface PlaceSearchQuery {
  /** Bias results toward this point, when the host has a meaningful one. */
  bias?: { lat: number; lng: number };
  limit: number;
  /** Aborted when a newer query supersedes this one. */
  signal?: AbortSignal;
}

/** A provider's access state. `locked` renders its chip inert with `note` shown
 *  under the input, so an unavailable scope is advertised rather than hidden. */
export interface PlaceSearchGate {
  locked: boolean;
  note: string;
  /** Short badge on the chip while locked (a tier tag, say). */
  pill?: string;
}

export interface PlaceSearchProvider {
  /** Stable id; must not collide with the built-in 'places'. */
  id: string;
  /** Scope-chip label. Providers own their strings (already localized). */
  label: string;
  /** Input placeholder while THIS scope is active. A scope changes what you're
   *  being asked for ("City, country" vs a street), so the host's placeholder —
   *  which describes the built-in scope — would go stale the moment you switch.
   *  Omit to keep whatever the host set. */
  placeholder?: string;
  /** Below this many characters the scope reports nothing. */
  minQueryLen: number;
  /** Keystroke settle time before this scope is queried. */
  debounceMs: number;
  /** Called per render; return null (or omit) when the scope is always open. */
  gate?: () => PlaceSearchGate | null;
  search(query: string, opts: PlaceSearchQuery): Promise<PlaceSearchHit[]>;
}

/** Thrown by a provider to put a SPECIFIC, user-facing sentence under the input
 *  instead of the field's generic failure line — the provider knows why it
 *  failed (no session, budget spent, upstream down); the field never does. */
export class PlaceSearchFailure extends Error {
  readonly note: string;
  constructor(note: string) {
    super(note);
    this.name = 'PlaceSearchFailure';
    this.note = note;
  }
}

// ── Standing groups ─────────────────────────────────────────────────────────
// The choices a field can offer BEFORE anything is typed — places the user
// already has a relationship with. The core has no such list of its own (it
// keeps no per-user data), so a downstream build contributes one here and every
// field that opts in shows it. One registration, every host: the alternative is
// each window hand-building the same four groups.

export interface PlaceSearchLibraryEntry {
  id: string;
  label: string;
  /** Second line under the label (the place behind a named spot, say). */
  sub?: string;
  /** Small trailing tag on the row. */
  tag?: string;
  /** A leading mark for a row that belongs to a classified set — the glyph and
   *  colour that set already uses elsewhere, so the classification reads the
   *  same here as it does on the map. `label` names it for assistive tech; the
   *  glyph itself is decorative. */
  mark?: { glyph: string; color?: string; label?: string };
  lat: number;
  lng: number;
  /** Framing hint for hosts that fly the camera. */
  zoom?: number;
}

export interface PlaceSearchLibraryGroup {
  id: string;
  label: string;
  entries: PlaceSearchLibraryEntry[];
  /** Reveal this many rows at first — for a group with no natural length limit. */
  pageSize?: number;
  /** Wording for the reveal control (the contributor owns its copy). */
  moreLabel?: (remaining: number) => string;
}

export interface PlaceSearchLibrary {
  /** Called during render and MAY use hooks — which is why registration must
   *  happen once at startup, before the first render, so the hook order a field
   *  runs can never change between renders. */
  use(): PlaceSearchLibraryGroup[];
}

let library: PlaceSearchLibrary | null = null;

/** Install the standing-groups contributor (downstream builds only). Last call
 *  wins; null clears. The open core registers none, so opted-in fields simply
 *  show nothing above their results. */
export function registerPlaceSearchLibrary(lib: PlaceSearchLibrary | null): void {
  library = lib;
}

export function getPlaceSearchLibrary(): PlaceSearchLibrary | null {
  return library;
}

const providers: PlaceSearchProvider[] = [];

/** Register a search scope (downstream builds only). Call once at startup,
 *  before the app first renders. Registration order = chip order. */
export function registerPlaceSearchProvider(p: PlaceSearchProvider): void {
  if (providers.some((x) => x.id === p.id)) return;
  providers.push(p);
}

/** Every registered scope (empty in the open core). */
export function getPlaceSearchProviders(): PlaceSearchProvider[] {
  return providers;
}
