// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LsOriginPref } from '../../lib/overlayPrefs';
import { getLocalSpaceAnchors } from '../../lib/extensions/localSpaceAnchors';
import { useT } from '../../i18n';
import { useMovableHud, effectiveCenterX } from '../../lib/useMovableHud';
import { HoverTip } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import { EyeIcon } from '../ui/EyeIcon';
import { HudHeader } from '../ui/HudHeader';
import { CLOSE_ZOOM } from '../Map/Map';
// Reuse the overlay bar's chrome (.timeline-hud) + the shared location-window styles
// (.location-* classes), so the window frosts/recolors with the theme for free.
import '../TimelineHud/TimelineHud.css';
import '../LocationHud/LocationHud.css';

// Its own saved position (independent of the Teleport window).
const POS_KEY = 'astro:localspace-pos:v1';
// "Fly to origin" lands at the map's CLOSE_ZOOM — the compass is full-size there, and
// it's the threshold that surfaces the map's "Zoom out" button, so you arrive already
// "zoomed in" to the local horizon.
const FLY_TO_ORIGIN_ZOOM = CLOSE_ZOOM;

interface LocalSpaceHudProps {
  /** Close the view entirely (turn Local Space off) — wired to the header's X. */
  onClose: () => void;
  /** Fly the map camera to a coordinate at a given zoom (does not pin/relocate). */
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  lsOrigin: LsOriginPref;
  setLsOrigin: (o: LsOriginPref) => void;
  hideLsInbound: boolean;
  setHideLsInbound: (v: boolean) => void;
  hideLsCompass: boolean;
  setHideLsCompass: (v: boolean) => void;
  /** The point the local-space lines radiate from (pin or birthplace); null when
   *  there's nothing to anchor to — disables "Fly to origin". */
  localSpaceOrigin: { lat: number; lng: number } | null;
}

