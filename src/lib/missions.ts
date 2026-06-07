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
  | 'pitch-rotate';

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
  | 'ctrl-drag';

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
        labelKey: 'missions.mapBasics.createPin',
        event: 'create-pin',
      },
      {
        id: 'remove-pin',
        gesture: 'right',
        labelKey: 'missions.mapBasics.removePin',
        event: 'remove-pin',
      },
      {
        id: 'place-natal',
        gesture: 'right',
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
        gesture: 'hold',
        labelKey: 'missions.measureBasics.holdPoint',
        event: 'measure-point',
      },
      {
        id: 'measure-snap',
        gesture: 'shift',
        labelKey: 'missions.measureBasics.shiftSnap',
        event: 'measure-snap',
      },
      {
        id: 'measure-cancel',
        gesture: 'right',
        labelKey: 'missions.measureBasics.rightCancel',
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
        labelKey: 'missions.zoomBasics.zoomOut',
        event: 'zoom-out-click',
      },
      {
        id: 'quick-zoom',
        gesture: 'shift-drag',
        labelKey: 'missions.zoomBasics.quickZoom',
        event: 'box-zoom',
      },
      {
        id: 'perspective',
        gesture: 'ctrl-drag',
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
