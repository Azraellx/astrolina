// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The geodetic zone shading's legend: a 4×3 grid, elements down and modalities across, each
// cell a sign's glyph on its zone's colour (the map's own zone palette) — so the twelve cells ARE the
// twelve zones, and the palette explains itself. A row head shows only that element's zones,
// a column head only that modality's; the same head again shows every zone. The cells are
// not controls. Shown by the host only while the shading is drawn, in the map's bottom-right
// corner above the active-systems chip (2026-10-02).
//
// The isolate is the HOST's state and is never stored: a map that came back next session with
// eight zones blank would have nothing on screen to say why.
import { Fragment, useLayoutEffect, useRef, type RefObject } from 'react';
import { subscribeBottomDock } from '../../lib/bottomDock';
import { watchSettled } from '../../lib/hudSettled';
import { BALANCE_ELEMENTS, BALANCE_MODALITIES } from '../../lib/astro/format';
import { ELEMENT_GLYPHS, MODALITY_GLYPHS } from '../../lib/astro/glyphChars';
import type { Element, Modality } from '../../lib/astro/dignities';
import type { GeoZoneIsolate } from '../../lib/astro/geodeticGrid';
import { ZodiacGlyph } from '../ZodiacGlyph/ZodiacGlyph';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import { useT } from '../../i18n';
import './GeoZoneLegend.css';

// Dark or white ink for a glyph on a zone colour (#rrggbb), by its luminance: the mutable
// shades are pale and the cardinal ones deep, so one ink can't serve the whole grid.
function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 150 ? '#14110d' : '#ffffff';
}

// One zone: its sign's glyph on its colour, the sign's name on hover. Dimmed while another
// group is isolated, as its zone is hidden on the map.
function LegendCell({ sign, color, dim }: { sign: number; color: string; dim: boolean }) {
  const { labels } = useT();
  const { ref, pos, show, hide } = useHoverTip<HTMLSpanElement>('top');
  return (
    <span
      ref={ref}
      className={`geo-legend-cell${dim ? ' is-dim' : ''}`}
      style={{ background: color, color: inkOn(color) }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <ZodiacGlyph sign={sign} size={13} />
      <HoverTip pos={pos} placement="top" title={labels.sign(sign)} />
    </span>
  );
}

// The gap the legend keeps from the settings window's edge when it steps aside for it.
const SETTINGS_GAP = 8;

// Keeps the legend clear of the open settings window (2026-10-05). Both live on the right, and
// the window's Calculation section — where Zone shading is switched on — reaches down over the
// legend's corner at common laptop sizes once it is open (1366×768 covered five of the seven
// heads, 1440×900 two), so the legend arrived with its controls under the panel that summoned
// it. Raising the legend over the window would cover the window's own rows instead, so it steps
// LEFT of the window while the two would meet, and goes home when they no longer would. It
// re-measures whenever a panel says it moved (`astro:hud-moved`: the Sidebar announces arriving,
// changing height and leaving), on resize and when the bottom band lifts it; and it announces its
// own move the same way, because the map keeps its labels off the legend (HUD_SELECTORS).
//
// Not on a touch screen: there the settings window is a full-height dock, and the only room
// beside it is the bottom-left corner the profile strip holds, so a legend stepping over would
// trade one covered head for another. It is under the dock while the dock is open, and back the
// moment it closes. The dodge in force is read off the element itself rather than kept in the
// effect, so a re-run of the effect (StrictMode's double mount) can't lose track of it.
function useClearOfSettings(ref: RefObject<HTMLDivElement | null>) {
  const settledRef = useRef('');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const settled = watchSettled([el], [], settledRef);
    const place = () => {
      const dodge = parseFloat(el.style.getPropertyValue('--geo-legend-dodge')) || 0;
      const r = el.getBoundingClientRect();
      // Its home box, where it sits with no dodge: only `right` ever moves.
      const homeLeft = r.left + dodge;
      const homeRight = r.right + dodge;
      const s = window.matchMedia('(pointer: coarse)').matches
        ? undefined
        : document.querySelector('aside.sidebar')?.getBoundingClientRect();
      let next = 0;
      if (
        s &&
        s.width > 0 &&
        s.height > 0 &&
        s.top < r.bottom &&
        s.bottom > r.top &&
        s.left < homeRight &&
        s.right > homeLeft
      ) {
        next = Math.ceil(homeRight - s.left) + SETTINGS_GAP;
      }
      if (next === dodge) return;
      el.style.setProperty('--geo-legend-dodge', `${next}px`);
      settled.check();
    };
    place();
    window.addEventListener('astro:hud-moved', place);
    window.addEventListener('resize', place);
    const unsubscribe = subscribeBottomDock(place);
    return () => {
      window.removeEventListener('astro:hud-moved', place);
      window.removeEventListener('resize', place);
      unsubscribe();
      settled.dispose();
    };
  }, [ref]);
}

