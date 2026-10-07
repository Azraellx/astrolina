// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Line inks (2026-10-06): the colours a palette draws the map's LINE FEATURES in, and the pure
// helpers that put them on a FeatureCollection. Pure on purpose — no DOM, no React — so a
// colour step can be the LAST memo in each line chain: the geometry memos above it never
// re-run for a colour change, and a colour drag never regenerates a line.
//
// Every helper hands back the SAME object when nothing it would write differs. That is what
// keeps a built-in theme byte-identical through them (its inks are the colours the generators
// already wrote, so nothing changes and nothing is copied), and what lets a memo downstream
// bail out on identity.
//
// The colours here are hex (or the verbatim built-in strings, all hex for the line families),
// never '#rrggbbaa': the map's badge-text and crossing-blend readers parse 6-digit hex only.
import type { FeatureCollection, Geometry } from 'geojson';
import { PLANET_COLORS, type PlanetName } from './ephemeris';
import { THEMES, minorPaletteSlot } from './theme';
import { builtinPalette, cssColor, type ResolvedPalette } from './themePalette';
import type { AllLines } from './extensions/mapExtensions';

/** A palette's line colours, as lineInks applies them. Section-memoized by the engine: the
 *  identity changes only when one of these colours does, and `key` === the base theme while
 *  they are the built-in's (so App's linesStamp is byte-identical for a built-in). */
export interface MapInks {
  /** Each body's map-line colour: lines, local space, zeniths/nadirs, aspect/midpoint
   *  lines' two bodies, edge badges, hover tips (the Moon's slate on the light maps lives
   *  here, as MAP_LINE_COLOR_OVERRIDES put it). */
  readonly planet: Readonly<Record<PlanetName, string>>;
  /** Each body's paran colour — canonical for every built-in (parans never took the Moon
   *  swap). A paran is coloured by its planetA. */
  readonly paran: Readonly<Record<PlanetName, string>>;
  /** The fixed-star lines (and their sparks, star parans and tags). */
  readonly star: string;
  /** The catalog minor bodies' twelve palette slots. */
  readonly minor: readonly string[];
  /** Catalog body `n`'s colour: `minor[minorPaletteSlot(n)]` (lib/theme). */
  minorOf(n: number): string;
  /** The Eclipses overlay's path colours (buildEclipseMap's `colours`). Never one-inked. */
  readonly eclipse: Readonly<{ total: string; annular: string; iso: string; lunar: string }>;
  /** One ink for every OVERLAY line (withUniformInk after withLineInks), or null = the
   *  overlay draws in the natal colours. */
  readonly overlay: string | null;
  /** One ink for aspect + midpoint lines, or null = the bodies' colours. */
  readonly aspect: string | null;
  readonly key: string;
}

/** Exactly what the map's glyph images bake (glyphImages bakeAll): a sprite set is a pure
 *  function of this. `key` === the base theme while it is the built-in's. */
export interface SpriteSpec {
  readonly key: string;
  /** Each body's glyph / zenith ring / nadir ring colour — MapInks.planet. */
  readonly planet: Readonly<Record<PlanetName, string>>;
  /** The glyph and star-spark outline; '' = none (Dark's, as before). */
  readonly halo: string;
  /** The zenith/nadir/catalog coins' disc fill (bakeAll's `zenithHalo`). */
  readonly discFill: string;
  /** The star spark tint — MapInks.star. */
  readonly star: string;
  /** The catalog coins' twelve ring colours — MapInks.minor. A glyph body's coin is
   *  `minor[minorPaletteSlot(n)]`. */
  readonly minor: readonly string[];
}

type WithPlanet = { planet: PlanetName; color: string };

/**
 * The map-line colour for every feature that names a `planet` (lines, local space, zenith
 * and nadir points, aspect and midpoint lines): `color` from `inks.planet[planet]`, and —
 * on a feature with a second body (`planetB`) — `colorB` from `inks.planet[planetB]`.
 * Replaces App's withThemeLineColors. Geometry-agnostic. Features naming no known body (a
 * catalog body, a star) are left alone. Same object back when nothing differs.
 *
 * `colorB` is compared as the hover tip reads it (`colorB ?? PLANET_COLORS[planetB]`), so a
 * feature that never carried one gains one only when the ink actually differs — what the
 * old swap did.
 */
