// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useState } from 'react';
import type { RelocatedAngles } from '../../lib/ephemeris';
import { truncZodiac } from '../../lib/astro/format';
import { fmtLat, fmtLng } from '../../lib/coordFormat';
import { ZodiacGlyph } from '../ZodiacGlyph/ZodiacGlyph';
import { HoverTip } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import { useIdentity } from '../../lib/discreet';
import { useT } from '../../i18n';
import './CoordReadout.css';

/** The four angles the box lists, and whether they are a place's geodetic ones — the
 *  only fields it reads, so a geodetic set built with no chart (no cusps, no Vertex)
 *  fits as well as a full frame. */
type ReadoutAngles = Pick<RelocatedAngles, 'asc' | 'mc' | 'dsc' | 'ic' | 'geodetic'>;

interface CoordReadoutProps {
  point: { lat: number; lng: number } | null;
  angles: ReadoutAngles | null;
  source: 'natal' | 'hover' | 'pinned' | 'natal-pinned';
  /** Active point's place name. While the Coordinates view is on it lives here
   *  (the top readout hides it); null when there's nothing to name. */
  location?: string | null;
  /** Replay the fade-in when a pin upgrades to a more precise address. */
  fadeLocation?: boolean;
}

const SHOW_ANGLES_KEY = 'astro:coord-show-angles:v1';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Truncated to the second through the app's one truncation rule (format.ts
// truncZodiac), in both line systems. It used to round the seconds and carry only into
// the minute, so 29°59'59.6" printed as 29°60'00"; truncating cannot carry at all, and
// a geodetic angle is quoted truncated anyway — the sign printed is the place's zone.
// (2026-10-02)
function fmtAngle(lonRad: number): { deg: string; signIdx: number; ms: string } {
  const z = truncZodiac(lonRad, 'sec');
  return { deg: pad2(z.deg), signIdx: z.signIdx, ms: `${pad2(z.min)}'${pad2(z.sec)}"` };
}

// AS, MC, DS, IC — the order the four are listed in wherever all four appear, in both
// line systems. (2026-10-02)
const ANGLE_ROWS: { key: 'asc' | 'mc' | 'dsc' | 'ic'; label: string }[] = [
  { key: 'asc', label: 'AS' },
  { key: 'mc', label: 'MC' },
  { key: 'dsc', label: 'DS' },
  { key: 'ic', label: 'IC' },
];

// One angle row. Hovering it reveals a .ui-tip naming the sign (glyph + name) — the
// same shared hover-tip plumbing the rest of the app uses — keeping the row itself
// compact (just degrees · glyph · arcmin/sec). `masked` (Discreet, see below) blanks
// the figure AND the sign, and drops the tip that would name the sign.
function AngleRow({
  label,
  lonRad,
  masked = false,
}: {
  label: string;
  lonRad: number;
  masked?: boolean;
}) {
  const { labels } = useT();
  const id = useIdentity();
  const f = fmtAngle(lonRad);
  const { ref, pos, show, hide } = useHoverTip<HTMLLIElement>('right');
  // The row is an angle code and figures that follow the pointer: nothing in it is a
  // word, so it isn't offered to a page translator, and the degree is one string. The
  // sign's NAME lives in the tip, which is portaled out of the row and stays
  // translatable. (2026-10-09)
  if (masked) {
    return (
      <li translate="no">
        <span className="angle-label">{label}</span>
        <span className="angle-deg">{id.text('00°')}</span>
        <span className="angle-sign" />
        <span className="angle-ms">{id.text('00\'00"')}</span>
      </li>
    );
  }
  return (
    <li ref={ref} onMouseEnter={show} onMouseLeave={hide} translate="no">
      <span className="angle-label">{label}</span>
      <span className="angle-deg">{`${f.deg}°`}</span>
      <span className="angle-sign">
        <ZodiacGlyph sign={f.signIdx} size={12} />
      </span>
      <span className="angle-ms">{f.ms}</span>
      <HoverTip
        pos={pos}
        placement="right"
        title={
          <span className="angle-tip">
            <ZodiacGlyph sign={f.signIdx} size={14} className="angle-tip-glyph" />
            {labels.sign(f.signIdx)}
          </span>
        }
      />
    </li>
  );
}

export function CoordReadout({
  point,
  angles,
  source,
  location,
  fadeLocation,
}: CoordReadoutProps) {
  const { t } = useT();
  const id = useIdentity();
  const [open, setOpen] = useState<boolean>(
    () => localStorage.getItem(SHOW_ANGLES_KEY) === '1',
  );

  useEffect(() => {
    localStorage.setItem(SHOW_ANGLES_KEY, open ? '1' : '0');
  }, [open]);

  if (!point && !angles && !location) return null;

  // The two natal sources are the ONLY ones where this readout is naming the
  // chart's birthplace rather than somewhere the user is pointing at — the place
  // and its coordinates are birth data there, and nowhere else. A hovered or
  // custom-pinned point is just a spot on the map and stays legible, which is the
  // same line the map's own linework is held to.
  const natalPoint = source === 'natal' || source === 'natal-pinned';
  const blankPlace = id.on && natalPoint;
  // A chart's own angles stay readable even blanked: they are the work, not the
  // identity. A place's GEODETIC angles are not the work — they are a function of its
  // coordinates and nothing else (the MC is the longitude, read as a zodiac degree), so
  // while they are the birthplace's they say exactly what the blanked coordinates
  // above would, and are blanked with them. The same predicate masks them on the
  // wheels, the sidebar and the capture card. (2026-10-02)
  const blankAngles = blankPlace && !!angles?.geodetic;

  return (
    <div className={`coord-readout source-${source}`}>
      {location && (
        <div className="coord-location">
          <span className="coord-location-dot" />
          {/* A place name is the reader's data, not copy, so it isn't offered to a page
              translator. And it is always one keyed span, fading or not: it used to
              alternate between that span and a bare text run, which is the shape React
              cannot clean up once a translator has replaced the run. (2026-10-09) */}
          <span className="coord-location-text" translate="no">
            <span
              className={fadeLocation && !blankPlace ? 'coord-location-fade' : undefined}
              key={fadeLocation && !blankPlace ? location : 'steady'}
            >
              {blankPlace ? id.text(location) : location}
            </span>
          </span>
        </div>
      )}

      {point && (
        // Live coordinates under the pointer: figures and hemisphere letters only.
        <div className="coord-line cursor" translate="no">
          <span className="lat">{blankPlace ? id.text('00°00′N') : fmtLat(point.lat)}</span>
          <span className="lng">{blankPlace ? id.text('000°00′E') : fmtLng(point.lng)}</span>
        </div>
      )}

      {angles && (
        <>
          <button
            type="button"
            className="show-more-btn"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {/* GE on a geodetic map: these are the place's angles, not the chart's.
                (2026-10-02) */}
            <span>{angles.geodetic ? t('coordReadout.geodetic') : t('coordReadout.angles')}</span>
            <span className="show-more-chevron">{open ? '▾' : '▸'}</span>
          </button>

          {open && (
            <ul className="angle-list">
              {ANGLE_ROWS.map((r) => (
                <AngleRow
                  key={r.key}
                  label={r.label}
                  lonRad={angles[r.key]}
                  masked={blankAngles}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
