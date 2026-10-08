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
// State lives in useZoneEntry (it is read again on submit); this only draws it.
//
// Auto opens folded (2026-10-05, Salvatore): a read-only summary, with a link on
// the right to unfold the rest — the coordinates' pattern, and since the same
// day their wording too: both links read "Set manually" (they had said
// "Automatic" and "Enter manually", two names for one gesture, one above the
// other). Most births need nothing else, and five ways of giving a zone up
// front read as a form to fill rather than an answer already given.
//
// One list instead of five ways (2026-10-05, Salvatore): unfolded, the field
// was a form of its own — a five-way switch over two selects, a text box, an
// E/W switch, two chips and a search — in a pane people come to for a name, a
// date and a place. It unfolded to ONE dropdown (the app's own, HintMenu — see
// ZonePickMenu for why not a native select) of Automatic, the birthplace's
// local mean time, UT, and the named standard and daylight times.
//
// Lina's radios (2026-10-07, her entry-form spec of 6 October; Salvatore chose
// them). The row names the zone IN FORCE for the entered date — "Eastern
// Daylight Time · EDT (UTC−04:00)", live as the date changes — because it is
// the reader's only check that daylight saving was resolved; the IANA id it
// showed ("America/New_York") answered neither question. No line under it:
// the date and the birthplace are on the same screen, so saying where the zone
// came from adds nothing. "Set manually" unfolds two plausible zones — the one
// in force (Automatic) and the other half of the place's standard/daylight
// pair — plus a custom offset: the real question is "was DST applied?", and a
// long list is where people mis-pick. An override is said on the row ("·
// Manual override"), stays put when the date or place moves, and is flagged —
// never reverted — when it stops fitting them.
//
// Every offset is printed in the ISO form only, "UTC−04:00" (Lina, 2026-10-06).
// The astrological "4h W" runs the other way, and showing both put two opposite
// notations on one line; the readback "… = 13:30 UT" went with it, its job now
// done by the 12-hour echo beside the time. The parser still READS "5hw00" and
// "4:56:02 W" — sources print them. The list and the five ways stay in the code
// behind the switches below; they keep their own notation, being hidden.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  DAYLIGHT_OPTIONS,
  daylightSeconds,
  entrySeconds,
  formatAstroNotation,
  formatBothNotations,
  formatUtcNotation,
  MAX_ZONE_OFFSET_SECONDS,
  OFFSET_TEXT_MAX,
  resolveZoneChoice,
  STANDARD_ZONES,
  standardZoneById,
  UTC_PICKER_HOURS,
  type DaylightCode,
  type StandardZone,
  type ZoneChoice,
  type ZoneEntryMode,
  type ZoneMoment,
} from '../../lib/atlas/zoneEntry';
import { formatZoneLabel, formatZoneLong, type ZoneName } from '../../lib/atlas/zoneName';
import { TipButton, TipSpan } from '../ui/HoverTip';
import { WarningIcon } from '../ui/WarningIcon';
import { HintMenu } from '../Sidebar/Sidebar';
import { useT, type TFn } from '../../i18n';
import { ZoneSearchField } from './ZoneSearchField';
import type { ZoneEntryState } from './useZoneEntry';
import {
  choiceFields,
  customOffsetText,
  pickOfValue,
  zoneNameOf,
  zonePickRows,
  zonePickValue,
  type ZonePickRow,
  type ZoneRadio,
} from './zoneEntryModel';
import '../ui/SplitSelect.css';

// ── THE SWITCHES ─────────────────────────────────────────────────────────────
// Both false: the field unfolds to Lina's radios (2026-10-07). SHOW_ZONE_LIST
// brings back the one list of 2026-10-05; SHOW_ALL_ZONE_WAYS the five-way
// switch of 2026-10-02, every way's controls with it, exactly as it was (it
// wins if both are on). Nothing behind them was removed, and the model, its
// verify script, the importer and the share link run the same whichever is on.
// Bringing either back also wants the Help article's time-zone paragraphs and
// the methods page's sentences on typed offsets restored (git history,
// 2026-10-05 and 2026-10-07).
const SHOW_ALL_ZONE_WAYS = false as boolean;
const SHOW_ZONE_LIST = false as boolean;
const RADIOS = !SHOW_ALL_ZONE_WAYS && !SHOW_ZONE_LIST;

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

/** The terms a saved chart reopened in, for the list's "As saved" entry — the
 *  ones the list has no row for. Each ends on the offset they give at this
 *  moment. (The list's own notation; the radios name the zone instead.) */
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
 * The one list (2026-10-05; behind SHOW_ZONE_LIST since 2026-10-07): each entry
 * a whole answer. Choosing is the whole action — there is nothing to confirm.
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

