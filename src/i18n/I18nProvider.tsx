// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// React binding for the i18n catalog. <I18nProvider> resolves the active locale
// (persisted override, then browser languages, then English), exposes { t, fmt, labels,
// locale, setLocale } via context, and re-renders all useT() consumers when the locale
// changes. English is loaded synchronously (base bundle); other locales are awaited via
// the lazy registry before the swap, so there's no flash of missing keys.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en } from './en';
import { loadCatalog, SUPPORTED_LOCALES } from './catalog';
import { resolvePath, interpolate } from './t';
import { applyPlurals } from './plural';
import { makeFormatters, type Formatters } from './format';
import { makeEnumLabels, type EnumLabels } from './enums';
import type { Locale, Messages, MsgKey, TFn, TVars } from './types';

// Matches the app's existing `astro:<name>:v1` localStorage convention.
const LOCALE_KEY = 'astro:locale:v1';

function isSupported(code: string): code is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(code);
}

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored && isSupported(stored)) return stored;
    const tags = navigator.languages ?? [navigator.language];
    for (const tag of tags) {
      const base = tag.toLowerCase().split('-')[0];
      if (isSupported(base)) return base;
    }
  } catch {
    // localStorage / navigator unavailable — fall through to the default.
  }
  return 'en';
}

interface I18nValue {
  locale: Locale;
  t: TFn;
  fmt: Formatters;
  labels: EnumLabels;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  const [messages, setMessages] = useState<Messages>(en);

  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // Ignore persistence failures (private mode, etc.).
    }
    void loadCatalog(next).then((loaded) => {
      setMessages(loaded);
      setLocaleState(next);
    });
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t: TFn = (key: MsgKey, vars?: TVars) => {
      const template = resolvePath(messages, key) ?? key;
      return interpolate(applyPlurals(template, locale, vars), vars);
    };
    return {
      locale,
      t,
      fmt: makeFormatters(locale),
      labels: makeEnumLabels(t),
      setLocale,
    };
  }, [locale, messages, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useT(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used within <I18nProvider>');
  return ctx;
}
