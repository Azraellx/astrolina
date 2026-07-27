// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

/** Save a blob to the user's downloads under `name`.
 *
 *  A generated file (an image, a document) has no URL of its own, so the only
 *  way to hand it to the browser's own download machinery is a temporary object
 *  URL behind a synthetic anchor click. The click must happen while the user's
 *  activation is still live, which is why this is deliberately synchronous —
 *  awaiting anything before calling it can cost the gesture on mobile.
 *
 *  The URL is revoked a second later rather than immediately: some browsers
 *  have not finished reading the blob when click() returns, and revoking too
 *  early truncates the file.
 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
