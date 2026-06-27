// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The Balance GRID shown beneath the Capture WHEEL view: a 3-column (modalities:
// Cardinal/Fixed/Mutable) × 4-row (elements: Fire/Earth/Air/Water) table, each cell
// holding the planet glyphs whose sign falls in that element+modality combo (4×3 = the
// 12 signs). The header row/column carry the modality/element glyphs; cell bodies are
// PLANET_COLORS-tinted `.astro-glyph` spans, so the existing capture glyph re-stamp draws
// them in the export with no extra code (same as the list rows).
import { Fragment } from 'react';
import { PLANET_COLORS, type PlanetName } from '../../lib/ephemeris';
import { PLANET_GLYPHS, ELEMENT_GLYPHS, MODALITY_GLYPHS } from '../../lib/astro/glyphChars';
import {
  BALANCE_ELEMENTS,
  BALANCE_MODALITIES,
  type BalanceGrid,
} from '../../lib/astro/format';
import { useT } from '../../i18n';
import './CaptureBalanceGrid.css';

// Element tints, matching the expanded sidebar's Balance palette (es-el-* in
// ExpandedChartSidebar.css), so the grid reads in the app's established colours.
const ELEMENT_COLORS: Record<(typeof BALANCE_ELEMENTS)[number], string> = {
  fire: 'rgb(232, 90, 79)',
  earth: 'rgb(141, 188, 109)',
  air: 'rgb(94, 194, 224)',
  water: 'rgb(126, 116, 219)',
};
// Modalities have no traditional colour — the sidebar's amber/slate/teal triad.
const MODALITY_COLORS: Record<(typeof BALANCE_MODALITIES)[number], string> = {
  cardinal: 'rgb(216, 154, 65)',
  fixed: 'rgb(140, 152, 170)',
  mutable: 'rgb(95, 178, 152)',
};

export function CaptureBalanceGrid({ grid }: { grid: BalanceGrid }) {
  const { t } = useT();
  return (
    <div className="capture-balance-grid" aria-hidden="true">
      {/* Header row: empty corner, then the three modality glyphs + names. */}
      <div className="cbg-corner" />
      {BALANCE_MODALITIES.map((m) => (
        <div className="cbg-head cbg-col-head" key={`h-${m}`}>
          <span className="astro-glyph cbg-head-glyph" style={{ color: MODALITY_COLORS[m] }}>
            {MODALITY_GLYPHS[m]}
          </span>
          {/* The modality glyphs aren't widely recognised (unlike the element triangles), so spell
              the name out beside each one. The element row heads stay glyph-only. */}
          <span className="cbg-head-name" style={{ color: MODALITY_COLORS[m] }}>
            {t(`expandedSidebar.modality.${m}`)}
          </span>
        </div>
      ))}
      {/* One row per element: the element glyph, then its three modality cells. */}
      {BALANCE_ELEMENTS.map((e, ei) => (
        <Fragment key={`row-${e}`}>
          <div className="cbg-head cbg-row-head">
            <span className="astro-glyph cbg-head-glyph" style={{ color: ELEMENT_COLORS[e] }}>
              {ELEMENT_GLYPHS[e]}
            </span>
          </div>
          {BALANCE_MODALITIES.map((m, mi) => (
            <div className="cbg-cell" key={`c-${e}-${m}`}>
              {grid[ei][mi].map((name: PlanetName) => (
                <span
                  key={name}
                  className="astro-glyph cbg-body"
                  style={{ color: PLANET_COLORS[name] }}
                >
                  {PLANET_GLYPHS[name]}
                </span>
              ))}
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
