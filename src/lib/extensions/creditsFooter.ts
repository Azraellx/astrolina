// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Credits-footer seam — lets a downstream build append content (e.g. Privacy / Terms links)
// to the credits dialog footer WITHOUT editing it. A sibling of the profile-section seam.
// The open core appends nothing (it has no accounts, so no policies to link).

import type { ReactNode } from 'react';

export interface CreditsFooter {
  /** Extra footer content (e.g. legal links). Absent in the open core. */
  render?: () => ReactNode;
}

let footer: CreditsFooter = {};

/** Install the credits-footer customization (downstream builds only). Last call wins. */
export function registerCreditsFooter(f: CreditsFooter): void {
  footer = f;
}

/** The installed customization, or an empty object in the open core. */
export function getCreditsFooter(): CreditsFooter {
  return footer;
}
