// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The theme CHOICE as pure functions (2026-10-06): what App derives on every render from the
// two stored values and the installed theme option (lib/extensions/themeOptions), what the
// picker's one writer decides, and when the Custom theme's held notice speaks. App calls
// these and nothing else decides them.
//
// Pulled out of App.tsx for one reason: so the HOLD can be tested. App can't be imported
// from Node, and the hold is exactly the kind of state CLAUDE.md rule 2 exists for — a plan
// that lapses must mask the drawn theme while the stored choice and the palette stay put —
// whose failure is silent until a later session. A Pro suite (verify:custom-theme §5) drives
// a real option through a plan change with these.
//
// The shape is rule 2's: two STORED values (the last built-in, and whether the choice is
// Custom — lib/theme says why that takes a key of its own), and everything else DERIVED,
// keeping the plain name `theme` for the effective value so no Record<Theme, …> read changes.
import type { Theme, ThemeChoice } from './theme';
import type { CustomThemeSpec } from './extensions/themeOptions';
import { builtinPalette, type ResolvedPalette } from './themePalette';

export interface ThemeChoiceInput {
  /** Stored: the last built-in theme picked (astro:theme:v1). */
  readonly builtinPref: Theme;
  /** Stored: the choice is Custom (astro:theme-custom:v1). */
  readonly customChosen: boolean;
  /** A theme option is installed (the open core installs none). */
  readonly hasOption: boolean;
  /** The option's ENTITLEMENT (lib/extensions/entitlement isEntitled), not the gated plan
   *  tier: a Pro reader with Advanced off resolves to tier 'new' and keeps their theme. */
  readonly entitled: boolean;
  /** The option's spec, sanitized (readThemeSpec), or null with none. */
  readonly spec: CustomThemeSpec | null;
  /** That spec resolved (lib/themePalette resolvePalette), or null with none. Resolved while
   *  held too, for one question only: whether the hold changes anything visible. */
  readonly specPalette: ResolvedPalette | null;
}

export interface ThemeChoiceState {
  /** Custom is chosen, available and drawn. */
  readonly customLive: boolean;
  /** Custom is chosen and NOT drawable now — the plan lapsed, or there is no option or no
   *  spec here. A standing state: it masks and never writes. */
  readonly customHeld: boolean;
  /** The EFFECTIVE theme — always a built-in: a Custom theme is drawn ON its spec's base,
   *  live or held. */
  readonly theme: Theme;
  /** What the picker shows as chosen: the stored choice, never the effective theme. */
  readonly themeChoice: ThemeChoice;
  /** The palette drawn now: the spec's while live, else the effective built-in's. */
  readonly palette: ResolvedPalette;
  /** Whether holding the spec changes what is drawn (it moves something from its base). A
   *  spec that moves nothing holds nothing, so its notice would be a warning about a no-op. */
  readonly holdChanges: boolean;
}

export function deriveThemeState(i: ThemeChoiceInput): ThemeChoiceState {
  const customLive = i.customChosen && i.hasOption && i.entitled && !!i.spec;
  const customHeld = i.customChosen && !customLive;
  const theme: Theme = i.customChosen ? (i.spec?.base ?? i.builtinPref) : i.builtinPref;
  return {
    customLive,
    customHeld,
    theme,
    themeChoice: i.customChosen ? 'custom' : i.builtinPref,
    palette: customLive && i.specPalette ? i.specPalette : builtinPalette(theme),
    holdChanges: !!i.specPalette && i.specPalette.key !== i.specPalette.base,
  };
}

/** What the picker's one writer does with a pick. Nothing outside it writes either key. */
export type ThemePick =
  /** Nothing happens and nothing is written. */
  | { readonly kind: 'refuse' }
  /** A teaser: the upgrade flow opens (lib/plan nudgeAction); nothing is written. */
  | { readonly kind: 'nudge' }
  /** Choose Custom — the option's onChoose seeds a copy of the theme on screen first, so
   *  choosing it moves nothing by itself; the editor opens on the very first pick only. */
  | { readonly kind: 'custom'; readonly writeChosen: boolean; readonly openEditor: boolean }
  /** Choose a built-in, and close the editor. */
  | { readonly kind: 'builtin'; readonly theme: Theme; readonly clearChosen: boolean };

