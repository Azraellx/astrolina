// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type {
  CoordSystem,
  HouseSystem,
  LineSystem,
  NodeType,
} from '../../lib/ephemeris';
import { useT } from '../../i18n';
import './InfoBar.css';

// A small status chip parked above the map attribution (bottom-right), summarising
// the active calculation systems: line system · house system · lunar node. Toggled
// by the View ▸ Info option. Clicking it opens the Calculation settings. The system
// labels resolve from the shared settings.* catalog (the same maps the Sidebar uses),
// so the chip and the panel never drift.
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
  const { labels } = useT();
  return (
    <button type="button" className="info-bar" onClick={onClick}>
      <span className="info-bar-item">{labels.lineSystem(lineSystem)}</span>
      {/* Line projection is a Celestial-only refinement. */}
      {lineSystem === 'celestial' && (
        <>
          <span className="info-bar-dot">·</span>
          <span className="info-bar-item">{labels.coordSystem(coordSystem)}</span>
        </>
      )}
      <span className="info-bar-dot">·</span>
      <span className="info-bar-item">{labels.houseSystem(houseSystem)}</span>
      <span className="info-bar-dot">·</span>
      <span className="info-bar-item">{labels.nodeType(nodeType)}</span>
    </button>
  );
}
