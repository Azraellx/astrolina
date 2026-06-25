// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The Capture "Extras" panel: an opaque list of planet / angle positions
// (☽ Moon 21°38' ♉ Taurus) the same as the wheel sidebar shows, overlaid inside
// the capture frame so it's exported with the map. Lives on the LEFT for landscape
// frames (16:9) and at the TOP for square/portrait (1:1, 4:5). It self-measures via
// a ResizeObserver and reports its cross-axis size up to the Map, which insets the
// framed map by that much (so lines/badges stay clear, like the caption band does).
//
// Glyphs are plain `.astro-glyph` spans (planet + sign) — sized in `em` so they
// scale with the clamped row font, and re-stamped by the existing capture glyph
// pass with no extra export code. Angle "glyphs" are the 2-letter code as text.
import { useLayoutEffect, useRef } from 'react';
import { useT } from '../../i18n';
import { PLANET_COLORS, type PlanetName } from '../../lib/ephemeris';
import { PLANET_GLYPHS, SIGN_GLYPHS } from '../../lib/astro/glyphChars';
import { lonToZodiac, type BalanceSeg } from '../../lib/astro/format';
import './CaptureExtras.css';

export interface CaptureExtraPlanet {
  name: PlanetName;
  lon: number;
}
export interface CaptureExtraAngle {
  code: string;
  name: string;
  lon: number;
  color: string;
}

interface CaptureExtrasProps {
  orientation: 'left' | 'top';
  planets: CaptureExtraPlanet[];
  angles: CaptureExtraAngle[];
  /** Element/modality tally rows (constellations of planet glyphs). */
  balance: BalanceSeg[];
  /** Reports the panel's cross-axis px (width when docked left, height when top). */
  onMeasure: (px: number) => void;
}

export function CaptureExtras({
  orientation,
  planets,
  angles,
  balance,
  onMeasure,
}: CaptureExtrasProps) {
  const { labels } = useT();
  const rootRef = useRef<HTMLDivElement>(null);

  // Report the panel's measured size so the Map can inset the framed view to match.
  // A ResizeObserver keeps it current as rows toggle, the aspect flips, or the symbol
  // font finishes loading and reflows the rows.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => onMeasure(orientation === 'left' ? el.offsetWidth : el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [orientation, onMeasure]);

  const sign = (lon: number) => {
    const { signIdx, degMin } = lonToZodiac(lon);
    return (
      <span className="cx-lon">
        {degMin} <span className="astro-glyph cx-sign">{SIGN_GLYPHS[signIdx]}</span>{' '}
        {labels.sign(signIdx)}
      </span>
    );
  };

  return (
    <div
      ref={rootRef}
      className={`capture-extras capture-extras-${orientation}`}
      aria-hidden="true"
    >
      {planets.map((p) => (
        <div className="cx-row" key={`p-${p.name}`}>
          <span className="cx-glyph astro-glyph" style={{ color: PLANET_COLORS[p.name] }}>
            {PLANET_GLYPHS[p.name]}
          </span>
          <span className="cx-name">{labels.planet(p.name)}</span>
          {sign(p.lon)}
        </div>
      ))}
      {angles.map((a) => (
        <div className="cx-row" key={`a-${a.code}`}>
          <span className="cx-glyph cx-code" style={{ color: a.color }}>
            {a.code}
          </span>
          <span className="cx-name">{a.name}</span>
          {sign(a.lon)}
        </div>
      ))}
      {balance.map((seg) => (
        <div className="cx-row cx-brow" key={`b-${seg.key}`}>
          <span className="cx-glyph astro-glyph">{seg.glyph}</span>
          <span className="cx-name">{seg.label}</span>
          <span className="cx-count">({seg.bodies.length})</span>
          <span className="cx-bodies">
            {seg.bodies.map((name) => (
              <span
                key={name}
                className="astro-glyph cx-body"
                style={{ color: PLANET_COLORS[name] }}
              >
                {PLANET_GLYPHS[name]}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
