// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Click-a-line interpretation cards: a clicked map line opens a short reading
// (i18n/en/lineMeanings.ts) as a pinned popup, the same pattern as the eclipse
// local-circumstances card. Pure HTML composition over the clicked feature's
// properties; everything interpolated comes from our own catalogs and enums,
// nothing user-authored reaches this HTML. The one outside string — a catalog
// minor body's name — is escaped where it is spliced in (minorNameHtml below).
//
// The raw TEXT (title + body, no HTML) is factored into lineReading() below, so
// any other surface that composes its own presentation — a per-location reader,
// a list, an export — draws from the same single interpretation source instead
// of scraping this card's HTML.
import type { TFn } from '../i18n';
import type { PlanetName } from './ephemeris';
import type { LineType } from './astro/lines';
import { aspectBranchReading, type AspectKind } from './astro/angleAspects';
import { ASPECT_GLYPHS, MINOR_GLYPHS, PLANET_GLYPHS } from './astro/glyphChars';
import { isHypotheticalKey, isMinorNumber, minorKeyOf } from './minorBodies/ids';
import { minorDisplayLabel } from './minorBodies/naming';

const OVERLAY_NOTE_TAGS = ['Tr', 'Sp', 'Tp', 'Sa', 'Pd', 'Cy', 'Sy'] as const;
type NoteTag = (typeof OVERLAY_NOTE_TAGS)[number];
const isNoteTag = (tag: unknown): tag is NoteTag =>
  typeof tag === 'string' && (OVERLAY_NOTE_TAGS as readonly string[]).includes(tag);

// Every computed body now carries bespoke per-angle texts in the catalog; the
// generic theme + essence card stays as the fallback for anything outside this
// list. Listed here (≡ ephemeris.PLANET_NAMES) rather than imported: a value
// import of ephemeris.ts would couple this pure text module to the WASM engine.
const BESPOKE_PLANETS = [
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars',
  'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
  'NorthNode', 'SouthNode', 'Chiron', 'Ceres', 'Pallas', 'Juno', 'Vesta', 'Lilith',
  'Fortune',
] as const;
type BespokePlanet = (typeof BESPOKE_PLANETS)[number];
const BESPOKE: ReadonlySet<PlanetName> = new Set<PlanetName>(BESPOKE_PLANETS);

// The catalog star names, as a TYPE only (no runtime coupling to the English
// catalog): feature props carry the star name as a plain string, and the
// bundled star set and this key set are maintained together.
type StarName = keyof typeof import('../i18n/en/lineMeanings').lineMeanings.starThemes;

const glyph = (planet: PlanetName, color: unknown) =>
  `<span class="astro-glyph line-card-glyph" style="color:${typeof color === 'string' ? color : 'inherit'}">${PLANET_GLYPHS[planet]}</span>`;

// ── Catalog minor bodies ──────────────────────────────────────────────────────
// A catalog line (lib/astro/minorLines) is `kind: 'minor'` and carries `number` +
// `name` where every other family carries `planet` — deliberately, so nothing keyed
// by PlanetName can decorate it by accident. These helpers are the ONE place that
// turns those props into a name and a mark; the map's hover tip and zenith tooltip
// import them rather than restating the "Name (number)" rule beside the card.
//
// Unlike every other family, the name is not one of our enums: it comes from the
// minor-planet catalog (the bundled manifest, or a hosted index in a downstream
// build) and rides through the viewer's saved list. So it is escaped wherever it
// meets HTML — `lineReading` stays plain text for the surfaces that compose their
// own presentation, and the HTML builders below escape at the point of composition.

/** U+25C6 BLACK DIAMOND — the mark every glyph-less catalog body shares, the text
 *  twin of the diamond baked into its map coin (glyphImages.rasterizeMinorCoin). It
 *  is already in the bundled symbol subset (subset-font.sh, the modality bar's
 *  "mutable" icon), so `.astro-glyph` draws it in the same font as every other mark. */
