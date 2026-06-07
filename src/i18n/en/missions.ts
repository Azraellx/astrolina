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

  // Words shown in the hotkey pill around the cursor icon (see GESTURES in
  // MissionGuide). e.g. "Double 🖱", "Shift 🖱 Drag", "Ctrl/⌘ 🖱 Drag".
  gesture: {
    double: 'Double',
    right: 'Right',
    hold: 'Hold',
    shift: 'Shift',
    ctrl: 'Ctrl/⌘',
    drag: 'Drag',
    click: 'Click',
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
    holdPoint: 'to create a point',
    shiftSnap: 'over a line to snap to it',
    rightCancel: 'to cancel the tool',
  },

  zoomBasics: {
    // "{zoom}" is rendered as a magnifying-glass icon.
    subtitle: 'How to quickly {zoom} zoom',
    zoomOut: 'the ‘Zoom Out’ button',
    quickZoom: 'to create a zoom window',
    perspective: 'to change perspective (in 3D)',
  },
} as const;
