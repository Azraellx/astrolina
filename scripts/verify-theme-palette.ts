// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the PALETTE ENGINE (lib/themePalette, lib/lineInks) through the real src/lib code
// (run via the harness: `npm run verify:theme-palette`). The engine's one promise to every
// reader who never touches a Custom theme is that nothing moves: a built-in theme resolves to
// exactly what the app drew before the engine existed. Its promise to a reader who does is
// that a change moves what follows it and nothing else.
//
// Every section says which KIND of assertion it makes, after verify-directions.ts §8:
//   IDENTITY  — the code against a fixed rule or against itself. Breaking means the code
//               contradicts itself.
//   TWO PARTS — two independent parts agreeing about the same thing (the engine's built-ins
//               and the stylesheet / the tables / Map.tsx's own literals / the old colour
//               swap; the sprite spec and the inked lines). Preferred wherever a choice
//               exists (CLAUDE.md): a restated formula passes when both copies are wrong.
// No comparison here passes on an empty set: each counts what it compared and fails at zero.
//
//   §0 IDENTITY   the token table is sound, and every rule reads only what it declares
//   §1 both       a built-in equals an empty custom theme, and the inks leave real generator
//                 output exactly as today's colouring did
//   §2 TWO PARTS  UI_CSS_MIRROR against a parse of index.css
//   §3 TWO PARTS  .palette-canonical against CANONICAL_RESET_VARS (partly a TODO — see there)
//   §4 IDENTITY   moving a seed moves its live descendants and nothing else; an overridden
//                 descendant stays put when its seed moves
//   §5 IDENTITY   garbage overrides never throw and resolve to the built-in
//   §6 IDENTITY   contrast floors (placeholder, text on accent, gated ink)
//   §7 TWO PARTS  the sprite spec agrees with the inked line features
//   §8 TWO PARTS  LINE_STYLE_BUILTIN (through MapStyle) against Map.tsx's own literals
//   §9 TWO PARTS  the editor's map preview against the ink chain (MapLibre's own expression
//                 engine), its table against Map.tsx; then that it paints only, and (SOURCE
//                 TRIPWIRES) that nothing committed — the plugins' line set, inks, linesStamp —
//                 reads it
//   §10 TWO PARTS the complete line set's local space against the drawn chain's
//   §11 SOURCE    a restyle bakes once, on its own style (no live re-bake while one is pending)
//   §12 TWO PARTS Glass draws Bright; a palette pinned to Positron resolves as Glass did there
//                 before the move (2026-10-08); then IDENTITY: Bright's ferry routes stay hidden,
//                 and Glass's roads are a grey on Bright only — then TWO PARTS through the paint path
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FeatureCollection, Geometry } from 'geojson';
import {
  birthDataToJD,
  getMinorPositions,
  getPlanetPositions,
  gmstRadians,
  initEphemeris,
  obliquity,
  PLANET_COLORS,
  PLANET_NAMES,
  type MinorPosition,
  type PlanetName,
} from '../src/lib/ephemeris';
import { generateLines, generateZenithStamps, meridianLngFor, type MeridianLng } from '../src/lib/astro/lines';
import { generateParans, generateStarParans } from '../src/lib/astro/parans';
import { generateLocalSpace } from '../src/lib/astro/localSpace';
import { generateAspectLines, generateMidpointLines } from '../src/lib/astro/angleAspects';
import { generateMinorLines, generateMinorZenith, type MinorDecor } from '../src/lib/astro/minorLines';
import { generateStarLines, starsOfDate } from '../src/lib/astro/starLines';
import { HYPOTHETICAL_POINTS } from '../src/lib/minorBodies/hypothetical';
import { ensureMinorBodies, minorLoadState } from '../src/lib/minorBodies/loader';
import { bundledSource } from '../src/lib/minorBodies/bundled';
import { minorIconId, MINOR_COIN_PREFIX, MINOR_HOLLOW_COIN_PREFIX } from '../src/components/Map/glyphImages';
import {
  BASEMAP_ROAD_PAINT,
  BASEMAP_STYLE_URLS,
  ECLIPSE_LABEL_HALO,
  ECLIPSE_PATH_COLORS,
  GEO_GRID_STYLE,
  GEO_ZONE_COLORS,
  LABEL_CONTRAST,
  LABEL_HALO_COLORS,
  MAP_LINE_COLOR_OVERRIDES,
  MINOR_LINE_PALETTE,
  MOON_LINE_DARK,
  NIGHT_SHADE_STYLE,
  STAR_LINE_COLORS,
  THEMES,
  WORLD_FALLBACK_COLORS,
  ZENITH_DISC_COLORS,
  minorLineColor,
  minorPaletteSlot,
  type Theme,
} from '../src/lib/theme';
import {
  BASEMAP_CHOICES,
  builtinPalette,
  CANONICAL_RESET_VARS,
  checkTokenGraph,
  contrastRatio,
  DASH_PRESETS,
  explain,
  LINE_STYLE_BUILTIN,
  paletteTrace,
  parseColor,
  PENDING_CSS_DECLARATIONS,
  resolvePalette,
  sameTokenValue,
  sanitizeOverrides,
  tokenDef,
  TOKENS,
  UI_CSS_MIRROR,
  UNMIRRORED_CSS,
  walkPalette,
  type ResolvedPalette,
  type TokenDef,
  type TokenValue,
} from '../src/lib/themePalette';
import {
  inkAllLines,
  inkAspectLines,
  inkOverlayLines,
  inkOverlayParans,
  spriteSpecFor,
  withLineInks,
  withMinorInks,
  withParanInks,
  withUniformInk,
  type SpriteSpec,
} from '../src/lib/lineInks';
import { changedSpriteIds, spriteJobs } from '../src/components/Map/glyphImages';
import { applyBasemapPaint, applyDetailToggles } from '../src/components/Map/basemapStyle';
import {
  applyMapStyle,
  applyPreviewInks,
  mapPreviewFor,
  minorNumbersIn,
  previewInkValue,
  PREVIEW_COMMIT_ONLY,
  PREVIEW_INK_BINDINGS,
  type PreviewInkFamily,
} from '../src/components/Map/mapStyleApply';
import type { AllLines } from '../src/lib/extensions/mapExtensions';
// MapLibre's own expression engine (the style spec the map runs, a dependency of maplibre-gl):
// §9 evaluates the preview's colour expressions with it rather than with a restatement.
import * as styleSpec from '@maplibre/maplibre-gl-style-spec';
import type { StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec';

let failures = 0;
let skips = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
function skip(label: string, why: string) {
  skips += 1;
  console.log(`SKIP  ${label} — ${why}`);
}
/** A list as a sorted string, for order-free comparison. */
const canonList = (a: readonly string[]) => [...a].sort().join(',');
/** A comparison over a set: fails when the set was empty, so nothing passes vacuously. */
function checkAll(label: string, compared: number, bad: string[]) {
  check(`${label} (${compared} compared)`, compared > 0 && bad.length === 0,
    compared === 0 ? 'NOTHING COMPARED' : bad.slice(0, 4).join('; ') + (bad.length > 4 ? ` … +${bad.length - 4}` : ''));
}

// Structural equality for JSON-like values; two functions count as equal (minorOf is
// compared on its own, by value).
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'function' && typeof b === 'function') return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
const changedIds = (p: ResolvedPalette) => {
  const B = builtinPalette(p.base).values;
  return TOKENS.filter((d) => !sameTokenValue(p.values[d.id], B[d.id])).map((d) => d.id);
};

// The colour swap as App.tsx drew it before the engine (withThemeLineColors, verbatim as of
// vendor/core 2ecaa91) — the reference §1 holds the engine's inks to.
function legacyThemeLineColors<G extends Geometry, P extends { planet: PlanetName; color: string }>(
  fc: FeatureCollection<G, P>,
  theme: Theme,
): FeatureCollection<G, P> {
  const overrides = MAP_LINE_COLOR_OVERRIDES[theme];
  if (!Object.keys(overrides).length) return fc;
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      const p = f.properties as P & { planetB?: PlanetName; colorB?: string };
      const a = overrides[p.planet];
      const b = p.planetB ? overrides[p.planetB] : undefined;
      if (!a && !b) return f;
      return { ...f, properties: { ...p, ...(a ? { color: a } : null), ...(b ? { colorB: b } : null) } };
    }),
  };
}

await initEphemeris();

// Real generator output, the way the App builds it: two charts, the celestial frame.
const J = (y: number, m: number, d: number, h: number) =>
  birthDataToJD({ name: 'verify', year: y, month: m, day: d, hour: h, minute: 0, tzOffset: 0,
    birthplace: { label: 'Greenwich', lat: 51.4779, lng: 0 } });
const CHARTS = [
  { jd: J(1985, 6, 15, 14), lat: 51.4779, lng: 0 },
  { jd: J(2012, 1, 31, 3), lat: -33.8688, lng: 151.2093 },
];
const HYP_KEYS = HYPOTHETICAL_POINTS.map((p) => p.n);
await ensureMinorBodies(HYP_KEYS.map((n) => ({ n, source: bundledSource })));
const hypReady = HYP_KEYS.filter((n) => minorLoadState(n)?.status === 'ready');
// The App's own decoration (App.tsx minorDecor), per theme.
const decorFor = (theme: Theme) => (n: number): MinorDecor => ({ name: '', color: minorLineColor(n, theme), icon: minorIconId(n) });

interface Geom {
  lines: ReturnType<typeof generateLines>;
  zenith: ReturnType<typeof generateZenithStamps>;
  angle: FeatureCollection;
  localSpace: ReturnType<typeof generateLocalSpace>;
  parans: ReturnType<typeof generateParans>;
  starParans: ReturnType<typeof generateStarParans>;
  minorPositions: MinorPosition[];
  meridianLng: MeridianLng;
  jd: number;
}
const GEOM: Geom[] = CHARTS.map(({ jd, lat, lng }) => {
  const eps = obliquity(jd);
  const gmst = gmstRadians(jd);
  const meridianLng = meridianLngFor('celestial', eps, gmst);
  const positions = getPlanetPositions(jd, 'mean');
  // Synthetic catalog bodies across many palette slots, beside the real hypothetical points.
  const synthetic: MinorPosition[] = Array.from({ length: 30 }, (_, i) => ({
    n: 1000 + i * 37,
    ra: (i * 0.71) % (2 * Math.PI),
    dec: ((i % 7) - 3) * 0.15,
  }));
  return {
    lines: generateLines(positions, meridianLng),
    zenith: generateZenithStamps(positions, meridianLng),
    angle: {
      type: 'FeatureCollection',
      features: [
        ...generateAspectLines(positions, meridianLng, 'zodiaco', eps).features,
        ...generateMidpointLines(positions, meridianLng, 'zodiaco', eps).features,
      ],
    } as FeatureCollection,
    localSpace: generateLocalSpace(positions, gmst, lat, lng),
    parans: generateParans(positions, meridianLng),
    starParans: generateStarParans(starsOfDate(jd, 'bright'), positions, meridianLng, STAR_LINE_COLORS.dark),
    minorPositions: [...getMinorPositions(jd, hypReady), ...synthetic],
    meridianLng,
    jd,
  };
});
type PlanetFC = FeatureCollection<Geometry, { planet: PlanetName; color: string }>;

// ── §0 The token table (IDENTITY) ────────────────────────────────────────────────────────────
{
  const problems = checkTokenGraph();
  check(`0a the token graph is sound — ${TOKENS.length} tokens, ids dotted lowerCamel and unique, deps known, acyclic`,
    TOKENS.length > 0 && problems.length === 0, problems.slice(0, 5).join('; '));

  // Every built-in is a value its own control could hold.
  const bad: string[] = [];
  let n = 0;
  for (const t of THEMES) {
    for (const d of TOKENS) {
      n += 1;
      const v = d.builtin(t);
      if (!kindHolds(d, v)) bad.push(`${t} ${d.id} = ${JSON.stringify(v)}`);
    }
  }
  checkAll('0b every built-in is a value of its token\'s own kind, range and options', n, bad);

  // A rule reads only what it declares — across every palette the later sections build.
  // (Collected as they run; asserted at the end, in §0c.)
}
function kindHolds(d: TokenDef, v: TokenValue): boolean {
  switch (d.kind) {
    case 'color':
      return typeof v === 'string' && !!parseColor(v);
    case 'color?':
      return v === null || (typeof v === 'string' && !!parseColor(v));
    case 'number':
      return typeof v === 'number' && !!d.range && v >= d.range.min && v <= d.range.max;
    case 'number?':
      return v === null || (typeof v === 'number' && !!d.range && v >= d.range.min && v <= d.range.max);
    case 'enum':
      return typeof v === 'string' && !!d.options?.includes(v);
    case 'dash':
      return Array.isArray(v) && !!d.presets?.some((p) => sameTokenValue(p, v));
  }
  return false;
}
const traced: ResolvedPalette[] = [];
const resolve2 = (base: Theme, o: Record<string, TokenValue>) => {
  const p = resolvePalette(base, o);
  traced.push(p);
  return p;
};

