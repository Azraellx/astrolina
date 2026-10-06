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
import type { OverlayKind } from '../astro/timeline';
import type { MinorBodySource, MinorBodySourceGate } from '../extensions/minorBodySources';
import { bundledMinorBody, bundledSource, minorSourceById } from './bundled';
import { isHypotheticalKey } from './ids';
import type { MinorLoadFailure, MinorLoadState } from './loader';
import type { MinorBodiesPref, MinorListEntry } from './prefs';

export type MinorRowStatus =
  /** On the list, switched off. */
  | { kind: 'off' }
  /** Has lines on the map. */
  | { kind: 'shown' }
  /** Switched on; its file is on its way. */
  | { kind: 'loading' }
  /** Switched on; its file couldn't be loaded (a retry is offered). */
  | { kind: 'failed'; reason: MinorLoadFailure; note?: string }
  /** Loaded, but the instant the lines are drawn at — the chart's moment, or the slid
   *  one while Slide moves the map — is outside the file's span (a hypothetical
   *  point's: the planets'). Greyed on the list, never taken off it. */
  | { kind: 'noData' }
  /** Its source is closed to this reader (a plan that doesn't reach it): kept,
   *  never fetched, back by itself when the source opens again. `note` is the
   *  source's own sentence, which is all the row says — no tier pill beside it. */
  | { kind: 'held'; note: string }
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
 *  - `natalOff`: the natal lines are off the map (the eclipse clean-up, or the natal
 *    lines hidden) and catalog lines ride with them. A promoted overlay is not one of
 *    these: it stands in for the chart, catalog bodies included (minorChartContext). */
export type MinorUndrawnReason = 'noChart' | 'noTime' | 'angles' | 'natalOff';

export interface MinorRow {
  entry: MinorListEntry;
  /** The name to show: the stored one, else the file's own, else ''. */
  name: string;
  on: boolean;
  /** The body's lines from the CHART — the natal set, or a promoted overlay standing in
   *  for it. */
  status: MinorRowStatus;
  /** The body's lines from an overlay drawn BESIDE the chart: 'shown' when the overlay
   *  placed it, 'noData' when its file doesn't reach the overlay's instant (for a
   *  composite partner, either parent's date). `mode` names the overlay.
   *
   *  Present ONLY while overlay catalog lines are actually drawn beside the chart's —
   *  absent with no overlay, with a promoted one (which IS the chart's set, in `status`),
   *  and whenever the overlay's lines are off the map — because a statement about lines
   *  that aren't drawn either way would be a statement about a no-op (CLAUDE.md rule 3).
   *  And only on rows whose own status leaves the question open: 'shown', 'noData', or
   *  no lines for a reason the overlay doesn't share (no birth time; the natal lines off
   *  the map). */
  overlay?: { kind: 'shown' | 'noData'; mode: OverlayKind };
}

/** Whether a row has lines on the map from either side — the chart's, or an overlay's
 *  drawn beside it. The ONE test of "has lines", so a count and the rows agree. */
export function minorRowHasLines(r: MinorRow): boolean {
  return r.status.kind === 'shown' || r.overlay?.kind === 'shown';
}

/** The source to load an entry from: the one it was added from; a bundled body
 *  falls back to the bundled set if that source is gone. A hypothetical point is the
 *  bundled set's whatever it was stored under — and one this build doesn't know (a
 *  newer build's) has no source at all, so it reads 'unavailable' and is never
 *  requested. */
export function resolveMinorSource(entry: MinorListEntry): MinorBodySource | null {
  if (isHypotheticalKey(entry.n)) return bundledMinorBody(entry.n) ? bundledSource : null;
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
  /** Numbers that sampled at the instant the lines are drawn at (loaded AND in range) —
   *  the slid one while sliding, so a row and its lines never disagree. On a composite,
   *  the bodies both parents' dates reach (compositeMinorSamples). */
  sampled: ReadonlySet<number>;
  /** Numbers an overlay drawn BESIDE the chart placed — set ONLY while that overlay's
   *  catalog lines are on the map (see MinorRow.overlay); null or absent otherwise. */
  overlaySampled?: ReadonlySet<number> | null;
  /** That overlay's mode; read only beside `overlaySampled`. */
  overlayMode?: OverlayKind | null;
  /** A map-wide reason no catalog body has lines right now, known where the rows
   *  are derived (no birth time, the Angles filter). The natal-lines gates are
   *  resolved later in the App's pipeline and applied with {@link withMinorDrawGate}. */
  undrawn?: Exclude<MinorUndrawnReason, 'noChart'> | null;
}

/** The facts the App has resolved by the time it derives the rows — the chart's and the
 *  overlay's — before they are folded into one {@link MinorChartContext}. */
