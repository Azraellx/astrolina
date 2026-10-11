// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// ── THE SWITCH ───────────────────────────────────────────────────────────────
// The new LANGUAGES are held (2026-10-10): built, translated and verified, and held back from
// readers for their release. Nothing is deleted or stubbed: the catalogs, the menu rows, the
// on-device tier and its strings are all still here and still compiled, and this one boolean is
// the whole of the hold.
//
//   TO LIFT IT: set this to false — and delete with it the per-device unlock below, `var HELD`
//   and its unlock test in index.html's `lang-boot` script (and in a downstream build's own copy,
//   if it has one) with the checks verify:lang-boot makes of them, the masking block at the foot
//   of languages.ts, the held section of verify-i18n-runtime and the unlock its harness plants,
//   §8 of verify-i18n-machine (the held child run, refusing the device translation of a build's
//   own text, 2026-10-10 — like the runtime's held section, it fails once this is false), and
//   the public notes on the hold: the "Held for release" section of docs/translations.md and
//   its sentence on `var HELD`, and the hold's row in docs/forced-settings.md (both telling
//   readers the languages are held, and neither found by the search below). A downstream build
//   that exposes the unlock removes its own side too. Every gate reads LANGUAGES_HELD — the
//   Language menu through machineMenu.ts's machineTierOffered — so a search for those two names
//   finds the rest. That is the entire revert.
//
// What it holds:
//   · the five shipped catalogs (es, pt, tr, de, ru). Their rows in languages.ts read
//     unavailable, so Settings ▸ Appearance ▸ Language shows them greyed with the "Coming soon"
//     tip they had before the catalogs shipped — and everything that keys on availability
//     follows from that one flag: SUPPORTED_LOCALES, browser detection, a stored choice, the
//     translate offer (it can name only English, which is already on screen), the
//     language-detected notice. No catalog chunk is fetched;
//   · the on-device tier. The menu's device section (headed "Auto-translated") is absent — not
//     greyed: a dimmed section would announce a tier nobody has been told about — the device
//     is never asked what it can translate, and the tier's chunk is never imported. A stored
//     `mt:` choice reads English SILENTLY: no language-held notice, because a release hold is
//     not the device losing its translator, and that notice would tell the reader it had;
//   · both copies of the `lang-boot` script, which narrow their own list to English unless this
//     device holds the unlock — so `<html lang>` is "en" from the first paint, as the runtime
//     will say once it boots.
//
// What it doesn't hold:
//   · the browser-translation safety work — `translate="no"`, the single-string rule, the
//     translate guard, the page-translation bridge and its reload on a pick. An English page
//     is translated by browsers too, and needs all of it;
//   · the fmt helpers (dates, numbers), which English reads through as well;
//   · the dev-only pseudo-locale 'qps': a development build still lists it and still switches
//     to it. It is a tool, not a language;
//   · the translation pipeline and the localization routine: the catalogs stay current while
//     held, so that lifting the hold is a flip rather than a backlog;
//   · the binding-language areas, which render no notice in English — nothing there to hold.
//
// NOTHING IS WRITTEN. A reader who chose Español keeps 'es' in `astro:locale:v2`; the runtime
// masks it to English for as long as the hold lasts and shows it again when the hold ends. The
// hold is a standing state, not an event, so it derives rather than rewrites (CLAUDE.md rule 2,
// and vendor/core/docs/forced-settings.md). The same rule makes the menu refuse writes while the
// mask is up: it marks the language SHOWN, English, so a click on English under the hold would
// otherwise overwrite a stored 'es' with its stand-in — runtime.ts's setLocale stores nothing
// while held.
//
// WHY IT LIVES IN THE CORE. The languages, the menu, the runtime and the boot script are all
// here, and the open core ships the same catalogs from the same runtime. Holding them downstream
// only would leave them reachable in the build that carries them.

const HELD_BASE = true;

// A per-device override of the hold, so the held languages can be tried on one device while the
// hold stays on everywhere else. Nothing in the core's UI writes it and no boot path does (a
// build may set it from its own tooling), so the default stays reachable and the key never needs
// a `:v2` bump. The `lang-boot` script in index.html reads it too (it runs before any module, so
// it carries the key as a copy; verify:lang-boot holds it to this one).
//
// LOCKING REMOVES THE KEY rather than writing a '0'. Once the base flag flips, the override is
// inert anyway (`false && …`), and a leftover '0' would sit in every device that ever used it,
// outliving the thing it once undid.
const UNLOCK_KEY = 'astro:languages-unlock:v1';

/** Whether this device has lifted the hold. Reads storage fresh rather than the frozen export
 *  below, so a caller can toggle against the live value. */
export function isLanguagesUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

/** Lift or restore the hold on this device. The caller has to RELOAD: the flag below is resolved
 *  once at module eval, its consumers read it from there, and the boot script reads the key only
 *  as the page loads. */
export function setLanguagesUnlocked(on: boolean): void {
  try {
    if (on) localStorage.setItem(UNLOCK_KEY, '1');
    else localStorage.removeItem(UNLOCK_KEY);
  } catch {
    // Ignore persistence failures (private mode, quota, etc.).
  }
}

/** True while the new languages are withheld from this device. */
export const LANGUAGES_HELD = HELD_BASE && !isLanguagesUnlocked();

/** The two facts index.html's `lang-boot` script restates as copies (`var HELD`, the unlock key),
 *  for verify:lang-boot alone, which fails until both copies equal these. Every consumer in the
 *  app reads LANGUAGES_HELD. */
export const __bootScriptCopies = { HELD_BASE, UNLOCK_KEY } as const;
