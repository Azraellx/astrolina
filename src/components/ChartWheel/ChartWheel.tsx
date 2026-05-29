import type { EclipticPosition, RelocatedAngles } from '../../lib/ephemeris';
import type { StoredChart } from '../../lib/chartLibrary';
import { WheelSvg } from '../Wheel/WheelSvg';
import './ChartWheel.css';

interface Point {
  lat: number;
  lng: number;
  label?: string;
}

interface ChartWheelProps {
  chart: StoredChart | null;
  point: Point | null;
  pinned: boolean;
  isNatalPin: boolean;
  angles: RelocatedAngles | null;
  planets: EclipticPosition[];
  onExpand: () => void;
}

const COMPACT_SIZE = 280;

export function ChartWheel({
  chart,
  point,
  pinned,
  isNatalPin,
  angles,
  planets,
  onExpand,
}: ChartWheelProps) {
  const label = isNatalPin
    ? 'NATAL PIN'
    : pinned
      ? 'PINNED'
      : point
        ? 'HOVER'
        : 'NATAL';
  const wheelClass = isNatalPin
    ? 'natal-pinned'
    : pinned
      ? 'pinned'
      : '';

  return (
    <aside className={`chart-wheel ${wheelClass}`}>
      <header className="chart-wheel-header">
        <span className="pin-indicator">{label}</span>
        <button
          type="button"
          className="wheel-expand-btn"
          onClick={onExpand}
          title="Expand chart wheel"
          aria-label="Expand chart wheel"
          disabled={!chart || !angles}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

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
