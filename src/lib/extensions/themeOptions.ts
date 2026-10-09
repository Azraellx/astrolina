// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Theme-option seam (2026-10-06) — lets a downstream build add a fourth entry, under a name of
// its own (`label()`), to Settings ▸ Appearance's theme list WITHOUT editing Sidebar.tsx or
// App.tsx. Single slot, the idiom of ./profileSection and ./viewLock; gated through the SHARED
// entitlement policy (./entitlement), so the one setEntitlementResolver call that gates the
// Tools, Overlay and Settings seams gates this one too. The open core registers nothing: no
// fourth row, nothing resolved but the three built-ins.
//
// The division of labour. The extension OWNS the theme — its specs, editing, presets,
// storage and sync. The core owns everything the spec turns into: it resolves the spec with
// lib/themePalette and paints the result (lib/appearance, the map style, the line inks). So
// the extension hands over data, never paint, and the core SANITIZES that data on every read
// (readThemeSpec): a spec from a newer build, a corrupt store or a share code can only ever
// resolve to a palette the engine itself would have made.
//
// Two rates. `subscribe` fires on COMMIT — a finished edit, an undo, an adopted sync — and
// is what the app re-resolves, re-inks and re-bakes on. Input-rate changes (a colour being
// dragged) go through the editor context's `preview`: the interface's CSS and attributes at
// once, and the map's paint and line colours on a throttle, as a TRANSIENT layer over what is
// committed — never the spec, never stored, never in the line set a plugin reads.
//
// Two rungs (2026-10-08). The option's ROW and its EDITOR are entitled separately: `tier`
// ('adv') says who may draw the option at all, `editorTier` ('gated') who may make it their
// own. A reader with the row but not the editor is drawn `fallbackSpec()` — one fixed theme
// the option chooses for them — and their own spec, if they made one on the higher rung, is
// HELD untouched underneath until the editor comes back (lib/themeChoice). Both are resolved
// by the shared entitlement policy, so both follow the account and neither follows the
// Advanced reading toggle. The core names neither the option nor its fallback: the row's
// label comes from `label()`, and the core's own copy says "your theme".
//
// The editor is optional (2026-10-08). An option registered without `renderEditor` and
// `editorTier` is a fixed theme: its fallback for everyone it is open to, no spec of the
// reader's own, no Customize, no key — so a build can release the option and hold its editor.

import { useSyncExternalStore, type ReactNode } from 'react';
import type { GatedExtension } from './entitlement';
import type { Theme } from '../theme';
import {
  PALETTE_ENGINE,
  sanitizeOverrides,
  type PaletteOverrides,
  type ResolvedPalette,
  type TokenDef,
  type TokenExplanation,
  type TokenId,
} from '../themePalette';

export {
  setEntitlementResolver,
  isEntitled,
  type Entitlement,
  type GatedExtension,
} from './entitlement';

/** A custom theme as data: drawn ON a built-in (`base`), with the reader's sparse
 *  overrides. Token ids are a synced contract (lib/themePalette TOKENS). */
export interface CustomThemeSpec {
  readonly base: Theme;
  readonly overrides: PaletteOverrides;
  /** The derivation engine the spec was made under (PALETTE_ENGINE). */
  readonly engine?: 1;
}

/** What the core hands the editor it renders. */
export interface ThemeEditorContext {
  /** The COMMITTED palette being drawn — never a preview's: a preview never reaches this
   *  context, so it does not change under one. */
  readonly palette: ResolvedPalette;
  /** A built-in theme's palette (lib/themePalette builtinPalette). */
  builtin(t: Theme): ResolvedPalette;
  /** Every token, in presentation order (lib/themePalette TOKENS). */
  readonly tokens: readonly TokenDef[];
  /** A row's value, origin, Auto value and the token it follows, in `palette`. */
  explain(id: TokenId): TokenExplanation | null;
  /** Preview these overrides (on `base`, default the spec's), at input rate. The interface's
   *  CSS and attributes repaint at once; the MAP follows at most every ~80 ms (App's mapDraft,
   *  a transient layer the Map paints over what is committed): its widths, dashes, opacities and
   *  basemap paint, and every line's colour — not its sprites (glyph stamps, coins, sparks), its
   *  edge labels, a basemap CHOICE, or the families whose generators bake their colour in (night
   *  shade, the geodetic zones, eclipse paths), which follow the commit. A preview stays up
   *  through later commits (one landing behind it never paints over it) until the next preview,
   *  null, or the editor closing; so the editor previews its WHOLE draft each time, and
   *  re-previews after a whole-document step (undo, a preset). null drops the preview: the
   *  interface repaints the committed spec at once, the map once that commit has reached it.
   *  Nothing is stored, and nothing reaches what is committed — the spec, `palette` above, or
   *  the line set and inks a plugin reads (collectAllLines, linesStamp, ctx.inks). (2026-10-06:
   *  the map half; until then a drag left every map line as it was until release.) */
  preview(overrides: PaletteOverrides | null, base?: Theme): void;
  /** Close the editor (the window's X). */
  onClose(): void;
  /** Open a registered extension by id — the map extensions' `openExtension`, handed here so
   *  the editor's "?" can open Help on its article as every other window does. */
  openExtension(id: string): void;
  /** True while an add-on surface owns the viewport (lib/extensions/viewLock). The core
   *  unmounts the editor while one does (and keeps its open state, so it returns with the
   *  view), so a mounted editor reads false; kept for an editor that wants to say so. */
  readonly viewParked: boolean;
}

