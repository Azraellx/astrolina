# Translations & Languages

AstroLina's interface text lives in typed catalogs, separate from the code, so the app can be
translated without touching components. English is the source of truth; every other language is a
catalog generated from it. A language is listed (greyed out) before its catalog exists, and opened to
readers once it does. This note explains how the catalogs are laid out, what keeps them correct, and
what anyone writing a component needs to know.

The rule everything below serves: **a missing or invalid translation shows English for that key.**
English copy changes often, and translations follow it; they never hold it up.

## How it works

- Every user-facing string is a key in the English catalog under `src/i18n/en/`, one file per
  feature (`common.ts`, `settings.ts`, `topNav.ts`, …), composed into `src/i18n/en.ts`. Its shape
  defines the keys, and its `{placeholders}` the variables each string takes.
- Components read text through a hook: `const { t, fmt, labels } = useT()`, e.g.
  `t('common.close')`. A key that doesn't exist is a compile error at the call site. Code outside
  React reads the same store with `tStatic(key)` at call time, never at module load — a value read at
  import is frozen in whatever language was active then.
- The language comes from the stored choice if there is one, otherwise from the address — a link
  into the app can ask for one with `?lang=es` (base tag, any case) — otherwise from the language the
  last such link asked for, otherwise from the browser's preferred languages; and only ever a
  language whose catalog ships. A link's language sticks: for a reader with no choice, boot remembers
  it under its own key (`astro:locale-link:v1`), never as the choice, so visits without the link open
  in it too, a newer link replaces it, and the reader's first pick outranks it from then on. The
  app's own share links are built without `?lang=`. Browser detection never writes anything; the
  reader's own choice is stored only by their pick (`astro:locale:v2`). When detection lands on a newly shipped language
  for a returning reader who had been seeing English, the app says so once, in that language, with
  where to choose another ([forced-settings.md](forced-settings.md) describes it).
- A one-sentence notice says what the translations are worth: a work in progress, still under
  review, offered for convenience. It stands before the Language menu's list the first time the menu
  opens. A reader who is shown a translation without having opened the menu (the browser's language
  at boot, a link's `?lang=`, the translate offer) gets it as a card instead, with a button that switches to English
  (`src/components/LanguageNoticeCard/`). One Understood covers both; only that press is stored
  (`astro:language-notice-accepted:v1`, `src/i18n/languageNotice.ts`), and an unanswered card comes
  back on the next visit. While the card is unanswered it also carries the announcement above —
  which language the app opened in, and where to choose another — so a returning reader is not met
  by two cards about one change. A link's language is not announced: the reader followed a link
  from a page in it. Its sentence has legal weight (*Text with legal weight*).
- For each key the runtime uses the active language's string, then English, then the key itself. A
  translation whose `{placeholders}` differ from the English is treated as missing, so a broken
  translation can't print a raw `{name}` or drop a value.
- `src/i18n/languages.ts` lists the languages, each by its own name, with an `available` flag. That
  flag is the human gate: a catalog can exist and stay unused until someone has looked at it. Opening a
  language also means adding it to the boot script's list in `index.html` (see *Declaring the language
  before the app loads*); `npm run verify:lang-boot` fails until the two agree.

## Where catalogs come from

Other languages are **generated**, not hand-assembled, by the project's translation process, which
is maintained outside this repository. It reads the English source text — the strings *and the
comments beside them*, which state what each string is for and what it must not imply — and writes,
per language, files that are all in this repository:

- `src/i18n/<loc>/<frag>.ts` — one file per English fragment, the same names, the keys in the same
  order. A key with no translation is simply absent; English shows for it.
- `src/i18n/<loc>.ts` — composes the fragments: `export default { … } satisfies LocaleTree`.
- `src/i18n/<loc>.lock.json` — per key, a hash of the English it was translated from, a hash of the
  value as written, and how it got there.
- `src/i18n/locales.ts` — the lazy loader map; each language is fetched only when it is chosen.

