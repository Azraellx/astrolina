// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The translate offer (components/TranslateOffer, 2026-10-09): one small card, shown while the
// reader's browser is machine-translating the page INTO a language AstroLina ships, offering
// AstroLina's own translation in its place.
//
// For the translator, the one thing that differs from every other string: this card is never
// shown in the language the app is in. It is shown in the language it OFFERS, read from that
// language's own catalog, and the browser's translator is kept off it — so each catalog's copy
// speaks for its own language, to a reader who is reading it in that language. If any of these
// four is missing from a catalog, the card does not appear for that language at all: it never
// falls back to English, which would be offering Spanish in English words.
//
// Short on purpose. It arrives unasked, over a page the reader was busy reading.
export const translateOffer = {
  // The card's headline: a plain statement that the app exists in this language. Name YOUR
  // OWN language here, in the form the sentence needs ("en español", "auf Deutsch", "на
  // русском языке", "em português", "Türkçe olarak") — never the word for English. The English
  // says "in English" because the English copy offers English: to a reader whose app opened in
  // another language while their browser translates it into English.
  statement: 'AstroLina is available in English.',
  // Under the headline, small. Says the one thing the button does beyond switching: the app
  // reloads, because the browser's translation lasts as long as the page does and a fresh page
  // is what ends it. Don't promise more (that nothing is lost, how long it takes) — just that
  // switching restarts it.
  note: 'Switching restarts the app.',
  // The button that switches. {language} is the language's own name exactly as the language
  // menu lists it ("Español", "Português (Brasil)", "Deutsch", "Русский"), inserted as written:
  // capitalised, and never declined or inflected. So phrase the button so a capitalised name
  // can stand as it is after the verb. A button: keep it short.
  use: 'Use {language}',
  // The other button. Declines for good — the card will not appear again on this device — so
  // a polite, final refusal rather than "Later". A button: keep it short.
  dismiss: 'No thanks',
} as const;
