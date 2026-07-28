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
//
// Three placements, set by `orientation`:
//   • LEFT — a rail down landscape frames (16:9).
//   • TOP  — a band across square/portrait frames (1:1, 4:5).
//   • FILL — the whole frame above the caption band, when the chart IS the subject of the
//     export rather than an annotation on a map. The wheel gets the room to carry its
//     aspect web and bi-wheel ring there, which it can't at rail/band size.
// Left and top self-measure via a ResizeObserver and report their cross-axis size up to
// the Map, which insets the framed map by that much (so lines/badges stay clear); fill
// covers the map, so it reports none. Either way the panel never scrolls — a still image
// can't — so the same callback reports whether content is overflowing, which the tool
// surfaces instead of letting the user find a sliced wheel in the saved file.
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
import type { AspectOrbs } from '../../lib/aspectPrefs';
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
      /* The rest are the full-chart extras — the same ones the expanded sidebar draws.
         They're supplied only where the wheel is big enough to carry them (the fill
         card); omitted, the wheel falls back to the plain rail/band drawing, where an
         aspect web and a second ring would crowd it into illegibility. */
      /** Bi-wheel: a second chart's bodies in an outer ring (a running time overlay). */
      overlayPlanets?: EclipticPosition[] | null;
      /** The overlay chart's own angles, marked in that outer ring. */
      overlayAngles?: RelocatedAngles | null;
      /** Aspect categories to draw. Omitted → none, the small-wheel default. */
      visibleAspects?: Set<AspectCategory>;
      /** Per-aspect orb limits. Omitted → the wheel's own defaults. */
      aspectOrbs?: AspectOrbs;
      /** Rim degree scale + cusp labels. */
      advanced?: boolean;
      /** No houses/angles — a chart cast without a known birth time. */
      planetsOnly?: boolean;
    };

interface CaptureExtrasProps {
  /** Where the panel sits: a rail, a band, or the whole frame (see the header). */
  orientation: 'left' | 'top' | 'fill';
  /** How the wheel and its balance grid stack: 'column' puts the grid below the wheel,
   *  'row' beside it. Independent of `orientation`, because a fill card picks its axis
   *  from the frame's shape rather than from a dock side. */
  clusterAxis: 'row' | 'column';
  data: CaptureFrameExtras;
  /** Wheel diameter (px) for the wheel view; ignored by the list view. */
  wheelSize: number;
  /** Reports the panel's cross-axis px (width when docked left, height when top, 0 when
   *  it fills the frame and insets nothing), and whether its content is overflowing the
   *  space it was given — i.e. whether the export would cut something off. */
  onMeasure: (px: number, clipped: boolean) => void;
}

// The default when a payload names no aspects: none, so a rail/band wheel stays as
// uncrowded as the minimap's.
const NO_ASPECTS: Set<AspectCategory> = new Set();

export function CaptureExtras({
  orientation,
  clusterAxis,
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
    const report = () => {
      // The panel clips (overflow: hidden) because a still image can't scroll, so any
      // overflow is content that silently vanishes from the file. The Map sizes the wheel
      // to fit before it gets here; this is the measured backstop behind that arithmetic,
      // which reserves the balance grid's room by approximation rather than measurement.
      const clipped =
        el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
      const cross =
        orientation === 'fill' ? 0 : orientation === 'left' ? el.offsetWidth : el.offsetHeight;
      onMeasure(cross, clipped);
    };
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
          className={`cx-wheel-cluster cx-wheel-cluster-${clusterAxis}`}
          // The rail is exactly as wide as its wheel, so a stacked balance grid gets a
          // definite width to stretch to. Elsewhere the cluster hugs its content.
          style={orientation === 'left' ? { width: wheelSize } : undefined}
        >
          <WheelSvg
            size={wheelSize}
            angles={data.angles}
            planets={data.planets}
            detailed
            interactive
            readouts
            advanced={data.advanced ?? false}
            planetsOnly={data.planetsOnly ?? false}
            overlayPlanets={data.overlayPlanets ?? null}
            overlayAngles={data.overlayAngles ?? null}
            aspectOrbs={data.aspectOrbs}
            visibleAspects={data.visibleAspects ?? NO_ASPECTS}
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
