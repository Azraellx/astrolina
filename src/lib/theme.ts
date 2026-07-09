// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { PlanetName } from './ephemeris';

export type Theme = 'glass' | 'dark' | 'vintage';

// Earth (vintage) leads the list and is the default; Glass and Dark follow.
export const THEMES: Theme[] = ['vintage', 'glass', 'dark'];

// Theme display labels moved to the i18n catalog (settings.theme.*); resolve via
// useT().labels.theme(theme). Internal ids stay 'glass'/'dark'/'vintage' (persisted
// prefs + [data-theme] selectors); only the display label for vintage ("Earth") differs.

const STORAGE_KEY = 'astro:theme:v1';

export function loadTheme(): Theme {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'glass' || v === 'dark' || v === 'vintage') return v;
  return 'vintage';
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export const BASEMAP_STYLE_URLS: Record<Theme, string> = {
  // Glass rides over the light "positron" basemap — frosted silver panels read
  // cleanest over a pale map.
  glass: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  // Vintage uses a self-hosted MapTiler-Basic style (BSD-3-Clause) retiled onto
  // OpenFreeMap's free OpenMapTiles vector tiles. See public/basemaps/README.md.
  vintage: `${import.meta.env.BASE_URL}basemaps/maptiler-basic.json`,
};

// Offline basemap fallback palette (see Map's offlineStyle + installWorldFallback). With no
// connection the live OpenFreeMap styles/tiles can't load — the glass/dark STYLES are remote too,
// so offline they wouldn't even reach the background — so the map draws a plain ocean + the bundled
// coarse world outline instead. These echo each theme's basemap so it reads as a muted version of
// the real one: `ocean` is the background, `land` the continent fill, `line` the coastlines + borders.
export const WORLD_FALLBACK_COLORS: Record<Theme, { ocean: string; land: string; line: string }> = {
  vintage: { ocean: 'hsl(205, 42%, 80%)', land: 'hsl(47, 26%, 86%)', line: 'hsl(34, 16%, 56%)' },
  glass: { ocean: 'hsl(205, 32%, 86%)', land: 'hsl(0, 0%, 96%)', line: 'hsl(210, 12%, 64%)' },
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
export const MOON_LINE_DARK = '#5b6480';

// Per-theme MAP-LINE colour overrides for bodies whose PLANET_COLORS tint washes out
// against a given basemap. MAP-ONLY: the wheel, sidebar, cards etc. keep the canonical
// PLANET_COLORS. Single source for App's line-colour swap (withThemeLineColors) AND the
// baked zenith glyph (glyphImages.ensureGlyphImages), so lines + stamps stay in sync.
//  • Moon — pale gray fails on BOTH light basemaps (Glass + Earth).
//  • Mercury (light mint) / Uranus (light cyan) — only wash into Earth's warm parchment,
//    so they get a deeper tint there alone.
// Dark's basemap is dark, so it needs no overrides.
export const MAP_LINE_COLOR_OVERRIDES: Record<Theme, Partial<Record<PlanetName, string>>> = {
  dark: {},
  glass: { Moon: MOON_LINE_DARK },
  vintage: { Moon: MOON_LINE_DARK, Mercury: '#2e9e82', Uranus: '#2489a8' },
};

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

// Halo behind the eclipse magnitude-isoline percentage labels (e.g. "50%"), whose
// digits draw in the quiet isoline tint (eclipses.ts PATH_COLORS.iso). Glass pairs
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
