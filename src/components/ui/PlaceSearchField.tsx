// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// THE place-search field. Every surface that asks "which place?" — the
// birthplace box, the teleport window, and any extension window with a location
// to set — mounts this one component, so the interaction is identical
// everywhere: type, arrow/Enter/Escape through the hits, pick.
//
// The built-in scope searches the bundled offline place index, reaching the
// online geocoder for whatever that index doesn't carry. Any scope a
// downstream build registers (lib/extensions/placeSearchProviders) joins it as
// another chip in the input row, per-scope debounce and minimum length and all
// — so a finer-grained search reaches every surface at once instead of being
// bolted onto a few. With nothing registered the chip row doesn't render.
//
// Strings arrive as props: this field is mounted by extension windows that live
// in their own React roots, OUTSIDE the i18n provider, so it can't call useT()
// itself. Hosts inside the tree pass t(...) values; hosts outside pass their own
// copy, and the handful of internal states fall back to the English below.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { PlaceKind } from '../../lib/atlas/cityLookup';
import { geocode, type GeocodeResult } from '../../lib/atlas/geocode';
import {
  getPlaceSearchLibrary,
  getPlaceSearchProviders,
  PlaceSearchFailure,
  type PlaceSearchGate,
  type PlaceSearchHit,
  type PlaceSearchProvider,
} from '../../lib/extensions/placeSearchProviders';
import './PlaceSearchField.css';

/** The built-in offline scope's id — hosts read it off {@link onPick}. */
export const BUILTIN_SCOPE_ID = 'places';
/** Reported by {@link PlaceSearchFieldProps.onPick} when the pick came from a
 *  standing group rather than a search — it belongs to no scope. */
export const LIBRARY_SCOPE_ID = 'library';

/** One row in a group shown while the query is empty (standing choices). */
export interface PlaceSearchSectionItem {
  id: string;
  label: string;
  /** Second line under the label (the place behind a named spot, say). */
  sub?: string;
  /** Small trailing tag on the row (e.g. a "HOME" marker). */
  tag?: string;
  /** Leading mark for a row from a classified set: a glyph in that set's
   *  colour, or a small round image (which wins when both are given). */
  mark?: { glyph?: string; imageUrl?: string; color?: string; label?: string };
  /** In-row edit action (a pencil at the row's end). */
  edit?: { label: string; run: () => void };
  /** In-row delete action (an ×), guarded by an inline two-step confirm —
   *  pressing it swaps the icons for `confirm` / `keep` buttons. */
  remove?: { label: string; confirm: string; keep: string; run: () => void };
  onPick: () => void;
}

/** A group of standing choices offered before anything is typed. */
export interface PlaceSearchSection {
  id: string;
  /** Heading over the group; omit for a flat, headingless list. */
  label?: string;
  items: PlaceSearchSectionItem[];
  /** Show this many rows at first, revealing another page at a time. Omit for
   *  a group that is short by nature (a handful of saves, a capped history);
   *  set it on one that can grow without limit. */
  pageSize?: number;
  /** Wording for the reveal control — the host owns its copy, and it needs the
   *  count. Falls back to a plain "Show more" when absent. */
  moreLabel?: (remaining: number) => string;
}

export interface PlaceSearchStrings {
  /** Chip label for the built-in offline scope. */
  scopeLabel: string;
  noMatches: string;
  failed: string;
  scopeAria: string;
  /** Fallback reveal wording for a paged group with no `moreLabel`. */
  more: string;
}

const EN: PlaceSearchStrings = {
  scopeLabel: 'Place',
  noMatches: 'No matches.',
  failed: 'Couldn’t run that search. Try again.',
  scopeAria: 'Search scope',
  more: 'Show more',
};

