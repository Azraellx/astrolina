import { useEffect, useMemo, useRef, useState } from 'react';
import {
  chartRecency,
  displayName,
  type StoredChart,
} from '../../lib/chartLibrary';
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
      {/* Plain button (no hover .ui-tip): the rich tip popped open on hover and
          covered the quick-select dropdown that opens just below. A native title
          keeps the hint without an overlay. */}
      <button
        type="button"
        className="switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        title="Switch, edit, or add a chart (A)"
      >
        <span className="label">
          <span className="name-row">
            <strong title={current?.name}>
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
              {current.tzUncertain && (
                <span className="uncertain" title="Pre-1970 outside US/EU: verify DST">
                  ⚠
                </span>
              )}
            </span>
          )}
        </span>
      </button>

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
                  <span className="chart-name" title={c.name}>
                    {displayName(c.name)}
                  </span>
                  <span className="chart-meta">
                    {fmtBirthDate(c)} · {c.birthplace.label.split(',')[0]}
                  </span>
                </button>
                <div className="chart-actions">
                  <button
                    type="button"
                    className="action"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(c.id);
                      setOpen(false);
                    }}
                    title="Edit"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="action danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${c.name}"?`)) onDelete(c.id);
                    }}
                    title="Delete"
                  >
                    ×
                  </button>
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
            title="Search all charts or add a new one (A)"
          >
            Search + Add Name
          </button>
        </div>
      )}
    </div>
  );
}
