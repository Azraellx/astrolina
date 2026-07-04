// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The movable "Aspect Lines" window (Settings ▸ Advanced ▸ Lines ▸ Aspect Lines ▸
// Filters & orbs) — a gated-tier surface (lib/plan; App gates both the opener and
// the effective filter values). Two sections: display FILTERS for the map's aspect
// lines (quality + axis; per-aspect sextile/trine splits are geometrically
// impossible — see lib/aspectPrefs), and every ASPECT ORB laid out at once. The
// orbs edit the same store as the Advanced tab's compact editor, so the two stay
// in sync for free; they shape the chart wheel + aspect lists (the map's aspect
// lines are exact-angle and take no orb — the section "i" says so).
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ASPECT_NAMES,
  type AspectLineFilters,
  type AspectOrbs,
} from '../../lib/aspectPrefs';
import { ASPECT_GLYPHS, PLANET_GLYPHS } from '../../lib/astro/glyphChars';
import { useT } from '../../i18n';
import { useMovableHud, effectiveCenterX } from '../../lib/useMovableHud';
import { StepperField } from '../Sidebar/Sidebar';
import { HoverTip } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import { EyeIcon } from '../ui/EyeIcon';
import { HudHeader } from '../ui/HudHeader';
// Reuse the overlay bar's chrome (.timeline-hud) + the shared location-window styles
// (.location-* classes), so the window frosts/recolors with the theme for free — and
// the Capture window's small-caps section-heading chrome for the two group labels.
import '../TimelineHud/TimelineHud.css';
import '../LocationHud/LocationHud.css';
import '../CaptureHud/CaptureHud.css';

// Its own saved position (independent of the other floating windows).
const POS_KEY = 'astro:aspectlines-pos:v1';

interface AspectLinesHudProps {
  /** Close the window — wired to the header's X. (The lines themselves stay on;
   *  they're toggled from Settings ▸ Advanced ▸ Lines.) */
  onClose: () => void;
  /** Display filters for the map's aspect lines (see lib/aspectPrefs). */
  filters: AspectLineFilters;
  setFilters: (f: AspectLineFilters) => void;
  /** The shared per-aspect orb store (lib/aspectPrefs) — the same object the
   *  Advanced tab's compact editor writes. */
  aspectOrbs: AspectOrbs;
  setAspectOrbs: (o: AspectOrbs) => void;
}

// A button that reveals a shared .ui-tip (title + hint) on hover/focus — the same
// affordance the Local Space window uses for its toggles.
function AlTipButton({
  className,
  onClick,
  ariaPressed,
  title,
  hint,
  children,
}: {
  className: string;
  onClick: () => void;
  ariaPressed?: boolean;
  title: string;
  hint: string;
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
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </button>
      <HoverTip pos={pos} placement="top" title={title} hint={hint} />
    </>
  );
}

// The circled-"i" beside the Orbs heading: a tap/hover reveals what the orbs
// actually govern (the wheel + aspect lists — the map's lines take no orb).
// tapReveal → a single tap shows it on touch (no long-press, which iOS would
// turn into a text-selection). Chrome comes from the Capture window's
// .capture-hud-info.
function AlSectionInfo({ title, hint }: { title: string; hint: string }) {
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
      <HoverTip pos={pos} placement="top" title={title} hint={hint} />
    </>
  );
}

// The four filter rows, declared as data so the JSX stays one loop. Quality rows
// carry their aspect glyphs (language-neutral, so rendered here, not from i18n).
// No literal space between the harmonious pair — .al-filter-glyphs letter-spacing
// provides the (uniform) gap; a space would double it between the two glyphs.
const FILTER_ROWS: { key: keyof AspectLineFilters; glyphs?: string }[] = [
  { key: 'harmonious', glyphs: `${ASPECT_GLYPHS.sextile}${ASPECT_GLYPHS.trine}` },
  { key: 'challenging', glyphs: ASPECT_GLYPHS.square },
  { key: 'mcAxis' },
  { key: 'ascAxis' },
];

