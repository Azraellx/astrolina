// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The movable "Minor bodies" window (Map filters ▸ Minor bodies ▸ More, or '4' — it
// has no View-menu row, by choice) — every minor body in one place. Four parts:
//
//   • one search over the Featured set (the bundled bodies and the hypothetical
//     points) and every registered source (the scope chips only exist when a
//     downstream build registered one — the open core has none), with the FAMILY
//     switch ("Hide all") on the row under it, which hides every body on the reader's
//     list at once and keeps the selection (its own preference field, never touched
//     by a row);
//   • the five main minor bodies, as the very SAME switches as Map filters (the raw
//     built-in preference and its own toggle, so the two surfaces can't disagree);
//   • the search results, a page at a time — or, while nothing is typed in the
//     Featured scope, that set to browse under its headings;
//   • the reader's own list, with why each body is or isn't drawn: a column of its
//     own beside the rest once it holds anything and the screen has room for two,
//     a section below the results otherwise (touch, a narrow window).
//
// Every row that isn't under a heading says what the body is: a class tag at the
// right of its name (lib/minorBodies/classTags.ts) on the reader's list and on search
// results. The Featured browse carries none — its headings say it.
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
  Fragment,
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
import type { OverlayKind } from '../../lib/astro/timeline';
import {
  resolveMinorSource,
  type MinorRow,
  type MinorRowStatus,
} from '../../lib/minorBodies/status';
import {
  MINOR_LIST_CAP,
  MINOR_VISIBLE_CAP,
  type MinorListEntry,
} from '../../lib/minorBodies/prefs';
import { BUILTIN_ALIAS, isHypotheticalKey, isListKey } from '../../lib/minorBodies/ids';
import {
  BUNDLED_SET,
  BUNDLED_SOURCE_ID,
  bundledMinorBody,
  bundledSearch,
  bundledSource,
  numberQuery,
  rankBundledMatch,
  rankMinorMatch,
  type BundledMinorBody,
  type MinorBodyGroup,
} from '../../lib/minorBodies/bundled';
import { builtinClassTag, type MinorClassTag } from '../../lib/minorBodies/classTags';
import { minorDisplayLabel, minorDisplayParts } from '../../lib/minorBodies/naming';
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
import { MinorMark } from '../MinorMark/MinorMark';
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
// The split is as wide as the list's column needs for every Featured body and
// hypothetical point to fit its name line whole (see .mbh-main there).
const WIDTH = 300;
const SPLIT_WIDTH = 605;
// Search results arrive a page at a time. A one-letter query in a registered catalog
// can match thousands, and none of them should reach the DOM until the reader
// scrolls toward it; the Featured browse (~50, fixed) is never paged.
const PAGE_SIZE = 24;

// The scope hint — shown ONCE, ever: a bundled search that finds nothing points at the
// registered scope that searches further, so a reader learns the chips are a switch.
// Spent once it has been up long enough to read (a no-match that flickers past between
// two keystrokes doesn't count), or the moment the reader switches scope by themselves
// — either way they know. Spent, it stays up for the rest of this window's life
// wherever it would apply, and never comes back after. A teaching flag, not a
// preference: nothing reads it but this window. Unreadable storage reads as spent, so
// a browser that can't remember never repeats it.
const SCOPE_HINT_KEY = 'astro:minor-scope-hint:v1';
const SCOPE_HINT_READ_MS = 2000;
function scopeHintSpent(): boolean {
  try {
    return localStorage.getItem(SCOPE_HINT_KEY) === '1';
  } catch {
    return true;
  }
}
function spendScopeHint(): void {
  try {
    localStorage.setItem(SCOPE_HINT_KEY, '1');
  } catch {
    // Ignore persistence failures (private mode, quota, etc.).
  }
}

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
  /** Whose dates a body's file has to reach, for the "no data" tips: the chart is a
   *  composite (both parents' dates), and the overlay beside it a composite partner. */
  composite?: { chart: boolean; overlay: boolean };
  /** "Parans with the planets": the STORED switch (`on`, never the derived value), its only
   *  writer, and — while the map's parans aren't drawn — the sentence saying what holds it
   *  and where to change it (null when it isn't held). Held, the switch shows `on` greyed and
   *  does nothing (CLAUDE.md row A; the host's writer refuses too). Absent: no switch. */
  parans?: { on: boolean; heldNote: string | null; onChange: (on: boolean) => void };
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

