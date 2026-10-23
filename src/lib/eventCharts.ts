// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Event charts and "No chart", as plain functions (2026-10-20).
//
// Lina's 20 October reply (§7.2) asked for event charts the app casts itself — an
// ingress, a lunation, a moment — living in the library beside the people. Salvatore's
// design pass put them in the chart menu as their own section, with a fixed "No chart ·
// the sky alone" row above both, so a geodetic reader can work on the world's charts
// without a person's frame in force (§6 of the same reply).
//
// Everything here is BEHIND THE GEODETIC HOLD (lib/geodeticHold GEODETIC_HELD), and the
// hold is a standing state, so it derives and never writes (CLAUDE.md rule 2):
//
//   · a chart's KIND is a fact on the record (StoredChart.kind); while held it is merely
//     PRESENTED as a person (presentedKind), so the record still says 'event' when the
//     hold lifts;
//   · "No chart" is a stored selection (NO_CHART_ID in the current-id key); while held it
//     is masked to the first chart (resolveSelection), and the persist effect keeps
//     writing the sentinel (selectionToPersist), never the chart standing in for it.
//
// The hold is a PARAMETER of every function below rather than read here, so the suite
// can drive both states — the app passes GEODETIC_HELD, read once at module load like
// the derived line system.
//
// Pure: no React, no storage, no ephemeris — scripts/verify-event-charts drives the same
// functions the dropdown, the Tab swap, My Charts and App's selection run.

import type { Formatters, TFn } from '../i18n';
import { SEED_BIRTHS } from './birthData';
import type { LineSystem } from './ephemeris';
import {
  chartRecency,
  NO_CHART_ID,
  recentShortlist,
  SEED_CHART_ID_PREFIX,
  type StoredChart,
} from './chartLibrary';

// ── Kinds ───────────────────────────────────────────────────────────────────

/** What a chart's moment is: a person's birth or an event's. */
export type ChartKindOf = 'person' | 'event';

/** The kind the record STATES (absent → a person). */
export function storedKind(c: { kind?: 'event' } | null | undefined): ChartKindOf {
  return c?.kind === 'event' ? 'event' : 'person';
}

/** The kind the app SHOWS: the stored one, or a person while the hold is up. Every
 *  surface that marks or sorts by kind reads this; nothing writes it back. */
export function presentedKind(c: { kind?: 'event' } | null | undefined, held: boolean): ChartKindOf {
  return held ? 'person' : storedKind(c);
}

/** The kind the chart form opens on. A record being edited keeps its OWN — on a held
 *  device too, where the switch isn't shown, so an event edited there is saved as an
 *  event. A new chart takes the caller's derived default while event charts are on
 *  offer, and is a person otherwise: a held device never makes an event. */
export function formOpeningKind(
  initial: { kind?: 'event' } | null | undefined,
  eventsOn: boolean,
  defaultKind: ChartKindOf,
): ChartKindOf {
  return initial ? storedKind(initial) : eventsOn ? defaultKind : 'person';
}

/** What the form writes for a kind: only 'event' is ever stored, so a person's record
 *  carries no `kind` at all (StoredChart.kind says why). */
export function kindField(kind: ChartKindOf): 'event' | undefined {
  return kind === 'event' ? 'event' : undefined;
}

// ── The chart menu's sections ───────────────────────────────────────────────

/** Rows per section: two lists fit where the one list of five did. */
export const SECTION_COUNT = 4;

export interface SwitcherSections {
  /** Which section comes first: Events on a geodetic map, where the world's charts are
   *  the work, People everywhere else. Follows the DERIVED line system and is never
   *  stored, so a masked Geodetic choice orders the menu as the map it draws. */
  order: readonly [ChartKindOf, ChartKindOf];
  event: StoredChart[];
  person: StoredChart[];
}

/**
 * The menu's two lists, or null while the hold is up — meaning today's single list,
 * exactly (recentShortlist with its five).
 *
 * Each section keeps the shortlist's folder scoping (chartLibrary recentShortlist says
 * why: the menu opens in front of whoever is beside you). Its ANCHOR is the active chart
 * when that is of the section's kind, and otherwise the most recently used chart of the
 * kind. So while the reader works through mundane charts, the People section still shows
 * the folder of the last person they opened — Salvatore's call (2026-10-20), and a
 * deliberate one: it is a name from another session on screen beside the event work.
 * Discreet mode masks it with everything else in the menu, which is the answer for a
 * reader with somebody looking over their shoulder.
 */
