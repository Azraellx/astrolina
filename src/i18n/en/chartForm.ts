// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The birth-details form (BirthDataForm.tsx): field labels, placeholders, aria-labels,
// timezone status/notes (the IANA zone name is interpolated as {iana}, not translated),
// birthplace search states, and validation errors.
export const chartForm = {
  // The Person | Event switch at the top of the form (2026-10-20), shown while event
  // charts are available: what kind of moment the chart is. A person's chart is a
  // birth; an event's is a moment in the world — an ingress, a founding, now. Event
  // relabels the fields below (Place, not Birthplace) and drops "Lives now".
  kind: {
    // The switch's accessible name (it is a pair of radio buttons).
    aria: 'Chart kind',
    // The two segments' labels. They sit side by side above the name field, and are
    // checked at the form's narrowest width.
    // @i18n-max 12
    person: 'Person',
    // @i18n-max 12
    event: 'Event',
    // Each segment's hover tip. Under 180 characters.
    personHint: 'A birth chart: a person’s birth moment and birthplace.',
    eventHint: 'A moment in the world rather than a birth — an ingress, a founding, a time you choose. Filed with your event charts.',
    // A line added after eventHint in the Event half's tip while the reader is below the rung
    // event charts need (the half then wears that rung's badge, and a press opens the build's
    // account flow). Neutral, as settings.theme.lockedNote is: the core knows no tier names, and
    // a build that tiers event charts retunes it to say what unlocks them. Never on the open
    // core's screen. It shares the tip with eventHint, so keep the two under 180 characters.
    eventLockedNote: 'Not open to this account yet. Press to see what unlocks it.',
  },
  name: 'Name',
  namePlaceholder: 'Enter a chart name',
  dateLabel: 'Date (Y / M / D)',
  year: 'Year',
  month: 'Month',
  day: 'Day',
  timeLabel: 'Local Time',
  // The (i) beside the Local Time caption. hintBlank is the birth form's version
  // (its time is clearable — blank = unknown); the plain hint serves callers whose
  // moment must stay complete (the timeline's date modal).
  timeInfo: {
    hint: 'Local time at the place, in the 24-hour clock — e.g. 21:30 for 9:30 pm.',
    hintBlank:
      'Local time at the birthplace, in the 24-hour clock — e.g. 21:30 for 9:30 pm. Don’t know the birth time? Leave it blank.',
    // The same (i) on an event chart (2026-10-20): the place is the event's, and the
    // time is the event's.
    hintBlankEvent:
      'Local time at the place, in the 24-hour clock — e.g. 21:30 for 9:30 pm. Don’t know the time? Leave it blank.',
  },
  // Notes under the moment and the zone while the date and time come from a MOMENT
  // (a moment found for the chart) rather than from typing
  // (2026-10-20). The moment is what is kept; the clock shown is that moment read in
  // the zone the form holds.
  instant: {
    // After the minute box while no place is picked yet: the clock shown is
    // Universal Time. The usual abbreviation, which some languages write their own way.
    // @i18n-max 4
    utSuffix: 'UT',
    // Under the date and time, while no place is picked yet.
    utUntilPlace: 'Shown in UT until a place is picked; the time then follows the place’s clock.',
    // Under the date and time once there is a place.
    followsZone: 'Changing the zone moves the clock, not the moment. Type a date or time to set your own.',
    // Under the time zone, when the moment falls in the hour the clocks go back, so
    // the same wall-clock time happens twice. {time} is that time ("01:30"), {offset}
    // the offset written for the moment in force ("UTC−05:00"). The form has stated
    // the zone itself so the chart keeps the moment; this says why the zone now reads
    // as a manual choice.
    overlap: '{time} happens twice here as the clocks go back. The zone is set to {offset} so the chart keeps this moment, not the other {time}.',
    // The same hour after the zone was changed by hand: the zone now in the form
    // reads {time} as the OTHER occurrence. Says what to choose to keep the moment.
    overlapUnfixed: '{time} happens twice here as the clocks go back, and this zone reads it as the other one. Choose {offset} to keep the moment.',
  },
  hour: 'Hour',
  minute: 'Minute',
  // The greyed hints inside the empty date and time boxes, one per box: the letters a
  // reader of this language uses for a date pattern (German writes JJJJ/TT, Spanish
  // AAAA). Keep each as short as the English — the boxes are sized for 4 and 2
  // characters (2026-10-09).
  boxHint: {
    year: 'YYYY',
    month: 'MM',
    day: 'DD',
    hour: 'HH',
    minute: 'MM',
  },
  timeZone: 'Time zone',
  // Shown above the (disabled) moment fields when editing a composite chart.
  compositeMoment:
    'Composite chart: the planets are midpoints of its two parents, and the date below is the synthesized map-frame anchor (kept in sync automatically).',
  tz: {
    // The five ways to give a zone (2026-10-02): the switch's short labels, then
    // each one's full name (its hover headline AND its screen-reader name, since
    // "Standard" alone doesn't say what is being chosen) and what it does.
    modesAria: 'How the time zone is given',
    mode: {
      auto: 'Auto',
      standard: 'Standard',
      offset: 'Offset',
      iana: 'IANA',
      utc: 'UTC',
    },
    modeTip: {
      auto: 'Auto: detected from the birthplace',
      // The event chart's version of `auto` (2026-10-20). Every "…Event" key in this
      // field is one: the line beside it with the event's place ("the place" — the field
      // reads Place there), its date and its time in place of a birth's, kept as short.
      autoEvent: 'Auto: detected from the place',
      standard: 'Standard zone + daylight',
      offset: 'Exact offset',
      iana: 'IANA time zone',
      utc: 'Whole-hour UTC offset',
    },
    modeHint: {
      auto: 'The birthplace’s zone and its daylight-saving rules on the birth date, or its local mean time before standard time began there.',
      // The event chart's version of `auto`: the place's zone, on the event's date.
      autoEvent:
        'The place’s zone and its daylight-saving rules on the event’s date, or its local mean time before standard time began there.',
      standard:
        'A named standard zone plus the daylight correction your source gives, such as EST + daylight or GMT + double summer time.',
      offset:
        'The offset as your source prints it (5hw00, +5:30, 4:56:02 W), this birthplace’s local mean time, or UT.',
      // The event chart's version of `offset`: the place's local mean time.
      offsetEvent:
        'The offset as your source prints it (5hw00, +5:30, 4:56:02 W), this place’s local mean time, or UT.',
      iana: 'Any zone in the time-zone database, found by name, city or abbreviation. Its rules for the birth date give the offset.',
      // The event chart's version of `iana`: the zone's rules for the event's date.
      ianaEvent:
        'Any zone in the time-zone database, found by name, city or abbreviation. Its rules for the event’s date give the offset.',
      utc: 'A fixed whole-hour offset from UTC, with no daylight saving.',
    },
    // The folded field's link (2026-10-05): the same words as the coordinates'
    // link (enterCoords) — the two do the same thing — rather than naming the
    // current state, as "Automatic" did. It also folds the chooser it opened
    // (2026-10-07); the row beside it says what is set.
    setManually: 'Set manually',
    // The radios the link unfolds (2026-10-07, Lina's spec). {zone} is the
    // zone's name as the row prints it: "Eastern Daylight Time · EDT
    // (UTC−04:00)". chooseAuto marks the zone in force; chooseStated is an
    // override the date or place has since moved off the place's own pair, so
    // it still has a row to stay checked on.
    chooseAuto: '{zone} — Automatic',
    chooseStated: '{zone} — Manual override',
    // Trails the row's zone when it was stated rather than looked up: it stays
    // put when the date or place moves.
    manualOverride: 'Manual override',
    // The last radio, with a box beside it. The placeholder is the format the
    // row prints offsets in; the parser also reads 5hw00, 4:56:02 W and UT.
    customLabel: 'Custom offset:',
    customPlaceholder: '−04:00',
    // A typed offset with no sign or letter: the Custom row has no East/West
    // control, so it asks rather than guessing a side.
    offsetDirection: 'Which way from UTC? Add a sign or a letter: −5:30 or +5:30, 5:30 W or 5:30 E.',
    // The ⚠ on an override that no longer fits the place and date (no offset the
    // place's clock read that year, nor its mean time in that era). The override
    // is kept: this flags it, it never reverts it. The title is short because tip
    // titles don't wrap — the sentence overflowed its card on a phone (2026-10-07).
    implausible: 'Check this zone',
    implausibleHint: 'It matches no time this place kept that year. It stays as you set it: check the source, or choose Automatic under Set manually.',
    // The one list the unfolded field shows (2026-10-05), in the app's own
    // dropdown, so each entry has a hover tip. {iana} is the zone's id and
    // {offset} both notations, neither translated. pickSaved names the terms a
    // saved chart reopened in where the list has no entry for them (a zone
    // picked from the tz database, a typed offset, war time…); {terms} is built
    // from the strings here and the catalogue's names.
    pickAuto: 'Automatic — from the birthplace ({iana})',
    // The event chart's version of `pickAuto`: the zone found from the event's place.
    pickAutoEvent: 'Automatic — from the place ({iana})',
    pickLmt: 'Local mean time of the birthplace · {offset}',
    // The event chart's version of `pickLmt`: the place's mean time, not a birthplace's.
    pickLmtEvent: 'Local mean time of the place · {offset}',
    // The same entry while it is unavailable (lmtBeyond says why): on its
    // calendar of the time the birthplace's mean time is past ±15 h.
    pickLmtName: 'Local mean time of the birthplace',
    // The event chart's version of `pickLmtName`: the place, not a birthplace.
    pickLmtNameEvent: 'Local mean time of the place',
    pickUt: 'Universal Time (UT)',
    // The heading over the named zones, partway down the list.
    pickZones: 'Standard and daylight times',
    pickSaved: 'As saved: {terms}',
    pickSavedHint:
      'The terms this chart was saved in. Keep them and saving writes its time zone back exactly as stored.',
    // A saved standard offset that names no zone (an imported file's).
    pickUnnamed: 'Standard time',
    // The named rows' tips: where a standard time is kept ({region} is the
    // catalogue's list of places; {since} is " · from 1946" on a zone that began
    // within living memory, or empty), and what a daylight time adds to which
    // standard time ({zone} "Eastern Standard (EST)", {amount} "+1 h").
    pickStandardHint: 'Standard time, kept in {region}{since}.',
    pickStandardHintBare: 'Standard time{since}.',
    pickDaylightHint: 'Daylight time: {zone}, {amount}.',
    setPlace: 'Set a birthplace to choose a time zone',
    setDate: 'Add the birth date to set the time zone',
    // The same two on an event chart (2026-10-20), where the fields read Place and Date:
    // the line under the time-zone caption while the zone can't be set yet — first with no
    // place, then with a place but no date. The event's place and date, not a birth's.
    setPlaceEvent: 'Set a place to choose a time zone',
    setDateEvent: 'Add the date to set the time zone',
    // Standard zone + daylight. The zone names themselves are catalogue data
    // (lib/atlas/zoneEntry.ts), shown with region and offset, never alone.
    standardLabel: 'Standard zone',
    standardPick: 'Choose a zone…',
    // An imported record can state a standard offset no named zone here has.
    standardUnnamed: 'Standard time, no named zone · {offset}',
    // Trails a current zone that began within living memory (NZST from 1946),
    // so it isn't taken for the right name for an earlier birth.
    standardSince: 'from {year}',
    // Switching in found nothing to preselect: a mean-time birth, or a
    // birthplace whose standard time that year no zone in the list gives
    // (Istanbul in 2000 kept EET, which the list doesn't name for it).
    standardNone:
      'No zone in this list was this birthplace’s standard time on this date. Choose one, or give the offset instead.',
    // The event chart's version of `standardNone`: the event's place.
    standardNoneEvent:
      'No zone in this list was this place’s standard time on this date. Choose one, or give the offset instead.',
    // A daylight correction that takes the total past ±15 h (Line Islands +
    // double summer time). {offset} as "UTC+16:00".
    offsetRange: 'That comes to {offset}, more than 15 hours from UT. Choose another correction.',
    daylightLabel: 'Daylight correction',
    // {amount} is the correction, "+1 h" or "+0:30".
    daylight: {
      standard: 'Standard time',
      daylight: 'Daylight saving {amount}',
      war: 'War time {amount}',
      double: 'Double summer time {amount}',
      half: 'Half-hour daylight {amount}',
    },
    // Exact offset: typed as the source prints it.
    offsetLabel: 'Offset as your source gives it',
    offsetPlaceholder: 'e.g. 5hw00, +5:30, 4:56:02 W',
    // Leads with the ISO form the row prints (2026-10-07); "5hw00" still reads,
    // but is no longer the example a reader is shown.
    offsetUnread:
      'Can’t read that as an offset. Write it as −05:00, +5:30, 4:56:02 W or UT, without decimals.',
    directionAria: 'Direction from Greenwich',
    east: 'E',
    eastTip: 'East of Greenwich',
    eastHint: 'Ahead of UT: 5h E is UTC+5.',
    west: 'W',
    westTip: 'West of Greenwich',
    westHint: 'Behind UT: 5h W is UTC−5.',
    // Why the E/W control is dimmed while the typed text names its own direction.
    directionStated: 'The offset you typed already says which way. Change it there.',
    lmtButton: 'Birthplace LMT',
    // The event chart's version of `lmtButton`: a short button label, the place's LMT.
    lmtButtonEvent: 'Place LMT',
    lmtTip: 'Local mean time of this birthplace',
    // The event chart's version of `lmtTip`: the place, not a birthplace.
    lmtTipEvent: 'Local mean time of this place',
    // {offset} is this birthplace's LMT in both notations.
    lmtHint:
      'Its longitude ÷ 15, to the second: {offset}. For a birth before standard time, or a source that gives LMT.',
    // The event chart's version of `lmtHint`: an event, not a birth, before standard time.
    lmtHintEvent:
      'Its longitude ÷ 15, to the second: {offset}. For an event before standard time, or a source that gives LMT.',
    // The same, for a birthplace across the date line from the reckoning its
    // longitude implies (Alaska before 1867): a whole day added or taken, as
    // detection does, so the birth date means what it meant there.
    lmtHintShifted:
      'Its longitude ÷ 15, to the second, moved a whole day to the calendar kept there then: {offset}.',
    // Why the LMT button is unavailable: on its calendar of the time the
    // birthplace's mean time is past ±15 h (Manila before 1845).
    lmtBeyond: 'On this date that comes to more than 15 hours from UT, past what an offset can state. Automatic gives it.',
    utButton: 'Time is UT',
    utTip: 'The birth time is in UT',
    // The event chart's version of `utTip`: the event's time, not a birth time.
    utTipEvent: 'The time is in UT',
    utHint: 'For a time recorded in Universal Time (GMT): the offset is zero.',
    // The searchable IANA list.
    ianaLabel: 'Search time zones',
    ianaPlaceholder: 'Zone, city or abbreviation',
    ianaNoMatches: 'No time zone matches that.',
    // Read out to screen readers as the list narrows.
    ianaCount: '{count, plural, one {# time zone} other {# time zones}}',
    // Tag on the row for the zone the birthplace resolved to.
    ianaBirthplace: 'Birthplace',
    // The event chart's version of `ianaBirthplace`: the same short tag, for the zone the
    // event's place resolved to.
    ianaBirthplaceEvent: 'Place',
    utcLabel: 'Choose UTC offset',
    utcPick: 'Choose an offset…',
    // Switching into the whole-hour picker from an offset it can't show.
    utcNone:
      'This birth’s offset, {offset}, isn’t a whole hour. Choose one, or give the exact offset instead.',
    // The event chart's version of `utcNone`: the event's offset, not a birth's.
    utcNoneEvent:
      'This event’s offset, {offset}, isn’t a whole hour. Choose one, or give the exact offset instead.',
    // Switching into Exact offset from an offset past ±15 h (a date-line mean time).
    offsetNone:
      'This birth’s offset, {offset}, is more than 15 hours from UT, past what an offset can state. Type one, or switch back to Auto.',
    // The event chart's version of `offsetNone`: the event's offset, not a birth's.
    offsetNoneEvent:
      'This event’s offset, {offset}, is more than 15 hours from UT, past what an offset can state. Type one, or switch back to Auto.',
    // A saved chart whose stored offset its own terms no longer give (older zone
    // data, a file's offset kept on import) reopens on that stored number. The
    // note names the terms it was saved in: Auto, a picked zone ({zone} is its
    // id, not translated), the whole-hour picker, or a recorded entry. {now} is
    // what they would give now, named as the row names a zone: "EDT (UTC−04:00)".
    // (The readback line that sat above this — "09:30 (UTC−4 · 4h W) = 13:30
    // UT" — was retired on 2026-10-07; the 12-hour echo took its job.)
    keptAsSaved: 'Kept as saved. Automatic would now give {now}.',
    keptAsSavedZone: 'Kept as saved. {zone} would now give {now}.',
    keptAsSavedUtc: 'Kept as saved. Its whole-hour offset would now give {now}.',
    keptAsSavedTerms: 'Kept as saved. The terms recorded with it would now give {now}.',
    keptAsSavedUnread: 'Kept as saved. The terms recorded with it can’t be read.',
    composite: 'UT, fixed for a composite chart',
    errorPending: 'Choose a time zone, or switch back to Automatic.',
    errorRange: 'A time zone can’t be more than 15 hours from UT. Choose another correction, or switch back to Automatic.',
    // The ⚠ on the row when the zone data's daylight-saving history for this
    // place and date is doubtful (a lookup's flag; never a stated zone's). Was
    // the words "⚠ verify DST" in a line of their own until 2026-10-07. A
    // local-mean-time birth needs no note of its own any more: the row's name
    // says it ("Local Mean Time · LMT (UTC−04:56:02)").
    verifyDst: 'Verify daylight saving',
    verifyDstHint:
      'The time-zone data is unsure whether daylight saving applied here on this date. Check the zone against the birth record.',
    // The event chart's version of `verifyDstHint`: an event has no birth record, so the
    // check is against whatever source gave its time.
    verifyDstHintEvent:
      'The time-zone data is unsure whether daylight saving applied here on this date. Check the zone against your source.',
  },
  // The 12-hour echo beside the time boxes (2026-10-07, Lina's spec): "21 : 30
  // 9:30 pm", so a "9:30 PM" off a certificate typed as 09:30 has something on
  // screen contradicting it. Never stored and never shown anywhere else — the
  // app's one 12-hour text. {time} is "9:30"; noon is 12:30 pm, midnight 12:30
  // am. `aria` is what the time boxes are described by (the echo is visual).
  timeEcho: {
    am: '{time} am',
    pm: '{time} pm',
    aria: 'In the 12-hour clock: {echo}',
  },
  // The note shown once the user has moved past an EMPTY time (started on the
  // birthplace) — the moment "leave it empty" has already happened, so it says
  // what saving will do, in plain words: the grey "?" mark, planets still shown,
  // the time-dependent lines hidden.
  timeUnknown: {
    hint: 'No birth time will be saved as Unknown. You’ll still see the planets in their signs; on celestial maps, lines and houses need an exact time, so they’ll stay hidden there.',
    // The same note on an event chart (2026-10-20): "the time", not "birth time".
    hintEvent: 'No time will be saved as Unknown. You’ll still see the planets in their signs; on celestial maps, lines and houses need an exact time, so they’ll stay hidden there.',
  },
  // The tag toggle, on its own row after the coordinates since 2026-10-07 (it sat
  // beside the time boxes): a "Tag" caption, then a button whose label is the tag
  // name; its .ui-tip explains what it does. Normally the Star toggle; a
  // chart carrying a system tag shows that instead — 'shared' (link-received) can be
  // removed by pressing it, 'space' (app-generated) is a fixed, informational mark.
  tag: {
    caption: 'Tag',
    label: 'Star',
    assignTitle: 'Favorite this chart',
    assignHint: 'Mark this chart so you can find it easily',
    spaceLabel: 'Space',
    spaceTitle: 'A generated chart',
    spaceHint:
      'Set by the app on charts it generated for you — a composite or Davison chart.',
    sharedLabel: 'Share',
    removeSharedTitle: 'Remove the Share tag',
    removeSharedHint:
      'Added to a chart that arrived through a share link. Click to remove it; you can star the chart afterwards.',
  },
  birthplace: 'Birthplace',
  // The same caption on an event chart (2026-10-20), where the place is where the
  // event is cast: the only place tab it has, since "Lives now" is a person's.
  place: 'Place',
  birthplacePlaceholder: 'City, country',
  searching: 'searching…',
  resolved: '✓ {label}',
  // Where the person lives NOW — optional, and blank simply means "the
  // birthplace". Worth setting on anyone who has moved: the direction-based
  // views can then radiate from where they actually live.
  home: 'Lives now',
  // Said whenever this tab is open, because the tab row makes the two places look
  // like peers and a birthplace IS chart-determining input — so the question this
  // field raises is "will this move my chart?". Answer it before it is asked, and
  // in terms of what the field is FOR. Deliberately names no view: this is read by
  // people who have reached none of them yet.
  homeHint:
    'Nothing here changes the chart — that’s the birth data’s job. This is the starting point for views that measure direction from where someone lives now.',
  // Was "Same as birthplace", which said the two were interchangeable inputs —
  // the very reading the hint above exists to prevent. States the fallback
  // without implying the places are the same kind of thing.
  homeUnset: 'Not set — the birthplace is used instead.',
  // The same fact as a VALUE, for the inline home editor's value slot (which
  // reads "Home: <value> [Set…]" — a sentence would not fit there, and that
  // surface is already explicitly about which point the bearings radiate from,
  // so it never invites the confusion the form's tabs do).
  homeSameAsBirth: 'Same as birthplace',
  homeSet: 'Set…',
  homeChange: 'Change',
  homeCancel: 'Cancel',
  homeClear: 'Clear',
  homePlaceholder: 'Where they live now…',
  homeAria: 'Search for where this person lives now',
  // The small tag at the end of a row offered before anything is typed in a Lives now / Home
  // search box (2026-10-23): the row is the pin the reader has dropped on the map, named by its
  // place. Picking it makes that exact spot the home: the way in for an address no search finds.
  // Sits beside the place name, like the "Home" tag on the chart's home row. One or two words.
  // @i18n-max 14
  homeMapPin: 'Map pin',
  // A quiet line under the results of a Home search in a window beside the map (Local Space,
  // Radar), shown once a search has answered, found or not: the hits can be the wrong places as
  // easily as none. Dropping a pin on the map is clicking (or tapping) it; the pin then shows in
  // this list, before anything is typed, tagged with homeMapPin.
  homeMissHint: 'Not finding it? Drop a pin on the spot on the map, then pick it here.',
  // The same line in the chart form, which covers the map: the reader saves the chart without
  // the place for now, drops the pin, and finds it offered here the next time the form is open.
  homeMissHintForm:
    'Not finding it? Save for now, drop a pin on the spot on the map, and it’s offered here next time.',
  // Group label for the Birthplace / Lives now caption tabs — the two captions
  // above the form's single place box, which pick what that box edits.
  placeTabsAria: 'Which place to edit',
  latitude: 'Latitude',
  longitude: 'Longitude',
  // The coordinates' summary row: one pair in DMS, 40°N55'52" 073°W53'56", as
  // every other surface prints a chart's place (2026-10-07; it showed the
  // decimal latitude and longitude under a label each).
  coordinates: 'Coordinates',
  // Worded like the time zone's link above it (tz.setManually, 2026-10-05):
  // two links, one under the other, doing the same thing.
  enterCoords: 'Set manually',
  errorNoPlace: 'Choose a birthplace from the dropdown.',
  // The same three on an event chart (2026-10-20): the event's place, date and time.
  errorNoPlaceEvent: 'Choose a place from the dropdown.',
  errorNoName: 'Add a name.',
  // The time is optional — leaving it empty marks the birth time unknown.
  errorNoDate: 'Add a birth date.',
  errorNoDateEvent: 'Add the date.',
  errorPartialTime:
    'Add the hour too — or clear the minutes to mark the birth time unknown.',
  errorPartialTimeEvent: 'Add the hour too — or clear the minutes to mark the time unknown.',
  // Tooltip on an out-of-range year box (not auto-corrected), and the matching
  // submit-blocked message. {min}/{max} are the ephemeris data's year range.
  yearRangeTip: 'Our ephemeris data covers {min}–{max}.',
  errorYearRange: 'Enter a year between {min} and {max}.',
  import: 'Import',
  // The folder button beside Add chart: where the chart being saved will land.
  // Starts on the folder the last chart went into.
  folderPicker: {
    tip: 'Choose the folder this chart goes in',
    unfiled: 'Unfiled',
    new: 'New folder',
    // A '/' makes a subfolder, e.g. Clients/2026.
    newPlaceholder: 'Name, or Parent/Child',
  },
  // Free notes about where the birth data came from and how far to trust it.
  // Hidden behind the link until asked for; imports fill it in from whatever
  // the source carried, and then it shows by itself.
  addNotes: '+ Add notes/source',
  notes: 'Notes',
  // Kept short so the box sits flush with the source dropdown beside it.
  notesPlaceholder: 'Where this data came from…',
  // How far the birth data can be trusted — the Rodden-style code, beside the
  // notes because it answers the same question in a form the app can read.
  // Everything on the map hangs off the exact minute, so a certificate and a
  // recollection are not the same kind of chart even when they look alike.
  sourceRating: 'Source',
  // Short glosses, not definitions: a native dropdown shows the SELECTED
  // option's text when shut, so a long one would force the field wide and take
  // the width off the notes box beside it. The full wording is in the help
  // article, which is where someone learning the scale will actually read it.
  rating: {
    unset: 'No rating',
    unsetHint: 'Nobody has said how reliable this birth data is.',
    // The event chart's version of `unsetHint` (2026-10-20): the event's data, not a birth's.
    unsetHintEvent: 'Nobody has said how reliable this data is.',
    AA: 'Birth record',
    A: 'From memory',
    B: 'Biography',
    C: 'Unknown source',
    DD: 'Conflicting',
    X: 'No birth time',
    // The event chart's version of `X` (2026-10-20): the event's time, not a birth time.
    XEvent: 'No time',
    XX: 'Undetermined',
  },
  // The full meaning of each code, revealed as a hover explanation on its row
  // in the dropdown — which is what lets the labels above stay short.
  ratingHint: {
    AA: 'From a birth record: a certificate, or a hospital or state record.',
    A: 'From memory or a news report — quoted by the person, their family, or a friend.',
    B: 'From a biography or autobiography, where no source is given.',
    C: 'The source is unknown, or the time was rectified.',
    DD: 'Conflicting or unverified: accounts that disagree, with nothing to settle them.',
    X: 'No birth time is known.',
    // The event chart's version of `X` (2026-10-20): the event's time, not a birth time.
    XEvent: 'No time is known.',
    XX: 'Undetermined.',
  },
} as const;