export function withLineInks<G extends Geometry, P extends WithPlanet>(
  fc: FeatureCollection<G, P>,
  inks: MapInks,
): FeatureCollection<G, P> {
  let out: FeatureCollection<G, P>['features'] | null = null;
  const fs = fc.features;
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    const p = f.properties as P & { planetB?: PlanetName; colorB?: string };
    const a = p ? inks.planet[p.planet] : undefined;
    const b = p?.planetB ? inks.planet[p.planetB] : undefined;
    const setA = a !== undefined && a !== p.color;
    const setB = b !== undefined && b !== (p.colorB ?? PLANET_COLORS[p.planetB as PlanetName]);
    if (!setA && !setB) {
      if (out) out.push(f);
      continue;
    }
    out ??= fs.slice(0, i);
    out.push({
      ...f,
      properties: { ...p, ...(setA ? { color: a } : null), ...(setB ? { colorB: b } : null) },
    });
  }
  return out ? { ...fc, features: out } : fc;
}

/**
 * Paran colours: a planet paran takes `inks.paran[planetA]`; a fixed-star paran (it carries
 * `star`) takes `inks.star`. Catalog-body parans carry no planetA — colour them with
 * withMinorInks. Same object back when nothing differs.
 */
export function withParanInks<G extends Geometry, P extends { planetA: PlanetName; color: string }>(
  fc: FeatureCollection<G, P>,
  inks: MapInks,
): FeatureCollection<G, P> {
  let out: FeatureCollection<G, P>['features'] | null = null;
  const fs = fc.features;
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    const p = f.properties as P & { star?: string; kind?: string };
    const want = !p || p.kind === 'minor' ? undefined : p.star ? inks.star : inks.paran[p.planetA];
    if (want === undefined || want === p.color) {
      if (out) out.push(f);
      continue;
    }
    out ??= fs.slice(0, i);
    out.push({ ...f, properties: { ...p, color: want } });
  }
  return out ? { ...fc, features: out } : fc;
}

/**
 * One ink on every feature: `color` (and `colorB`, where a feature has a second body) set
 * to `ink`. For the star lines (`inks.star`), and for an overlay's or the aspect lines' one
 * ink (`inks.overlay` / `inks.aspect`) — a null or undefined ink is "no one-ink", so the
 * collection comes back untouched. Same object back when nothing differs.
 */
export function withUniformInk<G extends Geometry, P extends { color: string }>(
  fc: FeatureCollection<G, P>,
  ink: string | null | undefined,
): FeatureCollection<G, P> {
  if (!ink) return fc;
  let out: FeatureCollection<G, P>['features'] | null = null;
  const fs = fc.features;
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    const p = f.properties as P & { planetB?: string; colorB?: string };
    const setB = !!p?.planetB && p.colorB !== ink;
    if (!p || (p.color === ink && !setB)) {
      if (out) out.push(f);
      continue;
    }
    out ??= fs.slice(0, i);
    out.push({ ...f, properties: { ...p, color: ink, ...(setB ? { colorB: ink } : null) } });
  }
  return out ? { ...fc, features: out } : fc;
}

/**
 * Catalog minor bodies' colours, keyed by `props.number`: lines, zenith coins and their
 * parans with the planets alike (each carries `number`). Features without a number are left
 * alone. Same object back when nothing differs.
 */
export function withMinorInks<G extends Geometry, P extends { color: string }>(
  fc: FeatureCollection<G, P>,
  inks: MapInks,
): FeatureCollection<G, P> {
  let out: FeatureCollection<G, P>['features'] | null = null;
  const fs = fc.features;
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    const p = f.properties as P & { number?: number };
    const want = p && typeof p.number === 'number' ? inks.minorOf(p.number) : undefined;
    if (want === undefined || want === p.color) {
      if (out) out.push(f);
      continue;
    }
    out ??= fs.slice(0, i);
    out.push({ ...f, properties: { ...p, color: want } });
  }
  return out ? { ...fc, features: out } : fc;
}

/** Whether `inks` ARE a built-in theme's — the engine hands back the built-in's own inks for
 *  built-in content, keyed by the theme's bare name (MapInks.key); a custom palette's key is
 *  `base~hash`. */
export function isBuiltinInks(inks: MapInks): boolean {
  return (THEMES as readonly string[]).includes(inks.key);
}