export function switcherSections(
  charts: readonly StoredChart[],
  current: StoredChart | null,
  lineSystem: LineSystem,
  held: boolean,
): SwitcherSections | null {
  if (held) return null;
  const list = (kind: ChartKindOf): StoredChart[] => {
    const ofKind = charts.filter((c) => storedKind(c) === kind);
    const anchor =
      current && storedKind(current) === kind
        ? current
        : (ofKind.reduce<StoredChart | null>(
            (best, c) => (best === null || chartRecency(c) > chartRecency(best) ? c : best),
            null,
          ) ?? null);
    return recentShortlist(ofKind, anchor, SECTION_COUNT);
  };
  return {
    order: lineSystem === 'geodetic' ? ['event', 'person'] : ['person', 'event'],
    event: list('event'),
    person: list('person'),
  };
}

/**
 * The charts the Tab swap cycles through: the most recently used across the WHOLE library,
 * whatever folder each is filed in (Salvatore, 2026-10-23: Tab is "the charts I was just in",
 * and a folder boundary broke that). Only the menu a click opens keeps to the active chart's
 * folder (chartLibrary recentShortlist says why). The flash Tab opens draws THIS list, frozen
 * (ChartSwitcher's `flash.ids`), so it still shows exactly what is being cycled.
 *
 * Held: the five most recent. Unlocked: the four most recent of the active chart's own kind,
 * Events or People, since the flash is drawn in that section. With No chart there is no
 * section to cycle, so the list is empty and Tab stays Tab.
 */
export function tabCycleIds(
  charts: readonly StoredChart[],
  current: StoredChart | null,
  held: boolean,
): string[] {
  if (held) return recentShortlist(charts, null).map((c) => c.id);
  if (!current) return [];
  const kind = storedKind(current);
  return recentShortlist(
    charts.filter((c) => storedKind(c) === kind),
    null,
    SECTION_COUNT,
  ).map((c) => c.id);
}

// ── The selection ───────────────────────────────────────────────────────────

export interface Selection {
  /** The chart in force: the stored id's, else the first, else none — and none while
   *  "No chart" is picked on an unlocked device. */
  storedCurrent: StoredChart | null;
  /** "No chart" is the reader's pick AND in force (false while the hold masks it). */
  noChartPicked: boolean;
}

/** App's selection from the stored current id (the PREF). The sentinel reads as the
 *  first chart while held, so a held device behaves exactly as before No chart existed;
 *  any other id that has gone missing repairs to the first chart, as it always has. */
export function resolveSelection(
  charts: readonly StoredChart[],
  currentId: string | null,
  held: boolean,
): Selection {
  if (currentId === NO_CHART_ID && !held) return { storedCurrent: null, noChartPicked: true };
  return {
    storedCurrent: (currentId === NO_CHART_ID ? null : charts.find((c) => c.id === currentId)) ?? charts[0] ?? null,
    noChartPicked: false,
  };
}

/**
 * What the persist effect writes: the sentinel whenever it is the stored pick — held or
 * not — and otherwise the id of the chart in force (which repairs a stale id).
 *
 * This is the line rule 2 is about. Writing `current?.id` here, as the effect did before
 * No chart existed, would write the chart the hold puts in the sentinel's place and
 * destroy the reader's pick, visible only after the hold lifts.
 */
export function selectionToPersist(currentId: string | null, current: StoredChart | null): string | null {
  return currentId === NO_CHART_ID ? NO_CHART_ID : (current?.id ?? null);
}

// ── The example event ───────────────────────────────────────────────────────

/** Deterministic, like the person example's (chartLibrary SEED_CHART_ID_PREFIX says why). */
export const EXAMPLE_EVENT_ID = `${SEED_CHART_ID_PREFIX}aries_ingress_2027`;

/** The March 2027 equinox: the Sun's apparent geocentric longitude reaches 0° Aries at
 *  20 Mar 2027 20:24:41.72 UT (measured against the shipped ephemeris). verify-event-charts
 *  bisects the Sun through 0° and requires this within a second. */
export const EXAMPLE_EVENT_EXACT_UT_MS = Date.UTC(2027, 2, 20, 20, 24, 41, 720);

/** The minute the example is cast for: the ingress rounded UP, so the chart shows the Sun
 *  at 0° Aries rather than at 29°59′ Pisces — the rule every found ingress follows. */
export const EXAMPLE_EVENT_CHART_UT_MS = Date.UTC(2027, 2, 20, 20, 25);

/** The example's name and folder: English data, like "Jim Lewis" — a record's name is
 *  the reader's own once it is in their library. The name is also what the finder
 *  suggests for the same ingress ("{sign} Ingress {year}"). */