export function AspectLinesHud({
  onClose,
  filters,
  setFilters,
  aspectOrbs,
  setAspectOrbs,
}: AspectLinesHudProps) {
  const { t } = useT();
  // The header eye collapses the window to just its title bar (like the other
  // floating windows) — WITHOUT closing it. Local UI state.
  const [collapsed, setCollapsed] = useState(false);
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef, {
    posKey: POS_KEY,
    floating: true,
    // Centred on the effective centre (half the 280px window), a touch below the
    // Local Space window's default (y 144) so the two don't open exactly stacked.
    initial: () => ({ x: Math.round(effectiveCenterX() - 140), y: 168 }),
  });
  return (
    <div
      ref={hudRef}
      className={`timeline-hud location-hud aspect-lines-hud${dragging ? ' thud-dragging' : ''}${collapsed ? ' is-collapsed' : ''}`}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
    >
      <HudHeader
        title={t('aspectLinesHud.title')}
        handleProps={handleProps}
        dragging={dragging}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onClose={onClose}
        closeLabel={t('aspectLinesHud.closeAria')}
        closeHint={t('aspectLinesHud.closeHint')}
      />

      <div className="location-ls">
        {/* ── Filters ─────────────────────────────────────────────────────────
            Which aspect lines draw. Eye toggles named for the THING they show
            (noun + eye, pressed/eye-open = drawn), like the Local Space window. */}
        <div className="capture-hud-label">{t('aspectLinesHud.filters.label')}</div>
        {FILTER_ROWS.map(({ key, glyphs }) => (
          <AlTipButton
            key={key}
            className={`location-ls-toggle ${filters[key] ? 'on' : 'off'}`}
            onClick={() => setFilters({ ...filters, [key]: !filters[key] })}
            ariaPressed={filters[key]}
            title={t(`aspectLinesHud.${key}.title`)}
            hint={t(`aspectLinesHud.${key}.hint`)}
          >
            <EyeIcon open={filters[key]} className="location-ls-eye" size={14} />
            <span className="location-ls-name">
              {t(`aspectLinesHud.${key}.title`)}
              {glyphs && (
                <span className="astro-glyph al-filter-glyphs" aria-hidden="true">
                  {glyphs}
                </span>
              )}
            </span>
          </AlTipButton>
        ))}

        {/* ── Aspect orbs ─────────────────────────────────────────────────────
            Every orb at once (the Advanced tab's compact editor picks one at a
            time; both write the same store). Ids are al-orb-* — the compact
            editor can be mounted simultaneously, so ids must not collide. */}
        <div className="capture-hud-label capture-hud-label-info">
          <span>{t('aspectLinesHud.orbs.label')}</span>
          <AlSectionInfo
            title={t('aspectLinesHud.orbs.infoTitle')}
            hint={t('aspectLinesHud.orbs.infoHint')}
          />
        </div>
        {ASPECT_NAMES.map((n) => (
          <StepperField
            key={n}
            id={`al-orb-${n}`}
            glyph={ASPECT_GLYPHS[n]}
            label={t(`expandedSidebar.aspect.${n}.name`)}
            value={aspectOrbs.orbs[n]}
            max={15}
            step={0.5}
            onChange={(v) =>
              setAspectOrbs({ ...aspectOrbs, orbs: { ...aspectOrbs.orbs, [n]: v } })
            }
            ariaLabel={t('settings.aspectOrbs.orbAria', {
              aspect: t(`expandedSidebar.aspect.${n}.name`),
            })}
          />
        ))}
        <StepperField
          id="al-orb-luminaries"
          glyph={`${PLANET_GLYPHS.Sun}/${PLANET_GLYPHS.Moon}`}
          label={t('settings.aspectOrbs.lumLabel')}
          value={aspectOrbs.luminaryBonus}
          max={5}
          step={0.5}
          onChange={(v) => setAspectOrbs({ ...aspectOrbs, luminaryBonus: v })}
          ariaLabel={t('settings.aspectOrbs.lumAria')}
        />
        <StepperField
          id="al-orb-declination"
          glyph="∥"
          label={t('settings.aspectOrbs.declinationLabel')}
          value={aspectOrbs.declinationOrb}
          max={3}
          step={0.25}
          onChange={(v) => setAspectOrbs({ ...aspectOrbs, declinationOrb: v })}
          ariaLabel={t('settings.aspectOrbs.declinationAria')}
        />
      </div>
    </div>
  );
}
