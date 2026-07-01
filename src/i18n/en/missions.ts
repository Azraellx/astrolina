// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The gamified onboarding "missions" (MissionGuide.tsx + lib/missions.ts). Each set is
// a small checklist the user clears by actually using the tool; sets are listed by id
// under their own key here. To add a set: add a block below and a MissionSet entry in
// lib/missions.ts that points its titleKey/introKey/doneKey/labelKey at these keys.
export const missions = {
  guideTitle: 'Missions',
  // The visible heading — the same for every guide set.
  title: 'Guide',
  close: 'Dismiss',
  skipTip: 'Skip this guide',
  ok: 'OK, got it',
  okLocked: 'Finish every mission to continue',
  // The reference-mode guide pager (View ▸ Guides) — aria labels for the ‹ / › buttons,
  // and a spoken form of the "n/total" position for screen readers.
  prevGuide: 'Previous guide',
  nextGuide: 'Next guide',
  guidePosition: 'Guide {current} of {total}',

  // Words shown in the hotkey pill around the cursor icon (see GESTURES in
  // MissionGuide). e.g. "Double 🖱 Click", "Right 🖱 Click", "Hold Shift", "🖱 Click".
  gesture: {
    double: 'Double',
    right: 'Right',
    hold: 'Hold',
    shift: 'Shift',
    drag: 'Drag',
    click: 'Click',
    // Touch variants — shown with the finger TapIcon instead of the cursor.
    tap: 'Tap',
    doubleTap: 'Double-tap',
    longPress: 'Long-press',
    touchDrag: 'Touch & drag',
    twoFinger: 'Two-finger drag',
    pinch: 'Pinch',
    snap: 'Snap',
  },

  mapBasics: {
    // "{pin}" is rendered as the map-pin icon.
    subtitle: 'How to place a {pin} pin',
    // The text after each mission's gesture pill.
    createPin: 'to place a pin',
    removePin: 'to remove a pin',
    placeNatal: 'to drop the natal pin',
  },

  measureBasics: {
    // "{ruler}" is rendered as the measure-tool (ruler) icon.
    subtitle: 'How to use the {ruler} measure tool',
    // "{drag}" renders as an inline Drag gesture pill (see MissionGuide's renderLabel), so with the
    // leading Click pill this reads "Click and ✥ Drag to draw a line".
    drawLine: 'and {drag} to draw a line',
    touchDrawLine: 'to draw a line',
    shiftSnap: 'over a line while measuring to snap onto it — the exact distance to that line',
    rightCancel: 'to cancel the tool',
    // Touch instruction text (the gesture pill changes too — see lib/missions.ts).
    touchSnap: 'then drag over a line to snap',
    touchCancel: 'the Measure tool again to exit',
  },

  zoomBasics: {
    // "{zoom}" is rendered as a magnifying-glass icon.
    subtitle: 'How to quickly {zoom} zoom',
    zoomOut: 'the ‘Zoom Out’ button',
    quickZoom: 'to create a zoom window',
    perspective: 'to change perspective (in 3D globe projection view only)',
    touchQuickZoom: 'to zoom in or out',
  },
} as const;
