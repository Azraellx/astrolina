// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The chart's statement: what the chart in front of the reader IS, and the data it was
// cast from — one model, rendered by the sidebar header, the wheel's corner title and
// the Dual layout's second header (Lina's chart-header spec, 2026-10-06; built
// 2026-10-07).
//
// Why a model and not markup: the header used to say "NATAL CHART" whatever was on the
// wheel — a transit ring, a pinned relocation, a promoted progression — and three
// surfaces each derived their own wording from props. A label that names the chart's
// real state has to be decided ONCE, with a precedence, or the corner and the header
// will disagree about the same wheel. Pure (no React), so scripts/verify-chart-header
// can hold every state to it.
//
// Three rules from the spec carry the design:
//   • A natal moment is shown as it occurred at the birthplace — its own clock and zone
//     — even when relocated: the birth moment is a historical fact. An overlay's moment
//     (a transit, a progression's date, an eclipse) is shown in the local time of the
//     place the angles are cast for.
//   • A relocated place shows coordinates only, no zone: its clock is not an input.
//   • A composite has NO moment line, deliberately: it is built by midpointing two
//     charts' positions and has no moment, which is also why it cannot be progressed or
//     directed. Its stored minute is a synthesized frame anchor. Do not "fix" this by
//     printing that minute. A Davison does have a real moment, shown in UT, since nobody's
//     clock ever read it and its place may be mid-ocean.
//
// Discreet mode is applied HERE (identityFor), segment by segment, the way the sidebar
// masked before: a date becomes MASK_DATE, a time MASK_TIME, and the zone drops out
// entirely rather than trailing a second run of dots — one mask per fact reads as
// hidden, two read as broken. What is the subject's: the birth moment, the birthplace
// and its coordinates, a relationship chart's parents, a Davison's moment, the
// geographic midpoint, and a return's date (a solar return's gives the birthday away).
// A place the reader pinned or hovers is where they are working, not who the chart is,
// and reads normally.

import type { Formatters, TFn } from '../i18n';
import type { ZodiacMode } from './astro/ayanamsa';
import type { ReturnBody } from './astro/returns';
import type { OverlayKind } from './astro/timeline';
import { buildDavison } from './astro/relationship';
import {
  formatZoneLabel,
  placeZoneAt,
  utName,
  wallClockAt,
  zoneNameForChart,
  type WallClock,
  type ZoneName,
} from './atlas/zoneName';
import { timeUnknown } from './birthData';
import type { CompositeParents, ParentSnapshot, StoredChart } from './chartLibrary';
import { fmtCoordPair, fmtCoordPairDM } from './coordFormat';
import { identityFor, MASK_DATE, MASK_TIME } from './discreet';
import type { HouseSystem, LineSystem, NodeType } from './ephemeris';

// ── Shapes ──────────────────────────────────────────────────────────────────

export type SegmentKind =
  | 'lead' // "Born:", "Relocated to:" — a line's own label
  | 'date'
  | 'clock'
  | 'zone' // "EDT (UTC−04:00)" — always rides after a clock
  | 'place'
  | 'coords'
  | 'name'
  | 'text';

export interface Segment {
  kind: SegmentKind;
  /** What prints — already masked when the model was built in Discreet mode. */
  text: string;
  /** 'subject' is the chart subject's own data, masked in Discreet mode. */
  mask: 'subject' | 'none';
  /** What separates it from the segment before: ' · ' between facts, ' ' after a lead
   *  and before a zone, '' for a line's first segment. */
  sep: string;
}

/** What a line says, so a renderer can style it (and a test can find it). */
export type LineRole =
  | 'moment' // the chart's own moment (natal: the birth; Davison: its UT moment)
  | 'birthplace'
  | 'relocated' // "Relocated to:" / "Cast for:" — the point the angles are cast for
  | 'overlay-moment' // an overlay's (or a return's) moment, in the cast place's clock
  | 'overlay-place' // where the overlay is cast, when that is the chart's own place
  | 'parent' // a relationship parent: name · date [· clock zone | · place]
  | 'parent-place'
  | 'midpoint'
  | 'derived' // "Derived from:"
  | 'geo' // marker: the geodetic GE / planets lines go here (rendered with glyphs)
  | 'rodden'
  | 'settings';

