// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Click-a-line interpretation cards: a clicked map line opens a short reading
// (i18n/en/lineMeanings.ts) as a pinned popup, the same pattern as the eclipse
// local-circumstances card. Pure HTML composition over the clicked feature's
// properties; everything interpolated comes from our own catalogs and enums,
// nothing user-authored reaches this HTML.
import type { TFn } from '../i18n';
import type { PlanetName } from './ephemeris';
import type { LineType } from './astro/lines';
import type { AspectKind } from './astro/angleAspects';
import { ASPECT_GLYPHS, PLANET_GLYPHS } from './astro/glyphChars';

const OVERLAY_NOTE_TAGS = ['Tr', 'Sp', 'Sa', 'Pd', 'Cy', 'Sy'] as const;
type NoteTag = (typeof OVERLAY_NOTE_TAGS)[number];
const isNoteTag = (tag: unknown): tag is NoteTag =>
  typeof tag === 'string' && (OVERLAY_NOTE_TAGS as readonly string[]).includes(tag);

// The ten planets with bespoke per-angle texts in the catalog; everything else
// (nodes, Lilith, Chiron, asteroids) gets the generic theme + essence card.
// Listed here (≡ ephemeris.TRADITIONAL_PLANETS) rather than imported: a value
// import of ephemeris.ts would couple this pure text module to the WASM engine.
const BESPOKE_PLANETS = [
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars',
  'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
] as const;
type BespokePlanet = (typeof BESPOKE_PLANETS)[number];
const BESPOKE: ReadonlySet<PlanetName> = new Set<PlanetName>(BESPOKE_PLANETS);

const glyph = (planet: PlanetName, color: unknown) =>
  `<span class="astro-glyph line-card-glyph" style="color:${typeof color === 'string' ? color : 'inherit'}">${PLANET_GLYPHS[planet]}</span>`;

function card(title: string, body: string, notes: string[]): string {
  return (
    `<div class="ui-tip line-card">` +
    `<span class="ui-tip-title">${title}</span>` +
    `<p class="line-card-body">${body}</p>` +
    notes.map((n) => `<span class="ui-tip-sub">${n}</span>`).join('') +
    `</div>`
  );
}

/**
 * The interpretation card for a clicked line feature, or null where a line has
 * no reading (eclipse curves keep their own click card). `props` is the raw
 * feature properties bag from queryRenderedFeatures.
 */
export function buildLineCard(
  layerId: string,
  props: Record<string, unknown>,
  t: TFn,
): string | null {
  if (layerId.startsWith('eclipse')) return null;

  const notes: string[] = [];
  if (isNoteTag(props.tag)) notes.push(t(`lineMeanings.overlayNote.${props.tag}`));
  const footer = t('lineMeanings.footer');

  if (layerId.startsWith('ecliptic')) {
    return card(t('lineMeanings.eclipticTitle'), t('lineMeanings.ecliptic'), [footer]);
  }

  if (layerId.startsWith('local-space')) {
    const planet = props.planet as PlanetName;
    const name = t(`planets.${planet}.name`);
    return card(
      glyph(planet, props.color) + t('lineMeanings.localSpaceTitle', { planet: name }),
      t('lineMeanings.localSpace', { planet: name }),
      [...notes, footer],
    );
  }

  if (layerId.startsWith('parans')) {
    const a = t(`planets.${props.planetA as PlanetName}.name`);
    const b = t(`planets.${props.planetB as PlanetName}.name`);
    return card(
      t('lineMeanings.paranTitle', { a, b }),
      t('lineMeanings.paran', {
        a,
        b,
        angleA: String(props.angleA),
        angleB: String(props.angleB),
      }),
      [...notes, footer],
    );
  }

  if (layerId === 'angle-lines-layer') {
    const angle = props.lineType as LineType;
    const essence = t(`lineMeanings.angleEssence.${angle}`);
    if (props.kind === 'aspect') {
      const planet = props.planet as PlanetName;
      const aspect = props.aspect as AspectKind;
      const name = t(`planets.${planet}.name`);
      const aspectWord = t(`expandedSidebar.aspect.${aspect}.name`).toLowerCase();
      const body =
        `${t('lineMeanings.aspect.frame', { planet: name, aspect: aspectWord, angle })} ` +
        `${t(`lineMeanings.aspect.kind.${aspect}`)} ` +
        t('lineMeanings.aspect.pointer', { planet: name, angle });
      return card(
        glyph(planet, props.color) +
          t('lineMeanings.aspectTitle', {
            planet: name,
            aspect: `<span class="astro-glyph">${ASPECT_GLYPHS[aspect]}</span>`,
            angle,
          }),
        body,
        [...notes, footer],
      );
    }
    if (props.kind === 'midpoint') {
      const a = t(`planets.${props.planet as PlanetName}.name`);
      const b = t(`planets.${props.planetB as PlanetName}.name`);
      return card(
        t('lineMeanings.midpointTitle', { a, b, angle }),
        t('lineMeanings.midpoint', { a, b, angle, essence }),
        [...notes, footer],
      );
    }
    return null;
  }

  if (layerId === 'star-lines-layer') {
    const star = String(props.star);
    const angle = props.lineType as LineType;
    return card(
      `<span class="line-card-glyph" style="color:${typeof props.color === 'string' ? props.color : 'inherit'}">★</span>` +
        t('lineMeanings.starTitle', { star, angle }),
      t('lineMeanings.star', {
        star,
        essence: t(`lineMeanings.angleEssence.${angle}`),
      }),
      [footer],
    );
  }

  if (layerId.startsWith('acg-lines')) {
    const planet = props.planet as PlanetName;
    const angle = props.lineType as LineType;
    if (!planet || !angle) return null;
    const name = t(`planets.${planet}.name`);
    const title = glyph(planet, props.color) + t(`lineMeanings.title.${angle}`, { planet: name });
    const body = BESPOKE.has(planet)
      ? t(`lineMeanings.meanings.${planet as BespokePlanet}.${angle}`)
      : t('lineMeanings.generic', {
          theme: t(`planets.${planet}.theme`),
          essence: t(`lineMeanings.angleEssence.${angle}`),
        });
    if (props.pair) notes.unshift(t('lineMeanings.nodePair'));
    return card(title, body, [...notes, footer]);
  }

  return null;
}
