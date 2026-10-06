// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The SKY BAND (View ▸ Sky Times): a bottom bar that takes REAL layout space —
// the map genuinely shrinks above it (App passes the height to <Map bottomInset>
// and publishes it to the bottom-dock registry so the rest of the chrome lifts).
// The core band is the compact row: the body LEGEND on the left (each visible
// body's glyph + name; hover = its four angle times at the active point, in
// that place's own clock) headed by the PLANETARY-HOURS chip (the day's ruler and
// the hour in force there — lib/astro/planetaryHours.ts — and the switch for the
// band's Planetary hours window, components/PlanetaryHoursHud), and the context
// column on the right (place, day pager ‹ › + Today, zone, close). A downstream build may register an expandable
// TRACK for the center (lib/extensions/skyBandTrack.ts) — its eye-toggle shows
// here only when registered AND entitled (no teaser), tagged with the gated
// tier in its hover tip. Chart-time-INDEPENDENT: the band reads the sky of the
// chosen DAY, so it works even for unknown-birth-time charts — except while the
// Slide tool is armed, when the shown day is DERIVED from the slid instant and
// the pager drives Slide (see dayStart and the pager below). On PHONES the
// same DOM reflows to stacked rows (track / legend / context — see the CSS)
// and the band pads itself by the home-indicator inset; the legend's tips are
// tap-revealed there.
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  type ReactNode,
} from 'react';
import { PLANET_COLORS, type NodeType, type PlanetName } from '../../lib/ephemeris';
import {
  skyDayRows,
  skyEventsBetween,
  type BodyDayEvents,
  type EventKind,
  type SkyEvent,
} from '../../lib/astro/riseSet';
import {
  planetaryDaysAround,
  planetaryHourAt,
  type PlanetaryDay,
} from '../../lib/astro/planetaryHours';
import { PlanetaryHoursHud } from '../PlanetaryHoursHud/PlanetaryHoursHud';
import { PLANETARY_HOURS_HELD } from '../../lib/planetaryHoursHold';
import {
  getSkyBandTrack,
  isSkyBandTrackEntitled,
  type SkyBandTrackContext,
} from '../../lib/extensions/skyBandTrack';
import { shouldShowNudge } from '../../lib/plan';
import { getIanaTimezone, offsetHoursAt, zoneLabelAt } from '../../lib/atlas/timezone';
import { usePhone } from '../../lib/touch';
import { planetRank } from '../../lib/astro/format';
import { useT } from '../../i18n';
import { TipButton, TipSpan } from '../ui/HoverTip';
import { EyeIcon } from '../ui/EyeIcon';
import { ClockIcon } from '../ui/ClockIcon';
import { ClickIcon } from '../ui/ClickIcon';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { TimelineDateModal } from '../TimelineDateModal/TimelineDateModal';
import { BIRTH_YEAR_MIN, BIRTH_YEAR_MAX } from '../DateTimeFields/DateTimeFields';
import './SkyBand.css';

/** The compact band's reserved height (px). App feeds the ACTIVE height to
 *  <Map bottomInset> and the bottom-dock registry: this while the row is
 *  compact, the registered track's own `height` while it shows. */
export const SKY_BAND_H_COMPACT = 28;

/** The phone layout's two stacked rows (legend + context, 28px each). App adds
 *  the registered track's height while it shows, the bottom safe-area inset AND
 *  the tap cushion below (the band pads itself by both), so the published
 *  height is the band's TOTAL. */
export const SKY_BAND_H_PHONE = 56;

/** Extra bottom breathing room (px) under the phone rows, beyond the safe-area
 *  inset: keeps the context row's controls — the ✕ hugs the bottom-right —
 *  clear of the display's rounded corners and comfortably tappable, and lifts
 *  the row off the raw screen edge on inset-less (home-button) phones. Kept in
 *  sync with the padding-bottom in SkyBand.css's .is-phone rule. */
export const SKY_BAND_PHONE_CUSHION = 8;

/** The band's height (px) while the TABLE layout shows (and no track does):
 *  the four time rows, with each body's glyph BESIDE its column (spanning all
 *  four rows) rather than atop it — no header row, so the band stays low. The
 *  compact row's legend is otherwise the inline times LIST; the Table toggle
 *  swaps between the two (owned by App, like the track toggle: the table takes
 *  real height, so the map's bottomInset and the furniture var must follow
 *  it). Kept in sync with the .sky-band.is-table grid in SkyBand.css. */
export const SKY_BAND_H_TABLE = 76;

const MS_DAY = 86_400_000;
// Unix epoch ms → Julian Day (UT).
const msToJD = (ms: number) => ms / MS_DAY + 2440587.5;
const jdToMs = (jd: number) => (jd - 2440587.5) * MS_DAY;

/** The four angle moments in the legend card's order (matches the old table). */
const KINDS: EventKind[] = ['rise', 'culminate', 'set', 'anticulminate'];

