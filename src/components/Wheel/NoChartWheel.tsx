// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import './NoChartWheel.css';

interface NoChartWheelProps {
  /** Diameter in px the empty wheel aims for; CSS clamps it to the container width and
   *  scales the label with it (container units), so it stays circular and legible. */
  size: number;
  /** Centred label (caller supplies the localized string, e.g. "NO CHART"). */
  label: string;
  /** Optional one-line reason shown (centred, wrapped) under the label, explaining
   *  why no chart is drawn — e.g. the CCG mixed-layer note. */
  note?: string;
}

// An explicit empty-wheel state, drawn where a chart would normally be but none is
// meaningful — currently the Cyclo·cartography (CCG) overlay once the natal chart is
// hidden: CCG is a deliberately mixed layer (progressed personal planets + transiting
// outers) with no single coherent chart to wheel. A faint dashed ring stands in for the
// wheel, with a bold, high-contrast label centred and floored at a legible size so it
// holds up even on a narrow sidebar.
export function NoChartWheel({ size, label, note }: NoChartWheelProps) {
  return (
    <div className="wheel-nochart" style={{ width: size }}>
      <span className="wheel-nochart-label">{label}</span>
      {note && <span className="wheel-nochart-note">{note}</span>}
    </div>
  );
}
