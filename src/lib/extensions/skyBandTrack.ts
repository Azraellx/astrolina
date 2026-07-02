// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The sky band's TRACK slot — a single-slot seam (like profileSection) letting a
// downstream build supply the band's expandable center section (a richer
// visualization of the day's events) without editing the band. The open core
// ships no track: its band is the compact legend + controls row. The slot's
// toggle renders in the band's control column only when a track is registered
// AND entitled (the shared entitlement resolver; NO teaser — un-entitled users
// simply don't see it), carrying the gated-tier tag in its hover tip.
import type { ReactNode } from 'react';
import type { BodyDayEvents } from '../astro/riseSet';
import { isEntitled as sharedIsEntitled } from './entitlement';

/** Everything the band computes that a track needs: the day's events at the
 *  active point, in that place's own clock. */
export interface SkyBandTrackContext {
  point: { lat: number; lng: number };
  /** IANA zone at the point — the whole band reads in ITS local time. */
  zone: string;
  /** UT epoch ms of the shown day's local midnight. */
  dayStart: number;
  /** Per-body rise/culminate/set/anticulminate for the shown day. */
  days: BodyDayEvents[];
  /** An instant's wall-clock fraction of the shown day (x-position, 0..1). */
  frac: (jd: number) => number;
  /** An instant as "HH:MM" in the point's zone. */
  clock: (jd: number) => string;
  /** The Slide tool's slid instant (epoch ms UT) while it spins the sky; null idle. */
  slideMs: number | null;
}

export interface SkyBandTrack {
  /** Stable id (also the entitlement subject). */
  id: string;
  /** 'gated' subjects the track (and its toggle) to the entitlement resolver. */
  tier?: 'core' | 'gated';
  /** Toggle label + its on/off hover hints, already localized by the registrant. */
  label: string;
  onHint: string;
  offHint: string;
  /** The band's FULL height (px) while the track shows (the compact row's
   *  height applies when it doesn't). */
  height: number;
  render: (ctx: SkyBandTrackContext) => ReactNode;
}

let track: SkyBandTrack | null = null;

/** Register the band's track (downstream builds only; call once at startup). */
export function setSkyBandTrack(t: SkyBandTrack): void {
  track = t;
}

/** The registered track, or null (the open core's compact-only band). */
export function getSkyBandTrack(): SkyBandTrack | null {
  return track;
}

/** Whether the registered track may show for the current user (no teaser). */
export function isSkyBandTrackEntitled(t: SkyBandTrack): boolean {
  return t.tier !== 'gated' || sharedIsEntitled({ id: t.id, tier: t.tier });
}