// ── §1 Built-in equals empty custom (IDENTITY, then TWO PARTS) ───────────────────────────────
{
  for (const t of THEMES) {
    const b = builtinPalette(t);
    const w = walkPalette(t, {});
    traced.push(w);
    check(`1a ${t}: resolvePalette(t, {}) is builtinPalette(t) itself`, resolvePalette(t, {}) === b && resolvePalette(t) === b);
    // IDENTITY: two paths — the resolver walk and the direct assembly from the built-ins.
    const parts = ['base', 'key', 'overrides', 'values', 'origin', 'css', 'attrs'] as const;
    const differ = parts.filter((k) => !deepEqual(w[k], b[k]));
    check(`1b ${t}: the resolver walk over no overrides deep-equals the built-in assembly (${parts.join(', ')})`,
      differ.length === 0 && Object.keys(w.values).length === TOKENS.length, differ.join(', '));
    check(`1c ${t}: … and hands back the built-in's own inks and map style (section memo)`, w.inks === b.inks && w.map === b.map);
    check(`1d ${t}: a built-in writes no custom property at all`, Object.keys(b.css).length === 0, JSON.stringify(b.css));
    check(`1e ${t}: key, inks key, map key and sprite key are all the theme itself`,
      b.key === t && b.inks.key === t && b.map.key === t && spriteSpecFor(b).key === t);

    // TWO PARTS: the built-in sections against the lib/theme tables they replace.
    const m = b.map;
    const LS = LINE_STYLE_BUILTIN;
    const mapBad: string[] = [];
    const eq = (label: string, got: unknown, want: unknown) => {
      if (!deepEqual(got, want)) mapBad.push(`${label}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
    };
    eq('natal', m.natal, LS.natal);
    eq('overlay', m.overlay, LS.overlay);
    eq('nodePair', m.nodePair, { nn: PLANET_COLORS.NorthNode, sn: PLANET_COLORS.SouthNode });
    eq('overlayNodePair', m.overlayNodePair, {
      nn: PLANET_COLORS.NorthNode, sn: PLANET_COLORS.SouthNode,
      nnDash: LS.overlay.meridianDash, snDash: [0, ...LS.overlay.meridianDash],
    });
    eq('paran', m.paran, LS.paran);
    eq('minorParan', m.minorParan, { width: LS.minorParan.width, overlayDash: LS.paran.overlayDash });
    eq('aspect', m.aspect, LS.aspect);
    eq('localSpace', m.localSpace, LS.localSpace);
    eq('star', m.star, LS.star);
    eq('minor', m.minor, {
      ...LS.minor, overlayMeridianDash: LS.overlay.meridianDash, overlayHorizonDash: LS.overlay.horizonDash,
    });
    eq('ecliptic', m.ecliptic, LS.ecliptic);
    eq('zenithDisc', m.zenithDisc, ZENITH_DISC_COLORS[t]);
    eq('halo', m.halo, LABEL_HALO_COLORS[t]);
    eq('crossingStroke', m.crossingStroke, LABEL_HALO_COLORS[t] || 'rgba(0,0,0,0.4)');
    eq('eclipseHalo', m.eclipseHalo, ECLIPSE_LABEL_HALO[t]);
    eq('geoGrid', m.geoGrid, GEO_GRID_STYLE[t]);
    eq('nightShade', m.nightShade, NIGHT_SHADE_STYLE[t]);
    eq('geoZones', m.geoZones, GEO_ZONE_COLORS[t]);
    eq('worldFallback', m.worldFallback, WORLD_FALLBACK_COLORS[t]);
    const lc = LABEL_CONTRAST[t];
    eq('basemapPaint', m.basemapPaint, {
      water: null, waterway: null, land: null, landcover: 'keep', border: null, road: BASEMAP_ROAD_PAINT[t], building: null,
      label: lc?.color ?? null, labelHalo: lc?.halo ?? null, labelHaloWidth: lc?.haloWidth ?? null,
    });
    eq('switches', [m.basemap, m.arrows, m.minorBeads, m.starSparks, m.orbStrength, m.lineWeight], [t, true, true, true, 1, 1]);
    checkAll(`1f ${t}: the built-in MapStyle is the lib/theme tables and Map's constants, field by field`, 24, mapBad);

    const inkBad: string[] = [];
    for (const p of PLANET_NAMES) {
      if (b.inks.planet[p] !== (MAP_LINE_COLOR_OVERRIDES[t][p] ?? PLANET_COLORS[p])) inkBad.push(`planet ${p}`);
      // Parans take the body's MAP ink since 2026-10-08 (the Moon's slate on the light maps,
      // as its own lines; lib/theme MOON_LINE_DARK says why) — until then the canonical tint.
      if (b.inks.paran[p] !== (MAP_LINE_COLOR_OVERRIDES[t][p] ?? PLANET_COLORS[p])) inkBad.push(`paran ${p}`);
    }
    if (b.inks.star !== STAR_LINE_COLORS[t]) inkBad.push('star');
    if (!deepEqual(b.inks.minor, MINOR_LINE_PALETTE[t])) inkBad.push('minor palette');
    if (!deepEqual(b.inks.eclipse, ECLIPSE_PATH_COLORS[t])) inkBad.push('eclipse');
    if (b.inks.overlay !== null || b.inks.aspect !== null) inkBad.push('one-ink set');
    const sample = [...HYP_KEYS, ...Array.from({ length: 200 }, (_, i) => i * 13 + 5)];
    for (const n of sample) if (b.inks.minorOf(n) !== minorLineColor(n, t)) inkBad.push(`minorOf(${n})`);
    checkAll(`1g ${t}: the built-in inks are the tables' colours (every body, both line families; minorOf over ${sample.length} numbers)`,
      PLANET_NAMES.length * 2 + sample.length, inkBad);

    const sp = spriteSpecFor(b);
    check(`1h ${t}: the built-in sprite spec is what the map baked (halo, disc fill, star, minor, every body)`,
      sp.halo === (t === 'dark' ? '' : LABEL_HALO_COLORS[t]) && sp.discFill === ZENITH_DISC_COLORS[t] &&
        sp.star === STAR_LINE_COLORS[t] && deepEqual(sp.minor, MINOR_LINE_PALETTE[t]) &&
        PLANET_NAMES.every((p) => sp.planet[p] === (MAP_LINE_COLOR_OVERRIDES[t][p] ?? PLANET_COLORS[p])));

    // TWO PARTS: the engine's line inks against the old swap, over real generator output.
    let compared = 0;
    let moved = 0;
    const lineBad: string[] = [];
    for (const g of GEOM) {
      for (const [name, fc] of [
        ['lines', g.lines], ['zenith', g.zenith], ['aspect+midpoint', g.angle], ['local space', g.localSpace],
      ] as [string, PlanetFC][]) {
        const mine = withLineInks(fc, b.inks);
        const old = legacyThemeLineColors(fc, t);
        compared += fc.features.length;
        moved += fc.features.filter((f, i) => f !== mine.features[i]).length;
        if (!deepEqual(mine, old)) lineBad.push(`${name} differs from the old swap`);
        if (t === 'dark' && mine !== fc) lineBad.push(`${name}: not the same object on Dark`);
      }
    }
    checkAll(`1i ${t}: withLineInks colours real lines, zeniths, aspect/midpoint and local-space lines exactly as the old swap did`,
      compared, lineBad);
    if (t !== 'dark') {
      check(`1j ${t}: … and that comparison moved features (the Moon's slate), so it isn't equal by doing nothing`, moved > 0, `${moved}`);
    }

    // The families the old code coloured at generation: the engine must change nothing — but
    // the planet parans, which take the map ink since 2026-10-08: the same objects on Dark (no
    // swap there), and on the light maps exactly the Moon's parans moved to its slate.
    const sameBad: string[] = [];
    let sameN = 0;
    let moonParans = 0;
    for (const g of GEOM) {
      const stars = generateStarLines(starsOfDate(g.jd, 'bright'), g.meridianLng, null, STAR_LINE_COLORS[t]);
      const minorL = generateMinorLines(g.minorPositions, g.meridianLng, decorFor(t));
      const minorZ = generateMinorZenith(g.minorPositions, g.meridianLng, decorFor(t));
      const starParans = generateStarParans(starsOfDate(g.jd, 'bright'), getPlanetPositions(g.jd, 'mean'), g.meridianLng, STAR_LINE_COLORS[t]);
      sameN += g.parans.features.length + stars.features.length + minorL.features.length + minorZ.features.length + starParans.features.length;
      const inkedParans = withParanInks(g.parans, b.inks);
      if (t === 'dark') {
        if (inkedParans !== g.parans) sameBad.push('parans (Dark)');
      } else {
        inkedParans.features.forEach((f, i) => {
          const was = g.parans.features[i].properties;
          const want = was.planetA === 'Moon' ? MOON_LINE_DARK : was.color;
          if (was.planetA === 'Moon') moonParans++;
          if (f.properties.color !== want) sameBad.push(`paran ${was.planetA}: ${f.properties.color}, want ${want}`);
        });
      }
      if (withParanInks(starParans, b.inks) !== starParans) sameBad.push('star parans');
      if (withUniformInk(stars, b.inks.star) !== stars) sameBad.push('star lines');
      if (withMinorInks(minorL, b.inks) !== minorL) sameBad.push('minor lines');
      if (withMinorInks(minorZ, b.inks) !== minorZ) sameBad.push('minor zenith coins');
    }
    checkAll(`1k ${t}: star lines, star parans, catalog lines and coins come back as the same objects; planet parans take the map ink (${t === 'dark' ? 'unchanged on Dark' : 'the Moon’s slate'})`, sameN, sameBad);
    if (t !== 'dark') check(`1k ${t}: … over parans that really include the Moon's`, moonParans > 0, `${moonParans}`);
  }
}

// ── §2 The stylesheet mirror (TWO PARTS) ─────────────────────────────────────────────────────
const SRC = resolve(process.cwd(), 'src');
const indexCss = readFileSync(join(SRC, 'index.css'), 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
/** Top-level rules only (an @media block is skipped whole): selector → declarations. */
function topLevelBlocks(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const s = stripComments(css);
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf('{', i);
    if (open < 0) break;
    const selector = s.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < s.length && depth > 0) {
      if (s[j] === '{') depth += 1;
      else if (s[j] === '}') depth -= 1;
      j += 1;
    }
    out.push({ selector, body: s.slice(open + 1, j - 1) });
    i = j;
  }
  return out;
}
function declarations(body: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of body.split(';')) {
    const k = part.indexOf(':');
    if (k < 0) continue;
    const name = part.slice(0, k).trim();
    const value = part.slice(k + 1).trim().replace(/\s+/g, ' ');
    if (name) m.set(name, value);
  }
  return m;
}
{
  const blocks = topLevelBlocks(indexCss);
  const bySelector = (sel: string) =>
    blocks.filter((b) => b.selector.replace(/"/g, "'") === sel).map((b) => declarations(b.body));
  const rootDecls = new Map<string, string>();
  for (const d of bySelector(':root')) for (const [k, v] of d) rootDecls.set(k, v);
  const declared: Record<Theme, Map<string, string>> = {
    dark: new Map(rootDecls),
    vintage: new Map(rootDecls),
    glass: new Map(rootDecls),
  };
  for (const t of ['vintage', 'glass'] as const) {
    const own = bySelector(`:root[data-theme='${t}']`);
    check(`2a index.css has a :root[data-theme='${t}'] block`, own.length > 0);
    for (const d of own) for (const [k, v] of d) declared[t].set(k, v);
  }
  const pendingAbsent = new Set<string>();
  const bad: string[] = [];
  let n = 0;
  for (const t of THEMES) {
    const css = declared[t];
    for (const [name, want] of Object.entries(UI_CSS_MIRROR[t])) {
      const got = css.get(name);
      if (got === undefined) {
        if (PENDING_CSS_DECLARATIONS.includes(name)) {
          pendingAbsent.add(name);
          continue;
        }
        bad.push(`${t} ${name}: mirrored, not declared`);
        continue;
      }
      n += 1;
      if (got !== want.replace(/\s+/g, ' ')) bad.push(`${t} ${name}: index.css "${got}" ≠ mirror "${want}"`);
    }
    for (const name of css.keys()) {
      if (!name.startsWith('--')) continue;
      if (!(name in UI_CSS_MIRROR[t]) && !(name in UNMIRRORED_CSS)) bad.push(`${t} ${name}: declared, neither mirrored nor in UNMIRRORED_CSS`);
    }
  }
  checkAll('2b UI_CSS_MIRROR is index.css, theme by theme (Dark = :root), and every declared property is mirrored or listed', n, bad);
  if (pendingAbsent.size) {
    skip(`2c the pending declarations (${[...pendingAbsent].join(', ')})`,
      'not in index.css yet — the stylesheet phase adds them; they are checked like the rest once present');
  } else {
    check('2c every pending declaration is now in index.css — empty PENDING_CSS_DECLARATIONS', true);
  }

  // Every -rgb pair names the same colour as its hex.
  const pairBad: string[] = [];
  let pairs = 0;
  for (const t of THEMES) {
    for (const [name, v] of declared[t]) {
      if (!name.endsWith('-rgb')) continue;
      const hex = declared[t].get(name.slice(0, -4));
      if (hex === undefined || v.startsWith('var(') || hex.startsWith('var(')) continue;
      pairs += 1;
      const a = parseColor(v);
      const b = parseColor(hex);
      if (!a || !b || Math.round(a.r) !== Math.round(b.r) || Math.round(a.g) !== Math.round(b.g) || Math.round(a.b) !== Math.round(b.b)) {
        pairBad.push(`${t} ${name} ${v} vs ${hex}`);
      }
    }
  }
  checkAll('2d every declared -rgb pair is its colour', pairs, pairBad);

  // Every bound (non-fallback) CSS token is a mirrored property — all three themes, or (a
  // 'color?' token, declared only where the theme sets it) at least one.
  const boundBad: string[] = [];
  let bound = 0;
  for (const d of TOKENS) {
    const c = d.css;
    if (!c || c.fallback) continue;
    bound += 1;
    const names = c.rgbPair ? [c.name, `${c.name}-rgb`] : [c.name];
    for (const name of names) {
      const inThemes = THEMES.filter((t) => name in UI_CSS_MIRROR[t]);
      if (d.kind === 'color?' ? inThemes.length === 0 : inThemes.length !== THEMES.length) {
        boundBad.push(`${d.id} ${name} (in ${inThemes.join('/') || 'none'})`);
      }
    }
  }
  checkAll('2e every token bound to a declared property is in the mirror', bound, boundBad);

  // No stylesheet anywhere declares a fallback token (other than resetting it to initial),
  // or the canonical literal would never be what an untouched theme draws.
  const cssFiles: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.css')) cssFiles.push(p);
    }
  };
  walk(SRC);
  const declBad: string[] = [];
  for (const file of cssFiles) {
    const text = stripComments(readFileSync(file, 'utf8'));
    for (const name of CANONICAL_RESET_VARS) {
      const re = new RegExp(`${name.replace(/[-]/g, '\\-')}\\s*:\\s*([^;}]+)`, 'g');
      for (const m of text.matchAll(re)) if (m[1].trim() !== 'initial') declBad.push(`${file.slice(SRC.length + 1)} declares ${name}: ${m[1].trim()}`);
    }
  }
  checkAll(`2f no stylesheet under src/ declares a fallback-consumed token (${cssFiles.length} files)`, CANONICAL_RESET_VARS.length, declBad);

  // The panel tone a built-in reports is the colour-scheme its stylesheet block declares.
  const toneBad = THEMES.filter((t) => declared[t].get('color-scheme') !== builtinPalette(t).attrs.panelTone)
    .map((t) => `${t}: color-scheme ${declared[t].get('color-scheme')} vs tone ${builtinPalette(t).attrs.panelTone}`);
  checkAll('2g each built-in\'s panel tone is the color-scheme its stylesheet block declares', THEMES.length, toneBad);
}

