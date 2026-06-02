export type Theme = 'glass' | 'dark' | 'light' | 'vintage';

export const THEMES: Theme[] = ['glass', 'light', 'dark', 'vintage'];

export const THEME_LABELS: Record<Theme, string> = {
  glass: 'Glass',
  light: 'Light',
  dark: 'Dark',
  // Internal id stays 'vintage' (persisted prefs + [data-theme] selectors); only the
  // display label changed to "Earth".
  vintage: 'Earth',
};

const STORAGE_KEY = 'astro:theme:v1';

export function loadTheme(): Theme {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'glass' || v === 'dark' || v === 'light' || v === 'vintage') return v;
  return 'glass';
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
  light: 'https://tiles.openfreemap.org/styles/positron',
  // Vintage uses a self-hosted MapTiler-Basic style (BSD-3-Clause) retiled onto
  // OpenFreeMap's free OpenMapTiles vector tiles. See public/basemaps/README.md.
  vintage: `${import.meta.env.BASE_URL}basemaps/maptiler-basic.json`,
};

export const LABEL_HALO_COLORS: Record<Theme, string> = {
  glass: 'rgba(255, 255, 255, 0.95)',
  dark: 'rgba(10, 10, 15, 0.95)',
  light: 'rgba(255, 255, 255, 0.95)',
  vintage: 'rgba(28, 20, 12, 0.95)',
};

// Inner-fill color for the zenith stamps' disc. Mirrors the glyph halo for
// dark/light, but glass is frosted-translucent (matching the theme's glass
// surfaces) and vintage uses a warm parchment instead of its near-black halo, so
// neither reads as a flat solid white/black coin.
export const ZENITH_DISC_COLORS: Record<Theme, string> = {
  glass: 'rgba(245, 245, 245, 0.85)',
  dark: 'rgba(10, 10, 15, 0.95)',
  light: 'rgba(255, 255, 255, 0.95)',
  vintage: 'rgba(232, 222, 202, 0.92)',
};
