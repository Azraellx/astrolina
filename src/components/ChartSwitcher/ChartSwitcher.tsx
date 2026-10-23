// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  chartTag,
  displayName,
  recentShortlist,
  NAME_SOFT_LIMIT,
  NAME_SOFT_LIMIT_STARRED,
  type StoredChart,
} from '../../lib/chartLibrary';
import { timeUnknown } from '../../lib/birthData';
import { GEODETIC_HELD } from '../../lib/geodeticHold';
import {
  hasExampleEvent,
  storedKind,
  switcherSections,
  type ChartKindOf,
} from '../../lib/eventCharts';
import type { LineSystem } from '../../lib/ephemeris';
import { useIdentity } from '../../lib/discreet';
import { useT } from '../../i18n';
import type { Formatters } from '../../i18n';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { TagIcon } from '../ui/TagIcon';
import { useHoverTip } from '../ui/useHoverTip';
import { isNarrowNav } from '../../lib/touch';
import { fitToNavColumn } from '../TopNav/navColumn';
import './ChartSwitcher.css';

// The dropdown is a quick-switch shortlist (recentShortlist); the full
// searchable list lives in the ChartManager that "Search + Add Name" opens.
//
// Since 2026-10-20, while event charts are on offer (`eventsOn`: the geodetic hold is
// lifted on this device), the shortlist is two — an Events list and a People list, in
// an order that follows the map (lib/eventCharts switcherSections) — under a fixed
// "No chart · the sky alone" row. Held, it is exactly the one list it always was.

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
  /** Event charts are on offer (2026-10-20): the No chart row and the two sections.
   *  Omitted (false), the menu is today's single list, exactly. */
  eventsOn?: boolean;
  /** The map's DERIVED line system, which orders the sections (Events first on
   *  Geodetic). Omitted → Celestial's order. */
  lineSystem?: LineSystem;
  /** "No chart" is selected and in force (App's noChartPicked): the row is marked
   *  active and the trigger reads "No chart". */
  noChartPicked?: boolean;
  /** Select "No chart" — App's one opener (selectNoChart), which refuses while held.
   *  Omitted, the row is not offered. */
  onSelectNoChart?: () => void;
  /** Add the example event (App's idempotent addExampleEvent, which selects nothing).
   *  Offered under an empty Events list; omitted, never offered. */
  onAddExample?: () => void;
  /** The trigger's second line under "No chart" (lib/eventCharts noChartMeta:
   *  "Transits · 20 Oct 2026", or "The sky alone"). Omitted → "The sky alone". */
  skyMeta?: string | null;
  /** In place of "No chart" on the trigger, the drawing's own heading ("TRANSITS") — the
   *  sidebar's, where the title describes the chart on screen (Lina, 21 Oct 2026, §4); "No
   *  chart · the sky alone" stays the nav bar's and the menu's. Its date is the statement's. */
  skyTitle?: string | null;
  /** The menu names of what choosing "No chart" would put away — the overlay in force when
   *  it needs a chart ("Solar Arc"), an open Local Space window — so the row's tip names
   *  them only when it will happen (CLAUDE.md rule 3). Empty when nothing would be. */
  noChartHolds?: readonly string[];
}

const NO_HOLDS: readonly string[] = [];

// "14 March 1990" — full birth date for the bar's chart label, written the language's way.
function fmtBirthDate(c: StoredChart, fmt: Formatters): string {
  return fmt.date(c.year, c.month, c.day, 'long');
}

