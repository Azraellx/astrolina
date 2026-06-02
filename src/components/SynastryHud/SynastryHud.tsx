import { useEffect, useRef, useState } from 'react';
import type { StoredChart } from '../../lib/chartLibrary';
import { useMovableHud } from '../../lib/useMovableHud';
import './SynastryHud.css';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Full date + time, e.g. "14 March 1879 · 11:30".
function fmtDate(c: StoredChart): string {
  return `${c.day} ${MONTHS[c.month - 1]} ${c.year} · ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}

// Date only — for the compact picker rows.
function fmtShort(c: StoredChart): string {
  return `${c.day} ${MONTHS[c.month - 1]} ${c.year}`;
}

interface SynastryHudProps {
  /** The chart currently being compared, or null until one is chosen. */
  partner: StoredChart | null;
  /** All saved charts; the picker lists every chart except the current one. */
  charts: StoredChart[];
  /** The active chart's id — excluded from the partner candidates. */
  currentId: string | null;
  /** Choose (or clear) the comparison partner. */
  onSelectPartner: (id: string | null) => void;
}

/**
 * Bottom-center bar shown whenever the synastry overlay is active. It both shows
 * the comparison partner and *is* where the partner is chosen: the whole name +
 * birth-line (with an inline add-person icon) is one clickable trigger that opens
 * an upward picker of the other saved charts — mirroring the chart switcher in
 * the expanded sidebar. (The Overlay top-nav menu only toggles the mode.)
 */
export function SynastryHud({
  partner,
  charts,
  currentId,
  onSelectPartner,
}: SynastryHudProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Shares its movable position with the timeline bar (same bottom slot) so the
  // overlay bar stays where the user dragged it across mode switches.
  const { pos, dragging, handleProps } = useMovableHud(ref);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const candidates = charts
    .filter((c) => c.id !== currentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div
      className={`synastry-hud${dragging ? ' dragging' : ''}`}
      ref={ref}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
    >
      {/* The tag doubles as the move handle (grip + label); drag to float the bar,
          release near the dock to snap home, double-click to dock. */}
      <span className="synastry-hud-tag" {...handleProps}>
        <span className="hud-grip" aria-hidden="true" />
        Synastry
        <span className="hud-move-hint ui-tip-box ui-tip" aria-hidden="true">
          <span className="ui-tip-title">Drag to move</span>
          <span className="ui-tip-sub">Double-click to dock · snaps to centre</span>
        </span>
      </span>
      <div className="synastry-hud-picker">
        <button
          type="button"
          className={`synastry-hud-trigger ${open ? 'open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          title="Choose comparison chart"
          aria-label="Choose comparison chart"
          aria-expanded={open}
        >
          <span className="synastry-hud-label">
            <span className="synastry-hud-name-row">
              <span
                className={`synastry-hud-name ${partner ? '' : 'is-prompt'}`}
              >
                {partner ? partner.name : 'Choose a chart to compare'}
              </span>
              <svg
                className="synastry-hud-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {/* closed chart directory — book + ruled lines */}
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
                <path d="M8 7h8" />
                <path d="M8 11h8" />
              </svg>
            </span>
            {partner && (
              <span className="synastry-hud-meta">
                {fmtDate(partner)} · {partner.birthplace.label}
              </span>
            )}
          </span>
        </button>
        {open && (
          <div className="synastry-hud-menu">
            {candidates.length === 0 ? (
              <div className="synastry-hud-empty">
                Add another chart (top-left) to compare it here.
              </div>
            ) : (
              <ul>
                {candidates.map((c) => (
                  <li
                    key={c.id}
                    className={c.id === partner?.id ? 'active' : ''}
                  >
                    <button
                      type="button"
                      className="synastry-hud-row"
                      onClick={() => {
                        onSelectPartner(c.id);
                        setOpen(false);
                      }}
                    >
                      <span className="synastry-hud-row-name">{c.name}</span>
                      <span className="synastry-hud-row-meta">
                        {fmtShort(c)} · {c.birthplace.label.split(',')[0]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
