// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The translate offer (2026-10-09): while a browser's page translator is turning the app into
// a language AstroLina ships, one small card offers the app's own translation instead — "Use
// Español". Ours keeps every live readout live and leaves glyphs, codes and the reader's own
// chart names alone; the machine one does neither reliably (i18n/pageTranslation.ts and
// docs/translations.md say why).
//
// What it will and won't do:
//   • It appears only when the translator's target is a language that is AVAILABLE here
//     (SUPPORTED_LOCALES — a shipped, opened catalog) and is not the language the app is
//     already in. Never the on-device machine tier: a translator's target is a plain language
//     tag, and only a shipped one can match. A translation into anything else gets no card.
//   • It speaks the language it offers, from that language's OWN catalog (composeLocale), with
//     translate="no" on its root so the translator leaves those words as written. If the
//     catalog lacks any of the card's strings it doesn't appear at all: an English fallback
//     there would offer Spanish in English words.
//   • It never switches by itself. "Use" is the reader's own pick — the same setLocale the
//     language menu calls, which persists the choice — and then reloads, because the browser's
//     translation lasts as long as the page does and the reload comes back untranslated
//     (index.html's boot script declares the new language before the browser looks).
//   • "No thanks" is final for this device: it writes `astro:translate-offer-dismissed:v1`, and
//     nothing else ever writes that key. Per install, not per language — a reader who has
//     turned our translation down for the browser's has answered the question.
//   • It doesn't take focus. It turns up on its own, possibly while the reader is typing into
//     a field, and a card that grabbed the caret then would cost them their keystrokes.
//
// Styled as a sibling of the auto-flip notice (same chrome, same layer, same spot), and App
// holds it back while one of those is up — one card at a time.
import { useEffect, useState } from 'react';
import { LANGUAGES } from '../../i18n/languages';
import { SUPPORTED_LOCALES } from '../../i18n/catalog';
import { composeLocale } from '../../i18n/registry';
import { DECLARED_LANG } from '../../i18n/runtime';
import { interpolate, resolvePath } from '../../i18n/t';
import { reloadUntranslated, usePageTranslation } from '../../i18n/pageTranslation';
import { useT } from '../../i18n';
import type { ShippedLocale } from '../../i18n/types';
import { InfoIcon } from '../ui/InfoIcon';
import './TranslateOffer.css';

const DISMISSED_KEY = 'astro:translate-offer-dismissed:v1';
const KEYS = ['statement', 'note', 'use', 'dismiss'] as const;
type OfferText = Record<(typeof KEYS)[number], string>;

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    // Storage blocked: offer, and let a "No thanks" hold for the rest of this page load.
    return false;
  }
}

function offerable(tag: string | null): tag is ShippedLocale {
  return tag !== null && (SUPPORTED_LOCALES as readonly string[]).includes(tag);
}

// The card's words in `target`, from target's own composed catalog — or null when any of them
// would come from the English fill (see the header).
async function loadOfferText(target: ShippedLocale): Promise<OfferText | null> {
  const { tree, translated } = await composeLocale(target);
  if (translated !== 'all' && KEYS.some((k) => !translated.has(`translateOffer.${k}`))) return null;
  const autonym = LANGUAGES.find((l) => l.code === target)?.autonym ?? target;
  const text = {} as OfferText;
  for (const k of KEYS) {
    const template = resolvePath(tree, `translateOffer.${k}`);
    if (template === undefined) return null;
    text[k] = interpolate(template, { language: autonym });
  }
  return text;
}

export function TranslateOffer({ parked }: { parked: boolean }) {
  const { active, target } = usePageTranslation();
  const { locale, setLocale } = useT();
  const [dismissed, setDismissed] = useState(readDismissed);
  // The last catalog looked up, kept with its answer — null text included, so a language whose
  // catalog can't carry the card is asked once rather than on every render.
  const [loaded, setLoaded] = useState<{ target: ShippedLocale; text: OfferText | null } | null>(null);
  const [switching, setSwitching] = useState(false);

  const offer = active && !dismissed && offerable(target) && target !== locale ? target : null;

  useEffect(() => {
    if (!offer || loaded?.target === offer) return;
    let live = true;
    loadOfferText(offer).then(
      (text) => {
        if (live) setLoaded({ target: offer, text });
      },
      (err) => {
        console.warn(`[i18n] the translate offer could not load ${offer}`, err);
        if (live) setLoaded({ target: offer, text: null });
      },
    );
    return () => {
      live = false;
    };
  }, [offer, loaded]);

  if (!offer || parked || loaded?.target !== offer || !loaded.text) return null;
  const text = loaded.text;

  const use = () => {
    if (switching) return;
    setSwitching(true);
    // setLocale's after-pick hook already reloads while a translator is at work. Asking here
    // too keeps the card's own promise ("restarts") from resting on that hook's reading of the
    // page at that instant; reloadUntranslated only ever reloads once.
    void setLocale(offer).then(reloadUntranslated);
  };

  const decline = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Not stored: the card stays down for this page load only.
    }
    setDismissed(true);
  };

  return (
    <div
      className="translate-offer"
      translate="no"
      lang={DECLARED_LANG[offer] ?? offer}
      role="dialog"
      aria-labelledby="translate-offer-statement"
    >
      <p className="tro-title" id="translate-offer-statement">
        <InfoIcon className="tro-icon" />
        {text.statement}
      </p>
      <p className="tro-note">{text.note}</p>
      <div className="tro-actions">
        <button type="button" className="tro-dismiss" onClick={decline} disabled={switching}>
          {text.dismiss}
        </button>
        <button type="button" className="tro-use" onClick={use} disabled={switching}>
          {text.use}
        </button>
      </div>
    </div>
  );
}
