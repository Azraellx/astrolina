// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The IANA time-zone list as a search (2026-10-02), replacing the grouped
// <select> the chart form had before: four hundred-odd ids in one scroll-only
// dropdown could only be found by someone who already knew the id. Here a zone
// is found by its id, its city or its abbreviation ("Kolkata", "EDT"), and each
// row says what picking it would give for this birth — the offset at the birth
// moment, in both notations.
//
// A combobox over a listbox (the ARIA pattern): focus stays in the input, the
// arrows move the active row, Enter picks, Escape closes. The list sits IN the
// form's flow rather than floating over it, so on a phone the pane scrolls to
// it above the on-screen keyboard instead of it opening underneath.
//
// Looks: the shared place-search field's input row and result rows (ui/
// PlaceSearchField.css), so the form's two searches read as one kind of control.

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { listTimeZones, resolveZoneInfo } from '../../lib/atlas/timezone';
import {
  canonicalZone,
  formatBothNotations,
  zoneSearchTerms,
  type ZoneMoment,
} from '../../lib/atlas/zoneEntry';
import { useT } from '../../i18n';

/** Lower case, no accents, separators as spaces: "America/Port_of_Spain" →
 *  "america port of spain", so "port of spain" and "spain" both find it. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cityOf = (id: string): string | null => {
  const c = id.split('/').pop();
  return c && c !== id ? c.replace(/_/g, ' ') : null;
};

function engineKnows(id: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: id });
    return true;
  } catch {
    return false;
  }
}

interface BaseRow {
  /** Shown and picked: the tz database's CURRENT name where this browser knows
   *  it (Asia/Kolkata, not the Asia/Calcutta many engines still list), so the
   *  list and the birthplace lookup name a zone the same way. */
  id: string;
  /** The engine's own id, which the abbreviation lookup is keyed on. */
  source: string;
  /** Ids and cities, both spellings — searching "Calcutta" still finds it. */
  names: string[];
}

