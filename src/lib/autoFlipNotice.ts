// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Auto-flip notices: the acknowledgement half of a setting the app changed ON THE
// USER'S BEHALF.
//
// Some settings can't coexist, and some readings are only correct in one of them —
// so asking for one thing occasionally moves another. That is legitimate; doing it
// in silence is not. A user who watches the map change and can't connect it to
// anything they did concludes the map is wrong, not that a setting moved.
//
// Two kinds of forcing:
//   - A combination that is VOID (a frame that needs a birth time on a chart with
//     none; a mapping that has no sidereal variant) is never written at all. The
//     stored choice is masked by a derived value and the control shows it
//     unavailable with the reason. Where that mask moves the map in answer to a
//     gesture about something else — a return borrowing the moment's frame, a
//     sidereal zodiac holding a geodetic choice, a chosen theme the reader can no
//     longer draw — it is said here, as a HOLD: nothing was taken away, and it
//     comes back on its own.
//   - A setting genuinely REWRITTEN because an action required it would be
//     announced here too, one-way on purpose: silently undoing it later would move
//     the map again, out of nowhere, which is the same failure one step removed.
//   - (2026-10-09) A DERIVED value can also move with no gesture at all, because
//     what it derives from changed outside the app: the language a reader who never
//     chose one is shown follows their browser's, and moves when a translation into
//     it ships. Nothing is written or held there, but the whole app changed under the
//     reader, so it is said here too ('language-detected').
//
// No kind reports a rewrite now. The last two — 'line-system' (the line system set
// to Celestial to open Local Space, Slide or a tool needing sidereal time) and
// 'closed-for-mundane' (those closed when Geodetic arrived) — were retired on
// 2026-10-02 with that switch: a geodetic map HOLDS what reads the sky's turning
// (lib/skyHold), greyed with its reason, and never moves the line system itself.
// Their ids are retired, not free — a kind that reused one would inherit a dismissal
// given to another sentence ('overlay-frame-held' says why that matters) — and the
// keys they leave in the suppression store below are harmless: nothing reads them.
//
// Suppression is per KIND rather than per trigger: several unrelated actions can
// force the same setting, and a reader who has understood the rule once should not
// be told again because they arrived at it from a different direction.
export type AutoFlipKind =
  /** A dated overlay's frame is HELD on the moment's own sidereal time, because the
   *  reading asked for is only that reading in that frame. Held rather than rewritten:
   *  the borrow lasts as long as the reader stays on the return they snapped to, and the
   *  stored preference is underneath it the whole time.
   *
   *  This replaced a kind named 'overlay-frame' that reported the same map movement as a
   *  REWRITE, which is what it then was. The id changed with the fact rather than the id
   *  being reused, so that anyone who dismissed the old sentence — reasonably, having
   *  understood that their frame was gone — is told the new one once. Nobody should
   *  inherit a silence they agreed to about something else. */
  | 'overlay-frame-held'
  /** The geodetic mapping is merely HELD — a sidereal zodiac has no geodetic variant,
   *  so the map falls back to celestial for as long as that lasts. It was made a kind
   *  of its own beside a rewrite of the same visible change ('line-system', retired
   *  2026-10-02 — see the header), and the reason still stands for any rewrite that
   *  comes: the map changes the same way, but nothing was taken. Telling someone their
   *  setting is gone when it is only waiting is a different (and worse) sentence, and
   *  someone who has understood one of these has not thereby understood the other — so
   *  it carries its own dismissal. */
  | 'line-system-held'
  /** Not a flip — the one DEFAULT here that routinely reads as a bug. This app draws
   *  In Mundo where most others draw In Zodiaco, so a reader cross-checking against
   *  the program they came from finds lines that don't agree and reasonably concludes
   *  one of us is wrong. Said once, when they first open the panel that holds the
   *  control, rather than waiting for them to write in about it. That opening is the
   *  ONLY trigger, deliberately: an explanation nobody asked for is welcome beside the
   *  control it is about and an interruption anywhere else. Saving a first chart used to
   *  open Calculation to deliver it, which met a reader with a settings panel at the one
   *  moment they were waiting to see their own map — so don't route anyone here to say
   *  it. The notice keeps until they arrive on their own. (The union has outgrown its
   *  "auto-flip" name by exactly one member; if a third non-flip notice turns up, rename
   *  the module rather than stretching it further.) */
  | 'line-projection'
  /** A theme option is HELD: chosen, but its row isn't open to the reader right now — a
   *  downstream build's option (lib/extensions/themeOptions) whose entitlement has lapsed
   *  (signed out), at boot or mid-session (a sign-out in another tab). The whole app is
   *  drawn in the last built-in the reader picked, and the stored choice and their spec are
   *  untouched underneath: the Settings row stays, greyed with its reason, and that built-in
   *  carries the radio, because a held choice marks the effective value. Announced only
   *  when that changes what is drawn, and only for a theme that had been on screen — so
   *  the caller's `changed` carries both (App, 2026-10-06; since 2026-10-08 the sign-out
   *  hold alone, the editor's having a kind of its own below).
   *
   *  A kind of its own, not a reuse of either hold above: a different fact about a
   *  different setting, and someone who has understood that a zodiac holds Geodetic has
   *  not thereby understood this. */
  | 'theme-held'
  /** The reader's OWN version of a theme option is HELD: the row is still theirs and still
   *  drawn, but its editor's rung has lapsed (a paid plan ended), so the option draws its
   *  fallback while their own spec waits underneath, untouched, until the rung returns
   *  (lib/themeChoice editsHeld). Announced at that transition, or once at the next boot,
   *  and only when their spec differs from the fallback — otherwise nothing on screen moved.
   *
   *  Not 'theme-held' with another sentence: the reader keeps the option here and loses
   *  only their version of it, and telling them the theme is unavailable — what that kind
   *  says — would be false. Same setting, different fact, so a different kind with its own
   *  dismissal (CLAUDE.md rule 3; 'overlay-frame-held' says why ids are never shared).
   *  (2026-10-08) */
  | 'theme-edits-held'
  /** The app opened in the reader's BROWSER language rather than in English, because a
   *  translation into it has shipped since their last visit (i18n/runtime detectedAtBoot).
   *  Nothing was written and nothing is held: a reader who never chose a language has always
   *  had the app follow their browser's where it could, and it now can. But the whole app
   *  changed language under a returning reader with no gesture of theirs to attribute it to,
   *  which is rule 3's case exactly — so it is said, once, and the card says where to choose.
   *  (2026-10-09)
   *
   *  A flip, not a third non-flip notice (see 'line-projection'): the setting the reader
   *  sees — the language on screen — moved on their behalf. Only its cause is outside the
   *  app. Announced only for an install that had been used before (a first visit was never
   *  in English, so nothing moved for it: App books the kind as seen there instead, so a
   *  first-time reader isn't told on their second visit), and only once the new language is
   *  actually on screen. */
  | 'language-detected'
  /** The reader's chosen language is one translated on their own device (`mt:fr`, the Language
   *  menu's device section, headed "Auto-translated"), and this device can't show it: no translator
   *  here and nothing translated before, or the model gone and only a tap may fetch it again
   *  (i18n/runtime `machineHold`). HELD under rule 2 — the choice stays stored, the app opens in
   *  the detected language or English, and the menu's row stays visible, greyed with its reason
   *  — so the whole app is in another language than the one chosen, with no gesture of the
   *  reader's to account for it. Said once for each held language (heldLanguageRecorded, below).
   *  (2026-10-10)
   *
   *  Its own kind, not 'language-detected' with another sentence: that one reports a language
   *  the reader never chose arriving; this one a language they did choose waiting. Same setting,
   *  different fact (CLAUDE.md rule 3). */
  | 'language-held';

