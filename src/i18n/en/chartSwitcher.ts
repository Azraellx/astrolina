// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// ChartSwitcher: the top-bar / sidebar quick-switch dropdown for saved charts.
export const chartSwitcher = {
  noChart: 'No chart selected',
  tip: 'Switch, edit, or add a chart',
  // {key} renders as the yellow Tab key pill in the trigger's hover tip.
  tabHint: '{key} swaps to your previous chart — keep tapping to cycle the recent five.',
  empty: 'No saved charts yet.',
  searchAdd: 'Search + Add Name',
} as const;
