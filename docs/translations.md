# Translations & Languages

AstroLina's interface text lives in one typed catalog, separate from the code, so the app
can be translated without touching components. English ships today; other languages are
listed in the **Appearance ▸ Language** menu but stay greyed out until a translation
exists. This note explains how the system is laid out and how to add a language.

## How it works

- Every user-facing string is a key in an English catalog under `src/i18n/en/`, one file
  per feature (`common.ts`, `settings.ts`, `topNav.ts`, …), composed into `src/i18n/en.ts`.
- Components read text through a hook: `const { t, fmt, labels } = useT()`, e.g.
  `t('common.close')`. English is the single source of truth — its shape defines the type
  every other language must match.
- The active language is detected from the browser, can be overridden from the menu, and is
  remembered locally. Switching loads that language on demand and re-renders instantly.
- `src/i18n/languages.ts` is the registry shown in the dropdown: each entry has a code, the
  language's own name, and an `available` flag.

## Adding a language

Say you're adding French (`fr`):

1. **Translate.** Copy `src/i18n/en/` to `src/i18n/fr/` and translate the string *values* in
   each file. Keep the keys, the `{placeholders}`, and the `{count, plural, …}` structure
   exactly as they are — only the words change.
2. **Compose.** Copy `src/i18n/en.ts` to `src/i18n/fr.ts`, point its imports at `./fr/…`, and
   end the object with `satisfies Messages`. This makes the build reject the file if any key
   is missing, extra, or no longer a string.
3. **Register.** In `src/i18n/types.ts` add `'fr'` to the `Locale` union; in
   `src/i18n/catalog.ts` add it to `SUPPORTED_LOCALES` and to the `loaders` map
   (`fr: () => import('./fr')`).
4. **Enable.** In `src/i18n/languages.ts`, set that entry's `available: true`.

The dropdown now offers French; selecting it loads the catalog and switches the UI. To add a
language to the *list* (greyed out, no translation yet), do step 4's file only — add an entry
with `available: false`.

## What not to translate

Some text is intentionally **not** in the catalog and must stay as-is:

- Astrological glyphs and the universal codes astrologers use in every language: the angle
  codes `MC / IC / As / Ds`, the 2-letter planet codes, the 3-letter sign codes (`Ari…Pis`).
- The Latin convention labels **In Mundo** / **In Zodiaco**, and house-system eponyms
  (Placidus, Koch, Regiomontanus, …).
- Brand, library, and licence names (AstroLina, Swiss Ephemeris, AGPL-3.0, …).

Planet and sign *display names* (Sun, Aries, …) **are** translatable — they live in the
catalog and are reached via `labels.planet(...)` / `labels.sign(...)`.

## Things handled for you

- **Dates, months, and numbers** format themselves from the active language (via Luxon and the
  browser's `Intl`), so there's nothing to translate for them.
- **Plurals** pick the right form per language automatically. Where your language needs more
  forms than English, add them inside the message, e.g.
  `{count, plural, one {…} few {…} many {…} other {…}}`.

## Verifying

Run `npm run build`. The type system checks every translation against English: a missing key,
an extra key, or a non-string value fails the build, and any `t('…')` call with an unknown key
is a compile error. If the build is green, the catalog is complete.
