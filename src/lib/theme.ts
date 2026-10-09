// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { PlanetName } from './ephemeris';
import type { Element } from './astro/dignities';
import { hypotheticalPoint } from './minorBodies/hypothetical';

export type Theme = 'glass' | 'dark' | 'vintage';

// Earth (vintage) leads the list and is the default; Glass and Dark follow.
export const THEMES: Theme[] = ['vintage', 'glass', 'dark'];

/** What the reader picked in the theme list: one of the three built-ins, or a Custom
 *  theme (a downstream build's option, lib/extensions/themeOptions). `Theme` itself stays
 *  the three built-ins — every Record<Theme, …> table below and every loop over THEMES is
 *  untouched by Custom, which is always drawn ON a built-in (its spec's `base`). */
export type ThemeChoice = Theme | 'custom';

// Theme display labels moved to the i18n catalog (settings.theme.*); resolve via
// useT().labels.theme(theme). Internal ids stay 'glass'/'dark'/'vintage' (persisted
// prefs + [data-theme] selectors); only the display label for vintage ("Earth") differs.

// The last BUILT-IN theme picked. Never holds 'custom' — see CUSTOM_CHOSEN_KEY.
const STORAGE_KEY = 'astro:theme:v1';

/** What a missing or unreadable stored theme loads as (Earth). Also the one built-in a
 *  downstream build can't tier (lib/extensions/builtinThemeTiers): every reader reaches it. */
export const DEFAULT_THEME: Theme = 'vintage';

export function loadTheme(): Theme {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'glass' || v === 'dark' || v === 'vintage') return v;
  return DEFAULT_THEME;
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
}

// Whether the reader's choice is Custom, in a key of its OWN rather than as a fourth value
// of astro:theme:v1 (2026-10-06). The app saves the theme on mount, not only on a pick
// (App's [theme] effect), so every build that loads this origin rewrites astro:theme:v1 with
// what it understood there. A build that doesn't know 'custom' — `dev:core` on the same
// origin, a rollback, a stale PWA shell still being served — would read 'custom' as unknown,
// fall back to Earth, and write Earth back: the reader's choice destroyed by a visit to an
// older page, which is CLAUDE.md rule 6's failure exactly. Kept apart, the old key keeps
// meaning what every build already agrees it means (the last built-in, which is also the
// theme a Custom choice falls back to while it is held), and the new key is invisible to
// builds that don't read it. Absent = not chosen; only the picker writes it.
const CUSTOM_CHOSEN_KEY = 'astro:theme-custom:v1';

