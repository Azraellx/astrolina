// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The movable "Minor bodies" window (Map filters ▸ Minor bodies ▸ More, or '4' — it
// has no View-menu row, by choice) — every minor body in one place. Four parts:
//
//   • one search over the bundled set and every registered source (the scope chips
//     only exist when a downstream build registered one — the open core has none),
//     with the FAMILY switch ("Hide all") on the row under it, which hides every
//     body on the reader's list at once and keeps the selection (its own preference
//     field, never touched by a row);
//   • the five main asteroids, as the very SAME switches as Map filters (the raw
//     built-in preference and its own toggle, so the two surfaces can't disagree);
//   • the search results, a page at a time — or, while nothing is typed, the set
//     bundled with the app to browse;
//   • the reader's own list, with why each body is or isn't drawn: a column of its
//     own beside the rest once it holds anything and the screen has room for two,
//     a section below the results otherwise (touch, a narrow window).
//
// Nothing here writes on the reader's behalf. Every write is the gesture of the row
// it came from; a toggle the caps would refuse says so on its tip BEFORE the click
// and in a status line after it, and writes nothing (CLAUDE.md, rules 1 and 3). Why
// a switched-on body isn't on the map is DERIVED (lib/minorBodies/status.ts) and only
// read here — a held, loading or out-of-range body keeps its place on the list.
//
// A number that is really one of the built-in bodies (1–4 Ceres…Vesta, 2060 Chiron,
// 134340 Pluto) never becomes a second copy: search shows a pointer to the row that
// already draws it, and never toggles Pluto from here.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { MINOR_BODIES, PLANET_COLORS, type PlanetName } from '../../lib/ephemeris';
import { minorLineColor, type Theme } from '../../lib/theme';
import { MINOR_GLYPHS } from '../../lib/astro/glyphChars';
import type { MinorBodiesApi } from '../../lib/minorBodies/useMinorBodies';
import type { MinorRow, MinorRowStatus } from '../../lib/minorBodies/status';
import {
  MINOR_LIST_CAP,
  MINOR_VISIBLE_CAP,
  type MinorListEntry,
} from '../../lib/minorBodies/prefs';
import { BUILTIN_ALIAS, isCatalogNumber } from '../../lib/minorBodies/ids';
import {
  BUNDLED_MINOR_BODIES,
  BUNDLED_SOURCE_ID,
  MINOR_BODY_GROUPS,
  bundledMinorBody,
  bundledSource,
  numberQuery,
  rankMinorMatch,
} from '../../lib/minorBodies/bundled';
import {
  getMinorBodySources,
  MinorBodySourceFailure,
  type MinorBodyHit,
  type MinorBodySource,
  type MinorBodySourceGate,
} from '../../lib/extensions/minorBodySources';
import { useT } from '../../i18n';
import { useMovableHud, effectiveCenterX } from '../../lib/useMovableHud';
import { getReservedLeftInset, subscribeReservedLeftInset } from '../../lib/leftDock';
import { useTouchLayout } from '../../lib/touch';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import { EyeIcon } from '../ui/EyeIcon';
import { HudHeader } from '../ui/HudHeader';
// Reuse the overlay bar's chrome (.timeline-hud), the shared floating-window styles
// (.location-*), the Capture window's small-caps section headings, the place
// search's input row / scope chips / row actions / "Show more" link, and the
// sidebar's on/off switch (.es-advanced-toggle) — so this window frosts, recolours,
// searches and switches like its siblings. Only the layout and the list rows are its
// own (MinorBodiesHud.css).
import '../TimelineHud/TimelineHud.css';
import '../LocationHud/LocationHud.css';
import '../CaptureHud/CaptureHud.css';
import '../ui/PlaceSearchField.css';
import '../ExpandedChartSidebar/ExpandedChartSidebar.css';
import './MinorBodiesHud.css';

// Its own saved position (independent of the other floating windows).
const POS_KEY = 'astro:minor-bodies-pos:v1';
// The window's width in one column, and with the reader's list open beside the
// search — KEEP IN STEP with .minor-bodies-hud / .is-split in MinorBodiesHud.css.
const WIDTH = 300;
const SPLIT_WIDTH = 580;
// Search results arrive a page at a time. A one-letter query in a registered catalog
// can match thousands, and none of them should reach the DOM until the reader
// scrolls toward it; the bundled browse (~40, fixed) is never paged.
const PAGE_SIZE = 24;

// The viewport's width as a store, so the layout (one column or two) and the
// on-screen shift below re-render when it changes.
function subscribeViewport(cb: () => void): () => void {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}
const viewportWidth = () => window.innerWidth;

export interface MinorBodiesHudProps {
  onClose: () => void;
  theme: Theme;
  /** The RAW built-in body preference (Map filters' own) and its toggle: the five
   *  main asteroids shown here are the very same switches as in Map filters. */
  visiblePlanets: ReadonlySet<PlanetName>;
  togglePlanet: (p: PlanetName) => void;
  /** The catalog preference and its only writers. */
  api: MinorBodiesApi;
  /** Every body on the reader's list, with what it's doing right now (derived). */
  rows: readonly MinorRow[];
  /** Forget a failed load so it's tried again. */
  onRetry: (n: number) => void;
}

