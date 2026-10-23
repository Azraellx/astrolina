// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Find the moment's form side (2026-10-20): what the panel searches for, where a search
// starts, and how a found moment reaches the form — as plain functions, so the verify
// suite (scripts/verify-event-search.ts §c, §h, §i) drives the very code the form and the
// panel run, the way zoneEntryModel.ts is to the zone field. EventFinder.tsx keeps it in
// React; lib/astro/eventSearch.ts is the search itself and eventNaming.ts the names.
//
// THREE RULES live here, each in one place:
//   · WHERE A SEARCH STARTS (searchStart). From the moment the form holds — or now, while
//     it holds none — and strictly past it: by a second from an exact instant, by a minute
//     from a minute somebody typed. While the form still shows the moment last found, the
//     search starts from that moment's EXACT instant, because the minute shown is rounded
//     (an ingress up) and Previous from 14:46 must not find the 14:45:58 it came from.
//   · HOW A FOUND MOMENT FILLS THE FORM (instantOfFound). As an instant, not a wall clock:
//     the form reads it in whichever zone it holds (zoneEntryModel wallClockForInstant),
//     rounded by the one rule eventSearch states (chartRoundFor — an ingress up, all else
//     to the nearest minute).
//   · A SUGGESTION NEVER OVERWRITES THE READER (shownName, shownFolder, remembersFolder).
//     The name and folder a found moment suggests are DERIVED — shown while the reader has
//     not given their own, gone the moment they do — never written into the fields. And a
//     folder the reader did not choose is never remembered as the next chart's default
//     (CLAUDE.md rule 1: nothing writes a preference from a control that isn't its own).
import type { TFn } from '../../i18n';
import { makeEnumLabels } from '../../i18n/enums';
import {
  chartRoundFor,
  FORM_MINUTE_MARGIN_SEC,
  impossibleAspect,
  type EventAspect,
  type EventBody,
  type EventDetail,
  type EventSpec,
  type StationBody,
} from '../../lib/astro/eventSearch';
import type { EventDate, FoundEvent } from '../../lib/astro/eventNaming';
import { epochMsToJD } from '../../lib/astro/timeline';
import type { FormInstant } from './zoneEntryModel';

// ── What is searched for ────────────────────────────────────────────────────────────────

export type FinderKind = EventSpec['kind'];

/** The kind menu, in its order: what a body does alone, then the luminaries' events, then
 *  a planet's turn, then two bodies together. */
export const FINDER_KINDS: readonly FinderKind[] = [
  'ingress',
  'new-moon',
  'full-moon',
  'solar-eclipse',
  'lunar-eclipse',
  'station',
  'aspect',
];

/** A kind's catalog key (eventFinder.kind.* / kindHint.*). */
export const KIND_KEY = {
  ingress: 'ingress',
  'new-moon': 'newMoon',
  'full-moon': 'fullMoon',
  'solar-eclipse': 'solarEclipse',
  'lunar-eclipse': 'lunarEclipse',
  station: 'station',
  aspect: 'aspect',
} as const satisfies Record<FinderKind, string>;

/** Every slot the panel's menus hold, for every kind at once — so switching the kind and
 *  back finds the body, sign or pair where the reader left it. */
export interface FinderPick {
  kind: FinderKind;
  /** Ingress: the body, and the sign (0 = Aries) or 'any' for the next one. */
  body: EventBody;
  sign: number | 'any';
  /** Station: the planet and its turn. */
  stationBody: StationBody;
  turn: 'retrograde' | 'direct';
  /** Aspect: A, the aspect, B. */
  a: EventBody;
  b: EventBody;
  aspect: EventAspect;
}

/** What the panel opens on: the Sun into Aries, the March equinox — the moment the example
 *  event chart is cast for. Mercury's retrograde station and the Sun conjunct Venus (a
 *  Venus Star Point) stand behind the other two kinds for the same reason: they are what
 *  people come to look up. */
export const DEFAULT_PICK: FinderPick = {
  kind: 'ingress',
  body: 'Sun',
  sign: 0,
  stationBody: 'Mercury',
  turn: 'retrograde',
  a: 'Sun',
  b: 'Venus',
  aspect: 'conjunction',
};

/** The search the pick describes. */
export function specOfPick(p: FinderPick): EventSpec {
  switch (p.kind) {
    case 'ingress':
      return { kind: 'ingress', body: p.body, sign: p.sign };
    case 'station':
      return { kind: 'station', body: p.stationBody, turn: p.turn };
    case 'aspect':
      return { kind: 'aspect', a: p.a, b: p.b, aspect: p.aspect };
    default:
      return { kind: p.kind };
  }
}

/** Why an aspect between `a` and `b` can't be searched, for its menu row's reason: the same
 *  body twice, or a pair that never stands that far apart (eventSearch's measured maxima —
 *  Mercury and Venus never square the Sun). Null when it can be searched. */
export function aspectBlock(
  a: EventBody,
  b: EventBody,
  aspect: EventAspect,
): { same: true } | { deg: number } | null {
  const deg = impossibleAspect(a, b, aspect);
  if (deg === null) return null;
  return deg === 0 ? { same: true } : { deg };
}

// ── Where a search starts ───────────────────────────────────────────────────────────────

/** The form's moment, as the panel searches from it. */
export interface FinderAnchor {
  /** The moment, epoch ms UT. */
  utMs: number;
  /** An exact instant (one the form was handed: Now, a found moment), not a typed minute —
   *  which decides how far past it a search must land (see searchStart). */
  exact: boolean;
  /** The date the boxes show, for the "From …" line. */
  date: EventDate;
  /** The time the boxes show, or null while it is empty. For the line only. */
  clock: { hour: number; minute: number } | null;
}

