// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Angle lines + zenith stamps for CATALOG minor bodies (lib/minorBodies/). The
// geometry is the planets' own (angleLineRuns in lines.ts — one function draws
// both families); only the feature properties differ.
//
// The four classical angles only — no Vertex axis. That stays with the planets and
// the five built-in minor bodies (Chiron, Ceres, Pallas, Juno, Vesta), which draw
// through generateLines. The reason is on calculation-methods.md ("Numbered minor
// planets"). The window's "no lines" status (deriveMinorRows' `angles` gate in
// App.tsx) already tests only MC/IC/ASC/DSC, and must keep matching this.
//
// These features deliberately carry NO `planet` key. Everything written for the
// built-in bodies reads `props.planet` and decorates it through PlanetName-keyed
// tables; a catalog feature that carried one would reach those tables with an id
// they can't decorate. A catalog line is `kind: 'minor'`, named by `body`/`number`,
// and every consumer that handles it does so on purpose.
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { MinorPosition } from '../ephemeris';
import { isHypotheticalKey, minorId, type MinorBodyId } from '../minorBodies/ids';
import { hypotheticalPoint } from '../minorBodies/hypothetical';
import {
  angleLineRuns,
  LINE_TYPE_LABEL,
  normLng,
  type LineType,
  type MeridianLng,
} from './lines';

const RAD2DEG = 180 / Math.PI;

export interface MinorLineProps {
  kind: 'minor';
  body: MinorBodyId;
  number: number;
  /** Display name ('' when unknown — the label then falls back to the number). */
  name: string;
  lineType: LineType;
  color: string;
  /** "Eros MC" — the same `Name ANGLE` shape as the planet and star labels. */
  label: string;
  /** Map sprite for the bead along the line and the zenith stamp. */
  icon: string;
  /** Overlay/promoted tag ("Tr", "Sa", …), as on the other families — set by
   *  timeline.tagMinor, which leaves `label` alone; absent on the chart's own lines. */
  tag?: string;
}

export interface MinorZenithProps {
  kind: 'minor';
  body: MinorBodyId;
  number: number;
  name: string;
  color: string;
  icon: string;
  tag?: string;
}

/** How one body is decorated — resolved by the caller (theme, glyph availability). */
export interface MinorDecor {
  name: string;
  color: string;
  /** Map sprite id (a palette coin, or the body's own glyph coin). */
  icon: string;
}

/** The short reference a label uses: the name, or "(433)" when no name is known —
 *  and "Zeus (hyp)" for a hypothetical point, never a number. That half restates
 *  minorBodies/naming.ts's card.hyp template (this module has no t()); the verify
 *  suite pins the two equal. It matters beyond wording: the map keys its hover popup
 *  on this label, so the asteroid Zeus and the point Zeus must never share one. */
export function minorLabelName(n: number, name: string): string {
  if (isHypotheticalKey(n)) {
    const own = name || hypotheticalPoint(n)?.name || '';
    return own ? `${own} (hyp)` : '';
  }
  return name || `(${n})`;
}

export function generateMinorLines(
  positions: readonly MinorPosition[],
  meridianLng: MeridianLng,
  decor: (n: number) => MinorDecor,
): FeatureCollection<LineString, MinorLineProps> {
  const features: Feature<LineString, MinorLineProps>[] = [];
  for (const p of positions) {
    const d = decor(p.n);
    const body = minorId(p.n);
    for (const run of angleLineRuns(p, meridianLng, { vertex: false })) {
      features.push({
        type: 'Feature',
        properties: {
          kind: 'minor',
          body,
          number: p.n,
          name: d.name,
          lineType: run.lineType,
          color: d.color,
          label: `${minorLabelName(p.n, d.name)} ${LINE_TYPE_LABEL[run.lineType]}`,
          icon: d.icon,
        },
        geometry: { type: 'LineString', coordinates: run.coords },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** The zenith point of each catalog body — on its MC line at latitude = declination,
 *  exactly as generateZenithStamps places the planets'. */
export function generateMinorZenith(
  positions: readonly MinorPosition[],
  meridianLng: MeridianLng,
  decor: (n: number) => MinorDecor,
): FeatureCollection<Point, MinorZenithProps> {
  const features: Feature<Point, MinorZenithProps>[] = positions.map((p) => {
    const d = decor(p.n);
    return {
      type: 'Feature',
      // Stable per-body id for anything reading the collection directly. The MAP
      // does not key hover state on it: GeoJSON ids reach the tiles only as
      // integers (a string id arrives as 0 for every feature), so the map promotes
      // `body` to the feature id instead (`promoteId` on the minor-zenith source).
      id: minorId(p.n),
      properties: {
        kind: 'minor',
        body: minorId(p.n),
        number: p.n,
        name: d.name,
        color: d.color,
        icon: d.icon,
      },
      geometry: {
        type: 'Point',
        coordinates: [normLng(meridianLng(p.ra)), p.dec * RAD2DEG],
      },
    };
  });
  return { type: 'FeatureCollection', features };
}
