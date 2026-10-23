// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Find the moment (2026-10-20): the panel under an event chart's Date that searches the sky
// for the moment the chart is about — a body entering a sign, a New or Full Moon, an
// eclipse, a station, an aspect — and hands it to the form, which fills its date and time
// and suggests a name and folder. Behind the geodetic hold with the rest of event charts:
// the form mounts it only in Event mode, which only shows while the hold is lifted.
//
// What it searches is a sentence per kind ("{body} into {sign}"), split at its placeholders
// with a menu in each slot, so every language keeps its own word order (the same split
// chartManager.editingHeader uses). The words between the menus are plain one-string spans.
//
// It sits INSIDE the form's <form>, so it holds no <input> — Enter in one would submit the
// chart — and every button is type="button". Escape closes it (an open menu catches Escape
// first, in the capture phase) and the form puts the focus back on Find….
//
// The search runs in slices (eventSearch searchEvent): from the click handler, never from a
// render; cancelled by a new search, a change of what is searched, and the panel closing.
// "Searching… {year}" shows only past 150 ms, so the usual search — a few milliseconds —
// never flashes a line. The pure half (what is searched, where a search starts, what the
// result says) is eventFinderModel.ts, which the verify suite drives directly.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../../i18n';
import type { ZodiacMode } from '../../lib/astro/ayanamsa';
import {
  EVENT_ASPECTS,
  EVENT_BODIES,
  ASPECT_ANGLE_DEG,
  searchEvent,
  searchRangeForYears,
  STATION_BODIES,
  type EventAspect,
  type EventBody,
  type StationBody,
} from '../../lib/astro/eventSearch';
import { foundEventOf, type FoundEvent } from '../../lib/astro/eventNaming';
import { ASPECT_GLYPHS, PLANET_GLYPHS, SIGN_GLYPHS } from '../../lib/astro/glyphChars';
import { jdToEpochMs } from '../../lib/astro/timeline';
import { MAX_ZONE_OFFSET_SECONDS } from '../../lib/atlas/zoneEntry';
import { isEphemerisDataVerified } from '../../lib/ephemeris';
import { BIRTH_YEAR_MAX, BIRTH_YEAR_MIN } from '../DateTimeFields/DateTimeFields';
import { HintMenu } from '../Sidebar/Sidebar';
import { InfoIcon } from '../ui/InfoIcon';
import { TipSpan } from '../ui/HoverTip';
import {
  aspectBlock,
  DEFAULT_PICK,
  FINDER_KINDS,
  foundPhrase,
  KIND_KEY,
  searchStart,
  specOfPick,
  utDate,
  utMinute,
  utSecond,
  type FinderAnchor,
  type FinderKind,
  type FinderPick,
} from './eventFinderModel';
import './EventFinder.css';

/** The years the form accepts, shrunk so a found moment's LOCAL date stays inside them in
 *  any zone (eventSearch searchRangeForYears) — the form's year check can never refuse it. */
const FORM_RANGE = searchRangeForYears(BIRTH_YEAR_MIN, BIRTH_YEAR_MAX, MAX_ZONE_OFFSET_SECONDS);

/** How long a search runs before the line says so. */
const SLOW_MS = 150;

const yearOfJd = (jd: number) => new Date(jdToEpochMs(jd)).getUTCFullYear();

export interface EventFinderProps {
  /** The panel's id, which Find… names in aria-controls. */
  id?: string;
  /** The moment the form holds, or null for now (eventFinderModel FinderAnchor). */
  anchor: FinderAnchor | null;
  /** The EFFECTIVE zodiac: an ingress is a body reaching a cusp of the zodiac the chart is
   *  read in (CLAUDE.md rule 5). */
  zodiac: ZodiacMode;
  /** A moment was found: the form fills its date and time and suggests a name and folder. */
  onFound(r: FoundEvent): void;
  /** Escape: the form closes the panel and puts the focus back on Find…. */
  onClose(): void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'searching'; fromJD: number }
  | { kind: 'none'; dir: 1 | -1; fromJD: number; limitJD: number }
  | { kind: 'found'; found: FoundEvent }
  | { kind: 'error' };

