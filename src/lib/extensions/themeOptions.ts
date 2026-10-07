// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Theme-option seam (2026-10-06) — lets a downstream build add a fourth entry, Custom, to
// Settings ▸ Appearance's theme list WITHOUT editing Sidebar.tsx or App.tsx. Single slot, the
// idiom of ./profileSection and ./viewLock; gated through the SHARED entitlement policy
// (./entitlement), so the one setEntitlementResolver call that gates the Tools, Overlay and
// Settings seams gates this one too. The open core registers nothing: no Custom row, nothing
// resolved but the three built-ins.
//
// The division of labour. The extension OWNS the custom theme — its spec, editing, presets,
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
  tier: 'gated';
  /** The option's label in the theme list, localized by the extension. */
  label(): string;
  /** The row's hover tip (under 180 characters). */
  hint?(): string;
  /** The tip while the option is HELD (chosen but not available): names the setting or
   *  plan that brings it back. */
  heldHint?(): string;
  /** A small swatch for the row. */
  swatch?(): ReactNode;
  /** The spec to draw — the stored one, or a transient preview document. Synchronous and
   *  identity-stable: the same object until it changes (useSyncExternalStore reads it). */
  getSpec(): CustomThemeSpec | null;
  /** Subscribe to COMMITTED spec changes. Never fires per input. Returns the unsubscribe. */
  subscribe(onChange: () => void): () => void;
  /** The reader has just picked this option, coming from built-in `from`: seed a copy of
   *  it if there is no spec yet, so choosing Custom moves nothing by itself. */
  onChoose?(from: Theme): void;
  /** The editor window's body. */
  renderEditor(ctx: ThemeEditorContext): ReactNode;
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

// Sanitized once per raw spec object — getSpec is identity-stable, so this keeps the
// sanitized result identity-stable too, which useSyncExternalStore requires.
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
  if (!raw || typeof raw !== 'object') return null;
  if (SANITIZED.has(raw)) return SANITIZED.get(raw) ?? null;
  const clean = sanitizeThemeSpec(raw);
  SANITIZED.set(raw, clean);
  return clean;
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
