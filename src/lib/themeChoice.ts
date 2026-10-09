// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The theme CHOICE as pure functions (2026-10-06): what App derives on every render from the
// two stored values and the installed theme option (lib/extensions/themeOptions), what the
// picker's one writer decides, what the editor's key does, and when the two holds' notices
// speak. App calls these and nothing else decides them.
//
// Pulled out of App.tsx for one reason: so the HOLDS can be tested. App can't be imported
// from Node, and a hold is exactly the kind of state CLAUDE.md rule 2 exists for — a plan
// that lapses must mask the drawn theme while the stored choice and the spec stay put —
// whose failure is silent until a later session. A Pro suite (verify:custom-theme §5) drives
// a real option through plan changes with these.
//
// The shape is rule 2's: two STORED values (the last built-in, and whether the choice is the
// option — lib/theme says why that takes a key of its own), and everything else DERIVED,
// keeping the plain name `theme` for the effective value so no Record<Theme, …> read changes.
//
// Two rungs since 2026-10-08 (lib/extensions/themeOptions): the option's ROW and its EDITOR
// are entitled apart, so the option draws one of two specs — the reader's OWN (editor
// entitled, and they have one) or the option's FALLBACK (every other reader the row is open
// to) — and there are two holds, each a standing state that writes nothing:
//  · customHeld — chosen, and the row isn't open to this reader (signed out). The app is
//    drawn in the last built-in they picked, and the row stays, greyed with its reason.
//  · editsHeld — the row is open but the editor isn't, and their own spec differs from the
//    fallback: the fallback is drawn, the spec is kept untouched until the editor returns.
// Two facts, so two notice kinds (CLAUDE.md rule 3): someone told their choice is waiting
// for an account has not thereby been told their own version is waiting for the editor.
import type { Theme, ThemeChoice } from './theme';
import type { CustomThemeSpec } from './extensions/themeOptions';
import { builtinPalette, type ResolvedPalette } from './themePalette';

export interface ThemeChoiceInput {
  /** Stored: the last built-in theme picked (astro:theme:v1). */
  readonly builtinPref: Theme;
  /** Stored: the choice is the option (astro:theme-custom:v1). */
  readonly customChosen: boolean;
  /** A theme option is installed (the open core installs none). */
  readonly hasOption: boolean;
  /** The option ROW's entitlement (lib/extensions/entitlement isEntitled on its `tier`),
   *  not the plan tier: a reader with Advanced off resolves to tier 'new' and keeps it. */
  readonly optionEntitled: boolean;
  /** The EDITOR's entitlement (isEntitled on the option's `editorTier`). */
  readonly editorEntitled: boolean;
  /** The reader's own spec, sanitized (readThemeSpec), or null with none. */
  readonly spec: CustomThemeSpec | null;
  /** The option's fallback, sanitized (readFallbackSpec); null only with no option. */
  readonly fallbackSpec: CustomThemeSpec | null;
  /** `spec` resolved (lib/themePalette resolvePalette), or null with none. Resolved while
   *  held too, for one question only: whether a hold changes anything visible. */
  readonly specPalette: ResolvedPalette | null;
  /** `fallbackSpec` resolved, or null with none. */
  readonly fallbackPalette: ResolvedPalette | null;
  /** THEME_OWN_SHOWN_MARKER_KEY is set: the reader's own spec was drawn here and its hold
   *  hasn't been told. Read for one question, and only while signed out: which of the two
   *  specs the sign-out hold took off the screen. Absent reads as false (the fallback). */
  readonly ownShown?: boolean;
}

/** Which spec the option draws for this reader, when it draws one. */
export type ThemeDrawn = 'own' | 'fallback';