// ── §3 The report paper's canonical reset (TWO PARTS) ───────────────────────────────────────
// A fallback-consumed token is declared by no stylesheet, so what an untouched theme draws —
// and what the report paper's `.palette-canonical` reset returns it to — is whatever literal
// the CONSUMER wrote as its var() fallback. Two parts, then: (a) the reset names exactly the
// engine's fallback tokens, and (b) every hand-written fallback is the engine's own built-in
// for that token (ELEMENT_INK, MODALITY_INK, ASPECT_INK_CANON, PLANET_COLORS,
// WHEEL_MOTION_INK_CANON, ui.onAccent's ink). planetInk() and its siblings build their
// fallbacks from those constants, so (b) is for the literals written out by hand — the ones
// that can drift. A token whose built-in is null ('the component's own') must fall back to the
// component's own theme value, never to a literal: a literal there would be a colour no
// palette chose, drawn on every built-in. (Integrator, 2026-10-06.)
{
  const rule = topLevelBlocks(indexCss).filter((b) => b.selector.split(',').map((s) => s.trim()).includes('.palette-canonical'));
  if (!rule.length) {
    skip('3a .palette-canonical resets exactly CANONICAL_RESET_VARS', 'the rule is not in index.css yet (the stylesheet phase adds it)');
  } else {
    const decl = new Map<string, string>();
    for (const r of rule) for (const [k, v] of declarations(r.body)) if (k.startsWith('--')) decl.set(k, v);
    const missing = CANONICAL_RESET_VARS.filter((n) => decl.get(n) !== 'initial');
    const extra = [...decl.keys()].filter((n) => !CANONICAL_RESET_VARS.includes(n));
    check(`3a .palette-canonical resets exactly CANONICAL_RESET_VARS, each to initial (${CANONICAL_RESET_VARS.length})`,
      missing.length === 0 && extra.length === 0, `missing ${missing.join(', ')}; extra ${extra.join(', ')}`);
  }

  // (b) The consumers. Each fallback token's canonical value: its built-in, when every theme
  // agrees on one (all of them do, or are null). The -rgb twin of a pair is the triplet form.
  const canon = new Map<string, string | null>();
  for (const d of TOKENS) {
    const c = d.css;
    if (!c?.fallback) continue;
    const vals = THEMES.map((t) => d.builtin(t));
    const same = vals.every((v) => sameTokenValue(v, vals[0]));
    const v = same && typeof vals[0] === 'string' ? vals[0] : null;
    canon.set(c.name, v);
    if (c.rgbPair) canon.set(`${c.name}-rgb`, v);
  }
  const srcFiles: string[] = [];
  const walkSrc = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walkSrc(p);
      else if (/\.(css|tsx?)$/.test(f)) srcFiles.push(p);
    }
  };
  walkSrc(SRC);
  // Comments describe consumers (and quote their var() forms); only code consumes.
  const stripCode = (text: string, css: boolean) =>
    css ? stripComments(text) : text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  /** The fallback of a var() opened at `at` (index just past the comma), balanced. */
  const fallbackAt = (s: string, at: number): string => {
    let depth = 0;
    for (let i = at; i < s.length; i++) {
      if (s[i] === '(') depth += 1;
      else if (s[i] === ')') {
        if (depth === 0) return s.slice(at, i).trim();
        depth -= 1;
      }
    }
    return s.slice(at).trim();
  };
  const sameColour = (a: string, b: string) => {
    const x = parseColor(a);
    const y = parseColor(b);
    if (!x || !y) return a.replace(/\s+/g, '') === b.replace(/\s+/g, '');
    return Math.round(x.r) === Math.round(y.r) && Math.round(x.g) === Math.round(y.g) &&
      Math.round(x.b) === Math.round(y.b) && Math.abs((x.a ?? 1) - (y.a ?? 1)) < 0.005;
  };
  const tripletOf = (c: string) => {
    const x = parseColor(c);
    return x ? `${Math.round(x.r)}, ${Math.round(x.g)}, ${Math.round(x.b)}` : c;
  };
  const litBad: string[] = [];
  const ownBad: string[] = [];
  let lit = 0;
  let own = 0;
  for (const file of srcFiles) {
    const text = stripCode(readFileSync(file, 'utf8'), file.endsWith('.css'));
    for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)\s*,/g)) {
      const name = m[1];
      if (!canon.has(name)) continue;
      const fb = fallbackAt(text, m.index! + m[0].length);
      if (fb.includes('${')) continue; // built from the TS constants (planetInk() and kin)
      const where = `${file.slice(SRC.length + 1)} ${name}`;
      const want = canon.get(name)!;
      if (want === null) {
        own += 1;
        if (parseColor(fb)) ownBad.push(`${where}: falls back to the literal ${fb}`);
        continue;
      }
      lit += 1;
      const ok = name.endsWith('-rgb') ? fb.replace(/\s+/g, '') === tripletOf(want).replace(/\s+/g, '') : sameColour(fb, want);
      if (!ok) litBad.push(`${where}: fallback ${fb} ≠ the engine's ${want}`);
    }
  }
  checkAll(`3b every hand-written fallback literal of a fallback token is the engine's built-in (${srcFiles.length} files)`, lit, litBad);
  checkAll('3c … and a token whose built-in is "the component\'s own" falls back to a theme value, never a literal', own, ownBad);
}

// ── §4 Seeds move what follows them, and nothing else (IDENTITY) ────────────────────────────
// For every token something else follows: move it, and require (a) that only it and its
// declared descendants moved, (b) that among the tokens whose rule actually READ it, one
// moved. Then named seed → descendant pairs: the descendant moves with its seed alone, and
// stays put when it has an override of its own — two parts, required to disagree.
const dependents = new Map<string, Set<string>>();
for (const d of TOKENS) for (const dep of d.deps ?? []) (dependents.get(dep) ?? dependents.set(dep, new Set()).get(dep)!).add(d.id);
const closureOf = (id: string): Set<string> => {
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    for (const c of dependents.get(stack.pop()!) ?? []) {
      if (out.has(c)) continue;
      out.add(c);
      stack.push(c);
    }
  }
  return out;
};
const movedValue = (d: TokenDef, from: TokenValue): TokenValue => {
  if (d.kind === 'enum') return d.options!.find((o) => o !== from)!;
  if (d.kind === 'dash') return d.presets!.find((p) => !sameTokenValue(p, from))!;
  if (d.kind === 'number' || d.kind === 'number?') {
    const r = d.range!;
    const v = typeof from === 'number' ? from : r.min;
    return v + r.step * 4 <= r.max ? Number((v + r.step * 4).toFixed(4)) : r.min;
  }
  const a = '#13a86b';
  return typeof from === 'string' && parseColor(from) && contrastRatio(from, a) < 1.3 ? '#d0217a' : a;
};
{
  const leakBad: string[] = [];
  const liveBad: string[] = [];
  let tried = 0;
  let live = 0;
  for (const t of THEMES) {
    const B = builtinPalette(t).values;
    for (const id of dependents.keys()) {
      const d = tokenDef(id)!;
      if (d.locked) continue;
      // An enum is tried at EVERY other option: one of them may legitimately draw what the
      // built-in draws (glyphs in 'own' mode are the canonical colours, which the built-in
      // glyphs already are), so "a reader moved" is asked of the token, not of one option.
      const values = d.kind === 'enum' ? d.options!.filter((o) => o !== B[id]) : [movedValue(d, B[id])];
      let readers: string[] = [];
      let anyMoved = false;
      for (const v of values) {
        const p = resolve2(t, { [id]: v });
        tried += 1;
        const changed = changedIds(p);
        const allowed = closureOf(id);
        const leaked = changed.filter((c) => !allowed.has(c));
        if (!changed.includes(id)) leakBad.push(`${t} ${id}=${JSON.stringify(v)}: the override did not take`);
        if (leaked.length) leakBad.push(`${t} ${id}=${JSON.stringify(v)} moved ${leaked.join(', ')}`);
        const tr = paletteTrace(p);
        const r = TOKENS.filter((x) => tr[x.id]?.includes(id)).map((x) => x.id);
        readers = [...new Set([...readers, ...r])];
        if (r.some((x) => changed.includes(x))) anyMoved = true;
      }
      if (readers.length) {
        live += 1;
        if (!anyMoved) liveBad.push(`${t} ${id}: none of ${readers.join(', ')} moved`);
      }
    }
  }
  checkAll('4a moving any token moves only it and its declared descendants (every base)', tried, leakBad);
  checkAll('4b … and at least one token whose rule read it moves with it', live, liveBad);

  // Named pairs, with a context where needed (a mode the descendant only follows inside).
  const PAIRS: [seed: string, seedValue: TokenValue | null, desc: string[], ctx?: Record<string, TokenValue>][] = [
    ['ui.panel', '#f4efe6', ['ui.page', 'ui.menu', 'ui.scrim']],
    ['ui.panel', '#1b2230', ['ui.page', 'ui.menu', 'ui.scrim']],
    ['ui.text', '#d9f2e4', ['ui.textStrong', 'ui.textBody', 'ui.textMuted', 'ui.tint']],
    ['ui.accent', '#3b7bd8', ['ui.accentHover', 'ui.onAccent']],
    ['map.land', '#c9b07a', ['marks.halo', 'marks.zenithDisc', 'worldFallback.land', 'basemap.land', 'basemap.landcover', 'geo.grid.line']],
    ['map.water', '#2d5d8c', ['worldFallback.ocean', 'basemap.water', 'basemap.waterway']],
    ['planet.Sun', '#ff00aa', ['map.ink.Sun', 'paran.Sun', 'glyph.Sun']],
    ['element.fire', '#ff2200', ['geoZone.fire.cardinal', 'geoZone.fire.fixed', 'geoZone.fire.mutable']],
    ['element.water', '#0044ff', ['wheel.sign.water'], { 'wheel.signMode': 'element' }],
    ['aspect.hard', '#aa00aa', ['aspect.opposition', 'aspect.square', 'aspect.contraparallel']],
    ['aspect.mode', 'ink', ['aspect.conjunction', 'aspect.trine', 'aspect.parallel']],
    ['lines.mode', 'ink', ['map.ink.Sun', 'paran.Mars', 'lines.star', 'lines.minor.3', 'lines.ecliptic', 'nodePair.nn']],
    ['lines.ink', '#ff00ff', ['map.ink.Sun', 'lines.star'], { 'lines.mode': 'ink' }],
    ['wheel.glyphMode', 'ink', ['glyph.Sun', 'glyph.Moon']],
    ['fx.preset', 'flat', ['fx.frost', 'fx.shadows', 'fx.glows', 'fx.motion']],
  ];
  const pairBad: string[] = [];
  let pairN = 0;
  for (const t of THEMES) {
    for (const [seed, sv, descs, ctx] of PAIRS) {
      const seedOnly = resolve2(t, { ...ctx, [seed]: sv });
      const base = resolve2(t, { ...ctx });
      for (const desc of descs) {
        pairN += 1;
        if (sameTokenValue(seedOnly.values[desc], base.values[desc])) {
          pairBad.push(`${t}: ${seed} → ${desc} did not move`);
          continue;
        }
        const dd = tokenDef(desc)!;
        const own = dd.kind === 'enum' ? dd.options!.find((o) => o !== seedOnly.values[desc] && o !== base.values[desc]) ?? (base.values[desc] as string)
          : '#123456';
        const both = resolve2(t, { ...ctx, [seed]: sv, [desc]: own });
        const want = sanitizeOverrides({ [desc]: own })[desc];
        if (!sameTokenValue(both.values[desc], want)) pairBad.push(`${t}: ${desc} overridden did not stay put when ${seed} moved`);
        if (sameTokenValue(seedOnly.values[desc], want)) pairBad.push(`${t}: ${desc} — the seed alone landed on the override's value, so the two parts can't disagree`);
      }
    }
  }
  checkAll('4c each named descendant moves with its seed, and stays put under its own override when the seed moves', pairN, pairBad);

  // The panel tone follows the panel's own lightness — and a flip lands the text, the accent
  // and the marker colours on that tone's own palette (Glass's for light, Dark's for dark).
  const toneBad: string[] = [];
  let toneN = 0;
  for (const t of THEMES) {
    for (const [panel, tone, home] of [['#f4efe6', 'light', 'glass'], ['#1b2230', 'dark', 'dark']] as const) {
      toneN += 1;
      const p = resolve2(t, { 'ui.panel': panel });
      if (p.attrs.panelTone !== tone) toneBad.push(`${t} ${panel}: tone ${p.attrs.panelTone}`);
      if (builtinPalette(t).attrs.panelTone === tone) continue;
      const h = builtinPalette(home).values;
      for (const id of ['ui.text', 'ui.textMuted', 'ui.accent', 'ui.accentHover', 'ui.cool', 'ui.danger', 'ui.tint']) {
        if (!sameTokenValue(p.values[id], h[id])) toneBad.push(`${t} → ${tone}: ${id} ${p.values[id]} is not ${home}'s ${h[id]}`);
      }
    }
  }
  checkAll('4d the panel tone follows the panel, and a tone flip lands the text and accents on that tone\'s own palette', toneN, toneBad);

  // The one-ink colour moves nothing that is drawn while the lines are in planet mode.
  const inkBad: string[] = [];
  for (const t of THEMES) {
    const b = builtinPalette(t);
    const p = resolve2(t, { 'lines.ink': '#ff00ff' });
    const changed = changedIds(p);
    const allowed = new Set(['lines.ink', 'lines.overlay.ink', 'lines.aspect.ink']);
    if (p.inks !== b.inks) inkBad.push(`${t}: inks changed`);
    if (p.map !== b.map) inkBad.push(`${t}: map style changed`);
    if (spriteSpecFor(p) !== spriteSpecFor(b)) inkBad.push(`${t}: sprites changed`);
    if (Object.keys(p.css).length) inkBad.push(`${t}: css ${Object.keys(p.css).join(', ')}`);
    if (changed.some((c) => !allowed.has(c))) inkBad.push(`${t}: moved ${changed.filter((c) => !allowed.has(c)).join(', ')}`);
    if (p.inks.planet.Moon !== b.inks.planet.Moon) inkBad.push(`${t}: the Moon moved`);
  }
  checkAll('4e the one-ink colour, set while the lines are in planet mode, moves no line, sprite, style or CSS', THEMES.length, inkBad);

  // Tokens nothing else follows still move what they are for: their section.
  const secBad: string[] = [];
  for (const t of THEMES) {
    const b = builtinPalette(t);
    const w = resolve2(t, { 'lines.weight': 1.5 });
    if (w.map === b.map || w.map.natal.mcWidth !== Math.round(LINE_STYLE_BUILTIN.natal.mcWidth * 1.5 * 1000) / 1000 ||
      w.map.geoGrid.width !== Math.round(GEO_GRID_STYLE[t].width * 1.5 * 1000) / 1000) secBad.push(`${t}: line weight`);
    if (w.inks !== b.inks) secBad.push(`${t}: line weight moved the inks`);
    const f = resolve2(t, { 'fx.preset': 'flat' });
    if (f.attrs.frost !== 'solid' || f.attrs.motion !== 'reduced' || f.inks !== b.inks || f.map !== b.map) secBad.push(`${t}: effects preset`);
    const o = resolve2(t, { 'lines.overlay.mode': 'ink' });
    if (o.inks.overlay !== o.values['lines.overlay.ink'] || o.inks.planet.Sun !== b.inks.planet.Sun ||
      o.map.overlayNodePair.nn !== o.inks.overlay) secBad.push(`${t}: overlay one-ink`);
    const s = resolve2(t, { 'map.basemap': t === 'dark' ? 'glass' : 'dark' });
    if (s.map.basemap === b.map.basemap || s.inks === b.inks) secBad.push(`${t}: basemap switch`);
  }
  checkAll('4f line weight, effects, overlay ink and basemap move their own section (and the weight scales every width)', THEMES.length * 4, secBad);
}

