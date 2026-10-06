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
//
// What the window holds of its own is reading state, and none of it is a preference:
// the highlighted planet (hover and pin), the list's scroll and the collapse all start
// fresh with each opening and are never written anywhere.
import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { PLANET_COLORS } from '../../lib/ephemeris';
import {
  CHALDEAN_ORDER,
  nextHourOf,
  type PlanetaryDay,
  type PlanetaryDayResult,
  type PlanetaryDaysAround,
  type PlanetaryHour,
  type PlanetaryNow,
  type PlanetaryRuler,
} from '../../lib/astro/planetaryHours';
import { useT } from '../../i18n';
import { panelGlyphColor } from '../../lib/theme';
import { useMovableHud } from '../../lib/useMovableHud';
import { getReservedLeftInset } from '../../lib/leftDock';
import { useTouchLayout } from '../../lib/touch';
import { HudHeader } from '../ui/HudHeader';
import { TipButton } from '../ui/HoverTip';
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
// as the band or the window changes size. (540 until 2026-10-05; the planet buttons
// and the line under them added about 25.)
const HUD_W = 300;
const HUD_H_EST = 565;

const MS_DAY = 86_400_000;
const msToJD = (ms: number) => ms / MS_DAY + 2440587.5;
const jdToMs = (jd: number) => (jd - 2440587.5) * MS_DAY;

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

