// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import {
  useHoverTip,
  useTipEdgeNudge,
  type TipPlacement,
  type TipPos,
} from './useHoverTip';
import { glyphify } from './glyphify';
import { tipMaxWidthStyle } from './tipWidth';
import { tierLabel, tierName, shouldShowTierBadge, type PlanTier } from '../../lib/plan';
import { useT } from '../../i18n';
import './HoverTip.css';

// The shared .ui-tip card (chrome from index.css), portaled to <body> so no
// panel overflow can clip it. A hotkey, if given, renders as a distinct yellow
// "Hotkey: x" pill below the text. aria-hidden — a sighted convenience; the
// trigger keeps its own accessible name.
export function HoverTip({
  pos,
  placement = 'left',
  title,
  hint,
  note,
  hotkey,
  advanced,
  gated,
  unavailable,
  className,
}: {
  pos: TipPos | null;
  placement?: TipPlacement;
  title: ReactNode;
  hint?: ReactNode;
  /** A second line under the hint — why an unavailable control is unavailable (see
   *  .ui-inert), which ADDS to the control's normal explanation rather than
   *  replacing it. Name the setting to change, not just the fact of the block. */
  note?: ReactNode;
  hotkey?: ReactNode;
  /** Show an "ADV" tag on the headline — marks the trigger as an Advanced-only control. */
  advanced?: boolean;
  /** Show the gated-tier tag on the headline (the label a downstream build gives
   *  its top rung via setGatedTierLabel — see lib/plan) — marks the trigger as a
   *  gated-tier control. */
  gated?: boolean;
  /** The control can't be clicked under the current settings: swap the hotkey chip
   *  for the grey .ui-hover badge. A key pill on a control that won't respond would
   *  be a lie, so the two never show together. */
  unavailable?: boolean;
  /** Extra class on the card — a themed surface (e.g. a dark viewport bar) can
   *  re-skin its tips to match its own chrome instead of the shared card. */
  className?: string;
}) {
  const cardRef = useTipEdgeNudge<HTMLSpanElement>(pos);

  if (!pos) return null;
  const hasHint = hint != null && hint !== '';
  const hasHotkey = hotkey != null && hotkey !== '';
  const hasNote = note != null && note !== '';
  return createPortal(
    <span
      ref={cardRef}
      className={`ui-tip-box ui-tip hover-tip hover-tip-${placement}${className ? ` ${className}` : ''}`}
      // Width scales with the copy (see tipWidth) — a long hint would otherwise
      // wrap into a tall skinny column at the old flat cap.
      style={{ left: pos.left, top: pos.top, ...tipMaxWidthStyle(title, hint, note) }}
      aria-hidden="true"
    >
      <span className="ui-tip-headline">
        <span className={`ui-tip-title${hasHint ? '' : ' ui-tip-title-plain'}`}>
          {title}
        </span>
        {advanced && shouldShowTierBadge('adv') && <span className="ui-tip-adv">ADV</span>}
        {gated && shouldShowTierBadge('gated') && (
          <span className="ui-tip-gated">{tierLabel('gated')}</span>
        )}
        {unavailable ? (
          <span className="ui-hover">N/A</span>
        ) : (
          hasHotkey && <span className="ui-tip-hotkey">{hotkey}</span>
        )}
      </span>
      {/* String hints get their astro symbols re-rendered in the glyph font. That makes
          a hint several runs, so a string hint is keyed by its text: one that changes
          while the card is up remounts rather than patching runs a page translator has
          replaced (2026-10-09). */}
      {hasHint && (
        <span className="ui-tip-sub" key={typeof hint === 'string' ? `h:${hint}` : 'h'}>
          {typeof hint === 'string' ? glyphify(hint) : hint}
        </span>
      )}
      {hasNote && (
        <span className="ui-tip-sub ui-tip-note" key={typeof note === 'string' ? `n:${note}` : 'n'}>
          {typeof note === 'string' ? glyphify(note) : note}
        </span>
      )}
    </span>,
    document.body,
  );
}

/** What a locked switch needs to say why: the tier, and the feature's name. */
export type TipLock = { tier: PlanTier; feature: string };

