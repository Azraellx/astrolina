// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Public surface of the i18n module.
export { I18nProvider, useT, useI18n, useOptionalT, EnglishScope, useInEnglishScope } from './I18nProvider';
export {
  getI18n,
  subscribeI18n,
  onLocaleChange,
  tStatic,
  initI18n,
  isTranslated,
  requestedKeys,
  noteNamespaceRead,
  documentI18n,
  englishSnapshot,
  applyDocumentLang,
  lastWrittenLang,
  type I18nSnapshot,
  type DocumentI18n,
  type EffectiveLocale,
  type MachineHold,
  type MachineHoldReason,
} from './runtime';
export { registerMessages, composeCatalog, composeEnglish, type ComposedMessages } from './registry';
// A build's own longer text through the on-device tier (2026-10-10): the same masking, checks,
// cache and translator as the catalog's strings, asked for by the build. A small module — the
// tier's engine stays a lazy chunk (machine/onDevice.ts says how).
export {
  canTranslateOnDevice,
  translateOnDevice,
  type OnDeviceItem,
  type OnDeviceOptions,
} from './machine/onDevice';
export { installTranslateGuard } from './translateGuard';
export { pseudoize } from './pseudo';
export { en } from './en';
export { SUPPORTED_LOCALES } from './catalog';
export { foldForSearch, lowerForSentence, lowerFirstForSentence } from './casing';
export { LANGUAGES, type LanguageOption } from './languages';
// The release hold on the new languages (2026-10-10): the flag every gate reads, and the
// per-device override a build's own tooling may set. languageHold.ts says what it holds and how
// it goes.
export { LANGUAGES_HELD, isLanguagesUnlocked, setLanguagesUnlocked } from './languageHold';
export type {
  Locale,
  ShippedLocale,
  MachineLocale,
  LocaleId,
  LocaleTree,
  MessageTree,
  MessagePack,
  Messages,
  MsgKey,
  TFn,
  TVars,
  Widen,
} from './types';
export type { Formatters, DateStyle } from './format';
export type { EnumLabels } from './enums';
