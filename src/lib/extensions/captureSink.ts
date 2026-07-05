// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The capture tool's DESTINATION slot — a single-slot seam (like skyBandTrack)
// letting a downstream build register a receiver for the rendered capture frame:
// a fourth action beside Download / Copy / Share that hands the PNG blob to
// whatever surface registered it (e.g. a window collecting images). The open
// core ships no sink; the Capture window's destination button exists only while
// a sink is registered AND reports itself active.

/** A destination for captured frames. All strings arrive already localized by
 *  the registrant, so the core stays vocabulary-free about what the sink is. */
export interface CaptureSink {
  /** Stable id, for the registrant's own bookkeeping. */
  id?: string;
  /** The destination button's text. */
  label: string;
  /** Its hover-tip body. */
  hint: string;
  /** Transient success text (the Copy-button "done" pattern). */
  doneLabel: string;
  /** Cheap render-path check: should the button show right now? This is the
   *  registrant's own surface/entitlement state — the core never asks why, and
   *  deliberately does NOT route the sink through the capture export gate: a
   *  sink only offers itself while its own (already gated) surface is active,
   *  whereas the gate covers the generic export actions, which are otherwise
   *  universally available. */
  isActive: () => boolean;
  /** Receive the captured frame. Rejections surface as the Capture window's
   *  generic failure state. */
  onCapture: (blob: Blob) => Promise<void>;
}

let sink: CaptureSink | null = null;

/** Register the capture destination (downstream builds only; null to remove). */
export function setCaptureSink(s: CaptureSink | null): void {
  sink = s;
}

/** The registered destination, or null (the open core's three-action row). */
export function getCaptureSink(): CaptureSink | null {
  return sink;
}