const MINOR_MARK = '\u25C6\uFE0E'; // + VS15 "text presentation", as glyphChars does
/** U+25C7 WHITE DIAMOND — a hypothetical point's mark, the text twin of its hollow
 *  coin. Added to the symbol subset for this alone (subset-font.sh), so it draws in the
 *  same font as the ◆ it stands beside rather than in a system fallback face. */
const MINOR_HOLLOW_MARK = '\u25C7\uFE0E';

/** Escape a plain-text string for splicing into tip/card HTML. */
export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );

/** A catalog feature's list key — an MPC number, or a hypothetical point's reserved
 *  key: its `number` prop, else the one inside `body` (`mp:<n>` or `hyp:<se>`). */
function minorNumberProp(props: Record<string, unknown>): number | null {
  return isMinorNumber(props.number) || isHypotheticalKey(props.number) ? props.number : minorKeyOf(props.body);
}

/**
 * How a catalog body is named everywhere a reader meets it: "Eros (433)", "(433)"
 * when the catalog knows no name, "Zeus (hyp)" for a hypothetical point — the one
 * rule, minorBodies/naming.ts. Plain text; see minorNameHtml for the escaped form.
 */
export function minorDisplayName(props: Record<string, unknown>, t: TFn): string {
  const name = typeof props.name === 'string' ? props.name : '';
  // Never print "(undefined)" or "(NaN)": a feature without a readable number falls
  // back to whatever name it has (the verify suite checks for exactly that leak).
  return minorDisplayLabel(minorNumberProp(props), name, t);
}

/** minorDisplayName, escaped for splicing into tip/card HTML. */
export function minorNameHtml(props: Record<string, unknown>, t: TFn): string {
  return escapeHtml(minorDisplayName(props, t));
}

/**
 * The body's mark as an inline span in its line colour: its own astrological symbol
 * where one is encoded (MINOR_GLYPHS — Eris, Sedna, Pholus, …), otherwise the shared
 * diamond, exactly as its map coin draws it — hollow (◇) for a hypothetical point.
 * `className` carries the surface's own glyph class (the card's `line-card-glyph`, the
 * hover tip's `cross-tip-glyph`); `minor-mark` lets the filled diamond step down a size
 * (Map.css), since a filled shape carries more ink than a line glyph. The hollow one is
 * `is-hollow` as well and keeps the glyph size: it IS a line glyph, and this font draws
 * its outline thin enough that, stepped down, it would read faint.
 */
export function minorMarkHtml(props: Record<string, unknown>, className: string): string {
  const { char, cls } = minorMarkText(minorNumberProp(props));
  const color = typeof props.color === 'string' ? props.color : 'inherit';
  return `<span class="astro-glyph ${className}${cls ? ` ${cls}` : ''}" style="color:${color}">${char}</span>`;
}

/**
 * The mark as text — what minorMarkHtml draws, for a surface that builds its own element (the
 * map's edge chip for a catalog line): the character, and the class that sizes it (`minor-mark`
 * for the filled diamond, `minor-mark is-hollow` for a hypothetical point's, '' for a body's own
 * symbol). One choice of mark for every text surface, so no two can come to mark one body two ways.
 */
export function minorMarkText(n: number | null): { char: string; cls: string } {
  const sym = n === null ? undefined : MINOR_GLYPHS.get(n);
  if (sym) return { char: sym, cls: '' };
  return isHypotheticalKey(n)
    ? { char: MINOR_HOLLOW_MARK, cls: 'minor-mark is-hollow' }
    : { char: MINOR_MARK, cls: 'minor-mark' };
}

// The reading for one catalog line, over an already-resolved display name — shared by
// lineReading (plain name) and buildLineCard (escaped name), so the two cannot drift.
// No bespoke texts: a catalog body has no curated theme here, so it reads through the
// angle essence alone, framed as a minor planet's narrow emphasis — or, for a
// hypothetical point (read off the feature's own key), as a point's.
function minorReading(angle: LineType, name: string, props: Record<string, unknown>, t: TFn): LineReading {
  return {
    title: t(`lineMeanings.title.${angle}`, { planet: name }),
    body: t(isHypotheticalKey(minorNumberProp(props)) ? 'minorBodies.card.hypBody' : 'minorBodies.card.body', {
      name,
      essence: t(`lineMeanings.angleEssence.${angle}`),
    }),
  };
}

