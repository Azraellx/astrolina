// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The Capture watermark seam. The open core stamps a neutral text credit
// ("astrolina.org", in the app's system font) on every exported image — this doubles
// as the AGPL 7(b) attribution. A downstream build (e.g. the Pro edition) can replace
// it with its own wordmark + display font by calling setCaptureBrand() at startup, the
// same way it installs the entitlement / plan resolvers — touching no core file.
import type { ReactNode } from 'react';

export interface CaptureBrand {
  /** The watermark content rendered into the Capture footer (.capture-watermark). */
  render: () => ReactNode;
  /** Optional display faces to ensure-loaded before a capture — e.g. a downstream's
   *  watermark wordmark and its caption face. Each is a CSS font shorthand for
   *  document.fonts.load (e.g. "700 1em 'Some Display'"). The font FILES themselves live
   *  in the downstream build, never in core; this is only the list of faces to await so
   *  html2canvas rasterises them instead of a fallback. Omit for the core default (its
   *  watermark + caption use the already-loaded system font). */
  fontSpecs?: string[];
}

// Open-core default: a plain text link back to the project, in the inherited system font.
let brand: CaptureBrand = { render: () => 'astrolina.org' };

/** Replace the export watermark (downstream builds only). Call once at startup. */
export function setCaptureBrand(b: CaptureBrand): void {
  brand = b;
}

/** The active watermark brand (the core default unless a downstream replaced it). */
export function getCaptureBrand(): CaptureBrand {
  return brand;
}
