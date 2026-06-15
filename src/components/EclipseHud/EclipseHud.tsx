// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type {
  EclipseCatalogRow,
  EclipseContact,
  EclipseDetails,
} from '../../lib/astro/eclipses';
import type { EclipseIsoStep } from '../../lib/overlayPrefs';
import { PLANET_COLORS } from '../../lib/ephemeris';
import {
  ASPECT_GLYPHS,
  PLANET_GLYPHS,
  SIGN_GLYPHS,
} from '../../lib/astro/glyphChars';
import { useMovableHud } from '../../lib/useMovableHud';
import { useT } from '../../i18n';
import type { Formatters, TFn } from '../../i18n';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { ClickIcon } from '../ui/ClickIcon';
import { EyeIcon } from '../ui/EyeIcon';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { glyphify } from '../ui/glyphify';
import { useHoverTip } from '../ui/useHoverTip';
import './EclipseHud.css';

// "8 April 2024" from a catalog id ("2024-04-08").
function fmtRowDate(id: string, fmt: Formatters): string {
  const [y, m, d] = id.split('-').map(Number);
  return `${d} ${fmt.monthName(m)} ${y}`;
}

const kindLabel = (t: TFn, kind: EclipseCatalogRow['kind']) =>
  t(`settings.eclipses.kind.${kind}`);

// ☉/☾ before the type name marks the body at a glance (the type words
// 'Total'/'Partial' exist on both sides of the merged catalog).
const bodyGlyph = (body: EclipseCatalogRow['body']) =>
  PLANET_GLYPHS[body === 'solar' ? 'Sun' : 'Moon'];

type BodyFilter = 'all' | 'solar' | 'lunar';
const BODY_FILTERS: BodyFilter[] = ['all', 'solar', 'lunar'];
// Type chips are contextual to the chosen body (hidden on 'all', where mixed
// 'Total' chips would be ambiguous).
const TYPE_FILTERS: Record<'solar' | 'lunar', EclipseCatalogRow['kind'][]> = {
  solar: ['total', 'annular', 'hybrid', 'partial'],
  lunar: ['total', 'partial', 'penumbral'],
};

const ISO_STEPS: EclipseIsoStep[] = [10, 20, 25];

interface EclipseHudProps {
  /** The full chronological merged catalog (1800–2399, solar + lunar). */
  catalog: EclipseCatalogRow[];
  /** The selected eclipse — never null while the overlay is active. */
  selected: EclipseCatalogRow | null;
  /** `source` lets the App fly to menu picks but keep ‹ › stepping still. */
  onSelect: (id: string, source: 'menu' | 'step') => void;
  /** The ⌖ button: ease the camera to the selected eclipse's ground point. */
  onLocate: () => void;
  /** The selected eclipse's vitals (max instant, eclipse degree, magnitudes,
   *  durations…); null until the lazy eclipses module + Swiss solve resolve. */
  details: EclipseDetails | null;
  /** Eclipse-degree hits on the natal chart (conj/square/opp within 3°),
   *  tightest first; null outside eclipses mode. */
  contacts: EclipseContact[] | null;
  /** Display toggles + the solar magnitude-isoline interval — relocated here
   *  from the Settings ▸ Overlay tab. */
  showNatalLines: boolean;
  setShowNatalLines: (v: boolean) => void;
  showChartLines: boolean;
  setShowChartLines: (v: boolean) => void;
  isoStep: EclipseIsoStep;
  setIsoStep: (s: EclipseIsoStep) => void;
}

/**
 * Bottom-center HUD for the Eclipses overlay. Like the timeline + synastry bars,
 * it leads with a draggable NUB (grip + "Eclipses" + an eye that collapses the
 * body to focus on the map). The expanded body both shows + chooses the eclipse
 * (‹ › step the catalog, the trigger opens an upward picker with search + body/
 * type filters, ⌖ flies to it) AND carries everything the Settings sidebar used
 * to host: the eclipse's vitals, its natal contacts, the Natal/Eclipse-line
 * toggles, and the solar magnitude-isoline interval.
 */