/** Per-kind behaviour. One table rather than parallel maps, so adding a kind is one
 *  edit and can't half-land. */
export interface AutoFlipMeta {
  /** Selectors for the controls that undo or own this. Every one that is ON SCREEN gets
   *  the ring, and the card places itself clear of ALL of them; the first one found takes
   *  the arrow. Empty when there is nothing persistent to point at; a selector that
   *  matches nothing (or matches a collapsed box) drops out the same way.
   *
   *  A LIST rather than one selector because a notice can be about more than one thing at
   *  once, and the single-target version silently failed at that: the card would clear the
   *  control it knew about and land squarely on the one it didn't, which is how the return
   *  chip's ✕ ended up hidden underneath a card that told the reader to press it. Order
   *  them nearest-first if it matters, since the first is what the arrow lands on. */
  targets: readonly string[];
  /** 'warn' for something the app changed on its own; 'info' for something it is
   *  merely telling you. Picks the MARK on the card and nothing else — both wear the
   *  same cool blue, because neither is a failure and a red one was read as one. So a
   *  triangle here is the difference between a report and an explanation, not the
   *  difference between calm and alarmed. */
  tone: 'warn' | 'info';
  /** Suppress after a single showing, without waiting to be asked. True for a
   *  first-run explanation — it is answering a question the reader hasn't asked yet,
   *  so showing it twice is nagging. False for a report of something that just
   *  happened: that one is worth repeating until they say otherwise. */
  once: boolean;
}

