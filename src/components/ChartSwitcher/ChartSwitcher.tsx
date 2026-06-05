// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  chartRecency,
  displayName,
  type StoredChart,
} from '../../lib/chartLibrary';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import './ChartSwitcher.css';

// The dropdown is a quick-switch shortlist; the full searchable list lives in the
// ChartManager that "Search + Add Name" opens.
const RECENT_COUNT = 5;

interface ChartSwitcherProps {
  current: StoredChart | null;
  charts: StoredChart[];
  onSelect: (id: string) => void;
  onNew: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  /** Top-bar variant: hide the add-person icon (the expanded sidebar keeps it). */
  compact?: boolean;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// "14 March 1990" — full birth date for the bar's chart label.
function fmtBirthDate(c: StoredChart): string {
  return `${c.day} ${MONTHS[c.month - 1]} ${c.year}`;
}

export function ChartSwitcher({
  current,
  charts,
  onSelect,
  onNew,
  onEdit,
  onDelete,
  compact = false,
}: ChartSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // The trigger's hover tip. Suppressed while the menu is open so the rich card
  // never overlays the quick-select dropdown that opens just below it. In the
  // expanded sidebar the trigger hugs the screen's left edge, so the tip is
  // left-aligned ('bottom-start') there to keep it off the edge; the roomier top
  // bar centres it ('bottom').
  const tipPlacement = compact ? 'bottom' : 'bottom-start';
  const {
    ref: tipRef,
    pos: tipPos,
    show: showTip,
    hide: hideTip,
  } = useHoverTip<HTMLButtonElement>(tipPlacement);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Just the most-recently-used handful — the rest are reachable via search.
  const recentCharts = useMemo(
    () =>
      [...charts]
        .sort((a, b) => chartRecency(b) - chartRecency(a))
        .slice(0, RECENT_COUNT),
    [charts],
  );

  return (
    <div className="chart-switcher" ref={ref}>
      {/* The whole name + birth line is one trigger: hovering anywhere on it
          (name, date, place, add-person icon) shows the shared .ui-tip, which is
          hidden while the menu is open so it never covers the dropdown below. */}
      <button
        ref={tipRef}
        type="button"
        className="switcher-trigger"
        onClick={() => {
          setOpen((v) => !v);
          hideTip();
        }}
        onMouseEnter={() => {
          if (!open) showTip();
        }}
        onMouseLeave={hideTip}
        onFocus={() => {
          if (!open) showTip();
        }}
        onBlur={hideTip}
      >
        <span className="label">
          <span className="name-row">
            <strong>
              {current ? displayName(current.name) : 'No chart selected'}
            </strong>
            {!compact && (
              <svg
                className="switcher-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9.5" cy="7" r="4" />
                <path d="M22 11h-6" />
                <path d="M19 8v6" />
              </svg>
            )}
          </span>
          {current && (
            <span className="meta">
              {fmtBirthDate(current)} · {current.birthplace.label.split(',')[0]}
              {current.tzUncertain && <span className="uncertain">⚠</span>}
            </span>
          )}
        </span>
      </button>
      <HoverTip
        pos={tipPos}
        placement={tipPlacement}
        title="Switch, edit, or add a chart"
        hotkey="A"
      />

      {open && (
        <div className="switcher-menu">
          <ul>
            {charts.length === 0 && (
              <li className="empty">No saved charts yet.</li>
            )}
            {recentCharts.map((c) => (
              <li
                key={c.id}
                className={c.id === current?.id ? 'active' : ''}
              >
                <button
                  type="button"
                  className="chart-row"
                  onClick={() => {
                    onSelect(c.id);
                    setOpen(false);
                  }}
                >
                  <span className="chart-name">{displayName(c.name)}</span>
                  <span className="chart-meta">
                    {fmtBirthDate(c)} · {c.birthplace.label.split(',')[0]}
                  </span>
                </button>
                <div className="chart-actions">
                  <TipButton
                    type="button"
                    className="action"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(c.id);
                      setOpen(false);
                    }}
                    placement="top"
                    tip="Edit"
                  >
                    ✎
                  </TipButton>
                  <TipButton
                    type="button"
                    className="action danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${c.name}"?`)) onDelete(c.id);
                    }}
                    placement="top"
                    tip="Delete"
                  >
                    ×
                  </TipButton>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="new-chart"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
          >
            Search + Add Name
          </button>
        </div>
      )}
    </div>
  );
}
