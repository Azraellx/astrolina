// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

/* Why the last `captureFrame` handed back nothing.
 *
 * captureFrame's contract is `Promise<Blob | null>`, and three unrelated consumers hold it:
 * App, the Capture window, and any registered captureSink. Widening it to a result union
 * would touch all three for a string only one of them ever displays — so the reason is left
 * here instead, for that one to pick up beside the null it already handles.
 *
 * It lives in lib rather than in Map.tsx for the same reason captureGate and captureBrand do:
 * a component module that also exports functions loses fast refresh for the whole file.
 *
 * The point of it is that the banner can only ever say "try again". A blocked tile source, a
 * browser that refused a 2D context and an encoder rejecting an oversized bitmap were
 * indistinguishable to the user AND to whoever read their support mail — and "try again" is
 * the wrong advice for all three.
 */

export type CaptureFailure =
  /** The map or its capture frame wasn't mounted when the export ran. */
  | 'no-frame'
  /** getContext('2d') came back null — no surface to composite onto. */
  | 'no-canvas'
  /** The basemap canvas is tainted, so nothing drawn from it can be read back. */
  | 'taint-basemap'
  /** The DOM pass (caption, badge labels, panel) came back dead twice — tainted, empty or
   *  blank. Refused rather than exported without them, which is what it used to do. */
  | 'overlay'
  /** toBlob refused the bitmap; in practice, its size. */
  | 'encode';

let last: CaptureFailure | null = null;

/** Record why this attempt produced nothing. Called with null at the top of every attempt,
 *  so a stale reason can never be read back as a fresh one. */
export function setCaptureFailure(reason: CaptureFailure | null): void {
  last = reason;
}

/** The reason the most recent attempt failed, or null if it didn't (or hasn't run). Only
 *  meaningful once captureFrame has actually resolved to null. */
export function lastCaptureFailure(): CaptureFailure | null {
  return last;
}
