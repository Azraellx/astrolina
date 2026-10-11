// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Text a reader may want to check against its English original, shown in the reader's language
// with the English one press away (2026-10-10). In the open core that is the Credits dialog's
// licence and attribution statements; a build may wrap its own text the same way. The area shows
// the translation, a one-line notice in the reader's language (catalog key bindingLanguage.note),
// and a toggle that swaps in the English IN PLACE — the same text, the same layout, the same
// values — so a reader can check one against the other without leaving where they are.
//
// The notice line is outside the English it toggles: it always speaks the reader's language,
// even while the English is showing (it is the reader's way back). In English there is nothing
// to say, and under a device translation (mt:*) the text in question isn't translated at all —
// a build excludes it from the on-device tier — so in both the line's slot stays empty and the
// text carries no lang.
//
// ONE SHAPE IN EVERY LANGUAGE (2026-10-10). The area used to return its bare children in English
// and under a device translation, and wrap them everywhere else. React remounts a subtree whose
// position, or the element type above it, changes — so switching language with an area on
// screen rebuilt everything in it: a host's half-filled form lost its fields, and any embedded
// third-party widget was torn down and drawn again. Now the wrapper and the scope are rendered
// in every language and the notice keeps a slot of its own, empty when there is nothing to say,
// so a language change only ever updates what is there. English output is no longer
// byte-identical with or without the area, only layout-identical: the wrapper is
// `display: contents`, so the host lays its children out as before — except that a `parent > child`, `+` or `:first-child` selector
// across the wrapper no longer matches, in English as in every other language
// (verify-i18n-runtime §7 holds the shape; none of the current hosts has such a selector).
//
// What "show the English" reaches: every descendant reading its text through the i18n hooks
// (useT, useI18n, a build's useNs), via EnglishScope. A string resolved outside them — tStatic,
// nsStatic, a pre-localized string handed down as a prop — stays in the reader's language, so
// read the area's text through the hooks.
//
// The choice is React state, never stored (CLAUDE.md: nothing written on the reader's behalf;
// this is a reading aid, not a preference). It is remembered per language, so a reader who
// switches language reads the new one's translation rather than an English they asked for in
// another language.
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { EnglishScope, getI18n, subscribeI18n, useInEnglishScope, type EffectiveLocale } from '../../i18n';
import { InfoIcon } from './InfoIcon';
import './BindingLanguageNote.css';

export function BindingLanguageArea({
  children,
  placement = 'top',
  className,
}: {
  /** The text the notice is about, read through the i18n hooks so the toggle reaches it.
   *  Rendered in place, with no box of its own: its wrapper is `display: contents`, so it lays
   *  out as a direct child of the host (a flex column's gap, a multi-column flow) exactly as it
   *  would without the area. */
  children: ReactNode;
  /** Where the notice line goes: before the text (default) or after it. */
  placement?: 'top' | 'bottom';
  /** A class for the NOTICE LINE — the host's spacing for it. The line carries its own
   *  typography and no outer margin, so it sits in a gapped column as one more row; a host in
   *  block flow passes the margin it needs. */
  className?: string;
}) {
  // The reader's language, read past any English scope this area is inside — whether there is
  // anything to say depends on what the reader chose, not on what an outer area is showing.
  const live = useSyncExternalStore(subscribeI18n, getI18n, getI18n);
  const inOuterEnglish = useInEnglishScope();
  const [englishFor, setEnglishFor] = useState<EffectiveLocale | null>(null);

  // A shipped language other than English (and the dev pseudo-locale, so a development build can
  // see the line at a longer language's length): the text beside it is a translation. In English
  // and under a device translation this decides only what fills the slots below, never which
  // slots there are.
  const translated = live.locale !== 'en' && !live.locale.startsWith('mt:');
  const showEnglish = translated && englishFor === live.locale;
  const { t } = live;
  // Inside an area that is already showing the English, this one's line would offer a choice
  // the outer one has made: it stays quiet, and its text follows the outer English (EnglishScope
  // only ever adds English). Its own choice is kept for when the outer one goes back.
  const note = !translated || inOuterEnglish ? null : (
    <div
      className={`binding-language-note${className ? ` ${className}` : ''}`}
      role="note"
      // Announces the button's new label when it is pressed: the text beside it has just
      // changed language, and the label is what says which one it is in now.
      aria-live="polite"
    >
      <span className="binding-language-mark" role="img" aria-label={t('bindingLanguage.iconLabel')}>
        <InfoIcon size={12} />
      </span>
      <span className="binding-language-text">
        {`${t('bindingLanguage.note')} `}
        <button
          type="button"
          className="binding-language-toggle"
          onClick={() => setEnglishFor(showEnglish ? null : live.locale)}
        >
          {showEnglish ? t('bindingLanguage.showTranslation') : t('bindingLanguage.showEnglish')}
        </button>
      </span>
    </div>
  );

  // The three slots keep their places whichever is filled, in every language, so toggling, an
  // outer area toggling, or a change of language never remounts the text (a half-filled form
  // inside it keeps its fields, and an embedded widget its state).
  // `lang="en"` while the English shows: a screen reader then reads it as English, and CSS
  // casing follows English rules (a Turkish page would otherwise uppercase its i as İ).
  return (
    <>
      {placement === 'top' ? note : null}
      <div className="binding-language-content" lang={showEnglish ? 'en' : undefined}>
        <EnglishScope on={showEnglish}>{children}</EnglishScope>
      </div>
      {placement === 'bottom' ? note : null}
    </>
  );
}
