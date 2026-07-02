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
// that place's own clock) and the context column on the right (place, day pager
// ‹ › + Today, zone, close). A downstream build may register an expandable
// TRACK for the center (lib/extensions/skyBandTrack.ts) — its eye-toggle shows
// here only when registered AND entitled (no teaser), tagged with the gated
// tier in its hover tip. Chart-time-INDEPENDENT: the band reads the sky of the
// chosen DAY, so it works even for unknown-birth-time charts.
import { useMemo, useState, type ReactNode } from 'react';
import { PLANET_COLORS, type NodeType, type PlanetName } from '../../lib/ephemeris';
import { dailySkyEvents, type BodyDayEvents, type EventKind } from '../../lib/astro/riseSet';
import {
  getSkyBandTrack,
  isSkyBandTrackEntitled,
  type SkyBandTrackContext,
} from '../../lib/extensions/skyBandTrack';
import { getIanaTimezone, offsetHoursAt, zoneLabelAt } from '../../lib/atlas/timezone';
import { planetRank } from '../../lib/astro/format';
import { useT } from '../../i18n';
import { TipButton, TipSpan } from '../ui/HoverTip';
import { EyeIcon } from '../ui/EyeIcon';
import { ClockIcon } from '../ui/ClockIcon';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { TimelineDateModal } from '../TimelineDateModal/TimelineDateModal';
import { BIRTH_YEAR_MIN, BIRTH_YEAR_MAX } from '../DateTimeFields/DateTimeFields';
import './SkyBand.css';

/** The compact band's reserved height (px). App feeds the ACTIVE height to
 *  <Map bottomInset> and the bottom-dock registry: this while the row is
 *  compact, the registered track's own `height` while it shows. */
export const SKY_BAND_H_COMPACT = 28;

const MS_DAY = 86_400_000;
// Unix epoch ms → Julian Day (UT).
const msToJD = (ms: number) => ms / MS_DAY + 2440587.5;
const jdToMs = (jd: number) => (jd - 2440587.5) * MS_DAY;

/** The four angle moments in the legend card's order (matches the old table). */
const KINDS: EventKind[] = ['rise', 'culminate', 'set', 'anticulminate'];

interface SkyBandProps {
  /** The instrument point: the placed pin, else the active chart's birthplace. */
  point: { lat: number; lng: number } | null;
  placeLabel: string | null;
  visiblePlanets: Set<PlanetName>;
  nodeType: NodeType;
  /** Whether the registered track (if any, and entitled) is expanded. Owned by
   *  App — the map's bottomInset must follow the band's height. */
  trackShown: boolean;
  onToggleTrack: () => void;
  /** The Slide tool's slid instant (epoch ms UT) while it spins the sky — handed
   *  to the track so its time cursor can follow the spin. Null = idle. */
  slideMs?: number | null;
  onClose: () => void;
}

