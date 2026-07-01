// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useRef } from 'react';
import type { MissionGesture, MissionSet } from '../../lib/missions';
import type { MsgKey } from '../../i18n/types';
import { useMovableHud } from '../../lib/useMovableHud';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import { ClickIcon } from '../ui/ClickIcon';
import { TapIcon } from '../ui/TapIcon';
import { DragIcon } from '../ui/DragIcon';
import { PinchIcon } from '../ui/PinchIcon';
import { ZoomIcon } from '../ui/ZoomIcon';
import { isTouchLayout, useTouchLayout } from '../../lib/touch';
import { useT } from '../../i18n';
import type { TFn } from '../../i18n';
import './MissionGuide.css';

// A mission instruction line: any "{drag}" token becomes an inline Drag gesture pill (the same
// .ui-tip-hotkey chrome as the leading gesture pill), the rest renders as text — the label twin of
// the subtitle's icon-token pass, so an instruction can name a second gesture inline (e.g.
// "Click and {drag} to draw a line"). Plain labels (no token) render as a single text span.
function renderLabel(text: string, t: TFn) {
  return text.split(/(\{\w+\})/).map((part, i) => {
    if (part === '{drag}') {
      return (
        <span key={i} className="ui-tip-hotkey mg-gesture">
          <DragIcon className="mg-click-icon" />
          <span>{t('missions.gesture.drag')}</span>
        </span>
      );
    }
    return part ? <span key={i}>{part}</span> : null;
  });
}

const MAX_W = 360;

// Default home: where the panel first appears (and where a double-click on the grip resets it
// to) — it's movable, so this is just the starting spot. On DESKTOP it insets a quarter of the
// viewport from the right so it doesn't crowd the corner. On TOUCH that wastes scarce screen, so
// it hugs the right edge instead. x is floored at 16 so a narrow viewport — where the panel is
// nearly full-width — can't push it off the left edge.
function topRightHome(): { x: number; y: number } {
  const w = Math.min(MAX_W, window.innerWidth - 32);
  const rightGap = isTouchLayout() ? 8 : window.innerWidth * 0.25;
  return {
    x: Math.max(16, window.innerWidth - w - rightGap),
    y: window.innerHeight * 0.25,
  };
}

