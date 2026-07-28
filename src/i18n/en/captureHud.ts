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
  // What the frame is a picture OF. The ratio, caption and export actions serve both.
  subject: {
    label: 'Capture',
    map: 'Map',
    mapHint:
      'Export the framed map — your lines over the world, with the chart as an optional panel beside them.',
    chart: 'Chart',
    chartHint:
      'Export the chart on its own: the wheel (or the positions) fills the frame at full size, drawn the way the sidebar draws it — aspects, overlay ring and all. No map, same caption.',
  },
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
    // to fit either BESIDE A MAP (the info “i” beside the Details heading reveals it). A chart
    // capture has the whole frame to itself, so it stays available — and is what this points to.
    phoneTitle: 'Not available on phones',
    phoneHint:
      'A phone-sized frame is too small to show the wheel or list beside the map clearly, so details stay off here. To export the chart itself, switch Capture to Chart — the wheel then fills the frame and reads properly at this size.',
    // Shown as the Wheel segment’s tip while this frame has no room for a legible wheel, and
    // as the notice below the picker when that was the view the user had chosen.
    tooSmallHint:
      'This frame is too small to show the wheel beside the map — it would be drawn with its edge cut off. Choose a wider frame (16:9 has the most room), make the window bigger, turn Balance off to give the wheel its room back, or switch Capture to Chart to export the wheel on its own.',
    tooSmallBody:
      'This frame can’t fit a readable wheel beside the map, so details are off. A chart capture gives the wheel the whole frame.',
    switchToChart: 'Capture the chart on its own',
    // The same refusal on a chart card, where there is no other subject to offer — the
    // frame itself is the wrong shape or size, so the way out is a different ratio, a
    // bigger window, or the list. A card is held to a higher bar than the panel beside a
    // map: it draws the full chart — the aspect web, and the second ring of a running
    // overlay — and those stop fitting well before the wheel merely gets small.
    tooSmallCardHint:
      'This frame can’t give the wheel the room a full chart needs — the aspects and the overlay ring want more width than there is here, and a wide, shallow frame leaves a wheel almost no height at all. Choose 1:1 or 4:5, make the window bigger, turn Balance off to give the wheel its room back, or capture the positions as a List instead.',
    tooSmallCardBody:
      'This frame is too small to draw the full chart, so the positions are shown instead. A taller window — or a 1:1 or 4:5 frame — gives the wheel the room it needs.',
    // The panel measured itself cutting content off — rarer than the case above, and the fix
    // is the same family of moves, so it stays a plain note rather than another button.
    clippedBody:
      'Some details don’t fit this frame and would be cut off in the export. Try a wider frame, a bigger window, or fewer groups.',
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
    // First-use privacy heads-up, shown before the first copy (and until
    // "don't remind me again" is checked through a confirm).
    warnAria: 'Share-link privacy notice',
    warnBody:
      'NOTE: This link carries the chart’s full birth details (date, time and place).',
    warnSuppress: 'Don’t remind me again',
    warnConfirm: 'Copy link',
    warnCancel: 'Cancel',
  },
  busy: 'Rendering…',
  failed: 'Export failed — please try again.',
} as const;
