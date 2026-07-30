// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The card that says a setting just moved and why, with the tick that stops it
// saying so again.
//
// Deliberately NOT a modal backdrop. Every scrim in this app belongs to a surface
// the user navigated to on purpose; this one arrives as a side effect of an action
// taken for an unrelated reason (turning on a tool, opening a view), so taking the
// app hostage over it would punish the wrong gesture. It floats at the guide layer
// instead: impossible to miss, but the map stays live behind it.
//
// It says WHAT changed and stops there. The reasoning lives on the setting's own
// hover tip, where it is still there tomorrow — a paragraph in a card that is
// dismissed in two seconds is a paragraph nobody reads.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { WarningIcon } from '../ui/WarningIcon';
import { AUTO_FLIP_TARGET, type AutoFlipKind } from '../../lib/autoFlipNotice';
import './AutoFlipNotice.css';

/** Gap between the card and the control it points at, and the minimum breathing room
 *  it keeps from the viewport edge. */
const GAP = 12;
const EDGE = 12;

interface Anchor {
  left: number;
  top: number;
  /** Arrow position, in px from the card's own left edge — the card is clamped to
   *  the viewport but the arrow keeps pointing at the real control. */
  arrow: number;
  /** True when the card sits BELOW the control (no room above), which flips the
   *  arrow to the card's top edge. */
  below: boolean;
}

export function AutoFlipNotice({
  kind,
  suppress,
  onSuppressChange,
  onDismiss,
}: {
  kind: AutoFlipKind;
  suppress: boolean;
  onSuppressChange: (v: boolean) => void;
  onDismiss: () => void;
}) {
  const { t } = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  // Find the control this notice is about, park the card next to it, and mark it. In
  // a LAYOUT effect so the move happens before paint — measuring in a passive effect
  // would let the card show up in one place and jump to another.
  useLayoutEffect(() => {
    const selector = AUTO_FLIP_TARGET[kind];
    const target = selector
      ? document.querySelector<HTMLElement>(selector)
      : null;
    const card = cardRef.current;
    // No control on screen (behind a menu, a collapsed panel, a hidden bar): keep the
    // neutral position rather than pointing at nothing. Matching the selector is not
    // enough — a collapsed section is still IN the document, with a zero-size box that
    // would anchor the card to the top-left corner and point confidently at nothing.
    if (!target || !card || !target.getClientRects().length) return;

    target.classList.add('auto-flip-target');

    const place = () => {
      const t0 = target.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      // Above by preference — these controls live on the bottom bar, and a card that
      // covers the thing it is naming would be its own kind of unhelpful.
      const below = t0.top < c.height + GAP + EDGE;
      const centred = t0.left + t0.width / 2 - c.width / 2;
      const left = Math.min(
        Math.max(EDGE, centred),
        Math.max(EDGE, window.innerWidth - c.width - EDGE),
      );
      setAnchor({
        left,
        top: below ? t0.bottom + GAP : t0.top - c.height - GAP,
        // Clamped inside the card's own corners so the arrow never detaches from it.
        arrow: Math.min(Math.max(16, t0.left + t0.width / 2 - left), c.width - 16),
        below,
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      target.classList.remove('auto-flip-target');
    };
  }, [kind]);

  // Escape closes, hand-rolled like every other dismissible surface here (there is
  // no shared hook). Non-capturing: a takeover that owns Escape should get it first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      ref={cardRef}
      className={`auto-flip-notice${anchor ? ' is-anchored' : ''}${
        anchor?.below ? ' is-below' : ''
      }`}
      style={anchor ? { left: anchor.left, top: anchor.top } : undefined}
      role="alertdialog"
      aria-label={t(`autoFlip.${kind}.title`)}
    >
      {anchor && (
        <span
          className="afn-arrow"
          style={{ left: anchor.arrow }}
          aria-hidden="true"
        />
      )}
      {/* The shared heads-up mark (see WarningIcon) — the same one the other
          "something changed / you should know" notices wear, so the class of message
          is recognisable before the sentence is read. */}
      <p className="afn-title">
        <WarningIcon className="afn-icon" />
        {t(`autoFlip.${kind}.title`)}
      </p>
      <p className="afn-body">{t(`autoFlip.${kind}.body`)}</p>
      <div className="afn-actions">
        <label className="afn-suppress">
          <input
            type="checkbox"
            checked={suppress}
            onChange={() => onSuppressChange(!suppress)}
          />
          {t('autoFlip.suppress')}
        </label>
        <button
          type="button"
          className="afn-ok"
          onClick={onDismiss}
          autoFocus
        >
          {t('autoFlip.ok')}
        </button>
      </div>
    </div>
  );
}
