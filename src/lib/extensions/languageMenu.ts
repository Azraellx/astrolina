// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Language-menu seam (2026-10-13) — lets a downstream build add a line under Settings ▸
// Appearance ▸ Language WITHOUT editing the menu: something that acts on the language the app is
// shown in (a way to report a wrong translation, say). A single slot, like the credits footer:
// last registration wins. The open core registers nothing, so the menu is as it was.
//
// The render is called inside the i18n provider, under the menu's own lines, on every render of
// the menu; it decides for itself whether to show anything (return null for nothing) and reads
// what it needs — the language shown, an account — through its own hooks.

import type { ReactNode } from 'react';

let footer: (() => ReactNode) | null = null;

/** Install the Language menu's footer (downstream builds only). Last call wins; null removes it. */
export function registerLanguageMenuFooter(render: (() => ReactNode) | null): void {
  footer = render;
}

/** The installed footer, or null in the open core. */
export function getLanguageMenuFooter(): (() => ReactNode) | null {
  return footer;
}
