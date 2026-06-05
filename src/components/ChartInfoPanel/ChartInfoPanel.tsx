// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useState } from 'react';
import {
  PLANET_COLORS,
  PLANET_DISPLAY,
  type EclipticPosition,
  type RelocatedAngles,
} from '../../lib/ephemeris';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import './ChartInfoPanel.css';

const SIGNS = [
  'Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir',
  'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis',
];

function fmtLon(lonRad: number): string {
  const lonDeg = ((lonRad * 180) / Math.PI + 360) % 360;
  const sign = SIGNS[Math.floor(lonDeg / 30)];
  const inSign = lonDeg % 30;
  const deg = Math.floor(inSign);
  const min = Math.floor((inSign - deg) * 60);
  return `${deg}°${String(min).padStart(2, '0')}' ${sign}`;
}

interface ChartInfoPanelProps {
  angles: RelocatedAngles | null;
  planets: EclipticPosition[];
  isRelocated: boolean;
}

export function ChartInfoPanel({
  angles,
  planets,
  isRelocated,
}: ChartInfoPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <aside className={`chart-info-panel ${open ? 'open' : 'closed'}`}>
      <button
        type="button"
        className="cip-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="cip-title">Chart Info</span>
        {isRelocated && open && (
          <span className="cip-relocated-tag">relocated</span>
        )}
        <span className="cip-chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open && angles && (
        <div className="cip-body">
          <h3>Planets</h3>
          <ul className="cip-list">
            {planets.map((p) => (
              <li key={p.name}>
                <span
                  className="cip-dot"
                  style={{ background: PLANET_COLORS[p.name] }}
                />
                <span
                  className="cip-glyph"
                  style={{ color: PLANET_COLORS[p.name] }}
                >
                  <PlanetGlyph planet={p.name} size={14} />
                </span>
                <span className="cip-name">{PLANET_DISPLAY[p.name]}</span>
                <span className="cip-lon">{fmtLon(p.lon)}</span>
              </li>
            ))}
          </ul>

          <h3>Angles</h3>
          <ul className="cip-list cip-angles">
            <li>
              <span className="cip-name">As</span>
              <span className="cip-lon">{fmtLon(angles.asc)}</span>
            </li>
            <li>
              <span className="cip-name">MC</span>
              <span className="cip-lon">{fmtLon(angles.mc)}</span>
            </li>
            <li>
              <span className="cip-name">Ds</span>
              <span className="cip-lon">{fmtLon(angles.dsc)}</span>
            </li>
            <li>
              <span className="cip-name">IC</span>
              <span className="cip-lon">{fmtLon(angles.ic)}</span>
            </li>
          </ul>

          <p className="cip-aspect-legend">
            <span className="cip-asp-swatch trine" /> trine / sextile&nbsp;&nbsp;
            <span className="cip-asp-swatch square" /> square / opp&nbsp;&nbsp;
            <span className="cip-asp-swatch conj" /> conj
          </p>
        </div>
      )}

      {open && !angles && (
        <div className="cip-body">
          <p className="cip-empty">No chart loaded.</p>
        </div>
      )}
    </aside>
  );
}
