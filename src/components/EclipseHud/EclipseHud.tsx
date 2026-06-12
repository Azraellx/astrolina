// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { EclipseCatalogRow } from '../../lib/astro/eclipses';
import type { SolarEclipseKind } from '../../lib/ephemeris';
import { useMovableHud } from '../../lib/useMovableHud';
import { useT } from '../../i18n';
import type { Formatters, TFn } from '../../i18n';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { ClickIcon } from '../ui/ClickIcon';
import { useHoverTip } from '../ui/useHoverTip';
import './EclipseHud.css';

// "8 April 2024" from a catalog id ("2024-04-08").
function fmtRowDate(id: string, fmt: Formatters): string {
  const [y, m, d] = id.split('-').map(Number);
  return `${d} ${fmt.monthName(m)} ${y}`;
}

const kindLabel = (t: TFn, kind: SolarEclipseKind) =>
  t(`settings.eclipses.kind.${kind}`);

const TYPE_FILTERS: (SolarEclipseKind | 'all')[] = [
  'all',
  'total',
  'annular',
  'hybrid',
  'partial',
];

interface EclipseHudProps {
  /** The full chronological catalog (1800–2399). */
  catalog: EclipseCatalogRow[];
  /** The selected eclipse — never null while the overlay is active. */
  selected: EclipseCatalogRow | null;
  onSelect: (id: string) => void;
}

/**
 * Bottom-center bar shown whenever the Eclipses overlay is active — the same
 * slot and movable-bar pattern as the synastry partner picker. It both shows
 * the selected eclipse (date · type, with Saros + magnitude beneath) and is
 * where eclipses are chosen: ‹ › step chronologically through the catalog, and
 * the trigger opens an upward picker with a search box, a type filter, and the
 * full four-century list (auto-scrolled to the selection).
 */
