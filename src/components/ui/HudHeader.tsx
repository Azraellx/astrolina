// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { HTMLAttributes, ReactNode } from 'react';
import { useT } from '../../i18n';
import { useHoverTip } from './useHoverTip';
import { HoverTip, TipButton } from './HoverTip';
import { EyeIcon } from './EyeIcon';
import { ClickIcon } from './ClickIcon';
// Rides the shared floating-window chrome (.location-header / .location-grip / .location-close);
// HudHeader.css only adds the eye-beside-title + corner-X layout on top.
import '../LocationHud/LocationHud.css';
import './HudHeader.css';

// Shared header for the movable tool/view windows (Capture, Local Space). Lays out the drag
// grip + title, then the collapse "eye" RIGHT BESIDE the title, and a close "X" pinned to the
// far corner. The eye collapses the body to a nub WITHOUT leaving; the X calls onClose to exit
// the tool / turn the view off. (Teleport keeps its own header — it has only a close, no eye.)
export function HudHeader({
  title,
  adornment,
  handleProps,
  dragging,
  collapsed,
  onToggleCollapse,
  onClose,
  closeLabel,
  closeHint,
}: {
  /** Usually a plain string; a node lets a window compose its name inline. */
  title: ReactNode;
  /** An optional header slot rendered AFTER the collapse eye — past every fixed
   *  element, so it never shifts the layout. A small transient indicator (e.g. a
   *  busy spinner) or a persistent per-window control (e.g. a toggle button). */
  adornment?: ReactNode;
  /** Drag props from useMovableHud, spread onto the grip. */
  handleProps: Pick<
    HTMLAttributes<HTMLDivElement>,
    'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
  >;
  /** True mid-drag — suppresses the grip's drag tip. */
  dragging: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
  /** Aria + tip title for the close X (e.g. "Close Capture"). */
  closeLabel: string;
  /** Tip hint for the close X. */
  closeHint: string;
}) {
  const { t } = useT();
  // The grip's drag hint, as the shared portaled .ui-tip (so the window frame can't clip it);
  // points up from the header, hidden while dragging.
  const {
    ref: gripRef,
    pos: gripTipPos,
    show: showGripTip,
    hide: hideGripTip,
  } = useHoverTip<HTMLDivElement>('top');

  return (
    <div className="location-header hud-header">
      <div
        className="location-grip"
        {...handleProps}
        ref={gripRef}
        onMouseEnter={showGripTip}
        onMouseLeave={hideGripTip}
      >
        <span className="hud-grip" aria-hidden="true" />
        <span className="location-title">{title}</span>
      </div>
      <HoverTip
        pos={dragging ? null : gripTipPos}
        placement="top"
        title={t('common.hud.dragToMove')}
        hint={
          <span className="hud-dock-line">
            <span className="ui-tip-hotkey hud-dock-key">
              {t('common.hud.dockKey')}
              <ClickIcon className="hud-dock-icon" />
            </span>
            {t('common.hud.recentreHint')}
          </span>
        }
      />
      {/* Collapse eye — sits right beside the title; toggles the body to a nub without leaving. */}
      <TipButton
        type="button"
        className="location-close hud-header-eye"
        placement="top"
        onClick={onToggleCollapse}
        aria-pressed={!collapsed}
        aria-label={t(collapsed ? 'common.hud.expand' : 'common.hud.collapse')}
        tip={t(collapsed ? 'common.hud.expand' : 'common.hud.collapse')}
        hint={t('common.hud.collapseHint')}
      >
        <EyeIcon open={!collapsed} className="location-ls-eye" size={14} />
      </TipButton>
      {adornment}
      {/* The empty stretch between the eye and the X is ALSO a drag handle (shares the grip's
          pointer handlers), so the whole bar — everything but the eye/X buttons — drags, matching
          Teleport / Guides. It also pushes the close X to the far corner. */}
      <div className="hud-header-drag" {...handleProps} aria-hidden="true" />
      {/* Close X — exits the tool / turns the view off entirely. */}
      <TipButton
        type="button"
        className="location-close hud-header-x"
        placement="top"
        onClick={onClose}
        aria-label={closeLabel}
        tip={closeLabel}
        hint={closeHint}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      </TipButton>
    </div>
  );
}
