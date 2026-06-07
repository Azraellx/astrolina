// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useRef } from 'react';
import type { MissionGesture, MissionSet } from '../../lib/missions';
import type { MsgKey } from '../../i18n/types';
import { useMovableHud } from '../../lib/useMovableHud';
import { TipButton } from '../ui/HoverTip';
import { useT } from '../../i18n';
import './MissionGuide.css';

const MAX_W = 360;

// Default home: top-right, clear of the nav. The panel is movable, so this is just
// where it first appears (and where a double-click on the grip resets it to).
function topRightHome(): { x: number; y: number } {
  const w = Math.min(MAX_W, window.innerWidth - 32);
  return { x: Math.max(16, window.innerWidth - w - 24), y: 80 };
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

// A magnifying-glass icon — used in the subtitle wherever its text carries a "{zoom}"
// token.
function ZoomIcon() {
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
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

// The click icon shown inside a mouse gesture's hotkey pill — the same cursor glyph the
// settings menu uses for its Shift+click tag (Sidebar's ShiftTapTag).
function ClickIcon() {
  return (
    <svg
      className="mg-click-icon"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    </svg>
  );
}

// Each gesture's hotkey-pill content: an optional leading word, the cursor icon, and an
// optional trailing word (words are i18n keys). e.g. shift-drag → "Shift 🖱 Drag".
const GESTURES: Record<
  MissionGesture,
  { beforeKey?: MsgKey; icon?: boolean; afterKey?: MsgKey }
> = {
  double: { beforeKey: 'missions.gesture.double', icon: true },
  right: { beforeKey: 'missions.gesture.right', icon: true },
  hold: { beforeKey: 'missions.gesture.hold', icon: true },
  shift: { beforeKey: 'missions.gesture.shift' },
  click: { beforeKey: 'missions.gesture.click', icon: true },
  'shift-drag': {
    beforeKey: 'missions.gesture.shift',
    icon: true,
    afterKey: 'missions.gesture.drag',
  },
  'ctrl-drag': {
    beforeKey: 'missions.gesture.ctrl',
    icon: true,
    afterKey: 'missions.gesture.drag',
  },
};

interface MissionGuideProps {
  set: MissionSet;
  /** Completed mission ids for this set. */
  completed: ReadonlySet<string>;
  /** Whether the map is in the 3D globe projection — `only3d` missions show as already
   *  satisfied (neutral) when this is false. */
  is3d: boolean;
  onClose: () => void;
}

// The gamified onboarding card: a movable checklist (drag by the top bar) that ticks off
// live as the user performs each gesture. "OK, got it" unlocks only once every mission is
// done; the faint × skips it (the set re-surfaces later until finished). Data-driven off
// the MissionSet, so it renders any set (map basics, measure tool, …) unchanged.
export function MissionGuide({ set, completed, is3d, onClose }: MissionGuideProps) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  // Not persisted: the guide always opens at the top-right home (drag is an in-session
  // convenience only). This keeps its placement consistent — a stale saved position
  // from another viewport would otherwise get clamped to the edge, losing the padding.
  const { pos, dragging, handleProps } = useMovableHud(ref, {
    floating: true,
    initial: topRightHome,
    persist: false,
  });

  // A 3D-only mission is "satisfied" in 2D without being completed (see na below).
  const allDone = set.missions.every(
    (m) => completed.has(m.id) || (!!m.only3d && !is3d),
  );

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
        <div className="mg-drag" {...handleProps}>
          <span className="hud-grip" aria-hidden="true" />
          <span className="mg-title">{t(set.titleKey)}</span>
        </div>
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
            if (token[1] === 'zoom') return <ZoomIcon key={i} />;
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
          const g = GESTURES[m.gesture];
          const state = na ? 'na' : done ? 'done' : '';
          return (
            <li key={m.id} className={`mg-item ${state}`}>
              <span className="mg-check" aria-hidden="true">
                {na || done ? '✓' : '○'}
              </span>
              <span className="mg-label">
                <span className="ui-tip-hotkey mg-gesture">
                  {g.beforeKey && t(g.beforeKey)}
                  {g.icon && <ClickIcon />}
                  {g.afterKey && t(g.afterKey)}
                </span>{' '}
                {t(m.labelKey)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mg-footer">
        <button
          type="button"
          className="mg-ok"
          onClick={onClose}
          disabled={!allDone}
          title={allDone ? undefined : t('missions.okLocked')}
        >
          {t('missions.ok')}
        </button>
      </div>
    </div>
  );
}