// Where the controls each notice is about actually LIVE on screen, as selectors the
// notice can find at the moment it appears. A card that says "the frame control is on
// the timeline bar" while floating at the top of a screen whose timeline bar is at the
// bottom has told the reader nothing they can act on — so when the controls are on
// screen the card anchors clear of them and marks them, and the sentence becomes a label
// for something the eye is already on.
//
// Empty = no persistent control to point at (it lives behind a menu, or in a settings
// section that may well be collapsed). Those keep the neutral position; the copy names
// where to go instead. A selector that matches nothing falls out the same way, which
// is what makes it safe to name a control that isn't always rendered.
export const AUTO_FLIP_META: Record<AutoFlipKind, AutoFlipMeta> = {
  // TWO controls, because the card names two things and both are on screen: the chip in
  // the timeline nub (the record of the hold, and the ✕ that ends it) and the frame
  // segments in the returns row (the setting being held). Chip first — it is the nearer
  // of the two to where the card lands, so the arrow makes the shorter hop, and it is the
  // one the reader has never seen before.
  //
  // Both are always on screen when this fires: the snap that triggers it takes the borrow
  // in the same handler, so the chip renders in the same commit as this card.
  'overlay-frame-held': {
    targets: ['.thud-return-chip', '.thud-frame-seg'],
    tone: 'warn',
    once: false,
  },
  // Points at the Line system control in the Calculation panel, when the sidebar
  // happens to be open on it.
  'line-system-held': {
    targets: ['[data-autoflip="line-system"]'],
    tone: 'warn',
    once: false,
  },
  // Fired by opening the panel this control lives in, so it is guaranteed on screen.
  'line-projection': {
    targets: ['[data-autoflip="line-projection"]'],
    tone: 'info',
    once: true,
  },
  // The greyed option row in Appearance ▸ Theme — the record of the hold, whose tip carries
  // the reason. On screen only while that section is open, which at boot (one of the two
  // moments this fires) it usually isn't; the card then keeps the neutral position, and the
  // copy is written to stand without the ring (i18n/en/autoFlip says why it needs no
  // location clause). Repeats until dismissed: it reports something that just happened.
  'theme-held': {
    targets: ['.theme-option.is-held'],
    tone: 'warn',
    once: false,
  },
  // The option's row, live — not greyed: the row is still the reader's, and its tip's note
  // carries the hold (the option's editsHeldHint). Off screen at boot as often as the one
  // above, with the same copy rule; repeats until dismissed for the same reason.
  'theme-edits-held': {
    targets: ['.theme-option-custom'],
    tone: 'warn',
    once: false,
  },
  // No target: the Language menu sits at the foot of Appearance, in a panel that is usually
  // shut at boot — the one moment this fires — so the card keeps the neutral spot and its copy
  // names the route instead (i18n/en/autoFlip). Warn, because the app changed something the
  // reader didn't. NOT once-only: languages ship one after another, and a reader whose browser
  // asks for two of them changes language twice without choosing either time — the second
  // change is as unattributable as the first. What stops a repeat is the record of WHICH
  // language was last announced (detectedLanguageRecorded, below), so each change is said once
  // and a boot that finds the same language says nothing. (2026-10-09, after review: it was
  // once-per-install, which silenced the second switch.)
  'language-detected': {
    targets: [],
    tone: 'warn',
    once: false,
  },
  // No target, for 'language-detected''s reason: the Language menu (where the greyed row and its
  // reason are) is in a panel shut at boot, the moment this fires; the copy names the route.
  // Warn: the language on screen is not the one chosen. Not once-only: a reader may choose a
  // second device language that is held later; the record of WHICH held language was last
  // announced (heldLanguageRecorded) stops a repeat at every boot of the same hold. (2026-10-10)
  'language-held': {
    targets: [],
    tone: 'warn',
    once: false,
  },
};

const STORAGE_KEY = 'astro:auto-flip-seen:v1';

/** Kinds the user has ticked "Don't show me again" on. Same `{ [kind]: true }` shape
 *  and the same tolerance for a wedged/absent store as the mission sets. */
export function loadSuppressedFlips(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

export function saveSuppressedFlips(suppressed: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(suppressed));
  } catch {
    // Ignore persistence failures (private mode, quota, etc.).
  }
}

// The language the 'language-detected' notice last spoke for — announced to a returning
// reader, or recorded silently on a first visit (which was never in English, so there was no
// change to report). Bookkeeping, never a preference: it says what was already SAID, and the
// next boot announces only a language different from it. (2026-10-09)
const DETECTED_KEY = 'astro:language-detected:v1';

export function detectedLanguageRecorded(): string | null {
  try {
    return localStorage.getItem(DETECTED_KEY);
  } catch {
    return null;
  }
}

export function recordDetectedLanguage(locale: string): void {
  try {
    localStorage.setItem(DETECTED_KEY, locale);
  } catch {
    // Storage blocked: the notice may repeat on the next boot, which beats never saying it.
  }
}

// The held device language the 'language-held' notice last spoke for ('mt:fr'). Bookkeeping like
// the key above, never a preference, and written only when the notice is shown — never on mount:
// it says what was already SAID, so the same hold isn't announced again at every boot, while a
// different held language is. (2026-10-10)
const HELD_KEY = 'astro:language-held:v1';

export function heldLanguageRecorded(): string | null {
  try {
    return localStorage.getItem(HELD_KEY);
  } catch {
    return null;
  }
}

export function recordHeldLanguage(id: string): void {
  try {
    localStorage.setItem(HELD_KEY, id);
  } catch {
    // Storage blocked: the notice may repeat on the next boot, which beats never saying it.
  }
}

// The hold the record spoke for has ENDED (the reader chose another language, or the held one is
// on screen), so the record goes: a later hold of the same language is a new fact and is told
// again, not taken as already said. Removed rather than written empty, so an install whose hold
// has passed carries no trace of it. (2026-10-10)
export function clearHeldLanguage(): void {
  try {
    localStorage.removeItem(HELD_KEY);
  } catch {
    // Storage blocked: nothing was recorded either, so there is nothing to clear.
  }
}