export interface MinorRowsFrame {
  advanced: boolean;
  /** No chart open. */
  none: boolean;
  /** Numbers the CHART's own lines sampled (the slid set while sliding). */
  chartSampled: ReadonlySet<number>;
  /** The active overlay's catalog set — the numbers its rule placed — and its mode; null
   *  with no overlay layer. */
  overlay: { sampled: ReadonlySet<number>; mode: OverlayKind } | null;
  /** The overlay stands in for the chart (Natal off): its set IS the chart's. */
  promoted: boolean;
  /** The overlay's lines reach the map beside the chart's (App's mapOverlay: eclipse lines
   *  are opt-in). */
  overlayOnMap: boolean;
  /** No birth time, on a map that draws nothing without one (a geodetic map draws them). */
  noTime: boolean;
  /** The Angles filter shows none of the four angles catalog bodies draw. */
  anglesOff: boolean;
}

/**
 * The rows' context from the App's resolved facts — ONE place for the three rules an
 * overlay adds, so the window, the More button's count and every plugin read them alike:
 *  - promoted, the overlay's set is the chart's set (its rows read 'shown' where the
 *    overlay placed them), and no birth time stops nothing: the overlay has a moment of its
 *    own;
 *  - beside the chart, the overlay's side is passed only while its lines are on the map and
 *    the Angles filter leaves them an angle to draw — otherwise a row would report on lines
 *    that aren't drawn either way (CLAUDE.md rule 3);
 *  - with no overlay, exactly the context the chart alone gives.
 */
export function minorChartContext(f: MinorRowsFrame): MinorChartContext {
  const promoted = f.promoted && f.overlay !== null;
  const beside = !promoted && f.overlayOnMap && !f.anglesOff ? f.overlay : null;
  return {
    advanced: f.advanced,
    none: f.none,
    sampled: promoted ? f.overlay!.sampled : f.chartSampled,
    overlaySampled: beside?.sampled ?? null,
    overlayMode: beside?.mode ?? null,
    undrawn: f.noTime && !promoted ? 'noTime' : f.anglesOff ? 'angles' : null,
  };
}

/** The name a row shows: the stored one, else the file's own, else the bundled manifest's,
 *  else ''. Exported so the line decoration names a body exactly as its row does. */
export function minorRowName(entry: MinorListEntry, loaded: MinorLoadState | undefined): string {
  return entry.name || (loaded?.status === 'ready' ? loaded.name ?? '' : '') || bundledMinorBody(entry.n)?.name || '';
}

export function deriveMinorRows(
  pref: MinorBodiesPref,
  loadState: (n: number) => MinorLoadState | undefined,
  chart: MinorChartContext,
): MinorRow[] {
  const visible = new Set(pref.visible);
  return pref.list.map((entry): MinorRow => {
    const loaded = loadState(entry.n);
    const name = minorRowName(entry, loaded);
    const on = visible.has(entry.n);
    const row = (status: MinorRowStatus): MinorRow => ({ entry, name, on, status });
    // The overlay's side, on the statuses that leave it open: the body is loaded and
    // either drawn, out of range at the chart's instant (the overlay's may be another),
    // or without lines for a reason the overlay's own instant doesn't share.
    const withOverlay = (status: MinorRowStatus): MinorRow => {
      const r = row(status);
      if (!chart.overlaySampled || !chart.overlayMode) return r;
      const kind = chart.overlaySampled.has(entry.n) ? 'shown' : 'noData';
      return { ...r, overlay: { kind, mode: chart.overlayMode } };
    };
    if (!on) return row({ kind: 'off' });
    if (!chart.advanced) return row({ kind: 'advanced' });
    const src = resolveMinorSource(entry);
    if (!src) return row({ kind: 'unavailable' });
    const gate = sourceGate(src);
    if (gate?.locked) return row({ kind: 'held', note: gate.note });
    if (!pref.shown) return row({ kind: 'familyHidden' });
    // Before the loading test: with no chart open nothing is fetched at all, so a
    // body that has never loaded would otherwise read "Loading…" indefinitely — a
    // statement about work the app isn't doing.
    if (chart.none) return row({ kind: 'undrawn', reason: 'noChart' });
    if (!loaded || loaded.status === 'loading') return row({ kind: 'loading' });
    if (loaded.status === 'failed') return row({ kind: 'failed', reason: loaded.reason, note: loaded.note });
    if (!chart.sampled.has(entry.n)) return withOverlay({ kind: 'noData' });
    if (chart.undrawn) {
      // The Angles filter takes an overlay's lines down with the chart's (the App passes
      // no overlaySampled then either); no birth time doesn't — transits still draw.
      const status: MinorRowStatus = { kind: 'undrawn', reason: chart.undrawn };
      return chart.undrawn === 'noTime' ? withOverlay(status) : row(status);
    }
    return withOverlay({ kind: 'shown' });
  });
}

/** Rows with a map-wide draw gate applied: every 'shown' row becomes 'undrawn' for
 *  `reason`, every other row keeps its own (more specific) status. Returns the SAME
 *  array when there is nothing to change, so a memo keyed on it holds still. A row's
 *  `overlay` side rides through untouched: these gates are the CHART's lines, and an
 *  overlay drawn beside the chart is gated before the rows are derived
 *  (MinorChartContext.overlaySampled). */
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