/** Whether Custom is the stored theme choice. Never throws (a blocked storage reads as no). */
export function loadCustomChosen(): boolean {
  try {
    return localStorage.getItem(CUSTOM_CHOSEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Record (true) or clear (false) the Custom choice. Clearing REMOVES the key, so a reader
 *  who never picked Custom and one who picked it and left look the same: absent. */
export function saveCustomChosen(chosen: boolean): void {
  try {
    if (chosen) localStorage.setItem(CUSTOM_CHOSEN_KEY, '1');
    else localStorage.removeItem(CUSTOM_CHOSEN_KEY);
  } catch {
    /* storage blocked: the choice lasts this session only */
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/** A served vector map: each built-in theme's own, and two no built-in draws but a palette can
 *  choose (themePalette BasemapChoice): Positron (Glass's until 2026-10-08, below) and Fiord. */
export type ServedMap = Theme | 'positron' | 'fiord';

// GLASS MOVED TO OSM BRIGHT (Salvatore, 2026-10-08), so the four themes look distinct: Glass
// and the Prism theme a downstream build adds (its colour-blind look) both drew Positron, pale
// grey under light panels, and side by side the two read as one theme. Bright (OpenFreeMap's
// maintained fork of OpenMapTiles' OSM Bright; BSD-3-Clause code, CC BY 4.0 design — credited in
// CreditsModal) gives Glass cream land and pale-blue water under the same frosted panels. Same
// OpenMapTiles schema, fonts and sprite as the other three, so basemapStyle's source-layer
// repaint and toggles work on it unchanged; its one layer the others lack, the ferry routes,
// basemapStyle hides. Positron stays, under its own id rather than Glass's: a palette that was
// designed on that plain map (a downstream build's colour-blind look promises 3:1 on ITS land
// and water) pins it, so it doesn't move with Glass. Glass's built-in line colours read no worse
// on Bright than they did on Positron (both rely on their halos), which is why Glass itself could.
export const BASEMAP_STYLE_URLS: Record<ServedMap, string> = {
  glass: 'https://tiles.openfreemap.org/styles/bright',
  // The plain light-grey map, Glass's until 2026-10-08.
  positron: 'https://tiles.openfreemap.org/styles/positron',
  // Fiord (2026-10-09): OpenFreeMap's fork of OpenMapTiles' Fiord Color, a slate-blue night map
  // (BSD-3-Clause code, CC BY 4.0 design, credited in CreditsModal). Same schema, fonts and sprite
  // as the rest. A downstream build's dark-panelled look draws it; no built-in does.
  fiord: 'https://tiles.openfreemap.org/styles/fiord',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  // Vintage uses a self-hosted MapTiler-Basic style (BSD-3-Clause) retiled onto
  // OpenFreeMap's free OpenMapTiles vector tiles. See public/basemaps/README.md.
  vintage: `${import.meta.env.BASE_URL}basemaps/maptiler-basic.json`,
};

// Offline basemap fallback palette (see Map's offlineStyle + installWorldFallback). With no
// connection the live OpenFreeMap styles/tiles can't load — the glass/dark STYLES are remote too,
// so offline they wouldn't even reach the background — so the map draws a plain ocean + the bundled
// coarse world outline instead. These echo each served map so it reads as a muted version of
// the real one: `ocean` is the background, `land` the continent fill, `line` the coastlines + borders.
// Keyed by the MAP, not the theme: `positron` is Positron's, the values Glass had until 2026-10-08
// (exactly, so a palette pinned to that map keeps its land and water tokens); `glass` echoes Bright
// now — cream land, pale-blue water, and a slate coastline that reads on both (2.9:1 on the land
// and 2.0:1 on the water, where Positron's has 2.4 and 1.9).
export const WORLD_FALLBACK_COLORS: Record<ServedMap, { ocean: string; land: string; line: string }> = {
  vintage: { ocean: 'hsl(205, 42%, 80%)', land: 'hsl(47, 26%, 86%)', line: 'hsl(34, 16%, 56%)' },
  glass: { ocean: 'hsl(203, 45%, 80%)', land: 'hsl(32, 40%, 95%)', line: 'hsl(205, 20%, 56%)' },
  positron: { ocean: 'hsl(205, 32%, 86%)', land: 'hsl(0, 0%, 96%)', line: 'hsl(210, 12%, 64%)' },
  // Fiord's own land (#45516e) and water (#38435c), and a coastline a step lighter than both.
  fiord: { ocean: '#38435c', land: '#45516e', line: 'hsl(222, 18%, 52%)' },
  dark: { ocean: 'hsl(210, 26%, 15%)', land: 'hsl(210, 12%, 23%)', line: 'hsl(210, 12%, 44%)' },
};

// A fixed reference view used when eyeballing basemap-theme tweaks; not rendered
// at runtime.
export const THEME_REFERENCE_VIEW = { name: 'Hartsmere', lat: 54.0091, lng: -2.4417 } as const;

export const LABEL_HALO_COLORS: Record<Theme, string> = {
  glass: 'rgba(255, 255, 255, 0.95)',
  dark: 'rgba(10, 10, 15, 0.95)',
  vintage: 'rgba(28, 20, 12, 0.95)',
};

// Basemap PLACE-NAME contrast override, applied post-load by basemapStyle's
// applyBasemapPaint as the built-in of the label tokens (basemap.label / .labelHalo /
// .labelHaloWidth) — the same mutate-the-served-style discipline as the detail
// toggles. OpenFreeMap's stock dark style paints place names in a dim slate
// that's hard to read against the near-black ground; lift them to a soft light
// gray over a deeper halo. Null = the style's own label paint reads fine
// (glass/vintage — on Bright and on Positron alike), so it isn't touched.
export const LABEL_CONTRAST: Record<
  Theme,
  { color: string; halo: string; haloWidth: number } | null
> = {
  dark: { color: '#c5cad4', halo: 'rgba(8, 10, 15, 0.92)', haloWidth: 1.15 },
  glass: null,
  vintage: null,
};

// GLASS'S ROADS, A QUIET WARM GREY (Salvatore, 2026-10-08). Painted over every road layer (the
// transportation source-layer) by basemapStyle's applyBasemapPaint, as the built-in of the Roads
// token (themePalette basemap.road), the way LABEL_CONTRAST is the built-in of the place-name ones.
// From about z5 Bright draws a dense road net in orange and yellow (motorways #fc8, trunk and
// primary #fea, casings #e9ac77): the hues of the Sun, Mars, Jupiter and half a dozen other bodies'
// lines, laid across every landmass a chart is read on. #cfc7bc is Bright's own land hue (#f8f4f0)
// taken darker: 1.53:1 on the land, so the net still reads as roads, but with no colour for a line
// to be confused with, below the borders (#9e9cab, 2.46:1), and 3.5:1 off the Moon's slate, the one
// grey line. Chosen by eye at z5–6 over Japan, Korea and central Europe against #d9d2c8 (roads all
// but gone at z5) and #c5bcb0 (a grey texture as busy as the borders); world view draws no roads.
// KEYED BY THE SERVED MAP, and read on the map choice itself — never through themePalette's
// mapTableOf, which reads Glass's tables for Positron: a palette pinned to Positron must draw
// exactly as Glass did there, roads included. Null = the style's own roads. A Custom theme's own
// Roads colour still wins: it is an override of the token.
export const BASEMAP_ROAD_PAINT: Record<ServedMap, string | null> = {
  glass: '#cfc7bc',
  positron: null,
  fiord: null,
  dark: null,
  vintage: null,
};

// Inner-fill color for the zenith stamps' disc. Mirrors the glyph halo for dark, but
// glass is frosted-translucent (matching the theme's glass surfaces) and vintage uses
// a warm parchment instead of its near-black halo, so neither reads as a flat solid
// white/black coin.
export const ZENITH_DISC_COLORS: Record<Theme, string> = {
  glass: 'rgba(245, 245, 245, 0.85)',
  dark: 'rgba(10, 10, 15, 0.95)',
  vintage: 'rgba(232, 222, 202, 0.92)',
};

// The Moon's pale gray reads on the dark basemap but barely shows on the light Earth /
// Glass themes — including over the pale zenith disc, where its baked glyph and ring
// nearly disappear. On those themes only, the Moon's lines, labels, and zenith
// glyph/stamp use this darker slate instead.
//
// ONE RULE (2026-10-08): the Moon is this slate wherever it is drawn on a LIGHT ground, and
// its pale gray elsewhere. On the map that is the Glass and Earth basemaps — every family of
// its lines: its own lines, parans (lib/themePalette paran.*) and local space, drawn and in
// the line set plugins read (lib/lineInks inkAllLines). Off the map it is Glass's light panels
// and the report paper, through --moon-panel-ink (planetInk falls back through it). Until then
// the rule held for the Moon's own lines only: its parans stayed pale beside them, Radar's
// reveal drew its local space pale, and the wheel, lists and paper drew its glyph pale on a
// near-white ground — none of it decided, each an omission.
export const MOON_LINE_DARK = '#5b6480';

// Per-theme MAP-LINE colour overrides for bodies whose PLANET_COLORS tint washes out
// against a given basemap. MAP-ONLY: the wheel, sidebar, cards etc. keep the canonical
// PLANET_COLORS (one exception off the map, for a glyph that stands alone: panelGlyphColor
// below). Single source for the map's line inks — read through the palette engine
// (lib/themePalette `map.ink.<body>`, applied by lib/lineInks) — AND the baked zenith glyph
// (glyphImages, from the same palette's sprite spec), so lines + stamps stay in sync. Keyed
// by the BASEMAP a palette draws on, which for a built-in theme is the theme itself.
//  • Moon — pale gray fails on BOTH light basemaps (Glass + Earth). The only entry: the
//    Mercury/Uranus swaps on Earth that two comments elsewhere described were never in this
//    table (found and corrected 2026-10-06, when the palette engine began reading it).
// Dark's basemap is dark, so it needs no overrides.
export const MAP_LINE_COLOR_OVERRIDES: Record<Theme, Partial<Record<PlanetName, string>>> = {
  dark: {},
  glass: { Moon: MOON_LINE_DARK },
  vintage: { Moon: MOON_LINE_DARK },
};

// A planet glyph that stands ALONE on a panel, with no name beside it to carry it: the
// planetary-hours chip at the head of the Sky Times band, and the planet buttons of its
// window (and every other glyph in that window, so the window reads in one colour). Pass
// the canonical tint (PLANET_COLORS[planet]); every planet keeps it but the Moon, whose
// pale gray all but vanishes on Glass's near-white panels — a planet button with nothing
// visible in it (smoke test, 2026-10-05). Glass sets --moon-panel-ink to MOON_LINE_DARK
// (index.css); the other themes' panels are dark, leave it unset, and the Moon keeps its
// tint. A CSS variable rather than the theme read at render, so a theme switch recolours
// it at once. (Since 2026-10-08 the wheel, lists and cards read the same ink through
// themePalette planetInk — "the name stands beside it" didn't make a pale glyph on a
// near-white panel any easier to see; see MOON_LINE_DARK.)
export function panelGlyphColor(planet: PlanetName, tint: string): string {
  return planet === 'Moon' ? `var(--moon-panel-ink, ${tint})` : tint;
}

// Lilith's muted purple reads fine on the light map basemap but is hard to make out
// against Earth's dark-brown SETTINGS panels. The settings-tab planet glyph uses a
// brighter lavender there — a lone exception; Lilith's map line keeps PLANET_COLORS.
export const LILITH_PANEL_GLYPH_EARTH = '#b092dc';

// The fixed-star lines' shared tint, per theme: the pale starlight gold reads on
// the dark basemap but washes out on Glass/Earth, which get a deep antique gold
// instead. Single source for the line features (App's starLines memo), the baked
// star sprite (glyphImages), and every tag/card that echoes the line color.
export const STAR_LINE_COLORS: Record<Theme, string> = {
  dark: '#cdbf8f',
  glass: '#8a6e1f',
  vintage: '#7e6118',
};

// Catalog minor bodies (433 Eros, 136199 Eris, …) draw in a small palette of their
// own rather than the per-body planet colours — there are thousands of them. A
// body's colour is picked from its NUMBER (minorLineColor below), so it is the same
// every session and on every surface, and doesn't shift when other bodies are
// toggled. Per theme like the star tint: the pale hues that read on the dark
// basemap wash out on Glass/Earth, which get deeper versions of the same twelve.
export const MINOR_LINE_PALETTE: Record<Theme, readonly string[]> = {
  dark: [
    '#e98aa0', '#7fc8e8', '#b9d96f', '#d4a2f2', '#f1b86e', '#6fdcc0',
    '#e6dc74', '#9eabff', '#ff9f80', '#86d492', '#d98bd8', '#94d2ff',
  ],
  glass: [
    '#b0405c', '#1f76a6', '#5a861f', '#8540ad', '#b0620f', '#12806a',
    '#857411', '#3f4fbf', '#be4d28', '#2e843f', '#9e3a97', '#27699c',
  ],
  vintage: [
    '#a8384f', '#1c6c98', '#527b1b', '#7b3aa0', '#a45a0d', '#107662',
    '#7a6a0f', '#3a47ad', '#b04622', '#2a7839', '#91358a', '#236190',
  ],
};

/** The palette slot a catalog body draws in — stable per MPC number. A
 *  multiplicative hash rather than `n % 12`, so neighbours in the catalog (which
 *  are often shown together: 5 Astraea … 10 Hygiea) don't march through the
 *  palette in order and so collide less by pattern. A hypothetical point takes the
 *  slot its table gives it instead (hypothetical.ts says why the hash won't do). */
export function minorPaletteSlot(n: number): number {
  const hyp = hypotheticalPoint(n);
  if (hyp) return hyp.slot;
  const len = MINOR_LINE_PALETTE.dark.length;
  return (Math.imul(n, 2654435761) >>> 0) % len;
}

export function minorLineColor(n: number, theme: Theme): string {
  return MINOR_LINE_PALETTE[theme][minorPaletteSlot(n)];
}

// Path/contour colors per basemap theme for the Eclipses overlay (lib/astro/eclipses
// buildEclipseMap). Total/hybrid solar paths burn red, annular paths a ring-of-fire orange,
// lunar features a moonlit indigo; the partial-magnitude contours use a quiet slate so the
// dashed family reads as reference lines, not chart lines. Lives HERE rather than in
// eclipses.ts (where it was PATH_COLORS until 2026-10-06) because the palette engine needs it
// at startup, and eclipses.ts is a lazy chunk: importing a table from it would pull the whole
// catalog and path fitting into the main bundle. They carry meaning (which kind of eclipse),
// so a one-ink palette leaves them alone (lib/themePalette `eclipse.*`).
export const ECLIPSE_PATH_COLORS: Record<
  Theme,
  { total: string; annular: string; iso: string; lunar: string }
> = {
  glass: { total: '#d8434e', annular: '#d97e2f', iso: '#5d6679', lunar: '#5868b8' },
  dark: { total: '#ff6b6b', annular: '#ffb066', iso: '#9aa3b8', lunar: '#94a7ff' },
  vintage: { total: '#c03a32', annular: '#bd7427', iso: '#6e6253', lunar: '#5d5a8a' },
};

// Halo behind the eclipse magnitude-isoline percentage labels (e.g. "50%"), whose
// digits draw in the quiet isoline tint (ECLIPSE_PATH_COLORS.iso above). Glass pairs
// its medium-slate digits with a white halo and Dark pairs light-slate digits with a
// near-black one — both already high-contrast. Earth's digits are a MEDIUM brown, so
// reusing its near-black LABEL_HALO_COLORS buried them (dark-on-dark mud); Earth gets
// a light parchment halo instead so the brown digits pop, plus a slightly thinner
// ring so the small 10px text stays crisp rather than choked by a heavy outline.
export const ECLIPSE_LABEL_HALO: Record<Theme, { color: string; width: number }> = {
  glass: { color: 'rgba(255, 255, 255, 0.95)', width: 1.2 },
  dark: { color: 'rgba(10, 10, 15, 0.95)', width: 1.2 },
  vintage: { color: 'rgba(238, 230, 213, 0.95)', width: 0.9 },
};

// The night-side shading (Filters ▸ Night Shading): a dusk-blue wash on the
// light themes, a deeper darkening on the already-dark basemap.
export const NIGHT_SHADE_STYLE: Record<Theme, { color: string; opacity: number }> = {
  dark: { color: '#01040f', opacity: 0.38 },
  glass: { color: '#1b2a4a', opacity: 0.18 },
  vintage: { color: '#23204a', opacity: 0.16 },
};

// The geodetic grid's linework and sign labels (lib/astro/geodeticGrid): ONE neutral colour
// per theme, the basemap's own ink at low contrast, so the grid reads as a reference beneath
// the chart rather than as another family of lines. 0.6 px is under every line the map draws
// for a body (the thinnest, the parans, are 0.7; an overlay's IC 0.8), so where the grid and
// a body line coincide, the body's shows. Map.tsx also stacks the grid under all of them.
// `label` colours the sign glyphs at the band tops and on the curves. `hover` is the opacity
// of the Ascendant zone under the cursor, filled in the same ink: a soft neutral lift that
// reads over the zone shading in any element's colour, Presentation's included, without
// taking a colour of its own. (2026-10-02)
export const GEO_GRID_STYLE: Record<
  Theme,
  { line: string; opacity: number; width: number; label: string; hover: number }
> = {
  glass: { line: '#2b3445', opacity: 0.38, width: 0.6, label: '#2b3445', hover: 0.1 },
  dark: { line: '#d6dbe6', opacity: 0.3, width: 0.6, label: '#d6dbe6', hover: 0.12 },
  vintage: { line: '#4a3a24', opacity: 0.4, width: 0.6, label: '#4a3a24', hover: 0.1 },
};

// The MC zone shading: element as hue (Fire vermillion, Earth blue-green, Air gold, Water
// blue), modality as lightness, ordered [cardinal, fixed, mutable] — cardinal darkest. Per
// theme, like the star tint: the dark basemap takes brighter versions of the same hues. Drawn
// at about 12% (Presentation: about 50%), so these are the colours at full strength.
// A proposal for Lina's eye on all three themes. (2026-10-02)
export const GEO_ZONE_COLORS: Record<Theme, Record<Element, readonly [string, string, string]>> = {
  glass: {
    fire: ['#b3261e', '#e0452b', '#f08a6c'],
    earth: ['#0b6e63', '#16998a', '#5cc4b5'],
    air: ['#a87b00', '#d4a514', '#ecc95a'],
    water: ['#1c4aa6', '#3a6fd4', '#7aa2eb'],
  },
  vintage: {
    fire: ['#a3301f', '#cc4f30', '#e08767'],
    earth: ['#11665c', '#1f8c7e', '#5fb3a6'],
    air: ['#94700a', '#bf961c', '#dbbb5c'],
    water: ['#23458f', '#3d66bd', '#7896d6'],
  },
  dark: {
    fire: ['#d9452b', '#f2694a', '#ff9f85'],
    earth: ['#1a9484', '#2bbfab', '#7ae0d0'],
    air: ['#c99a12', '#ebc23a', '#ffe08a'],
    water: ['#2f62c9', '#5288ee', '#94b8ff'],
  },
};
