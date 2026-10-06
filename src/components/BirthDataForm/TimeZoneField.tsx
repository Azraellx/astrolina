// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The chart form's time-zone field, 2026-10-02. Birth data states its zone the
// way its source printed it — "EST + daylight", "5hw00", "4:56:02 W", "LMT" —
// and before this the form only took an IANA zone or a whole-hour UTC offset,
// so every one of those had to be translated by hand, which is exactly where a
// sign flips or a daylight hour goes in twice. Auto stays the default and works
// as it always has; the other four ways sit beside it on one switch.
//
// Every offset is written in BOTH notations, "UTC−5 · 5h W", because they run
// in opposite directions and a reader copying from a source in one should never
// have to convert to the other. The line under the control says what the
// entered clock means in UT, which is the one number the chart is cast from.
//
// State lives in useZoneEntry (it is read again on submit); this only draws it.
//
// Auto opens folded (2026-10-05, Salvatore): the detected zone and the UT line
// as a read-only summary, with a link on the right to unfold the rest — the
// coordinates' pattern, and since the same day their wording too: both links
// read "Set manually" (they had said "Automatic" and "Enter manually", two
// names for one gesture, one above the other). Most births need nothing
// else, and five ways of giving a zone up front read as a form to fill rather
// than an answer already given. A chart saved in any other way opens unfolded,
// in its own terms. Unfolding is one-way for the form's life and writes nothing.
//
// One list instead of five ways (2026-10-05, Salvatore): unfolded, the field
// was a form of its own — a five-way switch over two selects, a text box, an
// E/W switch, two chips and a search — in a pane people come to for a name, a
// date and a place. It now unfolds to ONE dropdown (the app's own, HintMenu —
// see ZonePickMenu for why not a native select): Automatic, the birthplace's
// local mean time, UT, and the named standard and daylight times, each row a
// whole answer as a birth record prints it ("Eastern Daylight (EDT)"). That
// covers what a source states nearly always; the typed offset, the IANA search,
// the whole-hour UTC picker and the war, double and half-hour corrections are
// hidden behind SHOW_ALL_ZONE_WAYS below, not removed. A chart saved in any of
// those terms still reopens in them — the list offers them back as "As saved" —
// and saves them back verbatim; imports and share links still carry them.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { DateTime } from 'luxon';
import {
  DAYLIGHT_OPTIONS,
  daylightSeconds,
  entrySeconds,
  formatAstroNotation,
  formatBothNotations,
  formatClock,
  localToUt,
  MAX_ZONE_OFFSET_SECONDS,
  OFFSET_TEXT_MAX,
  resolveZoneChoice,
  STANDARD_ZONES,
  standardZoneById,
  UTC_PICKER_HOURS,
  type DaylightCode,
  type ResolvedZone,
  type StandardZone,
  type ZoneChoice,
  type ZoneEntryMode,
  type ZoneMoment,
} from '../../lib/atlas/zoneEntry';
import { TipButton } from '../ui/HoverTip';
import { HintMenu } from '../Sidebar/Sidebar';
import { useT, type TFn } from '../../i18n';
import { ZoneSearchField } from './ZoneSearchField';
import type { ZoneEntryState } from './useZoneEntry';
import { pickOfValue, zonePickRows, zonePickValue, type ZonePickRow } from './zoneEntryModel';
import '../ui/SplitSelect.css';

// ── THE SWITCH ───────────────────────────────────────────────────────────────
// false: the field unfolds to the one list (2026-10-05). true: the five-way
// switch of 2026-10-02 comes back, every way's controls with it, exactly as it
// was — nothing below it was changed or removed, and the model, its verify
// script, the importer and the share link run the same either way. Bringing it
// back also wants the Help article's two time-zone paragraphs and the methods
// page's sentences on typed offsets restored (git history, 2026-10-05).
const SHOW_ALL_ZONE_WAYS = false as boolean;

const MODES: readonly ZoneEntryMode[] = ['auto', 'standard', 'offset', 'iana', 'utc'];

/** The select value for an imported standard offset that names no zone (no
 *  catalogue id can collide with it: ids are lower-case words and hyphens). */
