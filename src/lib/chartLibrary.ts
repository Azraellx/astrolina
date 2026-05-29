import type { BirthData } from './birthData';

export interface StoredChart extends BirthData {
  id: string;
  createdAt: number;
  tzIana?: string;
  tzUncertain?: boolean;
}

const STORAGE_KEY = 'astro:charts:v1';
const CURRENT_KEY = 'astro:charts:current:v1';

export function loadCharts(): StoredChart[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredChart[];
  } catch {
    return [];
  }
}

export function saveCharts(charts: StoredChart[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(charts));
}

export function loadCurrentId(): string | null {
  return localStorage.getItem(CURRENT_KEY);
}

export function saveCurrentId(id: string | null) {
  if (id) localStorage.setItem(CURRENT_KEY, id);
  else localStorage.removeItem(CURRENT_KEY);
}

export function newChartId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