export interface ThemeChoiceState {
  /** The option is chosen, open to this reader and drawn (their own spec or the fallback). */
  readonly customLive: boolean;
  /** The option is chosen and its ROW isn't open to this reader (signed out, or no option
   *  installed here). A standing state: it masks and never writes. `theme` is then the last
   *  built-in picked, and the picker's re-pick of that marked row is refused. */
  readonly customHeld: boolean;
  /** Live on the fallback while the reader's own spec — which differs from it — waits for
   *  the editor's rung. A standing state: the spec is never touched. */
  readonly editsHeld: boolean;
  /** What the option draws for this reader: their own spec (editor entitled, and they have
   *  one), the fallback (the row open, or the editor with nothing of theirs yet), or null
   *  (the row isn't open). Meaningful only while the option is chosen. */
  readonly drawn: ThemeDrawn | null;
  /** The EFFECTIVE theme — always a built-in: the drawn spec's base while live, else the
   *  last built-in picked. */
  readonly theme: Theme;
  /** What the picker shows as chosen: the stored choice, never the effective theme. */
  readonly themeChoice: ThemeChoice;
  /** The palette drawn now: the drawn spec's while live, else the effective built-in's. */
  readonly palette: ResolvedPalette;
  /** For 'theme-held': whether the sign-out hold changes what is drawn. While live, would
   *  it (what is drawn differs from the last built-in); while held, did it (what the option
   *  drew here last differs from what is drawn now). False while not chosen. */
  readonly holdChanges: boolean;
  /** For 'theme-edits-held': whether holding the reader's own spec for the fallback changes
   *  what is drawn. While their own is drawn, would it (it differs from the fallback);
   *  while held, true — editsHeld already requires the difference. */
  readonly ownHoldChanges: boolean;
}

export function deriveThemeState(i: ThemeChoiceInput): ThemeChoiceState {
  const open = i.hasOption && i.optionEntitled;
  const drawn: ThemeDrawn | null = open ? (i.editorEntitled && i.spec ? 'own' : 'fallback') : null;
  const drawnSpec = drawn === 'own' ? i.spec : drawn === 'fallback' ? i.fallbackSpec : null;
  const drawnPalette = drawn === 'own' ? i.specPalette : drawn === 'fallback' ? i.fallbackPalette : null;
  const customLive = i.customChosen && !!drawnSpec;
  const customHeld = i.customChosen && !open;
  const editsHeld =
    customLive &&
    !i.editorEntitled &&
    !!i.spec &&
    !!i.specPalette &&
    !!i.fallbackPalette &&
    i.specPalette.key !== i.fallbackPalette.key;
  const theme: Theme = customLive && drawnSpec ? drawnSpec.base : i.builtinPref;
  // What a sign-out hold takes off the screen: while live, what is drawn; while held, what
  // the option drew here last — the reader's own if its marker says it was shown and not yet
  // told held, else the fallback. Compared by key, which is the resolved content, so a theme
  // that draws exactly the built-in it falls back to holds nothing.
  const replaced = customLive
    ? drawnPalette
    : customHeld && i.hasOption
      ? (i.ownShown && i.specPalette) || i.fallbackPalette
      : null;
  return {
    customLive,
    customHeld,
    editsHeld,
    drawn,
    theme,
    themeChoice: i.customChosen ? 'custom' : i.builtinPref,
    palette: customLive && drawnPalette ? drawnPalette : builtinPalette(theme),
    holdChanges: !!replaced && replaced.key !== builtinPalette(i.builtinPref).key,
    ownHoldChanges:
      editsHeld ||
      (customLive &&
        drawn === 'own' &&
        !!i.specPalette &&
        !!i.fallbackPalette &&
        i.specPalette.key !== i.fallbackPalette.key),
  };
}

