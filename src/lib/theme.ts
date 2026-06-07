// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

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