const UNNAMED = '~unnamed';

/** "+1 h", "+2 h", "+0:30" — a daylight correction's size, from its seconds. */
function amountOf(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? `+${h}:${String(m).padStart(2, '0')}` : `+${h} h`;
}

/** A catalogue zone as the list shows it: offset in both notations, name,
 *  abbreviation, region — never the abbreviation alone, since CST, IST and BST
 *  each name several zones. The offset leads (2026-10-02): a closed select
 *  shows only its first thirty-odd characters, and at the end the offset was
 *  the part cut off. A region that only repeats the name is shown once; a
 *  current zone that began after 1900 says so. */
function zoneLabel(z: StandardZone, t: TFn): string {
  const region = z.region === z.name ? '' : ` · ${z.region}`;
  return `${formatBothNotations(z.std)} — ${z.name}${z.abbr ? ` (${z.abbr})` : ''}${region}${zoneSince(z, t)}`;
}

/** " · from 1946" on a current zone that began within living memory, so NZST
 *  isn't taken for the right name for an earlier birth. */
function zoneSince(z: StandardZone, t: TFn): string {
  return z.years?.length === 1 && z.years[0][1] >= 9999 && z.years[0][0] > 1900
    ? ` · ${t('chartForm.tz.standardSince', { year: z.years[0][0] })}`
    : '';
}

/** A row of the one list: offset first, then the name and abbreviation —
 *  "UTC−4 · 4h W — Eastern Daylight (EDT)". The places and the daylight step
 *  go in the row's hover tip (pickRowHint), which keeps the open list a column
 *  of names to scan rather than a wall of region lists. */
function pickRowLabel(r: ZonePickRow): string {
  return `${formatBothNotations(r.seconds)} — ${r.name}${r.abbr ? ` (${r.abbr})` : ''}`;
}

/** The row's tip: where a standard time is kept, or what a daylight time adds
 *  to which standard time (a daylight row names no places — StandardZone.dstName
 *  says why). */
function pickRowHint(r: ZonePickRow, t: TFn): string {
  const z = r.zone;
  const since = zoneSince(z, t);
  if (r.isDaylight) {
    return t('chartForm.tz.pickDaylightHint', {
      zone: `${z.name}${z.abbr ? ` (${z.abbr})` : ''}`,
      amount: amountOf(daylightSeconds(r.daylight)),
    });
  }
  return z.region === z.name
    ? t('chartForm.tz.pickStandardHintBare', { since })
    : t('chartForm.tz.pickStandardHint', { region: z.region, since });
}

/** A correction as the list names it: "Daylight saving +1 h". */
const daylightText = (code: DaylightCode, t: TFn) =>
  t(`chartForm.tz.daylight.${code}` as 'chartForm.tz.daylight.daylight', {
    amount: amountOf(daylightSeconds(code)),
  });

/** The terms a saved chart reopened in, for its "As saved" entry — the ones the
 *  list has no row for. Each ends on the offset they give at this moment. */
function savedTerms(c: ZoneChoice, at: ZoneMoment, t: TFn): string {
  const offset = formatBothNotations(resolveZoneChoice(c, at).seconds);
  switch (c.mode) {
    case 'iana':
      return `${c.zone} · ${offset}`;
    case 'offset':
      return c.text && c.text !== formatAstroNotation(c.seconds) ? `${c.text} · ${offset}` : offset;
    case 'standard': {
      const name = standardZoneById(c.zone)?.name ?? t('chartForm.tz.pickUnnamed');
      return `${name} · ${daylightText(c.daylight, t)} · ${offset}`;
    }
    default:
      return offset;
  }
}

/**
 * The unfolded field (2026-10-05): one list, each entry a whole answer.
 * Choosing is the whole action — there is nothing to confirm, and the line
 * under it says at once what the clock now means in UT.
 *
 * The app's own dropdown (HintMenu, as the Source rating and the Calculations
 * settings use), not a native <select>: a native one can only be styled shut —
 * the open list is drawn by the operating system and looks nothing like the
 * rest of the form — and HintMenu lets each row carry its places or its
 * daylight step as a hover tip, so the labels stay short.
 */
