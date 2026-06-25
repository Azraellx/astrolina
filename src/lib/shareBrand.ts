// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The Share/Export watermark seam. The open core stamps a neutral text credit
// ("astrolina.org", in the app's system font) on every exported image — this doubles
// as the AGPL 7(b) attribution. A downstream build (e.g. the Pro edition) can replace
// it with its own wordmark + display font by calling setShareBrand() at startup, the
// same way it installs the entitlement / plan resolvers — touching no core file.
import type { ReactNode } from 'react';

export interface ShareBrand {
  /** The watermark content rendered into the Share/Export footer (.share-watermark). */
  render: () => ReactNode;
  /** Optional font to ensure-loaded before a capture (a bundled display face), as a
   *  CSS font shorthand for document.fonts.load — e.g. "700 1em 'Some Display'". Omit
   *  for the core default (its watermark uses the already-loaded system font). */
  fontSpec?: string;
}

// Open-core default: a plain text link back to the project, in the inherited system font.
let brand: ShareBrand = { render: () => 'astrolina.org' };

/** Replace the export watermark (downstream builds only). Call once at startup. */
export function setShareBrand(b: ShareBrand): void {
  brand = b;
}

/** The active watermark brand (the core default unless a downstream replaced it). */
export function getShareBrand(): ShareBrand {
  return brand;
}
