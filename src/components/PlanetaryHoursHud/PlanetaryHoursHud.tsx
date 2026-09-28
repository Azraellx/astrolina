// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The PLANETARY HOURS window — a module of the Sky Times band, not a view of its
// own: the chip at the head of the band opens and closes it, it shows only while the
// band does, and it reads the band's own computation (the shown day's planetary
// days, the hour in force at the band's instant, the point's clock). So the chip
// and the window can never disagree, and paging the band's day pages the window.
//
// The one movable window rendered by something other than App, for that reason:
// the hours live in the band. It PORTALS to <body> — inside the band's DOM it would
// sit in the band's own stacking layer (fixed, z-index 6), under every other window,
// the overlay bars and the nav, and inherit the band's small muted type. The band's
// date picker (TimelineDateModal) portals out for the same reason.
import { Fragment, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PLANET_COLORS } from '../../lib/ephemeris';
import {
  CHALDEAN_ORDER,
  type PlanetaryDay,
  type PlanetaryDayResult,
  type PlanetaryDaysAround,
  type PlanetaryHour,
  type PlanetaryNow,
} from '../../lib/astro/planetaryHours';
import { useT } from '../../i18n';
import { useMovableHud } from '../../lib/useMovableHud';
import { getReservedLeftInset } from '../../lib/leftDock';
import { HudHeader } from '../ui/HudHeader';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
// The shared floating-window chrome (.timeline-hud frost + .location-* parts),
// then this window's own layout.
import '../TimelineHud/TimelineHud.css';
import '../LocationHud/LocationHud.css';
import './PlanetaryHoursHud.css';

// Its own saved position (independent of the other floating windows).
const POS_KEY = 'astro:planetary-hours-pos:v1';
// Kept in sync with .planetary-hours-hud's width in the CSS. The height is an
// estimate for the FIRST placement only, before there is a frame to measure; the
// hook clamps every placement against the real frame and keeps it above the band
// as the band or the window changes size.
const HUD_W = 300;
const HUD_H_EST = 540;

const MS_DAY = 86_400_000;
const msToJD = (ms: number) => ms / MS_DAY + 2440587.5;

// Home spot: just above the band's left end, where the chip that opened it sits.
// Read from the band's own box when it has painted (its left edge already honours
// the chart sidebar), else from the same vars the band's layout reads. `height` is
// the frame's own when it has one (a double-click re-home), else the estimate.
function homeSpot(height: number): { x: number; y: number } {
  const band = document.querySelector('.sky-band')?.getBoundingClientRect();
  const root = getComputedStyle(document.documentElement);
  const left =
    band?.left ??
    Math.max(parseFloat(root.getPropertyValue('--es-width')) || 0, getReservedLeftInset());
  const top =
    band?.top ??
    window.innerHeight - (parseFloat(root.getPropertyValue('--sky-band-h')) || 0);
  return {
    x: Math.round(Math.min(left + 8, window.innerWidth - HUD_W - 8)),
    y: Math.round(Math.max(72, top - height - 10)),
  };
}

export interface PlanetaryHoursHudProps {
  /** The planetary days around the band's shown date; null with no place (or no
   *  ephemeris for the Sun, which the bundled range never hits). */
  days: PlanetaryDaysAround | null;
  /** The hour in force at the band's instant (`ok: false` names the unavailable day
   *  that owns it) — null when that instant is neither on the shown calendar day
   *  nor inside the shown planetary day (the band's pager is elsewhere). */
  now: PlanetaryNow | null;
  /** The instant `now` was read at (epoch ms UT): the present, or the slid one. */
  instantMs: number;
  /** True while the Slide tool spins the sky — the instant is the slid one. */
  sliding: boolean;
  /** Whether the band has a place to read at all. */
  hasPoint: boolean;
  placeLabel: string | null;
  /** The band's shown date, as its pager prints it. */
  dayLabel: string;
  /** An instant (JD UT) as "HH:MM" in the point's zone — the band's own clock. */
  clock: (jd: number) => string;
  onClose: () => void;
}