// ── §5 Garbage (IDENTITY) ────────────────────────────────────────────────────────────────────
{
  const hostile = new Proxy({}, {
    ownKeys: () => ['ui.panel', 'ui.text'],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    get: () => {
      throw new Error('hostile getter');
    },
  });
  const throwsKeys = new Proxy({}, { ownKeys: () => { throw new Error('hostile keys'); } });
  const GARBAGE: unknown[] = [
    undefined, null, 0, 42, NaN, '', 'ui.panel', true, [], ['ui.panel'], () => 1, Symbol('x'),
    { foo: 1 }, { __proto__: { 'ui.panel': '#000' } }, JSON.parse('{"__proto__": {"ui.panel": "#000"}}'),
    { constructor: '#fff', toString: '#000' }, Object.create(null),
    { 'ui.panel': 'not a colour' }, { 'ui.panel': 12 }, { 'ui.panel': null }, { 'ui.panel': ['#000'] },
    { 'ui.panel': '#12345' }, { 'ui.panel': 'rgb(1,2)' }, { 'ui.panel': 'x'.repeat(5000) },
    { 'lines.weight': 'big' }, { 'lines.weight': NaN }, { 'lines.weight': Infinity }, { 'lines.weight': null },
    { 'map.basemap': 'mars' }, { 'map.basemap': null }, { 'fx.preset': 'FLAT' },
    { 'lineStyle.overlay.meridian.dash': [1, 2, 3] }, { 'lineStyle.overlay.meridian.dash': 'x' },
    { 'lineStyle.overlay.meridian.dash': [3, -3] }, { 'lineStyle.overlay.meridian.dash': [] },
    { 'ui.gated': '#000000' }, { 'ui.advanced': '#000000' }, { 'ui.gatedInk': '#000000' },
    { 'planet.Vulcan': '#000000' }, { 'lines.minor.12': '#000000' },
    hostile, throwsKeys,
  ];
  const bad: string[] = [];
  let n = 0;
  for (const t of THEMES) {
    const b = builtinPalette(t);
    GARBAGE.forEach((g, i) => {
      n += 1;
      try {
        if (Object.keys(sanitizeOverrides(g)).length) bad.push(`${t} #${i}: sanitized to ${JSON.stringify(sanitizeOverrides(g))}`);
        if (resolvePalette(t, g) !== b) bad.push(`${t} #${i}: not the built-in`);
        const w = walkPalette(t, g);
        if (!deepEqual(w.values, b.values) || !deepEqual(w.css, b.css) || w.key !== t) bad.push(`${t} #${i}: walk differs`);
      } catch (e) {
        bad.push(`${t} #${i}: threw ${(e as Error).message}`);
      }
    });
  }
  checkAll('5a garbage overrides never throw, sanitize to nothing and resolve to the built-in', n, bad);

  const baseOk = (() => {
    try {
      return resolvePalette('mars' as Theme, { 'ui.panel': '#000' }).base === 'vintage' &&
        resolvePalette(undefined as unknown as Theme) === builtinPalette('vintage');
    } catch {
      return false;
    }
  })();
  check('5b an unknown base resolves on Earth (the default), never throws', baseOk);

  const s = sanitizeOverrides({
    'lines.weight': 5, 'map.orbStrength': 0.53, 'ui.panel': '#ABC', 'ui.accent': '#11223344', 'ui.scrim': '#11223344',
    'lineStyle.overlay.meridian.dash': [4, 2], 'basemap.labelHaloWidth': null, 'wheel.face': null, 'ui.nonsense': '#fff',
  });
  const want = {
    'ui.panel': '#aabbcc', 'ui.accent': '#112233', 'ui.scrim': '#11223344', 'lines.weight': 2,
    'lineStyle.overlay.meridian.dash': [4, 2], 'basemap.labelHaloWidth': null, 'map.orbStrength': 0.55, 'wheel.face': null,
  };
  check('5c sanitizing normalizes rather than rejects what it can: clamp, step, lowercase hex, alpha only where taken, nulls where allowed',
    deepEqual(s, want) && Object.keys(s).join() === TOKENS.filter((d) => d.id in want).map((d) => d.id).join(),
    JSON.stringify(s));
  check('5d a sanitized dash is the preset itself (so it can never be mutated into a non-preset)',
    DASH_PRESETS.includes(s['lineStyle.overlay.meridian.dash'] as readonly number[]));
}

// ── §6 Contrast floors (IDENTITY) ────────────────────────────────────────────────────────────
{
  const PANELS = ['#ffffff', '#f4efe6', '#e8e8e8', '#cfd8dc', '#bdbdbd', '#9e9e9e', '#808080', '#767676', '#5a5a5a',
    '#3c3c3c', '#202020', '#000000', '#1b2230', '#2a2017', '#503d2d', '#ffe9a8', '#7fb3ff', '#ff7f7f', '#3a6b35', '#6a1b9a'];
  const TEXTS = ['#000000', '#ffffff', '#777777', '#888888', '#2b3140', '#f0e2c0', '#d0d0d0', '#404040'];
  const ACCENTS = ['#f5b83d', '#c97b1a', '#ffff00', '#00ffff', '#ff00ff', '#777777', '#808080', '#7a7a7a', '#3b7bd8',
    '#e85a4f', '#2e7d32', '#ffffff', '#000000', '#ff7f50', '#40e0d0', '#9370db', '#808000', '#008080', '#d2691e', '#a0a0ff'];
  const phBad: string[] = [];
  const gatedBad: string[] = [];
  let ph = 0;
  for (const t of THEMES) {
    for (const panel of PANELS) {
      for (const text of [null, ...TEXTS]) {
        const p = resolve2(t, text ? { 'ui.panel': panel, 'ui.text': text } : { 'ui.panel': panel });
        ph += 1;
        const r = contrastRatio(String(p.values['ui.textPlaceholder']), panel);
        if (r < 4.5) phBad.push(`${t} panel ${panel} text ${text ?? '(auto)'}: ${r.toFixed(2)}`);
        const g = contrastRatio(String(p.values['ui.gatedInk']), panel);
        if (g < 4.5) gatedBad.push(`${t} panel ${panel}: ${g.toFixed(2)}`);
      }
    }
  }
  checkAll('6a the placeholder clears 4.5:1 against the panel for every sampled panel and text', ph, phBad);
  checkAll('6b the gated ink clears 4.5:1 against every sampled panel', ph, gatedBad);
  const acBad: string[] = [];
  let ac = 0;
  for (const t of THEMES) {
    for (const accent of ACCENTS) {
      const p = resolve2(t, { 'ui.accent': accent });
      if (sameTokenValue(p.values['ui.accent'], builtinPalette(t).values['ui.accent'])) continue;
      ac += 1;
      const r = contrastRatio(String(p.values['ui.onAccent']), accent);
      if (r < 4.5) acBad.push(`${t} ${accent}: ${r.toFixed(2)}`);
      if (p.css['--on-accent'] === undefined) acBad.push(`${t} ${accent}: --on-accent not written`);
    }
  }
  checkAll('6c text on the reader\'s own accent clears 4.5:1 for every sampled accent', ac, acBad);
}

// ── §7 Sprites agree with the lines (TWO PARTS) ─────────────────────────────────────────────
// The shape of verify-minor-bodies 7f: what the map bakes for a body (its glyph, its zenith
// ring, its coin) must be the colour its lines are drawn in, in every palette — the built-ins
// and custom ones that move the inks.
{
  const CUSTOM: Record<string, TokenValue>[] = [
    {},
    { 'lines.mode': 'ink' },
    { 'lines.mode': 'ink', 'lines.ink': '#2a1f12' },
    { 'planet.Moon': '#cfd6e4', 'planet.Sun': '#000000' },
    { 'map.basemap': 'dark' },
    { 'map.basemap': 'outline', 'map.land': '#fdfdfd' },
    { 'map.land': '#222222' },
  ];
  const bad: string[] = [];
  let n = 0;
  let distinct = 0;
  for (const t of THEMES) {
    const seen = new Set<string>();
    for (const o of CUSTOM) {
      const p = resolve2(t, o);
      const spec = spriteSpecFor(p);
      seen.add(spec.key);
      if (spriteSpecFor(p) !== spec) bad.push(`${t} ${JSON.stringify(o)}: spec not identity-stable`);
      for (const g of GEOM) {
        for (const fc of [withLineInks(g.lines, p.inks), withLineInks(g.zenith, p.inks)] as PlanetFC[]) {
          for (const f of fc.features) {
            n += 1;
            if (f.properties.color !== spec.planet[f.properties.planet]) bad.push(`${t} ${JSON.stringify(o)} ${f.properties.planet}`);
          }
        }
        const stars = withUniformInk(generateStarLines(starsOfDate(g.jd, 'bright'), g.meridianLng, null, STAR_LINE_COLORS.dark), p.inks.star);
        for (const f of stars.features) {
          n += 1;
          if (f.properties.color !== spec.star) bad.push(`${t} star ${f.properties.star}`);
        }
        const minor = withMinorInks(generateMinorLines(g.minorPositions, g.meridianLng, decorFor('dark')), p.inks);
        for (const f of minor.features) {
          n += 1;
          const n0 = f.properties.number;
          const icon = minorIconId(n0);
          const coinSlot = icon.startsWith(MINOR_COIN_PREFIX) || icon.startsWith(MINOR_HOLLOW_COIN_PREFIX)
            ? Number(icon.slice(icon.lastIndexOf('-') + 1)) : minorPaletteSlot(n0);
          if (f.properties.color !== spec.minor[minorPaletteSlot(n0)] || spec.minor[coinSlot] !== f.properties.color) {
            bad.push(`${t} minor ${n0}: line ${f.properties.color}, coin ${spec.minor[coinSlot]}`);
          }
        }
      }
    }
    distinct += seen.size;
  }
  checkAll('7a every glyph, zenith ring, star spark and catalog coin is baked in the colour its line is drawn in', n, bad);
  check('7b … over palettes that really do move the sprites (distinct specs per theme > 1)', distinct > THEMES.length, `${distinct}`);
  const b = builtinPalette('glass');
  check('7c a palette that moves no sprite input hands back the built-in\'s own spec object',
    spriteSpecFor(resolve2('glass', { 'ui.panel': '#202020', 'lines.weight': 1.2 })) === spriteSpecFor(b));
}

