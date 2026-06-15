// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Bottom-center synastry overlay bar: shows the comparison partner and is the
// trigger for choosing one. Drag/dock hints reuse common.hud.*; partner date/meta
// is assembled in the component from fmt.monthName.
export const synastryHud = {
  // Nub label (the move handle).
  title: 'Synastry',
  // Empty-state prompt (no other charts) — opens the add-chart flow directly.
  addPerson: 'Add person',
  // Hover tip + aria-label on the empty-state add-person trigger.
  addPersonTip: 'Add a person to compare',
  // Hover-tip title + aria-label on the picker trigger.
  chooseComparison: 'Choose comparison chart',
  // Prompt shown in the trigger when no partner is selected yet.
  choosePrompt: 'Choose a chart to compare',
  // Bottom-of-dropdown action that opens the full chart browser to find/pick a partner.
  search: 'Search',
  // The eye on the nub collapses/expands the body (partner picker + relationship
  // controls), leaving just the nub — to focus on the map.
  barToggle: {
    show: 'Show synastry options',
    hide: 'Hide synastry options',
  },
  // Relationship-chart builder, moved here from Settings ▸ Overlay: pick a type and
  // Generate it as a new saved chart from the active chart + the chosen partner.
  method: {
    label: 'Type',
    davison: {
      label: 'Davison',
      hint: 'Midpoint in time and place of the two charts, cast as a real chart.',
    },
    composite: {
      label: 'Comp. Midpoints',
      hint: 'Every planet at the midpoint of the two charts, on the ecliptic; the map frame is the midpoint of their sidereal times.',
    },
  },
  generate: {
    label: 'Generate',
    hint: 'Build the chart, make it active, and clear the synastry partner.',
    needPartner: 'Choose a partner above first.',
    compositeParent: 'A composite chart can’t be combined again; pick two regular charts.',
  },
} as const;
