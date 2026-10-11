// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// React binding for the i18n store (runtime.ts). Every hook here reads the same
// module-level store through useSyncExternalStore, so a component re-renders when the
// language, the catalog or the stored choice changes — wherever it is mounted. Since
// 2026-10-09 nothing needs a provider: a plugin's own React root, a static render, a
// second window all read the store directly, and follow a language switch.
//
// The one context left is the English scope (2026-10-10): a part of the screen the reader has
// asked to see in English — text whose English version is the authoritative one (the licence and
// attribution statements, and anything a build wraps the same way), shown in translation as a
// convenience (components/ui/BindingLanguageNote). Inside it the hooks hand out the English view
// of the store (runtime.ts englishSnapshot), so every descendant that reads its text through
// useT / useI18n — a build's useNs included — renders English with the same values, and nothing
// under it has to know. Outside one, or with it off,
// the hooks return exactly what they returned before.
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { englishSnapshot, getI18n, subscribeI18n, type I18nSnapshot } from './runtime';

// Kept as a pass-through so existing trees (core main.tsx, a build's separate roots and
// static renders) compile and render unchanged. It provides nothing.
export function I18nProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// False everywhere until an EnglishScope turns it on. Transient by construction: React state
// above it decides, and nothing here is stored — a reader who asked for the English sees it
// until they ask for the translation or the area unmounts (CLAUDE.md: nothing written on the
// reader's behalf).
const EnglishScopeContext = createContext(false);

/** Shows its subtree in ENGLISH while `on` (2026-10-10): every descendant reading text through
 *  useT / useI18n / useOptionalT gets the English view of the store — English t, tAny, msgs,
 *  labels, fmt, lang and locale 'en'. Nesting only ever ADDS English: an inner scope that is off
 *  leaves an outer one's English in force, so an area inside an English area can't flip part of
 *  it back. Text read outside the hooks (tStatic, nsStatic, getI18n, a pre-localized string
 *  handed in) is not reached — it follows the reader's language as before. */
export function EnglishScope({ on, children }: { on: boolean; children: ReactNode }) {
  const outer = useContext(EnglishScopeContext);
  return <EnglishScopeContext.Provider value={outer || on}>{children}</EnglishScopeContext.Provider>;
}

/** True inside an EnglishScope that is on (its own or an outer one's). */
// eslint-disable-next-line react-refresh/only-export-components
export function useInEnglishScope(): boolean {
  return useContext(EnglishScopeContext);
}

// The store's snapshot. The server-snapshot argument is the same getter: a static render
// (renderToStaticMarkup, such as a build exporting a wheel as markup) reads the current language
// too. Both hooks run on every render, in the same order, whether or not a scope is on — the
// scope only chooses which of two views of the one store comes back.
// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nSnapshot {
  const english = useContext(EnglishScopeContext);
  const live = useSyncExternalStore(subscribeI18n, getI18n, getI18n);
  return english ? englishSnapshot(live) : live;
}

// The hook components have always called: { t, fmt, labels, locale, setLocale, … }.
// eslint-disable-next-line react-refresh/only-export-components
export function useT(): I18nSnapshot {
  return useI18n();
}

// Was useT() for shared ui that could mount OUTSIDE the provider, returning null there so the
// caller supplied its own English (ui/HoverTip's locked switch, SkyHeldNote). There is no
// outside any more: it always returns the snapshot, and those fallbacks are unreachable.
// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalT(): I18nSnapshot {
  return useI18n();
}
