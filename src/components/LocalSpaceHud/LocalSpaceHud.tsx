// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LsOriginPref } from '../../lib/overlayPrefs';
import { tierMet, shouldShowNudge, nudgeAction, type PlanTier } from '../../lib/plan';
import { useT } from '../../i18n';
import { useMovableHud, effectiveCenterX } from '../../lib/useMovableHud';
import { HoverTip } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import { EyeIcon } from '../ui/EyeIcon';
import { HudHeader } from '../ui/HudHeader';
import { CLOSE_ZOOM } from '../Map/Map';
// Reuse the overlay bar's chrome (.timeline-hud) + the shared location-window styles
// (.location-* classes), so the window frosts/recolors with the theme for free — and
// the Capture window's section-heading + info-"i" chrome for the Capture section below.
import '../TimelineHud/TimelineHud.css';
import '../LocationHud/LocationHud.css';
import '../CaptureHud/CaptureHud.css';

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
  /** Whether the Capture tool is armed (the map frame is up). The Capture section's
   *  options render — and apply — only then; otherwise the section shows just its
   *  heading + explanatory "i". */
  captureActive: boolean;
  /** Capture section: hide the direction arrows riding the local-space lines, for
   *  cleaner linework in the framed export. */
  hideLsArrows: boolean;
  setHideLsArrows: (v: boolean) => void;
  /** Capture section: label the local-space lines like the chart's other lines —
   *  badges hug the frame edges, without the bearing degrees on their faces. */
  lsEdgeLabels: boolean;
  setLsEdgeLabels: (v: boolean) => void;
  /** Capture section: blank the basemap under the lines — the export then keeps a
   *  transparent background (see Map's hideBasemap). */
  hideLsMap: boolean;
  setHideLsMap: (v: boolean) => void;
  /** The user's plan tier (lib/plan) — the whole Capture section above is a
   *  gated-tier surface. */
  planTier: PlanTier;
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

// The circled-"i" beside the Capture section heading: a tap/hover reveals why the
// section may look empty — its options appear only while the Capture tool is armed.
// tapReveal → a single tap shows it on touch (no long-press, which iOS would turn
// into a text-selection). Chrome comes from the Capture window's .capture-hud-info.
// `gated` puts the gated-tier tag on the tip headline — the section-level marker,
// so the individual toggles don't each repeat it.
function LsSectionInfo({ title, hint, gated }: { title: string; hint: string; gated?: boolean }) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>('top', { tapReveal: true });
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="capture-hud-info"
        aria-label={title}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
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
  captureActive,
  hideLsArrows,
  setHideLsArrows,
  lsEdgeLabels,
  setLsEdgeLabels,
  hideLsMap,
  setHideLsMap,
  planTier,
  localSpaceOrigin,
}: LocalSpaceHudProps) {
  const { t } = useT();
  // The whole Capture section belongs to the GATED rung of the plan ladder (lib/plan):
  // live once the user's tier reaches it, a clickable upgrade teaser when the build
  // nudges that rung (any toggle click then opens the upgrade flow instead of changing
  // anything), hidden otherwise — the open core never reaches the gated rung on its
  // own, so it ships hidden there, like every gated-tier control. The section (i)
  // carries the gated-tier tip tag; the eyes read from the EFFECTIVE state (App gates
  // the applied values the same way), so a teased/stale pref never shows an active
  // eye while nothing is actually applied.
  const captureUnlocked = tierMet(planTier, 'gated');
  const captureNudge = !captureUnlocked && shouldShowNudge('gated');
  const effHideLsArrows = captureUnlocked && hideLsArrows;
  const effLsEdgeLabels = captureUnlocked && lsEdgeLabels;
  const effHideLsMap = captureUnlocked && hideLsMap;
  // Route a tier-locked (teaser) click to the upgrade flow instead of the real setter.
  const gatedClick = (fn: () => void) => () => {
    if (!captureUnlocked) {
      nudgeAction();
      return;
    }
    fn();
  };
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
            {(['pin', 'birthplace'] as const).map((o) => (
              <LsTipButton
                key={o}
                className={`location-ls-seg-btn location-ls-seg-${o} ${lsOrigin === o ? 'active' : ''}`}
                onClick={() => setLsOrigin(o)}
                ariaPressed={lsOrigin === o}
                title={t(`localSpaceHud.lsOrigin.${o}`)}
                hint={t(`localSpaceHud.lsOrigin.${o}Hint`)}
              >
                {o === 'pin' ? (
                  <PinOriginLabel label={t('localSpaceHud.lsOrigin.pin')} />
                ) : (
                  t(`localSpaceHud.lsOrigin.${o}`)
                )}
              </LsTipButton>
            ))}
          </div>
        </div>
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

        {/* ── Capture section (gated tier) ────────────────────────────────────
            Export-shaping options, rendered (and applied — App gates the effective
            values the same way) only while the Capture tool is armed, so nothing
            set here can outlive the framing session. The "i" beside the heading
            explains the empty state and carries the gated-tier tip tag. */}
        {(captureUnlocked || captureNudge) && (
          <>
            <div className="capture-hud-label capture-hud-label-info">
              <span>{t('localSpaceHud.capture.label')}</span>
              <LsSectionInfo
                title={t('localSpaceHud.capture.infoTitle')}
                hint={t('localSpaceHud.capture.infoHint')}
                gated
              />
            </div>
            {captureActive && (
              <>
                <LsTipButton
                  className={`location-ls-toggle ${!effHideLsArrows ? 'on' : 'off'}`}
                  onClick={gatedClick(() => setHideLsArrows(!hideLsArrows))}
                  ariaPressed={!effHideLsArrows}
                  title={t('localSpaceHud.hideArrows.title')}
                  hint={t('localSpaceHud.hideArrows.hint')}
                >
                  <EyeIcon open={!effHideLsArrows} className="location-ls-eye" size={14} />
                  <span className="location-ls-name">{t('localSpaceHud.hideArrows.title')}</span>
                </LsTipButton>
                {/* A display-mode switch (not a hide): the eye opens when the standard
                    (ACG-style) labelling is ON, closed for the default origin ring. */}
                <LsTipButton
                  className={`location-ls-toggle ${effLsEdgeLabels ? 'on' : 'off'}`}
                  onClick={gatedClick(() => setLsEdgeLabels(!lsEdgeLabels))}
                  ariaPressed={effLsEdgeLabels}
                  title={t('localSpaceHud.edgeLabels.title')}
                  hint={t('localSpaceHud.edgeLabels.hint')}
                >
                  <EyeIcon open={effLsEdgeLabels} className="location-ls-eye" size={14} />
                  <span className="location-ls-name">{t('localSpaceHud.edgeLabels.title')}</span>
                </LsTipButton>
                <LsTipButton
                  className={`location-ls-toggle ${!effHideLsMap ? 'on' : 'off'}`}
                  onClick={gatedClick(() => setHideLsMap(!hideLsMap))}
                  ariaPressed={!effHideLsMap}
                  title={t('localSpaceHud.hideMap.title')}
                  hint={t('localSpaceHud.hideMap.hint')}
                >
                  <EyeIcon open={!effHideLsMap} className="location-ls-eye" size={14} />
                  <span className="location-ls-name">{t('localSpaceHud.hideMap.title')}</span>
                </LsTipButton>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
