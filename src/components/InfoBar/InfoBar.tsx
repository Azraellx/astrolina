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
import type { ZodiacMode } from '../../lib/astro/ayanamsa';
import { useT } from '../../i18n';
import './InfoBar.css';

// A small status chip parked above the map attribution (bottom-right),
// summarising the active calculation systems. Each value is its own button
// that opens the settings tab it lives in — the map conventions land on
// Calculation, the wheel's reading preferences on Advanced. The Advanced-tab
// values (house system, and the zodiac when sidereal) only show while the
// expanded wheel's Advanced mode is on; the casual view keeps the chip lean.
// Toggled by the View ▸ Info option. The labels resolve from the shared
// settings.* catalog (the same maps the Sidebar uses), so chip and panel
// never drift.
export function InfoBar({
  lineSystem,
  coordSystem,
  houseSystem,
  zodiacMode,
  nodeType,
  advancedMode,
  onOpen,
}: {
  lineSystem: LineSystem;
  coordSystem: CoordSystem;
  houseSystem: HouseSystem;
  zodiacMode: ZodiacMode;
  nodeType: NodeType;
  /** The expanded wheel's Advanced reading mode — gates the Advanced-tab items. */
  advancedMode: boolean;
  /** Open the settings sidebar on the given tab. */
  onOpen: (section: 'calc' | 'advanced') => void;
}) {
  const { t, labels } = useT();
  const item = (label: string, section: 'calc' | 'advanced') => (
    <button
      type="button"
      className="info-bar-item"
      onClick={() => onOpen(section)}
    >
      {label}
    </button>
  );
  const dot = <span className="info-bar-dot">·</span>;
  return (
    <div className="info-bar">
      {item(labels.lineSystem(lineSystem), 'calc')}
      {/* Line projection is a Celestial-only refinement. */}
      {lineSystem === 'celestial' && (
        <>
          {dot}
          {item(labels.coordSystem(coordSystem), 'calc')}
        </>
      )}
      {advancedMode && (
        <>
          {dot}
          {item(labels.houseSystem(houseSystem), 'advanced')}
        </>
      )}
      {advancedMode && zodiacMode !== 'tropical' && (
        <>
          {dot}
          {item(t(`settings.zodiac.${zodiacMode}.label`), 'advanced')}
        </>
      )}
      {dot}
      {item(labels.nodeType(nodeType), 'calc')}
    </div>
  );
}