export function SkyBand({
  point,
  placeLabel,
  visiblePlanets,
  nodeType,
  trackShown,
  onToggleTrack,
  slideMs = null,
  onClose,
}: SkyBandProps) {
  const { t, fmt } = useT();
  // Day pager: offset from "today", anchored once per mount so the band doesn't
  // slide under the reader at local midnight.
  const [dayOffset, setDayOffset] = useState(0);
  const [nowMs] = useState(() => Date.now());
  // The day readout doubles as a button opening the shared moment picker (the
  // same editor the timeline bar and My Charts use), for jumps the ‹ › pager
  // can't reasonably make — decades into the past or future.
  const [pickerOpen, setPickerOpen] = useState(false);

  // The place's own zone — the whole band reads in LOCAL time there.
  const zone = useMemo(
    () => (point ? getIanaTimezone(point.lat, point.lng) : null),
    [point],
  );

  // Local midnight (start of the shown day) as a UT instant: shift to wall
  // clock, floor to the wall-clock day, shift back. A DST jump inside the day
  // moves one edge by an hour — fine for a daily instrument.
  const dayStart = useMemo(() => {
    if (!point || !zone) return null;
    const refMs = nowMs + dayOffset * MS_DAY;
    const offH = offsetHoursAt(zone, refMs);
    const wallMs = refMs + offH * 3_600_000;
    const wallMidnight = Math.floor(wallMs / MS_DAY) * MS_DAY;
    return wallMidnight - offH * 3_600_000;
  }, [point, zone, nowMs, dayOffset]);

  const days = useMemo<BodyDayEvents[]>(() => {
    if (!point || dayStart === null) return [];
    const bodies = [...visiblePlanets].sort((a, b) => planetRank(a) - planetRank(b));
    return dailySkyEvents(msToJD(dayStart), point.lat, point.lng, bodies, nodeType);
  }, [point, dayStart, visiblePlanets, nodeType]);

  // Wall-clock helpers (shared with the track through its context).
  const clock = (jd: number): string => {
    if (!zone) return '—';
    const ms = jdToMs(jd);
    const wall = new Date(ms + offsetHoursAt(zone, ms) * 3_600_000);
    return `${String(wall.getUTCHours()).padStart(2, '0')}:${String(wall.getUTCMinutes()).padStart(2, '0')}`;
  };
  const dayLabel = useMemo(() => {
    if (dayStart === null || !zone) return '';
    const noonMs = dayStart + MS_DAY / 2;
    const wall = new Date(noonMs + offsetHoursAt(zone, noonMs) * 3_600_000);
    return `${wall.getUTCDate()} ${fmt.monthName(wall.getUTCMonth() + 1)} ${wall.getUTCFullYear()}`;
  }, [dayStart, zone, fmt]);
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

  // The per-body times card (the legend hover's hint).
  const timesCard = (d: BodyDayEvents): ReactNode => (
    <span className="sky-band-card">
      {KINDS.map((k) => {
        const jd =
          k === 'rise' ? d.rise : k === 'set' ? d.set : k === 'culminate' ? d.culminate : d.anticulminate;
        return (
          <span key={k} className="sky-band-card-row">
            <span className="sky-band-card-kind">{kindLabel(k)}</span>
            <span>{jd !== null ? clock(jd) : '—'}</span>
          </span>
        );
      })}
      {d.circumpolar && (
        <span className="sky-band-card-note">
          {d.circumpolar === 'up' ? t('skyTimes.circumpolarUp') : t('skyTimes.circumpolarDown')}
        </span>
      )}
    </span>
  );

  // The registered track (a downstream build's expandable center), entitled-only
  // — NO teaser: without entitlement neither the track nor its toggle exists.
  const trackExt = getSkyBandTrack();
  const trackAvailable = !!trackExt && isSkyBandTrackEntitled(trackExt);
  const trackVisible = trackAvailable && trackShown && !!point && !!zone && dayStart !== null;
  const trackCtx: SkyBandTrackContext | null =
    trackVisible && point && zone && dayStart !== null
      ? { point, zone, dayStart, days, frac, clock, slideMs }
      : null;

  return (
    <div
      className={`sky-band${trackVisible ? '' : ' is-compact'}`}
      role="region"
      aria-label={t('skyTimes.title')}
    >
      {!point ? (
        <div className="sky-band-empty">
          <span>{t('skyTimes.noPlace')}</span>
        </div>
      ) : (
        <>
          {/* LEFT — the body legend: glyph + name; hover = glyph + name headline
              over the four-times card. */}
          <div className="sky-band-legend">
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
                hint={timesCard(d)}
              >
                <PlanetGlyph planet={d.body} size={14} color={PLANET_COLORS[d.body]} />
                <span className="sky-band-body-name">{bodyName(d.body)}</span>
              </TipSpan>
            ))}
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
            <div className="sky-band-side-row">
              <button
                type="button"
                className="sky-band-day-btn"
                aria-label={t('skyTimes.prevDay')}
                onClick={() => setDayOffset((d) => d - 1)}
              >
                ‹
              </button>
              <TipButton
                type="button"
                className="sky-band-day-btn sky-band-day"
                placement="top"
                tip={t('skyTimes.pickDate')}
                hint={t('skyTimes.pickDateHint')}
                onClick={() => setPickerOpen(true)}
              >
                {dayLabel}
              </TipButton>
              <button
                type="button"
                className="sky-band-day-btn"
                aria-label={t('skyTimes.nextDay')}
                onClick={() => setDayOffset((d) => d + 1)}
              >
                ›
              </button>
              {/* Today is always offered; it just greys out while already on it. */}
              <button
                type="button"
                className="sky-band-day-btn sky-band-today"
                disabled={dayOffset === 0}
                onClick={() => setDayOffset(0)}
              >
                {t('skyTimes.today')}
              </button>
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
              {/* The track's eye-toggle (only when a track is registered AND
                  entitled — no teaser); a gated track carries the gated-tier
                  tag in its hover tip. */}
              {trackAvailable && trackExt && (
                <TipButton
                  type="button"
                  className={`sky-band-track-toggle${trackShown ? ' on' : ''}`}
                  placement="top"
                  aria-pressed={trackShown}
                  gated={trackExt.tier === 'gated'}
                  tip={trackExt.label}
                  hint={trackShown ? trackExt.onHint : trackExt.offHint}
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
              self-correct). */}
          {pickerOpen && zone && dayStart !== null && (
            <TimelineDateModal
              valueMs={dayStart + MS_DAY / 2}
              offsetMs={offsetHoursAt(zone, dayStart + MS_DAY / 2) * 3_600_000}
              zoneLabel={zoneLabelAt(zone, dayStart + MS_DAY / 2)}
              yearMin={BIRTH_YEAR_MIN}
              yearMax={BIRTH_YEAR_MAX}
              dateOnly
              title={t('skyTimes.pickDate')}
              onApply={(ms) => {
                const wallDay = (v: number) =>
                  Math.floor((v + offsetHoursAt(zone, v) * 3_600_000) / MS_DAY);
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
    </div>
  );
}
