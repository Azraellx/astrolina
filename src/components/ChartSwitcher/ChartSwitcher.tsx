// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  chartRecency,
  chartTag,
  displayName,
  NAME_SOFT_LIMIT,
  NAME_SOFT_LIMIT_STARRED,
  type StoredChart,
} from '../../lib/chartLibrary';
import { useT } from '../../i18n';
import type { Formatters } from '../../i18n';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { TagIcon } from '../ui/TagIcon';
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

// "14 March 1990" — full birth date for the bar's chart label.
function fmtBirthDate(c: StoredChart, fmt: Formatters): string {
  return `${c.day} ${fmt.monthName(c.month)} ${c.year}`;
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
  const { t, fmt } = useT();
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
              {current ? (
                <>
                  <TagIcon tag={chartTag(current)} className="tag-icon" />
                  {/* Compact (top bar): hard-cap the name length. Expanded sidebar:
                      show the full name and let CSS ellipsis trim it to the available
                      width, so it reveals more as the sidebar is widened. */}
                  {compact ? displayName(current.name) : current.name}
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
              {fmtBirthDate(current, fmt)} ·{' '}
              {current.birthplace.label.split(',')[0]}
              {current.tzUncertain && <span className="uncertain">⚠</span>}
            </span>
          )}
        </span>
      </button>
      <HoverTip
        pos={tipPos}
        placement={tipPlacement}
        title={t('chartSwitcher.tip')}
        hotkey="A"
      />

      {open && (
        <div className="switcher-menu">
          <ul>
            {charts.length === 0 && (
              <li className="empty">{t('chartSwitcher.empty')}</li>
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
                  <span className="chart-name">
                    <TagIcon tag={chartTag(c)} className="tag-icon" />
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
                    ✎
                  </TipButton>
                  <TipButton
                    type="button"
                    className="action danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(t('chartSwitcher.deleteConfirm', { name: c.name })))
                        onDelete(c.id);
                    }}
                    placement="top"
                    tip={t('common.delete')}
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
            {t('chartSwitcher.searchAdd')}
          </button>
        </div>
      )}
    </div>
  );
}
