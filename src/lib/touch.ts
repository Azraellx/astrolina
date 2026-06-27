// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useSyncExternalStore } from 'react';

// Touch-layout + orientation signals as tiny module-singleton stores (mirroring
// planPickerStore): so they work across React roots — the rotate gate mounts on its
// own <body> root, like the plan picker and the PWA install button. CSS keys off
// `@media (pointer: coarse)` directly; React components read these hooks. Each
// matchMedia listener is registered ONCE at import (not inside an effect), so
// React StrictMode's double-invoke can never double-subscribe.

// Wrap a media query as a subscribe/getSnapshot pair for useSyncExternalStore.
function mediaStore(query: string): {
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => boolean;
} {
  // The app is a pure client SPA, but guard against a non-browser context anyway.
  const mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null;
  const listeners = new Set<() => void>();
  mql?.addEventListener('change', () => {
    for (const l of listeners) l();
  });
  return {
    subscribe(cb: () => void): () => void {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    getSnapshot: (): boolean => mql?.matches ?? false,
  };
}

// (pointer: coarse) = the primary input can't hover or point precisely (finger, not
// mouse). This single signal drives the whole touch layout: hidden hover-only views
// + the settings takeover. Deliberately NOT combined with a width breakpoint — a
// large landscape tablet is still a coarse-pointer device and SHOULD get the touch
// layout (you can't hover regardless of screen size).
const touch = mediaStore('(pointer: coarse)');
// Narrow viewport (phone-width / small windows) — drives the compact, full-width top-nav
// layout (icon-only menus). Width-based, not orientation: a landscape phone and a portrait
// tablet both have room for the labelled nav, so only genuinely narrow widths compact. 600px
// matches the ChartManager breakpoint and sits just under the 640px stacking convention.
const narrowNav = mediaStore('(max-width: 600px)');

/** Non-reactive read: is this a coarse-pointer (touch) device? */
export function isTouchLayout(): boolean {
  return touch.getSnapshot();
}
/** Non-reactive read: is the viewport narrow enough for the compact top-nav layout? */
export function isNarrowNav(): boolean {
  return narrowNav.getSnapshot();
}

/** Reactive read of whether this is a coarse-pointer (touch) device. */
export function useTouchLayout(): boolean {
  return useSyncExternalStore(touch.subscribe, touch.getSnapshot, () => false);
}
/** Reactive read of whether the viewport is narrow enough for the compact top-nav layout. */
export function useNarrowNav(): boolean {
  return useSyncExternalStore(narrowNav.subscribe, narrowNav.getSnapshot, () => false);
}

// A physical keyboard can't be detected by any standard web API, so we INFER one: the
// first time we see a keydown that an on-screen (soft) keyboard wouldn't produce — a key
// pressed while NOT focused in a text field, or any Ctrl/Meta/Alt combo — we conclude a
// hardware keyboard is attached and latch it on for the rest of the session (keyboards
// don't get unplugged mid-use, and re-hiding the hints would be jarring). This lets a
// tablet paired with a Bluetooth keyboard keep its hotkey hints while a bare touch device
// hides them. Like the pointer:coarse store, the latch also mirrors to a `has-keyboard`
// class on <html> so plain CSS (and other React roots) can react without React wiring.
// The single window listener is registered ONCE at import — never inside an effect — so
// StrictMode's double-invoke can't double-subscribe.
function keyboardStore(): {
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => boolean;
} {
  const listeners = new Set<() => void>();
  let present = false;
  // Whether a keydown looks like it came from real hardware rather than a soft keyboard.
  function looksPhysical(e: KeyboardEvent): boolean {
    // Composition / IME — soft keyboards report keyCode 229 — is never a hardware signal.
    if (e.isComposing || e.keyCode === 229) return false;
    const k = e.key;
    if (!k || k === 'Unidentified' || k === 'Process' || k === 'Dead') return false;
    // A Ctrl/Meta/Alt combo is a near-certain hardware key even inside a text field.
    if (e.ctrlKey || e.metaKey || e.altKey) return true;
    // Otherwise: a key pressed while NOT typing into an editable element. Soft keyboards
    // only emit into the focused field, so a keydown elsewhere implies a real keyboard.
    const t = e.target as HTMLElement | null;
    const editable =
      !!t && (t.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    return !editable;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener(
      'keydown',
      (e) => {
        if (present || !looksPhysical(e)) return;
        present = true;
        document.documentElement.classList.add('has-keyboard');
        for (const l of listeners) l();
      },
      { capture: true, passive: true },
    );
  }
  return {
    subscribe(cb: () => void): () => void {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    getSnapshot: (): boolean => present,
  };
}
const keyboard = keyboardStore();

/** Non-reactive read: has a physical keyboard been observed this session? */
export function isKeyboardPresent(): boolean {
  return keyboard.getSnapshot();
}
/** Reactive read of whether a physical keyboard has been observed this session. */
export function useKeyboardPresent(): boolean {
  return useSyncExternalStore(keyboard.subscribe, keyboard.getSnapshot, () => false);
}
