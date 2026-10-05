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
    // Why a technique is unavailable ON THIS CHART. Shown in place of the row's own
    // description while it's greyed — it names what about the chart bars it, so the
    // answer is "switch to a chart that has one", not a shrug. Nothing is lost by
    // reading it: the technique is only held, and returns with the next chart.
    blocked: {
      composite:
        'A composite is a midpoint chart, not a moment — there is no birth instant for this technique to advance. Switch to a single-person chart to use it.',
      'no-time':
        'This chart’s birth time is unknown, so there is no exact natal moment to advance — a technique built on one would be quietly inventing it. Add a birth time to use this.',
      davison:
        'This chart is already a two-person chart, so there is no one left to add. Switch to a single-person chart to build a synastry.',
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
      'tertiary-progressed': {
        label: 'Tert. Progressed',
        tipTitle: 'Tertiary Progressions',
        desc: 'Tertiary progressions: a day for a tropical month (27.32 days), a finer hand for timing.',
      },
      'solar-arc': {
        label: 'Solar Arc',
        desc: 'Every point advanced by the Sun’s one-degree-per-year arc.',
      },
      'primary-directions': {
        label: 'Primary Directions',
        desc: 'An ancient timing method driven by the sky’s rotation.',
      },
      cyclo: {
        label: 'Cyclocartography',
        tipTitle: 'Cyclocartography (CCG)',
        desc: 'Jim Lewis’s hybrid: secondary-progressed personal planets with transiting Jupiter and beyond, on one map.',
      },
      synastry: {
        label: 'Synastry',
        desc: 'Another person’s chart laid over yours, for relationships.',
      },
      eclipses: {
        label: 'Eclipses',
        desc: 'Solar-eclipse paths and magnitude contours, plus where a lunar eclipse is visible, across the map.',
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
    menuLabel: 'Tools',
    measure: 'Measure distance',
    measureItem: 'Measure',
    measureHint: 'Click and drag on the map to measure great-circle distance',
    // Tool-readout hints (secondary bar). {click}/{doubleClick}/{drag}/{pan}/{zoom} render as yellow
    // gesture pills — DEVICE-AWARE (click↔tap, zoom magnifying-glass↔pinch) via TopNav's ToolHintText;
    // the "·" is a plain separator. {escExit}/{rightExit} append a "· … to exit" tail shown only where
    // there's a keyboard/mouse (hidden on a bare touch device — no Esc / right button).
    toolbarHint: '{click} and {drag} on the map to measure{rightExit}',
    slideItem: 'Slide',
    slideHint:
      'Slide the world under the fixed natal lines — advances time to show how parans build through the day. Works in flat or globe view.',
    // Three ways the cage can be off the map. The tip names the one the reader can act on
    // FIRST — a dead control that doesn't say what to do about it is just a dead control
    // (the settings.inert.* rule, applied to a tool). The image of the world turning under
    // the lines belongs to slideHint above and is not repeated here.
    slideUnavailable:
      'Slide needs the natal lines drawn. Unavailable while Natal Lines is off (Advanced ▸ Lines, Shift+N), Other Lines has cleared them, or an overlay stands in for the chart.',
    slideToolbarHint: '{pan} to slide the world under the fixed lines',
    // The slide control cluster (secondary bar): nudges, event steps, reset, and
    // the readout chips' hover tips.
    slideNudgeBack1h: 'Back one hour',
    slideNudgeBack4m: 'Back four minutes (≈ 1° of turn)',
    slideNudgeFwd4m: 'Forward four minutes (≈ 1° of turn)',
    slideNudgeFwd1h: 'Forward one hour',
    slideReset: 'Return to the natal sky',
    slidePrevEvent: 'Jump to the previous rise, culmination or set at the active point',
    slideNextEvent: 'Jump to the next rise, culmination or set at the active point',
    slideElapsedTip: 'Time slid from the chart moment',
    slideClockTip: 'Wall clock and date at the birthplace, in the chart’s zone',
    slideAngleTip: 'Rotation about the pole',
    captureItem: 'Capture',
    captureHint:
      'Frame the map and export it as a PNG — pick an aspect ratio, choose what to include, then download or copy.',
    captureToolbarHint: '{pan} and {zoom} to compose inside the frame{escExit}',
    // Words inside the readout gesture pills (the device-appropriate icon is added by the renderer).
    // esc/right/toExit build the desktop-only "· Esc / Right-click to exit" tail.
    hintKey: {
      click: 'Click',
      tap: 'Tap',
      double: 'Double',
      drag: 'Drag',
      pan: 'Pan',
      zoom: 'Zoom',
      esc: 'Esc',
      right: 'Right',
      toExit: 'to exit',
    },
  },

  view: {
    menuLabel: 'View',
    // Each row carries a one-line hover description (the .ui-tip shown on hover/focus, matching
    // the Tools + Overlay menus) as its <id>Hint sibling.
    coordinates: 'Coordinates',
    coordinatesHint: 'A live readout of the active point’s place, coordinates, and relocated chart angles.',
    minimap: 'Minimap',
    minimapHint: 'The natal chart wheel, kept small in the corner as you explore the map.',
    settings: 'Settings',
    settingsHint: 'Themes, house systems, zodiac, and how the chart and map are drawn.',
    teleport: 'Teleport',
    teleportHint: 'Search for any place and fly the map straight to it.',
    // The daily rise/culminate/set clock at the active point (the bottom sky band).
    skyTimes: 'Sky Times',
    skyTimesHint: 'The daily rise, culmination, and set times at the active point, along the bottom band.',
    localSpace: 'Local Space',
    localSpaceHint: 'Direction lines from the chart’s origin out to each planet — your local-space compass.',
    info: 'Info',
    infoHint: 'A corner chip summarising the chart’s active systems — line frame, houses, and zodiac.',
    // Opens the guides as a reference — a glossary of the map controls you can revisit.
    guides: 'Guides',
    guidesHint: 'Revisit the onboarding guides as a glossary of the map’s controls.',
  },
} as const;
