import type {
  CoordSystem,
  HouseSystem,
  LineSystem,
  NodeType,
} from '../../lib/ephemeris';
import './InfoBar.css';

const LINE_SYSTEM_LABEL: Record<LineSystem, string> = {
  celestial: 'Celestial',
  geodetic: 'Mundane',
};

// Line projection (Celestial only; not selectable under Mundane).
const COORD_LABEL: Record<CoordSystem, string> = {
  mundo: 'In Mundo',
  zodiaco: 'In Zodiaco',
};

const NODE_LABEL: Record<NodeType, string> = {
  true: 'True Node',
  mean: 'Mean Node',
};

const HOUSE_LABEL: Record<HouseSystem, string> = {
  placidus: 'Placidus',
  koch: 'Koch',
  regiomontanus: 'Regiomontanus',
  campanus: 'Campanus',
  porphyry: 'Porphyry',
  alcabitus: 'Alcabitus',
  whole: 'Whole Sign',
  equal: 'Equal',
};

// A small status chip parked above the map attribution (bottom-right), summarising
// the active calculation systems: line system · house system · lunar node. Toggled
// by the View ▸ Info option. Clicking it opens the Calculation settings.
export function InfoBar({
  lineSystem,
  coordSystem,
  houseSystem,
  nodeType,
  onClick,
}: {
  lineSystem: LineSystem;
  coordSystem: CoordSystem;
  houseSystem: HouseSystem;
  nodeType: NodeType;
  onClick: () => void;
}) {
  return (
    <button type="button" className="info-bar" onClick={onClick}>
      <span className="info-bar-item">{LINE_SYSTEM_LABEL[lineSystem]}</span>
      {/* Line projection is a Celestial-only refinement. */}
      {lineSystem === 'celestial' && (
        <>
          <span className="info-bar-dot">·</span>
          <span className="info-bar-item">{COORD_LABEL[coordSystem]}</span>
        </>
      )}
      <span className="info-bar-dot">·</span>
      <span className="info-bar-item">{HOUSE_LABEL[houseSystem]}</span>
      <span className="info-bar-dot">·</span>
      <span className="info-bar-item">{NODE_LABEL[nodeType]}</span>
    </button>
  );
}