/** What the picker's one writer does with a pick. Nothing outside it writes either key. */
export type ThemePick =
  /** Nothing happens and nothing is written. */
  | { readonly kind: 'refuse' }
  /** A teaser: the upgrade flow opens (lib/plan nudgeAction); nothing is written. */
  | { readonly kind: 'nudge' }
  /** Choose the option. `seed`: call its onChoose first, so making it the reader's own moves
   *  nothing by itself; `openEditor`: open the editor, which happens with the seed — on an
   *  editor-entitled reader's first pick, never for a reader without the editor. */
  | {
      readonly kind: 'custom';
      readonly writeChosen: boolean;
      readonly seed: boolean;
      readonly openEditor: boolean;
    }
  /** Choose a built-in, and close the editor. */
  | { readonly kind: 'builtin'; readonly theme: Theme; readonly clearChosen: boolean };

/**
 * The picker's decision. Three refusals, each a rule:
 *  · The option without the ROW's entitlement is a teaser: the upgrade flow opens, nothing
 *    is written — a held row too, whose fix is the same.
 *  · While the option is HELD the list marks the effective built-in, and a re-pick of that
 *    marked row would write the masked value over the stored choice, so it is refused
 *    (CLAUDE.md: a control that shows a derived value refuses writes while the mask is up).
 *  · With no option installed, it is not a choice at all.
 * A reader with the row but not the editor chooses the fallback and nothing else: no seed,
 * no editor. `specExists` is whether the reader had a spec of their own BEFORE this pick.
 *
 * And one teaser for the built-ins (2026-10-08), when a build has tiered them
 * (lib/extensions/builtinThemeTiers): a switch TO a built-in this reader's account doesn't
 * reach is a nudge, but the built-in they are DRAWN in is never refused for its tier — it
 * stays theirs, so its re-pick is the plain (no-op) pick it always was. "Drawn" means the
 * option isn't live: while it is, its base is `theme` without being what's on screen.
 * `lock` is absent in the open core, where every built-in is open.
 */
export function decideThemePick(
  s: Pick<ThemeChoiceInput, 'hasOption' | 'optionEntitled' | 'editorEntitled' | 'customChosen'> &
    Pick<ThemeChoiceState, 'customHeld' | 'theme'>,
  next: ThemeChoice,
  specExists: boolean,
  lock?: { readonly entitled: (t: Theme) => boolean; readonly customLive: boolean },
): ThemePick {
  if (next === 'custom') {
    if (!s.hasOption) return { kind: 'refuse' };
    if (!s.optionEntitled) return { kind: 'nudge' };
    const seed = s.editorEntitled && !specExists;
    return { kind: 'custom', writeChosen: !s.customChosen, seed, openEditor: seed };
  }
  if (s.customHeld && next === s.theme) return { kind: 'refuse' };
  if (lock && !lock.entitled(next) && !(next === s.theme && !lock.customLive)) return { kind: 'nudge' };
  return { kind: 'builtin', theme: next, clearChosen: s.customChosen };
}

/** The editor's key (App's Shift C), as one decision so it can be tested beside the picker:
 *  · 'none' — no option, no editor entitlement (the key does nothing below the editor's
 *    rung, the app's rule for every locked key), or an add-on surface owns the viewport;
 *  · 'pick-and-open' — the option isn't the live choice: pick it (the picker's writer, with
 *    its seed), then open the editor;
 *  · 'toggle' — it is live: open or close the editor, as Customize does. */
export type ThemeEditorKey = 'none' | 'pick-and-open' | 'toggle';

export function decideEditorKey(s: {
  readonly hasOption: boolean;
  readonly editorEntitled: boolean;
  readonly customChosen: boolean;
  readonly customLive: boolean;
  readonly parked: boolean;
}): ThemeEditorKey {
  if (!s.hasOption || !s.editorEntitled || s.parked) return 'none';
  return s.customChosen && s.customLive ? 'toggle' : 'pick-and-open';
}

/** The Customize button: opens the editor only while the option is live and the editor is
 *  open to this reader (a held option has nothing to edit on screen, and a reader without
 *  the editor's rung gets the teaser instead); closing is never refused. */
export function toggledThemeEditor(open: boolean, customLive: boolean, editorEntitled: boolean): boolean {
  return !open && customLive && editorEntitled;
}