// `colors` is the zone palette the map is shading with — MapStyle.geoZones, which is
// GEO_ZONE_COLORS[theme] on a built-in theme — so a Custom theme's zones and their legend
// can never disagree. It replaced a `theme` prop (2026-10-06): the theme alone no longer
// says what colour a zone is.
export function GeoZoneLegend({
  colors,
  isolate,
  onIsolate,
}: {
  colors: Readonly<Record<Element, readonly [string, string, string]>>;
  isolate: GeoZoneIsolate;
  onIsolate: (next: GeoZoneIsolate) => void;
}) {
  const { t } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  useClearOfSettings(rootRef);
  const isOn = (kind: 'element' | 'modality', value: Element | Modality) =>
    isolate?.kind === kind && isolate.value === value;
  // A head's tip says what pressing it will do: show only its group, or (pressed) every zone.
  // Its accessible name does not follow: a toggle keeps one name and aria-pressed carries the
  // state, or a pressed Fire head is read as "Show every zone, pressed" and names no group.
  const head = (kind: 'element' | 'modality', value: Element | Modality, glyph: string) => {
    const on = isOn(kind, value);
    const group = t(kind === 'element' ? `expandedSidebar.element.${value as Element}` : `expandedSidebar.modality.${value as Modality}`);
    const name = t('map.geoLegend.isolate', { group });
    const tip = on ? t('map.geoLegend.clear') : name;
    return (
      <TipButton
        type="button"
        key={`${kind}-${value}`}
        className={`geo-legend-head geo-legend-${kind}${on ? ' is-on' : ''}`}
        aria-pressed={on}
        aria-label={name}
        placement="top"
        tip={tip}
        onClick={() =>
          onIsolate(
            on ? null : kind === 'element' ? { kind, value: value as Element } : { kind, value: value as Modality },
          )
        }
      >
        <span className="astro-glyph" translate="no">{glyph}</span>
      </TipButton>
    );
  };
  return (
    <div ref={rootRef} className="geo-zone-legend" role="group" aria-label={t('map.geoLegend.aria')}>
      <span className="geo-legend-corner" aria-hidden="true" />
      {BALANCE_MODALITIES.map((m) => head('modality', m, MODALITY_GLYPHS[m]))}
      {BALANCE_ELEMENTS.map((e, ei) => (
        <Fragment key={e}>
          {head('element', e, ELEMENT_GLYPHS[e])}
          {BALANCE_MODALITIES.map((m, mi) => {
            // Element e, modality m: the sign with signElement = e and signModality = m.
            const sign = (9 * ei + 4 * mi) % 12;
            const dim =
              isolate != null && (isolate.kind === 'element' ? isolate.value !== e : isolate.value !== m);
            return <LegendCell key={m} sign={sign} color={colors[e][mi]} dim={dim} />;
          })}
        </Fragment>
      ))}
    </div>
  );
}