What the process shares with this repository's own checks is in `scripts/i18n/`: the source reader
(`extract-lib.mjs`), the plural syntax (`icu.mjs`), the file layout and the deterministic writer
(`layout.mjs`, `emit.mjs`), the rules (`checks.mjs`) and the do-not-translate list (`dnt.json`).

Catalogs are typed **loosely** on purpose: `LocaleTree` is nested strings, not the exact English
shape. Strict typing would fail the build in every language on every English edit, contributors'
included. Completeness and validity are checked by `npm run check:i18n` instead (below).

**Correcting a translation:** edit the value in `src/i18n/<loc>/<frag>.ts`. The translation process
notices a value whose hash no longer matches the lock, keeps it, and never overwrites it — until its
English changes, when the next translation is made with your version in front of the translator.
Keys, order and layout are rewritten by the process; values are yours to fix.

## Writing English for translation

The comments in `src/i18n/en/*.ts` are the translator's brief. Write them for that reader as well as
for the next engineer: what the string is, where it appears, what it must and must not say, how long
it may be. A string built from shared constants (a sentence typed once and reused word for word) stays
built that way in every language.

Four comment tags, in the comment directly above a key (each applies to that key and everything under
it, and must open a comment line):

| Tag | Meaning |
|---|---|
| `// @i18n-skip` | Data, not copy — never translated (a format sample, a code, an id). |
| `// @i18n-review` | Text with legal weight: translated and shipped like any other string, shown inside a `BindingLanguageArea` (see *Text with legal weight*), and kept out of the on-device tier — the runtime never sees comments, so a build lists these paths in its pack's `machineExclude`, and the core lists its own in `CORE_MACHINE_EXCLUDE` (see *On-device translation*). |
| `// @i18n-verbatim` | Wording to translate faithfully and completely, without house-style edits. |
| `// @i18n-max N` | A hard length limit, in characters. |

Plurals use ICU syntax: `{count, plural, one {# chart} other {# charts}}` and
`{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}`, where `#` is the number. A form may
contain `{placeholders}`. Each language supplies the forms its own plural rules need (Russian has
four); the runtime picks the form with the browser's `Intl.PluralRules`.

## What not to translate

These stay exactly as they are in every language. `scripts/i18n/dnt.json` is the full list, term by
term, in machine form, and the check enforces it; the categories below are what it holds, so a new
term goes there, and a new kind of term here as well. The on-device tier (below) carries a runtime
copy in `src/i18n/machine/terms.ts`; `npm run verify:i18n-machine` fails until it agrees with
`dnt.json` entry for entry.

- Astrological glyphs, arrows, and the `▸` that joins the steps of a route.
- The angle codes `MC`, `IC`, `AS`, `DS` (and `ASC`, `DSC`; `As`/`Ds` in the As/MC/Ds/IC notation),
  and the Vertex codes `Vx`, `Avx`.
- The 2-letter planet and point codes (`Su`, `Mo`, `Me` … `NN`, `SN`, `Fo`) and the 3-letter sign
  codes (`Ari` … `Pis`) wherever they are used as codes.
- The Latin convention labels **In Mundo** and **In Zodiaco**, and the house-system eponyms Placidus,
  Koch, Regiomontanus, Campanus, Porphyry, Alcabitus and Morinus — except where a language's
  astrologers write an eponym in their own established form, which `dnt.json` records for that
  language (`locales`): Cyrillic in Russian (Плацидус, Кох…), *Porfirio* in Spanish, *Porphyrios* and
  *Alcabitius* in German. There the translation uses that spelling, and may decline it.
- Proper names: the product's (AstroLina), and those of libraries and packages, data sources and
  the institutions behind them, map and font providers, services, and licences (in every form the
  text uses: full name, identifier, abbreviation); the people credited by name; and web addresses.
  `dnt.json` lists every one.