/** About a dozen rows: the list opens under the field, scrolled to the chosen
 *  zone, rather than covering the window from top to bottom. */
const ZONE_LIST_MAX_HEIGHT = 360;

function ZonePickMenu({ zone }: { zone: ZoneEntryState }) {
  const { t } = useT();
  const r = zone.resolved;
  const at = zone.at;
  if (!r || !at) return null;
  const value = zonePickValue(zone);
  const iana = r.detected?.iana ?? r.tzIana;
  const lmt = zone.lmtSeconds;
  const lmtUsable = zone.lmtAvailable && lmt != null;
  const options = [
    ...(zone.saved
      ? [
          {
            value: 'saved',
            label: t('chartForm.tz.pickSaved', { terms: savedTerms(zone.saved, at, t) }),
            hint: t('chartForm.tz.pickSavedHint'),
          },
        ]
      : []),
    {
      value: 'auto',
      label: iana ? t('chartForm.tz.pickAuto', { iana }) : t('chartForm.tz.modeTip.auto'),
      hint: t('chartForm.tz.modeHint.auto'),
    },
    {
      value: 'lmt',
      label: lmtUsable
        ? t('chartForm.tz.pickLmt', { offset: formatBothNotations(lmt) })
        : t('chartForm.tz.pickLmtName'),
      hint: lmtUsable
        ? t(zone.lmtShifted ? 'chartForm.tz.lmtHintShifted' : 'chartForm.tz.lmtHint', {
            offset: formatBothNotations(lmt),
          })
        : t('chartForm.tz.lmtTip'),
      disabled: !lmtUsable,
      disabledHint: t('chartForm.tz.lmtBeyond'),
    },
    { value: 'ut', label: t('chartForm.tz.pickUt'), hint: t('chartForm.tz.utHint') },
    ...zonePickRows(at.year, value).map((row, i) => ({
      value: row.value,
      label: pickRowLabel(row),
      hint: pickRowHint(row, t),
      section: i === 0 ? t('chartForm.tz.pickZones') : undefined,
    })),
  ];
  return (
    <div className="calc-select tz-pick">
      <HintMenu<string>
        value={value}
        listMaxHeight={ZONE_LIST_MAX_HEIGHT}
        onChange={(v) => {
          const pick = pickOfValue(v);
          if (pick) zone.choose(pick);
        }}
        options={options}
      />
    </div>
  );
}

/** The zone's own short name at the birth moment ("EDT"), where it has one; a
 *  bare "GMT+5:30" says nothing the offset beside it doesn't. */
function zoneAbbrev(iana: string | undefined, at: ZoneMoment): string {
  if (!iana) return '';
  const dt = DateTime.fromObject(
    { year: at.year, month: at.month, day: at.day, hour: at.hour, minute: at.minute },
    { zone: iana },
  );
  const name = dt.isValid ? (dt.setLocale('en-US').offsetNameShort ?? '') : '';
  return /^[A-Za-z]{2,6}$/.test(name) ? name : '';
}

/** Abbreviations that stand for more than one offset — CST is four zones in the
 *  catalogue, IST and AST two each — and so are never shown on their own. BST is
 *  added by hand: the catalogue's only BST is Bangladesh, because British Summer
 *  Time is GMT + daylight there (GMT deliberately has no dstAbbr), but it is the
 *  name every British source prints. */
const AMBIGUOUS_ABBRS: ReadonlySet<string> = (() => {
  const offsets = new Map<string, Set<number>>();
  const note = (abbr: string | undefined, seconds: number) => {
    if (!abbr) return;
    const key = abbr.toUpperCase();
    const set = offsets.get(key) ?? new Set<number>();
    set.add(seconds);
    offsets.set(key, set);
  };
  for (const z of STANDARD_ZONES) {
    note(z.abbr, z.std);
    note(z.dstAbbr, z.std + daylightSeconds(z.dstCode ?? 'daylight'));
  }
  const out = new Set(['BST']);
  for (const [abbr, set] of offsets) if (set.size > 1) out.add(abbr);
  return out;
})();

