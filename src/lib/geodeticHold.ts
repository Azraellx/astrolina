// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// ── THE SWITCH ───────────────────────────────────────────────────────────────
// The GEODETIC line system (labelled Mundane until 2026-10-02) is held (2026-08-27)
// while discrepancies in how it draws are worked through. Nothing is deleted or
// stubbed: the generators, the settings control, the strings and the docs are all
// still here and still compiled, and this one boolean is the whole of the hold.
//
//   TO LIFT IT: set this to false — and delete the per-device unlock below with
//   it, along with its console command and its entry in the downstream build's
//   docs/hidden-features.md. That is the entire revert.
//
// What false restores:
//   · the Geodetic half of Calculation ▸ Line system goes live instead of dimmed,
//   · a stored 'geodetic' preference stops being masked and draws again,
//   · the Help article drops its "under review" note.
//
// NOTHING IS WRITTEN. A reader who had Geodetic selected keeps it in
// `astro:line-system:v1`; the derived `lineSystem` in App.tsx simply masks it to
// celestial for as long as the hold lasts, exactly as a sidereal zodiac does. The
// hold is a standing state, not an event, so it derives rather than rewrites —
// and when it ends, their choice is still there. (This is the rule the whole
// forced-settings discipline turns on; see vendor/core/docs/forced-settings.md.)
//
// WHY IT LIVES IN THE CORE. The setting, the derivation and the control are all
// here, and so is the code being reviewed — the open core draws the same geodetic
// map from the same generators. Holding it downstream only would leave the fault
// reachable in the build that carries it.

const HELD_BASE = true;

// The per-device escape hatch, so the hold can stay on for everyone while the
// mapping is under review and the people testing it can still get at it. Written
// ONLY by the downstream console's `geodetic` command; nothing in the UI touches
// it, and no boot path writes it — so the default stays reachable and the key
// never needs a `:v2` bump.
//
// LOCKING REMOVES THE KEY rather than writing a '0'. Once the base flag flips, the
// override is inert anyway (`false && …`), and a leftover '0' would sit in every
// device that ever used it, outliving the thing it once undid.
const UNLOCK_KEY = 'astro:geodetic-unlock:v1';

/** Whether this device has lifted the hold. Reads storage fresh rather than the
 *  frozen export below, so a caller can toggle against the live value. */
export function isGeodeticUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

/** Lift or restore the hold on this device. The caller has to RELOAD: the flag
 *  below is resolved once at module eval and its consumers read it from there. */
export function setGeodeticUnlocked(on: boolean): void {
  try {
    if (on) localStorage.setItem(UNLOCK_KEY, '1');
    else localStorage.removeItem(UNLOCK_KEY);
  } catch {
    // Ignore persistence failures (private mode, quota, etc.).
  }
}

/** True while the geodetic mapping is withheld from this device. */
export const GEODETIC_HELD = HELD_BASE && !isGeodeticUnlocked();
