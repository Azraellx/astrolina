// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Loads catalog minor bodies' ephemeris files into the engine, on demand.
//
// Order of operations, each step a gate the next depends on:
//   1. FETCH the bytes through the body's source (bundled, or a registered one), in
//      the span the source serves the body in (MinorBodySource.spanFor — short unless
//      it says otherwise).
//   2. CHECK them as the exact file the engine will ask for (se1Header.ts) — that
//      span's file name. A failure here never reaches the engine — see that module
//      for why that matters.
//   3. MOUNT every file that passed, in ONE engine call (each call re-points the
//      engine's path and closes its open files), under that same bare name — a long
//      file's is one the engine's lookup tries before the short name.
//   4. PROBE each body at J2000, inside every file's span: a body that doesn't
//      compute is marked failed and is never sampled again this session.
//
// A hypothetical point skips 1–3: it has no file, only its element set in the
// engine's elements file, which ensureHypotheticalElements mounts once and CHECKS
// (ephemeris.ts). It then takes the same probe as every other body.
//
// State lives here, outside React, so a load started by one render isn't lost to
// the next; the App subscribes (useSyncExternalStore) and re-derives on change.
import { checkSe1Header } from './se1Header';
import { fileNameFor, isHypotheticalKey, SEAS_MINOR_ID, type EpheSpan } from './ids';
import {
  ensureAsteroidEphemeris,
  ensureHypotheticalElements,
  mountEphemerisFiles,
  sampleMinorBody,
} from '../ephemeris';
import {
  MinorBodySourceFailure,
  type MinorBodySource,
} from '../extensions/minorBodySources';

export type MinorLoadFailure =
  /** The network wasn't there (and the file had never been fetched). */
  | 'offline'
  /** The source had no such file (a 404, or a host's HTML page in its place). */
  | 'missing'
  /** The bytes weren't a usable ephemeris file for this body. */
  | 'content'
  /** The source explained itself — see `note`. */
  | 'source'
  /** A hypothetical point: the elements file couldn't be mounted, or was mounted and
   *  not read. Nothing is computed in its place (ephemeris.ts). */
  | 'elements';

export type MinorLoadState =
  | { status: 'loading' }
  | { status: 'ready'; name: string | null }
  | { status: 'failed'; reason: MinorLoadFailure; note?: string };

const states = new Map<number, MinorLoadState>();
const inflight = new Set<number>();
const listeners = new Set<() => void>();
let version = 0;

function publish(): void {
  version++;
  for (const l of listeners) l();
}

function setState(n: number, s: MinorLoadState): void {
  states.set(n, s);
}

/** useSyncExternalStore subscribe — the snapshot is {@link minorLoadVersion}. */
export function subscribeMinorLoads(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Changes whenever any body's load state does. */
export function minorLoadVersion(): number {
  return version;
}

export function minorLoadState(n: number): MinorLoadState | undefined {
  return states.get(n);
}

/** Forget a failure so the next request tries again (the row's retry control). A
 *  hypothetical point's retry is every point's: they share one mount. */
export function retryMinorBody(n: number): void {
  if (states.get(n)?.status !== 'failed') return;
  states.delete(n);
  if (isHypotheticalKey(n)) releaseHypotheticalFailures();
  publish();
}

// The ten hypothetical points share one mount (ensureHypotheticalElements), so a
// mount failure is all of theirs: forget every point that failed for THAT reason and
// the App re-requests whichever are on. Not 'content': a point the probe refused after
// the mount is its own failure.
function releaseHypotheticalFailures(): void {
  for (const [k, s] of states) {
    if (isHypotheticalKey(k) && s.status === 'failed' && s.reason === 'elements') states.delete(k);
  }
}

// A body that failed only for want of a network gets another chance as soon as
// the browser says it is back — the reader shouldn't have to find a retry button
// for a failure that was never about the body.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    let changed = false;
    for (const [n, s] of states) {
      if (s.status === 'failed' && s.reason === 'offline') {
        states.delete(n);
        changed = true;
      }
    }
    if (changed) publish();
  });
}

// Inside the short (1500–2100) and long (−3000–3000) files, and inside the bundled
// main-asteroid file (1800–2399) that carries Pholus. Not guaranteed: a file's span is
// its own — 367943 Duende's short file starts in 2009, its long one runs 1993–2091 — and
// a file that starts after J2000 would fail here as 'content'. None served does (every
// short file the hosted catalog held on 2026-09-26, and both long files it serves).
const PROBE_JD = 2451545.0; // J2000

