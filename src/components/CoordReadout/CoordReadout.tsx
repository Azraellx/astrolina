import { useEffect, useState } from 'react';
import type { RelocatedAngles } from '../../lib/ephemeris';
import { ZodiacGlyph } from '../ZodiacGlyph/ZodiacGlyph';
import './CoordReadout.css';

interface CoordReadoutProps {
  point: { lat: number; lng: number } | null;
  angles: RelocatedAngles | null;
  source: 'natal' | 'hover' | 'pinned' | 'natal-pinned';
}

const SHOW_ANGLES_KEY = 'astro:coord-show-angles:v1';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function fmtDms(absDeg: number): { d: number; m: number; s: number } {
  const d = Math.floor(absDeg);
  const minFull = (absDeg - d) * 60;
  const m = Math.floor(minFull);
  let s = Math.round((minFull - m) * 60);
  if (s === 60) return { d, m: m + 1, s: 0 };
  return { d, m, s };
}

function fmtLat(latDeg: number): string {
  const dir = latDeg >= 0 ? 'N' : 'S';
  const { d, m, s } = fmtDms(Math.abs(latDeg));
  return `${d}°${dir}${pad2(m)}'${pad2(s)}"`;
}

function fmtLng(lngDeg: number): string {
  const dir = lngDeg >= 0 ? 'E' : 'W';
  const { d, m, s } = fmtDms(Math.abs(lngDeg));
  return `${d}°${dir}${pad2(m)}'${pad2(s)}"`;
}

function fmtAngle(lonRad: number): { deg: string; signIdx: number; ms: string } {
  const lonDeg = ((lonRad * 180) / Math.PI + 360) % 360;
  const signIdx = Math.floor(lonDeg / 30);
  const inSign = lonDeg % 30;
  const { d, m, s } = fmtDms(inSign);
  return { deg: pad2(d), signIdx, ms: `${pad2(m)}'${pad2(s)}"` };
}

const ANGLE_ROWS: { key: string; label: string; pick: (a: RelocatedAngles) => number }[] = [
  { key: 'asc', label: 'Asc', pick: (a) => a.asc },
  { key: 'mc', label: 'Mc', pick: (a) => a.mc },
  { key: 'dsc', label: 'Dsc', pick: (a) => a.dsc },
  { key: 'ic', label: 'Ic', pick: (a) => a.ic },
];

export function CoordReadout({ point, angles, source }: CoordReadoutProps) {
  const [open, setOpen] = useState<boolean>(
    () => localStorage.getItem(SHOW_ANGLES_KEY) === '1',
  );

  useEffect(() => {
    localStorage.setItem(SHOW_ANGLES_KEY, open ? '1' : '0');
  }, [open]);

  if (!point && !angles) return null;

  return (
    <div className={`coord-readout source-${source}`}>
      {point && (
        <div className="coord-line cursor">
          <span className="lat">{fmtLat(point.lat)}</span>
          <span className="lng">{fmtLng(point.lng)}</span>
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
            <span>Angles</span>
            <span className="show-more-chevron">{open ? '▾' : '▸'}</span>
          </button>

          {open && (
            <ul className="angle-list">
              {ANGLE_ROWS.map((r) => {
                const f = fmtAngle(r.pick(angles));
                return (
                  <li key={r.key}>
                    <span className="angle-label">{r.label}</span>
                    <span className="angle-deg">{f.deg}°</span>
                    <span className="angle-sign">
                      <ZodiacGlyph sign={f.signIdx} size={12} />
                    </span>
                    <span className="angle-ms">{f.ms}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
