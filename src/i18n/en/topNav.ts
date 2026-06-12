// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Top navigation bar (TopNav.tsx): the Overlay/View menus, the centre status pill,
// the map-controls hint, and the measure tool. Overlay-mode names live here (the menu
// uses the full "Primary Directions"; the timeline nub uses a shorter form, so they're
// not shared). Status codes (NATAL/HOVER/…) are display labels, not the internal enum.
export const topNav = {
  overlay: {
    menuLabel: 'Overlay',
    none: {
      label: 'None',
      hint: 'Just the natal chart, with no time technique applied.',
    },
    modes: {
      transits: {
        label: 'Transits',
        desc: 'Where the planets are right now, over your natal chart.',
      },
      progressed: {
        label: 'Sec. Progressed',
        tipTitle: 'Secondary Progressions',
        desc: 'Secondary progressions: a symbolic day-for-a-year unfolding.',
      },
      'solar-arc': {
        label: 'Solar Arc',
        desc: 'Every point advanced by the Sun’s one-degree-per-year arc.',
      },
      'primary-directions': {
        label: 'Primary Directions',
        desc: 'An ancient timing method driven by the sky’s rotation.',
      },
      synastry: {
        label: 'Synastry',
        desc: 'Another person’s chart laid over yours, for relationships.',
      },
      eclipses: {
        label: 'Eclipses',
        desc: 'Solar-eclipse paths and shadow contours across the map.',
      },
    },
  },

  status: {
    natal: 'NATAL',
    hover: 'HOVER',
    pinned: 'PINNED',
    'natal-pinned': 'NATAL PIN',
  },

  sidebarToggle: {
    showAria: 'Show chart sidebar',
    hideAria: 'Hide chart sidebar',
    showTip: 'Show sidebar chart',
    hideTip: 'Hide sidebar',
  },

  pin: {
    centerTip: 'Center map on pin',
    pinNatalTip: 'Pin the natal location',
    controlsTip: 'Map pin controls',
  },

  tools: {
    measure: 'Measure distance',
    toolbarHint: 'Click and drag on the map to measure · snaps to nearby lines',
  },

  view: {
    menuLabel: 'View',
    coordinates: 'Coordinates',
    minimap: 'Minimap',
    settings: 'Settings',
    teleport: 'Teleport',
    info: 'Info',
    // Opens the guides as a reference — a glossary of the map controls you can revisit.
    guides: 'Guides',
  },
} as const;
