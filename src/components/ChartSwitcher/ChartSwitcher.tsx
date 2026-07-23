// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  chartTag,
  displayName,
  recentShortlist,
  NAME_SOFT_LIMIT,
  NAME_SOFT_LIMIT_STARRED,
  type StoredChart,
} from '../../lib/chartLibrary';
import { timeUnknown } from '../../lib/birthData';
import { useT } from '../../i18n';
import type { Formatters } from '../../i18n';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { TagIcon } from '../ui/TagIcon';
import { useHoverTip } from '../ui/useHoverTip';
import { useNarrowNav } from '../../lib/touch';
import './ChartSwitcher.css';

// The dropdown is a quick-switch shortlist (recentShortlist); the full
// searchable list lives in the ChartManager that "Search + Add Name" opens.

/** The Tab quick-swap flash: the shortlist order as it stood when the swap
 *  fired (selection bumps recency, so the live sort would reshuffle mid-flash)
 *  plus the row just landed on. While set, the menu is held open with an
 *  arrow on that row. */
export interface ChartQuickFlash {
  ids: string[];
  index: number;
}

interface ChartSwitcherProps {
  current: StoredChart | null;
  charts: StoredChart[];
  onSelect: (id: string) => void;
  onNew: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  /** Top-bar variant: hide the add-person icon (the expanded sidebar keeps it). */
  compact?: boolean;
  /** The Tab quick-swap feedback (see ChartQuickFlash); null/absent when idle. */
  flash?: ChartQuickFlash | null;
}

// "14 March 1990" — full birth date for the bar's chart label.
function fmtBirthDate(c: StoredChart, fmt: Formatters): string {
  return `${c.day} ${fmt.monthName(c.month)} ${c.year}`;
}

// First + last initials — the ultra-compact portrait top bar shows these (with the tag icon)
// over just the birth year, since the full name + date don't fit the narrow bar.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const lead = parts[0]?.charAt(0) ?? '';
  const tail = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? '' : '';
  return (lead + tail).toUpperCase();
}

export function ChartSwitcher({
  current,
  charts,
  onSelect,
  onNew,
  onEdit,
  onDelete,
  compact = false,
  flash = null,
}: ChartSwitcherProps) {
  const { t, fmt } = useT();
  // Portrait top bar (compact + narrow): collapse the label to initials + year only.
  const narrow = useNarrowNav();
  const [open, setOpen] = useState(false);
  // The row whose delete is mid-confirm (its icons swapped for Delete/Keep).
  const [confirmId, setConfirmId] = useState<string | null>(null);
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
  const recentCharts = useMemo(() => recentShortlist(charts), [charts]);

  // A quick-swap flash holds the menu open on ITS frozen order (ids resolved
  // against the live set, so an edit mid-flash still shows current names).
  const flashCharts = useMemo(
    () =>
      flash
        ? flash.ids
            .map((id) => charts.find((c) => c.id === id))
            .filter((c): c is StoredChart => c !== undefined)
        : null,
    [flash, charts],
  );
  const list = flashCharts ?? recentCharts;
  const menuOpen = open || flashCharts !== null;
  useEffect(() => {
    if (!menuOpen) setConfirmId(null);
  }, [menuOpen]);

  // The trigger tip's Tab line, with the {key} token rendered as the shared
  // yellow key chip so the key name reads like the menu badges. The wrapper
  // class lets the whole line hide on keyboard-less touch (see the CSS) —
  // hiding only the chip, like HoverTip does, would leave a broken sentence.
  const [tabHintPre, tabHintPost] = t('chartSwitcher.tabHint').split('{key}');
  const tabHint = (
    <span className="switcher-tab-hint">
      {tabHintPre}
      <span className="ui-tip-hotkey">Tab</span>
      {tabHintPost}
    </span>
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
          if (!menuOpen) showTip();
        }}
        onMouseLeave={hideTip}
        onFocus={() => {
          if (!menuOpen) showTip();
        }}
        onBlur={hideTip}
      >
        <span className="label">
          <span className="name-row">
            <strong>
              {current ? (
                <>
                  <TagIcon tag={chartTag(current)} className="tag-icon" />
                  {timeUnknown(current) && (
                    <TagIcon tag="unknown" className="tag-icon" />
                  )}
                  {/* Portrait top bar (compact + narrow): just the initials — the name + date
                      don't fit. Compact landscape: hard-cap the name. Expanded sidebar: the full
                      name, let CSS ellipsis trim it so it reveals more as the sidebar widens. */}
                  {compact
                    ? narrow
                      ? initials(current.name)
                      : displayName(current.name)
                    : current.name}
                </>
              ) : (
                t('chartSwitcher.noChart')
              )}
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
              {compact && narrow ? (
                current.year
              ) : (
                <>
                  {fmtBirthDate(current, fmt)} ·{' '}
                  {current.birthplace.label.split(',')[0]}
                  {current.tzUncertain && <span className="uncertain">⚠</span>}
                </>
              )}
            </span>
          )}
        </span>
      </button>
      <HoverTip
        pos={tipPos}
        placement={tipPlacement}
        title={t('chartSwitcher.tip')}
        hint={tabHint}
        hotkey="A"
      />

      {menuOpen && (
        <div className="switcher-menu">
          <ul>
            {charts.length === 0 && (
              <li className="empty">{t('chartSwitcher.empty')}</li>
            )}
            {list.map((c, i) => (
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
                  <span className="chart-name">
                    {/* Quick-swap feedback: the arrow marks the row just landed on. */}
                    {flash && i === flash.index && (
                      <span className="qs-arrow" aria-hidden="true">
                        →
                      </span>
                    )}
                    <TagIcon tag={chartTag(c)} className="tag-icon" />
                    {timeUnknown(c) && (
                      <TagIcon tag="unknown" className="tag-icon" />
                    )}
                    {/* Starred rows show a star badge, so cap their name a little
                        shorter to leave room for it. */}
                    {displayName(
                      c.name,
                      chartTag(c) === 'star'
                        ? NAME_SOFT_LIMIT_STARRED
                        : NAME_SOFT_LIMIT,
                    )}
                  </span>
                  <span className="chart-meta">
                    {fmtBirthDate(c, fmt)} · {c.birthplace.label.split(',')[0]}
                  </span>
                </button>
                {/* In-row actions, inside the same row pill (the li carries the
                    hover surface). The × arms an inline Delete/Keep confirm —
                    no native dialog, nothing deleted on a stray tap. */}
                {confirmId === c.id ? (
                  <div className="chart-actions is-confirm">
                    <button
                      type="button"
                      className="row-confirm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmId(null);
                        onDelete(c.id);
                      }}
                    >
                      {t('common.delete')}
                    </button>
                    <button
                      type="button"
                      className="row-keep"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmId(null);
                      }}
                    >
                      {t('common.keep')}
                    </button>
                  </div>
                ) : (
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
                      tip={t('common.edit')}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </TipButton>
                    <TipButton
                      type="button"
                      className="action danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmId(c.id);
                      }}
                      placement="top"
                      tip={t('common.delete')}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </TipButton>
                  </div>
                )}
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
            {t('chartSwitcher.searchAdd')}
          </button>
        </div>
      )}
    </div>
  );
}