export function EclipseHud({
  catalog,
  selected,
  onSelect,
  onLocate,
  details,
  contacts,
  showNatalLines,
  setShowNatalLines,
  showChartLines,
  setShowChartLines,
  isoStep,
  setIsoStep,
}: EclipseHudProps) {
  const { t, fmt, labels } = useT();
  const [open, setOpen] = useState(false); // picker menu
  const [expanded, setExpanded] = useState(true); // nub eye: body shown?
  const [query, setQuery] = useState('');
  const [bodyFilter, setBodyFilter] = useState<BodyFilter>('all');
  const [typeFilter, setTypeFilter] = useState<EclipseCatalogRow['kind'] | 'all'>('all');
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
  // A second tip for the eclipse-degree value (names its zodiac sign).
  const {
    ref: signRef,
    pos: signPos,
    show: showSign,
    hide: hideSign,
  } = useHoverTip<HTMLElement>('top');

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
  // month-name lookup, and doing that per row per keystroke for ~2,900 rows
  // would jank the search box. The deferred query keeps typing responsive
  // while the (large) filtered list re-renders in the background.
  const displayRows = useMemo(
    () =>
      catalog.map((row) => {
        const dateText = fmtRowDate(row.id, fmt);
        const kindText = kindLabel(t, row.kind);
        const bodyText = t(`settings.eclipses.body.${row.body}`);
        return {
          row,
          dateText,
          kindText,
          sarosText: t('eclipseHud.saros', { n: row.saros }),
          searchText:
            `${row.id} ${dateText} ${bodyText} ${kindText} saros ${row.saros}`.toLowerCase(),
        };
      }),
    [catalog, t, fmt],
  );
  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return displayRows.filter((d) => {
      if (bodyFilter !== 'all' && d.row.body !== bodyFilter) return false;
      if (typeFilter !== 'all' && d.row.kind !== typeFilter) return false;
      // Match the date, the localized date, body, type name, or "saros NNN".
      return !q || q.split(/\s+/).every((part) => d.searchText.includes(part));
    });
  }, [displayRows, deferredQuery, bodyFilter, typeFilter]);

  // ‹ › always walk the FULL chronological catalog — the menu's filter is a
  // browsing aid, not a constraint on stepping.
  const index = selected ? catalog.findIndex((r) => r.id === selected.id) : -1;
  const step = (delta: number) => {
    const next = catalog[index + delta];
    if (next) onSelect(next.id, 'step');
  };

  return (
    <div
      className={`eclipse-hud${dragging ? ' dragging' : ''}${
        expanded ? '' : ' is-collapsed'
      }`}
      ref={ref}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
    >
      {/* Nub: grip + "Eclipses" (+ the current eclipse when collapsed) + the
          collapse eye. Doubles as the move handle; the eye stops pointer/double
          events so it never starts a drag/dock. */}
      <div className="eclipse-hud-nub" {...handleProps}>
        <span className="hud-grip" aria-hidden="true" />
        <span className="eclipse-hud-nub-label">{t('eclipseHud.title')}</span>
        {!expanded && selected && (
          <span className="eclipse-hud-nub-sel">
            {fmtRowDate(selected.id, fmt)} ·{' '}
            <span className="astro-glyph" aria-hidden="true">
              {bodyGlyph(selected.body)}
            </span>{' '}
            {kindLabel(t, selected.kind)}
          </span>
        )}
        <TipButton
          type="button"
          className="eclipse-hud-eye"
          placement="top"
          tip={t(expanded ? 'eclipseHud.barToggle.hide' : 'eclipseHud.barToggle.show')}
          aria-label={t(expanded ? 'eclipseHud.barToggle.hide' : 'eclipseHud.barToggle.show')}
          aria-pressed={expanded}
          onClick={() => setExpanded((v) => !v)}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <EyeIcon open={expanded} />
        </TipButton>
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
      </div>

      {expanded && (
        <div className="eclipse-hud-body">
          {/* Selection: ‹  [date · type ▾]  ›  ⌖ */}
          <div className="eclipse-hud-controls">
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
                    setBodyFilter('all');
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
                        {fmtRowDate(selected.id, fmt)} ·{' '}
                        <span className="astro-glyph" aria-hidden="true">
                          {bodyGlyph(selected.body)}
                        </span>{' '}
                        {kindLabel(t, selected.kind)}
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
                    {BODY_FILTERS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        className={`eclipse-hud-filter ${bodyFilter === b ? 'active' : ''}`}
                        aria-pressed={bodyFilter === b}
                        onClick={() => {
                          setBodyFilter(b);
                          // The type chips are body-specific; switching bodies
                          // resets them so a solar-only type can't strand a lunar
                          // list (and vice versa).
                          setTypeFilter('all');
                        }}
                      >
                        {b === 'all' ? t('eclipseHud.all') : t(`settings.eclipses.body.${b}`)}
                      </button>
                    ))}
                  </div>
                  {bodyFilter !== 'all' && (
                    <div className="eclipse-hud-filters">
                      {(['all', ...TYPE_FILTERS[bodyFilter]] as const).map((k) => (
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
                  )}
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
                            onSelect(d.row.id, 'menu');
                            setOpen(false);
                          }}
                        >
                          <span className="eclipse-hud-row-name">{d.dateText}</span>
                          <span className="eclipse-hud-row-meta">
                            <span className="astro-glyph" aria-hidden="true">
                              {bodyGlyph(d.row.body)}
                            </span>{' '}
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

            <TipButton
              type="button"
              className="eclipse-hud-step eclipse-hud-locate"
              onClick={onLocate}
              disabled={!selected}
              placement="top"
              tip={t('eclipseHud.locate')}
              aria-label={t('eclipseHud.locate')}
            >
              {/* Crosshair "locate" target — an inline SVG, not the ⌖ text glyph
                  (renders thin/font-dependent), so it stays crisp and centres. */}
              <svg
                className="eclipse-hud-locate-icon"
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
                <circle cx="12" cy="12" r="7" />
                <path d="M12 1v3" />
                <path d="M12 20v3" />
                <path d="M1 12h3" />
                <path d="M20 12h3" />
                <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
              </svg>
            </TipButton>
          </div>

          {/* The selected eclipse's vitals + natal contacts + display options.
              All gated on `details` (the lazy module + Swiss solve), as the
              Settings panel was — the magnitude/duration rows differ by body. */}
          {details && (
            <>
              <dl className="eclipse-hud-vitals">
                <div>
                  <dt>{t('settings.eclipses.details.maximum')}</dt>
                  <dd>{details.maxUtc}</dd>
                </div>
                <div>
                  <dt>{t('settings.eclipses.details.type')}</dt>
                  <dd>
                    {t(`settings.eclipses.body.${details.row.body}`)}
                    {' · '}
                    {t(`settings.eclipses.kind.${details.row.kind}`)}
                    {details.row.body === 'solar' &&
                      details.row.kind !== 'partial' &&
                      ` · ${t(
                        details.row.central
                          ? 'settings.eclipses.details.central'
                          : 'settings.eclipses.details.nonCentral',
                      )}`}
                  </dd>
                </div>
                <div>
                  <dt>{t('settings.eclipses.details.sunPosition')}</dt>
                  <dd
                    ref={signRef}
                    className="eclipse-hud-degree"
                    onMouseEnter={showSign}
                    onMouseLeave={hideSign}
                  >
                    {glyphify(details.zodiac)}
                  </dd>
                </div>
                {details.row.body === 'solar' ? (
                  <div>
                    <dt>{t('settings.eclipses.details.magnitude')}</dt>
                    <dd>{details.row.magnitude.toFixed(4)}</dd>
                  </div>
                ) : (
                  <>
                    <div>
                      <dt>{t('settings.eclipses.details.umbralMag')}</dt>
                      <dd>{details.row.umbMag.toFixed(4)}</dd>
                    </div>
                    <div>
                      <dt>{t('settings.eclipses.details.penumbralMag')}</dt>
                      <dd>{details.row.penMag.toFixed(4)}</dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>{t('settings.eclipses.details.gamma')}</dt>
                  <dd>{details.row.gamma.toFixed(4)}</dd>
                </div>
                <div>
                  <dt>{t('settings.eclipses.details.hemisphere')}</dt>
                  <dd>
                    {t(
                      details.row.gamma >= 0
                        ? 'settings.eclipses.details.north'
                        : 'settings.eclipses.details.south',
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t('settings.eclipses.details.saros')}</dt>
                  <dd>{details.row.saros}</dd>
                </div>
                <div>
                  <dt>{t('settings.eclipses.details.lunation')}</dt>
                  <dd>{details.row.lunation}</dd>
                </div>
                {details.row.body === 'solar' ? (
                  <>
                    {details.row.durationSec !== null && (
                      <div>
                        <dt>{t('settings.eclipses.details.duration')}</dt>
                        <dd>
                          {Math.floor(details.row.durationSec / 60)}m{' '}
                          {details.row.durationSec % 60}s
                        </dd>
                      </div>
                    )}
                    {details.row.widthKm !== null && (
                      <div>
                        <dt>{t('settings.eclipses.details.width')}</dt>
                        <dd>{details.row.widthKm} km</dd>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {(
                      [
                        ['penumbralDur', details.row.durPenMin],
                        ['partialDur', details.row.durParMin],
                        ['totalDur', details.row.durTotMin],
                      ] as const
                    ).map(
                      ([key, min]) =>
                        min !== null && (
                          <div key={key}>
                            <dt>{t(`settings.eclipses.details.${key}`)}</dt>
                            <dd>
                              {Math.floor(min / 60)}h{' '}
                              {String(Math.round(min % 60)).padStart(2, '0')}m
                            </dd>
                          </div>
                        ),
                    )}
                  </>
                )}
              </dl>

              {/* Where the eclipse degree strikes the natal chart — hard contacts
                  (conj/square/opp, 3° orb), tightest first. */}
              <div className="eclipse-hud-contacts-row">
                <span className="eclipse-hud-grouplabel">
                  {t('settings.eclipses.contacts.heading')}
                </span>
                {contacts && contacts.length > 0 ? (
                  <ul className="eclipse-hud-contacts">
                    {contacts.map((c) => (
                      <li key={`${c.aspect}-${c.planet ?? c.angle}`}>
                        <span className="astro-glyph eclipse-hud-contact-asp">
                          {ASPECT_GLYPHS[c.aspect]}
                        </span>
                        {c.planet && (
                          <PlanetGlyph
                            planet={c.planet}
                            size={13}
                            className="eclipse-hud-contact-planet"
                            color={PLANET_COLORS[c.planet]}
                          />
                        )}
                        <span className="eclipse-hud-contact-name">
                          {t(`settings.eclipses.contacts.aspect.${c.aspect}`)}{' '}
                          {c.planet
                            ? labels.planet(c.planet)
                            : t(`settings.eclipses.contacts.${c.angle!}`)}
                        </span>
                        <span className="eclipse-hud-contact-orb">
                          {Math.floor(c.orb)}°
                          {String(Math.round((c.orb % 1) * 60)).padStart(2, '0')}′
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="eclipse-hud-contacts-empty">
                    {t('settings.eclipses.contacts.none')}
                  </span>
                )}
              </div>

              {/* Display options: Natal/Eclipse line toggles + (solar) isolines. */}
              <div className="eclipse-hud-display">
                <TipButton
                  type="button"
                  className={`eclipse-hud-toggle ${showNatalLines ? 'on' : 'off'}`}
                  placement="top"
                  tip={t('settings.eclipses.natalLines.title')}
                  hint={t('settings.eclipses.natalLines.hint')}
                  aria-label={t('settings.eclipses.natalLines.title')}
                  aria-pressed={showNatalLines}
                  onClick={() => setShowNatalLines(!showNatalLines)}
                >
                  <EyeIcon open={showNatalLines} />
                  <span className="eclipse-hud-toggle-name">
                    {t('settings.eclipses.natalLines.title')}
                  </span>
                </TipButton>
                <TipButton
                  type="button"
                  className={`eclipse-hud-toggle ${showChartLines ? 'on' : 'off'}`}
                  placement="top"
                  tip={t('settings.eclipses.chartLines.title')}
                  hint={t('settings.eclipses.chartLines.hint')}
                  aria-label={t('settings.eclipses.chartLines.title')}
                  aria-pressed={showChartLines}
                  onClick={() => setShowChartLines(!showChartLines)}
                >
                  <EyeIcon open={showChartLines} />
                  <span className="eclipse-hud-toggle-name">
                    {t('settings.eclipses.chartLines.title')}
                  </span>
                </TipButton>

                {/* Solar magnitude-isoline interval; lunar eclipses draw none. */}
                {details.row.body === 'solar' && (
                  <>
                    <span className="eclipse-hud-grouplabel">
                      {t('settings.headings.magnitudeSteps')}
                    </span>
                    <span className="eclipse-hud-isosteps" role="group">
                      {ISO_STEPS.map((s) => (
                        <TipButton
                          key={s}
                          type="button"
                          className={`eclipse-hud-iso${isoStep === s ? ' on' : ''}`}
                          placement="top"
                          tip={t(`settings.eclipses.isoStep.${s}.label`)}
                          hint={t(`settings.eclipses.isoStep.${s}.hint`)}
                          aria-pressed={isoStep === s}
                          onClick={() => setIsoStep(s)}
                        >
                          {t(`settings.eclipses.isoStep.${s}.label`)}
                        </TipButton>
                      ))}
                    </span>
                  </>
                )}
              </div>

              <HoverTip
                pos={signPos}
                placement="top"
                title={glyphify(
                  `${SIGN_GLYPHS[details.signIndex]} ${labels.sign(details.signIndex)}`,
                )}
                hint={t(
                  details.row.body === 'solar'
                    ? 'settings.eclipses.details.sunPositionTip'
                    : 'settings.eclipses.details.moonPositionTip',
                  { sign: labels.sign(details.signIndex) },
                )}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
