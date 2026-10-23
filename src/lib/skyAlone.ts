// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The sky alone: what a map with NO CHART in force draws, and what choosing No chart holds
// (2026-10-20). App's two decisions about it as plain functions, so scripts/verify-event-charts
// drives the very code App runs rather than a restatement of it.
//
// "No chart" is Lina's §6 answer (20 Oct 2026 reply, Salvatore's design pass): a selectable,
// persisted state in which Transits and Eclipses run with nothing from a chart under them —
// because on a geodetic map a chart is still in force when only its lines are hidden. It is
// behind the geodetic hold (lib/eventCharts resolveSelection masks the stored pick while held),
// so App reads these only while `skyAlone` — no chart in force on an unlocked device.

import type { TFn } from '../i18n';
import type { LineSystem, NodeType } from './ephemeris';
import {
  buildSkyOverlay,
  NO_CHART_BLOCKED_OVERLAYS,
  type OverlayLayer,
  type OverlayMode,
  type TransitFrame,
} from './astro/timeline';

/**
 * The overlay layer a map with no chart builds for the overlay in force: the sky at the
 * moment for the two overlays that need no chart — Transits at the target date, the eclipse
 * chart at the eclipse's maximum (null while that chart is hidden or not yet resolved) — and
 * nothing for any other. The others never reach here in App: with no chart the effective
 * overlay masks every technique that advances or compares a chart to 'off'
 * (timeline overlayBlockFor's 'no-chart'). The null is the belt to that mask's braces.
 */
export function skyLayerFor(
  overlayMode: OverlayMode,
  at: { targetDate: number; eclipseMs: number | null },
  nodeType: NodeType,
  t: TFn,
): OverlayLayer | null {
  if (overlayMode === 'transits') return buildSkyOverlay('transits', at.targetDate, nodeType, t);
  if (overlayMode === 'eclipses' && at.eclipseMs != null) {
    return buildSkyOverlay('eclipses', at.eclipseMs, nodeType, t);
  }
  return null;
}

/**
 * Whether choosing No chart HOLDS something the map is drawing now — the `changed` App's
 * selectNoChart hands its notice (useAutoFlipNotice, kind 'no-chart-held'; CLAUDE.md rule 3:
 * the notice fires only when the change will actually happen). Three things it can hold:
 *
 *  · the overlay in force, when it is one that advances or compares a chart (a progression,
 *    a direction, a synastry partner…): it reads off until a chart is picked again;
 *  · the transit frame, on a celestial map, while it is the chart's own angles: the sky
 *    alone has no natal frame, so transits are drawn in the moment's own;
 *  · an open Local Space window (2026-10-20, Salvatore): it measures from the chart's place,
 *    which the sky alone hasn't got, so it is put away — its stored flag untouched — until a
 *    chart is picked. `localSpaceOpen` is the window as it draws WITH a chart: open, and not
 *    parked under a view lock (App's lsWindowOpen less its `!skyAlone`).
 *
 * The chart's own lines going is not in it: that is what choosing No chart is, not a setting
 * held on the reader's behalf. Nor is the tilt a geodetic map's lines are laid at (J2000
 * with no chart, by Lina's one-tilt rule): a standing rule of the map, on the methods page.
 * `chartInForce` false — No chart already chosen, or an empty library — holds nothing more.
 * Reads the EFFECTIVE overlay, line system and frame, as every guard does (rule 2).
 */
export function noChartHoldChanges(s: {
  chartInForce: boolean;
  overlayMode: OverlayMode;
  lineSystem: LineSystem;
  transitFrame: TransitFrame;
  localSpaceOpen: boolean;
}): boolean {
  if (!s.chartInForce) return false;
  if (NO_CHART_BLOCKED_OVERLAYS.has(s.overlayMode)) return true;
  if (s.localSpaceOpen) return true;
  return s.overlayMode === 'transits' && s.lineSystem === 'celestial' && s.transitFrame !== 'transit-moment';
}
