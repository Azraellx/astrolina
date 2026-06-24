// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useRef, useState } from 'react';
import { chartTag, displayName, type StoredChart } from '../../lib/chartLibrary';
import type { RelationshipMethod } from '../../lib/astro/timeline';
import { useMovableHud } from '../../lib/useMovableHud';
import { useOverlayBarGap } from '../../lib/useOverlayBarGap';
import { useT } from '../../i18n';
import type { Formatters } from '../../i18n';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { ClickIcon } from '../ui/ClickIcon';
import { EyeIcon } from '../ui/EyeIcon';
import { TagIcon } from '../ui/TagIcon';
import { useHoverTip } from '../ui/useHoverTip';
import './SynastryHud.css';

// Full date + time, e.g. "14 March 1879 · 11:30".
function fmtDate(c: StoredChart, fmt: Formatters): string {
  return `${c.day} ${fmt.monthName(c.month)} ${c.year} · ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}

// Just the city from a "City, Region, Country" birthplace label — matching how the
// top bar shows the active person's location.
function cityOf(c: StoredChart): string {
  return c.birthplace.label.split(',')[0];
}

interface SynastryHudProps {
  /** The chart currently being compared, or null until one is chosen. */
  partner: StoredChart | null;
  /** Open the regular chart browser to pick/add the comparison partner — the same
   *  add/select flow as the nav, with the active chart excluded (handled by App). */
  onPickPartner: () => void;
  /** The relationship-chart type the Generate button builds. */
  method: RelationshipMethod;
  setMethod: (m: RelationshipMethod) => void;
  /** Build the Davison/Composite chart from the active chart + partner. */
  onGenerate: () => void;
  /** Whether Generate is allowed (a partner is picked and neither chart is itself a
   *  composite — a composite can't parent another relationship chart). */
  canGenerate: boolean;
  /** Why Generate is blocked, driving its tip: no partner, or a composite parent. */
  generateBlock: 'partner' | 'composite' | null;
}

/**
 * Bottom-center HUD for the synastry overlay. Like the timeline bar, it leads with a
 * draggable NUB (grip + "Synastry" + an eye that collapses the body to focus on the
 * map). The body shows the comparison partner and opens the regular chart browser to
 * pick or add one (App routes the choice to the partner slot and excludes the active
 * chart), and hosts the relationship-chart builder (type + Generate).
 */
export function SynastryHud({
  partner,
  onPickPartner,
  method,
  setMethod,
  onGenerate,
  canGenerate,
  generateBlock,
}: SynastryHudProps) {
  const { t, fmt } = useT();
  const [expanded, setExpanded] = useState(true); // nub eye: body shown?
  const ref = useRef<HTMLDivElement>(null);
  // Shares its movable position with the timeline bar (same bottom slot) so the
  // overlay bar stays where the user dragged it across mode switches.
  const { pos, dragging, handleProps } = useMovableHud(ref);
  // Publish this bar's height so the map's zoom-out pill lifts above it on touch.
  useOverlayBarGap(ref);
  // The picker trigger's hover tip — points up (the bar is bottom-docked).
  const {
    ref: tipRef,
    pos: tipPos,
    show: showTip,
    hide: hideTip,
  } = useHoverTip<HTMLButtonElement>('top');

  // Generate's tip explains why it's blocked, or what it does when enabled.
  const generateHint =
    generateBlock === 'composite'
      ? t('synastryHud.generate.compositeParent')
      : !canGenerate
        ? t('synastryHud.generate.needPartner')
        : t('synastryHud.generate.hint');

  return (
    <div
      className={`synastry-hud${dragging ? ' dragging' : ''}${
        expanded ? '' : ' is-collapsed'
      }`}
      ref={ref}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
    >
      {/* Nub: grip + label (+ partner name when set) + the collapse eye. Doubles as
          the move handle — drag to float, release near the dock to snap, double-click
          to dock. The eye stops pointer/double events so it never starts a drag. */}
      <div className="synastry-hud-nub" {...handleProps}>
        <span className="hud-grip" aria-hidden="true" />
        <span className="synastry-hud-nub-label">{t('synastryHud.title')}</span>
        {/* Name the partner on the nub only while COLLAPSED — when expanded it's
            already shown in the picker below, so it'd be redundant there. */}
        {!expanded && partner && (
          <span className="synastry-hud-nub-partner">
            <TagIcon tag={chartTag(partner)} className="tag-icon" />
            {displayName(partner.name)}
          </span>
        )}
        <TipButton
          type="button"
          className="synastry-hud-eye"
          placement="top"
          tip={t(expanded ? 'synastryHud.barToggle.hide' : 'synastryHud.barToggle.show')}
          aria-label={t(expanded ? 'synastryHud.barToggle.hide' : 'synastryHud.barToggle.show')}
          aria-pressed={expanded}
          onClick={() => setExpanded((v) => !v)}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <EyeIcon open={expanded} />
        </TipButton>
        <span className="hud-move-hint ui-tip-box ui-tip" aria-hidden="true">
          <span className="ui-tip-title">{t('common.hud.dragToMove')}</span>
          <span className="ui-tip-sub hud-dock-line">
            <span className="ui-tip-hotkey hud-dock-key">
              {t('common.hud.dockKey')}
              <ClickIcon className="hud-dock-icon" />
            </span>
            {t('common.hud.dockHint')}
          </span>
        </span>
      </div>

      {expanded && (
        <div className="synastry-hud-body">
          {/* The partner display doubles as the picker trigger: a click opens the
              regular chart browser (pick or add a chart) — the choice routes to the
              partner slot, with the active chart excluded. */}
          <div className="synastry-hud-picker">
            <button
              ref={tipRef}
              type="button"
              className="synastry-hud-trigger"
              onClick={() => {
                onPickPartner();
                hideTip();
              }}
              onMouseEnter={showTip}
              onMouseLeave={hideTip}
              onFocus={showTip}
              onBlur={hideTip}
              aria-label={t('synastryHud.chooseComparison')}
            >
              <span className="synastry-hud-label">
                <span className="synastry-hud-name-row">
                  <span className={`synastry-hud-name ${partner ? '' : 'is-prompt'}`}>
                    {partner ? (
                      <>
                        <TagIcon tag={chartTag(partner)} className="tag-icon" />
                        {displayName(partner.name)}
                      </>
                    ) : (
                      t('synastryHud.choosePrompt')
                    )}
                  </span>
                  <svg
                    className="synastry-hud-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {/* closed chart directory — book + ruled lines */}
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
                    <path d="M8 7h8" />
                    <path d="M8 11h8" />
                  </svg>
                </span>
                {partner && (
                  <span className="synastry-hud-meta">
                    {fmtDate(partner, fmt)} · {cityOf(partner)}
                  </span>
                )}
              </span>
            </button>
            <HoverTip pos={tipPos} placement="top" title={t('synastryHud.chooseComparison')} />
          </div>

          {/* Relationship-chart builder: a compact type toggle (Davison /
              Composite) + Generate, relocated from Settings. Generate is disabled
              without a partner, or when either chart is itself a composite. */}
          <span className="synastry-hud-divider" />
          <div className="synastry-hud-build">
            <span className="synastry-hud-build-label">
              {t('synastryHud.method.label')}
            </span>
            <span className="synastry-hud-methods" role="group">
              {(['davison', 'composite'] as const).map((m) => (
                <TipButton
                  key={m}
                  type="button"
                  className={`synastry-hud-method${method === m ? ' on' : ''}`}
                  placement="top"
                  tip={t(`synastryHud.method.${m}.label`)}
                  hint={t(`synastryHud.method.${m}.hint`)}
                  aria-pressed={method === m}
                  onClick={() => setMethod(m)}
                >
                  {t(`synastryHud.method.${m}.label`)}
                </TipButton>
              ))}
            </span>
            <TipButton
              type="button"
              className={`synastry-hud-generate${canGenerate ? '' : ' is-disabled'}`}
              aria-disabled={!canGenerate}
              onClick={() => {
                if (canGenerate) onGenerate();
              }}
              placement="top"
              // The space-tag glyph prefixes both the button and its tip — a hint
              // that the built chart is saved with the "space" (relationship) tag.
              tip={
                <span className="synastry-hud-gen-tip">
                  <TagIcon tag="space" />
                  {t('synastryHud.generate.label')}
                </span>
              }
              hint={generateHint}
            >
              {/* Decorative twinkling star layer for the "space" fill. Absolutely
                  positioned + pointer-events:none, so it doesn't affect layout or clicks. */}
              <span className="synastry-gen-stars" aria-hidden="true" />
              <TagIcon tag="space" />
              {t('synastryHud.generate.label')}
            </TipButton>
          </div>
        </div>
      )}
    </div>
  );
}