// ── Line families ──
// Each line family's COLOUR step, applied as the LAST memo of its chain in App so a colour
// change — a Custom theme being edited — recolours the map's lines without regenerating a
// single one (2026-10-06). The generators keep writing what they always wrote: PLANET_COLORS,
// and the star and catalog tints of the theme the map is built on. These put the palette's
// inks over that and hand the SAME collection back wherever nothing differs — so a built-in
// theme is byte-identical through them, its inks being exactly those colours plus the one
// swap its own table makes.
//
// That swap was App's withThemeLineColors over MAP_LINE_COLOR_OVERRIDES: the Moon's slate on
// the two light basemaps, so its pale grey still reads there. Only the Moon — the
// "Mercury/Uranus on Earth" that function's comment also listed were not in the table (see
// lib/theme). The ink keeps the swap's whole reach: the edge badges, the hover tip, the
// crossing-dot blends and the zenith disc all read the one `color`, so they follow it; and a
// midpoint line's second body (planetB/colorB, read by its hover tip) takes its own body's ink.
//
// One function per family, shared by the drawn chain (App) and the complete set a plugin
// reads (inkAllLines, behind collectAllLines), so the two can never colour the same line
// differently. They live here rather than in App (until 2026-10-06 they did) so a Node suite
// can hold the two to each other: verify:theme-palette §10.
type BodyProps = { planet: PlanetName; color: string };
/** Aspect + midpoint lines: the bodies' inks, then the palette's one aspect ink if it sets one. */
export function inkAspectLines<G extends Geometry, P extends BodyProps>(
  fc: FeatureCollection<G, P>,
  inks: MapInks,
): FeatureCollection<G, P> {
  return withUniformInk(withLineInks(fc, inks), inks.aspect);
}
/** An overlay's angle lines and local space: the bodies' inks, then the palette's one overlay
 *  ink if it sets one. Not its zenith and nadir stamps: their glyphs are baked per body
 *  (SpriteSpec), and a disc ring in another colour would disagree with its glyph. */
export function inkOverlayLines<G extends Geometry, P extends BodyProps>(
  fc: FeatureCollection<G, P>,
  inks: MapInks,
): FeatureCollection<G, P> {
  return withUniformInk(withLineInks(fc, inks), inks.overlay);
}
/** A synastry partner's or an eclipse's parans, beside the chart's: the paran inks, then the
 *  overlay ink, as the overlay's lines take it. */
export function inkOverlayParans<G extends Geometry, P extends { planetA: PlanetName; color: string }>(
  fc: FeatureCollection<G, P>,
  inks: MapInks,
): FeatureCollection<G, P> {
  return withUniformInk(withParanInks(fc, inks), inks.overlay);
}

/** The complete line set (App's buildAllLines' geometry) in `inks`, family by family with the
 *  very functions the drawn chain uses. Families nothing would recolour come back as they went
 *  in, so `natalParans` stays the same object as `parans`, as buildAllLines makes it.
 *
 *  The chart's own local space is the one family that depends on WHICH inks. The set has
 *  always carried it raw (allLocalSpace), where the drawn local space takes the Moon's slate on
 *  the light maps; inking it under a built-in theme would move the Moon's local-space colour in
 *  every built-in's complete set, so a built-in's set keeps it exactly as generated. Under a
 *  custom palette there is no "as it always was" to keep, and a raw family would be the one
 *  part of the set in colours the map doesn't draw — a one-ink theme's local space handed to a
 *  plugin in planet colours beside black lines (review, 2026-10-06). So it is inked there, with
 *  the drawn chain's own function. */
