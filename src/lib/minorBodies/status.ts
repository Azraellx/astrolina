// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// What each catalog minor body on the reader's list is doing right now — DERIVED,
// never stored. The preference says what the reader chose; this says why a body
// they switched on is or isn't on the map, so every surface can say so plainly
// instead of letting a line silently fail to appear.
//
// One pure function, so the App (which draws), the Minor bodies window (which
// explains) and any plugin (which discloses) all read the same answer.
import type { MinorBodySource, MinorBodySourceGate } from '../extensions/minorBodySources';
import { bundledMinorBody, bundledSource, minorSourceById } from './bundled';
import type { MinorLoadFailure, MinorLoadState } from './loader';
import type { MinorBodiesPref, MinorListEntry } from './prefs';

export type MinorRowStatus =
  /** On the list, switched off. */
  | { kind: 'off' }
  /** Drawn on the map. */
  | { kind: 'shown' }
  /** Switched on; its file is on its way. */
  | { kind: 'loading' }
  /** Switched on; its file couldn't be loaded (a retry is offered). */
  | { kind: 'failed'; reason: MinorLoadFailure; note?: string }
  /** Loaded, but the chart's moment is outside the file's span. */
  | { kind: 'noData' }
  /** Catalog bodies aren't built for composite charts yet. */
  | { kind: 'composite' }
  /** Its source is closed to this reader (a plan that doesn't reach it): kept,
   *  never fetched, back by itself when the source opens again. */
  | { kind: 'held'; note: string; pill?: string }
  /** Added from a source this build doesn't have. */
  | { kind: 'unavailable' }
  /** Switched on, but the whole family is hidden (its own switch). */
  | { kind: 'familyHidden' }
  /** Switched on, but catalog bodies are an Advanced reading and Advanced is off.
   *  A standing state like the rest: masked, never written, back when it's on. */
  | { kind: 'advanced' }
  /** Loaded and in range, but the map isn't drawing lines for ANY body right now —
   *  see {@link MinorUndrawnReason}. Not the body's own state, so it is never read
   *  as a problem with the body. */
  | { kind: 'undrawn'; reason: MinorUndrawnReason };

/** Why a body that would otherwise be 'shown' has no lines on the map. Each is a
 *  standing state of the map, not of the body, and each takes the planets' lines
 *  down with it — the row says so rather than reading 'shown' over an empty map
 *  (a count of "drawn" bodies that nothing on screen bears out is the same
 *  failure as a line that silently fails to appear).
 *
 *  - `noChart`: nothing is open, so nothing is sampled or fetched.
 *  - `noTime`: the chart has no birth time, so no body has angle lines.
 *  - `angles`: the Angles filter shows none of the four angles catalog bodies draw.
 *  - `natalOff`: the natal lines are off the map (the eclipse clean-up, a promoted
 *    overlay, or the natal lines hidden) and catalog lines ride with them. */
export type MinorUndrawnReason = 'noChart' | 'noTime' | 'angles' | 'natalOff';

export interface MinorRow {
  entry: MinorListEntry;
  /** The name to show: the stored one, else the file's own, else ''. */
  name: string;
  on: boolean;
  status: MinorRowStatus;
}

/** The source to load an entry from: the one it was added from; a bundled body
 *  falls back to the bundled set if that source is gone. */
export function resolveMinorSource(entry: MinorListEntry): MinorBodySource | null {
  const s = minorSourceById(entry.source);
  if (s) return s;
  return bundledMinorBody(entry.n) ? bundledSource : null;
}

export function sourceGate(src: MinorBodySource): MinorBodySourceGate | null {
  return src.gate?.() ?? null;
}

