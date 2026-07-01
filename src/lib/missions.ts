// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// "Missions" — gamified onboarding. A mission is one task the user clears by actually
// performing an action in the app; a mission set is a checklist of them, surfaced by a
// trigger (e.g. clicking the map) and shown in the MissionGuide. Everything is data
// here: to add/remove missions or whole sets, edit MISSION_SETS (and the matching
// strings in i18n/en/missions.ts) — no UI or wiring changes needed. The only coupling
// to the rest of the app is the MissionEvent union (which actions can complete a
// mission) and the MissionTrigger union (what can surface a set); add a case to either
// and emit/fire it where that action happens.
import type { MsgKey } from '../i18n/types';

// The user actions a mission can be completed by. App emits these (see useMissions'
// recordEvent) from the corresponding handlers.
export type MissionEvent =
  | 'create-pin'
  | 'remove-pin'
  | 'place-natal'
  | 'measure-point'
  | 'measure-snap'
  | 'measure-cancel'
  | 'zoom-out-click'
  | 'box-zoom'
  | 'pitch-rotate'
  | 'pinch-zoom';

// What can bring a set's guide up. App fires these (see useMissions' trigger).
export type MissionTrigger = 'map-click' | 'measure-tool' | 'zoom-threshold';

// The gesture shown as a hotkey pill at the start of a mission. Its pill content (a
// leading word, a cursor icon, a trailing word) is defined by the GESTURES table in
// MissionGuide. Decorative — completion is keyed off `event`.
export type MissionGesture =
  | 'double'
  | 'right'
  | 'hold'
  | 'shift'
  | 'click'
  | 'shift-drag'
  | 'right-drag'
  // Touch variants (rendered with the finger TapIcon instead of the cursor ClickIcon):
  | 'double-tap'
  | 'long-press'
  | 'touch-drag'
  | 'two-finger'
  | 'tap'
  | 'pinch'
  | 'snap-toggle';

export interface Mission {
  /** Stable id, unique within its set (used for progress + React keys). */
  id: string;
  /** Gesture pill shown before the label. */
  gesture: MissionGesture;
  /** i18n key for the instruction text (the part after the gesture pill). */
  labelKey: MsgKey;
  /** The action that completes this mission. */
  event: MissionEvent;
  /** Only meaningful in the 3D globe projection. In 2D the guide shows it as already
   *  satisfied (a neutral, non-coloured completed state) so the set can still finish. */
  only3d?: boolean;
  /** Touch gesture pill (the finger-friendly variant). Falls back to `gesture` if unset. */
  touchGesture?: MissionGesture;
  /** Touch instruction text. Falls back to `labelKey` if unset. */
  touchLabelKey?: MsgKey;
  /** The action that completes this mission ON TOUCH, when it differs from `event`
   *  (e.g. a pinch instead of Shift+box-zoom). Falls back to `event`. */
  touchEvent?: MissionEvent;
}

export interface MissionSet {
  /** Stable id, unique across all sets (the localStorage completion key). */
  id: string;
  /** What surfaces this set's guide. */
  trigger: MissionTrigger;
  /** i18n keys for the guide's heading and subtitle. The subtitle may contain a
   *  "{pin}" token, which the guide renders as the map-pin icon. */
  titleKey: MsgKey;
  subtitleKey: MsgKey;
  missions: readonly Mission[];
}

// The registry. Order is display order. Add or remove freely.
export const MISSION_SETS: readonly MissionSet[] = [
  {
    id: 'map-basics',
    trigger: 'map-click',
    titleKey: 'missions.title',
    subtitleKey: 'missions.mapBasics.subtitle',
    missions: [
      {
        id: 'create-pin',
        gesture: 'double',
        touchGesture: 'double-tap',
        labelKey: 'missions.mapBasics.createPin',
        event: 'create-pin',
      },
      {
        id: 'remove-pin',
        gesture: 'right',
        touchGesture: 'long-press',
        labelKey: 'missions.mapBasics.removePin',
        event: 'remove-pin',
      },
      {
        id: 'place-natal',
        gesture: 'right',
        touchGesture: 'long-press',
        labelKey: 'missions.mapBasics.placeNatal',
        event: 'place-natal',
      },
    ],
  },
  {
    id: 'measure-basics',
    trigger: 'measure-tool',
    titleKey: 'missions.title',
    subtitleKey: 'missions.measureBasics.subtitle',
    missions: [
      {
        id: 'measure-point',
        gesture: 'click',
        touchGesture: 'touch-drag',
        // The "{drag}" token in this label renders as a second (Drag) gesture pill — see
        // MissionGuide's renderLabel — so it reads "Click and ✥ Drag to draw a line". Touch keeps its
        // single "Touch & drag" pill, so it uses a plain (token-free) instruction instead.
        labelKey: 'missions.measureBasics.drawLine',
        touchLabelKey: 'missions.measureBasics.touchDrawLine',
        event: 'measure-point',
      },
      {
        id: 'measure-snap',
        gesture: 'shift',
        touchGesture: 'snap-toggle',
        labelKey: 'missions.measureBasics.shiftSnap',
        touchLabelKey: 'missions.measureBasics.touchSnap',
        event: 'measure-snap',
      },
      {
        id: 'measure-cancel',
        gesture: 'right',
        touchGesture: 'tap',
        labelKey: 'missions.measureBasics.rightCancel',
        touchLabelKey: 'missions.measureBasics.touchCancel',
        event: 'measure-cancel',
      },
    ],
  },
  {
    id: 'zoom-basics',
    trigger: 'zoom-threshold',
    titleKey: 'missions.title',
    subtitleKey: 'missions.zoomBasics.subtitle',
    missions: [
      {
        id: 'zoom-out',
        gesture: 'click',
        touchGesture: 'tap',
        labelKey: 'missions.zoomBasics.zoomOut',
        event: 'zoom-out-click',
      },
      {
        id: 'quick-zoom',
        gesture: 'shift-drag',
        touchGesture: 'pinch',
        labelKey: 'missions.zoomBasics.quickZoom',
        touchLabelKey: 'missions.zoomBasics.touchQuickZoom',
        event: 'box-zoom',
        touchEvent: 'pinch-zoom',
      },
      {
        id: 'perspective',
        gesture: 'right-drag',
        touchGesture: 'two-finger',
        labelKey: 'missions.zoomBasics.perspective',
        event: 'pitch-rotate',
        only3d: true,
      },
    ],
  },
];

// Completion is tracked per SET (not per mission): once every mission in a set is done
// the set is recorded here and its guide never surfaces again. Shape is { [setId]: true }
// so unknown/removed ids are simply ignored, and adding a set starts it incomplete.
const STORAGE_KEY = 'astro:missions:v1';

export function loadCompletedSets(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

export function saveCompletedSets(completed: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
  } catch {
    // Ignore persistence failures (private mode, quota, etc.).
  }
}

// "Seen" sets: which sets have actually surfaced at least once, regardless of whether the
// user finished them. This drives the View ▸ Guides reference, where someone can flip back
// through the guides they have met (a completed set counts as seen too). Persisted so the
// reference still lists them in a later session — even though per-mission progress, which
// is session-only, has reset by then. Same { [setId]: true } shape as completed sets.
const STORAGE_KEY_SEEN = 'astro:missions:seen:v1';

export function loadSeenSets(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SEEN);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

export function saveSeenSets(seen: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY_SEEN, JSON.stringify(seen));
  } catch {
    // Ignore persistence failures (private mode, quota, etc.).
  }
}