/** The label after the clock in the confirmation line: "EDT", "LMT", "UT", or
 *  nothing where the offset is the whole story — including where the only name
 *  to hand is an abbreviation several zones share. */
function confirmLabel(choice: ZoneChoice, r: ResolvedZone, at: ZoneMoment): string {
  if (r.lmt) return 'LMT';
  let abbr = '';
  switch (choice.mode) {
    case 'auto':
    case 'iana':
      abbr = zoneAbbrev(r.tzIana, at);
      break;
    case 'standard': {
      // The daylight name only on the correction it names: LHDT is Lord Howe
      // + half an hour, never + 1 h.
      const z = standardZoneById(choice.zone);
      if (z && choice.daylight === 'standard') abbr = z.abbr ?? '';
      else if (z && choice.daylight === (z.dstCode ?? 'daylight')) abbr = z.dstAbbr ?? '';
      break;
    }
    case 'offset':
      return choice.basis === 'ut' ? 'UT' : '';
  }
  return abbr && !AMBIGUOUS_ABBRS.has(abbr.toUpperCase()) ? abbr : '';
}

interface SegOption<V extends string> {
  value: V;
  label: string;
  /** Hover headline, and the segment's accessible name. */
  tip: string;
  hint: string;
}

/**
 * A row of mutually exclusive segments in the SplitSelect capsule (same
 * stylesheet), as a proper radio group: one tab stop, the arrows move AND
 * choose, Home/End jump. Written here rather than reusing SplitSelect because
 * that one names its halves by their visible label alone, and "UTC" or
 * "Standard" alone doesn't tell a screen-reader user what is being chosen.
 * Unavailable keeps every segment visible and dimmed, its reason on hover.
 */