export interface HeaderLine {
  role: LineRole;
  segs: Segment[];
  /** A pre-1970 zone outside the US/EU on this moment: the renderer adds the ⚠. */
  tzUncertain?: boolean;
}

export type HeaderState =
  | 'none'
  | 'no-chart'
  | 'geodetic'
  | 'composite'
  | 'return'
  | 'overlay'
  | 'synastry'
  | 'davison'
  | 'natal';

/** The overlay riding with (or standing in for) the chart. */
export interface HeaderOverlay {
  /** CCG is ignored: it never makes a wheel (no single chart), so it names nothing. */
  kind: OverlayKind;
  /** The overlay's instant (epoch ms UT) — the target date, or an eclipse's maximum.
   *  Null for synastry, which is a person rather than a moment. */
  ms: number | null;
  /** Natal off: the overlay stands in for the chart. */
  promoted: boolean;
  /** Set when the transit moment IS one of the chart's returns. */
  returnBody: ReturnBody | null;
  /** Synastry's partner — their own record heads the Dual layout's second wheel. */
  partner?: StoredChart | null;
}

export interface ChartHeaderInput {
  /** The DERIVED chart (a time being tried on included). */
  chart: StoredChart | null;
  /** The active point — the pin, else the hover; null in the plain natal state. */
  point: { lat: number; lng: number } | null;
  /** The active point's resolved place name; empty while a hover geocode resolves. */
  pointLabel: string | null;
  /** The pin stands on the birthplace: that is the natal chart, not a relocation. */
  isNatalPin: boolean;
  /** The map's EFFECTIVE line system. */
  lineSystem: LineSystem;
  overlay: HeaderOverlay | null;
  /** A promoted CCG left nothing to wheel ("NO CHART"): the header keeps the chart's
   *  own lines and names no state, as it did before there was a state to name. */
  noChart?: boolean;
  /** The house frame the wheel draws, or null where it draws none (no birth time on a
   *  celestial map). `fallback`: the chosen system is undefined there, Porphyry used. */
  houses: { system: HouseSystem; fallback: boolean } | null;
  /** The EFFECTIVE zodiac (tropical with Advanced off). */
  zodiac: ZodiacMode;
  nodeType: NodeType;
  discreet: boolean;
  t: TFn;
  fmt: Formatters;
}

/** One statement: the state label and the lines under it. */
export interface HeaderView {
  labelParts: string[];
  lines: HeaderLine[];
  /** Blank rows the renderer reserves after the lines: the ones a relocation WOULD add
   *  (its cast line), while the chart is not relocated — so placing a pin, or the hover
   *  crossing the map, never pushes the sections below down a row (2026-10-09). Absent
   *  where relocating adds nothing, as on an overlay, whose place line is always there. */
  spareLines?: number;
}

/** The overlay's moment in pieces, for the wheel's right-corner caption. */
export interface OverlayMoment {
  date: Segment;
  clock: Segment;
  zone: Segment | null;
}

export interface ChartHeaderModel extends HeaderView {
  state: HeaderState;
  /** The chart alone, as if no overlay ran — the Dual layout's first wheel and header,
   *  where the overlay is a second chart with a header of its own. */
  chartView: HeaderView;
  /** The overlay's own statement (the Dual layout's second wheel and header), and its
   *  moment for the bi-wheel's corner caption. Null with no overlay. */
  overlayView: (HeaderView & { moment: OverlayMoment | null }) | null;
  /** Whether `labelParts` already carries the overlay's date (so a corner caption
   *  beside it need not repeat it). */
  labelHasOverlayDate: boolean;
}

// ── Small helpers ───────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');
const SEP = ' · ';

/** A Davison: a locally generated relationship chart with a real moment — the parents
 *  recorded on it, or (generated before they were) the generator's 'space' tag with no
 *  composite payload, as lib/astro/timeline already recognises one. */