/** The anchor while the form holds an instant: the instant itself, exact, with the clock the
 *  boxes show for it. */
export function instantAnchor(
  instant: FormInstant,
  shown: { year: number; month: number; day: number; hour: number; minute: number },
): FinderAnchor {
  return {
    utMs: instant.utMs,
    exact: true,
    date: { year: shown.year, month: shown.month, day: shown.day },
    clock: { hour: shown.hour, minute: shown.minute },
  };
}

/** The anchor from typed boxes, read at the offset the zone field would save (east-positive
 *  hours, BirthData's convention; null — no place, or a zone still pending — reads them as
 *  UT, as the form shows an instant before there is a place). An empty time starts at the
 *  day's first minute, so "the next New Moon after 1 March" counts one on the 1st. Null —
 *  search from now — until the date is whole and its year in `years`, the form's range: a
 *  year still being typed is not a date anyone asked about. */
export function typedAnchor(
  f: { year: number | null; month: number | null; day: number | null; hour: number | null; minute: number | null },
  tzOffsetHours: number | null,
  years: { min: number; max: number },
): FinderAnchor | null {
  const { year, month, day, hour, minute } = f;
  if (year == null || month == null || day == null || year < years.min || year > years.max) return null;
  const local = Date.UTC(year, month - 1, day, hour ?? 0, minute ?? 0);
  return {
    utMs: local - (tzOffsetHours ?? 0) * 3_600_000,
    exact: false,
    date: { year, month, day },
    clock: hour != null ? { hour, minute: minute ?? 0 } : null,
  };
}

/** Where the next search starts, and how far past it a result must lie (seconds; undefined
 *  is eventSearch's default, one second). See the header. `nowMs` stands in while the form
 *  holds no moment at all. */
export function searchStart(
  anchor: FinderAnchor | null,
  last: Pick<FoundEvent, 'jd' | 'utMs' | 'chartUtMs'> | null,
  nowMs: number,
): { fromJD: number; marginSec?: number } {
  if (anchor && last && (anchor.utMs === last.utMs || anchor.utMs === last.chartUtMs)) {
    return { fromJD: last.jd };
  }
  if (!anchor) return { fromJD: epochMsToJD(nowMs) };
  return anchor.exact
    ? { fromJD: epochMsToJD(anchor.utMs) }
    : { fromJD: epochMsToJD(anchor.utMs), marginSec: FORM_MINUTE_MARGIN_SEC };
}

// ── How a found moment reaches the form ─────────────────────────────────────────────────

/** The instant the form holds for a found moment: exact, with the moment's own rounding. */
export function instantOfFound(found: Pick<FoundEvent, 'utMs' | 'detail'>): FormInstant {
  return { utMs: found.utMs, round: chartRoundFor(found.detail) };
}

/** The Name field's text: the reader's own while they have given one — an empty field they
 *  cleared included — else the suggestion for the date the boxes show, else nothing. */
export function shownName(own: string | null, suggestion: FoundEvent | null, date: EventDate | null): string {
  if (own !== null) return own;
  return suggestion && date ? suggestion.suggestedName(date) : '';
}

/** The folder the chart is filed in: the reader's own pick, else the suggestion, else the
 *  form's default (the list's open folder, or the last one this kind went into). */
export function shownFolder(own: string | null, suggestion: FoundEvent | null, fallback: string): string {
  return own ?? suggestion?.suggestedFolder ?? fallback;
}

/** Whether saving may remember the folder as the next chart's default: always, except for a
 *  suggested folder nobody chose — which would otherwise become the next natal chart's
 *  folder ("Mundane/Lunations") without anyone having picked it. */
export function remembersFolder(own: string | null, suggestion: FoundEvent | null): boolean {
  return own !== null || !suggestion;
}

// ── What the result line says ───────────────────────────────────────────────────────────

/** What was found, as a phrase for the result line ("Mercury Rx into Libra", "Total solar
 *  eclipse in Aries"). The pick line says what was asked for; this says what was found,
 *  which can differ — the next sign, a retrograde entry, which kind of eclipse. */
export function foundPhrase(detail: EventDetail, t: TFn): string {
  const labels = makeEnumLabels(t);
  const sign = labels.sign(detail.sign);
  switch (detail.kind) {
    case 'ingress': {
      const body = labels.planet(detail.body);
      return detail.retrograde
        ? t('eventFinder.found.ingressRx', { body, sign })
        : t('eventFinder.found.ingress', { body, sign });
    }
    case 'new-moon':
      return t('eventFinder.found.newMoon', { sign });
    case 'full-moon':
      return t('eventFinder.found.fullMoon', { sign });
    case 'solar-eclipse':
      return t(`eventFinder.found.solarEclipse.${detail.type}`, { sign });
    case 'lunar-eclipse':
      return t(`eventFinder.found.lunarEclipse.${detail.type}`, { sign });
    case 'station': {
      const body = labels.planet(detail.body);
      return detail.turn === 'retrograde'
        ? t('eventFinder.found.stationRetrograde', { body, sign })
        : t('eventFinder.found.stationDirect', { body, sign });
    }
    case 'aspect':
      return t('eventFinder.found.aspect', {
        a: labels.planet(detail.a),
        aspect: t(`eventFinder.aspect.${detail.aspect}`),
        b: labels.planet(detail.b),
      });
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "14:46" — an epoch-ms instant's UT clock, to the minute. */
export function utMinute(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** "14:45:57" — to the second, as a clock reads it (truncated, never rounded up: the
 *  equinox at 14:45:57.75 has not yet reached 14:45:58). */
export function utSecond(ms: number): string {
  const d = new Date(Math.floor(ms / 1000) * 1000);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/** The UT calendar date of an epoch-ms instant. */
export function utDate(ms: number): EventDate {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}
