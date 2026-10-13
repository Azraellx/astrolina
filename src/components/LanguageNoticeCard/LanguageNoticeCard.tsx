// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The translations' notice as a card (2026-10-13), for a reader whose app is in a translation they
// reached without passing the Language menu, where the same notice stands before the list: their
// browser's language at boot, a language picked from the translate offer, a choice made before the
// notice existed. It is the menu's sentence on what a translation is worth, read inside a
// binding-language area as there, with two answers:
//   • Understood accepts it, for this card and the menu alike (i18n/languageNotice);
//   • Use English switches the app to English — the reader's own pick, stored as the menu's is —
//     and accepts nothing, so the menu still asks before its list.
// Unanswered, it comes back on the next visit. Nothing is answered on the reader's behalf.
//
// When the language on screen is the browser's (the reader never chose one), the card says that
// too, with the route to the menu — not for one a link asked for (`?lang=`), which the reader came
// by knowingly. That is what the 'language-detected' notice tells a returning
// reader, and it waits while this card is unanswered (App), so nobody meets two cards in a row
// about one change. The card records the language as told once it is on screen
// (lib/autoFlipNotice), so the notice doesn't tell it again after an Understood.
//
// One card at a time: parked while one of the app's other cards is up or a surface owns the
// viewport (`parked`), and while a page translator is at work, when the translate offer is the
// card that speaks. It takes the focus only when nothing else has it: it can turn up mid-session,
// once one of those ends, and taking the caret from a field would cost the reader keystrokes.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useT } from '../../i18n';
import { LANGUAGES } from '../../i18n/languages';
import { acceptLanguageNotice, useLanguageNoticeAccepted } from '../../i18n/languageNotice';
import { usePageTranslation } from '../../i18n/pageTranslation';
import { detectedAtBoot } from '../../i18n/runtime';
import { detectedLanguageRecorded, recordDetectedLanguage } from '../../lib/autoFlipNotice';
import { BindingLanguageArea } from '../ui/BindingLanguageNote';
import './LanguageNoticeCard.css';

const ENGLISH = LANGUAGES.find((l) => l.code === 'en')?.autonym ?? 'English';

export function LanguageNoticeCard({ parked }: { parked: boolean }) {
  const { locale, setLocale } = useT();
  const accepted = useLanguageNoticeAccepted();
  const { active: pageTranslated } = usePageTranslation();
  const [switching, setSwitching] = useState(false);
  // The language boot took from the browser, while it is the one on screen (null once the reader
  // picks one) — read each render, which a change of language always is.
  const detected = detectedAtBoot();
  const show = locale !== 'en' && !accepted && !parked && !pageTranslated;
  const detectedLocale = show && detected?.via === 'browser' ? detected.locale : null;

  useEffect(() => {
    if (detectedLocale && detectedLanguageRecorded() !== detectedLocale) recordDetectedLanguage(detectedLocale);
  }, [detectedLocale]);

  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!show) return;
    const focused = document.activeElement;
    if (!focused || focused === document.body) okRef.current?.focus();
  }, [show]);

  if (!show) return null;

  const switchToEnglish = () => {
    if (switching) return;
    setSwitching(true);
    void setLocale('en').finally(() => setSwitching(false));
  };

  return (
    <div className="language-notice-card" role="dialog" aria-labelledby="language-notice-card-body">
      <BindingLanguageArea>
        <LanguageNoticeCardText
          detected={detectedLocale !== null}
          switching={switching}
          okRef={okRef}
          onUnderstood={acceptLanguageNotice}
          onUseEnglish={switchToEnglish}
        />
      </BindingLanguageArea>
    </div>
  );
}

// Inside the binding-language area, reading through the hooks, so its toggle reaches every line.
function LanguageNoticeCardText({
  detected,
  switching,
  okRef,
  onUnderstood,
  onUseEnglish,
}: {
  detected: boolean;
  switching: boolean;
  okRef: RefObject<HTMLButtonElement | null>;
  onUnderstood: () => void;
  onUseEnglish: () => void;
}) {
  const { t } = useT();
  // The route as the screen writes it, from the three labels it renders (the 'language-detected'
  // notice builds it the same way, components/AutoFlipNotice).
  const route = [t('topNav.view.settings'), t('settings.sections.appearance'), t('settings.headings.language')].join(' ▸ ');
  return (
    <>
      {detected && <p className="lnc-detected">{t('settings.languageNoticeCard.detected', { route })}</p>}
      <p className="lnc-body" id="language-notice-card-body">
        {t('settings.languageNotice.body')}
      </p>
      <div className="lnc-actions">
        <button type="button" className="lnc-english" onClick={onUseEnglish} disabled={switching}>
          {t('settings.languageNoticeCard.useEnglish', { language: ENGLISH })}
        </button>
        <button type="button" className="lnc-ok" ref={okRef} onClick={onUnderstood} disabled={switching}>
          {t('settings.languageNotice.ok')}
        </button>
      </div>
    </>
  );
}