let BASE: BaseRow[] | null = null;
function baseRows(): BaseRow[] {
  if (BASE) return BASE;
  const seen = new Set<string>();
  const rows: BaseRow[] = [];
  for (const source of listTimeZones()) {
    const canon = canonicalZone(source);
    const id = canon !== source && engineKnows(canon) ? canon : source;
    if (seen.has(id)) continue;
    seen.add(id);
    const names = [source, canon, cityOf(source), cityOf(canon)].filter(
      (x): x is string => !!x,
    );
    rows.push({ id, source, names: [...new Set(names)] });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  BASE = rows;
  return rows;
}

// Abbreviations cost an Intl formatter per zone — about 190 ms for the whole
// list on a desktop, several times that on a phone — so they are filled in
// short slices after the list mounts and kept for the session. Until then the
// search runs on ids and cities alone.
let ABBRS: Map<string, string[]> | null = null;
function fillAbbreviations(done: (m: Map<string, string[]>) => void): () => void {
  const rows = baseRows();
  const out = new Map<string, string[]>();
  let i = 0;
  let timer = 0;
  const slice = () => {
    const end = Math.min(i + 40, rows.length);
    for (; i < end; i++) {
      const { source, names } = rows[i];
      const known = new Set(names);
      out.set(
        source,
        zoneSearchTerms(source).filter((term) => !known.has(term)),
      );
    }
    if (i < rows.length) timer = window.setTimeout(slice, 0);
    else {
      ABBRS = out;
      done(out);
    }
  };
  timer = window.setTimeout(slice, 0);
  return () => window.clearTimeout(timer);
}

interface Row {
  id: string;
  /** Ids and cities, folded ("america new york", "new york"). */
  terms: string[];
  /** The same, split into words: a query word must START one of them ("kolk"
   *  finds Kolkata), so "msk" no longer finds Omsk. */
  words: string[][];
  /** Abbreviations, folded: matched only whole ("KST" is Korea, not AKST). */
  abbrs: string[];
}

export function ZoneSearchField({
  value,
  detected,
  at,
  onPick,
}: {
  /** The zone in effect; shown in the box whenever nothing is being typed. */
  value: string;
  /** The zone the birthplace resolved to, tagged in the list, and the offset
   *  picking it gives — the birthplace's own mean time in its LMT era, which
   *  is not the zone's reference-city value the other rows show. */
  detected?: { iana: string; seconds: number };
  /** The birth moment, for each row's offset. */
  at: ZoneMoment;
  onPick: (zone: string) => void;
}) {
  const { t } = useT();
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-opt-${i}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [abbrs, setAbbrs] = useState<Map<string, string[]> | null>(() => ABBRS);

  useEffect(() => (abbrs ? undefined : fillAbbreviations(setAbbrs)), [abbrs]);

  const isCurrent = (id: string) => !!value && canonicalZone(id) === canonicalZone(value);
  const isDetected = (id: string) => !!detected && canonicalZone(id) === canonicalZone(detected.iana);

  const rows = useMemo<Row[]>(() => {
    const base = baseRows();
    // A zone outside the engine's list (an Etc zone saved by an older version,
    // say) is still the value in effect, so it is still a row.
    const listed =
      !value || base.some((r) => canonicalZone(r.id) === canonicalZone(value))
        ? base
        : [{ id: value, source: value, names: [value, cityOf(value)].filter((x): x is string => !!x) }, ...base];
    return listed.map((r) => {
      const terms = r.names.map(fold);
      return {
        id: r.id,
        terms,
        words: terms.map((term) => term.split(' ')),
        abbrs: (abbrs?.get(r.source) ?? []).map(fold),
      };
    });
  }, [value, abbrs]);

  const q = typing ? fold(query) : '';
  const shown = useMemo<Row[]>(() => {
    if (!q) return rows;
    const tokens = q.split(' ');
    const home = detected ? canonicalZone(detected.iana) : null;
    const scored: { r: Row; i: number; score: number; here: boolean }[] = [];
    rows.forEach((r, i) => {
      // Every word typed must be a whole abbreviation or the start of a word in
      // an id or city (2026-10-02: substring matching had "KST" finding Alaska
      // through AKST, and "MSK" finding Omsk and Tomsk).
      const hit = (tok: string) => r.abbrs.includes(tok) || r.words.some((ws) => ws.some((w) => w.startsWith(tok)));
      if (!tokens.every(hit)) return;
      // An exact abbreviation or city first, then a name that starts with what
      // was typed, then the rest. Among equals the birthplace's own zone leads —
      // "EDT" matches some twenty zones, and the one this birth is in is the
      // likeliest wanted — then alphabetical order.
      const score = r.abbrs.includes(q) || r.terms.includes(q)
        ? 0
        : r.terms.some((term) => term.startsWith(q) || term.includes(` ${q}`))
          ? 1
          : 2;
      scored.push({ r, i, score, here: canonicalZone(r.id) === home });
    });
    scored.sort((a, b) => a.score - b.score || Number(b.here) - Number(a.here) || a.i - b.i);
    return scored.map((s) => s.r);
  }, [rows, q, detected]);

  // What each zone gives at this birth moment — computed only while the list
  // is open, once per moment (a few milliseconds for the whole list). The
  // birthplace's own zone shows what picking it gives, which in its mean-time
  // era is the birthplace's LMT, not the reference city's (found in review:
  // Ulm 1879's Europe/Berlin row showed +0:53:28 and saved +0:39:57).
  const { year, month, day, hour, minute } = at;
  const detectedIana = detected?.iana;
  const detectedSeconds = detected?.seconds;
  const offsets = useMemo(() => {
    if (!open) return null;
    const m = new Map<string, number>();
    const home = detectedIana ? canonicalZone(detectedIana) : null;
    for (const r of rows) {
      if (home && detectedSeconds != null && canonicalZone(r.id) === home) {
        m.set(r.id, detectedSeconds);
        continue;
      }
      const info = resolveZoneInfo(r.id, year, month, day, hour, minute);
      m.set(r.id, Math.round(info.offsetHours * 3600) || 0);
    }
    return m;
  }, [open, rows, year, month, day, hour, minute, detectedIana, detectedSeconds]);

  // Keep the active row in view as the arrows move it (and the current zone in
  // view when the list opens on it).
  useEffect(() => {
    if (!open || active < 0) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const close = () => {
    setOpen(false);
    setTyping(false);
    setQuery('');
    setActive(-1);
  };

  const pick = (id: string) => {
    onPick(id);
    close();
  };

  /** Open on the zone in effect, its name selected so typing replaces it. */
  const openOnCurrent = () => {
    setOpen(true);
    setTyping(false);
    setActive(rows.findIndex((r) => isCurrent(r.id)));
    inputRef.current?.select();
  };

  const onFocus = () => {
    openOnCurrent();
    // On a touch screen the keyboard is about to take the bottom half: bring the
    // box to the top of the pane so the list under it stays visible.
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      requestAnimationFrame(() => inputRef.current?.scrollIntoView({ block: 'start' }));
    }
  };

  // A mouse pick keeps focus in the box (the list holds it on mousedown), so a
  // second click there gets no focus event: open again on click as well.
  const onClick = () => {
    if (!open) openOnCurrent();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        // Reopened after a pick: back on the zone in effect, as on focus.
        setOpen(true);
        setActive(rows.findIndex((r) => isCurrent(r.id)));
        return;
      }
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // Never submits the form from here: Enter in a search box means "this one".
      e.preventDefault();
      const row = shown[active] ?? (typing ? shown[0] : undefined);
      if (open && row) pick(row.id);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const onRowClick = (id: string, e: MouseEvent) => {
    pick(id);
    // A tap is a finished choice: let the on-screen keyboard go.
    if ((e.nativeEvent as PointerEvent).pointerType === 'touch') inputRef.current?.blur();
  };

  const activeId = open && active >= 0 && active < shown.length ? optId(active) : undefined;

  return (
    <div className="tz-search">
      <div className="psf-inputrow">
        <svg
          className="psf-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="psf-input tz-search-input"
          role="combobox"
          aria-label={t('chartForm.tz.ianaLabel')}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          value={typing ? query : value}
          placeholder={t('chartForm.tz.ianaPlaceholder')}
          onChange={(e) => {
            setQuery(e.target.value);
            setTyping(true);
            setOpen(true);
            setActive(e.target.value.trim() ? 0 : -1);
          }}
          onFocus={onFocus}
          onClick={onClick}
          onBlur={close}
          onKeyDown={onKeyDown}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      {/* Always in the document (the combobox's aria-controls names it), but
          empty and hidden while closed — four hundred rows nobody can see are
          not worth rendering. */}
      <ul
        id={listId}
        ref={listRef}
        role="listbox"
        aria-label={t('chartForm.tz.ianaLabel')}
        className="psf-results tz-search-list"
        hidden={!open || shown.length === 0}
        // Keeps focus in the box while a row is pressed, so the click lands.
        onMouseDown={(e) => e.preventDefault()}
      >
        {open &&
          shown.map((r, i) => {
            // The offset at the birth moment, and nothing else: the
            // abbreviations a row is found by are today's, and beside a 1975
            // offset they read as contradictions — Cancún's "EST" over its
            // UTC−6 of the time (2026-10-02, found in review).
            const offset = offsets?.get(r.id);
            const sub = offset != null ? formatBothNotations(offset) : '';
            return (
              <li
                key={r.id}
                id={optId(i)}
                role="option"
                aria-selected={isCurrent(r.id)}
                className={`psf-row tz-search-row${i === active ? ' is-active' : ''}${
                  isCurrent(r.id) ? ' is-current' : ''
                }`}
                // Move, not enter: opening the list scrolls the zone in effect
                // into view, which slides rows under a pointer that hasn't
                // moved — and that must not steal the keyboard's place.
                onMouseMove={() => {
                  if (active !== i) setActive(i);
                }}
                onClick={(e) => onRowClick(r.id, e)}
              >
                <span className="psf-row-body">
                  <span className="psf-row-main">
                    <span className="psf-row-label">{r.id}</span>
                    {isDetected(r.id) && (
                      <span className="psf-row-tag">{t('chartForm.tz.ianaBirthplace')}</span>
                    )}
                  </span>
                  {sub && <span className="psf-row-sub">{sub}</span>}
                </span>
              </li>
            );
          })}
      </ul>
      {open && typing && shown.length === 0 && (
        <p className="psf-note">{t('chartForm.tz.ianaNoMatches')}</p>
      )}
      <span className="tz-sr-only" aria-live="polite">
        {open && typing && q ? t('chartForm.tz.ianaCount', { count: shown.length }) : ''}
      </span>
    </div>
  );
}