- The attribution **"© <year> AstroLina"**, which section 7(b) of the licence requires every copy to
  keep: symbol, year and name, in every language — and the © of every other copyright notice.

Planet and sign *names* (Sun, Aries, …) **are** translated — they live in the catalog and are reached
through `labels.planet(...)` / `labels.sign(...)`. Only the codes are fixed.

## Things handled for you

- **Dates.** `fmt.date(year, month, day, style)` formats a civil date for the active language —
  with the grammar it needs, such as the genitive month Russian uses after a day number. Don't
  assemble dates from month names by hand.
- **Numbers and lists.** `fmt.num(value)` and `fmt.list(items)` follow the language's separators
  and conjunctions.
- **Decimals.** `fmt.fixed(value, digits)` replaces `value.toFixed(digits)` in any readout the reader
  sees. In English it returns exactly what `toFixed` did; in other languages only the decimal mark
  changes (`85.3` becomes `85,3` in German), and it never groups thousands. Coordinates, degrees in
  DMS and codes keep their own form and don't go through it.
- **Plurals**, as above.
- **Casing**, half of it. CSS `text-transform` follows `<html lang>` by itself. A case change made
  in code on text the reader sees — initials, a word lower-cased to sit mid-sentence — is yours:
  use `toLocaleUpperCase(lang)` / `toLocaleLowerCase(lang)` with the active language
  (`useT().lang`, or `getI18n().lang` outside React), because Turkish capitalises `i` as `İ` and
  lower-cases `I` as `ı`. Codes, keys, hotkeys, search folding and anything compared rather than
  shown keep the plain `toUpperCase()` / `toLowerCase()`: a code someone typed with an `i` has to
  match the same code whatever language the app is in.

## Text with legal weight

Some text is shown in translation for the reader's understanding while its English version stays
the one that counts — in the core, licence and attribution statements. Such text goes inside
`BindingLanguageArea` (`src/components/ui/BindingLanguageNote.tsx`). In a shipped language other
than English the area adds one line in the reader's language, saying that the text was translated
for their convenience and that the English version is the binding one (the wording is
`bindingLanguage.note`, in `src/i18n/en/bindingLanguage.ts`), with a button that shows the English
in place, and then the translation again. The English comes from `EnglishScope`
(`src/i18n/I18nProvider.tsx`): inside it `useT()` and `useI18n()` return the English view of the
store (`englishSnapshot()`), so the text has to be read through the hooks to follow the button;
`tStatic`, `getI18n()` and strings handed down already translated keep the reader's language. The
choice is never stored: it lasts while the area is on screen, for the language it was made in. In
English, and under a device translation, the area adds no line and no `lang`. Its text still sits in
the same `display: contents` wrapper as in every other language, so the area keeps one shape and a
language switch never rebuilds what is inside it; the host lays the text out as before, except that
a `parent > child`, `+` or `:first-child` selector across the wrapper no longer matches. The area
does not keep its text away from the on-device tier: text that must stay English there is excluded
by path (`machineExclude`, under *On-device translation*).

The credits dialog's licence and attribution notes are the core's own use of it, with the
translations' notice (`settings.languageNotice`), in the Language menu and on its card. A build may wrap
its own text in an area the same way; its own namespaces follow the button only if its reader goes
through those hooks during render. A row a build registers in the credits dialog follows the button
when it names catalog keys (`nameKey`, `noteKey` in `src/lib/extensions/creditsFooter.ts`), and
keeps its pre-localized strings otherwise.

## Components and browser page translation

A reader's browser can translate the page itself, whether or not we ship their language. It does so
by replacing text nodes, which a React app can't see: a value that updates afterwards can freeze on
screen, or the update can throw. So, for anyone writing a component:

- **Any element whose text changes while it is visible must have exactly one string child, or carry
  `translate="no"`.** Fold a label and its value into one template string —
  `` {`${t('x.label')} ${value}`} `` rather than `{t('x.label')} {value}` — so React updates the
  element's text as a whole.