/** Whether the editor window is mounted: an option installed, the option live, the editor's
 *  rung reached, the window open (transient, never stored), and no add-on surface owning the
 *  viewport. */
export function themeEditorMounted(
  hasOption: boolean,
  customLive: boolean,
  editorEntitled: boolean,
  open: boolean,
  viewParked: boolean,
): boolean {
  return hasOption && customLive && editorEntitled && open && !viewParked;
}

/** The two holds' notice kinds (lib/autoFlipNotice), one marker each. */
export type ThemeHoldKind = 'theme-held' | 'theme-edits-held';

/** A bookkeeping marker, never a preference: written while the option is live on this device
 *  and a sign-out hold would change what is drawn, so a later boot that finds it held knows
 *  something was actually SHOWN here. Cleared when a hold that changes something is
 *  announced. ('theme-held'.) */
export const THEME_SHOWN_MARKER_KEY = 'astro:theme-custom-shown:v1';

/** The same bookkeeping for 'theme-edits-held' (2026-10-08): written while the reader's OWN
 *  spec is drawn here and differs from the fallback, cleared when its hold is announced.
 *  Never a preference — nothing reads it but the notice step and deriveThemeState's
 *  `ownShown`. */
export const THEME_OWN_SHOWN_MARKER_KEY = 'astro:theme-own-shown:v1';

/** The marker a kind's step reads and writes. */
export function heldNoticeMarkerKey(kind: ThemeHoldKind): string {
  return kind === 'theme-held' ? THEME_SHOWN_MARKER_KEY : THEME_OWN_SHOWN_MARKER_KEY;
}

export interface HeldNoticeStep {
  /** Call the notice's announce (lib/useAutoFlipNotice) with `changed`. */
  readonly announce: boolean;
  /** The announce's `changed`: false makes it a no-op, by design (rule 3). */
  readonly changed: boolean;
  readonly marker: 'set' | 'clear' | 'keep';
  /** The kind's marker key (heldNoticeMarkerKey), for the caller's storage write. */
  readonly markerKey: string;
}

/**
 * A hold's notice, one step per change of that hold's state. The rule is one for both kinds
 * (`kind` only picks the marker). A hold arrives with no gesture of the reader's to hang a
 * notice on — a plan that lapsed while they were away (seen at boot: `was` null), or a
 * sign-out in another tab (seen mid-session: `was` false, `nowActive` true) — so it is
 * announced from here, and only when it changes what is drawn and the thing it masks was
 * shown on this device (the marker). A run of renders while already held (`was` true) says
 * nothing more.
 *
 *  · `was` — this hold's `nowActive` on the previous render; null before the first.
 *  · `nowActive` — the hold is up now (customHeld / editsHeld).
 *  · `changes` — the state's holdChanges / ownHoldChanges: while the hold is down, whether
 *    one would change what is drawn (and then the marker is set: the thing is shown); while
 *    it is up, whether it did.
 *
 * `parked`: an add-on surface owns the viewport (lib/extensions/viewLock), where the notice
 * card stands down without consuming the announcement. Then the step announces nothing and
 * KEEPS the marker, so the next boot can still say it — clearing it here would make the one
 * hold that went unseen the one that is never told.
 */
export function heldNoticeStep(
  kind: ThemeHoldKind,
  was: boolean | null,
  nowActive: boolean,
  changes: boolean,
  markerSet: boolean,
  parked = false,
): HeldNoticeStep {
  const markerKey = heldNoticeMarkerKey(kind);
  if (!nowActive) return { announce: false, changed: false, marker: changes ? 'set' : 'keep', markerKey };
  if (was === true || !markerSet || (parked && changes)) {
    return { announce: false, changed: false, marker: 'keep', markerKey };
  }
  // Kept through a hold that changes nothing, so a later boot can still tell one that does.
  return { announce: true, changed: changes, marker: changes ? 'clear' : 'keep', markerKey };
}