/** The names every row of the field prints, worked out together — each one a
 *  call into the shared naming rule. */
interface RowNames {
  /** The zone the field will save (the summary row). */
  row: ZoneName;
  auto: ZoneName | null;
  other: ZoneName | null;
  saved: ZoneName | null;
  stated: ZoneName | null;
}

/**
 * The radios (2026-10-07). Native radio inputs sharing one name, so the group
 * is one tab stop, the arrows move and choose, and every row is its label —
 * with nothing hand-rolled to get wrong for a screen reader or a thumb.
 *
 * A pick made with a pointer folds the chooser, and the row above then states
 * the result (Lina: "the same row states it plainly, and the link remains so
 * the chooser can be reopened"). An arrow key only chooses: the arrows are how
 * a keyboard reads the rows, and folding on the first press would close the
 * list under them; Enter or Escape folds it. Custom never folds on its own
 * click — it hands the pointer to the box beside it, where the work is.
 */
function ZoneRadios({
  zone,
  names,
  id,
  captionId,
  problemId,
  onDone,
}: {
  zone: ZoneEntryState;
  names: RowNames;
  id: string;
  captionId: string;
  problemId: string;
  onDone: () => void;
}) {
  const { t } = useT();
  const uid = useId();
  const customLabelId = `${uid}-custom`;
  const customRef = useRef<HTMLInputElement>(null);
  // Set by a pointer press anywhere in the group, cleared by any key: the
  // click a radio gets from an arrow key is otherwise indistinguishable.
  const pointer = useRef(false);
  const c = zone.chooser;
  const r = zone.resolved;
  if (!c || !r) return null;

  const pick = (key: ZoneRadio) => {
    switch (key) {
      case 'auto':
        zone.choose('auto');
        break;
      case 'other':
        if (c.other) zone.choose({ zone: c.other.zone.id, daylight: c.other.daylight });
        break;
      case 'saved':
        zone.choose('saved');
        break;
      case 'custom':
        // Opens on the offset in effect, so choosing the row changes nothing
        // until something is typed — and what is typed starts from a number
        // that reads back exactly.
        if (c.value !== 'custom') zone.choose({ custom: customOffsetText(r.seconds) });
        break;
      case 'stated':
        // Already in effect: the row exists only while it is.
        break;
    }
  };

  const radio = (key: ZoneRadio, labelledBy?: string) => (
    <input
      type="radio"
      className="tz-choice-radio"
      name={uid}
      checked={c.value === key}
      aria-labelledby={labelledBy}
      onChange={() => pick(key)}
      onClick={() => {
        if (!pointer.current) return;
        pointer.current = false;
        if (key === 'custom') {
          customRef.current?.focus();
          customRef.current?.select();
        } else onDone();
      }}
      onKeyDown={(e) => {
        // Enter would submit the whole form from a radio.
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (key === 'custom') customRef.current?.focus();
        else onDone();
      }}
    />
  );

  const row = (key: ZoneRadio, label: string) => (
    <label key={key} className={`tz-choice${c.value === key ? ' is-on' : ''}`}>
      {radio(key)}
      <span className="tz-choice-text">{label}</span>
    </label>
  );

  const customBad = c.value === 'custom' && (zone.error === 'offset' || zone.error === 'direction');

  return (
    <div
      className="tz-choices"
      id={id}
      role="radiogroup"
      aria-labelledby={captionId}
      onPointerDown={() => {
        pointer.current = true;
      }}
      onKeyDown={(e) => {
        pointer.current = false;
        if (e.key === 'Escape') {
          // The chooser closes, not the pane it sits in.
          e.preventDefault();
          e.stopPropagation();
          onDone();
        }
      }}
    >
      {names.auto && row('auto', t('chartForm.tz.chooseAuto', { zone: formatZoneLong(names.auto) }))}
      {c.other && names.other && row('other', formatZoneLong(names.other))}
      {c.saved && names.saved && row('saved', t('chartForm.tz.pickSaved', { terms: formatZoneLong(names.saved) }))}
      {c.stated && names.stated && row('stated', t('chartForm.tz.chooseStated', { zone: formatZoneLong(names.stated) }))}
      <div className={`tz-choice tz-choice-custom${c.value === 'custom' ? ' is-on' : ''}`}>
        <label className="tz-choice-label">
          {radio('custom', customLabelId)}
          <span className="tz-choice-text" id={customLabelId}>
            {t('chartForm.tz.customLabel')}
          </span>
        </label>
        <input
          ref={customRef}
          type="text"
          className="tz-custom-input"
          value={c.value === 'custom' ? zone.offsetText : ''}
          onChange={(e) => zone.choose({ custom: e.target.value })}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (!zone.error) onDone();
          }}
          placeholder={t('chartForm.tz.customPlaceholder')}
          aria-labelledby={customLabelId}
          aria-invalid={customBad || undefined}
          aria-describedby={problemId}
          maxLength={OFFSET_TEXT_MAX}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