export function isDavison(chart: StoredChart): boolean {
  return !chart.composite && (!!chart.davison || chart.tag === 'space');
}

/**
 * A Davison's parents, when it carries them AND they still make it: buildDavison of
 * the two lands on the chart's own minute, in UT, at its own place (to ~10 m, so a
 * no-op save that rounds coordinates does not disown them). An edited Davison is no
 * longer the midpoint of the two it was made from, and "Derived from" under it would
 * be a claim the chart no longer makes; an old one recorded nobody. Either way, null.
 */
export function davisonParents(chart: StoredChart): CompositeParents | null {
  const parents = chart.davison;
  if (!parents || chart.composite) return null;
  try {
    const d = buildDavison(parents.a, parents.b);
    const lngGap = Math.abs(((((d.birthplace.lng - chart.birthplace.lng + 540) % 360) + 360) % 360) - 180);
    return d.year === chart.year &&
      d.month === chart.month &&
      d.day === chart.day &&
      d.hour === chart.hour &&
      d.minute === chart.minute &&
      chart.tzOffset === 0 &&
      Math.abs(d.birthplace.lat - chart.birthplace.lat) < 1e-4 &&
      lngGap < 1e-4
      ? parents
      : null;
  } catch {
    // No ephemeris to re-derive with: say nothing rather than guess.
    return null;
  }
}

/** The clock of the place an overlay is cast for, at its instant: the place's zone
 *  then (LMT in its era), or UTC where no zone can be found for the point. */
export function castZoneAt(ms: number, lat: number, lng: number): ZoneName {
  return placeZoneAt(lat, lng)?.(ms) ?? utName();
}

/** An overlay's instant as the cast place's wall clock, with the zone it reads in. */
export function castClockAt(
  ms: number,
  lat: number,
  lng: number,
): { zone: ZoneName; wall: WallClock } {
  const zone = castZoneAt(ms, lat, lng);
  return { zone, wall: wallClockAt(ms, zone) };
}

/** The zone a relationship chart's own UT moment reads in: UT by the stored offset,
 *  which always wins — generated, it is 0; edited to another, whatever names that. */
function davisonZone(c: StoredChart): ZoneName {
  return c.tzOffset === 0 ? utName() : zoneNameForChart(c);
}

// ── The model ───────────────────────────────────────────────────────────────