function SegmentedRadios<V extends string>({
  options,
  value,
  onSelect,
  ariaLabel,
  disabled,
  disabledHint,
  className,
}: {
  options: readonly SegOption<V>[];
  value: V;
  onSelect: (v: V) => void;
  ariaLabel: string;
  disabled?: boolean;
  disabledHint?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = options.length;
    const step: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next: number;
    if (e.key in step) next = (idx + step[e.key] + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else return;
    e.preventDefault();
    if (disabled) return;
    onSelect(options[next].value);
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <div
      ref={ref}
      className={`split-select${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => (
        <TipButton
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.tip}
          aria-disabled={disabled || undefined}
          tabIndex={i === idx ? 0 : -1}
          className={`split-select-seg${o.value === value ? ' is-on' : ''}${disabled ? ' ui-inert' : ''}`}
          onClick={disabled ? undefined : () => onSelect(o.value)}
          note={disabled ? disabledHint : undefined}
          unavailable={disabled}
          placement="top"
          tip={o.tip}
          hint={o.hint}
        >
          <span className="split-select-label">{o.label}</span>
        </TipButton>
      ))}
    </div>
  );
}

/** What "Kept as saved" names as the terms that would now give another offset:
 *  the way the chart was saved in, not always Auto (2026-10-02, found in
 *  review — a chart saved on Asia/Karachi was told Auto had moved). */
function keptNote(kept: NonNullable<ZoneEntryState['kept']>, t: TFn): string {
  const { was, now } = kept;
  if (!was || now == null) return t('chartForm.tz.keptAsSavedUnread');
  const offset = formatBothNotations(now);
  switch (was.mode) {
    case 'auto':
      return t('chartForm.tz.keptAsSaved', { offset });
    case 'iana':
      return t('chartForm.tz.keptAsSavedZone', { zone: was.zone, offset });
    case 'utc':
      return t('chartForm.tz.keptAsSavedUtc', { offset });
    default:
      return t('chartForm.tz.keptAsSavedTerms', { offset });
  }
}

export function TimeZoneField({
  zone,
  hasPlace,
  noTime,
}: {
  zone: ZoneEntryState;
  hasPlace: boolean;
  /** The time was left empty: the line says noon stands in for it. */
  noTime: boolean;
}) {
  const { t } = useT();
  const uid = useId();
  const captionId = `${uid}-caption`;
  const confirmId = `${uid}-confirm`;
  const r = zone.resolved;
  const at = zone.at;
  const ready = hasPlace && !!r && !!at;
  const live = zone.choice;

  // Folded only while the way is Auto: the mode can only leave Auto from the
  // unfolded switch, and a chart reopened in other terms (a fall-back to its
  // stored number included) starts unfolded, so nothing the reader set or must
  // act on is ever folded away.
  const [unfolded, setUnfolded] = useState(() => zone.mode !== 'auto');
  const folded = !unfolded && zone.mode === 'auto';
  // The link unmounts as it unfolds, so focus moves to the list (or the
  // switch's checked segment) rather than dropping to the page.
  const fieldRef = useRef<HTMLDivElement>(null);
  const focusOnUnfold = useRef(false);
  useEffect(() => {
    if (!unfolded || !focusOnUnfold.current) return;
    focusOnUnfold.current = false;
    fieldRef.current
      ?.querySelector<HTMLElement>(
        SHOW_ALL_ZONE_WAYS ? '.tz-modes [role="radio"][aria-checked="true"]' : '.tz-pick .calc-menu-trigger',
      )
      ?.focus();
  }, [unfolded]);
  const unfold = () => {
    focusOnUnfold.current = true;
    setUnfolded(true);
  };

  const modeOptions: SegOption<ZoneEntryMode>[] = MODES.map((m) => ({
    value: m,
    label: t(`chartForm.tz.mode.${m}` as 'chartForm.tz.mode.auto'),
    tip: t(`chartForm.tz.modeTip.${m}` as 'chartForm.tz.modeTip.auto'),
    hint: t(`chartForm.tz.modeHint.${m}` as 'chartForm.tz.modeHint.auto'),
  }));

  if (zone.locked) {
    return (
      <div className="tz-field" role="group" aria-labelledby={captionId}>
        <span className="tz-caption" id={captionId}>
          {t('chartForm.timeZone')}
        </span>
        <p className="tz-fixed">{t('chartForm.tz.composite')}</p>
      </div>
    );
  }

  const offsetBad = ready && zone.mode === 'offset' && zone.error === 'offset';
  const rangeBad = ready && zone.error === 'range';

  let body: ReactNode = null;
  if (ready && r && at) {
    switch (zone.mode) {
      case 'auto':
        body = (
          <p className="tz-detected">
            {t('chartForm.tz.detected', { iana: r.detected?.iana ?? r.tzIana ?? '' })}
          </p>
        );
        break;
      case 'standard': {
        const std = live.mode === 'standard' ? live : null;
        body = (
          <>
            <div className="tz-row">
              <select
                className="tz-select tz-standard-select"
                aria-label={t('chartForm.tz.standardLabel')}
                value={std ? (std.zone ?? UNNAMED) : ''}
                onChange={(e) => zone.pickStandard(e.target.value === UNNAMED ? null : e.target.value)}
              >
                {!std && (
                  <option value="" disabled>
                    {t('chartForm.tz.standardPick')}
                  </option>
                )}
                {zone.unnamedStd != null && (
                  <option value={UNNAMED}>
                    {t('chartForm.tz.standardUnnamed', { offset: formatBothNotations(zone.unnamedStd) })}
                  </option>
                )}
                {STANDARD_ZONES.map((z) => (
                  <option key={z.id} value={z.id}>
                    {zoneLabel(z, t)}
                  </option>
                ))}
              </select>
              <select
                className="tz-select tz-daylight-select"
                aria-label={t('chartForm.tz.daylightLabel')}
                value={std?.daylight ?? 'standard'}
                disabled={!std}
                onChange={(e) => zone.setDaylight(e.target.value as DaylightCode)}
              >
                {DAYLIGHT_OPTIONS.map((o) => (
                  <option
                    key={o.code}
                    value={o.code}
                    // No zone is more than 15 hours from UT: Line Islands +
                    // double summer time would be UTC+16.
                    disabled={!!std && Math.abs(std.std + o.seconds) > MAX_ZONE_OFFSET_SECONDS}
                  >
                    {t(`chartForm.tz.daylight.${o.code}` as 'chartForm.tz.daylight.daylight', {
                      amount: amountOf(o.seconds),
                    })}
                  </option>
                ))}
              </select>
            </div>
            {!std && <p className="tz-note">{t('chartForm.tz.standardNone')}</p>}
          </>
        );
        break;
      }
      case 'offset': {
        const basis = live.mode === 'offset' ? live.basis : undefined;
        const lmt = zone.lmtSeconds;
        const lmtHint =
          lmt == null
            ? undefined
            : t(zone.lmtShifted ? 'chartForm.tz.lmtHintShifted' : 'chartForm.tz.lmtHint', {
                offset: formatBothNotations(lmt),
              });
        body = (
          <>
            <div className="tz-row tz-offset-row">
              <input
                type="text"
                className="tz-offset-input"
                value={zone.offsetText}
                onChange={(e) => zone.typeOffset(e.target.value)}
                placeholder={t('chartForm.tz.offsetPlaceholder')}
                aria-label={t('chartForm.tz.offsetLabel')}
                aria-invalid={offsetBad || undefined}
                aria-describedby={confirmId}
                maxLength={OFFSET_TEXT_MAX}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <SegmentedRadios
                className="tz-direction"
                ariaLabel={t('chartForm.tz.directionAria')}
                value={zone.offsetDirection}
                onSelect={zone.setDirection}
                disabled={zone.directionStated}
                disabledHint={t('chartForm.tz.directionStated')}
                options={[
                  { value: 'east', label: t('chartForm.tz.east'), tip: t('chartForm.tz.eastTip'), hint: t('chartForm.tz.eastHint') },
                  { value: 'west', label: t('chartForm.tz.west'), tip: t('chartForm.tz.westTip'), hint: t('chartForm.tz.westHint') },
                ]}
              />
              <div className="tz-offset-actions">
                <TipButton
                  type="button"
                  className={`tz-chip${zone.lmtAvailable ? '' : ' ui-inert'}`}
                  aria-pressed={basis === 'lmt'}
                  aria-disabled={!zone.lmtAvailable || undefined}
                  onClick={zone.lmtAvailable ? zone.takeLmt : undefined}
                  placement="top"
                  tip={t('chartForm.tz.lmtTip')}
                  hint={lmtHint}
                  unavailable={!zone.lmtAvailable}
                  note={zone.lmtAvailable ? undefined : t('chartForm.tz.lmtBeyond')}
                >
                  {t('chartForm.tz.lmtButton')}
                </TipButton>
                <TipButton
                  type="button"
                  className="tz-chip"
                  aria-pressed={basis === 'ut'}
                  onClick={zone.takeUt}
                  placement="top"
                  tip={t('chartForm.tz.utTip')}
                  hint={t('chartForm.tz.utHint')}
                >
                  {t('chartForm.tz.utButton')}
                </TipButton>
              </div>
            </div>
            {zone.pending && r && (
              <p className="tz-note">
                {t('chartForm.tz.offsetNone', { offset: formatBothNotations(r.seconds) })}
              </p>
            )}
          </>
        );
        break;
      }
      case 'iana':
        body = (
          <ZoneSearchField
            value={live.mode === 'iana' ? live.zone : ''}
            detected={
              r.detected
                ? {
                    iana: r.detected.iana,
                    seconds: Math.round(r.detected.offsetHours * 3600) || 0,
                  }
                : undefined
            }
            at={at}
            onPick={zone.pickIana}
          />
        );
        break;
      case 'utc':
        body = (
          <>
            <div className="tz-row">
              <select
                className="tz-select tz-utc-select"
                aria-label={t('chartForm.tz.utcLabel')}
                value={live.mode === 'utc' ? String(live.hours) : ''}
                onChange={(e) => zone.pickUtc(Number(e.target.value))}
              >
                {live.mode !== 'utc' && (
                  <option value="" disabled>
                    {t('chartForm.tz.utcPick')}
                  </option>
                )}
                {UTC_PICKER_HOURS.map((h) => (
                  <option key={h} value={String(h)}>
                    {formatBothNotations(h * 3600)}
                  </option>
                ))}
              </select>
            </div>
            {live.mode !== 'utc' && (
              <p className="tz-note">
                {t('chartForm.tz.utcNone', { offset: formatBothNotations(r.seconds) })}
              </p>
            )}
          </>
        );
        break;
    }
  }

  // The confirmation: what the entered clock means in UT. Replaced by the
  // reason when the offset can't be used; absent while a way is pending.
  let confirm: string | null = null;
  if (ready && r && at && !zone.pending && !offsetBad && !rangeBad) {
    const label = confirmLabel(live, r, at);
    const clock = formatClock(at.hour, at.minute);
    const u = localToUt(at.hour, at.minute, r.seconds);
    const vars = {
      local: label ? `${clock} ${label}` : clock,
      offset: formatBothNotations(r.seconds),
      ut: formatClock(u.hour, u.minute, u.second),
    };
    const line = t(
      u.dayShift > 0
        ? 'chartForm.tz.confirmNextDay'
        : u.dayShift < 0
          ? 'chartForm.tz.confirmPrevDay'
          : 'chartForm.tz.confirm',
      vars,
    );
    confirm = noTime ? t('chartForm.tz.confirmNoTime', { line }) : line;
  }
  const problem = offsetBad
    ? t('chartForm.tz.offsetUnread')
    : rangeBad && (live.mode === 'standard' || live.mode === 'offset')
      ? t('chartForm.tz.offsetRange', { offset: formatBothNotations(entrySeconds(live)) })
      : null;

  // The notes Auto always had: its mean-time era, and the DST-history warning.
  // The warning shows the flag saving will write (zone.flag): a lookup's, kept
  // by a way that was only switched to; never a stated offset's.
  const showLmt = ready && !zone.pending && zone.mode === 'auto' && !!r?.lmt;
  const showDst = ready && !zone.pending && zone.flag;

  const prompt = hasPlace ? t('chartForm.tz.setDate') : t('chartForm.tz.setPlace');

  return (
    <div ref={fieldRef} className="tz-field" role="group" aria-labelledby={captionId}>
      {folded ? (
        // The coordinates' summary row (.coord-summary): caption, value, and the
        // link pushed to the right edge — offered only once there is a detected
        // zone to change, as the coordinates' link waits for coordinates.
        <div className="coord-summary tz-summary">
          <span className="coord-summary-item">
            <span className="coord-summary-label" id={captionId}>
              {t('chartForm.timeZone')}
            </span>
            {ready && r && (
              <span className="coord-summary-value tz-summary-zone">
                {r.detected?.iana ?? r.tzIana ?? formatBothNotations(r.seconds)}
              </span>
            )}
          </span>
          {ready && (
            <button
              type="button"
              className="coord-edit-link"
              aria-label={t('chartForm.tz.setManuallyAria')}
              onClick={unfold}
            >
              {t('chartForm.tz.setManually')}
            </button>
          )}
        </div>
      ) : (
        <>
          <span className="tz-caption" id={captionId}>
            {t('chartForm.timeZone')}
          </span>
          {SHOW_ALL_ZONE_WAYS && (
            <SegmentedRadios
              className="tz-modes"
              ariaLabel={t('chartForm.tz.modesAria')}
              value={zone.mode}
              onSelect={zone.setMode}
              disabled={!ready}
              disabledHint={prompt}
              options={modeOptions}
            />
          )}
        </>
      )}
      {!ready ? (
        <p className="tz-prompt">{prompt}</p>
      ) : folded ? null : SHOW_ALL_ZONE_WAYS ? (
        body
      ) : (
        <ZonePickMenu zone={zone} />
      )}
      {ready && (
        <p
          id={confirmId}
          className={`tz-confirm${problem ? ' is-error' : ''}`}
          aria-live="polite"
          hidden={!confirm && !problem}
        >
          {problem ?? confirm}
        </p>
      )}
      {(showLmt || showDst) && (
        <p className="tz-note">
          {showLmt && <span>{t('chartForm.tz.lmt')}</span>}
          {showLmt && showDst && <span> · </span>}
          {showDst && <span className="tz-warn">⚠ {t('chartForm.tz.verifyDst')}</span>}
        </p>
      )}
      {ready && zone.kept && !zone.pending && <p className="tz-note">{keptNote(zone.kept, t)}</p>}
    </div>
  );
}