// On a phone the window opens as a bottom sheet (the hook's phone home), and it must not
// climb over the nav to fit: the nav stack's bottom is its ceiling, and the hook hands the
// room between that and the chrome the sheet stands on to the CSS cap as --hud-phone-room
// (PlanetaryHoursHud.css says why, with the measurements). Read live at every re-home; the
// nav announces a change of its box (a readout bar coming and going under it) with
// `astro:hud-moved` (lib/hudSettled), which is what re-homes the sheet. No stack, no ceiling.
function navCeiling(): number | null {
  const nav = document.querySelector<HTMLElement>('.topnav-stack')?.getBoundingClientRect();
  return nav && nav.height > 0 ? nav.bottom : null;
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
  const touch = useTouchLayout();
  const [collapsed, setCollapsed] = useState(false);
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef, {
    posKey: POS_KEY,
    floating: true,
    initial: () => homeSpot(hudRef.current?.offsetHeight || HUD_H_EST),
    phoneCeiling: navCeiling,
  });

  // THE HIGHLIGHT: one planet's hours marked in the list, the rest stepped back.
  // Two sources, both transient: `pinnedRuler` is a click (or tap) on one of the
  // planet buttons under the list, and holds until the same button clears it;
  // `hoverRuler` is the mouse resting on a planet button or on an hour in the list.
  // The pointer outranks the pin while it is there, so reading another planet's
  // hours costs nothing — the picked one is back when the pointer leaves.
  const [hoverRuler, setHoverRuler] = useState<PlanetaryRuler | null>(null);
  const [pinnedRuler, setPinnedRuler] = useState<PlanetaryRuler | null>(null);
  const focus = hoverRuler ?? pinnedRuler;
  // Mouse only. On touch a "hover" is the side effect of a tap, and it would leave a
  // highlight behind with nothing on a phone to lift it — touch picks through the
  // buttons, which is the pin. Read by delegation on the container rather than on
  // each element, so the pointer crossing the gap between two hours keeps the
  // highlight instead of dropping it for a frame (the whole list would blink). An
  // element that isn't a planet's (an hour number) clears it; the gaps don't.
  const hoverFrom = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as Element).closest<HTMLElement>('[data-ruler]');
    if (el && e.currentTarget.contains(el)) setHoverRuler(el.dataset.ruler as PlanetaryRuler);
    else if (e.target !== e.currentTarget) setHoverRuler(null);
  };
  const hoverOff = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') setHoverRuler(null);
  };

  const bodyName = (p: PlanetaryHour['ruler']) => t(`planets.${p}.name`);
  const weekday = (d: PlanetaryDayResult) => fmt.weekdayName(d.date.weekday);
  // The Moon's ink follows the theme here (panelGlyphColor): the planet buttons carry
  // nothing but the glyph, and its pale gray all but vanishes on Glass's light panel.
  const glyph = (p: PlanetaryHour['ruler'], size: number) => (
    <PlanetGlyph planet={p} size={size} color={panelGlyphColor(p, PLANET_COLORS[p])} />
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

  // THE LIST'S SCROLLER. On a phone the window is capped and only the hour rows
  // scroll (PlanetaryHoursHud.css); everywhere else the rows are never cut, so what
  // follows does nothing there — the class below is set but only the phone rule
  // styles it, and a list that doesn't overflow has nothing to scroll.
  const gridRef = useRef<HTMLDivElement>(null);
  const listed = hasPoint && !!days?.shown.ok;
  // More below the fold: the foot fades out. A phone shows no scrollbar until a
  // scroll has started, so a list cut off after four rows would read as a list of
  // four — the same cue, checked the same way, as the Capture sheet's
  // (CaptureHud.tsx moreBelow). On scroll, when the scroller's box changes (the cap,
  // a note above it coming and going, a collapse), and after every render.
  const [moreBelow, setMoreBelow] = useState(false);
  const checkMore = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      checkMore.current = () => {};
      setMoreBelow(false);
      return;
    }
    const check = () => setMoreBelow(grid.scrollTop + grid.clientHeight < grid.scrollHeight - 2);
    checkMore.current = check;
    check();
    grid.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(grid);
    return () => {
      grid.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, [listed]);
  useLayoutEffect(() => checkMore.current());
  // The hour in force kept in view: on open, on expanding from collapsed, on paging
  // the day, and when the hour turns over — never on any other render, so a reader
  // who has scrolled to look at the evening isn't pulled back until the hour
  // changes. If it is already wholly in view nothing moves; if not, its row goes to
  // the top of what shows, with the hours after it underneath. A listed day that
  // doesn't hold it (another day paged to, or the hours before its sunrise) starts
  // from its first hour. Plain scrollTop arithmetic on the list: scrollIntoView would
  // also scroll every scrollable ancestor to suit — the window, and on a phone the
  // page itself.
  const nowKey = now?.ok ? `${now.day.sunrise}:${now.hour.index}` : null;
  const dayKey = days?.shown.ok ? days.shown.sunrise : null;
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || grid.scrollHeight <= grid.clientHeight + 1) return;
    const cell = grid.querySelector<HTMLElement>('.ph-cell.is-now');
    if (!cell) {
      grid.scrollTop = 0;
      return;
    }
    const top = cell.getBoundingClientRect().top - grid.getBoundingClientRect().top + grid.scrollTop;
    if (top >= grid.scrollTop && top + cell.offsetHeight <= grid.scrollTop + grid.clientHeight) return;
    grid.scrollTop = top;
  }, [nowKey, dayKey, listed, collapsed]);

  // ── The hour in force: its ruler large, when it ends, where in the day it falls ──
  const hero: ReactNode = (() => {
    if (!now?.ok) return null;
    const { hour } = now;
    const n = hour.night ? hour.index - 11 : hour.index + 1;
    const at = clock(msToJD(instantMs));
    // What is left of it, in whole minutes rounded UP: "1 min left" for the last
    // minute, never "0" while the hour still runs. Held at 1 as well, because the
    // instant can sit a hair short of an end the ms → JD round trip lands on. No
    // timer of its own: the band re-reads the present on the minute while this
    // window is open (and Slide moves the instant itself).
    const left = Math.max(1, Math.ceil((jdToMs(hour.end) - instantMs) / 60_000));
    const elapsed = Math.min(
      1,
      Math.max(0, (msToJD(instantMs) - hour.start) / (hour.end - hour.start)),
    );
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
            {' · '}
            {t('skyTimes.planetary.minLeft', { m: left })}
            {/* The day the hour belongs to is named under the hero — by the day
                line when it's the listed day, by the note when it's a neighbour. */}
          </span>
        </span>
        {/* How much of the hour has run, along the block's foot. Hidden from
            assistive tech: the minutes left above say the same thing in words. */}
        <span className="ph-hero-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${elapsed})` }} />
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

  // The highlighted planet's next hour, under the buttons that pick it — read from
  // the instant the hero reads (the present, or the slid one), so only while an
  // hour is in force there: with the pager on another day there is no "next"
  // worth the name, and the line is left out. While nothing is picked the line
  // holds its place with a prompt, so the window keeps its height as the pointer
  // crosses the list — a line coming and going under the mouse would change the
  // frame's height, the hook would re-clamp a window parked on the band, and the
  // hour under a resting pointer would change by itself.
  //
  // The one line that doesn't fit is the polar one (focus.none, below), which says
  // WHY there is no next hour — cut to one line, the reason was the part lost. So
  // wherever any planet would read it, the line wraps, and holds two lines for every
  // planet and for the prompt alike (`.is-edge`): still a height the pointer can't
  // move. It is decided by the days and the instant, never by the focus, so only the
  // instant moving turns it on (the clock or Slide, under seven hours from the end of
  // a last day before a polar day or night). Ordinary days never meet it.
  const focusLine: ReactNode = (() => {
    if (!days || !now?.ok) return null;
    const edge = CHALDEAN_ORDER.some((p) => !nextHourOf(days, p, instantMs));
    if (!focus) {
      return (
        <div className={`ph-focus is-prompt${edge ? ' is-edge' : ''}`}>
          {t('skyTimes.planetary.focus.prompt')}
        </div>
      );
    }
    const h = nextHourOf(days, focus, instantMs);
    const hour = bodyName(focus);
    let text: string;
    if (h && h.start <= msToJD(instantMs)) {
      text = t('skyTimes.planetary.focus.now', { hour, end: clock(h.end) });
    } else if (h) {
      text = t('skyTimes.planetary.focus.next', { hour, time: clock(h.start) });
    } else {
      // Nothing in the days computed: the day after the hour in force has no hours
      // here (a polar edge — nextHourOf's two causes; the window only meets this one).
      const order = [days.previous, days.shown, days.next];
      const dark = order.slice(order.indexOf(now.day) + 1).find((d) => !d.ok) ?? days.next;
      text = t('skyTimes.planetary.focus.none', { hour, weekday: weekday(dark) });
    }
    return (
      <div className={`ph-focus${edge ? ' is-edge' : ''}`}>
        {glyph(focus, 12)}
        <span className="ph-focus-text">{text}</span>
      </div>
    );
  })();

  // An hour of the listed day that has already ended, while the instant is on it.
  const isPast = (d: PlanetaryDay, h: PlanetaryHour) =>
    !!now?.ok &&
    !!days &&
    ((now.day === d && h.index < now.hour.index) || now.day === days.next);
  const isNow = (d: PlanetaryDay, h: PlanetaryHour) =>
    !!now?.ok && now.day === d && now.hour.index === h.index;

  // A cell is not focusable and not a control: the hours are read, and the keyboard
  // path to the highlight is the seven planet buttons, not 24 tab stops. `data-ruler`
  // is what the hover delegation reads.
  const cell = (d: PlanetaryDay, h: PlanetaryHour) => (
    <span
      data-ruler={h.ruler}
      className={`ph-cell${isNow(d, h) ? ' is-now' : ''}${isPast(d, h) ? ' is-past' : ''}${focus === h.ruler ? ' is-match' : ''}`}
    >
      {glyph(h.ruler, 13)}
      <span className="ph-cell-name">{bodyName(h.ruler)}</span>
      <span className="ph-cell-time">{clock(h.start)}</span>
    </span>
  );

  const minutes = (dayFraction: number) =>
    t('skyTimes.planetary.minutes', { m: Math.round(dayFraction * 1440) });

  // The column heads sit OUTSIDE the scroller, in a grid of their own with the same
  // columns, so they stay in view when the rows scroll on a phone. The two grids
  // line up because every track is sized the same way in both: the number column by
  // its widest entry — which is why the heads' corner holds an invisible "12", the
  // widest number in the rows — and the two halves as equal fractions of the rest.
  const table = (d: PlanetaryDay) => (
    <>
      <div className="ph-dayline">
        {glyph(d.ruler, 15)}
        <span>{t('skyTimes.planetary.day', { weekday: weekday(d), day: bodyName(d.ruler) })}</span>
      </div>
      <div className="ph-table">
        <div className="ph-heads">
          <span className="ph-n ph-n-ghost" aria-hidden="true">
            12
          </span>
          <span className="ph-head">{t('skyTimes.planetary.colDay', { len: minutes(d.dayHour) })}</span>
          <span className="ph-head">{t('skyTimes.planetary.colNight', { len: minutes(d.nightHour) })}</span>
        </div>
        <div
          ref={gridRef}
          className={`ph-grid${focus ? ' has-focus' : ''}${moreBelow ? ' has-more' : ''}`}
          onPointerOver={hoverFrom}
          onPointerLeave={hoverOff}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <Fragment key={i}>
              <span className="ph-n">{i + 1}</span>
              {cell(d, d.hours[i])}
              {cell(d, d.hours[i + 12])}
            </Fragment>
          ))}
        </div>
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
              {/* The order's seven planets, and the HIGHLIGHT's control: each is a
                  button that marks its planet's hours (aria-pressed is the pin).
                  Named by aria-label with the planet alone, so assistive tech walks
                  "Saturn, Jupiter, Mars…" in the order the sentence promises, and
                  never the glyphs' Unicode names ("male sign"). The label is right
                  here and not at PlanetGlyph's other call sites: those sit beside a
                  visible name, which a label would announce twice; these have none.
                  (Until 2026-10-05 the row was one role="img" named by the list.) */}
              <span className="ph-order-glyphs" onPointerOver={hoverFrom} onPointerLeave={hoverOff}>
                {CHALDEAN_ORDER.map((p) => (
                  <TipButton
                    key={p}
                    type="button"
                    className="ph-order-btn"
                    data-ruler={p}
                    placement="top"
                    aria-pressed={pinnedRuler === p}
                    aria-label={bodyName(p)}
                    tip={t('skyTimes.planetary.focus.tip', { hour: bodyName(p) })}
                    hint={t(
                      pinnedRuler === p
                        ? 'skyTimes.planetary.focus.hintOn'
                        : 'skyTimes.planetary.focus.hint',
                    )}
                    onClick={() => setPinnedRuler((v) => (v === p ? null : p))}
                  >
                    {/* A finger-sized target on touch (the CSS), and a glyph to suit. */}
                    {glyph(p, touch ? 15 : 12)}
                  </TipButton>
                ))}
              </span>
              {focusLine}
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