export function EventFinder({ id, anchor, zodiac, onFound, onClose }: EventFinderProps) {
  const { t, fmt, labels } = useT();
  const [pick, setPick] = useState<FinderPick>(DEFAULT_PICK);
  const spec = specOfPick(pick);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // The last moment found, kept across a change of what is searched: while the form still
  // shows it, the next search starts from its exact instant (eventFinderModel searchStart).
  const [last, setLast] = useState<FoundEvent | null>(null);
  // Past SLOW_MS, the year the search front has reached.
  const [slow, setSlow] = useState(false);
  const [reached, setReached] = useState<number | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const slowTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Opening the panel is a request to choose what to find: the kind menu takes the focus.
  useEffect(() => {
    rootRef.current?.querySelector<HTMLButtonElement>('.calc-menu-trigger')?.focus();
  }, []);

  // A search for something no longer asked for is abandoned, and so is any search when the
  // panel closes or the form unmounts. The key is what is searched, in the zodiac it is read in.
  const specKey = `${JSON.stringify(spec)}|${zodiac}`;
  useEffect(
    () => () => {
      ctrl.current?.abort();
      ctrl.current = null;
      if (slowTimer.current != null) window.clearTimeout(slowTimer.current);
      slowTimer.current = null;
    },
    [specKey],
  );

  /** A menu moved: the result line described the old search, so it clears. */
  const choose = (patch: Partial<FinderPick>) => {
    setPick((p) => ({ ...p, ...patch }));
    setStatus({ kind: 'idle' });
  };

  const run = async (dir: 1 | -1) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const start = searchStart(anchor, last, Date.now());
    setStatus({ kind: 'searching', fromJD: start.fromJD });
    setSlow(false);
    setReached(null);
    if (slowTimer.current != null) window.clearTimeout(slowTimer.current);
    slowTimer.current = window.setTimeout(() => {
      if (ctrl.current === c) setSlow(true);
    }, SLOW_MS);
    const mine = () => ctrl.current === c && !c.signal.aborted;
    try {
      const r = await searchEvent(spec, start.fromJD, dir, {
        zodiac,
        ...FORM_RANGE,
        marginSec: start.marginSec,
        signal: c.signal,
        onProgress: (jd) => {
          if (mine()) setReached(yearOfJd(jd));
        },
      });
      if ('aborted' in r || !mine()) {
        // Abandoned with no search after it (what is searched changed under it): the line
        // goes quiet rather than saying "Searching…" for ever.
        if (ctrl.current === null) setStatus({ kind: 'idle' });
        return;
      }
      if ('none' in r) {
        setStatus({ kind: 'none', dir, fromJD: start.fromJD, limitJD: r.limitJD });
        return;
      }
      const found = foundEventOf(r.found, t, fmt);
      setLast(found);
      setStatus({ kind: 'found', found });
      onFound(found);
    } catch {
      // Not an abort (that resolves); the engine itself failed — say so rather than nothing.
      if (mine()) setStatus({ kind: 'error' });
    } finally {
      if (ctrl.current === c) {
        ctrl.current = null;
        if (slowTimer.current != null) window.clearTimeout(slowTimer.current);
        slowTimer.current = null;
      }
    }
  };

  // ── The menus ──────────────────────────────────────────────────────────────────────────
  const bodyOption = <B extends EventBody>(b: B, why: string | null = null) => ({
    value: b,
    label: labels.planet(b),
    glyph: PLANET_GLYPHS[b],
    // A planet needs no explanation in a list of planets; a greyed one needs its reason.
    hint: why ?? '',
    disabled: why !== null,
  });
  /** Why `b` can't stand in an aspect's slot beside `other`, at the aspect chosen. */
  const pairReason = (b: EventBody, other: EventBody): string | null => {
    const block = aspectBlock(b, other, pick.aspect);
    if (!block) return null;
    return 'same' in block
      ? t('eventFinder.sameBody')
      : t('eventFinder.impossible', { a: labels.planet(b), b: labels.planet(other), deg: block.deg });
  };

  const kindMenu = (
    <HintMenu<FinderKind>
      value={pick.kind}
      onChange={(kind) => choose({ kind })}
      options={FINDER_KINDS.map((k) => ({
        value: k,
        label: t(`eventFinder.kind.${KIND_KEY[k]}`),
        hint: t(`eventFinder.kindHint.${KIND_KEY[k]}`),
      }))}
    />
  );

  const slot = (name: string) => {
    switch (name) {
      case 'body':
        return pick.kind === 'station' ? (
          <HintMenu<StationBody>
            value={pick.stationBody}
            onChange={(stationBody) => choose({ stationBody })}
            options={STATION_BODIES.map((b) => bodyOption(b))}
          />
        ) : (
          <HintMenu<EventBody>
            value={pick.body}
            onChange={(body) => choose({ body })}
            options={EVENT_BODIES.map((b) => bodyOption(b))}
          />
        );
      case 'sign':
        return (
          <HintMenu<string>
            value={String(pick.sign)}
            onChange={(v) => choose({ sign: v === 'any' ? 'any' : Number(v) })}
            options={[
              { value: 'any', label: t('eventFinder.anySign'), hint: t('eventFinder.anySignHint') },
              ...SIGN_GLYPHS.map((glyph, i) => ({ value: String(i), label: labels.sign(i), glyph, hint: '' })),
            ]}
          />
        );
      case 'turn':
        return (
          <HintMenu<'retrograde' | 'direct'>
            value={pick.turn}
            onChange={(turn) => choose({ turn })}
            options={(['retrograde', 'direct'] as const).map((v) => ({
              value: v,
              label: t(`eventFinder.turn.${v}`),
              hint: t(`eventFinder.turnHint.${v}`),
            }))}
          />
        );
      case 'a':
        return (
          <HintMenu<EventBody>
            value={pick.a}
            onChange={(a) => choose({ a })}
            options={EVENT_BODIES.map((b) => bodyOption(b, pairReason(b, pick.b)))}
          />
        );
      case 'b':
        return (
          <HintMenu<EventBody>
            value={pick.b}
            onChange={(b) => choose({ b })}
            options={EVENT_BODIES.map((b) => bodyOption(b, pairReason(b, pick.a)))}
          />
        );
      case 'aspect':
        return (
          <HintMenu<EventAspect>
            value={pick.aspect}
            onChange={(aspect) => choose({ aspect })}
            options={EVENT_ASPECTS.map((asp) => {
              const block = aspectBlock(pick.a, pick.b, asp);
              return {
                value: asp,
                label: t(`eventFinder.aspect.${asp}`),
                glyph: ASPECT_GLYPHS[asp],
                hint: t('eventFinder.aspectHint', { deg: ASPECT_ANGLE_DEG[asp] }),
                disabled: !!block && 'deg' in block,
                disabledHint:
                  block && 'deg' in block
                    ? t('eventFinder.impossible', { a: labels.planet(pick.a), b: labels.planet(pick.b), deg: block.deg })
                    : undefined,
              };
            })}
          />
        );
      default:
        return null;
    }
  };

  // The kind's sentence, split at its placeholders. A translation that dropped one still
  // gets its menu, after the words, so nothing becomes unpickable.
  const template =
    pick.kind === 'ingress' ? 'ingress' : pick.kind === 'station' ? 'station' : pick.kind === 'aspect' ? 'aspect' : null;
  const SLOTS: Record<'ingress' | 'station' | 'aspect', string[]> = {
    ingress: ['body', 'sign'],
    station: ['body', 'turn'],
    aspect: ['a', 'aspect', 'b'],
  };
  let pickLine: ReactNode = null;
  if (template) {
    const names = SLOTS[template];
    const marks = Object.fromEntries(names.map((n) => [n, `\u0000${n}\u0000`]));
    const parts = t(`eventFinder.pick.${template}`, marks).split('\u0000');
    const seen = new Set<string>();
    const nodes: ReactNode[] = [];
    // Odd parts are slot names (the text between a pair of markers), even parts the words.
    parts.forEach((part, i) => {
      if (i % 2 === 1 && names.includes(part) && !seen.has(part)) {
        seen.add(part);
        nodes.push(
          <div key={`s-${part}`} className="ef-slot">
            {slot(part)}
          </div>,
        );
      } else if (i % 2 === 0 && part.trim()) {
        nodes.push(
          <span key={`w-${i}`} className="ef-word">
            {part.trim()}
          </span>,
        );
      }
    });
    for (const n of names) {
      if (!seen.has(n)) {
        nodes.push(
          <div key={`s-${n}`} className="ef-slot">
            {slot(n)}
          </div>,
        );
      }
    }
    pickLine = <div className="ef-pick-line">{nodes}</div>;
  }

  // ── The lines ──────────────────────────────────────────────────────────────────────────
  const dateOf = (d: { year: number; month: number; day: number }) => fmt.date(d.year, d.month, d.day, 'medium');
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const anchorLine = !anchor
    ? t('eventFinder.fromNow')
    : anchor.clock
      ? t('eventFinder.fromAt', { date: dateOf(anchor.date), time: `${pad2(anchor.clock.hour)}:${pad2(anchor.clock.minute)}` })
      : t('eventFinder.from', { date: dateOf(anchor.date) });

  let statusLine = '';
  if (status.kind === 'searching') {
    statusLine = slow ? t('eventFinder.searching', { year: reached ?? yearOfJd(status.fromJD) }) : '';
  } else if (status.kind === 'none') {
    const from = dateOf(utDate(jdToEpochMs(status.fromJD)));
    const limit = dateOf(utDate(jdToEpochMs(status.limitJD)));
    statusLine = t('eventFinder.none', status.dir > 0 ? { start: from, end: limit } : { start: limit, end: from });
  } else if (status.kind === 'error') {
    statusLine = t('eventFinder.error');
  } else if (status.kind === 'found') {
    const f = status.found;
    statusLine = t('eventFinder.result', {
      what: foundPhrase(f.detail, t),
      date: dateOf(utDate(f.chartUtMs)),
      time: utMinute(f.chartUtMs),
    });
  }

  let exact: string | null = null;
  if (status.kind === 'found') {
    const f = status.found;
    const d = f.detail;
    exact =
      d.kind === 'ingress'
        ? t('eventFinder.exactTipIngress', {
            time: utSecond(f.utMs),
            minute: utMinute(f.chartUtMs),
            body: labels.planet(d.body),
            sign: labels.sign(d.sign),
          })
        : t('eventFinder.exactTip', { time: utSecond(f.utMs), minute: utMinute(f.chartUtMs) });
    // The Moshier fallback (main.tsx's boot could not verify the .se1 files): good to
    // seconds of arc, not to the second of time the tip just claimed.
    if (!isEphemerisDataVerified()) exact = `${exact} ${t('eventFinder.exactApprox')}`;
  }

  return (
    <div
      ref={rootRef}
      id={id}
      className="event-finder"
      role="group"
      aria-label={t('eventFinder.groupAria')}
      aria-busy={status.kind === 'searching' || undefined}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        // Stopped here: the chart window closes on an Escape it hears, and this one was
        // meant for the panel.
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="ef-pick">
        <div className="ef-slot ef-kind">{kindMenu}</div>
        {pickLine}
      </div>
      <p className="ef-anchor">{anchorLine}</p>
      <div className="ef-actions">
        <button type="button" className="ef-step" onClick={() => void run(-1)}>
          <span className="ef-chev" aria-hidden="true">
            ‹
          </span>
          <span>{t('eventFinder.previous')}</span>
        </button>
        <button type="button" className="ef-step ef-step--next" onClick={() => void run(1)}>
          <span>{t('eventFinder.next')}</span>
          <span className="ef-chev" aria-hidden="true">
            ›
          </span>
        </button>
      </div>
      <div className="ef-result-row">
        <p className="ef-result" role="status">
          {statusLine}
        </p>
        {exact && (
          <TipSpan
            className="ef-exact"
            tabIndex={0}
            // Read out whole: the tip is drawn for the eye, so the label carries what it says.
            role="img"
            aria-label={`${t('eventFinder.exactTitle')}. ${exact}`}
            placement="top"
            tapReveal
            tip={t('eventFinder.exactTitle')}
            hint={exact}
          >
            <InfoIcon size={12} />
          </TipSpan>
        )}
      </div>
    </div>
  );
}
