// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Puts a resolved palette (lib/themePalette) on the document (2026-10-06): the DOM channel of
// the palette, beside the map style and the line inks.
//
//  • data-theme = the palette's BASE, so every existing [data-theme] rule — the Glass and
//    Earth frost materials above all — still applies to a custom theme built on it.
//  • data-panel-tone = light | dark, ALWAYS set (a built-in's is its own tone), for rules
//    that are really about a light panel rather than about Glass.
//  • data-fx-frost / -shadows / -glows / -motion only when they differ from the default, and
//    removed otherwise — so a built-in theme carries none of them, and no rule keyed on one
//    can fire for it.
//  • Inline custom properties on <html>, as a DIFF against the set THIS MODULE wrote last.
//    Never by clearing documentElement.style: lib/bottomDock, lib/leftDock and
//    useOverlayBarGap write their own properties there, and wiping theirs to repaint ours
//    would drop a docked panel's reserved width on every colour change. A built-in palette
//    writes none (its `css` is empty), so the stylesheet alone paints it, as before.
//
// Cheap enough to run at input rate (an editor preview): it touches only what changed, and
// it never renders React. 'astro:appearance' fires when something did change, for surfaces
// that paint from computed style themselves (canvases) — useAppearanceVersion() is the hook.
//
// Two layers (2026-10-06). applyAppearance COMMITS a palette — what App draws from its
// state. previewAppearance puts an editor's input-rate preview OVER it, and while one is up
// a commit is recorded but not painted: the editor commits on a throttle (a drag only at its
// end), so a commit can land carrying an older draft than the one already on screen, and
// painting it would flash stale values until the next input. previewAppearance(null) takes
// the preview down and paints the latest commit. The layering lives here, not in App,
// because App is not where the document's state is — this module already is.
import { useSyncExternalStore } from 'react';
import { FX_DEFAULTS, type AppearanceAttrs, type ResolvedPalette } from './themePalette';

/** The event applyAppearance dispatches on window after a change. detail: { key }. */
export const APPEARANCE_EVENT = 'astro:appearance';

const FX_ATTRS: readonly [keyof typeof FX_DEFAULTS, string][] = [
  ['frost', 'data-fx-frost'],
  ['shadows', 'data-fx-shadows'],
  ['glows', 'data-fx-glows'],
  ['motion', 'data-fx-motion'],
];

// The custom properties this module wrote on <html>, and the values it wrote.
let written = new Map<string, string>();
let version = 0;
// The latest committed palette, and the preview over it (null when none is up).
let committed: ResolvedPalette | null = null;
let preview: ResolvedPalette | null = null;

/** Commit `palette` and paint it — or, while a preview is up, only record it, unless
 *  `endPreview` also takes the preview down (App passes it whenever no editor is mounted, so a
 *  preview never outlives the window that made it). Idempotent; never throws. */
export function applyAppearance(palette: ResolvedPalette, opts: { endPreview?: boolean } = {}): void {
  committed = palette;
  if (opts.endPreview) preview = null;
  paint(preview ?? palette);
}

/** Put an input-rate preview over the committed palette (`palette`), or take it down (null)
 *  and paint the latest commit. Renders nothing; stores nothing. */
export function previewAppearance(palette: ResolvedPalette | null): void {
  preview = palette;
  const p = palette ?? committed;
  if (p) paint(p);
}

/** Whether a preview is up (for tests and the editor). */
export function appearancePreviewing(): boolean {
  return preview !== null;
}

function paint(palette: ResolvedPalette): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  let changed = false;
  const setAttr = (name: string, value: string | null) => {
    if (root.getAttribute(name) === value) return;
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
    changed = true;
  };
  try {
    setAttr('data-theme', palette.base);
    setAttr('data-panel-tone', palette.attrs.panelTone);
    const attrs: AppearanceAttrs = palette.attrs;
    for (const [k, name] of FX_ATTRS) setAttr(name, attrs[k] === FX_DEFAULTS[k] ? null : attrs[k]);

    const next = palette.css;
    for (const name of written.keys()) {
      if (!(name in next)) {
        root.style.removeProperty(name);
        changed = true;
      }
    }
    const now = new Map<string, string>();
    for (const [name, value] of Object.entries(next)) {
      now.set(name, value);
      if (written.get(name) !== value) {
        root.style.setProperty(name, value);
        changed = true;
      }
    }
    written = now;
  } catch {
    /* a document without style (tests): nothing to paint */
  }
  if (changed) {
    version += 1;
    try {
      window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT, { detail: { key: palette.key } }));
    } catch {
      /* no window */
    }
  }
}

/** The custom properties applyAppearance currently has on <html> (for tests and the editor). */
export function writtenAppearanceVars(): ReadonlyMap<string, string> {
  return written;
}

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(APPEARANCE_EVENT, cb);
  return () => window.removeEventListener(APPEARANCE_EVENT, cb);
}
const getVersion = () => version;

/** A number that changes each time applyAppearance changes the document — add it to the
 *  dependencies of anything that reads computed colours itself (a canvas draw). */
export function useAppearanceVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
