import type { EclipticPosition, RelocatedAngles } from '../../lib/ephemeris';
import { WheelSvg } from '../Wheel/WheelSvg';
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
}

// 25% smaller than the original 280 — the glyphs/labels keep their absolute px
// sizes (set in WheelSvg / WheelSvg.css), so only the wheel tightens, staying
// readable.
const COMPACT_SIZE = 210;

export function ChartWheel({
  point,
  pinned,
  isNatalPin,
  angles,
  planets,
}: ChartWheelProps) {
  const wheelClass = isNatalPin
    ? 'natal-pinned'
    : pinned
      ? 'pinned'
      : point
        ? 'hover'
        : '';

  return (
    <aside className={`chart-wheel ${wheelClass}`}>
      {angles ? (
        <div className="chart-wheel-svg-wrap">
          <WheelSvg
            size={COMPACT_SIZE}
            angles={angles}
            planets={planets}
            detailed={false}
          />
        </div>
      ) : (
        <div className="chart-wheel-placeholder">No chart selected</div>
      )}
    </aside>
  );
}