// The Featured set, laid out for browsing once (it is fixed at build time). Level 1:
// the four physical groups, then Hypothetical points; level 2: that heading's two
// groups (Uranian points in the engine's number order, then TransPluto and Selena).
// The Main minor bodies heading above them is the built-in switches' own, not part of
// this set. Every heading carries its info line (hud.groupInfo), keyed like its title.
type FeaturedHead = Exclude<MinorBodyGroup, 'uranian' | 'otherHyp'> | 'hypothetical';
interface FeaturedSection {
  head: FeaturedHead;
  /** One group without a heading of its own, or the level-2 groups under `head`. */
  groups: { group: MinorBodyGroup; sub: boolean; bodies: BundledMinorBody[] }[];
}
const featuredGroup = (group: MinorBodyGroup, sub: boolean) => ({
  group,
  sub,
  bodies: BUNDLED_SET.filter((b) => b.group === group),
});
const FEATURED_BROWSE: FeaturedSection[] = [
  ...(['dwarf', 'centaur', 'mainBelt', 'nearEarth'] as const).map((g) => ({
    head: g,
    groups: [featuredGroup(g, false)],
  })),
  { head: 'hypothetical' as const, groups: [featuredGroup('uranian', true), featuredGroup('otherHyp', true)] },
]
  .map((s) => ({ ...s, groups: s.groups.filter((g) => g.bodies.length > 0) }))
  .filter((s) => s.groups.length > 0);