interface SkyBandProps {
  /** The instrument point: the placed pin, else the active chart's birthplace
   *  — or, while the follow mode is on, the cursor's (throttled) map point. */
  point: { lat: number; lng: number } | null;
  placeLabel: string | null;
  visiblePlanets: Set<PlanetName>;
  nodeType: NodeType;
  /** Whether the registered track (if any, and entitled) is expanded. Owned by
   *  App — the map's bottomInset must follow the band's height. */
  trackShown: boolean;
  onToggleTrack: () => void;
  /** Table layout on (the inline times list is the default otherwise). Owned
   *  by App — the table takes real height, so the map's bottomInset must
   *  follow it. */
  table: boolean;
  onToggleTable: () => void;
  /** Follow-the-cursor mode: 'live' while the band reads under the moving
   *  cursor, 'held' while a map click has parked it on a spot. Desktop only —
   *  the toggle hides on phones (no cursor to follow). Owned by App (it feeds
   *  the followed point back through `point`). */
  follow: 'off' | 'live' | 'held';
  onToggleFollow: () => void;
  /** The Planetary hours window (this band's module, opened from its chip) is
   *  open. Owned by App, which persists the reader's choice; the band renders the
   *  window, so it shows only while the band does. */
  planetaryOpen: boolean;
  onTogglePlanetary: () => void;
  /** The Slide tool's slid instant (epoch ms UT) while the tool is armed (App
   *  makes it non-null from the moment of arming: Δt 0 is the chart's own
   *  moment). The band shows THIS instant's day while it is set, and hands it to
   *  the track so its time cursor can follow the spin. Null = idle. */
  slideMs?: number | null;
  /** Scrub the Slide tool's slid instant to an absolute time (epoch ms UT) —
   *  handed to the track so it can drive the spin, and used by the band's own
   *  Today and date picker while the tool is armed. Present only while the tool
   *  is armed; the track keys its scrubbing affordance off it. */
  slideTo?: (ms: number) => void;
  /** Turn the Slide tool's slid instant by a number of days, against the LIVE
   *  spin (so fast repeats never race the throttled report back). The band's
   *  ‹ › use it while the tool is armed. Present only then. */
  slideBy?: (deltaDays: number) => void;
  /** Whether the active chart has a birth time. The band itself never depends on
   *  it (it reads the shown day's sky); it is handed to a registered track — a
   *  chart without a time has no angular lines, so no parans, of its own. Absent =
   *  true (no chart, or a host that doesn't say). */
  chartHasTime?: boolean;
  /** Handed to a registered track only (SkyBandTrackContext): how many catalog minor bodies
   *  have parans on the map, and the window that switches them. Absent = none. */
  minorParanBodies?: number;
  openMinorBodies?: () => void;
  /** Whether the map draws the Part of Fortune for the active chart (the host's
   *  own gate for its lines, short of the visible set the band already has). The
   *  band's Fortune entry shows only then, so it never explains a Lot that isn't
   *  there. Absent = false. */
  fortuneOnMap?: boolean;
  /** Bumped by the host when deferred ephemeris data arrives (the asteroid
   *  file): the shown day is re-solved with it. Never read otherwise. */
  ephemerisEpoch?: number;
  onClose: () => void;
}