// First + last initials — the ultra-compact portrait top bar shows these (with the tag icon)
// over just the birth year, since the full name + date don't fit the narrow bar.
//
// Capitalised in the reader's language (2026-10-09): plain toUpperCase() gives "I" for a
// Turkish "i", where Turkish writes "İ" — so "ilker yılmaz" read "IY". The name's own
// language is unknown; the reader's is the best guess, and it is what CSS capitals on the
// same page already follow (<html lang>). English output is unchanged: 'en' has no special
// casing rules.
function initials(name: string, lang: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const lead = parts[0]?.charAt(0) ?? '';
  const tail = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? '' : '';
  return (lead + tail).toLocaleUpperCase(lang);
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
  eventsOn = false,
  lineSystem = 'celestial',
  noChartPicked = false,
  onSelectNoChart,
  onAddExample,
  skyMeta = null,
  skyTitle = null,
  noChartHolds = NO_HOLDS,
}: ChartSwitcherProps) {
  const { t, fmt, lang } = useT();
  // While discreet mode is on, the switcher shows structure and not identity —
  // it sits in the top bar, permanently visible, so it leaks first otherwise.
  const id = useIdentity();
  const headId = useId();
  const [open, setOpen] = useState(false);
  // The row whose delete is mid-confirm (its icons swapped for Delete/Keep).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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

  // The most-recently-used handful FROM THE ACTIVE CHART'S FOLDER — the rest
  // are reachable via search. Scoped because this list opens in the top bar
  // with a tap, in front of whoever is sitting beside you.
  const recentCharts = useMemo(() => recentShortlist(charts, current), [charts, current]);
  // The Events and People lists (null while held: the one list above). A Tab flash
  // shows its own list in their place (`flashCharts` below): Tab cycles the most recent
  // across every folder (lib/eventCharts tabCycleIds), these keep to the active one's.
  const sections = useMemo(
    () => switcherSections(charts, current, lineSystem, !eventsOn),
    [charts, current, lineSystem, eventsOn],
  );
  // The section the active chart is in — the one a Tab flash is shown in.
  const activeKind: ChartKindOf | null = current ? storedKind(current) : null;
  const isEvent = (c: StoredChart) => eventsOn && storedKind(c) === 'event';

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
  // The top bar's menu stays inside the map column (TopNav/navColumn.ts): beside a wide dock the
  // trigger sits a few hundred px from the screen edge, and the menu is up to 360 px wide. The
  // phone layout pins it in CSS instead; the expanded sidebar's copy has the sidebar to itself.
  useLayoutEffect(() => {
    if (compact && menuOpen && menuRef.current && !isNarrowNav()) fitToNavColumn(menuRef.current);
  }, [compact, menuOpen]);

  // The birth date and place: one string (they change together on a chart switch), in a
  // .meta that carries translate="no" — a date and a place name are the chart's data,
  // not copy for a page translator to rewrite. (2026-10-09)
  const fullMeta = current ? (
    <>
      {`${id.date(fmtBirthDate(current, fmt))} · ${id.text(current.birthplace.label.split(',')[0])}`}
      {current.tzUncertain && <span className="uncertain">⚠</span>}
    </>
  ) : null;
  // "No chart" in force: the trigger names it, and its second line says what is drawn.
  // No chart is offered while the geodetic hold is lifted (lib/geodeticHold), to every reader:
  // event charts alone sit on the ADV rung as well.
  const skyPicked = !current && !GEODETIC_HELD && noChartPicked;

  // The trigger tip's Tab line, with the {key} token rendered as the shared
  // yellow key chip so the key name reads like the menu badges. The wrapper
  // class lets the whole line hide on keyboard-less touch (see the CSS) —
  // hiding only the chip, like HoverTip does, would leave a broken sentence.
  // The token may sit anywhere in a translation (start, middle or end); the split
  // takes the text on either side of its first occurrence, and a line that lost it
  // keeps all its words, unchipped, rather than dropping any. (2026-10-09) With the
  // sections, Tab cycles the active chart's own list, and the line says so.
  const [tabHintPre, ...tabHintRest] = t(
    sections ? 'chartSwitcher.tabHintSections' : 'chartSwitcher.tabHint',
  ).split('{key}');
  const tabHint = (
    <span className="switcher-tab-hint">
      {tabHintPre}
      {tabHintRest.length > 0 && <span className="ui-tip-hotkey">Tab</span>}
      {tabHintRest.join('')}
    </span>
  );

  // One chart row, the same in the single list and in either section. `arrow` marks
  // the row a Tab swap just landed on.
  const renderRow = (c: StoredChart, arrow: boolean) => (
    <li key={c.id} className={c.id === current?.id ? 'active' : ''}>
      <button
        type="button"
        className="chart-row"
        onClick={() => {
          onSelect(c.id);
          setOpen(false);
        }}
      >
        {/* A row's name, date and place are the chart's data: not offered to a
            page translator. */}
        <span className="chart-name" translate="no">
          {/* Quick-swap feedback: the arrow marks the row just landed on. */}
          {arrow && (
            <span className="qs-arrow" aria-hidden="true">
              →
            </span>
          )}
          <TagIcon tag={chartTag(c)} className="tag-icon" />
          {isEvent(c) && (
            <TagIcon tag="event" className="tag-icon" label={t('chartManager.eventRowAria')} />
          )}
          {timeUnknown(c) && (
            <TagIcon tag="unknown" className="tag-icon" />
          )}
          {/* Starred rows show a star badge, so cap their name a little
              shorter to leave room for it. */}
          {id.on
            ? id.name(c.name)
            : displayName(
                c.name,
                chartTag(c) === 'star'
                  ? NAME_SOFT_LIMIT_STARRED
                  : NAME_SOFT_LIMIT,
              )}
        </span>
        <span className="chart-meta" translate="no">
          {`${id.date(fmtBirthDate(c, fmt))} · ${id.text(c.birthplace.label.split(',')[0])}`}
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
  );

  // One section: its heading, then its rows — the frozen flash order in the section a
  // Tab swap is cycling, the live list in the other — or its empty line, under which the
  // Events list offers the example event.
  const renderSection = (kind: ChartKindOf, rows: StoredChart[]) => {
    const flashing = kind === activeKind && flashCharts !== null;
    const shown = flashing ? flashCharts : rows;
    const head = `${headId}-${kind}`;
    return (
      <div key={kind} className="switcher-section" role="group" aria-labelledby={head}>
        <div id={head} className="switcher-section-head">
          {t(kind === 'event' ? 'chartSwitcher.section.events' : 'chartSwitcher.section.people')}
        </div>
        <ul>
          {shown.length === 0 && (
            <li className="empty">
              <span>
                {t(kind === 'event' ? 'chartSwitcher.section.eventsEmpty' : 'chartSwitcher.section.peopleEmpty')}
              </span>
              {kind === 'event' && onAddExample && !hasExampleEvent(charts) && (
                <TipButton
                  type="button"
                  className="switcher-add-example"
                  // It adds and selects nothing, so the menu stays open on the list
                  // the example lands in.
                  onClick={onAddExample}
                  placement="right"
                  tip={t('common.addExampleEvent')}
                  hint={t('common.addExampleEventHint')}
                >
                  <TagIcon tag="event" />
                  {t('common.addExampleEvent')}
                </TipButton>
              )}
            </li>
          )}
          {shown.map((c, i) => renderRow(c, flashing && !!flash && i === flash.index))}
        </ul>
      </div>
    );
  };

  // The fixed first row: no chart at all (2026-10-20). Behind the geodetic hold; once it lifts, for
  // every reader — only event charts sit on the ADV rung — so it opens both the sectioned menu
  // and the plain list.
  // Its tip says what it draws, and — only when choosing it would set an overlay or an open Local
  // Space window aside — names them, in one sentence (CLAUDE.md rule 3: a warning about a no-op
  // trains people to skip warnings). Its key, 0, is the yellow pill.
  const skyRow = onSelectNoChart && !GEODETIC_HELD ? (
      <ul className="switcher-sky">
        <li className={noChartPicked && !current ? 'active' : ''}>
          <TipButton
            type="button"
            className="chart-row"
            onClick={() => {
              onSelectNoChart();
              setOpen(false);
            }}
            placement="right"
            tip={t('chartSwitcher.sky.name')}
            hotkey="0"
            hint={
              noChartHolds.length
                ? `${t('chartSwitcher.sky.hint')} ${t('chartSwitcher.sky.hintMasks', {
                    held: fmt.list(noChartHolds),
                    count: noChartHolds.length,
                  })}`
                : t('chartSwitcher.sky.hint')
            }
          >
            <span className="chart-name">{t('chartSwitcher.sky.name')}</span>
            <span className="chart-meta">{t('chartSwitcher.sky.tagline')}</span>
          </TipButton>
        </li>
      </ul>
  ) : null;

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
            {/* The chart's name is the reader's data, so it isn't offered to a page
                translator (the "no chart" line is copy and still is). Keyed by the
                chart, so a switch remounts the name instead of patching its text in
                place. (2026-10-09) */}
            <strong
              key={current?.id ?? (skyPicked ? 'sky' : 'none')}
              translate={current ? 'no' : undefined}
            >
              {current ? (
                <>
                  <TagIcon tag={chartTag(current)} className="tag-icon" />
                  {isEvent(current) && (
                    <TagIcon tag="event" className="tag-icon" label={t('chartManager.eventRowAria')} />
                  )}
                  {timeUnknown(current) && (
                    <TagIcon tag="unknown" className="tag-icon" />
                  )}
                  {/* Top bar: BOTH forms, and CSS shows one (ChartSwitcher.css) — the
                      hard-capped name normally, just the initials on the phone layout and in
                      the compact nav, where the name + date don't fit. Both in the DOM so the
                      nav can measure its full width while showing the short one. Expanded
                      sidebar: the full name, let CSS ellipsis trim it so it reveals more as
                      the sidebar widens. */}
                  {compact ? (
                    <>
                      <span className="switcher-full">
                        {id.on ? id.name(current.name) : displayName(current.name)}
                      </span>
                      <span className="switcher-short">
                        {id.on ? id.name(current.name) : initials(current.name, lang)}
                      </span>
                    </>
                  ) : id.on ? (
                    id.name(current.name)
                  ) : (
                    current.name
                  )}
                </>
              ) : skyPicked ? (
                (skyTitle ?? t('chartSwitcher.sky.name'))
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
            <span className="meta" translate="no">
              {compact ? (
                <>
                  <span className="switcher-full">{fullMeta}</span>
                  <span className="switcher-short">
                    {id.on ? id.date(String(current.year)) : current.year}
                  </span>
                </>
              ) : (
                fullMeta
              )}
            </span>
          )}
          {/* What No chart draws: the overlay and its date, or the sky alone. Copy and a
              date rather than the reader's data, rewritten as the timeline moves — so ONE
              string child, which a page translator can't strand. */}
          {skyPicked && !skyTitle && (
            <span className="meta">{skyMeta ?? t('chartSwitcher.sky.metaOff')}</span>
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
        <div ref={menuRef} className="switcher-menu">
          {sections ? (
            <div className="switcher-sections">
              {skyRow}
              {sections.order.map((kind) => renderSection(kind, sections[kind]))}
            </div>
          ) : (
            <>
            {skyRow}
            <ul>
              {charts.length === 0 && (
                <li className="empty">{t('chartSwitcher.empty')}</li>
              )}
              {list.map((c, i) => renderRow(c, !!flash && i === flash.index))}
            </ul>
            </>
          )}
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
