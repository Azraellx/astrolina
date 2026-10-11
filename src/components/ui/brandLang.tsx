// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { ReactNode } from 'react';

// The brand inside a translated string, declared English so a CSS uppercase casts it with
// English rules. `text-transform: uppercase` follows the element's language, and under
// lang="tr" it maps i → İ, so the Credits dialog's "AstroLina" group heading would read
// "ASTROLİNA". The name is never translated or re-cased (scripts/i18n/dnt.json), so — like the
// loading screen's title and the capture watermark, which carry lang="en" for the same reason —
// it is marked English whatever language the sentence around it is in. Everything else in the
// string keeps the page's language, so any Turkish words around it still take their own capitals.
// A string without the name comes back unchanged.
const BRAND = /(AstroLina)/;

export function brandLang(text: string): ReactNode {
  const parts = text.split(BRAND);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} lang="en">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