type TipButtonProps = {
  tip: ReactNode;
  hint?: ReactNode;
  /** The unavailable-state second line — see HoverTip's `note`. */
  note?: ReactNode;
  /** ReactNode, not string: a cycling control's chip is a component (ui/CycleHotkey),
   *  and the card has always accepted one. */
  hotkey?: ReactNode;
  advanced?: boolean;
  gated?: boolean;
  /** Swap the hotkey chip for the grey N/A badge — see HoverTip's `unavailable`. */
  unavailable?: boolean;
  placement?: TipPlacement;
  /** Forwarded to the card (HoverTip className) — lets a themed surface skin its tips. */
  tipClassName?: string;
  /** A tier-locked SWITCH: the plan tier it needs, which the reader hasn't reached, and
   *  the feature's name as the control's own UI gives it (its label — the caller passes
   *  it from its own strings). A click, Enter or Space never reaches `onClick` — it shows
   *  the tip, with the reason ("{feature} is a {tier} feature.") as its last line — and
   *  on touch a tap reveals the tip instead of acting. For on/off controls only; a button
   *  or row whose whole job is to open the feature keeps running the build's upgrade flow
   *  (lib/plan's nudgeAction). Safe in a plugin's own React root: the i18n runtime needs
   *  no provider, so the reason is in the reader's language there too. */
  locked?: TipLock;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

// A button that reveals its description (and optional hotkey) as the shared
// HoverTip on hover/focus — a drop-in for a native title= tooltip. Defaults to a
// 'bottom' tip, since these are mostly top-bar controls.
//
// A LOCKED switch renders as its own component rather than as a flag on this one.
// Its touch behaviour differs (a tap reveals instead of acting), and the touch kernel
// binds that once, at mount (useHoverTip's tapReveal). Two component types means the
// lock lifting remounts the button with the binding that matches it, instead of
// leaving a live switch that swallows its own taps.
//
// The split also decides what each form may receive. A locked switch replaces its
// note (with the reason), its hotkey (with none) and its click (with the explanation),
// so those four never reach it — they can't leak onto the element or run by accident.
export function TipButton({
  locked,
  note,
  hotkey,
  unavailable,
  onClick,
  ...shared
}: TipButtonProps) {
  return locked ? (
    <LockedTipButton {...shared} locked={locked} />
  ) : (
    <PlainTipButton
      {...shared}
      note={note}
      hotkey={hotkey}
      unavailable={unavailable}
      onClick={onClick}
    />
  );
}

function PlainTipButton({
  tip,
  hint,
  note,
  hotkey,
  advanced,
  gated,
  unavailable,
  placement = 'bottom',
  tipClassName,
  children,
  ...rest
}: Omit<TipButtonProps, 'locked'>) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>(placement);
  return (
    <>
      <button
        {...rest}
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </button>
      <HoverTip
        pos={pos}
        placement={placement}
        title={tip}
        hint={hint}
        note={note}
        hotkey={hotkey}
        advanced={advanced}
        gated={gated}
        unavailable={unavailable}
        className={tipClassName}
      />
    </>
  );
}

// How long a click keeps a locked switch's tip up after the pointer leaves it. Long
// enough to finish reading the reason line if the hand had already moved on when the
// switch didn't flip; short enough not to sit over whatever the pointer went to next.
const LOCKED_HOLD_MS = 2400;

// A tier's name as a word in a sentence. A build installs its plan names in badge
// capitals because pills draw them, so a name that arrives all-caps is written in
// sentence case ("PRO" → "Pro"); anything else is used exactly as installed.
//
// Both case changes follow the reader's language (2026-10-09). A build installs the names
// from its own catalog, so under Turkish they are Turkish capitals, and the default
// mapping lowercases them wrongly — "I" to "i" where Turkish needs "ı", "İ" to "i" plus a
// stray combining dot. English is unchanged: 'en' has no special casing rules.
function tierWord(tier: PlanTier, lang: string): string {
  const name = tierName(tier) || tierLabel(tier);
  return name && name === name.toLocaleUpperCase(lang)
    ? name.charAt(0) + name.slice(1).toLocaleLowerCase(lang)
    : name;
}

// The locked switch's reason line. TipButton is shared ui that plugins mount in React roots of
// their own, which until 2026-10-09 sat outside <I18nProvider> — useT() threw there, so this
// read the English base catalog directly whenever it found no provider. The i18n runtime is a
// module-level store now, which every root reads alike, so the line follows the
// reader's language wherever the switch is mounted and the English fallback is gone with the
// reason for it.
//
// One sentence shape for every locked switch — "{feature} is a {tier} feature." — the same
// one a build's locked scope chips use, so a reader meets one wording for one situation
// (Salvatore, 2026-10-02; seam L73). It states the fact and stops: no pointer to the plans.
function useLockedReason({ tier, feature }: TipLock): string {
  const { t, lang } = useT();
  const word = tierWord(tier, lang);
  return word
    ? t('common.locked.feature', { feature, tier: word })
    : t('common.locked.featureAnyTier', { feature });
}

