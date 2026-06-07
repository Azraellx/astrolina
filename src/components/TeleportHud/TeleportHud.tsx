// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useRef, useState } from 'react';
import type { PlaceResult } from '../../lib/atlas/cityLookup';
import { useT } from '../../i18n';
import { useMovableHud } from '../../lib/useMovableHud';
import { HoverTip } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
// Reuse the overlay bar's chrome (.timeline-hud + its per-theme overrides), so the
// window frosts/recolors with the theme for free.
import '../TimelineHud/TimelineHud.css';
import './TeleportHud.css';

const POS_KEY = 'astro:teleport-pos:v1';

interface TeleportHudProps {
  /** Fly the map camera to a coordinate at a given zoom (does not pin/relocate). */
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  /** Toggle between the current spot and the one before the last jump. */
  onGoBack: () => void;
  /** Whether (and which way) the back/forward toggle points: 'none' hides it. */
  backState: 'none' | 'back' | 'forward';
  onClose: () => void;
}

// A movable search window that flies the map to any place — type a city, region or
// country and jump straight there (e.g. Oklahoma → Hong Kong) without panning.
// Fully offline: it searches the bundled GeoNames set only (no third-party API), and
// zooms by precision — a country frames wide, a city tight. Camera-only: it doesn't
// move the pin/chart.
export function TeleportHud({
  onFlyTo,
  onGoBack,
  backState,
  onClose,
}: TeleportHudProps) {
  const { t } = useT();
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef, {
    posKey: POS_KEY,
    floating: true,
    // Default centred horizontally, below the top bar + its readout row.
    initial: () => ({ x: Math.round(window.innerWidth / 2 - 160), y: 112 }),
  });
  // The grip's drag hint as the shared .ui-tip (portaled, so it isn't clipped by
  // the window frame); points up from the header, hidden while dragging.
  const {
    ref: gripRef,
    pos: gripTipPos,
    show: showGripTip,
    hide: hideGripTip,
  } = useHoverTip<HTMLDivElement>('top');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The label just jumped to — suppresses re-searching it after a pick.
  const pickedRef = useRef<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced offline search over the bundled GeoNames data (cities + admin-1
  // regions + countries). The dataset is a lazy chunk, so the first search awaits
  // its import; thereafter the lookup is synchronous and sub-millisecond.
  useEffect(() => {
    if (query === pickedRef.current) return;
    if (query.trim().length < 2) {
      // Clearing stale results belongs to this debounced effect (it owns the search
      // lifecycle) and can't be derived during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    let cancelled = false;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      const { searchPlaces } = await import('../../lib/atlas/cityLookup');
      if (cancelled) return;
      const found = searchPlaces(query, 8);
      setResults(found);
      setActiveIdx(found.length ? 0 : -1);
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  const jump = (r: PlaceResult) => {
    onFlyTo(r.lat, r.lng, r.zoom);
    pickedRef.current = r.label;
    setQuery(r.label);
    setResults([]);
    setActiveIdx(-1);
    // Re-select the text so the next keystroke starts a fresh search.
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[activeIdx] ?? results[0];
      if (r) jump(r);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (results.length) setResults([]);
      else onClose();
    }
  };

  return (
    <div
      ref={hudRef}
      className={`timeline-hud teleport-hud${dragging ? ' thud-dragging' : ''}`}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
    >
      <div className="teleport-header">
        <div
          className="teleport-grip"
          {...handleProps}
          ref={gripRef}
          onMouseEnter={showGripTip}
          onMouseLeave={hideGripTip}
        >
          <span className="hud-grip" aria-hidden="true" />
          <span className="teleport-title">{t('teleportHud.title')}</span>
        </div>
        <HoverTip
          pos={dragging ? null : gripTipPos}
          placement="top"
          title={t('common.hud.dragToMove')}
          hint={t('teleportHud.recentreHint')}
        />
        <button
          type="button"
          className="teleport-close"
          onClick={onClose}
          aria-label={t('teleportHud.closeAria')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>

      <div className="teleport-search">
        <svg className="teleport-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="teleport-input"
          value={query}
          onChange={(e) => {
            pickedRef.current = null;
            setQuery(e.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={t('teleportHud.placeholder')}
          spellCheck={false}
          autoComplete="off"
          aria-label={t('teleportHud.searchAria')}
        />
        {searching && <span className="teleport-spinner" aria-hidden="true" />}
      </div>

      {results.length > 0 && (
        <ul className="teleport-results">
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.label}-${r.lat}-${r.lng}-${i}`}>
              <button
                type="button"
                className={`teleport-result${i === activeIdx ? ' active' : ''}`}
                onClick={() => jump(r)}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <span className="teleport-result-main">
                  <span className="teleport-result-label">{r.label}</span>
                  <span className={`teleport-kind teleport-kind-${r.kind}`}>{t(`teleportHud.kind.${r.kind}`)}</span>
                </span>
                <span className="teleport-result-coord">
                  {Math.abs(r.lat).toFixed(1)}°{r.lat >= 0 ? 'N' : 'S'}{' '}
                  {Math.abs(r.lng).toFixed(1)}°{r.lng >= 0 ? 'E' : 'W'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {backState !== 'none' && (
        <div className="teleport-actions">
          <button
            type="button"
            className="teleport-back-btn"
            onClick={onGoBack}
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
        </div>
      )}
    </div>
  );
}