/** A search that failed: with the source's own sentence, or generically. */
type SearchFailure = { note: string } | 'generic';

interface Found {
  /** Which scope + query these hits answer — results are only trusted for it. */
  key: string;
  hits: MinorBodyHit[];
  failure: SearchFailure | null;
}

/** How many result rows the query in `key` (scope + text) shows. Reset to one page
 *  whenever the live key moves (see `pageKey`), so no query inherits another's —
 *  including one the reader comes back to. */
interface Paging {
  key: string;
  shown: number;
}

// Reveal `n` more rows past `from` — but only while the reader is still at `from`
// for `key`: one page asked for twice (the scroll sentinel and the button, or two
// observer callbacks before a render) must add one page, not two.
function revealPage(p: Paging, key: string, from: number, n: number): Paging {
  const cur = p.key === key ? p.shown : PAGE_SIZE;
  return cur === from ? { key, shown: from + n } : p;
}

// The bundled set, grouped for browsing once (it is fixed at build time).
const BUNDLED_BY_GROUP = MINOR_BODY_GROUPS.map((group) => ({
  group,
  bodies: BUNDLED_MINOR_BODIES.filter((b) => b.group === group),
})).filter((g) => g.bodies.length > 0);

// Sort one scope's hits the way every scope sorts (rankMinorMatch), dropping
// duplicates and any number that is really a built-in body — those get a pointer
// row instead (see builtinPointers), never a second, toggleable copy. A hit the
// shared ranker can't place (a source that also matches alternate names, say)
// keeps its source's order after the ranked ones rather than vanishing.
function rankHits(q: string, hits: readonly MinorBodyHit[]): MinorBodyHit[] {
  const seen = new Set<number>();
  const ranked: { hit: MinorBodyHit; rank: number; i: number }[] = [];
  hits.forEach((hit, i) => {
    if (!isCatalogNumber(hit.n) || seen.has(hit.n)) return;
    seen.add(hit.n);
    ranked.push({ hit, rank: rankMinorMatch(q, hit.n, hit.name) ?? 5, i });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return ranked.map((r) => r.hit);
}

// The bundled set's matches for `q`, ranked — computed here rather than through
// bundledSource.search because it is local and synchronous, so it can answer in
// every scope (locked or not) without waiting on, or being cancelled with, the
// active scope's request. ~40 bodies: not worth memoising.
function bundledMatches(q: string): MinorBodyHit[] {
  const out: { hit: MinorBodyHit; rank: number }[] = [];
  for (const b of BUNDLED_MINOR_BODIES) {
    const rank = rankMinorMatch(q, b.n, b.name);
    if (rank !== null) out.push({ hit: { n: b.n, name: b.name }, rank });
  }
  out.sort((a, b) => a.rank - b.rank || a.hit.n - b.hit.n);
  return out.map((o) => o.hit);
}

// A catalog body's mark: its own glyph where the font has one, otherwise a small
// diamond — both in the body's line colour, so the row and its line on the map
// read as the same thing.
function MinorMark({ n, theme }: { n: number; theme: Theme }) {
  const color = minorLineColor(n, theme);
  const glyph = MINOR_GLYPHS.get(n);
  if (glyph) {
    return (
      <span className="astro-glyph mbh-mark" style={{ color }} aria-hidden="true">
        {glyph}
      </span>
    );
  }
  return (
    <span className="mbh-mark mbh-diamond" aria-hidden="true">
      <span style={{ background: color }} />
    </span>
  );
}

// A button that reveals a shared .ui-tip (title + hint + note) on hover/focus — the
// affordance the Local Space and Aspect Lines windows use for their toggles. The tip
// is optional: a catalog row only carries one when there is something its row does
// not already say (a toggle the caps would refuse).
function MbTipButton({
  className,
  onClick,
  ariaPressed,
  tip,
  mainPlanet,
  listRow,
  hitRow,
  children,
}: {
  className: string;
  onClick: () => void;
  ariaPressed?: boolean;
  tip?: { title: ReactNode; hint?: string; note?: string };
  /** Marks one of the five main-asteroid switches, so a search pointer can move
   *  focus to it. */
  mainPlanet?: PlanetName;
  /** Marks a row of the reader's list (by number), so focus can land on it when
   *  the row above it is removed. */
  listRow?: number;
  /** Marks a search result (by number), so focus can land on the first row a
   *  "Show more" added. */
  hitRow?: number;
  children: ReactNode;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>('top');
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        onClick={onClick}
        aria-pressed={ariaPressed}
        data-mb-main={mainPlanet}
        data-mb-row={listRow}
        data-mb-hit={hitRow}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </button>
      {tip && (
        <HoverTip pos={pos} placement="top" title={tip.title} hint={tip.hint} note={tip.note} />
      )}
    </>
  );
}

export function MinorBodiesHud({
  onClose,
  theme,
  visiblePlanets,
  togglePlanet,
  api,
  rows,
  onRetry,
}: MinorBodiesHudProps) {
  const { t, labels } = useT();
  // The header eye collapses the window to its title bar WITHOUT closing it (the
  // bodies stay drawn either way). Local UI state, like the sibling windows.
  const [collapsed, setCollapsed] = useState(false);
  const hudRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef, {
    posKey: POS_KEY,
    floating: true,
    // Centred on the effective centre, a little higher than the Local Space and
    // Aspect Lines windows (y 144 / 168): this one is taller, and opening it level
    // with them would push its list off the bottom of a laptop screen.
    initial: () => ({ x: Math.round(effectiveCenterX() - WIDTH / 2), y: 112 }),
    // The saved spot is always one the one-column frame fits; the list's column is
    // kept on screen by the shift below, never by moving that spot.
    clampWidth: WIDTH,
  });

  // ── Layout ───────────────────────────────────────────────────────────────
  // The reader's list opens as a column of its own beside the search once it holds
  // anything — so a long list and a long page of results each scroll by themselves
  // instead of one under the other. Only where two columns fit: the touch layout
  // keeps one (a phone has no room for two, and a tablet shares the phone's touch
  // layout — lib/touch reads the pointer, not the width), and so does a viewport
  // too narrow for the pair once a docked panel's reserved column is taken out.
  // There the list is a section below the results, as it always was.
  const touch = useTouchLayout();
  const viewportW = useSyncExternalStore(subscribeViewport, viewportWidth, () => WIDTH);
  const reservedLeft = useSyncExternalStore(
    subscribeReservedLeftInset,
    getReservedLeftInset,
    () => 0,
  );
  const split = rows.length > 0 && !touch && viewportW - reservedLeft >= SPLIT_WIDTH + 16;
  // Kept on screen as it widens. useMovableHud clamps on mount, on resize and when a
  // docked panel's column moves — never when the window's own size changes — so the
  // list opening beside a window parked near the right edge would put that column
  // off screen. The shift is DERIVED at render, never saved: those re-clamps measure
  // the one-column width (`clampWidth` above), so the saved spot stays where the
  // reader left it, and the window slides back there when the list empties. (A drag
  // measures the rendered rect, so dragging while shifted saves the shifted spot.)
  // The clamp is the hook's own; a collapsed nub needs none.
  const hudW = Math.min(split ? SPLIT_WIDTH : WIDTH, viewportW - 16);
  const floorX = reservedLeft + 4;
  const x =
    pos && !collapsed
      ? Math.min(Math.max(pos.x, floorX), Math.max(floorX, viewportW - hudW - 4))
      : pos?.x;
  // The map dodges its edge labels off every floating window's frame, measured once
  // and cached until a window says it moved — which useMovableHud says only when the
  // SAVED spot changes. This frame also changes by itself (the list's column opening
  // or closing, and the shift with it; results coming and going; the collapse), so
  // it says so too: on every size change, and when a sideways slide ends.
  useEffect(() => {
    const el = hudRef.current;
    if (!el) return;
    const moved = () => window.dispatchEvent(new Event('astro:hud-moved'));
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(moved);
    ro?.observe(el);
    const onSettled = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'left') moved();
    };
    el.addEventListener('transitionend', onSettled);
    return () => {
      ro?.disconnect();
      el.removeEventListener('transitionend', onSettled);
    };
  }, []);

  const [query, setQuery] = useState('');
  const [scopeId, setScopeId] = useState(BUNDLED_SOURCE_ID);
  const [found, setFound] = useState<Found | null>(null);
  const [searching, setSearching] = useState(false);
  // Keyed to what opens first: the bundled scope, nothing typed (see `pageKey`).
  const [paging, setPaging] = useState<Paging>({
    key: `${BUNDLED_SOURCE_ID}\n`,
    shown: PAGE_SIZE,
  });
  // A tapped-but-locked scope chip explains itself instead of switching scope.
  const [teasedId, setTeasedId] = useState<string | null>(null);
  // The list row whose × is mid-confirm (its icons swapped for Remove / Keep).
  const [confirmN, setConfirmN] = useState<number | null>(null);
  // Where focus goes once that confirm closes. The Remove / Keep pair holding focus
  // unmounts with the very click that answers it, so without this a keyboard user
  // lands on <body> — the failure the pair's own autoFocus exists to prevent, one
  // step later. Set in the click, consumed after the commit that removed the pair.
  const focusAfter = useRef<string | null>(null);
  useEffect(() => {
    const selector = focusAfter.current;
    if (selector === null) return;
    focusAfter.current = null;
    (hudRef.current?.querySelector<HTMLElement>(selector) ?? inputRef.current)?.focus();
  });
  // Why the last toggle was refused (a cap) — said in words after the click, for
  // the reader who never saw the tip (touch, keyboard). Cleared by the next toggle.
  // `inList` records which part the click came from, so with the list in its own
  // column the words land in the column the reader is looking at.
  const [capNote, setCapNote] = useState<{ text: string; inList: boolean } | null>(null);

  const pref = api.pref;
  const visibleSet = useMemo(() => new Set(pref.visible), [pref.visible]);
  const listByN = useMemo(() => new Map(pref.list.map((e) => [e.n, e])), [pref.list]);

  // ── Scopes ───────────────────────────────────────────────────────────────
  // The bundled set first, then whatever a downstream build registered. Gates are
  // read every render — a source's answer can change under the reader (a session
  // ending, a plan changing). A HIDDEN scope is dropped here, before anything can
  // render or select it; a LOCKED one stays as an inert chip that explains itself.
  const registered = getMinorBodySources();
  const registeredGates = registered.map((s) => s.gate?.() ?? null);
  const scopes: MinorBodySource[] = [
    bundledSource,
    ...registered.filter((_, i) => !registeredGates[i]?.hidden),
  ];
  const scopeGates: (MinorBodySourceGate | null)[] = [
    null,
    ...registeredGates.filter((g) => !g?.hidden),
  ];
  // No registered source (the open core), or none on offer to this reader: the
  // bundled set is the only scope, and a single chip would be a control with
  // nothing to choose — so there is no chip row at all.
  const showChips = scopes.length > 1;
  const scope = scopes.find((s) => s.id === scopeId) ?? bundledSource;
  const gate = scopeGates[scopes.indexOf(scope)] ?? null;
  const locked = !!gate?.locked;
  const teased = teasedId
    ? (scopeGates[scopes.findIndex((s) => s.id === teasedId)] ?? null)
    : null;
  const scopeLabel = (s: MinorBodySource) =>
    s.id === BUNDLED_SOURCE_ID ? t('minorBodies.hud.scopeBundled') : s.label;

  // ── Search ───────────────────────────────────────────────────────────────
  const q = query.trim();
  // A NUMBER always searches, whatever the scope's minimum length: "7" names one
  // body exactly (7 Iris), which a length floor meant for names would hide.
  const canSearch =
    q !== '' && !locked && (numberQuery(q) !== null || q.length >= scope.minQueryLen);
  const searchKey = canSearch ? `${scope.id}\n${q}` : null;
  // Paging: how many result rows this scope + query shows (one page to start).
  // Every change of query or scope starts again at one page — a query the reader
  // left and came back to included, and a scope that fell away under its gate —
  // adjusted during render (App's playing-pause precedent), so no frame paints the
  // old count.
  const pageKey = `${scope.id}\n${q}`;
  if (paging.key !== pageKey) setPaging({ key: pageKey, shown: PAGE_SIZE });
  const shown = paging.key === pageKey ? paging.shown : PAGE_SIZE;
  // Sources take only a limit, so the window asks for TWO PAGES more than it shows.
  // The first says whether there is more and holds it, so a reveal lands at once;
  // the second is still in hand after that reveal while the bigger request goes out
  // behind it. With one, every reveal spent the reserve and "Show more" blinked out
  // until the answer landed — or, where bundled matches lead (they count as shown
  // but not against the source's limit), came back as a short page. Each reveal
  // re-asks with a larger limit — cheap for the bundled set and the Pro catalog,
  // both searched locally (a full scan and sort whatever the limit), and both ranked
  // by rankMinorMatch then number, so a longer answer only extends a shorter one and
  // the rows already on screen never move.
  const limit = shown + 2 * PAGE_SIZE;
  useEffect(() => {
    if (!searchKey) return;
    let cancelled = false;
    // Each keystroke supersedes the last: the cleanup aborts a request still in
    // flight, so a slow answer to "er" can never land over the answer to "eros".
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await scope.search(q, { limit, signal: ctrl.signal });
        if (cancelled) return;
        setFound({ key: searchKey, hits: rankHits(q, hits), failure: null });
      } catch (err) {
        if (cancelled || ctrl.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return; // superseded
        setFound({
          key: searchKey,
          hits: [],
          failure: err instanceof MinorBodySourceFailure ? { note: err.note } : 'generic',
        });
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, scope.debounceMs);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [searchKey, scope, q, limit]);
  // Results are shown for the live query only. While the next answer is on its way
  // the previous one stays on screen (a typeahead that blanks on every keystroke
  // reads as broken); an answer to a query that is no longer live never shows. The
  // key leaves the limit out, so while a reveal's bigger answer is on its way the
  // smaller one still counts as settled — no spinner, no flicker.
  const settled = searchKey !== null && found?.key === searchKey;
  const scopeHits = searchKey !== null && found ? found.hits : [];
  // The bundled set answers in EVERY scope, and first: a registered source leaves
  // the bundled bodies out of its own results (a copy recorded against a gated
  // source would be held the moment that source closed, though this build ships
  // the file), so without this, typing "Eros" with another scope selected would
  // find nothing. First because the bundled copy is the one that is always there —
  // offline, and never held. The bundled scope itself needs no merge.
  const bundledHits = q && scope.id !== BUNDLED_SOURCE_ID ? bundledMatches(q) : [];
  const bundledNs = new Set(bundledHits.map((h) => h.n));
  const hits =
    bundledHits.length > 0
      ? [...bundledHits, ...scopeHits.filter((h) => !bundledNs.has(h.n))]
      : scopeHits;
  const busy = searchKey !== null && !settled && searching;
  const failure = settled && found ? found.failure : null;
  // The rows on screen, and exactly how many the next reveal adds. Offered only once
  // the answer is the live query's — or when no request went out at all (a locked
  // scope, a query below its minimum), where the bundled matches ARE the answer: a
  // stale answer's "Show more" would page a query the reader has already left.
  const shownHits = hits.slice(0, shown);
  const nextPage =
    searchKey === null || settled ? Math.min(PAGE_SIZE, hits.length - shownHits.length) : 0;
  const revealMore = () => {
    if (nextPage <= 0) return;
    // Focus lands on the first row added: the button leaves with the last page, and
    // a keyboard reader wants to carry on from what just appeared.
    focusAfter.current = `[data-mb-hit="${hits[shown].n}"]`;
    setPaging((p) => revealPage(p, pageKey, shown, nextPage));
  };
  // …and by itself as the reader scrolls toward the end of the results — but only
  // where the results END their scroll area. With the list stacked below them (one
  // column), an automatic reveal would push the list away every time the reader
  // scrolled toward it; there the button is the way on. (`pagedScroll` also turns
  // the browser's scroll anchoring off — see .mbh-scroll.is-paged for why.)
  const scrollRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLLIElement>(null);
  const pagedScroll = q !== '' && (split || rows.length === 0);
  const autoReveal = nextPage > 0 && pagedScroll;
  useEffect(() => {
    const el = moreRef.current;
    const root = scrollRef.current;
    if (!autoReveal || !el || !root || typeof IntersectionObserver === 'undefined') return;
    // Re-made on every page (the deps), and an observer reports on its first look:
    // a sentinel still in view after a page lands asks for the next one at once.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPaging((p) => revealPage(p, pageKey, shown, nextPage));
        }
      },
      // A few rows early, so the next page is in place before the reader reaches it.
      { root, rootMargin: '0px 0px 120px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoReveal, pageKey, shown, nextPage]);
  // A new query or scope also starts from the TOP of the scroll area, which
  // otherwise keeps its offset: a reader deep into "a" who types "ab" would land
  // part-way down the new, shorter results with the best matches out of view above
  // — and, sat at the end of them, page the next lot in unasked. Before paint, so
  // the old offset never shows. A scope switch over the browse (nothing typed
  // before or after) changes nothing on screen, so that one keeps its place.
  const lastQ = useRef(q);
  useLayoutEffect(() => {
    const was = lastQ.current;
    lastQ.current = q;
    if (q === '' && was === '') return;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [q, scope.id]);

  // Built-in bodies the query names — by NUMBER (exactly: a number names one body,
  // and "1" must not drag 134340 Pluto in by prefix) or by NAME (exact or prefix,
  // so "Cer" finds Ceres). Local knowledge, so it answers in every scope, locked or
  // not, and needs no search to have run. (Six entries — not worth memoising.)
  const builtinPointers: { n: number; planet: PlanetName; rank: number }[] = [];
  if (q) {
    const byNumber = numberQuery(q) !== null;
    for (const [n, planet] of BUILTIN_ALIAS) {
      const rank = rankMinorMatch(q, n, labels.planet(planet));
      if (rank === null || (byNumber ? rank !== 0 : rank > 3)) continue;
      builtinPointers.push({ n, planet, rank });
    }
    builtinPointers.sort((a, b) => a.rank - b.rank || a.n - b.n);
  }

  const note =
    teased?.note ??
    (locked ? gate?.note : null) ??
    (failure === 'generic'
      ? t('minorBodies.hud.searchFailed')
      : failure
        ? failure.note
        : null);
  const noMatch =
    settled && !failure && hits.length === 0 && builtinPointers.length === 0;

  const changeQuery = (next: string) => {
    setQuery(next);
    setTeasedId(null);
    setConfirmN(null);
    setCapNote(null);
  };
  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Escape clears the search — and is consumed only when there was something to
    // clear, so an empty box lets it reach whatever the host does with Escape.
    if (e.key === 'Escape' && (query !== '' || teasedId)) {
      e.preventDefault();
      e.stopPropagation();
      changeQuery('');
    }
  };

  // ── Toggling ─────────────────────────────────────────────────────────────
  // What the caps would say to switching `n` on — mirroring useMinorBodies' own
  // order (the drawn cap first, then the list cap) so the words match the refusal.
  // Counted on the PREFERENCE, like the cap itself. Undefined when it would go
  // through, which is what keeps the tip from warning about a toggle that fires.
  const refusalFor = (n: number): string | undefined => {
    if (visibleSet.has(n)) return undefined;
    if (pref.visible.length >= MINOR_VISIBLE_CAP)
      return t('minorBodies.hud.cap', { max: MINOR_VISIBLE_CAP });
    if (!listByN.has(n) && pref.list.length >= MINOR_LIST_CAP)
      return t('minorBodies.hud.listCap', { max: MINOR_LIST_CAP });
    return undefined;
  };
  const toggleEntry = (entry: MinorListEntry, inList: boolean) => {
    const refusal = refusalFor(entry.n);
    const result = api.toggle(entry);
    setCapNote(
      result === 'cap'
        ? { text: refusal ?? t('minorBodies.hud.cap', { max: MINOR_VISIBLE_CAP }), inList }
        : null,
    );
  };
  // The entry a toggle should carry for a body offered by a scope. A body already
  // on the list keeps its own entry (its source travels with it). A NEW body that
  // is also in the bundled set is recorded as bundled whichever scope offered it:
  // the bundled copy is free, offline and never held, and recording it against a
  // gated source would hold a body this build ships with the moment that source
  // closed.
  const entryFor = (n: number, name: string, sourceId: string): MinorListEntry =>
    listByN.get(n) ?? {
      n,
      name,
      source: bundledMinorBody(n) ? BUNDLED_SOURCE_ID : sourceId,
    };

  const displayName = (n: number, name: string) =>
    name ? t('minorBodies.card.name', { name, n }) : t('minorBodies.card.unnamed', { n });

  // The second line under a list row: why a switched-on body isn't drawn. 'shown'
  // and 'off' need nothing.
  const statusLine = (
    s: MinorRowStatus,
  ): { text: string; failed?: boolean; pill?: string } | null => {
    switch (s.kind) {
      case 'off':
      case 'shown':
        return null;
      case 'loading':
        return { text: t('minorBodies.hud.status.loading') };
      case 'failed':
        return {
          failed: true,
          text:
            s.reason === 'source'
              ? (s.note ?? t('minorBodies.hud.status.content'))
              : t(`minorBodies.hud.status.${s.reason}`),
        };
      case 'noData':
        return { text: t('minorBodies.hud.status.noData') };
      case 'composite':
        return { text: t('minorBodies.hud.status.composite') };
      case 'held':
        return { text: s.note, pill: s.pill };
      case 'unavailable':
        return { text: t('minorBodies.hud.status.unavailable') };
      case 'familyHidden':
        return { text: t('minorBodies.hud.status.familyHidden') };
      case 'advanced':
        return { text: t('minorBodies.hud.status.advanced') };
      case 'undrawn':
        return { text: t(`minorBodies.hud.status.undrawn.${s.reason}`) };
    }
  };

  // One catalog row: the whole row is the eye toggle (mark + name + a second line),
  // with the list's own actions (retry, remove) beside it rather than inside it.
  const catalogRow = (
    key: string,
    entry: MinorListEntry,
    on: boolean,
    opts: {
      sub?: string;
      status?: MinorRowStatus;
      removable?: boolean;
      /** A search result — marked so a reveal can put focus on it. */
      hit?: boolean;
    } = {},
  ) => {
    const name = displayName(entry.n, entry.name);
    const status = opts.status ? statusLine(opts.status) : null;
    const sub = status?.text ?? opts.sub;
    const inList = listByN.has(entry.n);
    // "On your list" on a browsing/search row whose body is on the list but
    // switched off — switched ON already says so with its eye.
    const tag = !opts.removable && inList && !on ? t('minorBodies.hud.row.added') : undefined;
    const refusal = refusalFor(entry.n);
    const failed = opts.status?.kind === 'failed';
    const confirming = opts.removable && confirmN === entry.n;
    // After a Remove, focus moves to the row that takes this one's place (the next,
    // else the one above); with the list emptied, to the search box.
    const afterRemove = () => {
      const i = rows.findIndex((r) => r.entry.n === entry.n);
      const neighbour = rows[i + 1] ?? rows[i - 1];
      return neighbour && neighbour.entry.n !== entry.n
        ? `[data-mb-row="${neighbour.entry.n}"]`
        : 'input.psf-input';
    };
    return (
      <li key={key} className="mbh-item">
        <MbTipButton
          className={`mbh-toggle ${on ? 'on' : 'off'}`}
          onClick={() => toggleEntry(entry, !!opts.removable)}
          ariaPressed={on}
          listRow={opts.removable ? entry.n : undefined}
          hitRow={opts.hit ? entry.n : undefined}
          tip={
            refusal
              ? { title: t('minorBodies.hud.row.show', { name }), hint: refusal }
              : undefined
          }
        >
          <EyeIcon open={on} className="location-ls-eye" size={14} />
          <MinorMark n={entry.n} theme={theme} />
          <span className="mbh-body">
            <span className="mbh-main">
              <span className="mbh-name">{name}</span>
              {tag && <span className="psf-row-tag">{tag}</span>}
              {status?.pill && <span className="mbh-pill">{status.pill}</span>}
            </span>
            {sub && <span className={`mbh-sub${status?.failed ? ' is-failed' : ''}`}>{sub}</span>}
          </span>
        </MbTipButton>
        {opts.removable &&
          (confirming ? (
            // The armed remove: an explicit confirm / keep pair, so a stray tap
            // on the × never drops a body (and its name) from the list.
            <span className="mbh-acts is-confirm">
              <button
                type="button"
                className="psf-row-confirm"
                // Focus follows the × it replaced, so a keyboard user lands on
                // the choice instead of on <body>.
                autoFocus
                onClick={() => {
                  focusAfter.current = afterRemove();
                  setConfirmN(null);
                  api.remove(entry.n);
                }}
              >
                {t('minorBodies.hud.row.removeConfirm')}
              </button>
              <button
                type="button"
                className="psf-row-keep"
                onClick={() => {
                  // Back to the × it came from: the row is unchanged, so the
                  // reader continues exactly where they were.
                  focusAfter.current = `[data-mb-remove="${entry.n}"]`;
                  setConfirmN(null);
                }}
              >
                {t('minorBodies.hud.row.removeKeep')}
              </button>
            </span>
          ) : (
            <span className={`mbh-acts${failed ? ' has-retry' : ''}`}>
              {failed && (
                <button
                  type="button"
                  className="mbh-retry"
                  aria-label={t('minorBodies.hud.row.retryAria', { name })}
                  onClick={() => onRetry(entry.n)}
                >
                  {t('minorBodies.hud.row.retry')}
                </button>
              )}
              <button
                type="button"
                className="psf-row-act psf-row-act-danger"
                data-mb-remove={entry.n}
                aria-label={t('minorBodies.hud.row.remove', { name })}
                onClick={() => setConfirmN(entry.n)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </span>
          ))}
      </li>
    );
  };

  // A search pointer to one of the five main asteroids moves focus to its switch
  // (a handful of rows up) rather than toggling anything from the result list.
  const focusMain = (planet: PlanetName) => {
    const el = hudRef.current?.querySelector<HTMLButtonElement>(`[data-mb-main="${planet}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    el.focus();
  };

  // The family switch, read as what turning it ON does. Off by default — the
  // preference's own default is `shown: true` — so a reader who never touches it
  // sees an unticked "Hide all". Written only from its own click (CLAUDE.md, rule 1).
  const hideAll = !pref.shown;
  const hideAllLabel = t('minorBodies.hud.hideAll.label');
  const capNoteEl = (
    <p className="psf-note mbh-capnote" role="status">
      {capNote?.text}
    </p>
  );

  // ── Your list ─────────────────────────────────────────────────────────────
  // Every body the reader added, in the order added, each saying what it is doing
  // right now. While Hide all is on, the list says so at its top — in its own column
  // that may be half a window away from the switch. `column`: the list is the
  // second column, so it carries its own scroll (and the cap note for its rows).
  const yourList = (column: boolean) => {
    const list = (
      <ul className="mbh-list">
        {rows.map((row) =>
          catalogRow(`row-${row.entry.n}`, { ...row.entry, name: row.name }, row.on, {
            status: row.status,
            removable: true,
          }),
        )}
      </ul>
    );
    return (
      <>
        <h3 className="capture-hud-label mbh-head">{t('minorBodies.hud.sections.yours')}</h3>
        {hideAll && (
          <p className="location-ls-note mbh-note">{t('minorBodies.hud.hideAll.hiddenNote')}</p>
        )}
        {column && capNote?.inList && capNoteEl}
        {column ? <div className="mbh-scroll">{list}</div> : list}
      </>
    );
  };

  return (
    <div
      ref={hudRef}
      className={`timeline-hud location-hud minor-bodies-hud${split && !collapsed ? ' is-split' : ''}${dragging ? ' thud-dragging' : ''}${collapsed ? ' is-collapsed' : ''}`}
      style={
        pos
          ? { left: x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
    >
      <HudHeader
        title={t('minorBodies.hud.title')}
        handleProps={handleProps}
        dragging={dragging}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onClose={onClose}
        closeLabel={t('minorBodies.hud.closeAria')}
        closeHint={t('minorBodies.hud.closeHint')}
      />

      <div className="location-ls mbh">
        {/* ── The first column: search on top, everything else scrolling below.
            The same element in both layouts, so the list opening or closing
            beside it never remounts the search box, the row just clicked, or
            the reader's place in the scroll. */}
        <div className="mbh-col mbh-col-main">
          {/* ── The fixed top: search + scope row ─────────────────────────────
              Outside the scrolling list, so both stay in reach however far down
              the results or the bundled set the reader has scrolled. */}
          <div className="mbh-top">
            <div className="psf-inputrow">
              <svg className="psf-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="psf-input"
                value={query}
                onChange={(e) => changeQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={scope.placeholder ?? t('minorBodies.hud.searchPlaceholder')}
                aria-label={t('minorBodies.hud.searchAria')}
                spellCheck={false}
                autoComplete="off"
              />
              {busy && <span className="psf-spinner" aria-hidden="true" />}
            </div>

            <div className="mbh-scoperow">
              {/* Scope chips — only when a downstream build registered a source. A
                  locked scope stays visible and tappable, and a tap explains itself
                  under the input instead of switching (the place search's idiom). */}
              {showChips && (
                <div className="psf-scopes" role="radiogroup" aria-label={t('minorBodies.hud.scopeAria')}>
                  {scopes.map((s, i) => {
                    const g = scopeGates[i];
                    const isOn = s.id === scope.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={isOn}
                        aria-disabled={g?.locked || undefined}
                        className={`psf-scope${isOn ? ' is-on' : ''}${g?.locked ? ' is-locked' : ''}`}
                        onClick={() => {
                          if (g?.locked) {
                            setTeasedId((v) => (v === s.id ? null : s.id));
                            return;
                          }
                          setTeasedId(null);
                          setScopeId(s.id);
                          inputRef.current?.focus();
                        }}
                      >
                        {scopeLabel(s)}
                        {g?.locked && g.pill && <span className="psf-scope-pill">{g.pill}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Hide all — the family switch, right-aligned (alone on the row in
                  the open core). The sidebar's on/off switch rather than an eye:
                  an eye names a thing shown, and this names an action. */}
              <TipButton
                type="button"
                role="switch"
                aria-checked={hideAll}
                aria-label={t('minorBodies.hud.hideAll.aria')}
                className={`es-advanced-toggle mbh-hideall ${hideAll ? 'on' : 'off'}`}
                onClick={() => api.setShown(hideAll)}
                placement="top"
                tip={hideAllLabel}
                hint={t('minorBodies.hud.hideAll.hint')}
              >
                <span className="es-toggle-label">{hideAllLabel}</span>
                <span className="es-toggle-track" aria-hidden="true">
                  <span className="es-toggle-thumb" />
                </span>
              </TipButton>
            </div>

            {note && <p className="psf-note mbh-searchnote">{note}</p>}
            {capNote && !(split && capNote.inList) && capNoteEl}
            {q === '' && <p className="location-ls-note mbh-note">{t('minorBodies.hud.empty')}</p>}
          </div>

          <div ref={scrollRef} className={`mbh-scroll${pagedScroll ? ' is-paged' : ''}`}>
            {/* ── Main asteroids ──────────────────────────────────────────────
                The five built-in minor bodies — the SAME switches as Map filters
                (the raw preference and its own toggle), so every minor body can
                be reached from this one window without a second copy of any. */}
            <h3 className="capture-hud-label mbh-head">{t('minorBodies.hud.sections.builtin')}</h3>
            <ul className="mbh-main-grid">
              {MINOR_BODIES.map((p) => {
                const on = visiblePlanets.has(p);
                const color = PLANET_COLORS[p];
                return (
                  <li key={p}>
                    <MbTipButton
                      className={`location-ls-toggle mbh-main-toggle ${on ? 'on' : 'off'}`}
                      onClick={() => togglePlanet(p)}
                      ariaPressed={on}
                      mainPlanet={p}
                      tip={{
                        title: (
                          <span className="mbh-tip-title">
                            <PlanetGlyph planet={p} size={14} color={color} />
                            {labels.planet(p)}
                          </span>
                        ),
                        hint: labels.planetTheme(p),
                      }}
                    >
                      <EyeIcon open={on} className="location-ls-eye" size={13} />
                      <PlanetGlyph planet={p} size={13} color={color} className="mbh-main-glyph" />
                      <span className="location-ls-name">{labels.planet(p)}</span>
                    </MbTipButton>
                  </li>
                );
              })}
            </ul>

            {/* ── Results (while something is typed), a page at a time ─────────── */}
            {q !== '' && (
              <>
                <h3 className="capture-hud-label mbh-head">{t('minorBodies.hud.sections.results')}</h3>
                <ul className="mbh-list" aria-busy={busy || undefined}>
                  {builtinPointers.map(({ n, planet }) => {
                    const name = labels.planet(planet);
                    const glyph = (
                      <PlanetGlyph planet={planet} size={13} color={PLANET_COLORS[planet]} className="mbh-mark" />
                    );
                    // A main asteroid points (and moves focus) to its switch above;
                    // Pluto lives with the planets in Map filters, and this window
                    // never toggles it — so its pointer is text, not a control.
                    return (
                      <li key={`builtin-${n}`}>
                        {MINOR_BODIES.includes(planet) ? (
                          <button type="button" className="mbh-pointer" onClick={() => focusMain(planet)}>
                            {glyph}
                            <span>{t('minorBodies.hud.builtinHit.minor', { name })}</span>
                          </button>
                        ) : (
                          <div className="mbh-pointer">
                            {glyph}
                            <span>{t('minorBodies.hud.builtinHit.planet', { name })}</span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {shownHits.map((hit) => {
                    const bundled = bundledMinorBody(hit.n);
                    return catalogRow(
                      `hit-${hit.n}`,
                      entryFor(hit.n, hit.name, scope.id),
                      visibleSet.has(hit.n),
                      {
                        // A bundled body's class ("Centaurs") is the useful second
                        // line when its source didn't supply one of its own.
                        sub:
                          hit.sub ??
                          (bundled ? t(`minorBodies.hud.groups.${bundled.group}`) : undefined),
                        hit: true,
                      },
                    );
                  })}
                  {/* The next page: a plain button (the keyboard and screen-reader
                      way on, the place search's reveal link), which is also the
                      sentinel the scroll observer watches. */}
                  {nextPage > 0 && (
                    <li ref={moreRef}>
                      <button type="button" className="psf-more" onClick={revealMore}>
                        {t('minorBodies.hud.more', { n: nextPage })}
                      </button>
                    </li>
                  )}
                </ul>
                {busy && hits.length === 0 && builtinPointers.length === 0 && (
                  <p className="location-ls-note mbh-note" role="status">
                    {t('minorBodies.hud.searching')}
                  </p>
                )}
                {noMatch && (
                  <p className="location-ls-note mbh-note" role="status">
                    {t('minorBodies.hud.noMatch', { q })}
                  </p>
                )}
              </>
            )}

            {/* ── Your list, stacked (one column) ─────────────────────────────── */}
            {!split && rows.length > 0 && yourList(false)}

            {/* ── Bundled with the app (browsing, while nothing is typed) ──────── */}
            {q === '' && BUNDLED_BY_GROUP.length > 0 && (
              <>
                <h3 className="capture-hud-label mbh-head">{t('minorBodies.hud.sections.bundled')}</h3>
                {BUNDLED_BY_GROUP.map(({ group, bodies }) => (
                  <div key={group} className="mbh-group">
                    <div className="mbh-group-head">{t(`minorBodies.hud.groups.${group}`)}</div>
                    <ul className="mbh-list">
                      {bodies.map((b) =>
                        catalogRow(
                          `bundled-${b.n}`,
                          entryFor(b.n, b.name, BUNDLED_SOURCE_ID),
                          visibleSet.has(b.n),
                        ),
                      )}
                    </ul>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* ── Your list, in its own column ───────────────────────────────────── */}
        {split && (
          <div className="mbh-col mbh-col-list">
            <div className="mbh-col-fill">{yourList(true)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