/**
 * Make sure each requested body's data is in the engine. Bodies already ready,
 * loading, or failed are skipped (a failure waits for {@link retryMinorBody}, so a
 * re-render can never turn into a request loop). Resolves when this batch settles.
 */
export async function ensureMinorBodies(
  requests: ReadonlyArray<{ n: number; source: MinorBodySource }>,
): Promise<void> {
  const fresh = requests.filter((r) => !inflight.has(r.n) && !states.has(r.n));
  if (fresh.length === 0) return;
  for (const r of fresh) {
    inflight.add(r.n);
    setState(r.n, { status: 'loading' });
  }
  publish();

  try {
    const fetched = await Promise.all(
      fresh.map(async (r) => {
        // Data already inside the bundled main-asteroid file: load that instead.
        if (SEAS_MINOR_ID.has(r.n)) {
          try {
            await ensureAsteroidEphemeris();
            return { n: r.n, mount: null, name: null };
          } catch {
            setState(r.n, { status: 'failed', reason: offline() ? 'offline' : 'missing' });
            return null;
          }
        }
        // A hypothetical point: its element set is in the engine's elements file. One
        // mount serves all ten; a failure fails every point in the batch, and resets the
        // mount so a retry tries it again for all of them (releaseHypotheticalFailures).
        // Never 'offline': the file is bundled with the engine code (ephemeris.ts), so no
        // network is involved and there is nothing for coming back online to fix.
        if (isHypotheticalKey(r.n)) {
          try {
            await ensureHypotheticalElements();
            return { n: r.n, mount: null, name: null };
          } catch {
            setState(r.n, { status: 'failed', reason: 'elements' });
            return null;
          }
        }
        // The span first, then the file in it — and the check below expects THAT span's
        // name, so bytes of the other file fail it rather than being mounted as this one.
        let span: EpheSpan;
        let bytes: ArrayBuffer;
        try {
          span = (await r.source.spanFor?.(r.n)) ?? 'short';
          bytes = await r.source.fetchFile(r.n, span);
        } catch (err) {
          setState(
            r.n,
            err instanceof MinorBodySourceFailure
              ? { status: 'failed', reason: 'source', note: err.note }
              : { status: 'failed', reason: offline() ? 'offline' : 'missing' },
          );
          return null;
        }
        const file = fileNameFor(r.n, span);
        const check = checkSe1Header(new Uint8Array(bytes), file, r.n);
        if (!check.ok) {
          setState(r.n, {
            status: 'failed',
            // A host's HTML page where the file should be means the file isn't there.
            reason: check.reason === 'html' ? 'missing' : 'content',
          });
          return null;
        }
        return {
          n: r.n,
          mount: { name: file, url: URL.createObjectURL(new Blob([bytes])) },
          name: check.name,
        };
      }),
    );

    const ok = fetched.filter((x): x is NonNullable<typeof x> => x !== null);
    const mounts = ok.flatMap((x) => (x.mount ? [x.mount] : []));
    try {
      await mountEphemerisFiles(mounts);
    } catch {
      // Only the bodies that needed THIS mount failed. A body read from the bundled
      // main-asteroid file (Pholus) was already loaded before the batch was mounted,
      // so it falls through to the probe below like any other — returning here
      // instead left it at 'loading' for the rest of the session, never requested
      // again (it has a state) and with no retry to offer (it isn't 'failed').
      for (const x of ok) if (x.mount) setState(x.n, { status: 'failed', reason: 'content' });
    } finally {
      for (const m of mounts) URL.revokeObjectURL(m.url);
    }

    // Every body of the batch leaves this loop settled — ready or failed, never
    // still 'loading'.
    for (const x of ok) {
      if (states.get(x.n)?.status === 'failed') continue;
      setState(
        x.n,
        sampleMinorBody(PROBE_JD, x.n)
          ? { status: 'ready', name: x.name }
          : { status: 'failed', reason: 'content' },
      );
    }
    // A point that just computed proves the shared mount good: a sibling still
    // failed from an earlier batch's mount would fail no longer.
    if (ok.some((x) => isHypotheticalKey(x.n) && states.get(x.n)?.status === 'ready')) {
      releaseHypotheticalFailures();
    }
  } finally {
    for (const r of fresh) {
      inflight.delete(r.n);
      // Belt and braces for a throw nobody above anticipated: a body this call
      // started must not be left 'loading', which nothing would ever revisit.
      if (states.get(r.n)?.status === 'loading') setState(r.n, { status: 'failed', reason: 'content' });
    }
    publish();
  }
}

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
