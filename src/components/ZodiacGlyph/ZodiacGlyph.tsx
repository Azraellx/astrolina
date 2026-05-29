import type { ReactNode } from 'react';

// 12 zodiac signs as hand-drawn SVG fragments on a 24x24 viewBox.
// Indexed by sign number 0 (Aries) through 11 (Pisces).

const GLYPHS: ReactNode[] = [
  // 0 Aries — twin curls meeting at center
  <>
    <path d="M12 21 V11" />
    <path d="M4 7 Q4 13 8 13 Q11 13 12 11" />
    <path d="M20 7 Q20 13 16 13 Q13 13 12 11" />
  </>,
  // 1 Taurus — circle (head) with horns above
  <>
    <circle cx="12" cy="16" r="5" />
    <path d="M4 9 Q7 3 12 9 Q17 3 20 9" />
  </>,
  // 2 Gemini — II with serifs top + bottom
  <>
    <line x1="8" y1="6" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="18" />
    <line x1="5" y1="6" x2="19" y2="6" />
    <line x1="5" y1="18" x2="19" y2="18" />
  </>,
  // 3 Cancer — two opposed spirals (like 69)
  <>
    <circle cx="7" cy="9" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="17" cy="15" r="1.8" fill="currentColor" stroke="none" />
    <path d="M14 9 a5 5 0 0 0 -10 0" />
    <path d="M10 15 a5 5 0 0 0 10 0" />
  </>,
  // 4 Leo — head loop + curving mane/tail
  <>
    <circle cx="9" cy="9" r="3.5" />
    <path d="M12.5 9 Q19 9 19 15 Q19 20 13 19" />
  </>,
  // 5 Virgo — three humps + curl tail
  <>
    <path d="M4 19 V10 Q4 7 6 7 Q8 7 8 10 V19" />
    <path d="M8 10 Q8 7 10 7 Q12 7 12 10 V19" />
    <path d="M12 10 Q12 7 14 7 Q16 7 16 10 V17 Q16 21 19 19 Q22 17 18 14" />
  </>,
  // 6 Libra — scales: arc over twin rails
  <>
    <line x1="3" y1="19" x2="21" y2="19" />
    <line x1="6" y1="15" x2="18" y2="15" />
    <path d="M7 15 Q12 7 17 15" />
  </>,
  // 7 Scorpio — three humps + arrow tail
  <>
    <path d="M4 19 V10 Q4 7 6 7 Q8 7 8 10 V19" />
    <path d="M8 10 Q8 7 10 7 Q12 7 12 10 V19" />
    <path d="M12 10 Q12 7 14 7 Q16 7 16 10 V19 L21 22" />
    <polyline points="18,22 21,22 21,19" />
  </>,
  // 8 Sagittarius — arrow with perpendicular cross
  <>
    <line x1="4" y1="20" x2="20" y2="4" />
    <polyline points="14,4 20,4 20,10" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </>,
  // 9 Capricorn — V horns + fish-tail loop
  <>
    <path d="M4 7 L9 18 L13 7 V14 Q13 18 16 18 Q20 18 20 14 a2.5 2.5 0 0 0 -5 0" />
  </>,
  // 10 Aquarius — two stacked waves
  <>
    <polyline points="3,10 7,7 11,10 15,7 19,10" />
    <polyline points="3,16 7,13 11,16 15,13 19,16" />
  </>,
  // 11 Pisces — two outward crescents joined by bar
  <>
    <path d="M6 4 Q2 12 6 20" />
    <path d="M18 4 Q22 12 18 20" />
    <line x1="6" y1="12" x2="18" y2="12" />
  </>,
];

interface ZodiacGlyphProps {
  sign: number;
  size?: number;
  className?: string;
  x?: number;
  y?: number;
  color?: string;
}

export function ZodiacGlyph({
  sign,
  size = 14,
  className,
  x,
  y,
  color,
}: ZodiacGlyphProps) {
  const inner = (
    <g
      stroke={color ?? 'currentColor'}
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[sign]}
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