export function EclipseHud({ catalog, selected, onSelect }: EclipseHudProps) {
  const { t, fmt } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<SolarEclipseKind | 'all'>('all');
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Shares its movable position with the timeline bar (same bottom slot) so the
  // overlay bar stays where the user dragged it across mode switches.
  const { pos, dragging, handleProps } = useMovableHud(ref);
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Open the picker centred on the current selection. (Opening always resets
  // the filters, so the selection is guaranteed to be in the list.)
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('li.active')
      ?.scrollIntoView({ block: 'center' });
  }, [open]);

  // Localize each row's strings ONCE per locale — fmtRowDate runs a Luxon
  // month-name lookup, and doing that per row per keystroke for ~1,400 rows
  // would jank the search box. The deferred query keeps typing responsive
  // while the (large) filtered list re-renders in the background.
  const displayRows = useMemo(
    () =>
      catalog.map((row) => {
        const dateText = fmtRowDate(row.id, fmt);
        const kindText = kindLabel(t, row.kind);
        return {
          row,
          dateText,
          kindText,
          sarosText: t('eclipseHud.saros', { n: row.saros }),
          searchText: `${row.id} ${dateText} ${kindText} saros ${row.saros}`.toLowerCase(),
        };
      }),
    [catalog, t, fmt],
  );
  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return displayRows.filter((d) => {
      if (typeFilter !== 'all' && d.row.kind !== typeFilter) return false;
      // Match the date, the localized date, the type name, or "saros NNN".
      return !q || q.split(/\s+/).every((part) => d.searchText.includes(part));
    });
  }, [displayRows, deferredQuery, typeFilter]);

  // ‹ › always walk the FULL chronological catalog — the menu's filter is a
  // browsing aid, not a constraint on stepping.
  const index = selected ? catalog.findIndex((r) => r.id === selected.id) : -1;
  const step = (delta: number) => {
    const next = catalog[index + delta];
    if (next) onSelect(next.id);
  };

  return (
    <div
      className={`eclipse-hud${dragging ? ' dragging' : ''}`}
      ref={ref}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
    >
      {/* The tag doubles as the move handle (grip + label); drag to float the bar,
          release near the dock to snap home, double-click to dock. */}
      <span className="eclipse-hud-tag" {...handleProps}>
        <span className="hud-grip" aria-hidden="true" />
        {t('eclipseHud.title')}
        <span className="hud-move-hint ui-tip-box ui-tip" aria-hidden="true">
          <span className="ui-tip-title">{t('common.hud.dragToMove')}</span>
          <span className="ui-tip-sub hud-dock-line">
            <span className="ui-tip-hotkey hud-dock-key">
              {t('common.hud.dockKey')}
              <ClickIcon className="hud-dock-icon" />
            </span>
            {t('common.hud.dockHint')}
          </span>
        </span>
      </span>

      <TipButton
        type="button"
        className="eclipse-hud-step"
        onClick={() => step(-1)}
        disabled={index <= 0}
        placement="top"
        tip={t('eclipseHud.prev')}
        aria-label={t('eclipseHud.prev')}
      >
        ‹
      </TipButton>

      <div className="eclipse-hud-picker">
        <button
          ref={tipRef}
          type="button"
          className={`eclipse-hud-trigger ${open ? 'open' : ''}`}
          onClick={() => {
            // A fresh open starts unfiltered: a filter left over from the last
            // visit could exclude the current selection (picked via ‹ ›) and
            // defeat the open-centred-on-selection scroll.
            if (!open) {
              setQuery('');
              setTypeFilter('all');
            }
            setOpen(!open);
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
          aria-label={t('eclipseHud.choose')}
          aria-expanded={open}
        >
          {selected && (
            <span className="eclipse-hud-label">
              <span className="eclipse-hud-name-row">
                <span className="eclipse-hud-name">
                  {fmtRowDate(selected.id, fmt)} · {kindLabel(t, selected.kind)}
                </span>
                <svg
                  className="eclipse-hud-icon"
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
                  {/* eclipsed sun: a disc with a bite, plus short rays */}
                  <path d="M12 2v2" />
                  <path d="M4.9 4.9l1.4 1.4" />
                  <path d="M2 12h2" />
                  <path d="M22 12h-2" />
                  <path d="M19.1 4.9l-1.4 1.4" />
                  <path d="M12 22v-2" />
                  <path d="M17 12a5 5 0 1 1-6.6-4.7 6 6 0 0 0 6.3 4.4q.3.1.3.3Z" />
                </svg>
              </span>
              <span className="eclipse-hud-meta">
                {t('eclipseHud.saros', { n: selected.saros })} ·{' '}
                {selected.magnitude.toFixed(3)}
              </span>
            </span>
          )}
        </button>
        <HoverTip pos={tipPos} placement="top" title={t('eclipseHud.choose')} />
        {open && (
          <div className="eclipse-hud-menu">
            <input
              type="text"
              className="eclipse-hud-search"
              placeholder={t('eclipseHud.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="eclipse-hud-filters">
              {TYPE_FILTERS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`eclipse-hud-filter ${typeFilter === k ? 'active' : ''}`}
                  aria-pressed={typeFilter === k}
                  onClick={() => setTypeFilter(k)}
                >
                  {k === 'all' ? t('eclipseHud.all') : kindLabel(t, k)}
                </button>
              ))}
            </div>
            <ul ref={listRef}>
              {filtered.map((d) => (
                <li
                  key={d.row.id}
                  className={d.row.id === selected?.id ? 'active' : ''}
                >
                  <button
                    type="button"
                    className="eclipse-hud-row"
                    onClick={() => {
                      onSelect(d.row.id);
                      setOpen(false);
                    }}
                  >
                    <span className="eclipse-hud-row-name">{d.dateText}</span>
                    <span className="eclipse-hud-row-meta">
                      {d.kindText} · {d.sarosText}
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="eclipse-hud-empty">{t('eclipseHud.noMatches')}</li>
              )}
            </ul>
          </div>
        )}
      </div>

      <TipButton
        type="button"
        className="eclipse-hud-step"
        onClick={() => step(1)}
        disabled={index < 0 || index >= catalog.length - 1}
        placement="top"
        tip={t('eclipseHud.next')}
        aria-label={t('eclipseHud.next')}
      >
        ›
      </TipButton>
    </div>
  );
}
