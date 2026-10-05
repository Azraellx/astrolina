// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The sky hold's reason, said in place of what a held surface would have shown
// (lib/skyHold, 2026-10-02). One component for every held surface — the core's own
// views and any listing a downstream build adds — so a reader meets one sentence, one
// fix and one look wherever the map being geodetic stops something. It replaces the
// surface's content (or its empty state); it is never a banner on top of it, because
// a listing that prints "nothing found" over a held family is saying something false.
//
// It carries no typography for the sentence: the host passes its own note class, so
// the reason reads as one of that panel's notes. Only the fix is styled here. Neutral,
// not warning-toned — nothing is wrong, the map is simply one that doesn't turn.
import { useId } from 'react';
import { en, type MsgKey } from '../../i18n';
import { useOptionalT } from '../../i18n/I18nProvider';
import { resolvePath } from '../../i18n/t';
import { TipSpan } from '../ui/HoverTip';
import './SkyHeldNote.css';

/** Which sentence a held surface says. 'sky' is the standard reason
 *  (settings.inert.skyHeld) and the default. 'parans' is a paran listing's own
 *  ("Parans are not shown on geodetic maps."). 'forNow' is for a surface held only
 *  because nothing projects it onto a geodetic map yet — where "which don't turn
 *  with the sky" would be untrue — and adds the same fix. */
export type SkyHeldKind = 'sky' | 'parans' | 'forNow';

// The full form's sentence, and the compact form's short text. The fix half rides in
// the compact form's tip (and its accessible description) instead of on the row. Each
// full form is ONE catalog key, joined in the catalog from its halves, so a host that
// needs the same words on a tip (Discovery's frame menu) reads the same key rather than
// joining them again.
const FULL: Record<SkyHeldKind, MsgKey> = {
  sky: 'settings.inert.skyHeld',
  parans: 'settings.inert.paransHeld',
  forNow: 'settings.inert.skyHeldForNowFull',
};
const SHORT: Record<SkyHeldKind, MsgKey> = {
  sky: 'settings.inert.skyHeldWhy',
  parans: 'settings.inert.paransHeld',
  forNow: 'settings.inert.skyHeldForNow',
};

// useT() throws outside <I18nProvider>, and a plugin can mount this in a React root
// of its own — so outside the provider the strings come from the English base
// catalog, as HoverTip's locked switch does.
function useHeldT(): (key: MsgKey) => string {
  const ctx = useOptionalT();
  return ctx ? (key) => ctx.t(key) : (key) => resolvePath(en, key) ?? key;
}

export function SkyHeldNote({
  onFix,
  className,
  compact,
  kind = 'sky',
}: {
  /** Opens Settings ▸ Calculation, where the line system is (a host passes its own
   *  opener — `openSettings('calc')` on the extension context). The full form shows
   *  an "Open Calculation" button for it; without one the sentence stands alone,
   *  still naming the setting. Unused by the compact form. */
  onFix?: () => void;
  /** The host panel's own note class. */
  className?: string;
  /** The one-line form for a cramped row: the short text, with the whole sentence as
   *  its tip (tap on touch, focus from the keyboard) and no button. */
  compact?: boolean;
  /** Which sentence to say — see {@link SkyHeldKind}. Default 'sky'. */
  kind?: SkyHeldKind;
}) {
  const t = useHeldT();
  const fixId = useId();
  const cls = className ? ` ${className}` : '';

  if (compact) {
    const short = t(SHORT[kind]);
    const fix = t('settings.inert.skyHeldFix');
    // A span, not a div: the compact form stands in for a row's inline empty text.
    // The tip card is aria-hidden, so the fix half also reaches assistive tech as the
    // text's description.
    return (
      <span className={`sky-held sky-held-compact${cls}`} role="note">
        <TipSpan
          className="sky-held-text"
          placement="top"
          tabIndex={0}
          tapReveal
          aria-describedby={fixId}
          tip={short}
          hint={fix}
        >
          {short}
        </TipSpan>
        <span id={fixId} hidden>
          {fix}
        </span>
      </span>
    );
  }

  // A div rather than a <p>: hosts style their notes by class, and a paragraph's
  // user-agent margins would leak into a host whose note class never reset them.
  return (
    <div className={`sky-held${cls}`} role="note">
      <span className="sky-held-text">{t(FULL[kind])}</span>
      {onFix && (
        <>
          {' '}
          <button type="button" className="sky-held-fix" onClick={onFix}>
            {t('settings.inert.skyHeldAction')}
          </button>
        </>
      )}
    </div>
  );
}
