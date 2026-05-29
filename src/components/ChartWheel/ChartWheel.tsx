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
  onRecenterPin: () => void;
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
  onRecenterPin,
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
        {pinned ? (
          <button
            type="button"
            className="pin-indicator pin-recenter"
            onClick={onRecenterPin}
            title="Center map on pin"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 1.5c-2.5 0-4.5 2-4.5 4.5 0 3.2 4.5 8.5 4.5 8.5s4.5-5.3 4.5-8.5c0-2.5-2-4.5-4.5-4.5z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="6" r="1.6" fill="currentColor" />
            </svg>
            <span>{label}</span>
          </button>
        ) : (
          <span className="pin-indicator">{label}</span>
        )}
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
          <span>Expand</span>
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
