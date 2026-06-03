import { useEffect, useRef, useState } from 'react';
import type { StoredChart } from '../../lib/chartLibrary';
import { TipButton } from '../ui/HoverTip';
import './ChartSwitcher.css';

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

  return (
    <div className="chart-switcher" ref={ref}>
      <TipButton
        type="button"
        className="switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        tip="Switch, edit, or add a chart"
        hotkey="A"
        placement="bottom-start"
      >
        <span className="label">
          <span className="name-row">
            <strong>{current ? current.name : 'No chart selected'}</strong>
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
      </TipButton>

      {open && (
        <div className="switcher-menu">
          <ul>
            {charts.length === 0 && (
              <li className="empty">No saved charts yet.</li>
            )}
            {charts.map((c) => (
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
                  <span className="chart-name">{c.name}</span>
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
            title="Add a new chart (A)"
          >
            + New chart
          </button>
        </div>
      )}
    </div>
  );
}
