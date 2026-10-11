// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The binding-language notice (components/ui/BindingLanguageNote, 2026-10-10): one short line
// above (or below) text whose English version is the authoritative one (the core's licence and
// attribution statements, and whatever a build wraps the same way), wherever that text is shown
// in translation. It says the translation is there to help, that only the English is binding,
// and offers the English in place with one button; the same button then offers the translation
// back.
//
// For the translator: this line never appears in English. It is always read by someone reading
// YOUR language, about the text right beside it, which is in your language too until they press
// the button. Plain and calm — a courtesy, not a warning: nothing is wrong with the translation.
// It sits in narrow panels (320 px), so keep each string about as short as the English.
export const bindingLanguage = {
  // @i18n-verbatim — a statement about which version of a text has legal force; translate its
  // meaning faithfully and completely. Two sentences: the first says the text beside this line
  // was translated to help the reader; the second that only the ENGLISH version of it is legally
  // binding (not "the original", which a reader can't identify; name English). Don't soften
  // "only", and don't add that the translation may contain errors — the line claims no more
  // than this.
  note: 'Translated for your convenience. Only the English version is legally binding.',
  // A button after the sentence: shows the text beside it in English, in place. "the English"
  // means the English version of that text — not the English language as a whole, and not the
  // whole app (only this text changes). A button in a narrow panel: keep it short.
  // @i18n-max 28
  showEnglish: 'Show the English',
  // The same button once the English is showing: puts the text back into YOUR language. "The
  // translation" is the version in your language — say it so it reads naturally as an offer to
  // go back. Keep it about as long as showEnglish: the two take turns in one place.
  // @i18n-max 28
  showTranslation: 'Show the translation',
  // Not shown: what a screen reader says for the small info mark at the start of the line. A
  // short label naming what the line is about.
  iconLabel: 'About this translation',
} as const;