// The map-pin icon (same teardrop as the sidebar's relocated-chart readout) — used in
// the subtitle wherever its text carries a "{pin}" token.
function PinIcon() {
  return (
    <svg
      className="mg-sub-icon"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// The measure-tool (ruler) icon — same glyph as the nav's Measure button — used in the
// subtitle wherever its text carries a "{ruler}" token.
function RulerIcon() {
  return (
    <svg
      className="mg-sub-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z" />
      <path d="m14.5 12.5 2-2" />
      <path d="m11.5 9.5 2-2" />
      <path d="m8.5 6.5 2-2" />
      <path d="m17.5 15.5 2-2" />
    </svg>
  );
}

// Each gesture's hotkey-pill content: an optional leading word, the cursor icon, and an
// optional trailing word (words are i18n keys). e.g. shift-drag → "Shift 🖱 Drag".
const GESTURES: Record<
  MissionGesture,
  { beforeKey?: MsgKey; icon?: boolean; afterKey?: MsgKey }
> = {
  double: {
    beforeKey: 'missions.gesture.double',
    icon: true,
    afterKey: 'missions.gesture.click',
  },
  right: {
    beforeKey: 'missions.gesture.right',
    icon: true,
    afterKey: 'missions.gesture.click',
  },
  hold: {
    beforeKey: 'missions.gesture.hold',
    icon: true,
    afterKey: 'missions.gesture.drag',
  },
  shift: { beforeKey: 'missions.gesture.hold', afterKey: 'missions.gesture.shift' },
  click: { icon: true, afterKey: 'missions.gesture.click' },
  'shift-drag': {
    beforeKey: 'missions.gesture.shift',
    icon: true,
    afterKey: 'missions.gesture.drag',
  },
  'right-drag': {
    beforeKey: 'missions.gesture.right',
    icon: true,
    afterKey: 'missions.gesture.drag',
  },
  // Touch variants — same shape; the icon renders as the finger TapIcon (chosen at
  // render time by `touch`). e.g. "Double-tap 👆", "Long-press 👆", "Tap 👆 Snap".
  'double-tap': { beforeKey: 'missions.gesture.doubleTap', icon: true },
  'long-press': { beforeKey: 'missions.gesture.longPress', icon: true },
  'touch-drag': { beforeKey: 'missions.gesture.touchDrag', icon: true },
  'two-finger': { beforeKey: 'missions.gesture.twoFinger', icon: true },
  tap: { beforeKey: 'missions.gesture.tap', icon: true },
  pinch: { beforeKey: 'missions.gesture.pinch', icon: true },
  'snap-toggle': { beforeKey: 'missions.gesture.tap', icon: true, afterKey: 'missions.gesture.snap' },
};

interface MissionGuideProps {
  set: MissionSet;
  /** Completed mission ids for this set. */
  completed: ReadonlySet<string>;
  /** Whether the map is in the 3D globe projection — `only3d` missions show as already
   *  satisfied (neutral) when this is false. */
  is3d: boolean;
  onClose: () => void;
  /** Reference mode (opened from View ▸ Guides). The card becomes a glossary you can
   *  browse, so the OK button is always enabled — it just closes — even with missions
   *  still outstanding, and a guide pager may be shown. Off during the normal onboarding
   *  pop-up, where OK stays locked until the set is finished. */
  reference?: boolean;
  /** Guide pager for reference mode: flip through the guides met so far. Rendered to the
   *  left of OK, and only when there's more than one to flip through (so a lone guide
   *  shows no pager). Omitted entirely in the normal pop-up. */
  pager?: {
    index: number;
    count: number;
    onPrev: () => void;
    onNext: () => void;
  };
}

// The gamified onboarding card: a movable checklist (drag by the top bar) that ticks off
// live as the user performs each gesture. "OK, got it" unlocks only once every mission is
// done; the faint × skips it (the set re-surfaces later until finished). Data-driven off
// the MissionSet, so it renders any set (map basics, measure tool, …) unchanged.
export function MissionGuide({
  set,
  completed,
  is3d,
  onClose,
  reference = false,
  pager,
}: MissionGuideProps) {
  const { t } = useT();
  const touch = useTouchLayout();
  const ref = useRef<HTMLDivElement>(null);
  // Not persisted: the guide always opens at the top-right home (drag is an in-session
  // convenience only). This keeps its placement consistent — a stale saved position
  // from another viewport would otherwise get clamped to the edge, losing the padding.
  const { pos, dragging, handleProps } = useMovableHud(ref, {
    floating: true,
    initial: topRightHome,
    persist: false,
  });
  // Move/recentre hint on the drag handle — same shared .ui-tip as the overlay HUDs
  // (the "Double 🖱" pill), but double-click recentres rather than docks (no dock home).
  const {
    ref: dragTipRef,
    pos: dragTipPos,
    show: showDragTip,
    hide: hideDragTip,
  } = useHoverTip<HTMLDivElement>('top');

  // A 3D-only mission is "satisfied" in 2D without being completed (see na below).
  const allDone = set.missions.every(
    (m) => completed.has(m.id) || (!!m.only3d && !is3d),
  );
  // In reference mode OK is just "close", so it's always enabled; in the onboarding
  // pop-up it stays locked until every mission is done.
  const okEnabled = reference || allDone;
  const showPager = reference && !!pager && pager.count > 1;

  // Subtitle: render any "{pin}" / "{ruler}" token inline as its icon, the rest as text.
  const subtitleParts = t(set.subtitleKey).split(/(\{\w+\})/);

  return (
    <div
      className={`mission-guide${dragging ? ' mg-dragging' : ''}`}
      ref={ref}
      role="dialog"
      aria-label={t('missions.guideTitle')}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
    >
      <div className="mg-header">
        <div
          className="mg-drag"
          {...handleProps}
          ref={dragTipRef}
          onMouseEnter={showDragTip}
          onMouseLeave={hideDragTip}
        >
          <span className="hud-grip" aria-hidden="true" />
          <span className="mg-title">{t(set.titleKey)}</span>
        </div>
        {/* The drag-to-recentre hint is hover-driven and uses a cursor + double-click
            affordance that don't exist on touch — hide it there. */}
        {!touch && (
          <HoverTip
            pos={dragging ? null : dragTipPos}
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
        )}
        <TipButton
          type="button"
          className="mg-close"
          onClick={onClose}
          aria-label={t('missions.close')}
          placement="left"
          tip={t('missions.skipTip')}
        >
          ×
        </TipButton>
      </div>

      <p className="mg-subtitle">
        {subtitleParts.map((part, i) => {
          const token = part.match(/^\{(\w+)\}$/);
          if (token) {
            if (token[1] === 'pin') return <PinIcon key={i} />;
            if (token[1] === 'ruler') return <RulerIcon key={i} />;
            if (token[1] === 'zoom') return <ZoomIcon key={i} className="mg-sub-icon" />;
            return null;
          }
          const text = part.trim();
          return text ? <span key={i}>{text}</span> : null;
        })}
      </p>

      <ul className="mg-list">
        {set.missions.map((m) => {
          // Not-applicable: a 3D-only mission while in 2D — shown as already satisfied,
          // but in a neutral state (not the coloured "done") so the set can still finish.
          const na = !!m.only3d && !is3d;
          const done = !na && completed.has(m.id);
          // On touch, swap in the finger-friendly gesture pill + instruction text.
          const gesture = touch ? m.touchGesture ?? m.gesture : m.gesture;
          const labelKey = touch && m.touchLabelKey ? m.touchLabelKey : m.labelKey;
          const g = GESTURES[gesture];
          // Distinct touch icons per gesture family: a pinch glyph, a drag glyph, else
          // the finger tap glyph.
          const TouchIcon =
            gesture === 'pinch'
              ? PinchIcon
              : gesture === 'touch-drag' || gesture === 'two-finger'
                ? DragIcon
                : TapIcon;
          // Desktop: the cursor for click gestures, but the 4-way DRAG glyph for the drag ones
          // (Shift-drag, right-drag, …) so the icon names the ACTION rather than the mouse.
          const DesktopIcon =
            gesture === 'shift-drag' || gesture === 'right-drag' || gesture === 'hold'
              ? DragIcon
              : ClickIcon;
          const state = na ? 'na' : done ? 'done' : '';
          return (
            <li key={m.id} className={`mg-item ${state}`}>
              <span className="mg-check" aria-hidden="true">
                {na || done ? '✓' : '○'}
              </span>
              <span className="mg-label">
                <span className="ui-tip-hotkey mg-gesture">
                  {/* Each word is its own span so the flex gap spaces them even when
                      there's no icon between (e.g. "Hold Shift"). */}
                  {g.beforeKey && <span>{t(g.beforeKey)}</span>}
                  {g.icon &&
                    (touch ? (
                      <TouchIcon className="mg-click-icon" />
                    ) : (
                      <DesktopIcon className="mg-click-icon" />
                    ))}
                  {g.afterKey && <span>{t(g.afterKey)}</span>}
                </span>{' '}
                {renderLabel(t(labelKey), t)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mg-footer">
        {showPager && pager && (
          <div className="mg-pager">
            <button
              type="button"
              className="mg-pager-btn"
              onClick={pager.onPrev}
              disabled={pager.index <= 0}
              aria-label={t('missions.prevGuide')}
            >
              ‹
            </button>
            <span
              className="mg-pager-count"
              aria-live="polite"
              aria-label={t('missions.guidePosition', {
                current: pager.index + 1,
                total: pager.count,
              })}
            >
              {pager.index + 1}/{pager.count}
            </span>
            <button
              type="button"
              className="mg-pager-btn"
              onClick={pager.onNext}
              disabled={pager.index >= pager.count - 1}
              aria-label={t('missions.nextGuide')}
            >
              ›
            </button>
          </div>
        )}
        <button
          type="button"
          className="mg-ok"
          onClick={onClose}
          disabled={!okEnabled}
          title={okEnabled ? undefined : t('missions.okLocked')}
        >
          {t('missions.ok')}
        </button>
      </div>
    </div>
  );
}
