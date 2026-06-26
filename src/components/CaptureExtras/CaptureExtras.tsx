// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The Capture "Details" panel: an opaque overlay inside the capture frame, exported with
// the map. Two shapes, chosen by the HUD's Wheel/List control:
//   • LIST — planet / angle positions (☽ Moon 21°38' ♉ Taurus) + an element/modality
//     tally, the same rows the wheel sidebar shows.
//   • WHEEL — the shared chart wheel (WheelSvg) with the bodies/angles the Map Filter
//     keeps visible, and (optional) a 3×4 element/modality balance grid beneath it.
// Either way it lives on the LEFT for landscape frames (16:9) and at the TOP for square/
// portrait (1:1, 4:5), self-measures via a ResizeObserver, and reports its cross-axis size
// up to the Map, which insets the framed map by that much (so lines/badges stay clear).
//
// Glyphs are plain `.astro-glyph` spans / SVG text (planet + sign) — re-stamped by the
// existing capture glyph pass with no extra export code. The wheel SVG itself is colour-
// styled via CSS vars, which html2canvas can't serialise, so captureFrame rasterises it
// separately (see Map.tsx).
import { useLayoutEffect, useRef } from 'react';
import { useT } from '../../i18n';
import {
  PLANET_COLORS,
  type PlanetName,
  type EclipticPosition,
  type RelocatedAngles,
} from '../../lib/ephemeris';
import { PLANET_GLYPHS, SIGN_GLYPHS } from '../../lib/astro/glyphChars';
import { lonToZodiac, type BalanceSeg, type BalanceGrid } from '../../lib/astro/format';
import { WheelSvg, type AspectCategory } from '../Wheel/WheelSvg';
import { CaptureBalanceGrid } from './CaptureBalanceGrid';
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

// The wheel's angle-mark keys (mirrors WheelSvg's internal AngleKey + AngleSpec.code).
export type CaptureWheelAngleKey = 'As' | 'Ds' | 'Mc' | 'Ic' | 'Vx' | 'Avx';

// The Details payload, discriminated by the chosen view. Built in App, and the type for
// both the Map's `frameExtras` prop and this panel's `data`.
export type CaptureFrameExtras =
  | {
      view: 'list';
      planets: CaptureExtraPlanet[];
      angles: CaptureExtraAngle[];
      balance: BalanceSeg[];
    }
  | {
      view: 'wheel';
      angles: RelocatedAngles;
      planets: EclipticPosition[];
      visibleAngles: Set<CaptureWheelAngleKey>;
      balanceGrid: BalanceGrid | null;
    };

interface CaptureExtrasProps {
  orientation: 'left' | 'top';
  data: CaptureFrameExtras;
  /** Wheel diameter (px) for the wheel view; ignored by the list view. */
  wheelSize: number;
  /** Reports the panel's cross-axis px (width when docked left, height when top). */
  onMeasure: (px: number) => void;
}

// The wheel view never draws the aspect web (it crowds a small wheel) — same as the minimap.
const NO_ASPECTS: Set<AspectCategory> = new Set();

export function CaptureExtras({
  orientation,
  data,
  wheelSize,
  onMeasure,
}: CaptureExtrasProps) {
  const { labels } = useT();
  const rootRef = useRef<HTMLDivElement>(null);

  // Report the panel's measured size so the Map can inset the framed view to match.
  // A ResizeObserver keeps it current as content toggles, the aspect flips, or the symbol
  // font finishes loading and reflows. Re-run when the wheel size changes too.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => onMeasure(orientation === 'left' ? el.offsetWidth : el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [orientation, onMeasure, wheelSize, data.view]);

  const sign = (lon: number) => {
    const { signIdx, degMin } = lonToZodiac(lon);
    return (
      <span className="cx-lon">
        {degMin} <span className="astro-glyph cx-sign">{SIGN_GLYPHS[signIdx]}</span>{' '}
        {labels.sign(signIdx)}
      </span>
    );
  };

  const wheel = data.view === 'wheel';

  return (
    <div
      ref={rootRef}
      className={`capture-extras capture-extras-${orientation}${wheel ? ' capture-extras-wheel' : ''}`}
      aria-hidden="true"
    >
      {data.view === 'wheel' ? (
        <div
          className={`cx-wheel-cluster cx-wheel-cluster-${orientation}`}
          style={orientation === 'left' ? { width: wheelSize } : undefined}
        >
          <WheelSvg
            size={wheelSize}
            angles={data.angles}
            planets={data.planets}
            detailed
            interactive
            readouts
            visibleAspects={NO_ASPECTS}
            visibleAngles={data.visibleAngles}
          />
          {data.balanceGrid && <CaptureBalanceGrid grid={data.balanceGrid} />}
        </div>
      ) : (
        <>
          {data.planets.map((p) => (
            <div className="cx-row" key={`p-${p.name}`}>
              <span className="cx-glyph astro-glyph" style={{ color: PLANET_COLORS[p.name] }}>
                {PLANET_GLYPHS[p.name]}
              </span>
              <span className="cx-name">{labels.planet(p.name)}</span>
              {sign(p.lon)}
            </div>
          ))}
          {data.angles.map((a) => (
            <div className="cx-row" key={`a-${a.code}`}>
              <span className="cx-glyph cx-code" style={{ color: a.color }}>
                {a.code}
              </span>
              <span className="cx-name">{a.name}</span>
              {sign(a.lon)}
            </div>
          ))}
          {data.balance.map((seg) => (
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
        </>
      )}
    </div>
  );
}
