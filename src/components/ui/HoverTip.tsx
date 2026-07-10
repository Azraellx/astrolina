// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import {
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useHoverTip, type TipPlacement, type TipPos } from './useHoverTip';
import { glyphify } from './glyphify';
import { tierLabel } from '../../lib/plan';
import './HoverTip.css';

// Margin kept between a tip and the viewport edge when nudging it back on-screen.
const EDGE_MARGIN = 8;

// The shared .ui-tip card (chrome from index.css), portaled to <body> so no
// panel overflow can clip it. A hotkey, if given, renders as a distinct yellow
// "Hotkey: x" pill below the text. aria-hidden — a sighted convenience; the
// trigger keeps its own accessible name.
export function HoverTip({
  pos,
  placement = 'left',
  title,
  hint,
  hotkey,
  advanced,
  gated,
  className,
}: {
  pos: TipPos | null;
  placement?: TipPlacement;
  title: ReactNode;
  hint?: ReactNode;
  hotkey?: ReactNode;
  /** Show an "ADV" tag on the headline — marks the trigger as an Advanced-only control. */
  advanced?: boolean;
  /** Show the gated-tier tag on the headline (the label a downstream build gives
   *  its top rung via setGatedTierLabel — see lib/plan) — marks the trigger as a
   *  gated-tier control. */
  gated?: boolean;
  /** Extra class on the card — a themed surface (e.g. a dark viewport bar) can
   *  re-skin its tips to match its own chrome instead of the shared card. */
  className?: string;
}) {
  const cardRef = useRef<HTMLSpanElement>(null);

  // Edge-collision avoidance: after the card is placed (anchor + the placement
  // transform), measure it and, if any side spills past the viewport, nudge it back in
  // with the CSS `translate` property — which composes WITH the placement `transform`,
  // so this works for every placement without per-placement flip logic. Done in a
  // layout effect (before paint, so there's no visible jump) and imperatively (no
  // setState → no extra render). Runs on each new position.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el || !pos) return;
    el.style.translate = ''; // measure the natural placement, free of a prior nudge
    const r = el.getBoundingClientRect();
    const m = EDGE_MARGIN;
    let dx = 0;
    let dy = 0;
    if (r.left < m) dx = m - r.left;
    else if (r.right > window.innerWidth - m) dx = window.innerWidth - m - r.right;
    if (r.top < m) dy = m - r.top;
    else if (r.bottom > window.innerHeight - m) dy = window.innerHeight - m - r.bottom;
    if (dx || dy) el.style.translate = `${dx}px ${dy}px`;
  }, [pos]);

  if (!pos) return null;
  const hasHint = hint != null && hint !== '';
  const hasHotkey = hotkey != null && hotkey !== '';
  return createPortal(
    <span
      ref={cardRef}
      className={`ui-tip-box ui-tip hover-tip hover-tip-${placement}${className ? ` ${className}` : ''}`}
      style={{ left: pos.left, top: pos.top }}
      aria-hidden="true"
    >
      <span className="ui-tip-headline">
        <span className={`ui-tip-title${hasHint ? '' : ' ui-tip-title-plain'}`}>
          {title}
        </span>
        {advanced && <span className="ui-tip-adv">ADV</span>}
        {gated && <span className="ui-tip-gated">{tierLabel('gated')}</span>}
        {hasHotkey && <span className="ui-tip-hotkey">{hotkey}</span>}
      </span>
      {/* String hints get their astro symbols re-rendered in the glyph font. */}
      {hasHint && (
        <span className="ui-tip-sub">
          {typeof hint === 'string' ? glyphify(hint) : hint}
        </span>
      )}
    </span>,
    document.body,
  );
}

// A button that reveals its description (and optional hotkey) as the shared
// HoverTip on hover/focus — a drop-in for a native title= tooltip. Defaults to a
// 'bottom' tip, since these are mostly top-bar controls.
export function TipButton({
  tip,
  hint,
  hotkey,
  advanced,
  gated,
  placement = 'bottom',
  tipClassName,
  children,
  ...rest
}: {
  tip: ReactNode;
  hint?: ReactNode;
  hotkey?: string;
  advanced?: boolean;
  gated?: boolean;
  placement?: TipPlacement;
  /** Forwarded to the card (HoverTip className) — lets a themed surface skin its tips. */
  tipClassName?: string;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
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
        hotkey={hotkey}
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