export const EXAMPLE_EVENT_NAME = 'Aries Ingress 2027';
export const EXAMPLE_EVENT_FOLDER = 'Mundane/Ingresses';

/**
 * The example event chart: Aries Ingress 2027, cast for Greenwich (Salvatore, 2026-10-20; the
 * 2026 ingress until 2026-10-23, when it had passed — a seeded copy of that one keeps its id
 * and stays the reader's chart).
 *
 * Shaped exactly as the chart form would save it from a found ingress on Automatic:
 * GMT applies (British Summer Time begins on 28 March), so the offset is 0 and the zone
 * is the place's own, detected rather than stated. The place is the one Greenwich every
 * search finds, the bundled atlas's row on the Prime Meridian at exactly 51°29′00″N 0°00′00″
 * (Lina, 23 Oct 2026, G-1), with the label that search gives it.
 */
export function exampleEventChart(createdAt: number): StoredChart {
  const at = new Date(EXAMPLE_EVENT_CHART_UT_MS);
  return {
    id: EXAMPLE_EVENT_ID,
    createdAt,
    name: EXAMPLE_EVENT_NAME,
    year: at.getUTCFullYear(),
    month: at.getUTCMonth() + 1,
    day: at.getUTCDate(),
    hour: at.getUTCHours(),
    minute: at.getUTCMinutes(),
    // BirthData.tzOffset is hours EAST of UT (New York's EDT is −4); GMT is 0.
    tzOffset: 0,
    tzIana: 'Europe/London',
    tzManual: false,
    tzUncertain: false,
    birthplace: { label: 'Greenwich, England, United Kingdom', lat: 51 + 29 / 60, lng: 0 },
    folder: EXAMPLE_EVENT_FOLDER,
    kind: 'event',
  };
}

/** The example is in the library (by its id, so a renamed or refiled one still counts
 *  and Add example stays idempotent). */
export function hasExampleEvent(charts: readonly StoredChart[]): boolean {
  return charts.some((c) => c.id === EXAMPLE_EVENT_ID);
}

/**
 * The library with the example added — or the SAME array when it is already there, so
 * a second press (or a press racing a sync that brought it in) changes nothing and
 * writes nothing. App's addExampleEvent runs this inside its state update, refuses
 * while held, and selects nothing: the reader asked for a chart in the library, not
 * for the map to move.
 */
export function withExampleEvent(charts: StoredChart[], createdAt: number): StoredChart[] {
  return hasExampleEvent(charts) ? charts : [...charts, exampleEventChart(createdAt)];
}

/**
 * The charts a fresh library starts with: the person examples (SEED_BIRTHS, Jim Lewis
 * first, so he stays the chart a fresh install opens on), and — on a device the hold
 * doesn't cover — the example event after them. Held, exactly the set it was before
 * event charts existed, ids and order included.
 */
export function seedLibrary(held: boolean, now: number): StoredChart[] {
  const people = SEED_BIRTHS.map((b, i) => ({
    ...b,
    id: `${SEED_CHART_ID_PREFIX}${i}`,
    createdAt: now + i,
  }));
  return held ? people : [...people, exampleEventChart(now + people.length)];
}

// ── "No chart" in the chart menu's trigger ──────────────────────────────────

/** The sky layer No chart can carry: the two overlays that need no chart. */
export type SkyOverlayMode = 'transits' | 'eclipses';

/** The ONE reason every control greyed for want of a chart gives — an Overlay-menu row
 *  that advances or compares a chart (lib/astro/timeline's 'no-chart' block), the
 *  returns, Local space, Natal lines — read word for word, so the reader meets one
 *  sentence for one fact wherever they meet it. verify-event-charts holds it to one
 *  sentence. */
export const NEEDS_CHART_KEY = 'settings.inert.needsChart' as const;

/**
 * The trigger's second line under "No chart": "Transits · 20 Oct 2026" (the date of the
 * layer's instant in UT — the trigger names no place), or "The sky alone" with the
 * overlay off. One string, so the line the timeline rewrites as it moves is a single text
 * node a page translator can't strand.
 */
export function noChartMeta(
  t: TFn,
  fmt: Formatters,
  overlay: SkyOverlayMode | null,
  ms: number | null,
): string {
  if (!overlay || ms == null || !Number.isFinite(ms)) return t('chartSwitcher.sky.metaOff');
  const d = new Date(ms);
  return t('chartSwitcher.sky.meta', {
    overlay: t(`chartSwitcher.sky.overlay.${overlay}`),
    date: fmt.date(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 'medium'),
  });
}