/** Closest-approach row data: km from the reference point (a placed pin, or the natal location
 *  by default) to the line's NEAREST point. Computed in Map.tsx, which owns the geometry. */
export interface LineCardDistance {
  km: number;
  type: 'pin' | 'natal';
}

/** The raw interpretation text for one line — plain strings, no HTML. */
export interface LineReading {
  title: string;
  body: string;
}

/**
 * The plain-text interpretation behind a line feature — the {title, body} the
 * HTML card decorates. `layerId` follows the map's layer-id conventions
 * ('acg-lines…', 'angle-lines-layer', 'parans…', 'local-space…',
 * 'star-lines-layer', 'minor-lines-layer', 'ecliptic…'); `props` is the
 * feature's properties bag.
 * Null where a line has no reading (eclipse curves keep their own click card).
 */
export function lineReading(
  layerId: string,
  props: Record<string, unknown>,
  t: TFn,
): LineReading | null {
  if (layerId.startsWith('eclipse')) return null;

  if (layerId.startsWith('ecliptic')) {
    return { title: t('lineMeanings.eclipticTitle'), body: t('lineMeanings.ecliptic') };
  }

  if (layerId.startsWith('local-space')) {
    const planet = props.planet as PlanetName;
    const name = t(`planets.${planet}.name`);
    return {
      title: t('lineMeanings.localSpaceTitle', { planet: name }),
      body: t('lineMeanings.localSpace', {
        planet: name,
        theme: t(`planets.${planet}.theme`),
      }),
    };
  }

  if (layerId.startsWith('parans')) {
    const planetA = props.planetA as PlanetName;
    const planetB = props.planetB as PlanetName;
    const a = t(`planets.${planetA}.name`);
    const b = t(`planets.${planetB}.name`);
    return {
      title: t('lineMeanings.paranTitle', {
        a,
        b,
        angleA: String(props.angleA),
        angleB: String(props.angleB),
      }),
      body: t('lineMeanings.paran', {
        a,
        b,
        angleA: String(props.angleA),
        angleB: String(props.angleB),
        themeA: t(`planets.${planetA}.theme`),
        themeB: t(`planets.${planetB}.theme`),
      }),
    };
  }

  if (layerId === 'angle-lines-layer') {
    const angle = props.lineType as LineType;
    const essence = t(`lineMeanings.angleEssence.${angle}`);
    if (props.kind === 'aspect') {
      const planet = props.planet as PlanetName;
      // Name the line by the angle it actually is (its `branch`) — matching the
      // hover tip and edge badge — not the MC/ASC-convention relabel in lineType.
      const { aspect, angle: aspAngle } = aspectBranchReading(
        props.aspect as AspectKind,
        props.branch as LineType,
      );
      const name = t(`planets.${planet}.name`);
      const aspectName = t(`expandedSidebar.aspect.${aspect}.name`);
      const aspectWord = aspectName.toLowerCase();
      return {
        // Plain-text title ("Venus Trine MC"); the card re-composes its own with
        // the glyph-font aspect symbol spliced in.
        title: t('lineMeanings.aspectTitle', { planet: name, aspect: aspectName, angle: aspAngle }),
        body:
          `${t('lineMeanings.aspect.frame', { planet: name, aspect: aspectWord, angle: aspAngle })} ` +
          `${t(`lineMeanings.aspect.kind.${aspect}`)} ` +
          t('lineMeanings.aspect.pointer', { planet: name, angle: aspAngle }),
      };
    }
    if (props.kind === 'midpoint') {
      const a = t(`planets.${props.planet as PlanetName}.name`);
      const b = t(`planets.${props.planetB as PlanetName}.name`);
      return {
        title: t('lineMeanings.midpointTitle', { a, b, angle }),
        body: t('lineMeanings.midpoint', { a, b, angle, essence }),
      };
    }
    return null;
  }

  if (layerId === 'star-lines-layer') {
    const star = String(props.star);
    const angle = props.lineType as LineType;
    return {
      title: t('lineMeanings.starTitle', { star, angle }),
      body: t('lineMeanings.star', {
        star,
        // Every catalog star has a one-line signature; the template weaves it
        // between the frame and the angle essence.
        theme: t(`lineMeanings.starThemes.${star as StarName}`),
        essence: t(`lineMeanings.angleEssence.${angle}`),
      }),
    };
  }

  // Catalog minor body (lib/astro/minorLines) — checked by its own layer, and never by
  // props.planet, which these features deliberately do not carry.
  if (layerId === 'minor-lines-layer') {
    const angle = props.lineType as LineType;
    const name = minorDisplayName(props, t);
    if (!angle || !name) return null;
    return minorReading(angle, name, props, t);
  }

  if (layerId.startsWith('acg-lines')) {
    const planet = props.planet as PlanetName;
    const angle = props.lineType as LineType;
    if (!planet || !angle) return null;
    const name = t(`planets.${planet}.name`);
    // Bespoke texts cover the four primary angles; the Vertex-axis lines read
    // through the generic theme + essence frame (high-level by design).
    const body =
      BESPOKE.has(planet) && angle !== 'VX' && angle !== 'AVX'
        ? t(`lineMeanings.meanings.${planet as BespokePlanet}.${angle as 'MC' | 'IC' | 'ASC' | 'DSC'}`)
        : t('lineMeanings.generic', {
            theme: t(`planets.${planet}.theme`),
            essence: t(`lineMeanings.angleEssence.${angle}`),
          });
    return { title: t(`lineMeanings.title.${angle}`, { planet: name }), body };
  }

  return null;
}