- `translate="no"` goes on glyphs, angle codes, values that are pure readouts (degrees, dates,
  clocks, counts), the reader's own data (chart names, place names, notes, any text they wrote
  themselves), language names, and brand wordmarks. Never on a whole panel "to be safe": words a
  reader needs translated must stay translatable.
- Text that mixes words with a live value stays translatable, folded into one string.
- Content that swaps wholesale (a pager, a chart switch) gets a React `key`, so it remounts rather
  than being patched.
- In HTML built as a string (a map popup), put `translate="no"` on the spans that hold glyphs,
  codes, place names and degree values.

`installTranslateGuard()` (called first at startup) turns the two DOM calls a page translator breaks
into no-ops instead of crashes. It is a safety net; the rule above is the fix.

## Declaring the language before the app loads

`index.html` carries a small inline script, the first script in `<head>`, that sets `<html lang>`
before anything else runs. It resolves the language exactly as the runtime does — the stored choice
if it is an available language, otherwise the address's `?lang=` if that is, otherwise the language
the last link asked for if that is, otherwise the browser's first available language, otherwise
English — and declares it as the tag the runtime uses (`pt-BR`
for Portuguese). It reads storage and the address and never writes either.

It exists because a browser decides whether to offer translating a page from the language the page
declares as it loads. Declared later, by the app once its bundle has run, it is too late: a reader
using our own Spanish would already have been offered a machine translation of it. Casing needs it
from the first paint too — Turkish uppercase gives `İ` only under `lang="tr"`.

The script can't import anything, so it carries its own copies of the available languages and of
the declared tags. **Enabling a language means adding it to the script's `AVAILABLE` list as well as
flipping its `available` flag.** `npm run verify:lang-boot` fails until the copies equal the
runtime's (`SUPPORTED_LOCALES` and `DECLARED_LANG`), and runs the script and the runtime on the same
stored choice, address, remembered link and browser languages to show they declare the same
thing.

## When the browser translates anyway

`src/i18n/pageTranslation.ts` notices when a browser's page translator is at work, from the marks
one leaves: a class on `<html>`, a `lang` the app didn't write (the runtime remembers what it wrote),
or the translator's own elements inside the page, looked for every few seconds while the tab is
visible. It reports whether the page is being translated and, when the translator declares it, into
which language. Components read it with `usePageTranslation()`. It never writes storage.

Two things act on it:

- **The offer.** When the translator's target is a language AstroLina ships, and not the one the app
  is already in, a small card offers our own translation instead. It is written in that language,
  from that language's own catalog (the English source is `src/i18n/en/translateOffer.ts`, and the
  card doesn't appear for a language whose catalog lacks any of its strings), and it carries
  `translate="no"` so the translator leaves its words alone. Accepting stores the language as a pick
  from the menu would, and restarts the app; the restart comes back untranslated because the boot
  script declares the new language. *No thanks* stores `astro:translate-offer-dismissed:v1`, and the
  card does not come back. It never switches by itself, and never offers a language we don't ship.
- **A language pick.** Choosing a language while a page translator is at work restarts the app as
  well. The translation lasts as long as the page does, and would otherwise go on translating text
  that is now already in the reader's language.

## On-device translation