export interface ThemeOptionExtension extends GatedExtension {
  /** Stable id; also the value the picker's row carries. */
  id: string;
  /** The ROW's rung: who may draw the option. An account rung (lib/extensions/entitlement),
   *  badged ADV where the build's badge policy shows it. */
  tier: 'adv';
  /** The EDITOR's rung: who may make the option their own — the Customize opener and its
   *  key. Checked as isEntitled({ id, tier: editorTier }). Absent with `renderEditor`: an
   *  option may come WITHOUT an editor (themeOptionHasEditor). */
  editorTier?: 'gated';
  /** The option's label in the theme list, localized by the extension. The core never
   *  names the option itself: every place it shows one, the name comes from here. */
  label(): string;
  /** A small mark drawn before the label in the theme list — e.g. one saying the row is the
   *  reader's own version of what the label names — or null for none. The extension owns its
   *  accessible name (the row's name reads mark then label). Read per render, like label().
   *  (2026-10-09) */
  labelMark?(): ReactNode;
  /** The row's hover tip (under 180 characters). */
  hint?(): string;
  /** The tip's note while the option is HELD (chosen, but the row's rung isn't reached):
   *  names what brings it back. */
  heldHint?(): string;
  /** The tip's note while the reader's OWN spec is held behind the fallback (the row's
   *  rung reached, the editor's not): says the spec is kept and what brings it back. */
  editsHeldHint?(): string;
  /** A small swatch for the row, showing `drawn`: the spec the option DRAWS for this reader
   *  (lib/themeChoice's `drawn` — their own with the editor's rung and a spec of their own, else
   *  the fallback), or would draw if they chose it, since the row stands for what a pick would
   *  put on screen; null where the row isn't open to them (a guest, the teaser and the held row
   *  alike), which draws the core's neutral box. Sanitized, identity-stable, and re-passed on
   *  every commit, so the swatch needs no subscription of its own. (2026-10-08: until then it
   *  was called with nothing and read the stored spec, so a reader whose own theme was held
   *  saw its colours on a row that drew the fallback, and a fresh Member saw no colours at all.
   *  An option made before it may still ignore the argument.) */
  swatch?(drawn: CustomThemeSpec | null): ReactNode;
  /** The reader's OWN spec — the stored one, or a transient preview document; null before
   *  they have one. Synchronous and identity-stable: the same object until it changes
   *  (useSyncExternalStore reads it). Drawn only for a reader entitled to the editor. */
  getSpec(): CustomThemeSpec | null;
  /** What the option draws for a reader entitled to it but not to its editor — and for an
   *  editor-entitled reader with no spec of their own yet, so reaching the editor's rung
   *  moves nothing. Identity-stable (the same object every call); sanitized like getSpec. */
  fallbackSpec(): CustomThemeSpec;
  /** Subscribe to COMMITTED spec changes. Never fires per input. Returns the unsubscribe. */
  subscribe(onChange: () => void): () => void;
  /** Seed the reader's own spec, so making the option their own moves nothing by itself.
   *  Called ONLY for an editor-entitled reader with no spec yet: on their first pick,
   *  coming from built-in `from`, or on opening the editor while the option already draws
   *  the fallback (a reader who reached the editor's rung after choosing the option). In
   *  that second case `onScreen` is the fallback spec on screen and the seed must copy IT —
   *  a copy of `from`, its base, would move the theme on the click that was meant to keep
   *  it. (2026-10-08: `onScreen` is new, and optional for an option made before it.) */
  onChoose?(from: Theme, onScreen?: CustomThemeSpec): void;
  /** The editor window's body. OPTIONAL (2026-10-08): an option registered without one is a
   *  fixed theme — every entitled reader is drawn `fallbackSpec()`, `getSpec()` is never read
   *  (a spec the reader can't reach is one they can't see, so nothing of theirs is drawn or
   *  held), and there is no Customize opener and no key. That is how a build can release the
   *  option while still holding its editor back. */
  renderEditor?(ctx: ThemeEditorContext): ReactNode;
}