export function SkyBand({
  point,
  placeLabel,
  visiblePlanets,
  nodeType,
  trackShown,
  onToggleTrack,
  table,
  onToggleTable,
  follow,
  onToggleFollow,
  planetaryOpen,
  onTogglePlanetary,
  slideMs = null,
  slideTo,
  slideBy,
  chartHasTime = true,
  minorParanBodies,
  openMinorBodies,
  fortuneOnMap = false,
  ephemerisEpoch = 0,
  onClose,
}: SkyBandProps) {
  const { t, fmt } = useT();
  // Phone-sized screens reflow the band to stacked rows (the is-phone class —
  // the CSS owns the layout; the DOM is the same either way).
  const phone = usePhone();
  // Day pager: offset from "today", anchored once per mount so the band doesn't
  // slide under the reader at local midnight.
  const [dayOffset, setDayOffset] = useState(0);
  const [nowMs] = useState(() => Date.now());
  // The day readout doubles as a button opening the shared moment picker (the
  // same editor the timeline bar and My Charts use), for jumps the ‹ › pager
  // can't reasonably make — decades into the past or future.
  const [pickerOpen, setPickerOpen] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startScroll: number; active: boolean } | null>(null);
  // Narrow band: the legend drops the body NAMES (glyphs only) once the band's OWN
  // width falls below 1000px. That width is the viewport MINUS the open sidebar
  // (the band is inset by --es-width), so we measure the band box itself rather
  // than the raw screen — a wide screen with the chart sidebar open still counts.
  const bandRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);

  // The place's own zone — the whole band reads in LOCAL time there. getIanaTimezone
  // (tzlookup) HARD-THROWS on invalid coordinates, so guard: an invalid point (a NaN pin
  // off a globe click, or a coordinate-less imported chart) degrades to a null zone, which
  // the band already renders gracefully, rather than crashing the whole component.
  const zone = useMemo(() => {
    if (
      !point ||
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lng) ||
      Math.abs(point.lat) > 90
    ) {
      return null;
    }
    // A world-copy click can hand us a valid place at a longitude outside ±180 — wrap it.
    const lng = ((((point.lng + 180) % 360) + 360) % 360) - 180;
    return getIanaTimezone(point.lat, lng);
  }, [point]);

  // WHICH day the band shows. Normally the reader's: the pager's offset from the
  // frozen "today". While the Slide tool is armed it is DERIVED from the slid
  // instant instead — the band reads the day the map's sky has been turned to, so
  // a track's press (which lands on the shown day) can never land decades from
  // the slid moment. Derived, never written (CLAUDE.md rule 2): `dayOffset` is
  // left exactly as the reader paged it, and comes back on its own the moment
  // Slide closes. Under Slide the pager's controls drive Slide rather than the
  // offset (below), so nothing here has a second source to drift from.
  const sliding = slideMs != null;
  const refMs = slideMs ?? nowMs + dayOffset * MS_DAY;

  // Local midnight (start of the shown day) as a UT instant: shift to wall
  // clock, floor to the wall-clock day, then shift back by the offset in force
  // AT that midnight (one refine pass from the reference's own offset). The
  // refine matters on a DST day: shifting back by the reference's offset put the
  // edge an hour off whenever the reference fell on the far side of the change,
  // so the derived day — and the track's x-mapping built on it — would re-map
  // by an hour as a Slide scrub crossed the change under the pointer. (The paged
  // day had the same fault whenever "now" was past the change: its window and
  // every track marker sat an hour out. Measured 2026-09-30 over six DST days at
  // five-minute references: 1,560 of 2,016 off by an hour before, none after.)
  const dayStart = useMemo(() => {
    if (!point || !zone) return null;
    const offH = offsetHoursAt(zone, refMs);
    const wallMs = refMs + offH * 3_600_000;
    const wallMidnight = Math.floor(wallMs / MS_DAY) * MS_DAY;
    const guess = wallMidnight - offH * 3_600_000;
    return wallMidnight - offsetHoursAt(zone, guess) * 3_600_000;
  }, [point, zone, refMs]);
  // ...and its END, the next local midnight, by the same refine: a clock-change
  // day runs 23 or 25 hours, as the wall clock does, not 24.
  const dayEnd = useMemo(() => {
    if (!point || !zone) return null;
    const offH = offsetHoursAt(zone, refMs);
    const nextWallMidnight = Math.floor((refMs + offH * 3_600_000) / MS_DAY) * MS_DAY + MS_DAY;
    const guess = nextWallMidnight - offH * 3_600_000;
    return nextWallMidnight - offsetHoursAt(zone, guess) * 3_600_000;
  }, [point, zone, refMs]);

  // The day's sky, solved ONCE over the shown day widened by 12 hours each side,
  // every occurrence on its own motion (lib/astro/riseSet.ts): the rows are read
  // from that solve, and a track gets the whole of it — so a pairing across
  // midnight is visible from both days, and the rows and the track can't differ.
  const sky = useMemo<{ events: SkyEvent[]; days: BodyDayEvents[] }>(() => {
    if (!point || dayStart === null || dayEnd === null) return { events: [], days: [] };
    const bodies = [...visiblePlanets].sort((a, b) => planetRank(a) - planetRank(b));
    const startJd = msToJD(dayStart);
    const endJd = msToJD(dayEnd);
    const events = skyEventsBetween(startJd - 0.5, endJd + 0.5, point.lat, point.lng, bodies, nodeType);
    return { events, days: skyDayRows(events, bodies, startJd, endJd) };
    // ephemerisEpoch isn't read by the solve — it marks the deferred asteroid file
    // arriving, after the solve that asked for it had already run without it (so
    // Chiron … Vesta were missing from the shown day until it was paged away and
    // back; seen 2026-10-02).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point, dayStart, dayEnd, visiblePlanets, nodeType, ephemerisEpoch]);
  const days = sky.days;

  // PLANETARY HOURS: the shown day's, with its neighbours (the hour in force can
  // belong to either — a planetary day runs sunrise to sunrise). Built from the
  // Sun alone, so it shows whichever bodies are toggled; named for the shown
  // day's midday, the same noon the day label reads. Not computed at all while the
  // feature is HELD (lib/planetaryHoursHold.ts) — and with no planetary days there
  // is no chip, no hour to wake for, and nothing for the window to open on.
  const planetary = useMemo(() => {
    if (PLANETARY_HOURS_HELD || !point || !zone || dayStart === null) return null;
    return planetaryDaysAround(dayStart + MS_DAY / 2, point.lat, point.lng, zone);
  }, [point, zone, dayStart]);

  // The chip and its window read a LIVE instant — unlike the pager's nowMs, which is
  // frozen so the shown day can't slide at midnight: the hour in force changes about
  // hourly and has to be followed. While the Slide tool spins the sky they read the
  // slid instant instead (the instant a track's time cursor reads). They give the
  // hour in force while that instant is on the shown calendar day — the cursor's own
  // gate — OR inside the shown PLANETARY day, sunrise to sunrise: past midnight the
  // listed day's night hours are still running, and the one in force belongs marked
  // in the list that holds it.
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const instant = slideMs ?? liveNow;
  const onShownDay = dayStart !== null && instant >= dayStart && instant < dayStart + MS_DAY;
  const shownPlanetary = planetary?.shown;
  const inShownPlanetaryDay =
    !!shownPlanetary?.ok &&
    msToJD(instant) >= shownPlanetary.sunrise &&
    msToJD(instant) < shownPlanetary.nextSunrise;
  const phNow =
    planetary && (onShownDay || inShownPlanetaryDay) ? planetaryHourAt(planetary, instant) : null;

  // Wake at the next moment the reading can change: the end of the hour in force;
  // for an instant no hour covers (the night before a polar day's first sunrise),
  // the next sunrise that begins one; else the shown day's edges (when the present
  // enters or leaves it). While the window is open it also wakes on the minute, for
  // its "Now" clock — only then, so a closed window costs nothing. Clamped so a
  // missed wake — a suspended laptop — is caught within the hour; re-armed on every
  // liveNow, so a clamped wake that lands early simply sets the next.
  const sunriseAhead = (() => {
    if (!planetary || !phNow || phNow.ok) return null;
    const ahead = [planetary.shown, planetary.next]
      .filter((d): d is PlanetaryDay => d.ok)
      .map((d) => jdToMs(d.sunrise))
      .filter((ms) => ms > liveNow);
    return ahead.length ? Math.min(...ahead) : null;
  })();
  const baseWake =
    dayStart === null || PLANETARY_HOURS_HELD
      ? null
      : phNow?.ok
        ? jdToMs(phNow.hour.end)
        : (sunriseAhead ??
          (liveNow < dayStart ? dayStart : liveNow < dayStart + MS_DAY ? dayStart + MS_DAY : null));
  const nextMinute = (Math.floor(liveNow / 60_000) + 1) * 60_000;
  const wakeAt =
    slideMs != null || baseWake === null
      ? null
      : planetaryOpen && phNow?.ok
        ? Math.min(baseWake, nextMinute)
        : baseWake;
  useEffect(() => {
    if (wakeAt === null) return;
    const wait = Math.min(Math.max(wakeAt - Date.now() + 250, 1000), 3_600_000);
    const id = window.setTimeout(() => setLiveNow(Date.now()), wait);
    return () => window.clearTimeout(id);
  }, [wakeAt, liveNow]);
  // A tab brought back from the background re-reads at once rather than at the
  // next wake (timers are throttled while hidden). Nothing reads the live instant
  // while the feature is held, so nothing listens then either.
  useEffect(() => {
    if (PLANETARY_HOURS_HELD) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') setLiveNow(Date.now());
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // Wall-clock helpers (shared with the track through its context).
  const clock = (jd: number): string => {
    if (!zone) return '—';
    // Rounded to the millisecond: the ms → JD → ms round trip loses a few
    // hundredths of one, which the minute truncation below would otherwise turn
    // into a whole minute for an instant exactly on the minute ("Now 14:09" at
    // 14:10:00).
    const ms = Math.round(jdToMs(jd));
    const wall = new Date(ms + offsetHoursAt(zone, ms) * 3_600_000);
    return `${String(wall.getUTCHours()).padStart(2, '0')}:${String(wall.getUTCMinutes()).padStart(2, '0')}`;
  };
  const dayLabel = useMemo(() => {
    if (dayStart === null || !zone) return '';
    const noonMs = dayStart + MS_DAY / 2;
    const wall = new Date(noonMs + offsetHoursAt(zone, noonMs) * 3_600_000);
    // Phones abbreviate the month: the pager can't shrink, so a full "December"
    // would crush the place label beside it in the context row.
    const month = (phone ? fmt.monthAbbr : fmt.monthName)(wall.getUTCMonth() + 1);
    return `${wall.getUTCDate()} ${month} ${wall.getUTCFullYear()}`;
  }, [dayStart, zone, fmt, phone]);
  // An instant's wall-clock fraction of the shown day (the track's x-mapping).
  // Both ends use the offset AT THEIR OWN instant, so DST days place every
  // marker at its true local clock position.
  const frac = (jd: number): number => {
    if (dayStart === null || !zone) return -1;
    const ms = jdToMs(jd);
    const wallMs = ms + offsetHoursAt(zone, ms) * 3_600_000;
    const wallMidnight = dayStart + offsetHoursAt(zone, dayStart) * 3_600_000;
    return (wallMs - wallMidnight) / MS_DAY;
  };

  const kindLabel = (k: EventKind) => t(`skyTimes.col.${k}`);
  const bodyName = (p: PlanetName) => t(`planets.${p}.name`);
  // The colored body glyph, as the hover-tip PREFIX where the tip names a body.
  const tipGlyph = (p: PlanetName) => (
    <PlanetGlyph planet={p} size={14} color={PLANET_COLORS[p]} />
  );

  // A body's times for one moment of the day. Usually one; both when it genuinely
  // has two in the civil day (its own day is not 24 hours: a body culminating at
  // 00:01 culminates again at 23:57), and none — the dash — when it has none (the
  // Moon skips a culmination about once a month). Never one borrowed from the next
  // day: each is a crossing solved on its own.
  const timesText = (d: BodyDayEvents, k: EventKind): string =>
    d[k].length ? d[k].map(clock).join(' · ') : '—';

  // The Part of Fortune, while the map draws it — in the visible set (a zodiacal
  // frame; App's set drops it otherwise) AND drawn for this chart (fortuneOnMap:
  // Advanced on, a birth time, not a composite), the gate its lines read: an entry
  // with no times, whose tip says why. The Lot is built from the Ascendant, so it
  // has no rise or set of its own to time, and the solve has nothing to sample for
  // it. Without the entry it was simply missing here while the map drew its lines,
  // with nothing to say why (2026-10-02).
  const fortuneShown = fortuneOnMap && visiblePlanets.has('Fortune');
  const fortuneGlyph = <PlanetGlyph planet="Fortune" size={14} color={PLANET_COLORS.Fortune} />;

  // The per-body times card (the legend hover's hint).
  const timesCard = (d: BodyDayEvents): ReactNode => (
    <span className="sky-band-card">
      {KINDS.map((k) => (
        <span key={k} className="sky-band-card-row">
          <span className="sky-band-card-kind">{kindLabel(k)}</span>
          <span>{timesText(d, k)}</span>
        </span>
      ))}
      {d.circumpolar && (
        <span className="sky-band-card-note">
          {d.circumpolar === 'up' ? t('skyTimes.circumpolarUp') : t('skyTimes.circumpolarDown')}
        </span>
      )}
    </span>
  );

  // Verbose row: the same four moments as the hover card, laid out inline after the body so they
  // read without hovering. A circumpolar body has no rise/set, so it shows its all-day note
  // instead. The angle tags (AS / MC / DS / IC) match the card's labels.
  const inlineTimes = (d: BodyDayEvents): ReactNode =>
    d.circumpolar ? (
      <span className="sky-band-times sky-band-times-note">
        {d.circumpolar === 'up' ? t('skyTimes.circumpolarUp') : t('skyTimes.circumpolarDown')}
      </span>
    ) : (
      <span className="sky-band-times">
        {KINDS.map((k) => (
          <span key={k} className="sky-band-time">
            <span className="sky-band-time-kind">{kindLabel(k)}</span>
            <span>{timesText(d, k)}</span>
          </span>
        ))}
      </span>
    );

  // ── The planetary-hours chip: the glance, and the switch for the window ──
  // Three readings. An hour in force: the day ruler │ the hour ruler → its end. The
  // shown day away from the present: its ruler alone. Unavailable (polar day or
  // night): dimmed — the reason is in the window, never replaced by clock hours.
  // Every state opens the window: that is where the reason is read, too.
  const phChip = ((): ReactNode => {
    if (!planetary) return null;
    const shown = planetary.shown;
    // The hour in force when there is one on the shown day, else the shown day.
    const unavailable = phNow ? !phNow.ok : !shown.ok;
    let reading: { tip: ReactNode; aria: string; face: ReactNode };
    if (phNow?.ok) {
      const { day, hour } = phNow;
      const end = clock(hour.end);
      reading = {
        tip: (
          <span className="sky-band-tip">
            {tipGlyph(hour.ruler)}
            <span>{t('skyTimes.planetary.now', { hour: bodyName(hour.ruler), end })}</span>
          </span>
        ),
        aria: t('skyTimes.planetary.aria.now', {
          hour: bodyName(hour.ruler),
          end,
          day: bodyName(day.ruler),
        }),
        face: (
          <>
            <PlanetGlyph planet={day.ruler} size={13} color={PLANET_COLORS[day.ruler]} />
            <span className="sky-band-ph-sep" aria-hidden="true" />
            <PlanetGlyph planet={hour.ruler} size={13} color={PLANET_COLORS[hour.ruler]} />
            <span className="sky-band-ph-until">→ {end}</span>
          </>
        ),
      };
    } else if (unavailable || !shown.ok) {
      reading = {
        tip: t('skyTimes.planetary.unavailable'),
        aria: t('skyTimes.planetary.aria.unavailable'),
        face: (
          <>
            <PlanetGlyph planet="Sun" size={13} color={PLANET_COLORS.Sun} />
            <span className="sky-band-ph-until">—</span>
          </>
        ),
      };
    } else {
      const weekday = fmt.weekdayName(shown.date.weekday);
      reading = {
        tip: (
          <span className="sky-band-tip">
            {tipGlyph(shown.ruler)}
            <span>{t('skyTimes.planetary.day', { weekday, day: bodyName(shown.ruler) })}</span>
          </span>
        ),
        aria: t('skyTimes.planetary.aria.day', { weekday, day: bodyName(shown.ruler) }),
        face: <PlanetGlyph planet={shown.ruler} size={13} color={PLANET_COLORS[shown.ruler]} />,
      };
    }
    return (
      <TipButton
        type="button"
        className={`sky-band-planetary${planetaryOpen ? ' on' : ''}${unavailable ? ' is-unavailable' : ''}`}
        placement="top"
        aria-pressed={planetaryOpen}
        aria-label={reading.aria}
        tip={reading.tip}
        // The hint says what the window will hold — keyed on the listed day, which
        // is what the window's list is built from, not on the chip's own reading.
        hint={t(
          planetaryOpen
            ? 'skyTimes.planetary.chip.closeHint'
            : shown.ok
              ? 'skyTimes.planetary.chip.openHint'
              : 'skyTimes.planetary.chip.openHintNone',
        )}
        onClick={() => {
          // Re-read the present on the way in: the live instant only moves on its
          // wakes, and the window prints it.
          setLiveNow(Date.now());
          onTogglePlanetary();
        }}
      >
        {reading.face}
      </TipButton>
    );
  })();

  // The registered track (a downstream build's expandable center). The track ITSELF is
  // entitled-only; its TOGGLE also shows as a locked teaser for a user the build nudges
  // (trackNudge) — a click there explains in its tip instead of expanding.
  const trackExt = getSkyBandTrack();
  const trackAvailable = !!trackExt && isSkyBandTrackEntitled(trackExt);
  const trackNudge =
    !!trackExt && trackExt.tier === 'gated' && !trackAvailable && shouldShowNudge('gated');
  const trackVisible =
    trackAvailable && trackShown && !!point && !!zone && dayStart !== null && dayEnd !== null;
  const trackCtx: SkyBandTrackContext | null =
    trackVisible && point && zone && dayStart !== null && dayEnd !== null
      ? {
          point,
          zone,
          dayStart,
          dayEnd,
          days,
          events: sky.events,
          frac,
          clock,
          slideMs,
          slideTo,
          chartHasTime,
          minorParanBodies,
          openMinorBodies,
        }
      : null;

  // The two layouts only apply while no track shows — the expanded track draws
  // the times itself, and its legend is a 4-row glyph grid (hover for a body's
  // card). Without a track the legend always CARRIES the times: the inline
  // list by default, the speculum table when toggled.
  const inlineMode = !table && !trackVisible;
  const tableMode = table && !trackVisible;

  // Edge fades for the compact legend: with the times shown it easily runs wider than the space
  // before the context column. --fade-l/--fade-r (read by the mask in the CSS) cue that there's
  // more off either edge; 0 means that side is at its end. Re-measured on scroll, resize, and
  // whenever the row's content changes (day, planets, density).
  useEffect(() => {
    const el = legendRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const FADE = 24;
      el.style.setProperty('--fade-l', el.scrollLeft > 1 ? `${FADE}px` : '0px');
      el.style.setProperty('--fade-r', el.scrollLeft < max - 1 ? `${FADE}px` : '0px');
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [days, inlineMode, tableMode, trackVisible]);

  // Track the band's rendered width (viewport minus the open sidebar) → is-narrow.
  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    const update = () => setNarrow(el.clientWidth < 1000);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Mouse-wheel scrolling for the overflowing legend: a vertical wheel (the
  // common mouse) pans the row horizontally — the trackpad's own horizontal
  // delta wins when it's the larger axis. Nothing else reacts to a wheel over
  // the band, so no preventDefault is needed (which also keeps React's passive
  // listener happy). The scrollbar itself stays hidden; the edge fades cue the
  // overflow.
  const onLegendWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    const el = legendRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (d !== 0) el.scrollLeft += d;
  };

  // Mouse drag-to-scroll (touch / pen keep native scrolling). A small movement threshold lets a
  // plain click / hover through untouched; once it's really a drag we capture the pointer and mute
  // the bodies (via the is-dragging class) so no stray hover fires mid-drag.
  const onLegendPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || trackVisible) return; // mouse only, and only the compact row
    const el = legendRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    dragRef.current = { startX: e.clientX, startScroll: el.scrollLeft, active: false };
  };
  const onLegendPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = legendRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.startX;
    if (!d.active) {
      if (Math.abs(dx) < 5) return;
      d.active = true;
      el.classList.add('is-dragging');
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = d.startScroll - dx;
  };
  const onLegendPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = legendRef.current;
    dragRef.current = null;
    if (d?.active && el) {
      el.classList.remove('is-dragging');
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    }
  };

  // The speculum table: the four angle moments as ROWS — the same order as the
  // hover card — with one column per body. Each body's glyph sits BESIDE its
  // column, spanning all four rows (no header row, so the band stays low); a
  // full-height rule on the glyph's LEFT opens each body's group, so a glyph and
  // its own four times read together between one rule and the next (a rule on
  // its right had cut every glyph off from its times and bound it to the
  // previous body's instead). Rendered
  // inside the legend element, so the scroll / drag / edge-fade machinery
  // applies unchanged; the grid aligns the times into true columns.
  const tableGrid = (
    <>
      {KINDS.map((k) => (
        <TipSpan
          key={k}
          className="sky-band-tbl-kind"
          placement="top"
          tapReveal
          tip={t(`skyTimes.colHint.${k}`)}
        >
          {kindLabel(k)}
        </TipSpan>
      ))}
      {days.map((d) => {
        const dim = d.circumpolar === 'down';
        // A circumpolar body's cells explain themselves in the tip's hint line.
        const note = d.circumpolar
          ? t(d.circumpolar === 'up' ? 'skyTimes.circumpolarUp' : 'skyTimes.circumpolarDown')
          : undefined;
        return (
          <Fragment key={d.body}>
            {/* The glyph column is identification only — each TIME cell carries
                its own hover tip (glyph · body · angle · time, the clock
                markers' format), so nothing lights the whole column. */}
            <span className={`sky-band-tbl-body${dim ? ' is-dim' : ''}`}>
              <PlanetGlyph planet={d.body} size={14} color={PLANET_COLORS[d.body]} />
            </span>
            {KINDS.map((k) => {
              const time = timesText(d, k);
              return (
                <TipSpan
                  key={k}
                  className={`sky-band-tbl-cell${dim ? ' is-dim' : ''}`}
                  placement="top"
                  tapReveal
                  tip={
                    <span className="sky-band-tip">
                      {tipGlyph(d.body)}
                      <span>
                        {bodyName(d.body)} · {kindLabel(k)} · {time}
                      </span>
                    </span>
                  }
                  hint={note}
                >
                  {time}
                </TipSpan>
              );
            })}
          </Fragment>
        );
      })}
      {fortuneShown && (
        <Fragment key="Fortune">
          <span className="sky-band-tbl-body">{fortuneGlyph}</span>
          {KINDS.map((k) => (
            <TipSpan
              key={k}
              className="sky-band-tbl-cell"
              placement="top"
              tapReveal
              tip={
                <span className="sky-band-tip">
                  {tipGlyph('Fortune')}
                  <span>
                    {bodyName('Fortune')} · {kindLabel(k)} · —
                  </span>
                </span>
              }
              hint={t('skyTimes.fortuneNote')}
            >
              —
            </TipSpan>
          ))}
        </Fragment>
      )}
    </>
  );

  return (
    <div
      ref={bandRef}
      className={`sky-band${trackVisible ? '' : tableMode ? ' is-table' : ' is-compact'}${inlineMode ? ' is-verbose' : ''}${phone ? ' is-phone' : ''}${narrow ? ' is-narrow' : ''}`}
      role="region"
      aria-label={t('skyTimes.title')}
    >
      {!point ? (
        <div className="sky-band-empty">
          <span>{t('skyTimes.noPlace')}</span>
        </div>
      ) : (
        <>
          {/* LEFTMOST — Table toggle: the legend's inline times list (the
              default) laid out as the speculum table instead. Only in the
              compact row; the expanded track shows the times itself. */}
          {!trackVisible && days.length > 0 && (
            <TipButton
              type="button"
              className={`sky-band-detail-toggle${table ? ' on' : ''}`}
              placement="top"
              aria-pressed={table}
              tip={t(table ? 'skyTimes.detail.tipHide' : 'skyTimes.detail.tipShow')}
              hint={t('skyTimes.detail.hint')}
              onClick={onToggleTable}
            >
              <EyeIcon open={table} className="sky-band-track-eye" size={13} />
              <span>{t('skyTimes.detail.label')}</span>
            </TipButton>
          )}

          {/* The planetary-hours chip — outside the legend's scroll container,
              so it never scrolls away, fades or starts a drag. */}
          {phChip}

          {/* LEFT — the body legend: glyph + name (hover = the four-times card), with the times
              listed inline or laid out as the table when the density toggle says so. Scrolls /
              drags when it runs wider than the space before the context column, its edges fading
              to cue that. */}
          <div
            ref={legendRef}
            className="sky-band-legend"
            onWheel={onLegendWheel}
            onPointerDown={onLegendPointerDown}
            onPointerMove={onLegendPointerMove}
            onPointerUp={onLegendPointerEnd}
            onPointerCancel={onLegendPointerEnd}
          >
            {tableMode ? (
              tableGrid
            ) : (
              <>
                {days.map((d) => (
                  <TipSpan
                    key={d.body}
                    className={`sky-band-body${d.circumpolar === 'down' ? ' is-dim' : ''}`}
                    placement="top"
                    tapReveal
                    tip={
                      <span className="sky-band-tip">
                        {tipGlyph(d.body)}
                        <span>{bodyName(d.body)}</span>
                      </span>
                    }
                    hint={inlineMode ? undefined : timesCard(d)}
                  >
                    <PlanetGlyph planet={d.body} size={14} color={PLANET_COLORS[d.body]} />
                    <span className="sky-band-body-name">{bodyName(d.body)}</span>
                    {inlineMode && inlineTimes(d)}
                  </TipSpan>
                ))}
                {fortuneShown && (
                  <TipSpan
                    key="Fortune"
                    className="sky-band-body"
                    placement="top"
                    tapReveal
                    tip={
                      <span className="sky-band-tip">
                        {tipGlyph('Fortune')}
                        <span>{bodyName('Fortune')}</span>
                      </span>
                    }
                    hint={t('skyTimes.fortuneNote')}
                  >
                    {fortuneGlyph}
                    <span className="sky-band-body-name">{bodyName('Fortune')}</span>
                  </TipSpan>
                )}
              </>
            )}
          </div>

          {/* CENTER — the registered track, while expanded. */}
          {trackCtx && trackExt && (
            <div className="sky-band-center">{trackExt.render(trackCtx)}</div>
          )}

          {/* RIGHT — the context column: place, day pager, zone, track toggle.
              (The close ✕ sits outside, on the band's far right edge.) */}
          <div className="sky-band-side">
            {placeLabel && (
              <div className="sky-band-side-row">
                <span className="sky-band-place">{placeLabel}</span>
              </div>
            )}
            {/* The day pager. While Slide is armed the shown day is the slid one
                (see dayStart), so these controls DRIVE Slide instead of paging —
                ‹ › turn the sky a whole day, Today turns it to the present, the
                picker to the chosen date — and each says so on its tip, since
                what moves is the map, not just this band (rule 3: the trigger
                discloses). The readout wears the accent while it follows Slide:
                the visible half of the hold, which lifts when Slide closes and
                hands back the reader's own paged day untouched. */}
            <div className="sky-band-side-row">
              {sliding && slideBy ? (
                <TipButton
                  type="button"
                  className="sky-band-day-btn"
                  placement="top"
                  aria-label={t('skyTimes.slide.prevTip')}
                  tip={t('skyTimes.slide.prevTip')}
                  hint={t('skyTimes.slide.stepHint')}
                  onClick={() => slideBy(-1)}
                >
                  ‹
                </TipButton>
              ) : (
                <button
                  type="button"
                  className="sky-band-day-btn"
                  aria-label={t('skyTimes.prevDay')}
                  onClick={() => setDayOffset((d) => d - 1)}
                >
                  ‹
                </button>
              )}
              <TipButton
                type="button"
                className={`sky-band-day-btn sky-band-day${sliding ? ' is-slid' : ''}`}
                placement="top"
                tip={t(sliding ? 'skyTimes.slide.pickTip' : 'skyTimes.pickDate')}
                hint={t(sliding ? 'skyTimes.slide.pickHint' : 'skyTimes.pickDateHint')}
                onClick={() => setPickerOpen(true)}
              >
                {dayLabel}
              </TipButton>
              {sliding && slideBy ? (
                <TipButton
                  type="button"
                  className="sky-band-day-btn"
                  placement="top"
                  aria-label={t('skyTimes.slide.nextTip')}
                  tip={t('skyTimes.slide.nextTip')}
                  hint={t('skyTimes.slide.stepHint')}
                  onClick={() => slideBy(1)}
                >
                  ›
                </TipButton>
              ) : (
                <button
                  type="button"
                  className="sky-band-day-btn"
                  aria-label={t('skyTimes.nextDay')}
                  onClick={() => setDayOffset((d) => d + 1)}
                >
                  ›
                </button>
              )}
              {/* Today is always offered; it just greys out while already on it.
                  Under Slide it turns the sky to the present MOMENT, which the
                  slid instant is never exactly on — so it stays live there. */}
              {sliding && slideTo ? (
                <TipButton
                  type="button"
                  className="sky-band-day-btn sky-band-today"
                  placement="top"
                  tip={t('skyTimes.slide.todayTip')}
                  hint={t('skyTimes.slide.todayHint')}
                  onClick={() => slideTo(Date.now())}
                >
                  {t('skyTimes.today')}
                </TipButton>
              ) : (
                <button
                  type="button"
                  className="sky-band-day-btn sky-band-today"
                  disabled={dayOffset === 0}
                  onClick={() => setDayOffset(0)}
                >
                  {t('skyTimes.today')}
                </button>
              )}
            </div>
            <div className="sky-band-side-row">
              {/* The zone is information, not an action — a clock icon + plain
                  text with a hover note. */}
              {zone && (
                <TipSpan
                  className="sky-band-zone"
                  placement="top"
                  tapReveal
                  tip={t('skyTimes.zoneNote', { zone })}
                >
                  <ClockIcon className="sky-band-zone-icon" size={12} />
                  <span>{zone.split('/').pop()?.replace(/_/g, ' ') ?? zone}</span>
                </TipSpan>
              )}
              {/* "Time Stamp": read the sky at a chosen spot, marked by the map beacon.
                  Desktop reads live under the cursor and a click parks it; on touch there's
                  no cursor, so a tap places (and moves) the stamp — the held half only. */}
              <TipButton
                type="button"
                className={`sky-band-follow-toggle${follow !== 'off' ? ' on' : ''}${
                  follow === 'held' ? ' is-held' : ''
                }`}
                placement="top"
                aria-pressed={follow !== 'off'}
                tip={t(follow === 'off' ? 'skyTimes.follow.tipOn' : 'skyTimes.follow.tipOff')}
                hint={t(
                  phone
                    ? 'skyTimes.follow.hintTouch'
                    : follow === 'held'
                      ? 'skyTimes.follow.hintHeld'
                      : 'skyTimes.follow.hint',
                )}
                onClick={onToggleFollow}
              >
                <ClickIcon className="sky-band-follow-cursor" />
                <span>{t('skyTimes.follow.label')}</span>
              </TipButton>
              {/* The track's eye-toggle: for an entitled user it expands the track; for a
                  nudged (un-entitled) user it's a locked teaser — shown off, gated-tagged,
                  and a click or tap shows why in its tip instead of expanding. It does NOT
                  open the account flow: it's a switch in a band the reader is reading, and
                  a tap on a switch that won't flip asks why, not for the plans
                  (TipButton's `locked`; seam L73, 2026-10-01). A gated track carries the
                  gated-tier tag in its hover tip either way. */}
              {(trackAvailable || trackNudge) && trackExt && (
                <TipButton
                  type="button"
                  className={`sky-band-track-toggle${trackShown ? ' on' : ''}${
                    trackNudge ? ' locked' : ''
                  }${trackExt.tier === 'gated' ? ' gated' : ''}`}
                  placement="top"
                  aria-pressed={trackNudge ? undefined : trackShown}
                  gated={trackExt.tier === 'gated'}
                  tip={trackExt.label}
                  hint={trackShown ? trackExt.onHint : trackExt.offHint}
                  // trackNudge already implies the gated rung (see its definition). The
                  // reason names the track by its own label (e.g. "Paran Clock is a Pro
                  // feature.").
                  locked={trackNudge ? { tier: 'gated', feature: trackExt.label } : undefined}
                  onClick={onToggleTrack}
                >
                  <EyeIcon open={trackShown} className="sky-band-track-eye" size={13} />
                  <span>{trackExt.label}</span>
                </TipButton>
              )}
            </div>
          </div>

          {/* The shared moment picker (no native calendar widget), in its
              date-only dress — the band is a day instrument, so the time boxes
              would only confuse. Seeded to the shown day's local noon; the
              chosen instant maps back to a whole-day pager offset in the
              point's own zone (per-instant offsets, so distant DST states
              self-correct). Under Slide the chosen DATE is applied to the slid
              instant instead: the same local time of day, on that date, in the
              point's zone — the picker moves the sky by whole days, as ‹ › do,
              rather than snapping it to the seed's noon. Read at apply time, so
              a Slide that closed while the picker was open pages as usual. */}
          {pickerOpen && zone && dayStart !== null && (
            <TimelineDateModal
              valueMs={dayStart + MS_DAY / 2}
              offsetMs={offsetHoursAt(zone, dayStart + MS_DAY / 2) * 3_600_000}
              zoneLabel={zoneLabelAt(zone, dayStart + MS_DAY / 2)}
              yearMin={BIRTH_YEAR_MIN}
              yearMax={BIRTH_YEAR_MAX}
              dateOnly
              title={t(sliding ? 'skyTimes.slide.pickTip' : 'skyTimes.pickDate')}
              onApply={(ms) => {
                const wallDay = (v: number) =>
                  Math.floor((v + offsetHoursAt(zone, v) * 3_600_000) / MS_DAY);
                if (slideMs != null && slideTo) {
                  const slidWall = slideMs + offsetHoursAt(zone, slideMs) * 3_600_000;
                  const timeOfDay = slidWall - Math.floor(slidWall / MS_DAY) * MS_DAY;
                  const wall = wallDay(ms) * MS_DAY + timeOfDay;
                  // Wall → UT by the offset in force on the chosen date (one
                  // refine pass, as the track's msAtX does).
                  const guess = wall - offsetHoursAt(zone, slideMs) * 3_600_000;
                  slideTo(wall - offsetHoursAt(zone, guess) * 3_600_000);
                  return;
                }
                setDayOffset(wallDay(ms) - wallDay(nowMs));
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </>
      )}

      {/* Close ✕ — always the band's far-right edge (both states, compact or
          expanded), vertically centred. */}
      <button
        type="button"
        className="sky-band-close"
        aria-label={t('skyTimes.closeAria')}
        onClick={onClose}
      >
        ×
      </button>

      {/* The Planetary hours window — this band's module. Rendered here, not by App,
          because the hours it lists are this band's own computation (the same
          instant and day the chip reads); it portals itself out of the band's
          stacking layer. Outside the place/no-place branch, so losing the point
          empties the window rather than making it vanish and reappear. */}
      {planetaryOpen && !PLANETARY_HOURS_HELD && (
        <PlanetaryHoursHud
          days={planetary}
          now={phNow}
          instantMs={instant}
          sliding={slideMs != null}
          hasPoint={!!point}
          placeLabel={placeLabel}
          dayLabel={dayLabel}
          clock={clock}
          onClose={onTogglePlanetary}
        />
      )}
    </div>
  );
}
