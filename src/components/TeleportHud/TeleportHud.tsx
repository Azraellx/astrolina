// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { useMovableHud, effectiveCenterX } from '../../lib/useMovableHud';
import { HoverTip } from '../ui/HoverTip';
import { ClickIcon } from '../ui/ClickIcon';
import { PlaceSearchField } from '../ui/PlaceSearchField';
import { useHoverTip } from '../ui/useHoverTip';
// Reuse the overlay bar's chrome (.timeline-hud) + the shared location-window styles
// (.location-* classes), so the window frosts/recolors with the theme for free.
import '../TimelineHud/TimelineHud.css';
import '../LocationHud/LocationHud.css';

// Its own saved position (independent of the Local Space window).
const POS_KEY = 'astro:teleport-pos:v1';
// Zoom used when a picked place carries no framing hint of its own (matches the
// city tier in cityLookup's zoomFor — tight enough to see streets).
const POINT_ZOOM = 11.5;

interface TeleportHudProps {
  /** Fly the map camera to a coordinate at a given zoom (does not pin/relocate). */
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  /** Toggle between the current spot and the one before the last jump. */
  onGoBack: () => void;
  /** Whether (and which way) the back/forward toggle points: 'none' hides it. */
  backState: 'none' | 'back' | 'forward';
  /** Coordinate the next Go back / Return press flies to — shown beside the button
   *  as a rough place name so the user sees where they're about to jump. */
  teleportTarget: { lat: number; lng: number } | null;
  onClose: () => void;
}

// A movable window that flies the map to any place: search a city, region or country
// and jump straight there (e.g. Oklahoma → Hong Kong) without panning, then jump back.
// Fully offline (bundled GeoNames set only, no third-party API), zoomed by precision.
// Camera-only: it doesn't move the pin/chart. (Local Space split off into its own view.)
export function TeleportHud({
  onFlyTo,
  onGoBack,
  backState,
  teleportTarget,
  onClose,
}: TeleportHudProps) {
  const { t } = useT();
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef, {
    posKey: POS_KEY,
    floating: true,
    // Default centred horizontally on the effective centre (shifted right when the
    // expanded sidebar is open, matching the nav/timeline bars), below the top bar.
    initial: () => ({ x: Math.round(effectiveCenterX() - 160), y: 112 }),
  });
  // The grip's drag hint as the shared .ui-tip (portaled, so it isn't clipped by
  // the window frame); points up from the header, hidden while dragging.
  const {
    ref: gripRef,
    pos: gripTipPos,
    show: showGripTip,
    hide: hideGripTip,
  } = useHoverTip<HTMLDivElement>('top');
  // Hover tip for the Go back/forward button — surfaces its Backspace shortcut.
  const {
    ref: backTipRef,
    pos: backTipPos,
    show: showBackTip,
    hide: hideBackTip,
  } = useHoverTip<HTMLButtonElement>('top');

  // Rough place name for the back/forward target (where the next press jumps to).
  const [targetName, setTargetName] = useState<string | null>(null);

  // Resolve the back/forward target to a rough place name (nearest bundled city,
  // generous radius), lazily — reusing the same offline dataset as the search, so
  // the heavy chunk stays out of the main bundle.
  useEffect(() => {
    if (!teleportTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTargetName(null);
      return;
    }
    let cancelled = false;
    import('../../lib/atlas/cityLookup').then(({ nearestCity }) => {
      if (cancelled) return;
      const r = nearestCity(teleportTarget.lat, teleportTarget.lng, 1500);
      setTargetName(r ? r.label : null);
    });
    return () => {
      cancelled = true;
    };
  }, [teleportTarget]);

  return (
    <div
      ref={hudRef}
      className={`timeline-hud location-hud teleport-hud${dragging ? ' thud-dragging' : ''}`}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
    >
      <div className="location-header">
        <div
          className="location-grip"
          {...handleProps}
          ref={gripRef}
          onMouseEnter={showGripTip}
          onMouseLeave={hideGripTip}
        >
          <span className="hud-grip" aria-hidden="true" />
          <span className="location-title">{t('teleportHud.title')}</span>
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
        <button
          type="button"
          className="location-close"
          onClick={onClose}
          aria-label={t('teleportHud.closeAria')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>

      {/* The shared place-search field. Everything a jump needs — cities,
          regions and countries, each carrying the zoom that frames it — plus
          whatever additional scopes are registered. */}
      <PlaceSearchField
        className="teleport-search"
        limit={8}
        keepQueryOnPick
        selectOnPick
        autoFocus
        // The standing groups (a build's own saved/visited places) are as
        // jumpable as any search hit — this is the window for going somewhere.
        library
        kindLabel={(kind) => t(`teleportHud.kind.${kind}`)}
        // A hit with no framing hint is a bare point rather than a region, so
        // arrive close in instead of holding the current world zoom.
        onPick={(hit) => onFlyTo(hit.lat, hit.lng, hit.zoom ?? POINT_ZOOM)}
        onCancel={onClose}
        placeholder={t('teleportHud.placeholder')}
        ariaLabel={t('teleportHud.searchAria')}
        strings={{
          scopeLabel: t('placeSearch.scopeLabel'),
          noMatches: t('placeSearch.noMatches'),
          failed: t('placeSearch.failed'),
          scopeAria: t('placeSearch.scopeAria'),
          more: t('placeSearch.more'),
        }}
      />

      {backState !== 'none' && (
        <div className="location-actions">
          <button
            ref={backTipRef}
            type="button"
            className="location-back-btn"
            onClick={onGoBack}
            onMouseEnter={showBackTip}
            onMouseLeave={hideBackTip}
            onFocus={showBackTip}
            onBlur={hideBackTip}
          >
            <svg
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
              {backState === 'forward' ? (
                <path d="M5 12h14M13 6l6 6-6 6" />
              ) : (
                <path d="M19 12H5M11 6l-6 6 6 6" />
              )}
            </svg>
            <span>{backState === 'forward' ? t('teleportHud.goForward') : t('teleportHud.goBack')}</span>
          </button>
          {targetName && (
            <span className="location-back-target">{targetName}</span>
          )}
          <HoverTip
            pos={backTipPos}
            placement="top"
            title={backState === 'forward' ? t('teleportHud.goForward') : t('teleportHud.goBack')}
            hotkey="Backspace"
          />
        </div>
      )}
    </div>
  );
}