// The teardrop map-pin glyph as inline HTML — the card is composed as an HTML string, so we
// can't drop in the React <PinIcon>. Same shape as the mission-guide pin mark.
const PIN_ICON_SVG =
  '<svg class="line-card-pin-icon" width="11" height="11" viewBox="0 0 24 24" fill="none"' +
  ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
  ' aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>' +
  '<circle cx="12" cy="10" r="3"/></svg>';

// The "Closest distance to … pin / natal: NN km / NN mi" row at the bottom of every card but a
// local-space line's (see buildLineCard). The reference is the placed pin (shown with the pin
// glyph) or, by default, the natal location.
function distanceLine(dist: LineCardDistance, t: TFn): string {
  const km = Math.round(dist.km);
  const mi = Math.round(dist.km * 0.621371);
  const label =
    dist.type === 'pin'
      ? t('lineMeanings.distance.fromPin', { icon: PIN_ICON_SVG })
      : t('lineMeanings.distance.fromNatal');
  return `<span class="ui-tip-sub line-card-distance">${label} ${km} km / ${mi} mi</span>`;
}

/**
 * The interpretation card for a clicked line feature, or null where a line has
 * no reading (eclipse curves keep their own click card). `props` is the raw
 * feature properties bag from queryRenderedFeatures. The text comes from
 * lineReading() above; this wraps it in the card HTML and decorates the title
 * with the body/star glyphs.
 *
 * `extra` is one line of PLAIN TEXT the map computed for the clicked position —
 * a paran's registered annotation (lib/extensions/paranAnnotation), the line its
 * hover tip carries — set as a sub-line under the reading. Escaped here: the seam's
 * contract is plain text, and it is the one string on this card that a downstream
 * build writes rather than our own catalogs.
 */