/** Whether the option comes with an editor — both halves declared. Without one it is a fixed
 *  theme (see `renderEditor`). */
export function themeOptionHasEditor(ext: ThemeOptionExtension | null | undefined): boolean {
  return !!ext && typeof ext.renderEditor === 'function' && ext.editorTier !== undefined;
}

let slot: ThemeOptionExtension | null = null;
const listeners = new Set<() => void>();

/** Install the theme option (downstream builds only). Single slot — last call wins. */
export function registerThemeOption(ext: ThemeOptionExtension): void {
  slot = ext;
  for (const fn of listeners) fn();
}

/** The installed option, or null in the open core. */
export function getThemeOption(): ThemeOptionExtension | null {
  return slot;
}

/** Subscribe to the slot itself changing (a registration). */
export function subscribeThemeOption(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

const isTheme = (v: unknown): v is Theme => v === 'vintage' || v === 'glass' || v === 'dark';

/** A spec as the core accepts it: base checked (an unknown base reads as Earth, the
 *  default), overrides through sanitizeOverrides, engine stamped. null for no spec. */
export function sanitizeThemeSpec(raw: unknown): CustomThemeSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  try {
    const r = raw as { base?: unknown; overrides?: unknown };
    return Object.freeze({
      base: isTheme(r.base) ? r.base : 'vintage',
      overrides: sanitizeOverrides(r.overrides),
      engine: PALETTE_ENGINE,
    });
  } catch {
    return null;
  }
}

// Sanitized once per raw spec object — getSpec and fallbackSpec are identity-stable, so this
// keeps the sanitized results identity-stable too, which useSyncExternalStore (and App's
// palette memos) require.
const SANITIZED = new WeakMap<object, CustomThemeSpec | null>();

/** The extension's current spec, sanitized (the only way the core reads it). Never throws. */
export function readThemeSpec(ext: ThemeOptionExtension | null): CustomThemeSpec | null {
  if (!ext) return null;
  let raw: unknown;
  try {
    raw = ext.getSpec();
  } catch {
    return null;
  }
  return sanitizedOnce(raw);
}

function sanitizedOnce(raw: unknown): CustomThemeSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  if (SANITIZED.has(raw)) return SANITIZED.get(raw) ?? null;
  const clean = sanitizeThemeSpec(raw);
  SANITIZED.set(raw, clean);
  return clean;
}

/** The extension's fallback spec, sanitized exactly as the reader's own is — it is data
 *  handed over the same seam, and a build's preset can be as stale as a stored spec — and
 *  identity-stable with it. null only with no option, or one whose fallback throws or is
 *  unusable; the option then has nothing to draw without the editor. Never throws. */
export function readFallbackSpec(ext: ThemeOptionExtension | null): CustomThemeSpec | null {
  if (!ext) return null;
  try {
    return sanitizedOnce(ext.fallbackSpec());
  } catch {
    return null;
  }
}

const noSubscribe = () => () => {};

// One subscribe function per extension, so useSyncExternalStore doesn't resubscribe on every
// render (it compares the function's identity).
const SUBSCRIBERS = new WeakMap<ThemeOptionExtension, (cb: () => void) => () => void>();
function subscriberFor(ext: ThemeOptionExtension): (cb: () => void) => () => void {
  let fn = SUBSCRIBERS.get(ext);
  if (!fn) {
    fn = (cb) => {
      try {
        const off = ext.subscribe(cb);
        return typeof off === 'function' ? off : () => {};
      } catch {
        return () => {};
      }
    };
    SUBSCRIBERS.set(ext, fn);
  }
  return fn;
}

/** The extension's spec as React state, re-read on each COMMIT it announces. */
export function useThemeOptionSpec(ext: ThemeOptionExtension | null): CustomThemeSpec | null {
  const read = () => readThemeSpec(ext);
  return useSyncExternalStore(ext ? subscriberFor(ext) : noSubscribe, read, read);
}