Where the browser has a built-in, on-device translator (the web's `Translator` API), the Language
menu gains a second section: languages AstroLina does not ship, translated from the English catalog
by the reader's own device as they use the app; AstroLina sends its text to no translation service.
The menu heads it *Auto-translated*, with an (i) whose tooltip says what sets the two sections apart:
the languages above come with AstroLina, the ones below are translated automatically on the device.
What choosing one involves, a download the first time and wording that may be off, is each row's
own tooltip. The section appears only where the API exists, its rows only for languages the device
reports it can translate into (asked when the Language section opens, never at boot), and never for
a shipped language or a right-to-left one. The choice is stored as `mt:<lang>` (`mt:fr`) in the same
`astro:locale:v2` key as any other.

The work lives in `src/i18n/machine/`, a chunk loaded only when such a language is chosen or stored;
`src/i18n/machineMenu.ts` is the menu's small half.

- **Masking.** Before a string reaches the translator, what it may not touch becomes numbered
  sentinels — `[1]`, `[2]`: `{placeholders}`, glyph runs, the do-not-translate terms (and the
  runtime-only entries `RUNTIME_ONLY` names in `machine/terms.ts`), web and email addresses. Under
  a pack's marker paths (`markers` in `src/i18n/types.ts`) a braced word marks a word for styling
  and *is* translated: it is sent as a pair, `[1]Hours[/1]`, and comes back as one pair of braces
  round one word. Line breaks and edge spaces are never sent (the translator flattens and trims
  them): each line goes alone. The shape `[n]` was chosen by measuring the real translator against
  six other shapes; the numbers are at `SENTINEL_OPEN` in `machine/mask.ts`.
- **Checks.** A translation is kept only if every sentinel came back exactly once and none was
  invented; no `<`, `>`, `{` or `}` appeared that the English lacked; and its length is 0.25×–4×
  the English, counting East Asian wide characters as two. Anything else shows English for that
  key — the same rule as everywhere. One repair is made rather than refused: where the English line
  starts with a capital and the translation with a lowercase letter of a script that has case, that
  letter is capitalised by the language's own rules (Greek keeps its accent; Georgian, which has no
  capitals in prose, is left as it is). A protected term at the start is never touched.
- **Plurals** (`machine/forms.ts`). For each plural category the target language has, the English
  sentence is rendered with a sample count in that category, translated whole, and the count's
  digits are turned back into `#`; the forms are reassembled into one ICU block. Any form failing
  leaves the key English, as does a template with more than one plural block.
- **Order.** What is on screen first — every key asked of `t()` this session, and every key of a
  namespace a build reads whole (a build whose components read the composed object directly calls
  `noteNamespaceRead(ns)` so these count) — then a sweep of the rest. Results reach the screen at
  most once every 1.5 s, and once when the sweep ends: every update is a new catalog, and the map's
  popups close when the catalog changes.
- **Choosing.** The row's click starts the translator synchronously, because a model that must be
  downloaded may only be fetched inside the reader's own click; the menu shows the download, then
  the translating. The app switches once what is on screen is translated, or after 15 seconds,
  whichever is first. Choosing any other language aborts it.
- **The cache.** What was translated is kept in IndexedDB (`astrolina-i18n`, store `mt`, keyed
  `[lang, key]`), with a hash of the English it came from and of the engine's version, so an edited
  English string — or a change to the engine — is translated again. The engine's version moves by
  itself when the masking or the checks change (the protected terms, the glyph pattern, the
  sentinel, the length limits), so no cached translation outlives the rules it passed. A failure
  is cached only when it would happen again — a reply that fails the checks, a string over the
  translator's limit; a translator that throws leaves that key English for the session and stores
  nothing, and five throws in a row stop translating, with the menu saying so (choosing the row
  again starts afresh). A later visit opens in the language at once, from the cache. Any storage
  failure leaves the tier working in memory, and so does a store that hasn't answered after about
  2.5 seconds.
- **When the device can't translate.** With a cache, the app shows it (the row says new text stays
  English, or that choosing it again finishes a download). With nothing cached, the choice is
  *held*: stored as chosen, the app in the detected language or English, the row greyed with its
  reason, and a `language-held` notice once ([forced-settings.md](forced-settings.md)).
- **Disclosure.** While a device language is on screen, a line under the menu says it is
  machine-translated and that untranslated text shows in English. It names no browser or vendor.
  The tier's own sentences — this section's heading, its tips, the lines under the menu, the held
  notice — are written for each language (`machine/ownStrings.ts`) and never machine-translated:
  they are the ones that must be exactly right. Each is used only while the English it was written
  from is still the catalog's; once that English changes, English shows until it is written again.