export function buildLineCard(
  layerId: string,
  props: Record<string, unknown>,
  t: TFn,
  dist?: LineCardDistance | null,
  extra?: string | null,
): string | null {
  const reading = lineReading(layerId, props, t);
  if (!reading) return null;

  // Pre-render the distance row once (identical for every card type); the local card() below
  // splices it in just above the disclaimer. Closing over it keeps each card() call a plain
  // 3-arg call.
  //
  // Never on a local-space line. Every ray starts at its origin, which by default IS the
  // reference point (the birthplace, or the pin the lines are cast from), so the row read
  // "0 km" by construction — and where it didn't (an overlay's rays from another origin)
  // it measured something with no meaning: a local-space line is a direction, and the
  // methods page says distance to one carries no interpretive meaning. A number there
  // invites exactly the reading the page rules out.
  const distanceRow = dist && !layerId.startsWith('local-space') ? distanceLine(dist, t) : '';
  const extraRow = extra ? `<span class="ui-tip-sub line-card-extra">${escapeHtml(extra)}</span>` : '';
  const card = (title: string, body: string, notes: string[]): string => {
    // The disclaimer is always the LAST note (every return below appends t('…footer')). Pull
    // it out and render it as a hover-revealed tip (.line-card-disclaimer in Map.css) instead
    // of an always-on line, to cut clutter; the overlay-source notes stay inline.
    const disclaimer = notes[notes.length - 1] ?? '';
    const overlayNotes = notes.slice(0, -1);
    return (
      `<div class="ui-tip line-card">` +
      `<span class="ui-tip-title">${title}</span>` +
      `<p class="line-card-body">${body}</p>` +
      // The computed line first: it is about this line at this spot, as the reading is;
      // the overlay notes and the distance row are about the line's provenance and place.
      extraRow +
      overlayNotes.map((n) => `<span class="ui-tip-sub">${n}</span>`).join('') +
      distanceRow +
      `<span class="line-card-disclaimer ui-tip-box ui-tip" role="tooltip">${disclaimer}</span>` +
      `</div>`
    );
  };

  const notes: string[] = [];
  if (isNoteTag(props.tag)) notes.push(t(`lineMeanings.overlayNote.${props.tag}`));
  const footer = t('lineMeanings.footer');

  if (layerId.startsWith('ecliptic') || layerId === 'star-lines-layer') {
    // Star titles carry a plain star mark (no body glyph exists for a star).
    const title =
      layerId === 'star-lines-layer'
        ? `<span class="line-card-glyph" style="color:${typeof props.color === 'string' ? props.color : 'inherit'}">★</span>` +
          reading.title
        : reading.title;
    return card(title, reading.body, [footer]);
  }

  if (layerId === 'minor-lines-layer') {
    // Re-composed over the ESCAPED name (see the note on catalog names above) rather
    // than splicing reading.title/body, which lineReading keeps as plain text. Same
    // templates via minorReading, so the card and the plain reading cannot disagree.
    const html = minorReading(props.lineType as LineType, minorNameHtml(props, t), props, t);
    return card(minorMarkHtml(props, 'line-card-glyph') + html.title, html.body, [...notes, footer]);
  }

  if (layerId.startsWith('local-space')) {
    const planet = props.planet as PlanetName;
    return card(glyph(planet, props.color) + reading.title, reading.body, [...notes, footer]);
  }

  if (layerId.startsWith('parans')) {
    return card(reading.title, reading.body, [...notes, footer]);
  }

  if (layerId === 'angle-lines-layer') {
    if (props.kind === 'aspect') {
      const planet = props.planet as PlanetName;
      const { aspect, angle: aspAngle } = aspectBranchReading(
        props.aspect as AspectKind,
        props.branch as LineType,
      );
      const name = t(`planets.${planet}.name`);
      const aspectName = t(`expandedSidebar.aspect.${aspect}.name`);
      return card(
        glyph(planet, props.color) +
          t('lineMeanings.aspectTitle', {
            planet: name,
            // Glyph + spelled-out word ("✶ Sextile"), matching the map hover tip —
            // the bare glyph alone read cryptically in the card heading.
            aspect: `<span class="astro-glyph">${ASPECT_GLYPHS[aspect]}</span> ${aspectName}`,
            angle: aspAngle,
          }),
        reading.body,
        [...notes, footer],
      );
    }
    // Midpoint — plain title.
    return card(reading.title, reading.body, [...notes, footer]);
  }

  if (layerId.startsWith('acg-lines')) {
    const planet = props.planet as PlanetName;
    if (props.pair) notes.unshift(t('lineMeanings.nodePair'));
    return card(glyph(planet, props.color) + reading.title, reading.body, [...notes, footer]);
  }

  return null;
}
