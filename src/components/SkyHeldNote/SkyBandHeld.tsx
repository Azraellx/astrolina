// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useT } from '../../i18n';
import { usePhone } from '../../lib/touch';
import { SkyHeldNote } from './SkyHeldNote';
// The band's own shell (.sky-band, its empty state, its ✕), so the held band sits in
// exactly the strip the live one does, in every theme and on phones.
import '../SkyBand/SkyBand.css';
import './SkyHeldNote.css';

// The Sky Times band on a geodetic map (lib/skyHold, 2026-10-02). Every time the band
// lists is the sky turning over a place, so on a map that doesn't turn there is nothing
// for it to show — and the host draws this IN PLACE OF the band rather than inside it,
// so the band itself (and any track a build registers in it) is never mounted while
// held. It keeps the band's region, its strip and its ✕: the reader sees where the
// band is, why it is empty, and the setting that brings it back. Nothing is written;
// the band's open flag stays as the reader left it.
export function SkyBandHeld({
  onClose,
  onFix,
}: {
  /** Close the band — the same action as its View-menu row. Closing is never held. */
  onClose: () => void;
  /** Open Settings ▸ Calculation, where the line system is. */
  onFix: () => void;
}) {
  const { t } = useT();
  const phone = usePhone();
  return (
    <div
      className={`sky-band is-compact sky-band-held${phone ? ' is-phone' : ''}`}
      role="region"
      aria-label={t('skyTimes.title')}
    >
      <div className="sky-band-empty">
        <SkyHeldNote onFix={onFix} />
      </div>
      <button
        type="button"
        className="sky-band-close"
        aria-label={t('skyTimes.closeAria')}
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}
