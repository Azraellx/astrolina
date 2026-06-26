// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// An optional gate on the Capture EXPORT actions (Download / Copy / Share). The open core
// ships none — export is always free — so the buttons behave exactly as before. A downstream
// build (e.g. the Pro edition) can install one to make export an account/paid feature, the
// same way it installs the brand + plan resolvers (no core file touched). Kept product-neutral:
// the core only asks "is export locked right now?" and, when a locked user taps an export,
// "do the locked thing" (e.g. open an upsell). The policy + any UI live downstream.
//
// `isLocked` runs in the render path AND on click, so keep it synchronous and cheap (read a
// value the downstream already holds — a plan flag — never a fetch). When it returns true the
// CaptureHud marks the three export buttons with the Advanced (ADV) tip tag and diverts their
// taps to onLocked instead of exporting.
export interface CaptureExportGate {
  /** True when the current user may NOT export (so: tag the buttons + divert their taps). */
  isLocked: () => boolean;
  /** Run when a locked user taps an export action — e.g. open the account/plan takeover. */
  onLocked: () => void;
}

// Open-core default: no gate (export is free).
let gate: CaptureExportGate | null = null;

/** Install the capture-export gate (downstream builds only). Call once at startup; pass null
 *  to remove it. */
export function setCaptureExportGate(g: CaptureExportGate | null): void {
  gate = g;
}

/** The active capture-export gate, or null when export is ungated (the core default). */
export function captureExportGate(): CaptureExportGate | null {
  return gate;
}