// The locked form of TipButton (see its `locked`). Why a switch and not the upgrade
// flow: a switch sits inside something the reader is doing, and a tap on one that won't
// flip asks "why not?". Taking them to the account screen for that loses their place,
// for a question the tier tag and one line of tip answer where they are (Salvatore,
// 2026-10-01 — seam L73). Buttons and menu rows that ARE the feature are an explicit
// ask, and still open the upgrade flow.
//
// It keeps the switch's look entirely (the caller's classes — tier tint, PRO tag — pass
// through), and adds what a control that answers instead of acting needs:
//   • aria-disabled, so assistive tech announces it unavailable, and an accessible
//     DESCRIPTION carrying the reason — the tip card is aria-hidden, and the tier tag on
//     it is the one thing a screen-reader user would otherwise never hear;
//   • click / Enter / Space show the tip and hold it briefly (LOCKED_HOLD_MS) against
//     the pointer leaving — the caller's onClick is never called;
//   • touch reveals on a single tap (tapReveal, the pattern every inert tip trigger
//     uses) and dismisses on the next tap anywhere else. The tap's click is swallowed
//     by the kernel, so nothing toggles there either;
//   • no hotkey chip: a locked feature's key does nothing below the rung, and a pill
//     advertising it would be a lie.
function LockedTipButton({
  tip,
  hint,
  advanced,
  gated,
  placement = 'bottom',
  tipClassName,
  locked,
  children,
  ...rest
}: Omit<TipButtonProps, 'locked' | 'note' | 'hotkey' | 'unavailable' | 'onClick'> & {
  locked: TipLock;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>(placement, {
    tapReveal: true,
  });
  const reason = useLockedReason(locked);
  const reasonId = useId();
  // The click's hold. A mouseleave during it is remembered rather than obeyed, and
  // carried out when the hold runs out; coming back cancels it.
  const holdTimer = useRef<number | null>(null);
  const leftDuringHold = useRef(false);
  useEffect(
    () => () => {
      if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
    },
    [],
  );
  const enter = () => {
    leftDuringHold.current = false;
    show();
  };
  const leave = () => {
    if (holdTimer.current != null) leftDuringHold.current = true;
    else hide();
  };
  const explain = () => {
    enter();
    if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      if (leftDuringHold.current) {
        leftDuringHold.current = false;
        hide();
      }
    }, LOCKED_HOLD_MS);
  };
  return (
    <>
      <button
        {...rest}
        ref={ref}
        aria-disabled="true"
        aria-describedby={reasonId}
        onClick={explain}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        // Focus moving on is deliberate, unlike a hand drifting off: no hold for it,
        // or tabbing along a row would stack two cards.
        onBlur={hide}
      >
        {children}
      </button>
      {/* The description's source. `hidden` keeps it out of the page and the
          accessibility tree, and aria-describedby reads a hidden node it points at
          directly — so it needs no visually-hidden styling. */}
      <span id={reasonId} hidden>
        {reason}
      </span>
      <HoverTip
        pos={pos}
        placement={placement}
        title={tip}
        hint={hint}
        note={reason}
        advanced={advanced}
        gated={gated}
        className={tipClassName}
      />
    </>
  );
}

// The non-button counterpart to TipButton: any inline element that reveals the
// shared HoverTip on hover/focus — a drop-in for a native title= on a <span>
// (truncated names, plain labels). Defaults to a 'bottom' tip.
export function TipSpan({
  tip,
  hint,
  hotkey,
  advanced,
  placement = 'bottom',
  tapReveal,
  tipClassName,
  children,
  ...rest
}: {
  tip: ReactNode;
  hint?: ReactNode;
  hotkey?: ReactNode;
  /** Show an "ADV" tag on the tip headline — marks the trigger as an Advanced-only control. */
  advanced?: boolean;
  placement?: TipPlacement;
  /** Inert triggers only (no click action): reveal the tip on a single TAP on touch,
   *  rather than a long-press — which on iOS raises the text-selection callout over the
   *  glyph/label. Leave off for anything with an action. */
  tapReveal?: boolean;
  /** Forwarded to the card (HoverTip className) — lets a themed surface skin its tips. */
  tipClassName?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLSpanElement>) {
  const { ref, pos, show, hide } = useHoverTip<HTMLSpanElement>(placement, { tapReveal });
  return (
    <>
      <span
        {...rest}
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      <HoverTip
        pos={pos}
        placement={placement}
        title={tip}
        hint={hint}
        hotkey={hotkey}
        advanced={advanced}
        className={tipClassName}
      />
    </>
  );
}
