import type { PlanetName } from '../../lib/ephemeris';
import type { ReactNode } from 'react';

// Standard astrological glyphs as inline SVG fragments.
// All drawn on a 24x24 viewBox, centered around (12, 12), stroke-based.
// Color via currentColor; size via the `size` prop.

const GLYPHS: Record<PlanetName, ReactNode> = {
  Sun: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  Moon: (
    <path d="M14 4 a8 8 0 1 0 0 16 a6 6 0 1 1 0 -16 Z" />
  ),
  Mercury: (
    <>
      <path d="M8.5 3 a4 2.5 0 0 0 7 0" />
      <circle cx="12" cy="9.5" r="3.5" />
      <line x1="12" y1="13" x2="12" y2="20" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </>
  ),
  Venus: (
    <>
      <circle cx="12" cy="8" r="4" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <line x1="9" y1="17.5" x2="15" y2="17.5" />
    </>
  ),
  Mars: (
    <>
      <circle cx="10" cy="14" r="4.5" />
      <line x1="13.2" y1="10.8" x2="20" y2="4" />
      <polyline points="14.5,4 20,4 20,9.5" />
    </>
  ),
  Jupiter: (
    <>
      <line x1="4" y1="9" x2="14" y2="9" />
      <path d="M9 5 V18 a4 4 0 0 1 -4 4 a2 2 0 0 1 -1 -0.5" />
    </>
  ),
  Saturn: (
    <>
      <line x1="11" y1="4" x2="11" y2="18" />
      <line x1="7" y1="7" x2="15" y2="7" />
      <path d="M11 17 a4 4 0 0 0 7 -3 a3 3 0 0 0 -3 -3" />
    </>
  ),
  Uranus: (
    <>
      <line x1="5" y1="3" x2="5" y2="14" />
      <line x1="19" y1="3" x2="19" y2="14" />
      <line x1="5" y1="9" x2="19" y2="9" />
      <line x1="12" y1="14" x2="12" y2="17" />
      <circle cx="12" cy="20" r="2.5" />
    </>
  ),
  Neptune: (
    <>
      <line x1="4" y1="3" x2="4" y2="11" />
      <line x1="20" y1="3" x2="20" y2="11" />
      <line x1="12" y1="3" x2="12" y2="11" />
      <path d="M4 9 a8 8 0 0 0 16 0" />
      <line x1="12" y1="11" x2="12" y2="21" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </>
  ),
  Pluto: (
    <>
      <path d="M6 11 a6 6 0 0 1 12 0" />
      <circle cx="12" cy="8" r="2.2" />
      <line x1="12" y1="13" x2="12" y2="21" />
      <line x1="9" y1="17.5" x2="15" y2="17.5" />
    </>
  ),
  NorthNode: (
    <>
      <path d="M5 19 V12 a7 7 0 0 1 14 0 V19" />
      <circle cx="5" cy="20.5" r="1.5" />
      <circle cx="19" cy="20.5" r="1.5" />
    </>
  ),
  SouthNode: (
    <>
      <path d="M5 5 V12 a7 7 0 0 0 14 0 V5" />
      <circle cx="5" cy="3.5" r="1.5" />
      <circle cx="19" cy="3.5" r="1.5" />
    </>
  ),
  Chiron: (
    <>
      <circle cx="13" cy="6" r="3.5" />
      <line x1="11" y1="9" x2="11" y2="21" />
      <line x1="11" y1="14.5" x2="18" y2="21" />
    </>
  ),
  Ceres: (
    <>
      <path d="M16 4 a7 7 0 1 0 0 13 a5 5 0 1 1 0 -13" />
      <line x1="12" y1="17" x2="12" y2="22" />
      <line x1="9.5" y1="20" x2="14.5" y2="20" />
    </>
  ),
  Pallas: (
    <>
      <polygon points="12,3 16,9 12,15 8,9" />
      <line x1="12" y1="15" x2="12" y2="22" />
      <line x1="9" y1="19" x2="15" y2="19" />
    </>
  ),
  Juno: (
    <>
      <line x1="12" y1="7" x2="12" y2="22" />
      <line x1="9" y1="19" x2="15" y2="19" />
      <line x1="12" y1="2" x2="12" y2="9" />
      <line x1="8.5" y1="5.5" x2="15.5" y2="5.5" />
      <line x1="9.5" y1="3" x2="14.5" y2="8" />
      <line x1="14.5" y1="3" x2="9.5" y2="8" />
    </>
  ),
  Vesta: (
    <>
      <line x1="4" y1="21" x2="20" y2="21" />
      <line x1="6" y1="21" x2="6" y2="16" />
      <line x1="18" y1="21" x2="18" y2="16" />
      <line x1="6" y1="16" x2="18" y2="16" />
      <polyline points="9,15 12,3 15,15" />
    </>
  ),
};

interface PlanetGlyphProps {
  planet: PlanetName;
  size?: number;
  className?: string;
  // SVG-positioning mode: when provided, renders as a nested <svg> at this position.
  x?: number;
  y?: number;
  // Override stroke color (default: currentColor — picks up CSS color).
  color?: string;
}

export function PlanetGlyph({
  planet,
  size = 16,
  className,
  x,
  y,
  color,
}: PlanetGlyphProps) {
  const inner = (
    <g
      stroke={color ?? 'currentColor'}
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[planet]}
    </g>
  );

  if (x !== undefined && y !== undefined) {
    return (
      <svg
        x={x - size / 2}
        y={y - size / 2}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={className}
        pointerEvents="none"
      >
        {inner}
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={color ? { color } : undefined}
    >
      {inner}
    </svg>
  );
}