export function chartHeaderModel(input: ChartHeaderInput): ChartHeaderModel {
  const { chart, t, fmt } = input;
  const id = identityFor(input.discreet);
  const empty: HeaderView = { labelParts: [], lines: [] };
  if (!chart) {
    return { state: 'none', ...empty, chartView: empty, overlayView: null, labelHasOverlayDate: false };
  }

  const geo = input.lineSystem === 'geodetic';
  // CCG never makes a wheel (App drops its ring; promoted, it is the NO CHART state), so
  // it changes no label. Synastry has no instant; every other overlay needs one.
  const ov =
    input.overlay && input.overlay.kind !== 'cyclo' && (input.overlay.kind === 'synastry' || input.overlay.ms != null)
      ? input.overlay
      : null;
  // Relocated: the angles are cast somewhere other than the birthplace — a pin, or the
  // hover. A pin standing on the birthplace is the natal chart.
  const relocated = !!input.point && !input.isNatalPin;
  const cast = input.point && relocated ? input.point : chart.birthplace;
  const castLabel = relocated ? (input.pointLabel ?? '').trim() : '';
  const relationship = !!chart.composite || isDavison(chart);

  // ── segment builders (Discreet applied here) ──
  const seg = (kind: SegmentKind, text: string, mask: Segment['mask'], sep = SEP): Segment => {
    if (mask === 'subject' && id.on) {
      switch (kind) {
        case 'date':
          return { kind, text: MASK_DATE, mask, sep };
        case 'clock':
          return { kind, text: MASK_TIME, mask, sep };
        case 'name':
          return { kind, text: id.name(text), mask, sep };
        case 'coords':
          return { kind, text: `${id.text('00°00′N')} ${id.text('000°00′E')}`, mask, sep };
        case 'place':
          return { kind, text: id.text(text || 'birthplace'), mask, sep };
        default:
          return { kind, text: id.text(text), mask, sep };
      }
    }
    return { kind, text, mask, sep };
  };
  // A line from segments, the absent ones (no lead, an unnamed place, a masked zone)
  // dropped, and the first one that remains starting flush.
  const line = (role: LineRole, parts: (Segment | null)[], extra?: Partial<HeaderLine>): HeaderLine => {
    const segs = parts.filter((s): s is Segment => !!s);
    if (segs.length) segs[0] = { ...segs[0], sep: '' };
    return { role, segs, ...extra };
  };
  // A clock and its zone, or — timeless — the wording that says the time is unknown
  // (the bodies are read at a noon placeholder, and "12:00" alone would read as a time
  // somebody recorded). The zone is the time's own qualifier, so it masks out WITH it.
  const clockSegs = (
    hour: number,
    minute: number,
    zone: ZoneName,
    mask: Segment['mask'],
    timeless: boolean,
  ): (Segment | null)[] =>
    timeless
      ? [seg('text', t('expandedSidebar.timeUnknownNoon'), 'none')]
      : [
          seg('clock', `${pad2(hour)}:${pad2(minute)}`, mask),
          mask === 'subject' && id.on ? null : seg('zone', formatZoneLabel(zone), mask, ' '),
        ];
  const plainDate = (y: number, m: number, d: number) => `${d} ${fmt.monthName(m)} ${y}`;
  const lead = (key: 'born' | 'relocatedTo' | 'castFor' | 'midpoint' | 'derivedFrom') =>
    seg('lead', t(`expandedSidebar.header.${key}`), 'none');

  // ── line builders ──
  // The chart's own birth moment, in its own zone — always the birthplace's clock, even
  // relocated ("Born:" says so then).
  const natalMoment = (c: StoredChart | ParentSnapshot, born: boolean, tzUncertain?: boolean) =>
    line(
      'moment',
      [
        born ? lead('born') : null,
        seg('date', fmt.dateWithWeekday(c.year, c.month, c.day), 'subject', ' '),
        ...clockSegs(c.hour, c.minute, zoneNameForChart(c), 'subject', timeUnknown(c)),
      ],
      tzUncertain ? { tzUncertain } : undefined,
    );
  const birthplaceLine = (c: StoredChart | ParentSnapshot, role: LineRole = 'birthplace') =>
    line(role, [
      c.birthplace.label?.trim() ? seg('place', c.birthplace.label.trim(), 'subject') : null,
      seg('coords', fmtCoordPair(c.birthplace.lat, c.birthplace.lng), 'subject'),
    ]);
  // The point the angles are cast for, when it is not the chart's own: the place and its
  // coordinates to the minute, no zone — its clock is not an input. A place the reader
  // chose, so never masked. "Cast for:" on a geodetic map, where the frame is the
  // place's own rather than a natal frame moved there.
  const relocatedLine = (withLead: boolean, leadKey: 'castFor' | 'relocatedTo' = geo ? 'castFor' : 'relocatedTo') =>
    line('relocated', [
      withLead ? lead(leadKey) : null,
      castLabel ? seg('place', castLabel, 'none', ' ') : null,
      seg('coords', fmtCoordPairDM(cast.lat, cast.lng), 'none', castLabel ? SEP : ' '),
    ]);
  const midpointLine = (c: StoredChart = chart) =>
    line('midpoint', [
      lead('midpoint'),
      seg('coords', fmtCoordPairDM(c.birthplace.lat, c.birthplace.lng), 'subject', ' '),
    ]);
  // A relationship chart's parent: "Jim Lewis · 5 June 1941 · 09:30 EDT (UTC−04:00)",
  // its own zone named from the snapshot (old snapshots carry no zone fields, and are
  // named from the stored offset alone).
  const parentMoment = (p: ParentSnapshot) =>
    line('parent', [
      seg('name', p.name, 'subject'),
      seg('date', plainDate(p.year, p.month, p.day), 'subject'),
      ...clockSegs(p.hour, p.minute, zoneNameForChart(p), 'subject', timeUnknown(p)),
    ]);
  // "Derived from:" names a Davison's parents by name · date · place: the derivation,
  // not their records.
  const parentDerived = (p: ParentSnapshot) =>
    line('parent', [
      seg('name', p.name, 'subject'),
      seg('date', plainDate(p.year, p.month, p.day), 'subject'),
      p.birthplace.label?.trim() ? seg('place', p.birthplace.label.trim(), 'subject') : null,
    ]);

  // A chart's own lines, by what the chart is — the panel's chart (relocating with the
  // active point) or a synastry partner's (`reloc` false: the Dual header adds its own
  // "Cast for" line). A relationship partner is stated as the panel would state it, so
  // a composite partner gets no moment line either. `born` leads a natal moment with
  // "Born:" — relocated, or under a ring whose own moment heads the lines.
  const chartLinesOf = (c: StoredChart, reloc: boolean, born = reloc): HeaderLine[] => {
    if (c.composite) {
      const { a, b } = c.composite;
      const out = [
        parentMoment(a),
        birthplaceLine(a, 'parent-place'),
        parentMoment(b),
        birthplaceLine(b, 'parent-place'),
        midpointLine(c),
      ];
      // A composite's own angles are midpoints and do not relocate; on a geodetic map
      // the frame IS the place's, so there the cast point is named.
      if (geo && reloc) out.push(relocatedLine(true));
      return out;
    }
    if (isDavison(c)) {
      const out = [
        line('moment', [
          seg('date', plainDate(c.year, c.month, c.day), 'subject'),
          ...clockSegs(c.hour, c.minute, davisonZone(c), 'subject', timeUnknown(c)),
        ]),
        midpointLine(c),
      ];
      if (reloc) out.push(relocatedLine(true));
      const parents = davisonParents(c);
      if (parents) {
        out.push(line('derived', [lead('derivedFrom')]), parentDerived(parents.a), parentDerived(parents.b));
      }
      return out;
    }
    return reloc
      ? [natalMoment(c, born, c.tzUncertain), birthplaceLine(c), relocatedLine(true)]
      : [natalMoment(c, born, c.tzUncertain), birthplaceLine(c)];
  };
  const chartLines = () => chartLinesOf(chart, relocated);
  // The rows a relocation would add to chartLines(), held as blank space while there is
  // none (HeaderView.spareLines). Counted rather than assumed: a composite's angles do not
  // relocate, so off a geodetic map it adds nothing.
  const spare = relocated ? 0 : chartLinesOf(chart, true).length - chartLinesOf(chart, false).length;

  // Where an overlay is cast when no point is chosen: the chart's own place — the
  // birthplace, or a relationship chart's geographic midpoint.
  const chartPlaceLine = (): HeaderLine =>
    relationship
      ? { ...midpointLine(), role: 'overlay-place' }
      : birthplaceLine(chart, 'overlay-place');

  // The overlay's moment, in the cast place's own clock.
  const isReturn = !!ov && ov.kind === 'transits' && !!ov.returnBody;
  const ovClock = ov && ov.ms != null ? castClockAt(ov.ms, cast.lat, cast.lng) : null;
  // A return's date is the subject's (a solar return falls on the birthday).
  const ovMask: Segment['mask'] = isReturn ? 'subject' : 'none';
  const ovLongDate = ovClock ? plainDate(ovClock.wall.year, ovClock.wall.month, ovClock.wall.day) : '';
  // The overlay's moment line; `named` leads it with the overlay's name, for a header
  // whose label names something else (a composite carrying a ring).
  const overlayMomentLine = (named = false): HeaderLine | null => {
    if (!ovClock || !ov || ov.kind === 'synastry') return null;
    const { wall, zone } = ovClock;
    const name = isReturn
      ? t(`expandedSidebar.header.ringLead.${ov.returnBody === 'solar' ? 'solarReturn' : 'lunarReturn'}`)
      : t(`expandedSidebar.header.ringLead.${ov.kind}`);
    return line('overlay-moment', [
      named ? seg('lead', name, 'none') : null,
      seg('date', fmt.dateWithWeekday(wall.year, wall.month, wall.day), ovMask, ' '),
      ...clockSegs(wall.hour, wall.minute, zone, ovMask, false),
    ]);
  };
  const overlayLines = (): HeaderLine[] => {
    const moment = overlayMomentLine();
    if (!moment) return [];
    return [moment, relocated ? relocatedLine(geo) : chartPlaceLine()];
  };
  // A RING: the overlay drawn around the chart rather than in its place (not promoted).
  // The chart is still the inner wheel — and what the tables below it describe — so the
  // header keeps its lines and adds the ring's moment, rather than trading one chart's
  // statement for the other's (2026-10-09; the overlay's lines alone left a bi-wheel's
  // header without the birth moment of the chart it was drawn around).
  const ring = !!ov && !ov.promoted && ov.kind !== 'synastry' && !!ovClock;
  const overlayMoment = (): OverlayMoment | null => {
    if (!ovClock) return null;
    const [clock, zone] = clockSegs(ovClock.wall.hour, ovClock.wall.minute, ovClock.zone, ovMask, false);
    return { date: seg('date', ovLongDate, ovMask, ''), clock: { ...clock!, sep: '' }, zone };
  };

  const roddenLine = (): HeaderLine | null =>
    chart.sourceRating
      ? line('rodden', [
          seg('text', t('expandedSidebar.header.rodden', { code: chart.sourceRating }), 'none'),
          seg('text', t(`chartForm.rating.${chart.sourceRating}`), 'none'),
        ])
      : null;
  // Chart-data settings, and only those (line-geometry settings live in the map's status
  // line): geocentric, the zodiac in force (geodetic is tropical-only), the house system
  // the wheel's cusps were drawn in — Porphyry wherever the chosen one is undefined —
  // left out where the wheel draws no houses, and the node.
  const settingsLine = (): HeaderLine =>
    line('settings', [
      seg('text', t('expandedSidebar.header.geocentric'), 'none'),
      seg('text', t(`settings.zodiac.${geo ? 'tropical' : input.zodiac}.label`), 'none'),
      input.houses
        ? seg('text', t(`settings.houseSystem.${input.houses.fallback ? 'porphyry' : input.houses.system}.label`), 'none')
        : null,
      seg('text', t(`settings.nodeType.${input.nodeType}.label`), 'none'),
    ]);
  const tail = (): HeaderLine[] => {
    const r = roddenLine();
    return r ? [r, settingsLine()] : [settingsLine()];
  };
  const geoMarker: HeaderLine = { role: 'geo', segs: [] };

  // ── labels ──
  const relocSuffix = relocated ? [t('expandedSidebar.header.relocated')] : [];
  const chartLabel = (): string[] =>
    geo
      ? [t('expandedSidebar.header.geodetic')]
      : chart.composite
        ? [t('expandedSidebar.header.composite')]
        : isDavison(chart)
          ? [t('expandedSidebar.header.davison'), ...relocSuffix]
          : [t('expandedSidebar.header.natal'), ...relocSuffix];
  // The overlay's own name and date: SOLAR RETURN 2026 · LUNAR RETURN · 3 August 2026 ·
  // TRANSITS · 1 August 2026 — the date the cast place's calendar shows.
  const overlayLabel = (): string[] => {
    if (!ov) return [];
    if (ov.kind === 'synastry') return [t('expandedSidebar.header.synastry')];
    const wall = ovClock!.wall;
    if (isReturn) {
      return ov.returnBody === 'solar'
        ? [t('expandedSidebar.header.solarReturn', { year: wall.year })]
        : [t('expandedSidebar.header.lunarReturn'), id.on ? MASK_DATE : ovLongDate];
    }
    return [t(`expandedSidebar.header.kind.${ov.kind}`), ovLongDate];
  };

  // ── state, by precedence ──
  // GEODETIC CHART > COMPOSITE (MIDPOINTS) > a return > the overlay (ring or promoted) >
  // SYNASTRY > DAVISON > NATAL CHART. One exception the list did not cover: a PROMOTED
  // overlay on a composite outranks the composite, because the wheel then IS the
  // overlay's chart and the composite is not drawn at all (2026-10-07).
  const state: HeaderState = input.noChart
    ? 'no-chart'
    : geo
      ? 'geodetic'
      : chart.composite && !(ov && ov.promoted && ov.kind !== 'synastry')
        ? 'composite'
        : ov && ov.kind !== 'synastry'
          ? isReturn
            ? 'return'
            : 'overlay'
          : ov?.kind === 'synastry'
            ? 'synastry'
            : isDavison(chart)
              ? 'davison'
              : 'natal';

  let labelParts: string[];
  let lines: HeaderLine[];
  // Every state that states the chart's own lines reserves their spare rows; the two that
  // state the overlay's do not.
  let spareLines = spare;
  switch (state) {
    case 'no-chart':
      labelParts = [];
      lines = [...chartLines(), ...tail()];
      break;
    case 'geodetic':
      // A promoted overlay's bodies are the wheel's, so its moment heads the lines;
      // otherwise the chart's own. The GE angles and the planets line follow the place.
      labelParts = chartLabel();
      if (ov?.promoted && ovClock) spareLines = 0;
      lines = [...(ov?.promoted && ovClock ? overlayLines() : chartLines()), geoMarker, ...tail()];
      break;
    case 'composite':
      labelParts = chartLabel();
      if (ring) {
        // The composite outranks its ring in the label, so the ring's moment is NAMED
        // ("Transits: …") — a bare date and clock here would read as the composite's own
        // moment, which it does not have (section 3 of verify-chart-header). Relocated, the
        // ring is cast for the point though the composite's angles are not: "Cast for:".
        lines = [...chartLines(), overlayMomentLine(true)!, ...(relocated ? [relocatedLine(true, 'castFor')] : []), ...tail()];
        spareLines = relocated ? 0 : 1;
      } else {
        lines = [...chartLines(), ...tail()];
      }
      break;
    case 'return':
    case 'overlay':
      // "· RELOCATED" follows the state: the overlay's angles relocate even on a
      // composite (only the composite's own do not).
      labelParts = [...overlayLabel(), ...relocSuffix];
      if (ring) {
        // The label names the ring and its date, so its moment heads the lines unnamed;
        // the chart's own follow, "Born:" saying whose that moment is. One place line
        // serves both: the ring is cast where the chart is.
        lines = [overlayMomentLine()!, ...chartLinesOf(chart, relocated, true), ...tail()];
      } else {
        lines = [...overlayLines(), ...tail()];
        spareLines = 0;
      }
      break;
    case 'synastry':
      labelParts = [...overlayLabel(), ...relocSuffix];
      lines = [...chartLines(), ...tail()];
      break;
    default:
      labelParts = chartLabel();
      lines = [...chartLines(), ...tail()];
  }

  const chartView: HeaderView = {
    labelParts: input.noChart ? [] : chartLabel(),
    lines: [...chartLines(), ...(geo ? [geoMarker] : []), ...tail()],
    ...(spare ? { spareLines: spare } : {}),
  };
  let overlayView: ChartHeaderModel['overlayView'] = null;
  if (ov) {
    const partner = ov.kind === 'synastry' ? (ov.partner ?? null) : null;
    overlayView = {
      // The second wheel's angles are cast for the same point as the first's, so it is
      // relocated with it — except a partner's, whose header says where it is cast.
      labelParts: [...overlayLabel(), ...(ov.kind === 'synastry' || geo ? [] : relocSuffix)],
      lines: partner ? chartLinesOf(partner, false) : overlayLines(),
      moment: overlayMoment(),
    };
  }

  return {
    state,
    labelParts,
    lines,
    ...(spareLines ? { spareLines } : {}),
    chartView,
    overlayView,
    labelHasOverlayDate: state === 'overlay' || (state === 'return' && ov?.returnBody === 'lunar'),
  };
}

/** A line as one string — the sidebar's text, a test's, a caption's. */
export function lineText(l: HeaderLine): string {
  return l.segs.map((s) => s.sep + s.text).join('');
}
