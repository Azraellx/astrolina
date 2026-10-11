// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The release hold on the new languages (src/i18n/languageHold.ts, 2026-10-10) is resolved ONCE,
// as that module is evaluated, from this device's unlock in localStorage — and the harness has no
// localStorage, so a suite that loads the i18n runtime would run HELD: SUPPORTED_LOCALES just
// English, setLocale storing nothing, the on-device tier refused. The i18n suites test the
// languages themselves, so they run UNLOCKED, as a device with the hold lifted does.
//
// How: a suite imports this module FIRST. ES modules evaluate in import order, and the harness's
// esbuild bundle keeps that order, so the storage planted here — holding the unlock and nothing
// else — is what languageHold.ts reads when its turn comes. `releaseLanguagesUnlock()`, the first
// statement of the suite's body, takes it away again, so every check meets the environment it
// always has (no storage until it stands one in). The key is a copy, because importing the hold's
// own module here would evaluate it before anything is planted; a suite therefore checks that it
// did run unlocked, so a stale copy fails by name rather than as a hundred puzzling failures.
//
// `--held` on the command line plants nothing: verify-i18n-runtime re-runs its own bundle that way,
// in a child process, for a module graph resolved UNDER the hold (its held section).
//
// Goes with the hold (languageHold.ts lists it).

const UNLOCK_KEY = 'astro:languages-unlock:v1';

/** True in the held child run (`--held`): nothing was planted, so the module graph is held. */
export const HELD_RUN = process.argv.includes('--held');

const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
if (!HELD_RUN) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (k === UNLOCK_KEY ? '1' : null),
      setItem: () => {},
      removeItem: () => {},
    },
  });
}

let released = false;

/** Restores the storage that stood before this module ran (none, in the harness). Idempotent. */
export function releaseLanguagesUnlock(): void {
  if (released || HELD_RUN) return;
  released = true;
  if (before) Object.defineProperty(globalThis, 'localStorage', before);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
}
