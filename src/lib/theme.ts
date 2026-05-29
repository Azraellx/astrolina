export type Theme = 'dark' | 'light' | 'vintage';

export const THEMES: Theme[] = ['light', 'dark', 'vintage'];

export const THEME_LABELS: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  vintage: 'Vintage',
};

const STORAGE_KEY = 'astro:theme:v1';

export function loadTheme(): Theme {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'dark' || v === 'light' || v === 'vintage') return v;
  return 'light';
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export const BASEMAP_STYLE_URLS: Record<Theme, string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
  vintage: 'https://tiles.openfreemap.org/styles/liberty',
};

export const LABEL_HALO_COLORS: Record<Theme, string> = {
  dark: 'rgba(10, 10, 15, 0.95)',
  light: 'rgba(255, 255, 255, 0.95)',
  vintage: 'rgba(28, 20, 12, 0.95)',
};
