// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Text for the map surface: the MapLibre zoom/compass control tooltips, the pin
// title, the clickable edge-badge fly-to tips, the zenith hover popup, and the
// deep-zoom "zoom out" escape pill.
export const map = {
  // MapLibre navigation control tooltips (zoom in/out + reset bearing & tilt).
  ctrl: {
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetBearing: 'Reset bearing & tilt',
  },
  // Pin marker title (hover), by pin type.
  pin: {
    natal: 'Natal birth location (right-click to remove)',
    custom: 'Pinned location (right-click to remove)',
  },
  // Fly-to tooltips on the clickable edge badges. {planet} is the planet display
  // name; {prefix} is the optional overlay prefix already followed by a space.
  flyToZenith: "Fly to {prefix}{planet}'s zenith",
  flyToParan: "Fly to this paran's intersection (click again to return)",
  flyToLocalSpaceOrigin: 'Fly to the local-space origin (the pin)',
  // Bare-line hover label for the ecliptic great circle.
  ecliptic: 'Ecliptic',
  // Zenith stamp hover popup. {planet} is the planet display name.
  zenithTitle: '{planet} zenith',
  zenithSub: 'where {planet} is directly overhead',
  // Deep-zoom escape pill (appears once zoomed past the detail threshold).
  zoomOutToWide: 'Zoom out to a wide view',
  zoomOut: 'Zoom Out',
} as const;