export interface PlaceSearchFieldProps {
  onPick: (hit: PlaceSearchHit, scopeId: string) => void;
  placeholder: string;
  ariaLabel: string;
  /** Bias results toward a point (the picked city, the pin, the current value). */
  bias?: { lat: number; lng: number };
  /** Restrict the BUILT-IN scope's precision classes (default: all of them). */
  kinds?: readonly PlaceKind[];
  /** Reach the online geocoder when the offline index doesn't fill the list
   *  (default: on). Turn it OFF for a field that must never touch the network;
   *  every place worth searching for is worth finding, so this is opt-out. */
  onlineFallback?: boolean;
  /** Seed the input (e.g. the value being edited, or a query typed elsewhere). */
  initialQuery?: string;
  /** A label the HOST resolved by other means (coordinates typed into a
   *  neighbouring box, a document reloaded). Each new value is adopted into the
   *  input as an already-settled answer — shown, but never searched again. */
  adoptQuery?: string;
  /** Mirror the typed query out, for hosts that key other state on it. */
  onQueryChange?: (q: string) => void;
  /** Escape pressed with no list open — the host closes the field. */
  onCancel?: () => void;
  /** Groups offered while the query is empty. */
  sections?: readonly PlaceSearchSection[];
  /** Also offer the registered standing groups (the places this user already
   *  has a relationship with — see registerPlaceSearchLibrary). Off by default:
   *  a field that asks for a BIRTHPLACE shouldn't propose where you live now. */
  library?: boolean;
  /** Keep the picked label in the input (a "current value" box) rather than clearing it. */
  keepQueryOnPick?: boolean;
  /** After a pick, re-select the kept label so the next keystroke starts fresh
   *  (for boxes you search from repeatedly rather than fill in once). */
  selectOnPick?: boolean;
  /** Render the precision tag (city / region / country) — pass the labeller. */
  kindLabel?: (kind: PlaceKind) => string;
  limit?: number;
  autoFocus?: boolean;
  /** Variant hook: hosts scope style overrides under this instead of forking. */
  className?: string;
  /** Extra content under the results (a host's own footer row). */
  children?: ReactNode;
  strings?: Partial<PlaceSearchStrings>;
}