/** A compact ⚠ on the row: the fact is the tip, the mark only says there is
 *  one. Focusable, and named for a screen reader (the tip card is aria-hidden). */
function ZoneMark({ tip, hint, className }: { tip: string; hint: string; className: string }) {
  return (
    <TipSpan
      className={`tz-mark ${className}`}
      tabIndex={0}
      role="img"
      aria-label={`${tip} ${hint}`}
      placement="top"
      tapReveal
      tip={tip}
      hint={hint}
    >
      <WarningIcon size={12} />
    </TipSpan>
  );
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
 *  review — a chart saved on Asia/Karachi was told Auto had moved). What they
 *  would give is named the way the row names a zone (2026-10-07). */
function keptNote(kept: NonNullable<ZoneEntryState['kept']>, at: ZoneMoment, t: TFn): string {
  const { was, now } = kept;
  if (!was || now == null) return t('chartForm.tz.keptAsSavedUnread');
  const name = formatZoneLabel(zoneNameOf(at, choiceFields(was, at)));
  switch (was.mode) {
    case 'auto':
      return t('chartForm.tz.keptAsSaved', { now: name });
    case 'iana':
      return t('chartForm.tz.keptAsSavedZone', { zone: was.zone, now: name });
    case 'utc':
      return t('chartForm.tz.keptAsSavedUtc', { now: name });
    default:
      return t('chartForm.tz.keptAsSavedTerms', { now: name });
  }
}