export function inkAllLines(set: AllLines, inks: MapInks): AllLines {
  type Body = FeatureCollection<Geometry, BodyProps>;
  type Paran = FeatureCollection<Geometry, { planetA: PlanetName; color: string }>;
  type Colored = FeatureCollection<Geometry, { color: string }>;
  const body = (fc: FeatureCollection) => withLineInks(fc as Body, inks) as FeatureCollection;
  const aspect = (fc: FeatureCollection) => inkAspectLines(fc as Body, inks) as FeatureCollection;
  const paran = (fc: FeatureCollection) => withParanInks(fc as Paran, inks) as FeatureCollection;
  const star = (fc: FeatureCollection) => withUniformInk(fc as Colored, inks.star) as FeatureCollection;
  const minor = (fc: FeatureCollection) => withMinorInks(fc as Colored, inks) as FeatureCollection;
  const ovLines = (fc: FeatureCollection) => inkOverlayLines(fc as Body, inks) as FeatureCollection;
  const ovParans = (fc: FeatureCollection) => inkOverlayParans(fc as Paran, inks) as FeatureCollection;
  const inkedParans = paran(set.parans);
  const inkedNatalAngle = aspect(set.natalAngleLines);
  const inkedNatalStars = star(set.natalStarLines);
  return {
    ...set,
    lines: body(set.lines),
    angleLines: set.angleLines === set.natalAngleLines ? inkedNatalAngle : aspect(set.angleLines),
    parans: inkedParans,
    starLines: set.starLines === set.natalStarLines ? inkedNatalStars : star(set.starLines),
    localSpace: isBuiltinInks(inks) ? set.localSpace : body(set.localSpace),
    overlayLines: set.overlayLines && ovLines(set.overlayLines),
    overlayParans: set.overlayParans && ovParans(set.overlayParans),
    overlayLocalSpace: set.overlayLocalSpace && ovLines(set.overlayLocalSpace),
    natalAngleLines: inkedNatalAngle,
    natalParans: set.natalParans === set.parans ? inkedParans : paran(set.natalParans),
    natalStarLines: inkedNatalStars,
    minorLines: set.minorLines && minor(set.minorLines),
    overlayMinorLines: set.overlayMinorLines && minor(set.overlayMinorLines),
    minorParans: set.minorParans && minor(set.minorParans),
    overlayMinorParans: set.overlayMinorParans && minor(set.overlayMinorParans),
  };
}

// ── Sprites ──

function spriteBody(p: ResolvedPalette): Omit<SpriteSpec, 'key'> {
  const v = p.values;
  return {
    planet: p.inks.planet,
    halo: v['marks.spriteHalo'] === 'off' ? '' : cssColor(String(v['marks.halo'] ?? '')),
    discFill: cssColor(String(v['marks.zenithDisc'] ?? '')),
    star: p.inks.star,
    minor: p.inks.minor,
  };
}

const sameSprite = (a: Omit<SpriteSpec, 'key'>, b: Omit<SpriteSpec, 'key'>) =>
  a.halo === b.halo &&
  a.discFill === b.discFill &&
  a.star === b.star &&
  a.minor.length === b.minor.length &&
  a.minor.every((c, i) => c === b.minor[i]) &&
  Object.keys(a.planet).every((k) => a.planet[k as PlanetName] === b.planet[k as PlanetName]);

const SPRITES = new WeakMap<ResolvedPalette, SpriteSpec>();
const BUILTIN_SPRITES = new Map<string, SpriteSpec>();
// Recent custom specs by key, so a preview and the committed palette alternating (hold to
// compare, an undo) hand back the same objects rather than forcing a re-bake each time.
const RECENT_SPRITES = new Map<string, SpriteSpec>();
const RECENT_MAX = 8;

/** What the map's glyph images must be baked from for `palette`. Identity-stable: the
 *  built-in's spec is one object per theme, and a recent custom spec with the same contents
 *  is that same object — so `prev !== next` is the test for "re-bake". */
export function spriteSpecFor(palette: ResolvedPalette): SpriteSpec {
  const hit = SPRITES.get(palette);
  if (hit) return hit;
  let builtin = BUILTIN_SPRITES.get(palette.base);
  if (!builtin) {
    builtin = Object.freeze({ key: palette.base, ...spriteBody(builtinPalette(palette.base)) });
    BUILTIN_SPRITES.set(palette.base, builtin);
  }
  const body = spriteBody(palette);
  let spec: SpriteSpec = builtin;
  if (!sameSprite(body, builtin)) {
    // inks.key names the planet/star/minor colours; halo and disc fill are the rest.
    const key = `${palette.base}~${palette.inks.key}~${body.halo}~${body.discFill}`;
    const recent = RECENT_SPRITES.get(key);
    if (recent && sameSprite(body, recent)) {
      spec = recent;
    } else {
      spec = Object.freeze({ key, ...body });
      RECENT_SPRITES.set(key, spec);
      if (RECENT_SPRITES.size > RECENT_MAX) RECENT_SPRITES.delete(RECENT_SPRITES.keys().next().value as string);
    }
  }
  SPRITES.set(palette, spec);
  return spec;
}

// Re-exported so a consumer colouring lines needs one import.
export { minorPaletteSlot };