// The built-in scope. Built per host (its precision filter and online fallback
// are host policy), so it isn't a registry entry — the field always composes it
// first, then whatever a downstream build registered.
function makeBuiltinProvider(
  kinds: readonly PlaceKind[] | undefined,
  onlineFallback: boolean,
  label: string,
): PlaceSearchProvider {
  return {
    id: BUILTIN_SCOPE_ID,
    label,
    minQueryLen: 2,
    // Paced for the network leg below, not the instant local one: a query the
    // bundled index can't fill reaches a shared, fair-use geocoder, and every
    // keystroke that resolves before the typist has stopped is a request nobody
    // needed. The local half is fast enough that the wait isn't felt.
    debounceMs: 400,
    async search(query, { limit, signal }) {
      const { searchPlaces, foldName } = await import('../../lib/atlas/cityLookup');
      if (signal?.aborted) return [];
      // Over-fetch before filtering: searchPlaces caps BEFORE we drop the kinds
      // this host doesn't accept, so a plain `limit` could come back short.
      const raw = searchPlaces(query, kinds ? limit * 4 : limit);
      const hits = (kinds ? raw.filter((r) => kinds.includes(r.kind)) : raw).slice(0, limit);
      // Offline-first, but a SHORT local answer is not the same as a complete
      // one: the bundled index holds populated places, so anything else with a
      // name — a bay, a park, a peak, a hamlet — leaves the list underfilled
      // while one incidental substring match ("bahia de" finding a city in
      // Ecuador) used to be enough to suppress the wider search entirely.
      // A full list is still answered locally, which is the common case.
      if (hits.length >= limit || !onlineFallback) return hits;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return hits;
      let online: GeocodeResult[];
      try {
        online = await geocode(query, signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        // A search the bundled index already answered must not FAIL because the
        // network did — only an empty-handed one is worth an error. This is what
        // keeps the offline build's search working on a cached-but-offline load.
        if (!hits.length) throw err;
        return hits;
      }
      // The two sources name the same place differently often enough that the
      // whole label can't be the only key; a matching leading name plus near-
      // identical coordinates catches the rest. Comparing the LEADING segment
      // (not the coordinates alone) is what keeps a named feature beside the
      // town that contains it — "Lake Bled" is not a duplicate of "Bled".
      const lead = (label: string) => foldName(label.split(',')[0].trim());
      const seen = (r: GeocodeResult) =>
        hits.some(
          (h) =>
            foldName(h.label) === foldName(r.label) ||
            (lead(h.label) === lead(r.label) &&
              Math.abs(h.lat - r.lat) < 0.05 &&
              Math.abs(h.lng - r.lng) < 0.05),
        );
      return [
        ...hits,
        ...online.filter((r) => !seen(r)).map((r) => ({ label: r.label, lat: r.lat, lng: r.lng })),
      ].slice(0, limit);
    },
  };
}

// Below this root width the scope chips (which share the input row) would
// crush the input itself, so the row condenses to a one-at-a-time cycle button.
const NARROW_SCOPES_PX = 250;

// Case- and diacritic-insensitive fold for matching typed text against the
// standing rows' names. The atlas scopes fold their own queries; this stays
// local so the field never pulls the atlas chunk just to compare strings.
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// A row reads as a PLACE with its whereabouts under it, not as one long line
// the eye has to parse to its first comma. Place names are what a person scans
// for; the containing town, region and country only settle WHICH one is meant,
// so they belong on the quieter second line. A provider that supplied its own
// second line already knows better than this split does, and keeps it. The full
// label is what gets picked either way — this is presentation, not identity.
function rowText(label: string, sub?: string): { main: string; sub?: string } {
  if (sub) return { main: label, sub };
  const cut = label.indexOf(',');
  if (cut < 0) return { main: label };
  const rest = label.slice(cut + 1).trim();
  return rest ? { main: label.slice(0, cut).trim(), sub: rest } : { main: label };
}

export function PlaceSearchField({
  onPick,
  placeholder,
  ariaLabel,
  bias,
  kinds,
  onlineFallback = true,
  initialQuery,
  adoptQuery,
  onQueryChange,
  onCancel,
  sections,
  library = false,
  keepQueryOnPick = false,
  selectOnPick = false,
  kindLabel,
  limit = 6,
  autoFocus,
  className,
  children,
  strings,
}: PlaceSearchFieldProps) {
  const S = { ...EN, ...strings };
  const [query, setQuery] = useState(initialQuery ?? '');
  const [scopeId, setScopeId] = useState(BUILTIN_SCOPE_ID);
  const [results, setResults] = useState<PlaceSearchHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  // The label just picked — the debounce must not re-search it (a pick that
  // keeps its label in the box would otherwise loop straight back into a query).
  const pickedRef = useRef<string | null>(keepQueryOnPick ? (initialQuery ?? null) : null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Whether this mount is too narrow for the full chip row (measured live — a
  // host column can be resized under us).
  const [narrowScopes, setNarrowScopes] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      // Ignore zero-width (display:none hosts) so a hidden field keeps its
      // last honest measurement instead of flapping.
      if (w > 0) setNarrowScopes(w < NARROW_SCOPES_PX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // How many pages of each paged group are on screen (1 = the first page).
  const [pages, setPages] = useState<Record<string, number>>({});
  const revealMore = (id: string) =>
    setPages((p) => ({ ...p, [id]: (p[id] ?? 1) + 1 }));

  // Built-in first, then registered scopes. The registry is populated once at
  // startup (before first render), so a plain read is stable.
  const builtinLabel = S.scopeLabel;
  const kindKey = kinds ? kinds.join(',') : '';
  const scopes = useMemo(
    () => [
      makeBuiltinProvider(
        kindKey ? (kindKey.split(',') as PlaceKind[]) : undefined,
        onlineFallback,
        builtinLabel,
      ),
      ...getPlaceSearchProviders(),
    ],
    [kindKey, onlineFallback, builtinLabel],
  );
  const scope = scopes.find((p) => p.id === scopeId) ?? scopes[0];
  const gates = scopes.map((p) => p.gate?.() ?? null);
  const gate: PlaceSearchGate | null = gates[scopes.indexOf(scope)] ?? null;
  const locked = !!gate?.locked;
  // A tapped-but-locked chip explains itself instead of switching scope.
  const [teasedId, setTeasedId] = useState<string | null>(null);
  // The standing row whose × is mid-confirm (its icons swapped for the
  // confirm/keep pair). One at a time; any typing or pick dismisses it.
  const [confirmRowId, setConfirmRowId] = useState<string | null>(null);
  const teased = teasedId ? (gates[scopes.findIndex((p) => p.id === teasedId)] ?? null) : null;

  // Call the contributor unconditionally — the registry is fixed at startup, so
  // the hooks it runs are the same on every render; the `library` prop only
  // decides whether the result is USED.
  const libraryGroups = getPlaceSearchLibrary()?.use() ?? null;

  const biasLat = bias?.lat;
  const biasLng = bias?.lng;

  // Host-resolved values land in the box as settled answers. Tracking the last
  // adopted value (rather than syncing every render) leaves the user free to
  // type over one without it snapping back.
  const adoptedRef = useRef(adoptQuery);
  useEffect(() => {
    if (adoptQuery === undefined || adoptQuery === adoptedRef.current) return;
    adoptedRef.current = adoptQuery;
    pickedRef.current = adoptQuery;
    setQuery(adoptQuery);
    setResults([]);
    setEmpty(false);
    setFailed(null);
  }, [adoptQuery]);

  useEffect(() => {
    const q = query.trim();
    if (pickedRef.current !== null && q === pickedRef.current.trim()) return;
    if (locked || q.length < scope.minQueryLen) {
      // Clearing stale state belongs to the effect that owns the search lifecycle.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setFailed(null);
      setEmpty(false);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await scope.search(q, {
          bias: biasLat !== undefined && biasLng !== undefined ? { lat: biasLat, lng: biasLng } : undefined,
          limit,
          signal: ctrl.signal,
        });
        if (cancelled) return;
        setResults(hits);
        setActiveIdx(hits.length ? 0 : -1);
        setEmpty(hits.length === 0);
        setFailed(null);
      } catch (err) {
        if (cancelled || ctrl.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return; // superseded
        setResults([]);
        setEmpty(false);
        setFailed(err instanceof PlaceSearchFailure ? err.note : S.failed);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, scope.debounceMs);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearTimeout(timer);
    };
    // `scope` is derived from the id; depending on the id keeps the effect from
    // re-firing on every render (the provider objects are rebuilt per render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, scopeId, biasLat, biasLng, limit, kindKey, onlineFallback, locked]);

  const changeQuery = (q: string) => {
    pickedRef.current = null;
    setTeasedId(null);
    setQuery(q);
    // The keyboard cursor resets with the text: the standing matches under a
    // new query are a new list, and a stale highlight would sit on the wrong
    // row until the next search lands. Enter still takes the first row.
    setActiveIdx(-1);
    setConfirmRowId(null);
    onQueryChange?.(q);
  };

  const take = useCallback(
    (hit: PlaceSearchHit, fromScope?: string) => {
      onPick(hit, fromScope ?? scope.id);
      setResults([]);
      setEmpty(false);
      setFailed(null);
      setActiveIdx(-1);
      setConfirmRowId(null);
      if (keepQueryOnPick) {
        pickedRef.current = hit.label;
        setQuery(hit.label);
        onQueryChange?.(hit.label);
        if (selectOnPick) requestAnimationFrame(() => inputRef.current?.select());
      } else {
        pickedRef.current = null;
        setQuery('');
        onQueryChange?.('');
      }
    },
    [onPick, onQueryChange, keepQueryOnPick, selectOnPick, scope.id],
  );

  // One flat keyboard list over whatever is on screen — the full standing
  // groups while the box is empty, name-matched standing rows above the hits
  // while typing — so the arrows always do something sensible.
  const showSections = !results.length && !searching && query.trim().length < scope.minQueryLen;
  // A group whose length is open-ended (everything logged against this chart,
  // say) reveals a page at a time rather than dumping hundreds of rows into a
  // popover; `pages` counts how many the user has asked for, per group.
  const visible = (g: PlaceSearchSection) =>
    g.pageSize ? g.items.slice(0, g.pageSize * (pages[g.id] ?? 1)) : g.items;
  const librarySections: PlaceSearchSection[] =
    library && libraryGroups
      ? libraryGroups.map((g) => ({
          id: g.id,
          label: g.label,
          pageSize: g.pageSize,
          moreLabel: g.moreLabel,
          items: g.entries.map((e) => ({
            id: e.id,
            label: e.label,
            sub: e.sub,
            tag: e.tag,
            mark: e.mark,
            edit: e.edit,
            remove: e.remove,
            onPick: () =>
              take(
                { label: e.label, lat: e.lat, lng: e.lng, zoom: e.zoom },
                LIBRARY_SCOPE_ID,
              ),
          })),
        }))
      : [];
  const standing = [...librarySections, ...(sections ?? [])];
  // Once two characters are typed, the standing rows stop being a browsing
  // list and become search results of their own: filtered by name (against the
  // label, second line and tag alike), stripped of headings and paging, and
  // kept on screen ABOVE the scope's hits — a place the user already keeps and
  // named outranks a gazetteer's answer for that name.
  const foldedQuery = fold(query.trim());
  const matchesQuery = (it: PlaceSearchSectionItem) =>
    fold(it.label).includes(foldedQuery) ||
    (!!it.sub && fold(it.sub).includes(foldedQuery)) ||
    (!!it.tag && fold(it.tag).includes(foldedQuery));
  const groups = (
    foldedQuery.length >= 2
      ? standing.map((g) => ({
          ...g,
          label: undefined,
          pageSize: undefined,
          moreLabel: undefined,
          items: g.items.filter(matchesQuery),
        }))
      : showSections
        ? standing
        : []
  ).filter((g) => g.items.length > 0);
  const shownItems = groups.map(visible);
  const hasMore = groups.map((g, i) => shownItems[i].length < g.items.length);
  // Each group contributes its visible rows plus, when one is offered, the
  // reveal control — which is a keyboard stop like any other row.
  const groupStart = groups.reduce<number[]>(
    (acc, _g, i) =>
      i === 0
        ? [0]
        : [...acc, acc[i - 1] + shownItems[i - 1].length + (hasMore[i - 1] ? 1 : 0)],
    [],
  );
  // Standing rows come FIRST in both the DOM and the keyboard order — when a
  // typed query matches one, it is the better answer, so it leads the hits.
  const groupNav = groups.flatMap((g, i) => [
    ...shownItems[i].map((it) => ({ run: it.onPick })),
    ...(hasMore[i] ? [{ run: () => revealMore(g.id) }] : []),
  ]);
  const navItems: { run: () => void }[] = [
    ...groupNav,
    ...results.map((r) => ({ run: () => take(r) })),
  ];

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, navItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = navItems[activeIdx] ?? navItems[0];
      if (item) item.run();
    } else if (e.key === 'Escape') {
      // Consume Escape only when there's something local to dismiss; otherwise
      // let it bubble to whatever the host does with it.
      if (results.length || empty || failed || teasedId) {
        e.preventDefault();
        e.stopPropagation();
        setResults([]);
        setEmpty(false);
        setFailed(null);
        setTeasedId(null);
      } else if (onCancel) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    }
  };

  const note = teased?.note ?? (locked ? gate?.note : null) ?? failed;

  // The condensed scope control: ONE chip showing the active scope; tapping
  // moves to the next scope that is open, skipping locked ones — and when every
  // other scope is locked, the tap teases the next one instead (the same
  // explain-under-the-input a locked chip gives), so nothing is silently dead.
  const cycleScope = () => {
    const idx = scopes.findIndex((p) => p.id === scope.id);
    for (let step = 1; step < scopes.length; step++) {
      const next = scopes[(idx + step) % scopes.length];
      if (gates[scopes.indexOf(next)]?.locked) continue;
      setTeasedId(null);
      setScopeId(next.id);
      setActiveIdx(-1);
      inputRef.current?.focus();
      return;
    }
    const next = scopes[(idx + 1) % scopes.length];
    setTeasedId((v) => (v === next.id ? null : next.id));
  };

  return (
    <div ref={rootRef} className={`psf${className ? ` ${className}` : ''}`}>
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
          className="psf-input"
          value={query}
          onChange={(e) => changeQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={scope.placeholder ?? placeholder}
          aria-label={ariaLabel}
          spellCheck={false}
          autoComplete="off"
          autoFocus={autoFocus}
        />
        {searching && <span className="psf-spinner" aria-hidden="true" />}
        {scopes.length > 1 && narrowScopes && (
          <div className="psf-scopes">
            <button
              type="button"
              className="psf-scope psf-scope-cycle is-on"
              aria-label={S.scopeAria}
              onClick={cycleScope}
            >
              {scope.label}
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 8h13l-3.5-3.5" />
                <path d="M20 16H7l3.5 3.5" />
              </svg>
            </button>
          </div>
        )}
        {scopes.length > 1 && !narrowScopes && (
          <div className="psf-scopes" role="radiogroup" aria-label={S.scopeAria}>
            {scopes.map((p, i) => {
              const g = gates[i];
              const isOn = p.id === scope.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={isOn}
                  aria-disabled={g?.locked || undefined}
                  className={`psf-scope${isOn ? ' is-on' : ''}${g?.locked ? ' is-locked' : ''}`}
                  onClick={() => {
                    if (g?.locked) {
                      setTeasedId((v) => (v === p.id ? null : p.id));
                      return;
                    }
                    setTeasedId(null);
                    setScopeId(p.id);
                    setActiveIdx(-1);
                    inputRef.current?.focus();
                  }}
                >
                  {p.label}
                  {g?.locked && g.pill && <span className="psf-scope-pill">{g.pill}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* One scroll container for every group, so a long list scrolls as a
          whole instead of each group getting its own little viewport. Rendered
          ABOVE the hits: while typing, any standing rows still on screen are
          name matches, and the user's own places outrank the gazetteer's. */}
      {groups.length > 0 && (
        <div className="psf-groups">
          {groups.map((g, gi) => {
            const moreIdx = groupStart[gi] + shownItems[gi].length;
            const remaining = g.items.length - shownItems[gi].length;
            return (
              <div className="psf-group" key={g.id}>
                {g.label && <span className="psf-group-head">{g.label}</span>}
                <ul className="psf-results">
                  {shownItems[gi].map((it, ii) => {
                    const idx = groupStart[gi] + ii;
                    const row = rowText(it.label, it.sub);
                    const hasActs = !!(it.edit || it.remove);
                    return (
                      <li
                        key={it.id}
                        // Actioned rows: ONE highlight, painted by the LI (the
                        // row pill) off is-active alone — mouse-enter anywhere
                        // on the row (icons included) moves the active index,
                        // so hover and keyboard can never show two highlights.
                        className={
                          hasActs
                            ? `psf-item${idx === activeIdx ? ' is-active' : ''}`
                            : undefined
                        }
                        onMouseEnter={hasActs ? () => setActiveIdx(idx) : undefined}
                      >
                        <button
                          type="button"
                          className={`psf-row${idx === activeIdx ? ' is-active' : ''}`}
                          onClick={it.onPick}
                          onMouseEnter={() => setActiveIdx(idx)}
                          // The glyph is decorative, so when it stands for
                          // something (a category) the row states that in words
                          // for assistive tech — and then has to restate the
                          // rest, since aria-label replaces the whole name.
                          aria-label={
                            it.mark?.label
                              ? `${it.mark.label}: ${it.label}${it.sub ? `, ${it.sub}` : ''}`
                              : undefined
                          }
                        >
                          {it.mark?.imageUrl ? (
                            <img
                              className="psf-row-emblem"
                              src={it.mark.imageUrl}
                              alt=""
                              aria-hidden="true"
                            />
                          ) : it.mark?.glyph ? (
                            <span
                              className="psf-row-glyph"
                              style={it.mark.color ? { color: it.mark.color } : undefined}
                              aria-hidden="true"
                            >
                              {it.mark.glyph}
                            </span>
                          ) : null}
                          <span className="psf-row-body">
                            <span className="psf-row-main">
                              <span className="psf-row-label">{row.main}</span>
                              {it.tag && <span className="psf-row-tag">{it.tag}</span>}
                            </span>
                            {row.sub && <span className="psf-row-sub">{row.sub}</span>}
                          </span>
                        </button>
                        {/* In-row actions, INSIDE the same row pill (the li
                            carries the hover surface). The × arms an inline
                            confirm — the icons swap for confirm/keep, so
                            nothing is deleted on a stray tap. */}
                        {hasActs &&
                          (confirmRowId === it.id && it.remove ? (
                            <span className="psf-row-acts is-confirm">
                              <button
                                type="button"
                                className="psf-row-confirm"
                                onClick={() => {
                                  setConfirmRowId(null);
                                  it.remove!.run();
                                }}
                              >
                                {it.remove.confirm}
                              </button>
                              <button
                                type="button"
                                className="psf-row-keep"
                                onClick={() => setConfirmRowId(null)}
                              >
                                {it.remove.keep}
                              </button>
                            </span>
                          ) : (
                            <span className="psf-row-acts">
                              {it.edit && (
                                <button
                                  type="button"
                                  className="psf-row-act"
                                  aria-label={it.edit.label}
                                  onClick={it.edit.run}
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                  </svg>
                                </button>
                              )}
                              {it.remove && (
                                <button
                                  type="button"
                                  className="psf-row-act psf-row-act-danger"
                                  aria-label={it.remove.label}
                                  onClick={() => setConfirmRowId(it.id)}
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    aria-hidden="true"
                                  >
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                  </svg>
                                </button>
                              )}
                            </span>
                          ))}
                      </li>
                    );
                  })}
                  {hasMore[gi] && (
                    <li>
                      <button
                        type="button"
                        className={`psf-more${moreIdx === activeIdx ? ' is-active' : ''}`}
                        onClick={() => revealMore(g.id)}
                        onMouseEnter={() => setActiveIdx(moreIdx)}
                      >
                        {g.moreLabel ? g.moreLabel(remaining) : S.more}
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {results.length > 0 && (
        <ul className="psf-results psf-hits">
          {results.map((r, i) => {
            const { main, sub } = rowText(r.label, r.sub);
            const navIdx = groupNav.length + i;
            return (
              <li key={`${r.lat},${r.lng},${i}`}>
                <button
                  type="button"
                  className={`psf-row${navIdx === activeIdx ? ' is-active' : ''}`}
                  onClick={() => take(r)}
                  onMouseEnter={() => setActiveIdx(navIdx)}
                >
                  <span className="psf-row-body">
                    <span className="psf-row-main">
                      <span className="psf-row-label">{main}</span>
                      {kindLabel && r.kind && (
                        <span className={`psf-kind psf-kind-${r.kind}`}>{kindLabel(r.kind)}</span>
                      )}
                    </span>
                    {sub && <span className="psf-row-sub">{sub}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {note && <p className="psf-note">{note}</p>}
      {empty && !note && !searching && groups.length === 0 && (
        <p className="psf-note">{S.noMatches}</p>
      )}
      {children}
    </div>
  );
}
