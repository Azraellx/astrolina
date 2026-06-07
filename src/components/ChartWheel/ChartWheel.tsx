// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useState } from 'react';
import type { EclipticPosition, PlanetName, RelocatedAngles } from '../../lib/ephemeris';
import { WheelSvg, type AspectCategory } from '../Wheel/WheelSvg';
import { HoverTip } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import { useT } from '../../i18n';
import './ChartWheel.css';

interface Point {
  lat: number;
  lng: number;
  label?: string;
}

interface ChartWheelProps {
  // pinned / isNatalPin / point still drive the minimap's accent border; the
  // NATAL/PINNED status pill and the Expand control now live in the top bar.
  point: Point | null;
  pinned: boolean;
  isNatalPin: boolean;
  angles: RelocatedAngles | null;
  planets: EclipticPosition[];
  /** Map Filter visibility — planets toggled off are hidden in the wheel too. */
  visiblePlanets: Set<PlanetName>;
}

// 25% smaller than the original 280 — the glyphs/labels keep their absolute px
// sizes (set in WheelSvg / WheelSvg.css), so only the wheel tightens, staying
// readable.
const COMPACT_SIZE = 210;
// 75% larger when the in-place enlarge toggle is on.
const ENLARGED_SIZE = Math.round(COMPACT_SIZE * 1.75);

// Diagonal expand arrow: points NE (up-right) to enlarge, SW (down-left) to shrink.
const ENLARGE_ICON = 'M4 12L12 4M12 4H8M12 4V8';
const SHRINK_ICON = 'M12 4L4 12M4 12H8M4 12V8';

// An empty visible-aspect set suppresses every aspect (inner) line, so the
// enlarged wheel takes the detailed look but without the aspect web.
const NO_ASPECTS: Set<AspectCategory> = new Set();

export function ChartWheel({
  point,
  pinned,
  isNatalPin,
  angles,
  planets,
  visiblePlanets,
}: ChartWheelProps) {
  const { t } = useT();
  const [enlarged, setEnlarged] = useState(false);
  const { ref: resizeRef, pos: resizeTipPos, show: showResizeTip, hide: hideResizeTip } =
    useHoverTip<HTMLButtonElement>();
  const shownPlanets = planets.filter((p) => visiblePlanets.has(p.name));
  const wheelClass = isNatalPin
    ? 'natal-pinned'
    : pinned
      ? 'pinned'
      : point
        ? 'hover'
        : '';

  return (
    <aside className={`chart-wheel ${wheelClass} ${enlarged ? 'enlarged' : ''}`}>
      {angles && (
        <>
          <button
            ref={resizeRef}
            type="button"
            className="chart-wheel-resize"
            onClick={() => setEnlarged((v) => !v)}
            onMouseEnter={showResizeTip}
            onMouseLeave={hideResizeTip}
            onFocus={showResizeTip}
            onBlur={hideResizeTip}
            aria-label={t('chartWheel.resizeLabel')}
            aria-pressed={enlarged}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={enlarged ? SHRINK_ICON : ENLARGE_ICON} />
            </svg>
          </button>
          <HoverTip
            pos={resizeTipPos}
            title={enlarged ? t('chartWheel.shrink') : t('chartWheel.enlarge')}
          />
        </>
      )}
      {angles ? (
        <div className="chart-wheel-svg-wrap">
          <WheelSvg
            size={enlarged ? ENLARGED_SIZE : COMPACT_SIZE}
            angles={angles}
            planets={shownPlanets}
            detailed={enlarged}
            visibleAspects={NO_ASPECTS}
          />
        </div>
      ) : (
        <div className="chart-wheel-placeholder">{t('chartWheel.placeholder')}</div>
      )}
    </aside>
  );
}