// ── §7 (cont.) A live re-bake redraws what moved, and only that (TWO PARTS) ─────────────────
// glyphImages bakes every sprite from one list (spriteJobs), each job declaring the spec values
// its pixels are drawn from; a live re-bake redraws the jobs whose declared inputs moved
// (changedSpriteIds). The declaration is held here to what the rasterizers REALLY read: each job
// is drawn on a recording canvas (every property set and call made, in order), and between two
// specs the images whose drawing differs must be exactly the ones the diff names — a miss would
// leave a stale sprite on the map, an extra one is a bake for nothing. (2026-10-06)
{
  type Recorded = { log: string };
  const recordingCanvas = () => {
    const log: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get(_t, k) {
          if (k === 'getImageData') return (): Recorded => ({ log: log.join(';') });
          if (k === 'measureText') {
            return (text: string) => {
              log.push(`measureText(${text})`);
              return { width: 10, actualBoundingBoxLeft: 1, actualBoundingBoxRight: 9, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
            };
          }
          return (...args: unknown[]) => void log.push(`${String(k)}(${args.map(String).join(',')})`);
        },
        set(_t, k, v) {
          log.push(`${String(k)}=${String(v)}`);
          return true;
        },
      },
    );
    return { width: 0, height: 0, getContext: () => ctx };
  };
  const g = globalThis as unknown as { document?: unknown };
  const savedDocument = g.document;
  g.document = { createElement: () => recordingCanvas() };
  try {
    const SPECS = new Set<SpriteSpec>();
    for (const t of THEMES) {
      for (const o of [
        {},
        { 'lines.mode': 'ink' },
        { 'planet.Sun': '#000000' },
        { 'planet.Moon': '#cfd6e4', 'lines.minor.3': '#00aa55' },
        { 'marks.zenithDisc': '#f0e0c0' },
        { 'marks.halo': '#202020' },
        { 'marks.spriteHalo': 'off' },
        { 'lines.star': '#aa00aa' },
      ] as Record<string, TokenValue>[]) {
        SPECS.add(spriteSpecFor(resolve2(t, o)));
      }
    }
    const prints = new Map<SpriteSpec, Map<string, string>>();
    for (const spec of SPECS) {
      prints.set(spec, new Map(spriteJobs(spec).map((j) => [j.id, (j.draw() as unknown as Recorded).log])));
    }
    const bad: string[] = [];
    let pairs = 0;
    let redrawn = 0;
    for (const a of SPECS) {
      for (const b of SPECS) {
        if (a === b) continue;
        pairs += 1;
        const pa = prints.get(a)!;
        const pb = prints.get(b)!;
        const declared = new Set(changedSpriteIds(a, b));
        redrawn += declared.size;
        for (const [id, fp] of pb) {
          const moved = pa.get(id) !== fp;
          if (moved && !declared.has(id)) bad.push(`${a.key} → ${b.key}: ${id} drew differently and was not re-baked`);
          if (!moved && declared.has(id)) bad.push(`${a.key} → ${b.key}: ${id} re-baked for nothing`);
        }
        if (pa.size !== pb.size) bad.push(`${a.key} → ${b.key}: ${pa.size} vs ${pb.size} sprites`);
      }
    }
    checkAll(`7d a live re-bake redraws exactly the sprites whose drawing changed (${SPECS.size} specs, ${redrawn} redraws)`, pairs, bad);
    const vintage = spriteSpecFor(builtinPalette('vintage'));
    const sun = changedSpriteIds(vintage, spriteSpecFor(resolve2('vintage', { 'planet.Sun': '#000000' })));
    const all = spriteJobs(vintage).length;
    check(`7e one body's colour re-bakes its three sprites, not all ${all}`,
      canonList(sun) === canonList(['glyph-Sun', 'zenith-glyph-Sun', 'nadir-glyph-Sun']), sun.join(', '));
  } finally {
    g.document = savedDocument;
  }
}


