// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useState } from 'react';
import type { EclipticPosition, RelocatedAngles } from '../../lib/ephemeris';
import { planetInk } from '../../lib/themePalette';
import { useT } from '../../i18n';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import './ChartInfoPanel.css';

const SIGNS = [
  'Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir',
  'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis',
];

// The longitudes and the angle codes are notation, so they carry translate="no" below; the
// planet names stay translatable. (2026-10-09 — the panel is mounted nowhere today, and its
// three-letter sign codes are English that never reached the catalog.)
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
  const { t, labels } = useT();
  const [open, setOpen] = useState(false);

  return (
    <aside className={`chart-info-panel ${open ? 'open' : 'closed'}`}>
      <button
        type="button"
        className="cip-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="cip-title">{t('chartInfoPanel.title')}</span>
        {isRelocated && open && (
          <span className="cip-relocated-tag">{t('chartInfoPanel.relocated')}</span>
        )}
        <span className="cip-chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open && angles && (
        <div className="cip-body">
          <h3>{t('chartInfoPanel.planets')}</h3>
          <ul className="cip-list">
            {planets.map((p) => (
              <li key={p.name}>
                <span
                  className="cip-dot"
                  style={{ background: planetInk(p.name) }}
                />
                <span
                  className="cip-glyph"
                  style={{ color: planetInk(p.name) }}
                >
                  <PlanetGlyph planet={p.name} size={14} />
                </span>
                <span className="cip-name">{labels.planet(p.name)}</span>
                <span className="cip-lon" translate="no">{fmtLon(p.lon)}</span>
              </li>
            ))}
          </ul>

          <h3>{t('chartInfoPanel.angles')}</h3>
          <ul className="cip-list cip-angles">
            <li>
              <span className="cip-name" translate="no">As</span>
              <span className="cip-lon" translate="no">{fmtLon(angles.asc)}</span>
            </li>
            <li>
              <span className="cip-name" translate="no">MC</span>
              <span className="cip-lon" translate="no">{fmtLon(angles.mc)}</span>
            </li>
            <li>
              <span className="cip-name" translate="no">Ds</span>
              <span className="cip-lon" translate="no">{fmtLon(angles.dsc)}</span>
            </li>
            <li>
              <span className="cip-name" translate="no">IC</span>
              <span className="cip-lon" translate="no">{fmtLon(angles.ic)}</span>
            </li>
          </ul>

          <p className="cip-aspect-legend">
            <span className="cip-asp-swatch trine" />{' '}
            {t('chartInfoPanel.legend.trineSextile')}&nbsp;&nbsp;
            <span className="cip-asp-swatch square" />{' '}
            {t('chartInfoPanel.legend.squareOpp')}&nbsp;&nbsp;
            <span className="cip-asp-swatch conj" />{' '}
            {t('chartInfoPanel.legend.conj')}
          </p>
        </div>
      )}

      {open && !angles && (
        <div className="cip-body">
          <p className="cip-empty">{t('chartInfoPanel.empty')}</p>
        </div>
      )}
    </aside>
  );
}
