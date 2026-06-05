// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The map projection mode — a persisted user setting, independent of the theme.
// '2d' is flat Web-Mercator (the classic, locked, north-up view); '3d' is the
// MapLibre globe (free rotate + tilt). Mirrors the shape of ./theme.ts.
export type MapProjectionMode = '2d' | '3d';

const STORAGE_KEY = 'astro:projection:v1';

// Default to 2D on first ever load; otherwise remember the last choice.
export function loadProjection(): MapProjectionMode {
  return localStorage.getItem(STORAGE_KEY) === '3d' ? '3d' : '2d';
}

export function saveProjection(p: MapProjectionMode): void {
  localStorage.setItem(STORAGE_KEY, p);
}

// App mode → MapLibre `ProjectionSpecification['type']`.
export const PROJECTION_SPEC: Record<MapProjectionMode, 'mercator' | 'globe'> = {
  '2d': 'mercator',
  '3d': 'globe',
};
