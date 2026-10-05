// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { HTMLAttributes, ReactNode } from 'react';
import './SplitSelect.css';
import { TipButton } from './HoverTip';

// One capsule split into halves, exactly one of them lit — a segmented picker in a
// bubble, for a choice with two short answers and no third.
//
// It exists to buy vertical space: a radio list costs a row per option plus its
// explanation, this costs one row for the pair. That trade only works when the
// options are SHORT and the explanations can live on hover, so both are required
// here rather than optional. Where each option needs its visible own paragraph,
// use the sidebar's HintOption list instead.
//
// Built for a PAIR, which is why the halves divide the width equally. More works —
// the flex basis and the divider rule are count-agnostic — but a 200px sidebar
// runs out of room fast, so check the render before reaching for a third.

export interface SplitSelectOption<V extends string> {
  value: V;
  label: string;
  /** Hover-tip headline and body. A two-word label can't say what the option MEANS
   *  and the capsule has no room to, so this is where that explanation lives. */
  tip: string;
  hint: string;
  /** Shown as the tip's key chip. Suppressed while the option is unavailable — a
   *  key pill on something that won't respond is a lie. */
  hotkey?: ReactNode;
  /** THE standard unavailable state (.ui-inert): an option the current settings have
   *  switched off stays VISIBLE and dimmed rather than disappearing and taking its
   *  explanation with it. The half can't be picked, the stored value underneath is
   *  untouched, and `disabledHint` explains why — naming the setting to change where
   *  there is one, and saying what survives the wait where there is not. */
  disabled?: boolean;
  disabledHint?: string;
}

export function SplitSelect<V extends string>({
  options,
  value,
  onSelect,
  ariaLabel,
  className = '',
  ...rest
}: {
  options: SplitSelectOption<V>[];
  value: V;
  onSelect: (v: V) => void;
  /** Names the GROUP for screen readers — a half only announces its own label,
   *  which is meaningless without the question ("Line system"). */
  ariaLabel: string;
  className?: string;
  // …plus anything else the root div should carry. `data-autoflip` rides in this
  // way: the auto-flip notice finds the control it is reporting on by that
  // attribute, so a control that can be auto-flipped has to be able to wear one.
  // `onSelect` is omitted deliberately: a div has a DOM event by that name, and
  // without the omission ours is intersected with it and stops accepting a value.
} & Omit<HTMLAttributes<HTMLDivElement>, 'onSelect' | 'className' | 'role'>) {
  return (
    <div
      {...rest}
      className={`split-select${className ? ` ${className}` : ''}`}
      // radiogroup rather than a set of aria-pressed toggles: the halves are
      // MUTUALLY EXCLUSIVE, and pressed-buttons would announce a state each half
      // could hold independently of the other, which is the one thing this control
      // must not suggest.
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <TipButton
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          // aria-disabled rather than the native attribute, so the hover tip still
          // fires — an unavailable half whose explanation you can't reach is worse
          // than no half at all.
          aria-disabled={o.disabled || undefined}
          className={`split-select-seg${o.value === value ? ' is-on' : ''}${
            o.disabled ? ' ui-inert' : ''
          }`}
          onClick={o.disabled ? undefined : () => onSelect(o.value)}
          hotkey={o.hotkey}
          note={o.disabled ? o.disabledHint : undefined}
          unavailable={o.disabled}
          // ABOVE, not the sidebar's usual 'left'. A left-opening card is anchored
          // to the half it came from, so from the right half it lands squarely on
          // top of the left one — hovering one option to read what it means would
          // hide the other. Above clears the capsule whichever half is asked.
          placement="top"
          tip={o.tip}
          hint={o.hint}
        >
          {/* The label is its own element so an unavailable half can be struck
              through on hover — the strike is drawn on the LABEL, not the button
              (see the rule in SplitSelect.css). */}
          <span className="split-select-label">{o.label}</span>
        </TipButton>
      ))}
    </div>
  );
}
