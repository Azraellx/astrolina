// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Bottom-center synastry overlay bar: shows the comparison partner and is the
// trigger for choosing one. Drag/dock hints reuse common.hud.*; partner date/meta
// is assembled in the component from fmt.monthName.
export const synastryHud = {
  // Move-handle tag label.
  title: 'Synastry',
  // Empty-state prompt (no other charts) — opens the add-chart flow directly.
  addPerson: 'Add person',
  // Hover tip + aria-label on the empty-state add-person trigger.
  addPersonTip: 'Add a person to compare',
  // Hover-tip title + aria-label on the picker trigger.
  chooseComparison: 'Choose comparison chart',
  // Prompt shown in the trigger when no partner is selected yet.
  choosePrompt: 'Choose a chart to compare',
} as const;
