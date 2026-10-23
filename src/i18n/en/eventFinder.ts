// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Find the moment (2026-10-20): the panel in the new-chart form that searches the sky for an
// event — a planet entering a sign, a New or Full Moon, an eclipse, a planet turning
// retrograde or direct, two planets reaching an aspect — and fills the chart's date and time
// with it. It also suggests a NAME for the chart it is about to save; the name templates are
// below (lib/astro/eventNaming.ts builds them), and the reader can type over the suggestion.
// It suggests a folder too, but folder names are not translated here: like the default event
// folder "Mundane", the app's own folder names are kept as data (eventNaming suggestedFolder).
//
// For the translator: {body}, {a} and {b} are planet names and {sign} a zodiac sign, already
// in your language; {date} is a date already written your language's way ("24 Oct 2026");
// {year} is a four-digit year. Keep every placeholder. A suggested name becomes the chart's
// name in the reader's library, so write it the way an astrologer would title the chart —
// short, with no full stop.
export const eventFinder = {
  // ── The Find… button, under the Date field of the new-chart form (event charts only),
  // beside the Now button. It opens and closes the panel below.
  // The button's label: a short verb with an ellipsis, as a button that opens more.
  // @i18n-max 12
  open: 'Find…',
  // The button's hover tip: its headline, then what it does. Keep the hint under about 180
  // characters.
  openTip: 'Find the moment',
  openHint: 'Search the sky for an ingress, a New or Full Moon, an eclipse, a station or an aspect, and fill in its date and time.',
  // Read aloud by a screen reader for the panel as a whole; the same phrase as the tip.
  groupAria: 'Find the moment',

  // ── The panel's first menu: what kind of event to search for. Short nouns, capitalised
  // as menu items. Each has a hint shown on hover in the menu.
  kind: {
    // A body entering a sign.
    ingress: 'Ingress',
    newMoon: 'New Moon',
    fullMoon: 'Full Moon',
    solarEclipse: 'Solar eclipse',
    lunarEclipse: 'Lunar eclipse',
    // A planet appearing to stop and turn (retrograde or direct).
    station: 'Station',
    // Two bodies reaching an exact aspect (conjunction, square, trine…).
    aspect: 'Aspect',
  },
  kindHint: {
    ingress: 'A body entering a sign. The Sun entering Aries is the March equinox.',
    newMoon: 'The Moon and the Sun at the same longitude.',
    fullMoon: 'The Moon opposite the Sun.',
    solarEclipse: 'The moment of greatest eclipse, which can lie some minutes from the New Moon.',
    lunarEclipse: 'The moment of greatest eclipse, which can lie some minutes from the Full Moon.',
    station: 'A planet appearing to stop and turn, retrograde or direct.',
    aspect: 'Two bodies reaching an exact aspect in ecliptic longitude.',
  },
  // The line under the kind menu, as a sentence with a dropdown menu in place of each
  // placeholder: {body}, {a} and {b} become planet menus, {sign} a sign menu, {turn} a menu
  // of the two words under `turn` below, {aspect} a menu of the aspect words under `aspect`.
  // KEEP EVERY PLACEHOLDER, each exactly once, in the order your language's sentence needs;
  // the words between them are shown as plain text. "Sun into Aries", "Mercury stations
  // retrograde", "Sun conjunct Venus".
  pick: {
    ingress: '{body} into {sign}',
    station: '{body} stations {turn}',
    aspect: '{a} {aspect} {b}',
  },
  // A choice in the sign menu above, in place of a sign: whichever sign the body enters next
  // (or entered last, searching back). Lowercase in English because it sits mid-sentence:
  // "Sun into the next sign".
  anySign: 'the next sign',
  anySignHint: 'Whichever sign the body enters next, or entered last when searching back.',
  // The two choices of the {turn} menu above, lowercase because they sit mid-sentence:
  // "Mercury stations retrograde".
  turn: {
    retrograde: 'retrograde',
    direct: 'direct',
  },
  // Their hover hints in the menu.
  turnHint: {
    retrograde: 'The planet appears to stop, then move backward through the zodiac.',
    direct: 'The planet appears to stop, then move forward again.',
  },
  // The aspect, as a word INSIDE a sentence between two planet names: "Sun conjunct Venus",
  // "Mars square Saturn", "Jupiter opposite Pluto". Lowercase in English because it sits mid-
  // sentence; use whatever form your language's astrologers use between two planet names
  // (a verb, an adjective or a noun). Used in suggested names and in the search line.
  aspect: {
    conjunction: 'conjunct',
    sextile: 'sextile',
    square: 'square',
    trine: 'trine',
    opposition: 'opposite',
  },
  // The hover hint on each aspect in its menu: how far apart the two bodies are at the exact
  // aspect. {deg} is a number (0, 60, 90, 120 or 180).
  aspectHint: '{deg}° apart in ecliptic longitude.',
  // Why an aspect (or a body) is greyed out in its menu: this pair of bodies never stands
  // that far apart as seen from Earth, so the aspect can never form. {a} and {b} are planet
  // names, {deg} a whole number of degrees ("Sun and Mercury are never more than 28° apart").
  impossible: '{a} and {b} are never more than {deg}° apart, so this aspect never forms.',
  // Why a body is greyed out in the second menu of an aspect: it is the body already chosen
  // in the first.
  sameBody: 'A body makes no aspect to itself. Pick two different bodies.',

  // ── Under the menus: where the search starts from — the date and time already in the form
  // (as the form shows them, in the place's local time), or now while the form is empty.
  // {date} is a date written your language's way, {time} a 24-hour time ("14:46").
  from: 'From {date}',
  fromAt: 'From {date}, {time}',
  fromNow: 'From now',
  // The two search buttons, side by side: the event before the starting moment, and the one
  // after it. An arrow is drawn beside each outside this text, so add none.
  previous: 'Previous',
  next: 'Find next',

  // ── The result line under the buttons. One of these at a time; a screen reader announces
  // each as it appears.
  // Shown while a long search is still running. {year} is the four-digit year the search has
  // reached so far.
  searching: 'Searching… {year}',
  // Nothing found in the years the form accepts. {start} and {end} are dates written your
  // language's way, earlier first.
  none: 'None between {start} and {end}.',
  // The search failed for a reason other than finding nothing (rare).
  error: 'The search could not run. Try again.',
  // A result: {what} says what was found (one of the phrases under `found` below), {date} its
  // date and {time} its time in Universal Time ("14:46"). "UT" is the astronomers'
  // abbreviation for Universal Time; keep it unless your language's astrologers write it
  // differently. The form's own date and time fields show the same moment in local time.
  result: '{what}: {date}, {time} UT',
  // What was found, for {what} above — it can say more than the search did: which sign was
  // next, whether a planet entered it moving backward, which kind of eclipse. {body}, {a} and
  // {b} are planet names, {sign} a zodiac sign, {aspect} one of the aspect words above. "Rx"
  // is the astrologer's retrograde mark, as in the suggested names below.
  found: {
    ingress: '{body} into {sign}',
    ingressRx: '{body} Rx into {sign}',
    newMoon: 'New Moon in {sign}',
    fullMoon: 'Full Moon in {sign}',
    // One phrase per kind of eclipse, because the adjective agrees with the noun in many
    // languages; {sign} is the sign of the Sun (solar) or the Moon (lunar).
    solarEclipse: {
      total: 'Total solar eclipse in {sign}',
      annular: 'Annular solar eclipse in {sign}',
      hybrid: 'Hybrid solar eclipse in {sign}',
      partial: 'Partial solar eclipse in {sign}',
    },
    lunarEclipse: {
      total: 'Total lunar eclipse in {sign}',
      partial: 'Partial lunar eclipse in {sign}',
      penumbral: 'Penumbral lunar eclipse in {sign}',
    },
    stationRetrograde: '{body} stations retrograde in {sign}',
    stationDirect: '{body} stations direct in {sign}',
    aspect: '{a} {aspect} {b}',
  },
  // The (i) after a result, which opens a tip with the exact moment to the second. A chart
  // records whole minutes, so it is cast for a rounded minute; the tip says which, and why.
  // The headline of the tip, and what a screen reader says for the (i).
  exactTitle: 'Exact moment',
  // {time} is the exact time to the second ("03:44:07"), {minute} the minute the chart is
  // cast for ("03:44"), both in Universal Time. Keep it under about 180 characters.
  exactTip: 'The exact moment is {time} UT. A chart holds whole minutes, so it is cast for the nearest one, {minute} UT.',
  // The same for an ingress, where the minute is rounded UP so the chart already shows the
  // body in its new sign. {body} is a planet name and {sign} a zodiac sign ("the chart shows
  // Sun in Aries", as astrologers say it). Keep it under about 180 characters.
  exactTipIngress: 'The exact moment is {time} UT. A chart holds whole minutes; this one is cast for the minute after, {minute} UT, so it shows {body} in {sign}.',
  // Added to the tip in the rare case the app could not load its full ephemeris files and is
  // computing positions with a less precise fallback.
  exactApprox: 'The full ephemeris files did not load, so this moment is approximate.',

  // Suggested chart names, one per kind of event. Shown in the Name field of the new-chart
  // form after a search, until the reader types their own. A chart name lives in a narrow
  // list row, so keep each about as short as the English.
  name: {
    // The Sun entering a sign — the chart astrologers cast for the season or the year
    // ("Aries Ingress 2026" is the March equinox chart). "Ingress" is the astrological term
    // for a body entering a sign; use your language's astrological term.
    sunIngress: '{sign} Ingress {year}',
    // A slow planet (Jupiter to Pluto) entering a sign — once in years, so the year names it.
    ingressYear: '{body} into {sign} {year}',
    // The same, entering the sign while moving backward (retrograde) from the sign after it.
    // "Rx" is the astrologer's retrograde mark; keep it unless astrologers in your language
    // write it differently.
    ingressYearRx: '{body} Rx into {sign} {year}',
    // A fast body (the Moon, Mercury, Venus, Mars) entering a sign — often, so the date names it.
    ingressDated: '{body} into {sign}, {date}',
    // The same, entering while retrograde. "Rx" as above.
    ingressDatedRx: '{body} Rx into {sign}, {date}',
    // The New Moon and the Full Moon, named by the sign the Moon is in.
    newMoon: 'New Moon in {sign} {year}',
    fullMoon: 'Full Moon in {sign} {year}',
    // Eclipses, one complete phrase per type, because the adjective agrees with the noun in
    // many languages. Total / annular / hybrid / partial are the four kinds of solar eclipse
    // (hybrid: total along part of its path, annular along the rest).
    solarEclipse: {
      total: 'Total solar eclipse, {date}',
      annular: 'Annular solar eclipse, {date}',
      hybrid: 'Hybrid solar eclipse, {date}',
      partial: 'Partial solar eclipse, {date}',
    },
    // The three kinds of lunar eclipse (penumbral: the Moon passes only through Earth's
    // faint outer shadow).
    lunarEclipse: {
      total: 'Total lunar eclipse, {date}',
      partial: 'Partial lunar eclipse, {date}',
      penumbral: 'Penumbral lunar eclipse, {date}',
    },
    // A planet's station: the day it appears to stop and turn backward (retrograde) or
    // forward again (direct).
    stationRetrograde: '{body} stations retrograde, {date}',
    stationDirect: '{body} stations direct, {date}',
    // Two planets reaching an exact aspect. {aspect} is one of the aspect words above.
    aspect: '{a} {aspect} {b}, {date}',
  },
} as const;