// ── §8 Map's literals (TWO PARTS) ────────────────────────────────────────────────────────────
// LINE_STYLE_BUILTIN replaced the widths, dashes and opacities written into Map.tsx's layers.
// The built-in MapStyle (which reaches them through the tokens) must equal those literals as
// they stood before the migration — read from git at the pinned commit, read-only — and as
// they stand in the working tree wherever a layer still carries a literal.
const PRE_MIGRATION = '2ecaa913dbb57716f2e0e2a437ea8d7be419ab1c';
function layerPaint(src: string, layer: string): Map<string, string> | null {
  const at = src.indexOf(`id: '${layer}'`);
  if (at < 0) return null;
  const rest = src.slice(at);
  const stops = ['map.addLayer(', 'addArrowLayer(', 'map.addSource('].map((s) => rest.indexOf(s, 1)).filter((i) => i > 0);
  const body = rest.slice(0, stops.length ? Math.min(...stops) : undefined).replace(/\/\/[^\n]*/g, '');
  const out = new Map<string, string>();
  for (const key of ['line-width', 'line-dasharray', 'line-opacity', 'line-color', 'icon-opacity']) {
    const k = body.indexOf(`'${key}':`);
    if (k < 0) continue;
    let i = k + key.length + 3;
    while (/\s/.test(body[i])) i += 1;
    if (body[i] === '[') {
      let depth = 0;
      let j = i;
      for (; j < body.length; j++) {
        if (body[j] === '[') depth += 1;
        else if (body[j] === ']' && --depth === 0) break;
      }
      out.set(key, body.slice(i, j + 1));
    } else {
      const end = body.slice(i).search(/[,\n}]/);
      out.set(key, body.slice(i, i + end).trim());
    }
  }
  return out;
}
const numbersIn = (expr: string) =>
  [...expr.replace(/'[^']*'/g, '').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
{
  const m = builtinPalette('vintage').map;
  // Each layer, and what the built-in MapStyle says its literals are (in source order).
  const EXPECT: Record<string, Partial<Record<'line-width' | 'line-dasharray' | 'line-opacity' | 'icon-opacity', number[]>> & { color?: string }> = {
    'ecliptic-layer': { 'line-width': [m.ecliptic.width], 'line-opacity': [m.ecliptic.opacity], color: m.ecliptic.color },
    'ecliptic-ov-layer': { 'line-width': [m.ecliptic.width], 'line-opacity': [m.ecliptic.opacity], 'line-dasharray': [...m.ecliptic.overlayDash], color: m.ecliptic.color },
    'minor-parans-layer': { 'line-width': [m.minorParan.width] },
    'parans-layer': { 'line-width': [m.paran.width] },
    'local-space-layer-out': { 'line-width': [m.localSpace.width] },
    'local-space-layer-in': { 'line-width': [m.localSpace.width], 'line-dasharray': [...m.localSpace.inboundDash] },
    'angle-lines-layer': { 'line-width': [m.aspect.width], 'line-dasharray': [...m.aspect.dash] },
    'star-lines-layer': { 'line-width': [m.star.width], 'line-opacity': [m.star.opacity], 'line-dasharray': [...m.star.dash] },
    'minor-lines-layer': { 'line-width': [m.minor.mcWidth, m.minor.horizonWidth, m.minor.icWidth, m.minor.vxWidth] },
    'acg-lines-meridian': { 'line-width': [m.natal.mcWidth, m.natal.icWidth] },
    'acg-lines-horizon': { 'line-width': [m.natal.vxWidth, m.natal.horizonWidth] },
    'acg-lines-meridian-pair': { 'line-width': [m.natal.mcWidth, m.natal.icWidth] },
    'acg-lines-horizon-pair': { 'line-width': [m.natal.vxWidth, m.natal.horizonWidth] },
    'local-space-ov-layer': { 'line-width': [m.localSpace.overlayWidth], 'line-dasharray': [...m.localSpace.overlayDash] },
    'minor-parans-ov-layer': { 'line-width': [m.minorParan.width], 'line-dasharray': [...m.minorParan.overlayDash] },
    'parans-ov-layer': { 'line-width': [m.paran.width], 'line-dasharray': [...m.paran.overlayDash] },
    'minor-lines-ov-meridian': { 'line-width': [m.minor.mcWidth, m.minor.icWidth], 'line-dasharray': [...m.minor.overlayMeridianDash] },
    'minor-lines-ov-horizon': { 'line-width': [m.minor.horizonWidth], 'line-dasharray': [...m.minor.overlayHorizonDash] },
    'minor-lines-ov-marks': { 'icon-opacity': [m.minor.overlayMarkOpacity] },
    'acg-lines-ov-meridian': { 'line-width': [m.overlay.mcWidth, m.overlay.icWidth], 'line-dasharray': [...m.overlay.meridianDash] },
    'acg-lines-ov-horizon': { 'line-width': [m.overlay.vxWidth, m.overlay.horizonWidth], 'line-dasharray': [...m.overlay.horizonDash] },
    'acg-lines-ov-pair-nn': { 'line-width': [m.overlay.mcWidth, m.overlay.icWidth, m.overlay.horizonWidth], 'line-dasharray': [...m.overlayNodePair.nnDash] },
    'acg-lines-ov-pair-sn': { 'line-width': [m.overlay.mcWidth, m.overlay.icWidth, m.overlay.horizonWidth], 'line-dasharray': [...m.overlayNodePair.snDash] },
  };
  const compare = (label: string, src: string, requireAll: boolean) => {
    const bad: string[] = [];
    let n = 0;
    for (const [layer, want] of Object.entries(EXPECT)) {
      const paint = layerPaint(src, layer);
      if (!paint) {
        if (requireAll) bad.push(`${layer}: not found`);
        continue;
      }
      for (const [key, nums] of Object.entries(want)) {
        if (key === 'color') {
          const got = paint.get('line-color');
          if (got && /^'#/.test(got)) {
            n += 1;
            if (got !== `'${nums}'`) bad.push(`${layer} line-color ${got} ≠ ${nums}`);
          } else if (requireAll) bad.push(`${layer}: no literal line-color`);
          continue;
        }
        const expr = paint.get(key);
        const got = expr ? numbersIn(expr) : [];
        if (!got.length) {
          // A migrated layer reads the style instead of a literal: nothing to compare here.
          if (requireAll) bad.push(`${layer} ${key}: no literal`);
          continue;
        }
        n += 1;
        if (!deepEqual(got, nums)) bad.push(`${layer} ${key}: Map.tsx ${JSON.stringify(got)} ≠ MapStyle ${JSON.stringify(nums)}`);
      }
    }
    return { n, bad };
  };
  const pinned = ((): string | null => {
    try {
      return execFileSync('git', ['show', `${PRE_MIGRATION}:src/components/Map/Map.tsx`], {
        cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      return null;
    }
  })();
  if (pinned) {
    const r = compare('pinned', pinned, true);
    checkAll(`8a the built-in MapStyle equals Map.tsx's layer literals at ${PRE_MIGRATION.slice(0, 7)} (before the migration), every layer`, r.n, r.bad);
    // The node pairs' colours were PLANET_COLORS lookups, not literals.
    check('8b … and its node-pair colours were the PLANET_COLORS nodes the built-in nodePair holds',
      /'line-color': PLANET_COLORS\.NorthNode/.test(pinned) && /'line-color': PLANET_COLORS\.SouthNode/.test(pinned) &&
        m.nodePair.nn === PLANET_COLORS.NorthNode && m.nodePair.sn === PLANET_COLORS.SouthNode);
  } else {
    skip('8a Map.tsx literals at the pre-migration commit', `git could not show ${PRE_MIGRATION.slice(0, 7)} (no git, or a shallow clone)`);
  }
  const live = readFileSync(join(SRC, 'components/Map/Map.tsx'), 'utf8');
  const r = compare('working tree', live, false);
  if (r.n === 0) {
    if (pinned) skip('8c the working tree\'s remaining literals', 'every layer reads MapStyle now — 8a holds the reference');
    else check('8c something to compare Map.tsx against', false, 'neither the pinned commit nor the working tree has the literals');
  } else {
    checkAll('8c every literal still in the working tree\'s Map.tsx equals the built-in MapStyle', r.n, r.bad);
  }
}

// ── §9 The editor's map preview (TWO PARTS, then IDENTITY and SOURCE TRIPWIRES) ───────────
// While a Custom theme's colour is dragged the map follows a TRANSIENT preview (mapStyleApply,
// the end of the file): the draft's MapStyle through the binding table, and its line inks as one
// colour expression per layer over the data already drawn. The commit path at the gesture's end
// colours the same lines through the ink chain (lib/lineInks) and pushes them. The two must agree,
// feature by feature, or the map jumps on release — so each expression is evaluated by MapLibre's
// own expression engine (the style-spec the map runs) on the features as drawn in the COMMITTED
// inks, and held to the colour the ink chain gives them in the preview's. (2026-10-06)
{
  const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
  const PROP_SPEC = {
    'line-color': styleSpec.latest.paint_line['line-color'],
    'text-color': styleSpec.latest.paint_symbol['text-color'],
    'circle-stroke-color': styleSpec.latest.paint_circle['circle-stroke-color'],
  } as const;
  const compiled = new Map<string, { evaluate: (g: unknown, f: unknown) => unknown }>();
  const evalColor = (value: unknown, prop: keyof typeof PROP_SPEC, props: unknown): string => {
    const k = `${prop}|${JSON.stringify(value)}`;
    let e = compiled.get(k);
    if (!e) {
      const spec = PROP_SPEC[prop] as unknown as StylePropertySpecification;
      if (styleSpec.isExpression(value)) {
        const r = styleSpec.createPropertyExpression(value, spec);
        if (r.result !== 'success') throw new Error(`${JSON.stringify(value).slice(0, 120)}: ${JSON.stringify(r.value)}`);
        e = r.value as unknown as { evaluate: (g: unknown, f: unknown) => unknown };
      } else {
        const c = styleSpec.Color.parse(value as string);
        e = { evaluate: () => c };
      }
      compiled.set(k, e);
    }
    return String(e.evaluate({ zoom: 3 }, { type: 2, properties: props }));
  };
  const asColor = (s: string) => String(styleSpec.Color.parse(s));

  const g0 = GEOM[0];
  const stars = generateStarLines(starsOfDate(g0.jd, 'bright'), g0.meridianLng, null, STAR_LINE_COLORS.dark);
  const minorRaw = generateMinorLines(g0.minorPositions, g0.meridianLng, decorFor('dark')) as FeatureCollection;
  // The parans as their sources carry them: the chart's and the star parans (parans-layer, and a
  // partner's in parans-ov). A catalog body's paran (kind 'minor') rides minor-parans, never these
  // — which matters: a family's fallback reads the colour the feature carries, so it is exact for
  // a feature the family's function leaves alone in BOTH palettes, and an overlay one-ink laid
  // over such a feature would read back as that ink. So the catalog parans are exercised where
  // they are drawn, through the minor family, and through the paran rule's own `kind` branch.
  const planetParans = {
    type: 'FeatureCollection',
    features: [...g0.parans.features, ...g0.starParans.features],
  } as FeatureCollection;
  const catalogParans = g0.parans.features
    .slice(0, 3)
    .map((f, i) => ({ ...f, properties: { ...f.properties, kind: 'minor', number: 1000 + i * 37, color: '#777777' } }));
  const paransRaw = { type: 'FeatureCollection', features: [...planetParans.features, ...catalogParans] } as FeatureCollection;
  const minorParansRaw = { type: 'FeatureCollection', features: catalogParans } as FeatureCollection;
  type Inks = ResolvedPalette['inks'];
  type Fam = { family: PreviewInkFamily; prop: keyof typeof PROP_SPEC; raw: FeatureCollection; ink: (fc: FeatureCollection, inks: Inks) => FeatureCollection };
  const asAny = <T,>(f: (fc: never, inks: Inks) => T) => f as unknown as (fc: FeatureCollection, inks: Inks) => FeatureCollection;
  const FAMILIES: Fam[] = [
    { family: 'planet', prop: 'line-color', raw: g0.lines as FeatureCollection, ink: asAny(withLineInks) },
    { family: 'planet', prop: 'circle-stroke-color', raw: g0.zenith as FeatureCollection, ink: asAny(withLineInks) },
    { family: 'planet', prop: 'line-color', raw: g0.localSpace as FeatureCollection, ink: asAny(withLineInks) },
    { family: 'aspect', prop: 'line-color', raw: g0.angle, ink: asAny(inkAspectLines) },
    { family: 'overlay', prop: 'line-color', raw: g0.lines as FeatureCollection, ink: asAny(inkOverlayLines) },
    { family: 'overlay', prop: 'text-color', raw: g0.localSpace as FeatureCollection, ink: asAny(inkOverlayLines) },
    { family: 'paran', prop: 'line-color', raw: paransRaw, ink: asAny(withParanInks) },
    { family: 'overlayParan', prop: 'line-color', raw: planetParans, ink: asAny(inkOverlayParans) },
    { family: 'star', prop: 'line-color', raw: stars as FeatureCollection, ink: (fc, inks) => withUniformInk(fc as never, inks.star) as FeatureCollection },
    { family: 'minor', prop: 'line-color', raw: minorRaw, ink: asAny(withMinorInks) },
    { family: 'minor', prop: 'line-color', raw: minorParansRaw, ink: asAny(withMinorInks) },
  ];
  const DRAFTS: Record<string, TokenValue>[] = [
    {},
    { 'lines.mode': 'ink' },
    { 'lines.mode': 'ink', 'lines.ink': '#2a1f12' },
    { 'planet.Sun': '#000000', 'planet.Moon': '#cfd6e4' },
    { 'lines.overlay.mode': 'ink', 'lines.overlay.ink': '#123456' },
    { 'lines.aspect.mode': 'ink', 'lines.aspect.ink': '#654321' },
    { 'lines.star': '#aa00aa' },
    { 'lines.minor.3': '#00aa55', 'lines.minor.7': '#5500aa' },
    { 'paran.Venus': '#ff00ff' },
  ];
  // Every (committed → draft) pair: a built-in being edited, and a draft compared back to its
  // base (hold to compare is a preview of the built-in over the custom theme).
  const PAIRS: [ResolvedPalette, ResolvedPalette][] = [];
  for (const t of THEMES) {
    const b = builtinPalette(t);
    for (const o of DRAFTS) {
      const p = resolve2(t, o);
      PAIRS.push([b, p], [p, b]);
    }
    PAIRS.push([resolve2(t, DRAFTS[1]), resolve2(t, DRAFTS[4])]);
  }
  const bad: string[] = [];
  let n = 0;
  let moved = 0;
  for (const [committed, draft] of PAIRS) {
    for (const fam of FAMILIES) {
      const drawn = fam.ink(fam.raw, committed.inks);
      const want = fam.ink(fam.raw, draft.inks);
      const prev = mapPreviewFor(draft, committed.map, committed.inks);
      const numbers = minorNumbersIn([drawn]);
      const value = previewInkValue(fam.family, prev?.inks ?? null, numbers);
      drawn.features.forEach((f, i) => {
        const wantColor = (want.features[i].properties as { color: string }).color;
        const got = evalColor(value, fam.prop, f.properties);
        n += 1;
        if (wantColor !== (f.properties as { color: string }).color) moved += 1;
        if (got !== asColor(wantColor)) {
          bad.push(`${committed.key} → ${draft.key} ${fam.family}: ${JSON.stringify(f.properties).slice(0, 70)} → ${got}, ink chain ${wantColor}`);
        }
      });
    }
  }
  checkAll(`9a every preview colour expression gives each drawn feature the colour the ink chain gives it in the draft (${PAIRS.length} palette pairs)`, n, bad);
  check('9b … over drafts that really do move the line colours', moved > 0, `${moved} of ${n} features moved`);

  // The table against Map.tsx's own layer definitions: every row is a layer whose definition
  // reads that colour from its features (`['get', 'color']`, the value the release restores),
  // and every such layer is either previewed or on the commit-only list with its reason.
  const mapSrc = readFileSync(join(SRC, 'components/Map/Map.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const defs = new Map<string, string>();
  for (const m of mapSrc.matchAll(/\bid: '([a-z0-9-]+)'/g)) {
    const rest = mapSrc.slice(m.index!);
    // To the next layer: its addLayer, or its own `id:` where definitions sit side by side in
    // one object (the geodetic grid's record).
    const nextId = rest.slice(1).search(/\bid: '/);
    const stops = ['map.addLayer(', 'addArrowLayer(', 'map.addSource(', '\n}\n']
      .map((s) => rest.indexOf(s, 1))
      .concat(nextId >= 0 ? [nextId + 1] : [])
      .filter((i) => i > 0);
    defs.set(m[1], rest.slice(0, stops.length ? Math.min(...stops) : undefined).replace(/\/\/[^\n]*/g, ''));
  }
  const arrowHelper = /function addArrowLayer\([\s\S]*?\n\}/.exec(mapSrc)?.[0] ?? '';
  for (const m of mapSrc.matchAll(/addArrowLayer\(\s*map,\s*style,\s*'([a-z0-9-]+)',\s*'([a-z0-9-]+)'/g)) {
    defs.set(m[1], arrowHelper);
  }
  const readsColor = (body: string, prop: string) => body.includes(`'${prop}': ['get', 'color']`);
  const COLOR_PROPS = ['line-color', 'text-color', 'circle-color', 'circle-stroke-color', 'fill-color'];
  const tableBad: string[] = [];
  const seen = new Set<string>();
  for (const b of PREVIEW_INK_BINDINGS) {
    const body = defs.get(b.layer);
    if (!body) tableBad.push(`${b.layer}: no definition in Map.tsx`);
    else if (!readsColor(body, b.prop)) tableBad.push(`${b.layer}: ${b.prop} is not ['get', 'color'] in its definition`);
    if (seen.has(`${b.layer}|${b.prop}`)) tableBad.push(`${b.layer} ${b.prop}: listed twice`);
    seen.add(`${b.layer}|${b.prop}`);
    if (b.layer in PREVIEW_COMMIT_ONLY) tableBad.push(`${b.layer}: both previewed and commit-only`);
  }
  checkAll('9c every preview row is a Map.tsx layer that reads that colour from its features', PREVIEW_INK_BINDINGS.length, tableBad);
  const unclassified: string[] = [];
  let colourLayers = 0;
  for (const [layer, body] of defs) {
    const props = COLOR_PROPS.filter((p) => readsColor(body, p));
    if (!props.length) continue;
    colourLayers += 1;
    for (const p of props) {
      if (!seen.has(`${layer}|${p}`) && !(layer in PREVIEW_COMMIT_ONLY)) unclassified.push(`${layer} ${p}`);
    }
  }
  for (const layer of Object.keys(PREVIEW_COMMIT_ONLY)) if (!defs.has(layer)) unclassified.push(`${layer}: commit-only, but no such layer`);
  checkAll("9d every layer colouring from its features' `color` is previewed or listed commit-only with its reason", colourLayers, unclassified);

  // The preview path is PAINT ONLY: driven against a map that records every call, a preview and
  // its release write paint (and layout) properties and nothing else — no source's data, no
  // image, no style — and the release gives every layer it touched back its own colour.
  const writes: string[] = [];
  const forbidden: string[] = [];
  const lastColor = new Map<string, string>();
  const fakeMap = new Proxy(
    {},
    {
      get(_t, k) {
        if (k === 'getLayer') return (id: string) => ({ id });
        if (k === 'setPaintProperty') {
          return (layer: string, prop: string, v: unknown) => {
            writes.push(`${layer} ${prop}`);
            lastColor.set(`${layer}|${prop}`, JSON.stringify(v));
          };
        }
        if (k === 'setLayoutProperty') return (layer: string, prop: string) => void writes.push(`${layer} ${prop} (layout)`);
        return () => void forbidden.push(String(k));
      },
    },
  ) as unknown as Parameters<typeof applyPreviewInks>[0];
  let storageWrites = 0;
  const gs = globalThis as unknown as { localStorage?: unknown };
  const savedStorage = gs.localStorage;
  gs.localStorage = { getItem: () => null, setItem: () => void (storageWrites += 1), removeItem: () => void (storageWrites += 1) };
  try {
    const committed = builtinPalette('glass');
    const draft = resolve2('glass', { 'lines.mode': 'ink', 'lines.weight': 1.6, 'lines.overlay.mode': 'ink', 'lines.overlay.ink': '#123456' });
    const prev = mapPreviewFor(draft, committed.map, committed.inks)!;
    const applied = new Map<string, string>();
    const nums = minorNumbersIn([minorRaw]);
    const styleWrites = applyMapStyle(fakeMap, committed.map, prev.style);
    const inkWrites = applyPreviewInks(fakeMap, prev.inks, nums, applied);
    const again = applyPreviewInks(fakeMap, prev.inks, nums, applied);
    const touched = [...lastColor.keys()].filter((k) => PREVIEW_INK_BINDINGS.some((b) => `${b.layer}|${b.prop}` === k));
    applyMapStyle(fakeMap, prev.style, committed.map);
    const released = applyPreviewInks(fakeMap, null, [], applied);
    const notBack = touched.filter((k) => lastColor.get(k) !== JSON.stringify(['get', 'color']));
    check('9e a preview writes paint and layout properties only — no data, no image, no style, no storage',
      styleWrites > 0 && inkWrites > 0 && forbidden.length === 0 && storageWrites === 0,
      `style ${styleWrites}, inks ${inkWrites}, other calls: ${forbidden.join(', ') || 'none'}, storage ${storageWrites}`);
    check('9f … a repeat writes nothing (each write re-tiles), and its release gives every layer back its own `color`',
      again === 0 && released === inkWrites && applied.size === 0 && notBack.length === 0, `${again} / ${released} vs ${inkWrites}; not restored: ${notBack.join(', ')}`);
    const same = resolve2('glass', { 'ui.accent': '#3a4b5c' });
    check('9g mapPreviewFor: no preview for a draft the map already draws, no colour layer for inks the lines already carry',
      mapPreviewFor(null, committed.map, committed.inks) === null &&
        mapPreviewFor(committed, committed.map, committed.inks) === null &&
        mapPreviewFor(same, committed.map, committed.inks) === null &&
        mapPreviewFor(resolve2('glass', { 'lines.weight': 1.6 }), committed.map, committed.inks)?.inks === null &&
        prev.inks === draft.inks && prev.style === draft.map);
  } finally {
    gs.localStorage = savedStorage;
  }

  // SOURCE TRIPWIRES — App can't be imported from Node, and the failure these prevent is quiet:
  // a preview that leaks into the committed line set reaches every plugin that keys a cache on
  // it, at input rate. So App's shape is read: the draft is state of its own, written only by the
  // editor context's preview (and dropped by its release), and nothing committed reads it.
  const app = readFileSync(join(SRC, 'App.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const decl = (name: string): string | null => {
    const m = new RegExp(`const ${name}(?::[^=\\n]+)? =\\s`).exec(app);
    if (!m) return null;
    const indent = m.index - app.lastIndexOf('\n', m.index) - 1;
    const end = app.slice(m.index).search(new RegExp(`\\n {0,${indent}}\\S`));
    return end < 0 ? null : app.slice(m.index, m.index + end);
  };
  const DRAFT_NAMES = /\b(mapDraft|mapDraftShown|mapPreview|pushMapDraft)\b/;
  const committedReaders = ['linesStamp', 'collectAllLines', 'allLinesCacheRef', 'inks', 'inksCommitted', 'mapPalette', 'specPalette'];
  const leaks = committedReaders.filter((n) => {
    const d = decl(n);
    return !d || DRAFT_NAMES.test(d);
  });
  check(`9h nothing committed reads the map draft: ${committedReaders.join(', ')}`, leaks.length === 0, `reads it (or not found): ${leaks.join(', ')}`);
  const ctxInks = /\n\s*inks: inksCommitted,\n/.test(app);
  const stamp = decl('linesStamp') ?? '';
  check('9i … the plugins\' inks and linesStamp are the COMMITTED inks', ctxInks && /inksCommitted\.key/.test(stamp));
  const setters = [...app.matchAll(/\bsetMapDraft\(/g)].length;
  const pushers = [...app.matchAll(/\bpushMapDraft\(/g)].length;
  const ctxDecl = decl('themeEditorCtx') ?? '';
  const previewFn = /preview: \(overrides[^)]*\) => \{([\s\S]*?)\n {6}\},/.exec(ctxDecl)?.[1] ?? '';
  check('9j the draft is written only by its throttle, the release in pushMapDraft, and the render that finds it spent',
    setters === 3 && pushers === 1 && /pushMapDraft\(draft\)/.test(previewFn), `setMapDraft ×${setters}, pushMapDraft calls ×${pushers}`);
  check('9k the editor context\'s preview touches the document and the map draft only — never the option, its store or storage',
    /previewAppearance\(draft\)/.test(previewFn) && !/themeOpt|localStorage|save[A-Z]|commit|setCustom/.test(previewFn), previewFn.trim().slice(0, 160));
  check('9l the Map is handed the preview beside the committed style', /mapStyle=\{mapStyle\}[\s\S]{0,400}mapPreview=\{mapPreview\}/.test(app));
}

// ── §10 The complete set agrees with the drawn chain (TWO PARTS) ──────────────────────────
// A plugin reads the complete line set (collectAllLines → lib/lineInks inkAllLines) beside the
// map, and must find each line in the colour the map draws it. The chart's own local space was
// the family left raw — so under a one-ink theme a plugin got it in planet colours beside black
// lines (review, 2026-10-06). Now: under a custom palette it is inked by the drawn chain's own
// function; under a built-in it stays exactly the generator's (the complete set has always
// carried it raw, and a built-in's set must not move).
{
  const g0 = GEOM[0];
  const stars = generateStarLines(starsOfDate(g0.jd, 'bright'), g0.meridianLng, null, STAR_LINE_COLORS.dark) as FeatureCollection;
  const minorRaw = generateMinorLines(g0.minorPositions, g0.meridianLng, decorFor('dark')) as FeatureCollection;
  const raw: AllLines = {
    lines: g0.lines as FeatureCollection,
    angleLines: g0.angle,
    parans: g0.parans as FeatureCollection,
    starLines: stars,
    localSpace: g0.localSpace as FeatureCollection,
    overlayLines: g0.lines as FeatureCollection,
    overlayParans: g0.parans as FeatureCollection,
    overlayLocalSpace: g0.localSpace as FeatureCollection,
    natalAngleLines: g0.angle,
    natalParans: g0.parans as FeatureCollection,
    natalStarLines: stars,
    minorLines: minorRaw,
    overlayMinorLines: null,
    minorParans: { type: 'FeatureCollection', features: [] },
    overlayMinorParans: null,
  };
  const colours = (fc: FeatureCollection) => fc.features.map((f) => (f.properties as { color: string }).color);
  const bad: string[] = [];
  let n = 0;
  let moved = 0;
  for (const t of THEMES) {
    // {} is the BUILT-IN palette: since 2026-10-08 the set's local space is inked under a
    // built-in too, so Radar's reveal draws the Moon's local space in its slate on the light
    // maps as the map does (lib/lineInks inkAllLines says why it wasn't before).
    for (const o of [{}, { 'lines.mode': 'ink' }, { 'lines.mode': 'ink', 'lines.ink': '#000000' }, { 'planet.Moon': '#111111' }] as Record<string, TokenValue>[]) {
      const p = resolve2(t, o);
      const set = inkAllLines(raw, p.inks);
      const drawn = colours(withLineInks(raw.localSpace as PlanetFC, p.inks) as FeatureCollection);
      const got = colours(set.localSpace);
      n += got.length;
      got.forEach((c, i) => {
        if (c !== drawn[i]) bad.push(`${p.key} local space #${i}: set ${c}, drawn ${drawn[i]}`);
      });
      moved += colours(raw.localSpace).filter((c, i) => c !== drawn[i]).length;
    }
  }
  checkAll("10a under every built-in and custom palette, the complete set's local space is in the colours the map draws it in", n, bad);
  check('10b … over palettes that really do move it', moved > 0, `${moved}`);
  // Where nothing recolours it (Dark, which has no swap) it is still the generator's own object.
  const same = THEMES.filter((t) => inkAllLines(raw, builtinPalette(t).inks).localSpace === raw.localSpace);
  check("10c on Dark (no swap) the set keeps the generator's own local space; on Glass and Earth the Moon's is inked", same.join() === 'dark', same.join(', '));
  const app = readFileSync(join(SRC, 'App.tsx'), 'utf8').replace(/\r\n/g, '\n');
  check("10d SOURCE: the drawn local space is withLineInks over its geometry, the function the set's custom path uses",
    /const localSpace = useMemo\(\(\) => withLineInks\(localSpaceGeom, inks\), \[localSpaceGeom, inks\]\);/.test(app));
}

// ── §11 A restyle bakes once, on its own style (SOURCE TRIPWIRE) ─────────────────────────
// A built-in theme switch hands the Map a new theme and a new sprite spec in one commit. The
// sprite effect used to re-bake in place on the OUTGOING style straight away — the old basemap
// wore the new theme's glyphs for as long as the new style took to download — and the build then
// baked everything again (review, 2026-10-06). Now the theme effect raises restylePendingRef
// before it asks for the style, the repaint and the sprite effect stand down while it is up, and
// the build lowers it before it bakes the newest spec: a built-in → built-in switch calls
// rebakeGlyphImages zero times. Map.tsx can't run in Node, so its shape is read; the Chrome
// recheck counts the bakes. (2026-10-06)
{
  const src = readFileSync(join(SRC, 'components/Map/Map.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const themeEffect = /if \(themeRef\.current === theme && basemapRef\.current === basemap\) return;([\s\S]*?)\}, \[theme, basemap\]\);/.exec(src)?.[1] ?? '';
  check('11a the theme effect raises the flag BEFORE it asks for the new style',
    /restylePendingRef\.current = true;\s*restyleRef\.current\(\);/.test(themeEffect), themeEffect.replace(/\s*\/\/[^\n]*/g, ' ').trim().slice(0, 140));
  const spriteEffect = /bakedSpriteRef\.current = sprite;([\s\S]*?)\}, \[sprite\]\);/.exec(src)?.[1] ?? '';
  check('11b the sprite effect stands down while a restyle is pending, before it re-bakes',
    /if \(restylePendingRef\.current\) return;\s*rebakeGlyphImages\(map, sprite\);/.test(spriteEffect), spriteEffect.trim().slice(0, 140));
  const build = /const build = async \(([\s\S]*?)await ensureGlyphImages\(map, spriteRef\.current\);/.exec(src)?.[1] ?? '';
  check('11c the build lowers it before it bakes spriteRef.current, the newest spec', /restylePendingRef\.current = false;/.test(build));
  const repaintEffect = /const repaintShownRef = useRef\(repaintShown\);\s*useEffect\(\(\) => \{([\s\S]*?)\}, \[mapStyle, mapPreview, repaintShown\]\);/.exec(src)?.[1] ?? '';
  check('11d the live repaint stands down while it is up', /restylePendingRef\.current\) return;/.test(repaintEffect));
}

// ── §12 Glass moved to Bright; Positron stays a map of its own (TWO PARTS, then IDENTITY) ────
// Salvatore, 2026-10-08: Glass draws OSM Bright, so it no longer looks like the downstream theme
// that drew Positron beside it. Positron stays as its own map id, for a palette designed on that
// plain map to PIN — so such a palette must resolve exactly as Glass did there before the move.
// The shape is CLAUDE.md's "test a frozen parameter by trying to move it": the live source (Glass's
// own map and offline colours) has moved, and the pinned palette is required NOT to have.
{
  // Positron's offline colours: Glass's until 2026-10-08, held here as literals rather than read
  // from WORLD_FALLBACK_COLORS.positron, so an edit to that table can't move the snapshot with it.
  const POSITRON_FALLBACK = { ocean: 'hsl(205, 32%, 86%)', land: 'hsl(0, 0%, 96%)', line: 'hsl(210, 12%, 64%)' } as const;
  const BRIGHT_URL = 'https://tiles.openfreemap.org/styles/bright';
  const POSITRON_URL = 'https://tiles.openfreemap.org/styles/positron';
  const glass = builtinPalette('glass');

  // (a) What each map id loads — through the lookup Map.tsx makes (SOURCE TRIPWIRE below).
  check('12a Glass\'s built-in draws OSM Bright (OpenFreeMap\'s), and the Positron id still loads Positron',
    glass.map.basemap === 'glass' && BASEMAP_STYLE_URLS[glass.map.basemap] === BRIGHT_URL && BASEMAP_STYLE_URLS.positron === POSITRON_URL,
    `${BASEMAP_STYLE_URLS[glass.map.basemap]}; ${BASEMAP_STYLE_URLS.positron}`);
  const mapSrc = readFileSync(join(SRC, 'components/Map/Map.tsx'), 'utf8');
  check('12a SOURCE: Map.tsx loads a served choice\'s own URL, so a Positron palette loads Positron whatever its base',
    /BASEMAP_STYLE_URLS\[basemap === 'outline' \? theme : basemap\]/.test(mapSrc));
  check('12a … and Positron is a choice a palette can make (the editor\'s options), Outline still last',
    BASEMAP_CHOICES.includes('positron') && BASEMAP_CHOICES.at(-1) === 'outline' &&
      canonList(tokenDef('map.basemap')!.options!) === canonList(BASEMAP_CHOICES));

  // (b) TWO PARTS: base Glass with Positron pinned against the snapshot and against Glass's own
  // tables (which the move did not touch: §1f holds the built-in to lib/theme field by field).
  const pinned = resolve2('glass', { 'map.basemap': 'positron' });
  // The map's own values, held to the snapshot rather than to Glass's built-in. The roads joined
  // them the same day: Glass paints Bright's a grey (lib/theme BASEMAP_ROAD_PAINT), and Glass on
  // Positron never painted roads at all — null, the style's own — so neither may a pinned palette.
  const OWN_FALLBACK = new Set(['map.basemap', 'map.land', 'map.water', 'worldFallback.ocean', 'worldFallback.land', 'worldFallback.line', 'basemap.road']);
  const pinBad: string[] = [];
  let pinN = 0;
  const want: Record<string, string | null> = {
    'map.land': POSITRON_FALLBACK.land, 'map.water': POSITRON_FALLBACK.ocean,
    'worldFallback.ocean': POSITRON_FALLBACK.ocean, 'worldFallback.land': POSITRON_FALLBACK.land, 'worldFallback.line': POSITRON_FALLBACK.line,
    'basemap.road': null,
  };
  for (const [id, v] of Object.entries(want)) {
    pinN += 1;
    if (!sameTokenValue(pinned.values[id], v)) pinBad.push(`${id} ${JSON.stringify(pinned.values[id])} ≠ ${v}`);
  }
  for (const d of TOKENS) {
    if (OWN_FALLBACK.has(d.id)) continue;
    pinN += 1;
    if (!sameTokenValue(pinned.values[d.id], glass.values[d.id])) pinBad.push(`${d.id} ${JSON.stringify(pinned.values[d.id])} ≠ Glass's ${JSON.stringify(glass.values[d.id])}`);
  }
  if (!deepEqual(pinned.map.worldFallback, POSITRON_FALLBACK)) pinBad.push(`MapStyle.worldFallback ${JSON.stringify(pinned.map.worldFallback)}`);
  const { key: _pk, basemap: pb, worldFallback: _pw, basemapPaint: pbp, ...pinnedMap } = pinned.map;
  const { key: _gk, basemap: _gb, worldFallback: _gw, basemapPaint: gbp, ...glassMap } = glass.map;
  if (pb !== 'positron') pinBad.push(`MapStyle.basemap ${pb}`);
  if (pbp.road !== null) pinBad.push(`MapStyle.basemapPaint.road ${pbp.road}: Positron's roads must stay the style's own`);
  if (!deepEqual({ ...pbp, road: null }, { ...gbp, road: null })) pinBad.push('the rest of basemapPaint differs from Glass\'s');
  if (!deepEqual(pinnedMap, glassMap)) pinBad.push('the rest of MapStyle differs from Glass\'s');
  if (pinned.inks !== glass.inks) pinBad.push('inks are not Glass\'s own object');
  if (spriteSpecFor(pinned) !== spriteSpecFor(glass)) pinBad.push('sprite spec is not Glass\'s own');
  if (Object.keys(pinned.css).length || !deepEqual(pinned.attrs, glass.attrs)) pinBad.push(`css ${Object.keys(pinned.css).join(', ')} / attrs`);
  checkAll('12b base Glass + Positron resolves every map token to Glass\'s pre-move values — land, water, offline colours and roads (the style\'s own) to the Positron snapshot, everything mapTableOf feeds to Glass\'s tables, inks and sprites Glass\'s own objects', pinN, pinBad);
  // … and the live source DID move, so the agreement above is not the two parts agreeing by
  // never having been apart.
  const movedFrom = (['ocean', 'land', 'line'] as const).filter((k) => glass.map.worldFallback[k] !== POSITRON_FALLBACK[k]);
  check('12b … while Glass\'s own land, water and coastline moved off the snapshot (to Bright\'s), so the two parts really were moved apart',
    movedFrom.length === 3 && !sameTokenValue(glass.values['map.land'], pinned.values['map.land']), movedFrom.join(', '));
  check('12b … and so did Glass\'s roads (painted grey on Bright), so the pinned null is held, not merely inherited',
    typeof glass.map.basemapPaint.road === 'string' && glass.values['basemap.road'] !== pinned.values['basemap.road'],
    `${glass.map.basemapPaint.road}`);
  // On every base, Positron's offline colours are its own and its other map marks Glass's tables.
  const everyBad: string[] = [];
  for (const t of THEMES) {
    const p = resolve2(t, { 'map.basemap': 'positron' });
    if (!deepEqual(p.map.worldFallback, POSITRON_FALLBACK)) everyBad.push(`${t}: worldFallback ${JSON.stringify(p.map.worldFallback)}`);
    if (p.map.basemap !== 'positron') everyBad.push(`${t}: basemap ${p.map.basemap}`);
    for (const id of ['nightShade.color', 'geo.grid.line', 'marks.halo', 'marks.zenithDisc', 'eclipse.total', 'basemap.label', 'map.globeVoid']) {
      if (!sameTokenValue(p.values[id], glass.values[id])) everyBad.push(`${t}: ${id} ${JSON.stringify(p.values[id])} is not Glass's ${JSON.stringify(glass.values[id])}`);
    }
    if (p.map.basemapPaint.road !== null) everyBad.push(`${t}: roads painted ${p.map.basemapPaint.road}`);
  }
  checkAll('12c on every base, Positron draws its own offline colours, its own roads and Glass\'s tuned map tables', THEMES.length * 10, everyBad);

  // (c) The ferry routes (basemapStyle): hidden on every application of the toggles, whatever
  // Roads says, and never restored by lifting the whole-basemap blank — over a stand-in map whose
  // getStyle reflects every setLayoutProperty, as MapLibre's does.
  type L = { id: string; type: string; source: string; 'source-layer'?: string; layout?: { visibility?: string } };
  const layers: L[] = [
    { id: 'background', type: 'background', source: '' },
    { id: 'road_minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
    { id: 'ferry', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
    { id: 'waterway-river', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway' },
    { id: 'acg-lines-meridian', type: 'line', source: 'acg-lines' },
  ];
  const fake = {
    getStyle: () => ({ version: 8, sources: { openmaptiles: { type: 'vector' }, 'acg-lines': { type: 'geojson' } }, layers }),
    setLayoutProperty: (id: string, prop: string, v: string) => {
      const l = layers.find((x) => x.id === id);
      if (l && prop === 'visibility') l.layout = { ...l.layout, visibility: v };
    },
  } as unknown as Parameters<typeof applyDetailToggles>[0];
  const vis = (id: string) => layers.find((l) => l.id === id)!.layout?.visibility ?? 'visible';
  const ferryBad: string[] = [];
  const step = (label: string, t: Parameters<typeof applyDetailToggles>[1], expect: Record<string, string>) => {
    applyDetailToggles(fake, t);
    for (const [id, v] of Object.entries(expect)) if (vis(id) !== v) ferryBad.push(`${label}: ${id} ${vis(id)}, want ${v}`);
  };
  const on = { showRoads: true, showRivers: true, showLabels: true };
  // The blank FIRST, on a fresh style: the case where the ferry was still visible when recorded.
  step('blank on a fresh style', { ...on, hideBasemap: true }, { ferry: 'none', road_minor: 'none', background: 'none' });
  step('blank lifted', on, { ferry: 'none', road_minor: 'visible', 'waterway-river': 'visible', background: 'visible' });
  step('roads off', { ...on, showRoads: false }, { ferry: 'none', road_minor: 'none' });
  step('roads on', on, { ferry: 'none', road_minor: 'visible', 'acg-lines-meridian': 'visible' });
  check('12d the ferry routes stay hidden through Roads on and off and through the whole-basemap blank and its lift, while the roads beside them follow Roads',
    ferryBad.length === 0 && layers.find((l) => l.id === 'acg-lines-meridian')!.layout === undefined, ferryBad.slice(0, 4).join('; '));

  // (d) Glass's roads, a quiet warm grey (Salvatore, 2026-10-08; lib/theme BASEMAP_ROAD_PAINT says
  // why). IDENTITY on the built-ins and the map choice, then TWO PARTS: the palette's road slot
  // against what applyBasemapPaint actually writes, over a stand-in map shaped like Bright.
  const BRIGHT_LAND = '#f8f4f0';
  const BRIGHT_BORDER = '#9e9cab';
  const roadBad: string[] = [];
  let roadN = 0;
  for (const t of THEMES) {
    roadN += 1;
    const r = builtinPalette(t).map.basemapPaint.road;
    if (t !== 'glass') {
      if (r !== null) roadBad.push(`${t}: the built-in paints roads ${r} — Earth and Dark keep their style's own`);
      continue;
    }
    const c = r ? parseColor(r) : null;
    if (!c) {
      roadBad.push(`glass: no road paint (${r})`);
      continue;
    }
    // A grey: no colour of its own for a chart line to be confused with (channels within 24).
    if (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 24) roadBad.push(`glass: ${r} is not a grey`);
    // Present on Bright's land, and quieter there than Bright's own borders.
    const onLand = contrastRatio(r!, BRIGHT_LAND);
    if (onLand < 1.3 || onLand >= contrastRatio(BRIGHT_BORDER, BRIGHT_LAND)) roadBad.push(`glass: ${r} is ${onLand.toFixed(2)}:1 on the land`);
  }
  // Keyed by the map CHOSEN, whatever the base; a reader's own Roads colour wins on every map.
  const roadOf = (base: Theme, o: Record<string, TokenValue>) => resolve2(base, o).map.basemapPaint.road;
  const grey = builtinPalette('glass').map.basemapPaint.road;
  for (const [label, got, want] of [
    ['Earth on Glass\'s map', roadOf('vintage', { 'map.basemap': 'glass' }), grey],
    ['Dark on Glass\'s map', roadOf('dark', { 'map.basemap': 'glass' }), grey],
    ['Glass on Earth\'s map', roadOf('glass', { 'map.basemap': 'vintage' }), null],
    ['Glass on Outline', roadOf('glass', { 'map.basemap': 'outline' }), null],
    ['Glass with its own Roads', roadOf('glass', { 'basemap.road': '#336699' }), '#336699'],
    ['Positron with its own Roads', roadOf('glass', { 'map.basemap': 'positron', 'basemap.road': '#336699' }), '#336699'],
  ] as const) {
    roadN += 1;
    if (got !== want) roadBad.push(`${label}: ${got}, want ${want}`);
  }
  checkAll('12e Glass\'s built-in paints Bright\'s roads a quiet grey; Earth and Dark paint none; it follows the map chosen (never on Positron or Outline) and a reader\'s own Roads colour wins', roadN, roadBad);

  type PL = { id: string; type: string; source?: string; sourceLayer?: string; paint: Record<string, unknown> };
  const standIn = () => {
    const ls: PL[] = [
      { id: 'background', type: 'background', paint: { 'background-color': BRIGHT_LAND } },
      { id: 'water', type: 'fill', source: 'openmaptiles', sourceLayer: 'water', paint: { 'fill-color': 'hsl(205,56%,73%)' } },
      { id: 'highway-area', type: 'fill', source: 'openmaptiles', sourceLayer: 'transportation', paint: { 'fill-color': 'hsla(0,0%,89%,0.56)' } },
      { id: 'highway-motorway-casing', type: 'line', source: 'openmaptiles', sourceLayer: 'transportation', paint: { 'line-color': '#e9ac77' } },
      { id: 'highway-motorway', type: 'line', source: 'openmaptiles', sourceLayer: 'transportation', paint: { 'line-color': '#fc8' } },
      { id: 'road_major_label', type: 'symbol', source: 'openmaptiles', sourceLayer: 'transportation_name', paint: { 'text-color': '#765' } },
      { id: 'acg-lines-meridian', type: 'line', source: 'acg-lines', paint: { 'line-color': ['get', 'color'] } },
    ];
    const own = JSON.parse(JSON.stringify(ls)) as PL[];
    const srcs: Record<string, { type: string }> = { openmaptiles: { type: 'vector' }, 'acg-lines': { type: 'geojson' } };
    const find = (id: string) => ls.find((l) => l.id === id);
    const map = {
      getLayersOrder: () => ls.map((l) => l.id),
      getLayer: find,
      getSource: (id: string) => srcs[id],
      getPaintProperty: (id: string, p: string) => find(id)?.paint[p],
      setPaintProperty: (id: string, p: string, v: unknown) => {
        const l = find(id);
        if (!l) return;
        if (v === null) delete l.paint[p];
        else l.paint[p] = v;
      },
    } as unknown as Parameters<typeof applyBasemapPaint>[0];
    // Each layer's colour now against the style's own, as [id, now, own] for the ones that differ.
    const moved = () => ls.flatMap((l, i) => (deepEqual(l.paint, own[i].paint) ? [] : [l.id]));
    const colourOf = (id: string) => {
      const l = find(id)!;
      return l.paint[l.type === 'fill' ? 'fill-color' : 'line-color'];
    };
    return { map, moved, colourOf };
  };
  const ROADS = ['highway-area', 'highway-motorway-casing', 'highway-motorway'];
  const paintBad: string[] = [];
  {
    const s = standIn();
    applyBasemapPaint(s.map, builtinPalette('glass').map.basemapPaint);
    if (canonList(s.moved()) !== canonList(ROADS)) paintBad.push(`Glass moved ${s.moved().join(', ') || 'nothing'}, want exactly the road layers`);
    for (const id of ROADS) if (s.colourOf(id) !== grey) paintBad.push(`Glass: ${id} is ${JSON.stringify(s.colourOf(id))}, want ${grey}`);
    // A palette pinned to Positron, applied over it (the live switch): every road is its own again.
    applyBasemapPaint(s.map, pinned.map.basemapPaint);
    if (s.moved().length) paintBad.push(`Positron after Glass left ${s.moved().join(', ')} painted`);
  }
  for (const t of THEMES) {
    if (t === 'glass') continue;
    const s = standIn();
    applyBasemapPaint(s.map, builtinPalette(t).map.basemapPaint);
    // Dark's place-name lift has no layer here, so a built-in Earth or Dark must move nothing at all.
    if (s.moved().length) paintBad.push(`${t}: the built-in moved ${s.moved().join(', ')}`);
  }
  {
    const s = standIn();
    applyBasemapPaint(s.map, pinned.map.basemapPaint);
    if (s.moved().length) paintBad.push(`Positron on a fresh style moved ${s.moved().join(', ')}`);
  }
  check('12f TWO PARTS: applyBasemapPaint paints exactly Bright\'s road layers (lines and fills, not road names, water, land or the chart) with Glass\'s grey; a Positron palette puts them back and, like built-in Earth and Dark, paints none',
    paintBad.length === 0, paintBad.slice(0, 4).join('; '));
}

// ── §0c (collected above) ──
{
  const bad: string[] = [];
  let n = 0;
  for (const p of traced) {
    const tr = paletteTrace(p);
    for (const [id, reads] of Object.entries(tr)) {
      const deps = new Set(tokenDef(id)?.deps ?? []);
      n += 1;
      for (const r of reads) if (!deps.has(r)) bad.push(`${id} read ${r}, which it does not declare`);
    }
  }
  checkAll(`0c every rule reads only the tokens it declares (over ${traced.length} resolved palettes)`, n, [...new Set(bad)]);
  const ex = explain(resolvePalette('glass', { 'lines.mode': 'ink' }), 'map.ink.Moon');
  check('0d explain names what a derived row follows, and its Auto value',
    !!ex && ex.origin === 'derived' && ex.parent === 'lines.mode' && ex.auto === ex.value && explain(builtinPalette('glass'), 'nope') === null,
    JSON.stringify(ex));
}

console.log(
  failures === 0
    ? `\nverify-theme-palette: ALL PASS${skips ? ` (${skips} skipped — see SKIP lines)` : ''}`
    : `\nverify-theme-palette: ${failures} FAILURE(S)${skips ? `, ${skips} skipped` : ''}`,
);
process.exit(failures === 0 ? 0 : 1);