export function PlanetaryHoursHud({
  days,
  now,
  instantMs,
  sliding,
  hasPoint,
  placeLabel,
  dayLabel,
  clock,
  onClose,
}: PlanetaryHoursHudProps) {
  const { t, fmt } = useT();
  const [collapsed, setCollapsed] = useState(false);
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef, {
    posKey: POS_KEY,
    floating: true,
    initial: () => homeSpot(hudRef.current?.offsetHeight || HUD_H_EST),
  });

  const bodyName = (p: PlanetaryHour['ruler']) => t(`planets.${p}.name`);
  const weekday = (d: PlanetaryDayResult) => fmt.weekdayName(d.date.weekday);
  const glyph = (p: PlanetaryHour['ruler'], size: number) => (
    <PlanetGlyph planet={p} size={size} color={PLANET_COLORS[p]} />
  );
  const reasonText = (d: PlanetaryDayResult): string =>
    d.ok
      ? ''
      : t(
          d.reason === 'sun-up'
            ? 'skyTimes.planetary.reason.sunUp'
            : d.reason === 'sun-down'
              ? 'skyTimes.planetary.reason.sunDown'
              : 'skyTimes.planetary.reason.noNextSunrise',
          { weekday: weekday(d) },
        );

  // ── The hour in force: its ruler large, when it ends, where in the day it falls ──
  const hero: ReactNode = (() => {
    if (!now?.ok) return null;
    const { hour } = now;
    const n = hour.night ? hour.index - 11 : hour.index + 1;
    const at = clock(msToJD(instantMs));
    return (
      <div className="ph-hero">
        <span className="ph-hero-glyph">{glyph(hour.ruler, 30)}</span>
        <span className="ph-hero-text">
          <span className="ph-hero-title">
            {t('skyTimes.planetary.hourName', { hour: bodyName(hour.ruler) })}
          </span>
          <span className="ph-hero-sub">
            {t(hour.night ? 'skyTimes.planetary.hourOfNight' : 'skyTimes.planetary.hourOfDay', { n })}
            {' · '}
            {t('skyTimes.planetary.until', { end: clock(hour.end) })}
          </span>
          <span className="ph-hero-sub">
            {t(sliding ? 'skyTimes.planetary.slideAt' : 'skyTimes.planetary.nowAt', { time: at })}
            {/* The day the hour belongs to is named under the hero — by the day
                line when it's the listed day, by the note when it's a neighbour. */}
          </span>
        </span>
      </div>
    );
  })();

  // When the instant belongs to a neighbouring planetary day, say so above the list
  // — before sunrise the listed day hasn't begun yet. The neighbour may have no
  // hours at all (the night before a polar day's first sunrise): the chip reads
  // "not available" then, and this is where that is explained.
  const elsewhere: string | null = (() => {
    if (!days || !now || now.day === days.shown) return null;
    const shown = days.shown;
    if (now.day === days.previous) {
      const prev = weekday(now.day);
      const day = weekday(shown);
      if (now.ok) {
        return shown.ok
          ? t('skyTimes.planetary.beforeSunrise', {
              prev,
              day,
              // The previous day's next sunrise IS the listed day's first one.
              time: clock(now.day.nextSunrise),
            })
          : t('skyTimes.planetary.beforeSunriseNone', { prev, day });
      }
      return shown.ok
        ? t('skyTimes.planetary.prevNone', { prev, day, time: clock(shown.sunrise) })
        : t('skyTimes.planetary.prevNoneEither', { prev, day });
    }
    // The day after, already begun (a sunrise before local midnight).
    return now.ok
      ? t('skyTimes.planetary.afterNextSunrise', {
          next: weekday(now.day),
          time: clock(now.day.sunrise),
        })
      : t('skyTimes.planetary.nextNone', { next: weekday(now.day) });
  })();

  // An hour of the listed day that has already ended, while the instant is on it.
  const isPast = (d: PlanetaryDay, h: PlanetaryHour) =>
    !!now?.ok &&
    !!days &&
    ((now.day === d && h.index < now.hour.index) || now.day === days.next);
  const isNow = (d: PlanetaryDay, h: PlanetaryHour) =>
    !!now?.ok && now.day === d && now.hour.index === h.index;

  const cell = (d: PlanetaryDay, h: PlanetaryHour) => (
    <span
      className={`ph-cell${isNow(d, h) ? ' is-now' : ''}${isPast(d, h) ? ' is-past' : ''}`}
    >
      {glyph(h.ruler, 13)}
      <span className="ph-cell-name">{bodyName(h.ruler)}</span>
      <span className="ph-cell-time">{clock(h.start)}</span>
    </span>
  );

  const minutes = (dayFraction: number) =>
    t('skyTimes.planetary.minutes', { m: Math.round(dayFraction * 1440) });

  const table = (d: PlanetaryDay) => (
    <>
      <div className="ph-dayline">
        {glyph(d.ruler, 15)}
        <span>{t('skyTimes.planetary.day', { weekday: weekday(d), day: bodyName(d.ruler) })}</span>
      </div>
      <div className="ph-grid">
        <span aria-hidden="true" />
        <span className="ph-head">{t('skyTimes.planetary.colDay', { len: minutes(d.dayHour) })}</span>
        <span className="ph-head">{t('skyTimes.planetary.colNight', { len: minutes(d.nightHour) })}</span>
        {Array.from({ length: 12 }, (_, i) => (
          <Fragment key={i}>
            <span className="ph-n">{i + 1}</span>
            {cell(d, d.hours[i])}
            {cell(d, d.hours[i + 12])}
          </Fragment>
        ))}
      </div>
      <div className="ph-foot">
        {t('skyTimes.planetary.nextSunrise', { time: clock(d.nextSunrise) })}
      </div>
    </>
  );

  let body: ReactNode;
  if (!hasPoint) {
    body = <div className="ph-empty">{t('skyTimes.noPlace')}</div>;
  } else if (!days) {
    body = <div className="ph-empty">{t('skyTimes.planetary.unavailableShort')}</div>;
  } else {
    const shown = days.shown;
    body = (
      <>
        {hero}
        {elsewhere && <div className="ph-note">{elsewhere}</div>}
        {shown.ok ? (
          <>
            {table(shown)}
            {/* How the list was ruled — only where there is a list. */}
            <div className="ph-order">
              <span>{t('skyTimes.planetary.order')}</span>
              {/* One image named by the planets, so assistive tech reads "Saturn,
                  Jupiter, Mars…" rather than the glyphs' Unicode names ("male
                  sign"). Not per-glyph labels: PlanetGlyph's other call sites sit
                  beside a visible name, which a label would announce twice. */}
              <span
                className="ph-order-glyphs"
                role="img"
                aria-label={CHALDEAN_ORDER.map(bodyName).join(', ')}
              >
                {CHALDEAN_ORDER.map((p) => (
                  <Fragment key={p}>{glyph(p, 12)}</Fragment>
                ))}
              </span>
            </div>
          </>
        ) : (
          <div className="ph-unavailable">
            <span className="ph-unavailable-glyph">
              <PlanetGlyph planet="Sun" size={18} color={PLANET_COLORS.Sun} />
            </span>
            <span>
              <span className="ph-unavailable-title">{t('skyTimes.planetary.unavailableShort')}</span>
              <span className="ph-unavailable-reason">{reasonText(shown)}</span>
            </span>
          </div>
        )}
      </>
    );
  }

  return createPortal(
    <div
      ref={hudRef}
      className={`timeline-hud location-hud planetary-hours-hud${dragging ? ' thud-dragging' : ''}${collapsed ? ' is-collapsed' : ''}`}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
      role="region"
      aria-label={t('skyTimes.planetary.hud.title')}
    >
      <HudHeader
        title={t('skyTimes.planetary.hud.title')}
        handleProps={handleProps}
        dragging={dragging}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onClose={onClose}
        closeLabel={t('skyTimes.planetary.hud.closeAria')}
        closeHint={t('skyTimes.planetary.hud.closeHint')}
      />
      <div className="location-ls">
        {hasPoint && (placeLabel || dayLabel) && (
          <div className="ph-where">{[placeLabel, dayLabel].filter(Boolean).join(' · ')}</div>
        )}
        {body}
      </div>
    </div>,
    document.body,
  );
}