- **A build's own text.** A build can ask the device to translate longer text of its own, text it
  renders itself rather than reads from the catalog, through `translateOnDevice(items, options)`
  from `src/i18n`; `canTranslateOnDevice()` says whether a device language is on screen to
  translate into. Each passage gets what a catalog string gets: the same masking, the same checks
  (a passage that fails them is left out of the answer, and the build shows its English), the same
  translator, and the same cache, under a key the build namespaces (`<ns>:<key>`), stored apart
  from the catalog's records so that opening the app never reads them. Passages asked for `now`
  go ahead of the background sweep, behind only what is on screen; `background` ones go after it.
  Text over the translator's input limit is split at sentence ends, and an abort stops the work
  between passages. Like the rest of the tier, it does nothing while the screen is in a shipped
  language or English.

What the tier never translates: text a build marks as having legal weight, or as data — a pack's
`machineExclude` paths (`src/i18n/types.ts`), the runtime counterpart of `@i18n-review` and
`@i18n-skip`, since the runtime never sees comments — and the core's own such text, listed by hand in
`CORE_MACHINE_EXCLUDE` (`src/i18n/registry.ts`) beside the tags in its catalog. A build's documents (files and prints) are
written in a shipped language or English, never in a device translation: `documentI18n()` gives a
document writer the right one.

## Development tools

- **The pseudo-locale.** In a development build the language list offers *Pseudo-locale (dev)*.
  Every catalogued string comes back accented, padded by about a third and wrapped in `⟦…⟧`, with
  placeholders, plural syntax, glyphs and codes untouched. Any plain English left on screen is a
  string that isn't in the catalog; a clipped bracket is a layout that won't survive a longer
  language.
- **The fake page translator.** Add `?fake-translate` to the URL in a development build (its value is
  the target language, French by default). It mimics a browser's page translation — wrapping text in
  `<font>`, honouring `translate="no"`, changing `<html lang>` — so the rule above can be tested
  without a real translator: live values must keep updating and nothing may throw.

## Verifying

`npm run check:i18n` reads the catalogs' source text (it never runs app code) and checks:

- **English:** every string readable statically; every plural block and placeholder parses; every
  enumeration in `src/i18n/enums.ts` (house systems, line systems, planets, …) has a catalog key for
  each of its values.
- **Each language:** against English, key by key — the same placeholders the same number of times,
  identical leading and trailing spaces, plural blocks the runtime can read with a form for every
  category the language uses, the same glyphs, every do-not-translate term kept, any stated length
  limit respected. Missing keys are reported as coverage, not errors: English shows for them.
- **The loader map** lists exactly the shipped languages whose catalog is on disk.

It exits non-zero on any error, and prints warnings (a label much longer than its English, a hover tip
that crosses a width step, the same English translated two ways, prose left in English) for a person
to read. `npm run build` type-checks the catalogs' shape; `check:i18n` is what proves them right.
`npm run verify:lang-boot` holds the boot script in `index.html` to the runtime, as described above.
`npm run verify:i18n-machine` holds the on-device tier to its rules: masking then unmasking gives
every key back byte for byte; translators that drop, double or alter sentinels never get a broken
string through; plural forms reassembled for Russian, Polish and Arabic read as hand-written ones
do; the protected terms agree with `dnt.json`; the cache re-translates edited English, never
stores a translator's exception, and gives up on a store that stalls; five exceptions in a row stop
the session; the engine's version moves with every rule it folds in, and is pinned so that moving
it is a decision; the first-letter capital is repaired in each script's rules and nowhere else; the
tier's own sentences are never sent to the translator, agree with the English they were written
from and keep its placeholders; a build's own text sent through `translateOnDevice` is masked,
checked and cached the same way, goes ahead of the sweep when asked for now, stops at an abort, and
is refused outside a device language; and a held choice stays stored while another language shows.
