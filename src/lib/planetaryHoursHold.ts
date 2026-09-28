// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// ── THE SWITCH ───────────────────────────────────────────────────────────────
// PLANETARY HOURS — the sky band's chip and its Planetary hours window — are
// HELD (2026-09-28) until their release in October 2026. Nothing is deleted or
// stubbed: the computation (lib/astro/planetaryHours.ts), the chip, the window,
// the strings, the verify script and the methods page are all here and still
// compiled, and this one boolean is the whole of the hold.
//
//   TO RELEASE: set this to false — and delete the per-device unlock below with
//   it, along with the downstream build's console command and its entry in that
//   build's docs/hidden-features.md. That is the entire revert.
//
// What false restores: the chip at the head of the sky band, the window it opens
// (open by default the first time — App.tsx showPlanetaryHud), and, downstream,
// the Help copy and glossary term that describe them.
//
// HIDDEN, NOT DIMMED. The feature hasn't been announced, so while held there is
// nothing to see at all — no chip, no window, no Help paragraph — rather than a
// greyed control that would advertise it. And the hours aren't COMPUTED while
// held: the band skips the Sun solves and the timer they drive.
//
// NOTHING IS WRITTEN. The window's open/closed choice (astro:planetary-hours-open)
// is neither read nor touched while held, so a reader who has never met the
// feature still gets the open-by-default window the day it's released.
//
// What stays live regardless, because it isn't the feature: the refined horizon
// solve in riseSet.ts (the band's own rise/set times) and the movable-window clamp
// (lib/useMovableHud.ts) that landed with it.

const HELD_BASE = true;

// HIDDEN FEATURE (H6 in the downstream build's docs/hidden-features.md) — the
// per-device escape hatch, so the hold can stay on for everyone while the people
// trying the feature before release can still see it. Written ONLY by the
// downstream build's console (the command word lives there, not here); nothing in
// the UI touches it, and no boot path writes it — so the default stays reachable
// and the key never needs a `:v2` bump.
//
// LOCKING REMOVES THE KEY rather than writing a '0'. Once the base flag flips, the
// override is inert anyway (`false && …`), and a leftover '0' would sit in every
// device that ever used it, outliving the thing it once undid.
const UNLOCK_KEY = 'astro:planetary-hours-unlock:v1';

/** Whether this device has lifted the hold. Reads storage fresh rather than the
 *  frozen export below, so a caller can toggle against the live value. */
export function isPlanetaryHoursUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

/** Lift or restore the hold on this device. The caller has to RELOAD: the flag
 *  below is resolved once at module eval and its consumers read it from there. */
export function setPlanetaryHoursUnlocked(on: boolean): void {
  try {
    if (on) localStorage.setItem(UNLOCK_KEY, '1');
    else localStorage.removeItem(UNLOCK_KEY);
  } catch {
    // Ignore persistence failures (private mode, quota, etc.).
  }
}

/** True while planetary hours are withheld from this device. */
export const PLANETARY_HOURS_HELD = HELD_BASE && !isPlanetaryHoursUnlocked();
