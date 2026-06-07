// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useRef, useState } from 'react';
import { displayName, type StoredChart } from '../../lib/chartLibrary';
import { useMovableHud } from '../../lib/useMovableHud';
import { useT } from '../../i18n';
import type { Formatters } from '../../i18n';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import './SynastryHud.css';

// Full date + time, e.g. "14 March 1879 · 11:30".
function fmtDate(c: StoredChart, fmt: Formatters): string {
  return `${c.day} ${fmt.monthName(c.month)} ${c.year} · ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}

// Date only — for the compact picker rows.
function fmtShort(c: StoredChart, fmt: Formatters): string {
  return `${c.day} ${fmt.monthName(c.month)} ${c.year}`;
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
  /** Open the add-person flow — used when there are no other charts to compare. */
  onAddPerson: () => void;
}

/**
 * Bottom-center bar shown whenever the synastry overlay is active. It both shows
 * the comparison partner and *is* where the partner is chosen: the whole name +
 * birth-line (with an inline add-person icon) is one clickable trigger that opens
 * an upward picker of the other saved charts — mirroring the chart switcher in
 * the expanded sidebar. (The Overlay top-nav menu only toggles the mode.)
 *
 * With no other charts to compare against, the picker would be empty, so the bar
 * instead becomes a plain "Add person" prompt (add-person icon, no birth-line) that
 * opens the add-chart flow directly.
 */
export function SynastryHud({
  partner,
  charts,
  currentId,
  onSelectPartner,
  onAddPerson,
}: SynastryHudProps) {
  const { t, fmt } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Shares its movable position with the timeline bar (same bottom slot) so the
  // overlay bar stays where the user dragged it across mode switches.
  const { pos, dragging, handleProps } = useMovableHud(ref);
  // The picker trigger's hover tip — points up (the bar is bottom-docked) and is
  // suppressed while the upward picker menu is open so it never overlaps it.
  const {
    ref: tipRef,
    pos: tipPos,
    show: showTip,
    hide: hideTip,
  } = useHoverTip<HTMLButtonElement>('top');

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
        {t('synastryHud.title')}
        <span className="hud-move-hint ui-tip-box ui-tip" aria-hidden="true">
          <span className="ui-tip-title">{t('common.hud.dragToMove')}</span>
          <span className="ui-tip-sub">{t('common.hud.dockHint')}</span>
        </span>
      </span>
      <div className="synastry-hud-picker">
        {candidates.length === 0 ? (
          // Nothing to select — the only chart is the active one — so the bar is a
          // direct "Add person" prompt (no birth-line) that opens the add-chart flow.
          <TipButton
            type="button"
            className="synastry-hud-trigger synastry-hud-add"
            onClick={onAddPerson}
            placement="top"
            tip={t('synastryHud.addPersonTip')}
            aria-label={t('synastryHud.addPersonTip')}
          >
            <span className="synastry-hud-label">
              <span className="synastry-hud-name-row">
                <span className="synastry-hud-name is-prompt">
                  {t('synastryHud.addPerson')}
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
                  {/* add-person (person + plus), reused from the chart switcher */}
                  <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9.5" cy="7" r="4" />
                  <path d="M22 11h-6" />
                  <path d="M19 8v6" />
                </svg>
              </span>
            </span>
          </TipButton>
        ) : (
          <>
            <button
              ref={tipRef}
              type="button"
              className={`synastry-hud-trigger ${open ? 'open' : ''}`}
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
              aria-label={t('synastryHud.chooseComparison')}
              aria-expanded={open}
            >
              <span className="synastry-hud-label">
                <span className="synastry-hud-name-row">
                  <span
                    className={`synastry-hud-name ${partner ? '' : 'is-prompt'}`}
                  >
                    {partner ? displayName(partner.name) : t('synastryHud.choosePrompt')}
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
                    {fmtDate(partner, fmt)} · {partner.birthplace.label}
                  </span>
                )}
              </span>
            </button>
            <HoverTip pos={tipPos} placement="top" title={t('synastryHud.chooseComparison')} />
            {open && (
              <div className="synastry-hud-menu">
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
                        <span className="synastry-hud-row-name">
                          {displayName(c.name)}
                        </span>
                        <span className="synastry-hud-row-meta">
                          {fmtShort(c, fmt)} · {c.birthplace.label.split(',')[0]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
