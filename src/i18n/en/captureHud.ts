// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The movable "Capture" window (Tools ▸ Capture): pick a capture frame aspect
// ratio and which caption fields appear, then download the framed map as a PNG or copy
// it to the clipboard. The map, pin, edge labels and watermark are always included;
// everything is rendered client-side — no server round-trip.
export const captureHud = {
  title: 'Capture',
  closeAria: 'Close Capture',
  aspect: {
    label: 'Frame',
    square: '1:1',
    squareHint: 'Square frame (1:1) — best for posts and avatars.',
    portrait: '4:5',
    portraitHint: 'Portrait frame (4:5) — the tall format for phone feeds.',
    landscape: '16:9',
    landscapeHint: 'Landscape frame (16:9) — wide, for slides and headers.',
  },
  view: {
    none: 'None',
    noneHint: 'No chart details in the frame — just the map, pin, edge labels and caption.',
    wheel: 'Wheel',
    wheelHint:
      'Show the chart as a wheel inside the frame — the same wheel as the sidebar. The Planets / Angles toggles fill it in; Balance adds the element·modality grid below it.',
    list: 'List',
    listHint:
      'Show the chart as a list of planet / angle positions (and the element·modality tally), the same rows as the sidebar.',
  },
  extras: {
    label: 'Details',
    // Planets are the always-on baseline of any view (no toggle); angles/balance add on top.
    angles: 'Angles',
    anglesHint: 'Add the chart angles (Asc, MC, IC, Dsc…) to the panel, after the planets.',
    balance: 'Balance',
    balanceHint:
      'Add the element + modality balance — which planets fall in Fire/Earth/Air/Water and Cardinal/Fixed/Mutable.',
  },
  caption: {
    label: 'Caption',
    name: 'Name',
    nameHint: 'Show the chart name in the caption footer.',
    date: 'Date',
    dateHint: 'Show the birth date in the caption footer.',
    time: 'Time',
    timeHint: 'Show the birth time in the caption footer.',
    location: 'Location',
    locationHint: 'Show the birthplace in the caption footer.',
    calculations: 'Calculations',
    calculationsHint:
      'Show the active calculation systems (the same line as the Info view) in the caption footer.',
  },
  share: {
    title: 'Share',
    hint: 'Open your device’s share sheet to save or send the image (mobile & supported desktops).',
  },
  download: {
    title: 'Download',
    hint: 'Save the framed view as a PNG file.',
  },
  copy: {
    title: 'Copy',
    hint: 'Copy the framed view to the clipboard, ready to paste.',
    done: 'Copied',
  },
  busy: 'Rendering…',
  failed: 'Export failed — please try again.',
} as const;