// Sort one scope's hits the way every scope sorts (rankMinorMatch — with a bundled
// body's aliases counted, rankBundledMatch), dropping duplicates and any number that
// is really a built-in body — those get a pointer row instead (see builtinPointers),
// never a second, toggleable copy. A hypothetical point's key stays (isListKey, not
// isCatalogNumber). A hit the shared ranker can't place (a source that also matches
// alternate names, say) keeps its source's order after the ranked ones rather than
// vanishing.
function rankHits(q: string, hits: readonly MinorBodyHit[]): MinorBodyHit[] {
  const seen = new Set<number>();
  const ranked: { hit: MinorBodyHit; rank: number; i: number }[] = [];
  hits.forEach((hit, i) => {
    if (!isListKey(hit.n) || seen.has(hit.n)) return;
    seen.add(hit.n);
    ranked.push({ hit, rank: rankBundledMatch(q, hit.n, hit.name) ?? 5, i });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return ranked.map((r) => r.hit);
}

// A catalog body's mark: its own glyph where the font has one, otherwise a small
// diamond — both in the body's line colour, so the row and its line on the map
// read as the same thing; a hypothetical point's diamond is hollow, as on the map.
// The mark itself is the shared one (MinorMark), which the chart wheel, its tips and
// the positions table draw too.
function RowMark({ n, theme }: { n: number; theme: Theme }) {
  return (
    <MinorMark
      color={minorLineColor(n, theme)}
      glyph={MINOR_GLYPHS.get(n)}
      hollow={isHypotheticalKey(n)}
      className="mbh-mark"
    />
  );
}

// Whether a row's name (.mbh-name) is cut short: its own name ellipsised, or — in a row
// too narrow even for the number it keeps — the whole name clipped.
function nameCut(row: HTMLElement | null): boolean {
  const name = row?.querySelector<HTMLElement>('.mbh-name');
  if (!name) return false;
  if (name.scrollWidth > name.clientWidth) return true;
  const own = name.querySelector<HTMLElement>('.mbh-name-own');
  if (!own) return false;
  const text = document.createRange();
  text.selectNodeContents(own);
  return text.getBoundingClientRect().width > own.getBoundingClientRect().width + 0.05;
}

// A button that reveals a shared .ui-tip (title + hint + note) on hover/focus — the
// affordance the Local Space and Aspect Lines windows use for their toggles. The tip
// is optional: a catalog row only carries one when there is something its row does
// not already say in words (a toggle the caps would refuse, the dates a greyed row's
// data doesn't reach, what its list icon means, a name its row cuts short).
function MbTipButton({
  className,
  onClick,
  ariaPressed,
  tip,
  fullName,
  mainPlanet,
  listRow,
  hitRow,
  children,
}: {
  className: string;
  onClick: () => void;
  ariaPressed?: boolean;
  tip?: { title: ReactNode; hint?: string; note?: string };
  /** The row's whole name — its tip's title while the row cuts the name short, and only
   *  then (a `tip` of its own already opens with the name). */
  fullName?: string;
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
  // Whether the name is cut, read as the tip opens: that depends on the row's width and on
  // what shares the name's line, and only the committed row knows either — so the layout
  // effect + setState is the tool (before paint, so a tip never shows without its title).
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    if (pos && fullName) setCut(nameCut(ref.current));
  }, [pos, fullName, ref]);
  const rowTip = tip ?? (cut && fullName ? { title: fullName } : undefined);
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
      {rowTip && (
        <HoverTip pos={pos} placement="top" title={rowTip.title} hint={rowTip.hint} note={rowTip.note} />
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
  composite,
  parans,
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
  // The list's Clear, mid-confirm (swapped for its own Clear / Keep pair).
  const [confirmClear, setConfirmClear] = useState(false);
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
  // The Featured browse is the bundled scope's alone: a registered scope (a catalog of
  // thousands) has nothing to browse, and showing the Featured groups under its chip
  // read as its contents — so while nothing is typed it only asks for a search.
  const featuredScope = scope.id === BUNDLED_SOURCE_ID;
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
  // offline, and never held. The bundled scope itself needs no merge. Read directly
  // (bundledSearch) rather than through bundledSource.search: it is local and
  // synchronous, so it answers in any scope, locked or not, without waiting on or
  // being cancelled with the active scope's request. ~50 bodies: not worth memoising.
  const bundledHits = q && scope.id !== BUNDLED_SOURCE_ID ? bundledSearch(q) : [];
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
  // the old offset never shows. A scope switch with nothing typed counts too: the
  // Featured browse belongs to its own scope only, so the switch swaps it for the
  // other scope's prompt, or back.
  useLayoutEffect(() => {
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

  // The one-time scope hint (see SCOPE_HINT_KEY): a bundled search with no match, and
  // a registered scope this reader can switch to. Never toward a locked one — the hint
  // teaches a switch, and a locked chip isn't one.
  const [scopeHintLive, setScopeHintLive] = useState(() => !scopeHintSpent());
  const hintScope = scopes.find((_, i) => i > 0 && !scopeGates[i]?.locked) ?? null;
  const showScopeHint =
    scopeHintLive && noMatch && scope.id === BUNDLED_SOURCE_ID && hintScope !== null;
  useEffect(() => {
    if (!showScopeHint) return;
    const timer = window.setTimeout(spendScopeHint, SCOPE_HINT_READ_MS);
    return () => window.clearTimeout(timer);
  }, [showScopeHint]);
  // Its caret points at the chip it names. Measured before paint, and set on the
  // element directly — the chip only moves with the layout, which re-renders this.
  const scopeHintRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const hint = scopeHintRef.current;
    const chip = hintScope
      ? hudRef.current?.querySelector<HTMLElement>(`[data-mb-scope="${hintScope.id}"]`)
      : null;
    if (!hint || !chip) return;
    const c = chip.getBoundingClientRect();
    hint.style.setProperty(
      '--mbh-hint-caret',
      `${Math.round(c.left + c.width / 2 - hint.getBoundingClientRect().left)}px`,
    );
  }, [showScopeHint, hintScope, split, collapsed]);

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
    // 'refused' (a built-in body's number) says nothing: no row here offers one.
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
  //
  // A listed entry stored WITHOUT a name (a body added before its source could name it)
  // is shown by the name its list row shows — the one that arrived with its file — or,
  // failing that, by the name the scope offers now, so a search result never reads
  // "(579513)" beside a list row reading "2014 SE357 (579513)". Shown, not stored: the
  // entry itself is handed on unchanged in every other respect.
  const entryFor = (n: number, name: string, sourceId: string): MinorListEntry => {
    const listed = listByN.get(n);
    if (listed) {
      if (listed.name) return listed;
      const shown = rows.find((r) => r.entry.n === n)?.name || name;
      return shown ? { ...listed, name: shown } : listed;
    }
    return {
      n,
      name,
      source: bundledMinorBody(n) ? BUNDLED_SOURCE_ID : sourceId,
    };
  };

  // "Eros (433)", "(433)", or "Zeus (hyp)" — the one naming rule every surface shares.
  const displayName = (n: number, name: string) => minorDisplayLabel(n, name, t);

  // A body's class tag, as the source it would load from answers it (resolveMinorSource:
  // the bundled set for its own bodies and the hypothetical points, a registered source
  // for the rest) — so a search result and the same body on the list always agree. A
  // source whose classes load lazily answers nothing until they land; the row draws
  // untagged meanwhile and picks its tag up when the source says so (below).
  const tagLabel = (tag: MinorClassTag) => t(`minorBodies.tags.${tag}`);
  const classLabel = (entry: MinorListEntry): string | undefined => {
    const tag = resolveMinorSource(entry)?.classTag?.(entry.n) ?? null;
    return tag ? tagLabel(tag) : undefined;
  };
  const [, setClassesLanded] = useState(0);
  useEffect(() => {
    // The registered set is fixed after startup (registerMinorBodySource's contract).
    const offs = getMinorBodySources().map((s) =>
      s.onClassTags?.(() => setClassesLanded((v) => v + 1)),
    );
    return () => {
      for (const off of offs) off?.();
    };
  }, []);

  // The second line under a list row: why a switched-on body isn't drawn. 'shown'
  // and 'off' need nothing. `hint`: a longer why, for the row's tip.
  // Why a body's file has no data where a set of lines is drawn — its own date, or a
  // composite's parents' (either can be outside), or for a hypothetical point the planets'
  // span, which it shares.
  const noDataHint = (n: number, ofComposite: boolean) =>
    isHypotheticalKey(n)
      ? t('minorBodies.hud.status.noDataHintHyp')
      : ofComposite
        ? t('minorBodies.hud.status.noDataHintComposite')
        : t('minorBodies.hud.status.noDataHint');
  const overlayModeName = (mode: OverlayKind) => t(`topNav.overlay.modes.${mode}.label`);
  // The row's two sides, the chart's lines (`s`) and an overlay's drawn beside them
  // (`ov`, present only while they are — MinorRow.overlay), said as one line. The window
  // describes LINES only (the wheel carries every body regardless; L72). A side that
  // draws needs no word; one that doesn't is named only where the other one does, so a
  // row never reads "no lines" while some of its lines are on the map:
  //  - chart shown, overlay out of its file → "No Transits lines at this date";
  //  - chart without lines (out of its file, no birth time, natal lines off), overlay
  //    drawn → "Transits lines only", the tip saying why the chart's aren't;
  //  - neither (the chart out of its file or without lines, the overlay out of its file)
  //    → the chart's reason plainly, as without an overlay: "No Transits lines at this
  //    date" there would imply the chart's lines were drawn, and lose the no-time or
  //    natal-lines-off reason that is the one a reader can act on.
  const statusLine = (
    s: MinorRowStatus,
    ov: MinorRow['overlay'],
    n: number,
  ): { text: string; failed?: boolean; hint?: string } | null => {
    if (ov) {
      const mode = overlayModeName(ov.mode);
      if (ov.kind === 'noData' && s.kind === 'shown') {
        return {
          text: t('minorBodies.hud.status.overlayNoData', { mode }),
          hint: noDataHint(n, !!composite?.overlay),
        };
      }
      if (ov.kind === 'shown' && s.kind !== 'shown') {
        return {
          text: t('minorBodies.hud.status.overlayOnly', { mode }),
          hint:
            s.kind === 'noData'
              ? noDataHint(n, !!composite?.chart)
              : s.kind === 'undrawn' && (s.reason === 'noTime' || s.reason === 'natalOff')
                ? t(`minorBodies.hud.status.overlayOnlyHint.${s.reason}`)
                : undefined,
        };
      }
    }
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
        // Short on the row, which greys out (the body stays on the list — the date is a
        // standing state that ends by itself); the span it fell outside is the tip's.
        return {
          text: t('minorBodies.hud.status.noData'),
          hint: noDataHint(n, !!composite?.chart),
        };
      // The source's note alone, no tier pill beside the name: the note already says
      // which plan it takes, and the pill cost a long name its line (2026-09-29).
      case 'held':
        return { text: s.note };
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
  // with the list's own actions beside it rather than inside it — the remove ×, and on a
  // line of their own under the row, the actions that are words (Try again, and the
  // remove's confirm pair), which beside the name would crowd its line.
  const catalogRow = (
    key: string,
    entry: MinorListEntry,
    on: boolean,
    opts: {
      sub?: string;
      status?: MinorRowStatus;
      /** The row's overlay side (MinorRow.overlay), read with `status`. */
      overlay?: MinorRow['overlay'];
      removable?: boolean;
      /** A search result — marked so a reveal can put focus on it. */
      hit?: boolean;
      /** Its class tag's label, at the right of the name line — the list's rows and
       *  search results carry one, the Featured browse never does. */
      cls?: string;
    } = {},
  ) => {
    const name = displayName(entry.n, entry.name);
    // The same name in parts, so a row too narrow for it cuts the name and keeps its number.
    const parts = minorDisplayParts(entry.n, entry.name, t);
    const status = opts.status ? statusLine(opts.status, opts.overlay, entry.n) : null;
    const sub = status?.text ?? opts.sub;
    const inList = listByN.has(entry.n);
    // A list icon on a browsing/search row whose body is on the list but switched
    // off — switched ON already says so with its eye. "On your list" is its label:
    // the icon's accessible name, and the row's tip.
    const added = !opts.removable && inList && !on ? t('minorBodies.hud.row.added') : undefined;
    const refusal = refusalFor(entry.n);
    const failed = opts.status?.kind === 'failed';
    // Switched on, but no data at the instant the lines are drawn: greyed rather than
    // hidden — it is still on the list, and draws again on a date its data covers. Not
    // while an overlay beside the chart draws it: the row has lines then.
    const noData = opts.status?.kind === 'noData' && opts.overlay?.kind !== 'shown';
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
          className={`mbh-toggle ${on ? 'on' : 'off'}${noData ? ' is-nodata' : ''}`}
          onClick={() => toggleEntry(entry, !!opts.removable)}
          ariaPressed={on}
          listRow={opts.removable ? entry.n : undefined}
          hitRow={opts.hit ? entry.n : undefined}
          tip={
            refusal
              ? { title: t('minorBodies.hud.row.show', { name }), hint: refusal, note: added }
              : status?.hint
                ? { title: name, hint: status.hint }
                : added
                  ? { title: name, hint: added }
                  : undefined
          }
          fullName={name}
        >
          <EyeIcon open={on} className="location-ls-eye" size={14} />
          <RowMark n={entry.n} theme={theme} />
          <span className="mbh-body">
            <span className="mbh-main">
              <span className="mbh-name">
                {parts.before && <span className="mbh-name-keep">{parts.before}</span>}
                {parts.own && <span className="mbh-name-own">{parts.own}</span>}
                {parts.after && <span className="mbh-name-keep">{parts.after}</span>}
              </span>
              {/* An icon, not the words: the "On your list" chip took ~74px of a line
                  the name and its tag need, crushing a name like Salacia to a letter. */}
              {added && (
                <svg className="mbh-onlist" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={added}>
                  <path d="M16 6H3" />
                  <path d="M16 12H3" />
                  <path d="M11 18H3" />
                  <path d="m15 18 2 2 4-4" />
                </svg>
              )}
              {opts.cls && <span className="mbh-class">{opts.cls}</span>}
            </span>
            {sub && <span className={`mbh-sub${status?.failed ? ' is-failed' : ''}`}>{sub}</span>}
          </span>
        </MbTipButton>
        {opts.removable && (
          // The × stays in its place while its confirm is open below (hidden, never
          // removed), so the name line doesn't widen and narrow under the reader.
          <span className={`mbh-acts${confirming ? ' is-confirm' : ''}`}>
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
        )}
        {confirming ? (
          // The armed remove: an explicit confirm / keep pair, so a stray tap
          // on the × never drops a body (and its name) from the list.
          <span className="mbh-below">
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
          opts.removable &&
          failed && (
            <span className="mbh-below">
              <button
                type="button"
                className="mbh-retry"
                aria-label={t('minorBodies.hud.row.retryAria', { name })}
                onClick={() => onRetry(entry.n)}
              >
                {t('minorBodies.hud.row.retry')}
              </button>
            </span>
          )
        )}
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

  // "Parans with the planets" — the sidebar's switch, as Hide all is. A held switch is
  // aria-disabled rather than disabled, so its tip (with the reason as its note) still opens
  // on hover and focus; the click does nothing.
  const paransLabel = t('minorBodies.hud.parans.label');
  const paransHeld = !!parans?.heldNote;
  const paransSwitch = parans && (
    <div className="mbh-scoperow mbh-paransrow">
      <TipButton
        type="button"
        role="switch"
        aria-checked={parans.on}
        aria-disabled={paransHeld || undefined}
        aria-label={t('minorBodies.hud.parans.aria')}
        className={`es-advanced-toggle mbh-hideall mbh-parans ${parans.on ? 'on' : 'off'}${paransHeld ? ' ui-inert' : ''}`}
        onClick={() => {
          if (!paransHeld) parans.onChange(!parans.on);
        }}
        placement="top"
        tip={paransLabel}
        hint={t('minorBodies.hud.parans.hint')}
        note={parans.heldNote ?? undefined}
        unavailable={paransHeld}
      >
        <span className="es-toggle-label">{paransLabel}</span>
        <span className="es-toggle-track" aria-hidden="true">
          <span className="es-toggle-thumb" />
        </span>
      </TipButton>
    </div>
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
            overlay: row.overlay,
            removable: true,
            cls: classLabel(row.entry),
          }),
        )}
      </ul>
    );
    return (
      <>
        {/* The heading carries Clear at its right: the whole list off in one go, after
            an inline confirm like the row ×'s (a stray tap never empties it). Harsher
            than Hide all, which keeps the selection — and Hide all is left as it is. */}
        <div className="mbh-head-row">
          <h3 className="capture-hud-label mbh-head">{t('minorBodies.hud.sections.yours')}</h3>
          {confirmClear ? (
            <span className="mbh-clear-confirm">
              <span className="mbh-clear-ask">{t('minorBodies.hud.clear.ask', { count: rows.length })}</span>
              <button
                type="button"
                className="psf-row-confirm"
                // Focus follows the Clear it replaced, as the row confirm's does.
                autoFocus
                onClick={() => {
                  // The column goes with the list, so focus returns to the search box,
                  // as it does when the last body is removed.
                  focusAfter.current = 'input.psf-input';
                  setConfirmClear(false);
                  setConfirmN(null);
                  api.clear();
                }}
              >
                {t('minorBodies.hud.clear.confirm')}
              </button>
              <button
                type="button"
                className="psf-row-keep"
                onClick={() => {
                  focusAfter.current = 'button.mbh-clear';
                  setConfirmClear(false);
                }}
              >
                {t('minorBodies.hud.clear.keep')}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="mbh-clear"
              aria-label={t('minorBodies.hud.clear.aria')}
              onClick={() => {
                setConfirmN(null);
                setConfirmClear(true);
              }}
            >
              {t('minorBodies.hud.clear.label')}
            </button>
          )}
        </div>
        {hideAll && (
          <p className="location-ls-note mbh-note">{t('minorBodies.hud.hideAll.hiddenNote')}</p>
        )}
        {/* "Parans with the planets" — the list's bodies paired with the built-in ones, a
            switch of its own (off by default) because it acts on this list alone. Above the
            rows so it stays in reach however long the list is. Held (the map's parans off,
            the sky hold, Cyclocartography), it keeps the stored position, greyed and inert,
            and its tip's note names what to change (the .ui-inert convention). */}
        {paransSwitch}
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
                  locked scope stays visible and tappable: a tap explains itself under the
                  input instead of switching, and does nothing more — no upgrade screen. A
                  chip is a toggle inside a search in progress, and leaving the search for a
                  tap that asked "what is this?" was the disruption (Salvatore, 2026-10-01,
                  reversing seam L73; the place search's idiom, which changed with it). */}
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
                        data-mb-scope={s.id}
                        className={`psf-scope${isOn ? ' is-on' : ''}${g?.locked ? ' is-locked' : ''}${showScopeHint && s.id === hintScope?.id ? ' is-hinted' : ''}`}
                        onClick={() => {
                          if (g?.locked) {
                            // The reason under the input is the whole answer; focus stays in
                            // the search (see the comment above the chips).
                            setTeasedId(s.id);
                            inputRef.current?.focus();
                            return;
                          }
                          // Switching scope is what the hint teaches: done, shown or not.
                          if (s.id !== BUNDLED_SOURCE_ID && scopeHintLive) {
                            spendScopeHint();
                            setScopeHintLive(false);
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

            {showScopeHint && hintScope && (
              <p ref={scopeHintRef} className="mbh-scopehint" role="status">
                {t('minorBodies.hud.scopeHint', { scope: scopeLabel(hintScope) })}
              </p>
            )}
            {note && <p className="psf-note mbh-searchnote">{note}</p>}
            {capNote && !(split && capNote.inList) && capNoteEl}
            {q === '' && (
              <p className="location-ls-note mbh-note">
                {featuredScope ? t('minorBodies.hud.empty') : t('minorBodies.hud.emptyScope')}
              </p>
            )}
          </div>

          <div ref={scrollRef} className={`mbh-scroll${pagedScroll ? ' is-paged' : ''}`}>
            {/* ── Main minor bodies ───────────────────────────────────────────
                The five built-in minor bodies — the SAME switches as Map filters
                (the raw preference and its own toggle), so every minor body can
                be reached from this one window without a second copy of any. */}
            <h3 className="capture-hud-label mbh-head">{t('minorBodies.hud.sections.builtin')}</h3>
            <p className="mbh-info">{t('minorBodies.hud.groupInfo.builtin')}</p>
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
                    // A main minor body points (and moves focus) to its switch
                    // above; Pluto lives with the planets in Map filters, and this
                    // window never toggles it — so its pointer is text, not a control.
                    // Each carries its own class tag like any result (Ceres a dwarf
                    // planet, Chiron a centaur); Pluto, a planet here, none.
                    const tag = builtinClassTag(n);
                    const cls = tag && <span className="mbh-class">{tagLabel(tag)}</span>;
                    return (
                      <li key={`builtin-${n}`}>
                        {MINOR_BODIES.includes(planet) ? (
                          <button type="button" className="mbh-pointer" onClick={() => focusMain(planet)}>
                            {glyph}
                            <span>{t('minorBodies.hud.builtinHit.minor', { name })}</span>
                            {cls}
                          </button>
                        ) : (
                          <div className="mbh-pointer">
                            {glyph}
                            <span>{t('minorBodies.hud.builtinHit.planet', { name })}</span>
                            {cls}
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {shownHits.map((hit) => {
                    const entry = entryFor(hit.n, hit.name, scope.id);
                    // Results have no headings, so each says what it is with its tag
                    // (a bundled body's group used to be its second line — the tag
                    // says it now, once). A source's own second line still shows.
                    return catalogRow(`hit-${hit.n}`, entry, visibleSet.has(hit.n), {
                      sub: hit.sub,
                      hit: true,
                      cls: classLabel(entry),
                    });
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

            {/* ── The Featured browse (its own scope, while nothing is typed) ──────
                Level-1 headings in the section style, level-2 under Hypothetical
                points, each with its info line. No class tags: the headings say it. */}
            {/* Fragments, not wrappers: every heading stays a child of the scroll
                area, so the section style's spacing above a heading that isn't
                first applies to these as it does to Results and Your list. */}
            {q === '' &&
              featuredScope &&
              FEATURED_BROWSE.map(({ head, groups }) => (
                <Fragment key={head}>
                  <h3 className="capture-hud-label mbh-head">{t(`minorBodies.hud.groups.${head}`)}</h3>
                  <p className="mbh-info">{t(`minorBodies.hud.groupInfo.${head}`)}</p>
                  {groups.map(({ group, sub, bodies }) => (
                    <Fragment key={group}>
                      {sub && (
                        <>
                          <h4 className="mbh-subgroup-head">{t(`minorBodies.hud.groups.${group}`)}</h4>
                          <p className="mbh-info is-sub">{t(`minorBodies.hud.groupInfo.${group}`)}</p>
                        </>
                      )}
                      <ul className="mbh-list">
                        {bodies.map((b) =>
                          catalogRow(
                            `bundled-${b.n}`,
                            entryFor(b.n, b.name, BUNDLED_SOURCE_ID),
                            visibleSet.has(b.n),
                          ),
                        )}
                      </ul>
                    </Fragment>
                  ))}
                </Fragment>
              ))}
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