export function TimeZoneField({ zone, hasPlace }: { zone: ZoneEntryState; hasPlace: boolean }) {
  const { t } = useT();
  const uid = useId();
  const captionId = `${uid}-caption`;
  const problemId = `${uid}-problem`;
  const chooserId = `${uid}-chooser`;
  const r = zone.resolved;
  const at = zone.at;
  const ready = hasPlace && !!r && !!at;
  const live = zone.choice;

  // The radios start closed, override or not: the row states the zone either
  // way. The older ways open on a chart saved in other terms, as they did.
  const [open, setOpen] = useState(() => !RADIOS && zone.mode !== 'auto');
  const fieldRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLButtonElement>(null);
  // Opening moves focus into what opened (the checked radio), so a keyboard
  // lands where the choice is rather than back at the top of the page.
  const focusOnOpen = useRef(false);
  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    fieldRef.current
      ?.querySelector<HTMLElement>(
        SHOW_ALL_ZONE_WAYS
          ? '.tz-modes [role="radio"][aria-checked="true"]'
          : SHOW_ZONE_LIST
            ? '.tz-pick .calc-menu-trigger'
            : '.tz-choices input[type="radio"]:checked',
      )
      ?.focus();
  }, [open]);
  const toggle = () => {
    focusOnOpen.current = !open;
    setOpen(!open);
  };
  // Folding takes focus back to the link, which stays — the chooser it left
  // is gone.
  const fold = () => {
    setOpen(false);
    linkRef.current?.focus();
  };

  const { toSave, chooser } = zone;
  const names = useMemo<RowNames | null>(() => {
    if (!r || !at) return null;
    // The row names what will be saved: an untouched record's own fields,
    // otherwise the zone as resolved.
    const row = zoneNameOf(at, toSave ?? { tzOffset: r.seconds / 3600, tzIana: r.tzIana, tzEntry: r.tzEntry });
    if (!chooser) return { row, auto: null, other: null, saved: null, stated: null };
    const { auto, other, saved, stated } = chooser;
    return {
      row,
      auto: zoneNameOf(at, { tzOffset: auto.seconds / 3600, tzIana: auto.tzIana, tzEntry: auto.tzEntry }),
      other: other
        ? zoneNameOf(at, choiceFields({ mode: 'standard', std: other.zone.std, daylight: other.daylight, zone: other.zone.id }, at))
        : null,
      saved: saved ? zoneNameOf(at, choiceFields(saved, at)) : null,
      stated: stated ? zoneNameOf(at, choiceFields(stated, at)) : null,
    };
  }, [r, at, toSave, chooser]);

  const modeOptions: SegOption<ZoneEntryMode>[] = MODES.map((m) => ({
    value: m,
    label: t(`chartForm.tz.mode.${m}` as 'chartForm.tz.mode.auto'),
    tip: t(`chartForm.tz.modeTip.${m}` as 'chartForm.tz.modeTip.auto'),
    hint: t(`chartForm.tz.modeHint.${m}` as 'chartForm.tz.modeHint.auto'),
  }));

  if (zone.locked) {
    return (
      <div className="tz-field" role="group" aria-labelledby={captionId}>
        <div className="coord-summary tz-summary">
          <span className="coord-summary-label" id={captionId}>
            {t('chartForm.timeZone')}
          </span>
          <span className="tz-fixed">{t('chartForm.tz.composite')}</span>
        </div>
      </div>
    );
  }

  const offsetBad = ready && zone.mode === 'offset' && zone.error === 'offset';
  const rangeBad = ready && zone.error === 'range';

  // The five ways' own controls (SHOW_ALL_ZONE_WAYS). Auto has none: the row
  // above names its zone.
  let body: ReactNode = null;
  if (SHOW_ALL_ZONE_WAYS && ready && r && at) {
    switch (zone.mode) {
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
                aria-describedby={problemId}
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

  // Why saving must wait, where the field can say. A way still pending says
  // so in its own controls (the hidden ways); the radios never leave one.
  const problem = !ready
    ? null
    : zone.error === 'direction'
      ? t('chartForm.tz.offsetDirection')
      : offsetBad
        ? t('chartForm.tz.offsetUnread')
        : rangeBad && (live.mode === 'standard' || live.mode === 'offset')
          ? t('chartForm.tz.offsetRange', { offset: formatUtcNotation(entrySeconds(live), { padded: true }) })
          : RADIOS && zone.error === 'pending'
            ? t('chartForm.tz.errorPending')
            : null;

  // The DST-history warning shows the flag saving will write (zone.flag): a
  // lookup's, kept by a way that was only switched to; never a stated offset's.
  const showDst = ready && !zone.pending && zone.flag;
  const showKept = ready && !!zone.kept && !zone.pending && !!at;
  // "Manual override" names a zone the reader (or the record) stated. A record
  // kept on its stored number says what it is in the note under the row
  // instead — nobody overrode anything there.
  const suffix = zone.overridden && !showKept ? t('chartForm.tz.manualOverride') : null;

  const prompt = hasPlace ? t('chartForm.tz.setDate') : t('chartForm.tz.setPlace');

  return (
    <div ref={fieldRef} className="tz-field" role="group" aria-labelledby={captionId}>
      {/* The coordinates' summary row (.coord-summary): caption, value, and the
          link pushed to the right edge — offered once there is a zone to
          change, as the coordinates' link waits for coordinates. */}
      <div className="coord-summary tz-summary">
        <span className="coord-summary-label" id={captionId}>
          {t('chartForm.timeZone')}
        </span>
        {ready && names ? (
          <span className="coord-summary-value tz-summary-zone">
            {formatZoneLong(names.row)}
            {suffix && (
              <span className="tz-summary-note">
                {' · '}
                <span className="tz-summary-suffix">{suffix}</span>
              </span>
            )}
            {showDst && (
              <ZoneMark className="tz-mark-dst" tip={t('chartForm.tz.verifyDst')} hint={t('chartForm.tz.verifyDstHint')} />
            )}
            {zone.implausible && (
              <ZoneMark
                className="tz-mark-implausible"
                tip={t('chartForm.tz.implausible')}
                hint={t('chartForm.tz.implausibleHint')}
              />
            )}
          </span>
        ) : (
          <span className="tz-prompt">{prompt}</span>
        )}
        {ready && (
          <button
            ref={linkRef}
            type="button"
            className="coord-edit-link"
            aria-expanded={open}
            aria-controls={open ? chooserId : undefined}
            onClick={toggle}
          >
            {t('chartForm.tz.setManually')}
          </button>
        )}
      </div>
      {ready && open && names && (
        RADIOS ? (
          <ZoneRadios zone={zone} names={names} id={chooserId} captionId={captionId} problemId={problemId} onDone={fold} />
        ) : SHOW_ALL_ZONE_WAYS ? (
          <div id={chooserId} className="tz-ways">
            <SegmentedRadios
              className="tz-modes"
              ariaLabel={t('chartForm.tz.modesAria')}
              value={zone.mode}
              onSelect={zone.setMode}
              disabled={!ready}
              disabledHint={prompt}
              options={modeOptions}
            />
            {body}
          </div>
        ) : (
          <div id={chooserId}>
            <ZonePickMenu zone={zone} />
          </div>
        )
      )}
      {ready && (
        <p id={problemId} className="tz-problem" aria-live="polite" hidden={!problem}>
          {problem}
        </p>
      )}
      {showKept && zone.kept && at && <p className="tz-note">{keptNote(zone.kept, at, t)}</p>}
    </div>
  );
}
