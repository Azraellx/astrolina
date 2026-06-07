// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Public surface of the i18n module.
export { I18nProvider, useT } from './I18nProvider';
export { en } from './en';
export { SUPPORTED_LOCALES } from './catalog';
export { LANGUAGES, type LanguageOption } from './languages';
export type { Locale, Messages, MsgKey, TFn, TVars } from './types';
export type { Formatters } from './format';
export type { EnumLabels } from './enums';
