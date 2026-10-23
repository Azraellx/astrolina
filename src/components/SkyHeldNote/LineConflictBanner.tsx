// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The banner over a map that draws nothing because the reader's line system and zodiac
// contradict each other (2026-10-22, Lina's §4): Geodetic chosen, and a sidereal zodiac in
// force. "AL never draws a line system the reader didn't choose" — so the map draws no body
// lines, never Celestial ones by default, and this says why and offers BOTH fixes, each through
// its own control's setter. Neither control can create the conflict (each greys the other's
// conflicting half); it only ever arrives — a combination saved before that rule, or Advanced
// turned on over a stored sidereal zodiac. Nothing is written until the reader picks a fix.

import { useT } from '../../i18n';
import './SkyHeldNote.css';

export function LineConflictBanner({
  onTropical,
  onCelestial,
}: {
  /** Set the zodiac to Tropical: Geodetic then draws as chosen. */
  onTropical: () => void;
  /** Set the line system to Celestial: the sidereal zodiac then draws there. */
  onCelestial: () => void;
}) {
  const { t } = useT();
  return (
    <div className="line-conflict-banner" role="alert">
      <span className="line-conflict-text">{t('map.lineConflict.body')}</span>
      <span className="line-conflict-fixes">
        <button type="button" className="sky-held-fix" onClick={onTropical}>
          {t('map.lineConflict.toTropical')}
        </button>
        <button type="button" className="sky-held-fix" onClick={onCelestial}>
          {t('map.lineConflict.toCelestial')}
        </button>
      </span>
    </div>
  );
}
