// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { ReactNode } from 'react';

// A gesture pill whose name is more than one word — "Double [icon] Click", "Right [icon] Click" —
// laid out from ONE catalog phrase with {icon} where the picture sits, so a language puts the
// words in its own order. They used to be separate words glued round the icon in English order,
// which gave Spanish "Derecho [icon] Clic" for "Clic derecho" and "Doble [icon] Tocar" for
// "Doble toque" (2026-10-09). The words either side keep their
// <span>s, so English renders exactly as it did. A phrase whose translator dropped the token
// still shows, with the icon after it.
export function iconPhrase(phrase: string, icon: ReactNode): ReactNode {
  const at = phrase.indexOf('{icon}');
  const before = (at < 0 ? phrase : phrase.slice(0, at)).trim();
  const after = (at < 0 ? '' : phrase.slice(at + '{icon}'.length)).trim();
  return (
    <>
      {before && <span>{before}</span>}
      {icon}
      {after && <span>{after}</span>}
    </>
  );
}