export interface MinorChartContext {
  /** Advanced reading mode is on — catalog bodies belong to it (the open core's
   *  Advanced switch; the member rung in a build that ties Advanced to an account). */
  advanced: boolean;
  /** No chart open. */
  none: boolean;
  composite: boolean;
  /** Numbers that sampled at the chart's moment (loaded AND in range). */
  sampled: ReadonlySet<number>;
  /** A map-wide reason no catalog body has lines right now, known where the rows
   *  are derived (no birth time, the Angles filter). The natal-lines gates are
   *  resolved later in the App's pipeline and applied with {@link withMinorDrawGate}. */
  undrawn?: Exclude<MinorUndrawnReason, 'noChart'> | null;
}

export function deriveMinorRows(
  pref: MinorBodiesPref,
  loadState: (n: number) => MinorLoadState | undefined,
  chart: MinorChartContext,
): MinorRow[] {
  const visible = new Set(pref.visible);
  return pref.list.map((entry): MinorRow => {
    const loaded = loadState(entry.n);
    const name = entry.name || (loaded?.status === 'ready' ? loaded.name ?? '' : '') || bundledMinorBody(entry.n)?.name || '';
    const on = visible.has(entry.n);
    const row = (status: MinorRowStatus): MinorRow => ({ entry, name, on, status });
    if (!on) return row({ kind: 'off' });
    if (!chart.advanced) return row({ kind: 'advanced' });
    const src = resolveMinorSource(entry);
    if (!src) return row({ kind: 'unavailable' });
    const gate = sourceGate(src);
    if (gate?.locked) return row({ kind: 'held', note: gate.note, pill: gate.pill });
    if (!pref.shown) return row({ kind: 'familyHidden' });
    // Before the loading test: with no chart open nothing is fetched at all, so a
    // body that has never loaded would otherwise read "Loading…" indefinitely — a
    // statement about work the app isn't doing.
    if (chart.none) return row({ kind: 'undrawn', reason: 'noChart' });
    if (chart.composite) return row({ kind: 'composite' });
    if (!loaded || loaded.status === 'loading') return row({ kind: 'loading' });
    if (loaded.status === 'failed') return row({ kind: 'failed', reason: loaded.reason, note: loaded.note });
    if (!chart.sampled.has(entry.n)) return row({ kind: 'noData' });
    if (chart.undrawn) return row({ kind: 'undrawn', reason: chart.undrawn });
    return row({ kind: 'shown' });
  });
}

/** Rows with a map-wide draw gate applied: every 'shown' row becomes 'undrawn' for
 *  `reason`, every other row keeps its own (more specific) status. Returns the SAME
 *  array when there is nothing to change, so a memo keyed on it holds still. */
export function withMinorDrawGate(
  rows: readonly MinorRow[],
  reason: MinorUndrawnReason | null,
): readonly MinorRow[] {
  if (!reason || !rows.some((r) => r.status.kind === 'shown')) return rows;
  return rows.map(
    (r): MinorRow =>
      r.status.kind === 'shown' ? { ...r, status: { kind: 'undrawn', reason } } : r,
  );
}

/** The bodies to FETCH: Advanced on, switched on, family shown, source open.
 *  Held, unavailable and hidden bodies are never requested — a held body costs
 *  nothing. */
export function minorLoadRequests(
  pref: MinorBodiesPref,
  advanced: boolean,
): { n: number; source: MinorBodySource }[] {
  if (!advanced || !pref.shown) return [];
  const out: { n: number; source: MinorBodySource }[] = [];
  for (const n of pref.visible) {
    const entry = pref.list.find((e) => e.n === n);
    if (!entry) continue;
    const src = resolveMinorSource(entry);
    if (!src || sourceGate(src)?.locked) continue;
    out.push({ n, source: src });
  }
  return out;
}

/** The bodies to SAMPLE: requested AND loaded. A failed body is never sampled. */
export function minorReadyNumbers(
  pref: MinorBodiesPref,
  advanced: boolean,
  loadState: (n: number) => MinorLoadState | undefined,
): number[] {
  return minorLoadRequests(pref, advanced)
    .filter((r) => loadState(r.n)?.status === 'ready')
    .map((r) => r.n);
}