/**
 * The picker's decision. Three refusals, each a rule:
 *  · Custom without the entitlement is a teaser: the plan picker opens, nothing is written.
 *  · While Custom is HELD the list marks its base — the effective value — and a re-pick of
 *    that marked row would write the masked value over the stored choice, so it is refused
 *    (CLAUDE.md: a control that shows a derived value refuses writes while the mask is up).
 *  · With no option installed, Custom is not a choice at all.
 * `specExists` is whether the option held a spec BEFORE this pick (the first pick seeds one).
 */
export function decideThemePick(
  s: Pick<ThemeChoiceInput, 'hasOption' | 'entitled' | 'customChosen'> &
    Pick<ThemeChoiceState, 'customHeld' | 'theme'>,
  next: ThemeChoice,
  specExists: boolean,
): ThemePick {
  if (next === 'custom') {
    if (!s.hasOption) return { kind: 'refuse' };
    if (!s.entitled) return { kind: 'nudge' };
    return { kind: 'custom', writeChosen: !s.customChosen, openEditor: !specExists };
  }
  if (s.customHeld && next === s.theme) return { kind: 'refuse' };
  return { kind: 'builtin', theme: next, clearChosen: s.customChosen };
}

/** The Customize button: opens the editor only while the custom theme is live (a held one
 *  has nothing to edit on screen); closing is never refused. */
export function toggledThemeEditor(open: boolean, customLive: boolean): boolean {
  return !open && customLive;
}

/** Whether the editor window is mounted: an option installed, the theme live, the window
 *  open (transient, never stored), and no add-on surface owning the viewport. */
export function themeEditorMounted(
  hasOption: boolean,
  customLive: boolean,
  open: boolean,
  viewParked: boolean,
): boolean {
  return hasOption && customLive && open && !viewParked;
}

/** A bookkeeping marker, never a preference: written while a Custom theme is live on this
 *  device, so a later boot that finds it held knows the theme was actually SHOWN here.
 *  Cleared when a hold that changes something is announced. */
export const THEME_SHOWN_MARKER_KEY = 'astro:theme-custom-shown:v1';

export interface HeldNoticeStep {
  /** Call the notice's announce (lib/useAutoFlipNotice) with `changed`. */
  readonly announce: boolean;
  /** The announce's `changed`: false makes it a no-op, by design (rule 3). */
  readonly changed: boolean;
  readonly marker: 'set' | 'clear' | 'keep';
}

/**
 * The held notice ('theme-held'), one step per change of the theme's state. A hold arrives
 * with no gesture of the reader's to hang a notice on — a plan that lapsed while they were
 * away (seen at boot: `was` null), or a sign-out in another tab (seen mid-session: the
 * live → held edge, `was` true) — so it is announced from here, and only when the hold
 * changes what is drawn and the theme was shown on this device. A run of renders while
 * already held (`was` false) says nothing more.
 *
 * `parked`: an add-on surface owns the viewport (lib/extensions/viewLock), where the notice
 * card stands down without consuming the announcement. Then the step announces nothing and
 * KEEPS the marker, so the next boot can still say it — clearing it here would make the one
 * hold that went unseen the one that is never told.
 */
export function heldNoticeStep(
  was: boolean | null,
  s: Pick<ThemeChoiceState, 'customLive' | 'customHeld' | 'holdChanges'>,
  markerSet: boolean,
  parked = false,
): HeldNoticeStep {
  if (s.customLive) return { announce: false, changed: false, marker: 'set' };
  if (!s.customHeld || was === false || (was === null && !markerSet) || (parked && s.holdChanges)) {
    return { announce: false, changed: false, marker: 'keep' };
  }
  // Kept through a hold that changes nothing, so a later boot can still tell one that does.
  return { announce: true, changed: s.holdChanges, marker: s.holdChanges ? 'clear' : 'keep' };
}