// The map-pin teardrop (same glyph as elsewhere in the UI) — shown in the "From the
// pin" origin button so the choice reads at a glance. Inherits the button's colour.
function PinIcon() {
  return (
    <svg
      className="location-ls-pin"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// The "From the pin" label with the pin glyph slotted just before its final word
// ("From the [icon] pin"). The text comes from i18n; splitting on the last space keeps
// the words translatable. (The button's tooltip keeps the plain, un-iconified label.)
function PinOriginLabel({ label }: { label: string }) {
  const i = label.lastIndexOf(' ');
  if (i < 0) {
    return (
      <>
        <PinIcon />
        {label}
      </>
    );
  }
  return (
    <>
      {label.slice(0, i)}
      <PinIcon />
      {label.slice(i + 1)}
    </>
  );
}

// A button that reveals a shared .ui-tip (title + hint) on hover/focus — used for the
// origin segmented control, the hide toggles, and "Fly to origin".
function LsTipButton({
  className,
  onClick,
  ariaPressed,
  ariaLabel,
  disabled,
  title,
  hint,
  gated,
  children,
}: {
  className: string;
  onClick: () => void;
  ariaPressed?: boolean;
  /** For icon-only buttons whose children carry no text — gives the button an accessible name. */
  ariaLabel?: string;
  disabled?: boolean;
  title: string;
  hint: string;
  /** Show the gated-tier tag on the tip headline — marks a gated-rung control (lib/plan). */
  gated?: boolean;
  children: ReactNode;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>('top');
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        onClick={onClick}
        aria-pressed={ariaPressed}
        aria-label={ariaLabel}
        disabled={disabled}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </button>
      <HoverTip pos={pos} placement="top" title={title} hint={hint} gated={gated} />
    </>
  );
}

// A movable window hosting the local-space controls: where the lines radiate from
// (pin or birthplace), inbound/compass visibility, and a jump to the origin. The
// window's mere being-open draws the lines — opening it turns Local Space on, closing
// it off — so there's no separate show/hide toggle inside. A trailing Capture section
// holds export-shaping options that live only while the Capture tool is armed.
export function LocalSpaceHud({
  onClose,
  onFlyTo,
  lsOrigin,
  setLsOrigin,
  hideLsInbound,
  setHideLsInbound,
  hideLsCompass,
  setHideLsCompass,
  localSpaceOrigin,
}: LocalSpaceHudProps) {
  const { t } = useT();
  // The header eye collapses the window to just its title bar (like the overlay nubs) to clear
  // screen clutter — WITHOUT closing the tool (close it from the top nav / hotkey). Local UI state.
  const [collapsed, setCollapsed] = useState(false);
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef, {
    posKey: POS_KEY,
    floating: true,
    // Default centred horizontally on the effective centre (half the 280px window),
    // below the top bar — offset a touch from the Teleport window so the two don't
    // open exactly stacked.
    initial: () => ({ x: Math.round(effectiveCenterX() - 140), y: 144 }),
  });
  return (
    <div
      ref={hudRef}
      className={`timeline-hud location-hud local-space-hud${dragging ? ' thud-dragging' : ''}${collapsed ? ' is-collapsed' : ''}`}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
    >
      <HudHeader
        title={t('localSpaceHud.title')}
        handleProps={handleProps}
        dragging={dragging}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onClose={onClose}
        closeLabel={t('localSpaceHud.closeAria')}
        closeHint={t('localSpaceHud.closeHint')}
      />

      <div className="location-ls">
        {/* Top row: the square "Fly to origin" action (icon-only — the tip + aria-label
            carry its name) sits LEFT of the origin segmented control, spanning the
            stacked pair's full height so it reads as the window's primary action.
            The origin buttons keep their shape: where the lines radiate from,
            segmented (two options) rather than a dropdown — reads at a glance. */}
        <div className="location-ls-top">
          <LsTipButton
            className="location-ls-fly location-ls-fly-square"
            onClick={() => {
              if (localSpaceOrigin)
                onFlyTo(localSpaceOrigin.lat, localSpaceOrigin.lng, FLY_TO_ORIGIN_ZOOM);
            }}
            disabled={!localSpaceOrigin}
            ariaLabel={t('localSpaceHud.flyToOrigin.title')}
            title={t('localSpaceHud.flyToOrigin.title')}
            hint={t('localSpaceHud.flyToOrigin.hint')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="7" />
              <path d="M12 1v3" />
              <path d="M12 20v3" />
              <path d="M1 12h3" />
              <path d="M20 12h3" />
              <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
            </svg>
          </LsTipButton>
          <div className="location-ls-seg" role="group">
            <LsTipButton
              className={`location-ls-seg-btn location-ls-seg-pin ${lsOrigin === 'pin' ? 'active' : ''}`}
              onClick={() => setLsOrigin('pin')}
              ariaPressed={lsOrigin === 'pin'}
              title={t('localSpaceHud.lsOrigin.pin')}
              hint={t('localSpaceHud.lsOrigin.pinHint')}
            >
              <PinOriginLabel label={t('localSpaceHud.lsOrigin.pin')} />
            </LsTipButton>
            {/* The FIXED anchors — birthplace + any downstream-registered ones
                (localSpaceAnchors seam; an anchor owns its strings, so no i18n
                lookups) — share one row under the full-width pin button: the
                live pin reads as the primary choice, the fixed points as the
                halves beneath it. */}
            <div className="location-ls-seg-row">
              <LsTipButton
                className={`location-ls-seg-btn location-ls-seg-birthplace ${lsOrigin === 'birthplace' ? 'active' : ''}`}
                onClick={() => setLsOrigin('birthplace')}
                ariaPressed={lsOrigin === 'birthplace'}
                title={t('localSpaceHud.lsOrigin.birthplace')}
                hint={t('localSpaceHud.lsOrigin.birthplaceHint')}
              >
                {t('localSpaceHud.lsOrigin.birthplace')}
              </LsTipButton>
              {getLocalSpaceAnchors().map((a) => (
                <LsTipButton
                  key={a.id}
                  className={`location-ls-seg-btn location-ls-seg-anchor ${lsOrigin === a.id ? 'active' : ''}`}
                  onClick={() => setLsOrigin(a.id)}
                  ariaPressed={lsOrigin === a.id}
                  title={a.tipTitle}
                  hint={a.tipHint}
                >
                  {a.label}
                </LsTipButton>
              ))}
            </div>
          </div>
        </div>
        {/* The selected anchor's inline editor (registered with it), shown only
            while that anchor IS the origin. */}
        {(() => {
          const active = getLocalSpaceAnchors().find(
            (a) => a.id === lsOrigin && a.renderEditor,
          );
          return active ? (
            <div className="location-ls-anchor-editor">{active.renderEditor!()}</div>
          ) : null;
        })()}
        {/* Eye toggles are named for the THING they show (noun + eye): pressed/eye-open
            = drawn — so aria-pressed is the INVERSE of the stored hide-flag. */}
        <LsTipButton
          className={`location-ls-toggle ${!hideLsInbound ? 'on' : 'off'}`}
          onClick={() => setHideLsInbound(!hideLsInbound)}
          ariaPressed={!hideLsInbound}
          title={t('localSpaceHud.hideInbound.title')}
          hint={t('localSpaceHud.hideInbound.hint')}
        >
          <EyeIcon open={!hideLsInbound} className="location-ls-eye" size={14} />
          <span className="location-ls-name">{t('localSpaceHud.hideInbound.title')}</span>
        </LsTipButton>
        <LsTipButton
          className={`location-ls-toggle ${!hideLsCompass ? 'on' : 'off'}`}
          onClick={() => setHideLsCompass(!hideLsCompass)}
          ariaPressed={!hideLsCompass}
          title={t('localSpaceHud.hideCompass.title')}
          hint={t('localSpaceHud.hideCompass.hint')}
        >
          <EyeIcon open={!hideLsCompass} className="location-ls-eye" size={14} />
          <span className="location-ls-name">{t('localSpaceHud.hideCompass.title')}</span>
        </LsTipButton>
      </div>
    </div>
  );
}
