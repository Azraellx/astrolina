// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// What a found moment is called (2026-10-20): the chart name and the folder the new-chart
// form suggests after Find the moment (eventSearch.ts) fills its date and time. Pure — `t`
// and `fmt` come in as arguments — so the verify suite builds exactly what the form shows.
//
// A suggestion is only that: the form keeps the reader's own name and folder over it the
// moment either is touched (design 03 §4, nameOwn / folderOwn), and remembers a folder for
// the next event chart only when the reader chose it.
//
// THE SUN'S INGRESS is named as astrologers title the chart — "{sign} Ingress {year}", so the
// March equinox is "Aries Ingress 2026", the name the example event chart carries
// (lib/eventCharts.ts; verify:event-search holds the two equal). The slow planets, Jupiter to
// Pluto, enter a sign once in years, so the year names the event; the Moon and the inner
// planets enter one often enough that only the date does. A lunation is named by the Moon's
// sign and the year; everything else by its date.
//
// THE DATE A NAME CARRIES is the date the chart will SHOW, which is why `suggestedName` takes
// it rather than reading the instant: an event at 20:00 UT is already tomorrow in Melbourne,
// and a chart named for the day before its own date would be wrong on its face.
//
// FOLDERS are English data, like the example chart's "Mundane/Ingresses" and
// chartFolders' DEFAULT_EVENT_FOLDER (2026-10-20): a folder is shared by every chart filed
// in it and syncs across devices, so a name that followed the interface language would split
// one library into two trees on two devices set to two languages. A name is per chart, so it
// is written in the reader's language.
import type { Formatters, TFn } from '../../i18n';
import { makeEnumLabels } from '../../i18n/enums';
import { DEFAULT_EVENT_FOLDER, FOLDER_SEPARATOR } from '../chartFolders';
import { chartInstantOf, type EventBody, type EventDetail, type EventHit } from './eventSearch';
import { jdToEpochMs } from './timeline';

/** A calendar date as the chart will show it. A planetaryHours CivilDate is one too. */
export interface EventDate {
  year: number;
  month: number;
  day: number;
}

/**
 * What Find the moment hands the form (EventFinderProps.onFound). `utMs` is exact (to well
 * under a second); `chartUtMs` is the minute the chart will carry (chartInstantOf: an
 * ingress rounded UP, everything else to the nearest minute).
 */
export interface FoundEvent {
  jd: number;
  utMs: number;
  chartUtMs: number;
  detail: EventDetail;
  suggestedFolder: string;
  /** The suggested name for the chart, given the date it will SHOW (see the header). */
  suggestedName(date: EventDate): string;
}

/** The bodies whose ingress is named by its date (they enter a sign often). */
const DATED_INGRESS: ReadonlySet<EventBody> = new Set(['Moon', 'Mercury', 'Venus', 'Mars']);

/** The suggested chart name for `detail` on the date the chart shows. */
export function suggestedName(detail: EventDetail, date: EventDate, t: TFn, fmt: Formatters): string {
  const labels = makeEnumLabels(t);
  const on = fmt.date(date.year, date.month, date.day, 'medium');
  const year = date.year;
  const sign = labels.sign(detail.sign);
  switch (detail.kind) {
    case 'ingress': {
      // The Sun never retrogrades, so its one form has no Rx twin.
      if (detail.body === 'Sun') return t('eventFinder.name.sunIngress', { sign, year });
      const body = labels.planet(detail.body);
      if (DATED_INGRESS.has(detail.body)) {
        return detail.retrograde
          ? t('eventFinder.name.ingressDatedRx', { body, sign, date: on })
          : t('eventFinder.name.ingressDated', { body, sign, date: on });
      }
      return detail.retrograde
        ? t('eventFinder.name.ingressYearRx', { body, sign, year })
        : t('eventFinder.name.ingressYear', { body, sign, year });
    }
    case 'new-moon':
      return t('eventFinder.name.newMoon', { sign, year });
    case 'full-moon':
      return t('eventFinder.name.fullMoon', { sign, year });
    case 'solar-eclipse':
      return t(`eventFinder.name.solarEclipse.${detail.type}`, { date: on });
    case 'lunar-eclipse':
      return t(`eventFinder.name.lunarEclipse.${detail.type}`, { date: on });
    case 'station':
      return detail.turn === 'retrograde'
        ? t('eventFinder.name.stationRetrograde', { body: labels.planet(detail.body), date: on })
        : t('eventFinder.name.stationDirect', { body: labels.planet(detail.body), date: on });
    case 'aspect':
      return t('eventFinder.name.aspect', {
        a: labels.planet(detail.a),
        aspect: t(`eventFinder.aspect.${detail.aspect}`),
        b: labels.planet(detail.b),
        date: on,
      });
  }
}

/** The suggested folder for an event of this kind, e.g. "Mundane/Ingresses". */
export function suggestedFolder(detail: EventDetail): string {
  const sub =
    detail.kind === 'ingress'
      ? 'Ingresses'
      : detail.kind === 'new-moon' || detail.kind === 'full-moon'
        ? 'Lunations'
        : detail.kind === 'solar-eclipse' || detail.kind === 'lunar-eclipse'
          ? 'Eclipses'
          : detail.kind === 'station'
            ? 'Stations'
            : 'Aspects';
  return [DEFAULT_EVENT_FOLDER, sub].join(FOLDER_SEPARATOR);
}

/** An engine hit as the form receives it — the one place the two halves meet, so the panel
 *  and the suite build a FoundEvent the same way. `t` and `fmt` are the live ones when the
 *  panel calls it; the name is built on demand, for whatever date the chart ends up showing. */
export function foundEventOf(hit: EventHit, t: TFn, fmt: Formatters): FoundEvent {
  return {
    jd: hit.jd,
    utMs: jdToEpochMs(hit.jd),
    chartUtMs: chartInstantOf(hit),
    detail: hit.detail,
    suggestedFolder: suggestedFolder(hit.detail),
    suggestedName: (date) => suggestedName(hit.detail, date, t, fmt),
  };
}
