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
  closeHint: 'Close the Capture tool.',
  aspect: {
    label: 'Frame',
    square: '1:1',
    squareHint: 'Square frame (1:1) — best for posts and avatars.',
    portrait: '4:5',
    portraitHint: 'Portrait frame (4:5) — the tall format for phone feeds.',
    landscape: '16:9',
    landscapeHint: 'Landscape frame (16:9) — wide, for slides and headers.',
  },
  // The Local-Space export preset, shown in the Frame section only while Local Space is on.
  transparent: {
    title: 'Transparent (Local Space)',
    hint: 'One switch for a clean local-space export: hides the line arrows, labels the lines like the rest of the chart (badges hug the frame edges, no bearing degrees), and blanks the basemap so the export keeps a transparent background — ready to lay over a floor plan or your own backdrop. Everything returns when Capture or Local Space closes.',
    // Shown as the tip while the toggle is soft-disabled (Local Space is off).
    needLs: 'Turn on Local Space (View ▸ Local Space) first — this clean transparent export is built around the local-space compass and lines.',
  },
  // Transparent-mode badge labels — the Details section swaps the wheel/list picker for these two
  // toggles while Transparent is on. Each controls what a local-space badge prints beyond its glyph.
  lsLabels: {
    name: {
      title: 'Label Name',
      hint: 'Print each planet’s name after its glyph on the local-space badge (e.g. “♂ Mars”).',
    },
    degrees: {
      title: 'Degrees',
      hint: 'Print each local-space line’s bearing along the line, just inside its badge toward the compass centre.',
    },
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
    // Shown in place of the wheel/list control on phones, where a phone-sized frame is too small
    // to render either legibly (the info “i” beside the Details heading reveals it).
    phoneTitle: 'Not available on phones',
    phoneHint:
      'A phone-sized frame is too small to show the wheel or list clearly, so details stay off here. For the full chart, open the sidebar (its wheel and positions) and capture that separately if you’d like an accompanying image.',
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
    coordinates: 'Coordinates',
    coordinatesHint: 'Show the birthplace’s full latitude and longitude in the caption.',
    calculations: 'Calculations',
    calculationsHint:
      'Show the active calculation systems (the same line as the Info view) in the caption footer.',
  },
  share: {
    title: 'Share',
    hint: 'Open your device’s share sheet to save or send the image (mobile & supported desktops).',
    // Metadata that rides along with the shared image in the OS share sheet: a title + a line of
    // accompanying text. The app URL is appended separately, read live from the page's canonical link.
    sheetTitle: 'AstroLina Cartography',
    sheetText: 'AstroLina — web-based astrocartography for curious minds',
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
  // "Copy link" — a shareable URL that reopens this chart and view (no image).
  link: {
    title: 'Copy link',
    hint: 'Copy a link that opens this chart and view — the birth details travel in the link, so only share it with people who may see them.',
    done: 'Link copied',
  },
  busy: 'Rendering…',
  failed: 'Export failed — please try again.',
} as const;
