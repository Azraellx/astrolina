// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The palette engine (2026-10-06): every colour, line style and effect the app draws, as ONE
// schema of tokens, and the resolver that turns a theme into the values the app paints with.
//
// Why one schema. Theming used to be three unrelated layers — the CSS palette in index.css,
// the per-theme Record<Theme, …> tables in lib/theme, and colours hard-coded where they were
// drawn (Map's node pair and ecliptic, the wheel's aspect hex). A Custom theme has to reach
// all three, and has to be able to say of every value where it came from. So each value is a
// TOKEN with a built-in per theme, and optionally a rule for following other tokens.
//
// Why built-in themes cannot move. A token's built-in is READ FROM the source that drew it
// before this module existed — the lib/theme tables, a mirror of index.css (UI_CSS_MIRROR,
// checked against the stylesheet by verify:theme-palette §2) and LINE_STYLE_BUILTIN (Map's
// own widths and dashes, checked against Map.tsx §8). And a token only DERIVES when a token
// its rule actually read has moved from its own built-in. With no overrides nothing has
// moved, so nothing derives, so a built-in theme resolves to exactly its built-ins — by
// construction, not by a test happening to pass (§1 checks it anyway).
//
// "Actually read" is load-bearing, not tidiness. On Glass the Moon's map line is slate (the
// pale tint vanishes on the light basemap). Its rule reads the line-colour MODE first, and in
// planet mode never reads the one-ink colour; so setting that unused ink moves no line. A
// rule keyed on "any declared dependency touched" would have repainted the Moon the moment
// the reader tried a colour they had not switched on.
//
// The resolved palette reaches the app through four channels, none of which this module
// touches itself: `css` + `attrs` (lib/appearance writes them on <html>), `inks` (lib/lineInks
// colours the line features), `map` (Map applies it with setPaintProperty) and the sprite
// spec (lib/lineInks spriteSpecFor, baked by the map's glyph images). An untouched built-in
// writes NO custom property at all, so the stylesheet alone paints it, as it always has.
import { PLANET_COLORS, PLANET_NAMES, type PlanetName } from './ephemeris';
import type { Element, Modality } from './astro/dignities';
import type { AspectName } from './aspectPrefs';
import type { MapInks } from './lineInks';
import {
  BASEMAP_ROAD_PAINT,
  ECLIPSE_LABEL_HALO,
  ECLIPSE_PATH_COLORS,
  GEO_GRID_STYLE,
  GEO_ZONE_COLORS,
  LABEL_CONTRAST,
  LABEL_HALO_COLORS,
  LILITH_PANEL_GLYPH_EARTH,
  MAP_LINE_COLOR_OVERRIDES,
  MINOR_LINE_PALETTE,
  MOON_LINE_DARK,
  NIGHT_SHADE_STYLE,
  STAR_LINE_COLORS,
  THEMES,
  WORLD_FALLBACK_COLORS,
  ZENITH_DISC_COLORS,
  minorPaletteSlot,
  type ServedMap,
  type Theme,
} from './theme';

/** The derivation engine's version, carried on every custom spec (themeOptions
 *  CustomThemeSpec.engine). A future change to how a rule derives can then tell a spec
 *  made under the old rules from one made under the new. */
export const PALETTE_ENGINE = 1 as const;

// ── Types ──────────────────────────────────────────────────────────────────────────────────

/** A token's id — dotted lowerCamel, `group.name[.part…]` (see TOKEN_ID_RE). */
export type TokenId = string;

/**
 *  'color'  — a CSS colour string.
 *  'color?' — a colour, or null for "not set here": the map style's own paint, or a
 *             component's own fallback (e.g. the wheel axes falling back to the accent).
 *  'number' — a finite number in `range`, on its step.
 *  'number?'— a number, or null for the style's own (basemap.labelHaloWidth only).
 *  'enum'   — one of `options`.
 *  'dash'   — a MapLibre line-dasharray, one of `presets` (two-element [on, off] only).
 */
export type TokenKind = 'color' | 'color?' | 'number' | 'number?' | 'enum' | 'dash';

/** seed = an Essentials choice other tokens follow; derived = has a rule (shown as Auto
 *  until set); detail = a leaf with no rule (its built-in until set). */
export type TokenTier = 'seed' | 'derived' | 'detail';

/** The editor section a token is presented in, in TOKEN_GROUPS order. */
export type TokenGroup = 'essentials' | 'interface' | 'mapLines' | 'mapSurface' | 'wheel' | 'effects';
export const TOKEN_GROUPS: readonly TokenGroup[] = [
  'essentials',
  'interface',
  'mapLines',
  'mapSurface',
  'wheel',
  'effects',
];

export type TokenValue = string | number | null | readonly number[];
export type TokenOrigin = 'base' | 'derived' | 'override';

/** A sparse map of token id → value: what a custom theme stores. Read through
 *  sanitizeOverrides before use; unknown ids and bad values are dropped. */
export type PaletteOverrides = Readonly<Record<TokenId, TokenValue>>;

/** How a token reaches CSS. */
export interface TokenCss {
  /** The custom property, e.g. '--accent'. */
  readonly name: string;
  /** Also written as `${name}-rgb`: 'r, g, b', for the `rgba(var(--x-rgb), α)` idiom. */
  readonly rgbPair?: true;
  /** The property holds an 'r, g, b' triplet and nothing else (--bg-panel, --tint, …). */
  readonly triplet?: true;
  /** The stylesheet declares this property as `var(<the alias token's property>)`, so it
   *  follows that token by itself; it is written only when it must NOT follow (--advanced
   *  stays its built-in when --danger moves). */
  readonly alias?: TokenId;
  /** Declared by no stylesheet: components consume it as `var(name, <canonical>)`. These
   *  are CANONICAL_RESET_VARS, which the report paper resets to `initial`. */
  readonly fallback?: true;
}

/** What a rule may ask beyond token values. Every call is tracked as a read. */
export interface DeriveContext {
  readonly base: Theme;
  /** This token's own built-in for `base`. */
  readonly builtin: TokenValue;
  /** Whether token `id`'s value differs from its own built-in. */
  moved(id: TokenId): boolean;
  /** Whether token `id` was set by the reader to something other than what it would follow
   *  — an override that changes it. A token moved only by what IT follows is not `own`. */
  own(id: TokenId): boolean;
}
export type TokenGetter = (id: TokenId) => TokenValue;

export interface TokenDef {
  readonly id: TokenId;
  readonly kind: TokenKind;
  readonly group: TokenGroup;
  readonly tier: TokenTier;
  /** The value for a built-in theme. Never throws. */
  builtin(base: Theme): TokenValue;
  /** Every token `derive` may read (through `get`, `moved` or `own`); the first is the one
   *  it follows by default (explain's `parent`). verify:theme-palette §0 holds a rule to it. */
  readonly deps?: readonly TokenId[];
  /** The rule. Runs only to decide; its result is used ONLY if a token it read has moved. */
  derive?(get: TokenGetter, ctx: DeriveContext): TokenValue;
  readonly css?: TokenCss;
  readonly range?: { readonly min: number; readonly max: number; readonly step: number };
  /** 'enum' only. */
  readonly options?: readonly string[];
  /** 'dash' only: the dash arrays an override may take. */
  readonly presets?: readonly (readonly number[])[];
  /** A colour that may carry alpha (#rrggbbaa); every other colour is stored opaque. */
  readonly alpha?: true;
  /** No editor row of its own (a mode's output, or a value another row stands for). */
  readonly hidden?: true;
  /** Never overridable: sanitizeOverrides drops it. The tier and tag colours explain tiers
   *  to onlookers and must read the same in every theme. */
  readonly locked?: true;
}

export type PanelTone = 'light' | 'dark';
export type FxFrost = 'full' | 'subtle' | 'solid';
export type FxSwitch = 'on' | 'off';
export type FxMotion = 'full' | 'reduced';
export type FxPreset = 'full' | 'subtle' | 'flat';

/** The attributes lib/appearance writes on <html>. */
export interface AppearanceAttrs {
  readonly panelTone: PanelTone;
  readonly frost: FxFrost;
  readonly shadows: FxSwitch;
  readonly glows: FxSwitch;
  readonly motion: FxMotion;
}

/** Which map to draw: a served vector map — a built-in theme's own, or Positron, the plain
 *  light-grey map that was Glass's until 2026-10-08 (lib/theme BASEMAP_STYLE_URLS) — or the
 *  bundled world outline. The id is the map's, not a theme's: no built-in draws Positron now, so
 *  a downstream build names the option however its editor does. A SYNCED VALUE like every token
 *  option, so it is never repurposed: 'glass' means "Glass's map", and followed Glass to Bright. */
export type BasemapChoice = ServedMap | 'outline';
export const BASEMAP_CHOICES: readonly BasemapChoice[] = ['vintage', 'glass', 'dark', 'positron', 'outline'];

/** Everything the map's own layers need from a palette, with every width FINAL (the line
 *  weight already applied). A built-in theme's equals the constants Map.tsx drew before the
 *  engine existed (verify:theme-palette §1 and §8). Identity changes only when a value in
 *  it does (section memo), so `prev !== next` is the test for "repaint". */
export interface MapStyle {
  /** === the base theme for a built-in map section; a stable hash otherwise. */
  readonly key: string;
  /** The basemap to install. Changing it is the only change that needs a new style. */
  readonly basemap: BasemapChoice;
  /** The chart's angle lines (acg-lines-meridian / -horizon and the two node-pair layers). */
  readonly natal: { readonly mcWidth: number; readonly icWidth: number; readonly horizonWidth: number; readonly vxWidth: number };
  /** An overlay's angle lines (acg-lines-ov-*). The node pair layers read mc/ic/horizon
   *  (a VX pair takes the horizon width, as it always has). */
  readonly overlay: {
    readonly mcWidth: number;
    readonly icWidth: number;
    readonly horizonWidth: number;
    readonly vxWidth: number;
    readonly meridianDash: readonly number[];
    readonly horizonDash: readonly number[];
  };
  /** The chart's merged node pair: the step gradient ['step',['line-progress'],nn,0.5,sn]. */
  readonly nodePair: { readonly nn: string; readonly sn: string };
  /** The overlay's node pair: two layers, nn on `nnDash`, sn on `snDash` = [0, ...nnDash]
   *  (the leading 0 offsets sn into nn's gaps). Colours are the overlay ink when one is set. */
  readonly overlayNodePair: {
    readonly nn: string;
    readonly sn: string;
    readonly nnDash: readonly number[];
    readonly snDash: readonly number[];
  };
  readonly paran: { readonly width: number; readonly overlayDash: readonly number[] };
  /** The catalog bodies' parans; overlay dash = the planets' overlay paran dash. */
  readonly minorParan: { readonly width: number; readonly overlayDash: readonly number[] };
  /** Aspect + midpoint lines (angle-lines-layer). */
  readonly aspect: { readonly width: number; readonly dash: readonly number[] };
  readonly localSpace: {
    readonly width: number;
    readonly inboundDash: readonly number[];
    readonly overlayWidth: number;
    readonly overlayDash: readonly number[];
  };
  readonly star: { readonly width: number; readonly opacity: number; readonly dash: readonly number[] };
  /** Catalog minor-body lines; the overlay's dashes are the overlay planets' own. */
  readonly minor: {
    readonly mcWidth: number;
    readonly horizonWidth: number;
    readonly icWidth: number;
    readonly vxWidth: number;
    readonly overlayMeridianDash: readonly number[];
    readonly overlayHorizonDash: readonly number[];
    /** The overlay's catalog arrows, beads and coins. */
    readonly overlayMarkOpacity: number;
  };
  readonly ecliptic: {
    readonly color: string;
    readonly width: number;
    readonly opacity: number;
    readonly overlayDash: readonly number[];
  };
  /** Zenith/nadir/catalog coin hover disc fill (circle-color), and the paran chip fill. */
  readonly zenithDisc: string;
  /** The measure points' stroke (mapStyleApply LAYER_BINDINGS) and the crossing-dot
   *  stroke's source (LABEL_HALO_COLORS). */
  readonly halo: string;
  /** The local-space crossing dots' stroke (`halo || 'rgba(0,0,0,0.4)'`, as before). */
  readonly crossingStroke: string;
  readonly eclipseHalo: { readonly color: string; readonly width: number };
  readonly geoGrid: {
    readonly line: string;
    readonly opacity: number;
    readonly width: number;
    readonly label: string;
    readonly hover: number;
  };
  readonly nightShade: { readonly color: string; readonly opacity: number };
  readonly geoZones: Readonly<Record<Element, readonly [string, string, string]>>;
  /** The Outline map (and the offline fallback): ocean = background, land fill, coastline. */
  readonly worldFallback: { readonly ocean: string; readonly land: string; readonly line: string };
  /** Paint over the served vector basemap; null = leave the style's own paint. */
  readonly basemapPaint: {
    readonly water: string | null;
    readonly waterway: string | null;
    readonly land: string | null;
    /** 'flat': hide landcover/landuse/park fills so a set land colour reads as one flat sheet. */
    readonly landcover: 'keep' | 'flat';
    readonly border: string | null;
    readonly road: string | null;
    readonly building: string | null;
    /** Place-name text (the `place` source-layer); Dark's LABEL_CONTRAST is its built-in. */
    readonly label: string | null;
    readonly labelHalo: string | null;
    readonly labelHaloWidth: number | null;
  };
  /** Rising/setting arrows on the angle lines. */
  readonly arrows: boolean;
  /** The catalog bodies' coin beads along their lines. */
  readonly minorBeads: boolean;
  /** The fixed-star lines' spark beads. */
  readonly starSparks: boolean;
  /** Multiplier on the orb bands' per-feature opacity (1 = as drawn). */
  readonly orbStrength: number;
  /** The weight multiplier already applied to every width above (for line samples). */
  readonly lineWeight: number;
}

/** A resolved theme. Identity-stable for an unchanged input (resolvePalette's memo). */
export interface ResolvedPalette {
  readonly base: Theme;
  /** === `base` while nothing differs from the built-in; a stable hash otherwise. */
  readonly key: string;
  /** The sanitized overrides it was resolved from (empty for a built-in). */
  readonly overrides: PaletteOverrides;
  readonly values: Readonly<Record<TokenId, TokenValue>>;
  readonly origin: Readonly<Record<TokenId, TokenOrigin>>;
  /** ONLY the custom properties whose value differs from what the stylesheet gives —
   *  empty for a built-in. Pairs are written in both forms (`--x` hex, `--x-rgb` triplet). */
  readonly css: Readonly<Record<string, string>>;
  readonly attrs: AppearanceAttrs;
  /** Section-memoized: identity changes only when an ink does. */
  readonly inks: MapInks;
  /** Section-memoized: identity changes only when a map value does. */
  readonly map: MapStyle;
}

/** explain(): what an editor row shows. */
export interface TokenExplanation {
  readonly id: TokenId;
  readonly value: TokenValue;
  readonly origin: TokenOrigin;
  /** What it would be without the reader's own override (the Auto value). */
  readonly auto: TokenValue;
  /** The base theme's built-in. */
  readonly builtin: TokenValue;
  /** The token it follows: the first token its rule read that has moved, else its first
   *  declared dependency. Absent for a token with no rule. */
  readonly parent?: TokenId;
}

// ── Colour utilities ───────────────────────────────────────────────────────────────────────
// One parser for every colour form the app writes: #rgb/#rgba/#rrggbb/#rrggbbaa, rgb()/rgba()
// (comma or space form), hsl()/hsla(), a bare 'r, g, b' triplet (index.css's --bg-panel form),
// and white/black/transparent. Map's badgeTextColor and GeoZoneLegend's inkOn each parse a
// subset of this by hand; these are the shared version for new code.

/** Channels 0–255 (unrounded), alpha 0–1. */
export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}
export type ColorInput = string | Rgba;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function parseChannel(s: string, max: number): number | null {
  const t = s.trim();
  if (!t) return null;
  const pct = t.endsWith('%');
  const n = Number(pct ? t.slice(0, -1) : t);
  if (!Number.isFinite(n)) return null;
  return clamp(pct ? (n / 100) * max : n, 0, max);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [ch(hh + 1 / 3) * 255, ch(hh) * 255, ch(hh - 1 / 3) * 255];
}

/** Parse a CSS colour; null when it isn't one. Never throws. */
export function parseColor(input: unknown): Rgba | null {
  if (input && typeof input === 'object') {
    const o = input as Partial<Rgba>;
    if ([o.r, o.g, o.b, o.a].every((x) => typeof x === 'number' && Number.isFinite(x))) {
      return { r: clamp(o.r!, 0, 255), g: clamp(o.g!, 0, 255), b: clamp(o.b!, 0, 255), a: clamp(o.a!, 0, 1) };
    }
    return null;
  }
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (!s || s.length > 64) return null;
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^(rgba?|hsla?)\(([^()]*)\)$/.exec(s);
  if (fn) {
    const [body, alphaPart] = fn[2].split('/');
    const parts = body.split(/[\s,]+/).filter(Boolean);
    if (alphaPart !== undefined) parts.push(alphaPart.trim());
    if (parts.length !== 3 && parts.length !== 4) return null;
    const a = parts.length === 4 ? parseChannel(parts[3], 1) : 1;
    if (a === null) return null;
    if (fn[1].startsWith('rgb')) {
      const [r, g, b] = parts.slice(0, 3).map((p) => parseChannel(p, 255));
      if (r === null || g === null || b === null) return null;
      return { r, g, b, a };
    }
    const h = Number(parts[0].replace(/deg$/, ''));
    const sat = parseChannel(parts[1], 1);
    const lig = parseChannel(parts[2], 1);
    if (!Number.isFinite(h) || sat === null || lig === null) return null;
    const [r, g, b] = hslToRgb(h, sat, lig);
    return { r, g, b, a };
  }
  const trip = /^(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (trip) {
    const [r, g, b] = [trip[1], trip[2], trip[3]].map((x) => clamp(Number(x), 0, 255));
    return { r, g, b, a: 1 };
  }
  return null;
}

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
const asRgba = (c: ColorInput): Rgba => parseColor(c) ?? BLACK;
const hex2 = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
const roundAlpha = (a: number) => Math.round(clamp(a, 0, 1) * 1000) / 1000;

/** '#rrggbb' (alpha dropped). An unparseable input gives `fallback`. */
export function toHex(c: ColorInput, fallback = '#000000'): string {
  const p = parseColor(c);
  return p ? `#${hex2(p.r)}${hex2(p.g)}${hex2(p.b)}` : fallback;
}

/** '#rrggbb', or '#rrggbbaa' when translucent — the stored form of an override. */
export function toHex8(c: ColorInput, fallback = '#000000'): string {
  const p = parseColor(c);
  if (!p) return fallback;
  const base = `#${hex2(p.r)}${hex2(p.g)}${hex2(p.b)}`;
  return p.a >= 0.9995 ? base : `${base}${hex2(p.a * 255)}`;
}

/** 'r, g, b' — the triplet form index.css's `rgba(var(--x), α)` tokens hold. */
export function toTriplet(c: ColorInput): string {
  const p = asRgba(c);
  return `${Math.round(p.r)}, ${Math.round(p.g)}, ${Math.round(p.b)}`;
}

/** The form every OUTPUT of the engine takes: '#rrggbb' when opaque, 'rgba(r, g, b, a)'
 *  otherwise — never '#rrggbbaa', which the map's own colour readers (badgeTextColor,
 *  blendHex) don't parse. A built-in's verbatim string (rgba(), hsl()) passes through. */
export function cssColor(c: ColorInput): string {
  if (typeof c === 'string' && !/^#[0-9a-f]{8}$/i.test(c.trim()) && !/^#[0-9a-f]{4}$/i.test(c.trim())) {
    return c;
  }
  return formatColor(asRgba(c));
}

/** '#rrggbb' or 'rgba(r, g, b, a)'. */
export function formatColor(c: ColorInput): string {
  const p = asRgba(c);
  if (p.a >= 0.9995) return toHex(p);
  return `rgba(${Math.round(p.r)}, ${Math.round(p.g)}, ${Math.round(p.b)}, ${roundAlpha(p.a)})`;
}

export function withAlpha(c: ColorInput, a: number): Rgba {
  return { ...asRgba(c), a: clamp(a, 0, 1) };
}

/** Linear sRGB mix: t = 0 → a, t = 1 → b. */
export function mix(a: ColorInput, b: ColorInput, t: number): Rgba {
  const x = asRgba(a);
  const y = asRgba(b);
  const k = clamp(t, 0, 1);
  return {
    r: x.r + (y.r - x.r) * k,
    g: x.g + (y.g - x.g) * k,
    b: x.b + (y.b - x.b) * k,
    a: x.a + (y.a - x.a) * k,
  };
}

/** WCAG 2 relative luminance (alpha ignored). */
export function luminance(c: ColorInput): number {
  const p = asRgba(c);
  const lin = (v: number) => {
    const s = clamp(v, 0, 255) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(p.r) + 0.7152 * lin(p.g) + 0.0722 * lin(p.b);
}

/** WCAG 2 contrast ratio, 1–21 (alpha ignored). */
export function contrastRatio(a: ColorInput, b: ColorInput): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Whichever of `dark` / `light` reads better on `bg`. With pure black and white the winner
 *  always clears 4.58:1 (√21), so this is a 4.5:1 floor for any background. */
export function readableOn(bg: ColorInput, dark = '#000000', light = '#ffffff'): string {
  return contrastRatio(bg, dark) >= contrastRatio(bg, light) ? dark : light;
}

/** True when dark ink reads better on it than light ink does (luminance above ≈0.18). */
export function isLightColor(c: ColorInput): boolean {
  return contrastRatio(c, '#000000') >= contrastRatio(c, '#ffffff');
}

/** Move `ink` toward the readable extreme of `bg` until it clears `ratio` against it. */
// Each candidate is checked AFTER rounding to the hex it will be written as: a mix that clears
// the ratio unrounded can land at 4.49 once its channels are rounded.
function liftForContrast(ink: ColorInput, bg: ColorInput, ratio: number): string {
  const own = toHex(ink);
  if (contrastRatio(own, bg) >= ratio) return own;
  const target = readableOn(bg);
  for (let t = 0.05; t < 1; t += 0.05) {
    const c = toHex(mix(ink, target, t));
    if (contrastRatio(c, bg) >= ratio) return c;
  }
  return target;
}

// ── Canonical inks, and the var() expressions consumers write ──────────────────────────────
// Each of these is consumed with its canonical literal as the fallback, and declared by no
// stylesheet — so an untouched theme, and the report paper's `.palette-canonical` reset, both
// land on these exact literals. They are the single TS source of colours that used to be
// written out by hand at each site (ExpandedChartSidebar.css's Balance rows,
// CaptureBalanceGrid, WheelSvg's ASPECT_TYPES and parallel colours).

/** The Balance palette's element tints, exactly as ExpandedChartSidebar.css and
 *  CaptureBalanceGrid wrote them. */
export const ELEMENT_INK: Readonly<Record<Element, string>> = {
  fire: 'rgb(232, 90, 79)',
  earth: 'rgb(141, 188, 109)',
  air: 'rgb(94, 194, 224)',
  water: 'rgb(126, 116, 219)',
};
/** Modalities have no traditional colour — the sidebar's amber/slate/teal triad. */
export const MODALITY_INK: Readonly<Record<Modality, string>> = {
  cardinal: 'rgb(216, 154, 65)',
  fixed: 'rgb(140, 152, 170)',
  mutable: 'rgb(95, 178, 152)',
};
export const ELEMENT_ORDER: readonly Element[] = ['fire', 'earth', 'air', 'water'];
export const MODALITY_ORDER: readonly Modality[] = ['cardinal', 'fixed', 'mutable'];

/** The wheel's aspects, plus the two declination aspects it draws beside them. */
export type AspectInkName = AspectName | 'parallel' | 'contraparallel';
export const ASPECT_INK_NAMES: readonly AspectInkName[] = [
  'conjunction',
  'opposition',
  'trine',
  'square',
  'sextile',
  'parallel',
  'contraparallel',
];
/** WheelSvg's aspect colours as they were written (ASPECT_TYPES, and the parallel /
 *  contraparallel pushes): conjunction gold, hard red, harmonious blue. */
export const ASPECT_INK_CANON: Readonly<Record<AspectInkName, string>> = {
  conjunction: '#f5b83d',
  opposition: '#e85a4f',
  trine: '#5ec2e0',
  square: '#e85a4f',
  sextile: '#5ec2e0',
  parallel: '#f5b83d',
  contraparallel: '#e85a4f',
};
/** The wheel's retrograde / station readout marks (WheelSvg RETRO_COLOR / STATION_COLOR). */
export const WHEEL_MOTION_INK_CANON = { retro: '#e85a4f', station: '#c79a17' } as const;

/** A body's id in a custom property: 'NorthNode' → 'north-node'. */
export const PLANET_SLUG: Readonly<Record<PlanetName, string>> = Object.fromEntries(
  PLANET_NAMES.map((p) => [p, p.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()]),
) as Record<PlanetName, string>;

/** A body's colour OFF the map (wheel, lists, cards): `var(--planet-<slug>, <canonical>)`.
 *  Use it in a `style` (a CSS property), never an SVG presentation attribute — var() is not
 *  reliable in `fill=` / `stroke=`. */
export function planetInk(p: PlanetName): string {
  // The Moon falls back through --moon-panel-ink before its pale tint (2026-10-08): that ink is
  // set wherever the Moon's glyph sits on a LIGHT ground — Glass's panels (index.css, or the
  // engine's ui.moonPanelInk for a light custom panel) and the report paper (report.css) — and
  // left unset on dark panels, where the pale grey reads. Until then only the sky band and the
  // planetary-hours window read it (panelGlyphColor), so the same Moon was slate there and
  // nearly invisible pale grey in the wheel, the lists and on the paper beside them.
  if (p === 'Moon') return `var(--planet-moon, var(--moon-panel-ink, ${PLANET_COLORS.Moon}))`;
  return `var(--planet-${PLANET_SLUG[p]}, ${PLANET_COLORS[p]})`;
}
export function aspectInk(a: AspectInkName): string {
  return `var(--aspect-${a}, ${ASPECT_INK_CANON[a]})`;
}
export function elementInk(e: Element): string {
  return `var(--element-${e}, ${ELEMENT_INK[e]})`;
}
export function modalityInk(m: Modality): string {
  return `var(--modality-${m}, ${MODALITY_INK[m]})`;
}
export function wheelMotionInk(kind: 'retro' | 'station'): string {
  return `var(--wheel-${kind}, ${WHEEL_MOTION_INK_CANON[kind]})`;
}

// ── The stylesheet, mirrored ───────────────────────────────────────────────────────────────
// Every custom property index.css declares in its `:root` palette block and its two theme
// blocks, per theme, with the cascade applied (Dark IS the :root block — it has none of its
// own). The UI tokens' built-ins are read from here, so they can only be what the stylesheet
// paints; verify:theme-palette §2 parses index.css and fails on any disagreement, and on any
// declared property that is neither mirrored nor listed in UNMIRRORED_CSS with its reason.
// Values are verbatim (whitespace as written).
const ROOT_CSS = {
  '--bg-page': '#0a0a0f',
  '--bg-panel': '15, 15, 22',
  '--bg-menu': '20, 20, 28',
  '--tint': '255, 255, 255',
  '--text-strong': '#e7e7ea',
  '--text': '#cccfd6',
  '--text-muted': '#a0a0aa',
  '--text-dim': '#8a8a96',
  '--text-faint': '#6b6b78',
  '--text-placeholder': '#8a8a96',
  '--accent': '#f5b83d',
  '--accent-rgb': '245, 184, 61',
  '--accent-hover': '#ffd070',
  '--cool': '#5ec2e0',
  '--cool-rgb': '94, 194, 224',
  '--danger': '#e85a4f',
  '--danger-rgb': '232, 90, 79',
  '--advanced': 'var(--danger)',
  '--advanced-rgb': 'var(--danger-rgb)',
  '--gated': '#8b6fd6',
  '--gated-rgb': '139, 111, 214',
  '--gated-ink': 'var(--gated)',
  '--gated-ink-rgb': 'var(--gated-rgb)',
  '--success': '#8de0a3',
  '--success-rgb': '141, 224, 163',
  '--neutral': '#d8d8d8',
  '--neutral-rgb': '216, 216, 216',
  '--home': '#ef92b4',
  '--home-rgb': '239, 146, 180',
  '--scrim': 'rgba(0, 0, 0, 0.72)',
  '--scrim-strong': 'rgba(0, 0, 0, 0.82)',
  '--pin-stroke': '#0a0a0f',
  '--label-halo': 'rgba(10, 10, 15, 0.95)',
  // The material's inset highlight, as a triplet, and the 3D globe's void (Map.css's three
  // per-theme literals until 2026-10-06; declared per theme in index.css since).
  '--panel-highlight': '255, 255, 255',
  '--globe-void': '#04050b',
} as const;

const VINTAGE_CSS = {
  '--bg-page': '#2a2017',
  '--bg-panel': '80, 61, 45',
  '--bg-menu': '70, 52, 36',
  '--tint': '240, 226, 192',
  '--text-strong': '#f0e2c0',
  '--text': '#dac9a4',
  '--text-muted': '#b8a07c',
  '--text-dim': '#8e7a5e',
  '--text-faint': '#978259',
  '--text-placeholder': '#c9b490',
  '--accent': '#f5b83d',
  '--accent-rgb': '245, 184, 61',
  '--accent-hover': '#ffd070',
  '--cool': '#7accdd',
  '--cool-rgb': '122, 204, 221',
  '--danger': '#e87a5a',
  '--danger-rgb': '232, 122, 90',
  '--success': '#a8d68a',
  '--success-rgb': '168, 214, 138',
  '--home': '#e79ca9',
  '--home-rgb': '231, 156, 169',
  '--gated-ink': '#c4abe0',
  '--gated-ink-rgb': '196, 171, 224',
  '--scrim': 'rgba(18, 12, 4, 0.7)',
  '--scrim-strong': 'rgba(18, 12, 4, 0.85)',
  '--pin-stroke': '#2a2017',
  '--label-halo': 'rgba(28, 20, 12, 0.95)',
  // Earth's warm inset highlight (the 240, 226, 192 its material rules hard-coded), its globe
  // void, and Lilith's lavender for the settings list (LILITH_PANEL_GLYPH_EARTH).
  '--panel-highlight': '240, 226, 192',
  '--globe-void': '#585a67',
  '--lilith-panel-ink': '#b092dc',
} as const;

const GLASS_CSS = {
  '--bg-page': '#dfe3ea',
  '--bg-panel': '246, 248, 252',
  '--bg-menu': '248, 249, 252',
  '--tint': '60, 68, 86',
  '--text-strong': '#2b3140',
  '--text': '#3e4452',
  '--text-muted': '#5e6473',
  '--text-dim': '#818796',
  '--text-faint': '#a6abb7',
  '--text-placeholder': '#5e6473',
  '--accent': '#c97b1a',
  '--accent-rgb': '201, 123, 26',
  '--accent-hover': '#a96514',
  '--cool': '#3a9ac0',
  '--cool-rgb': '58, 154, 192',
  '--danger': '#d04a3a',
  '--danger-rgb': '208, 74, 58',
  '--success': '#3aa965',
  '--success-rgb': '58, 169, 101',
  '--home': '#c4457a',
  '--home-rgb': '196, 69, 122',
  '--neutral': '#8b909c',
  '--neutral-rgb': '139, 144, 156',
  '--scrim': 'rgba(70, 78, 96, 0.42)',
  '--scrim-strong': 'rgba(70, 78, 96, 0.58)',
  '--pin-stroke': '#ffffff',
  '--label-halo': 'rgba(255, 255, 255, 0.95)',
  '--moon-panel-ink': '#5b6480',
  // Glass's globe void. Its inset highlight is the :root white.
  '--globe-void': '#d6e4f4',
} as const;

export const UI_CSS_MIRROR: Readonly<Record<Theme, Readonly<Record<string, string>>>> = {
  dark: ROOT_CSS,
  vintage: { ...ROOT_CSS, ...VINTAGE_CSS },
  glass: { ...ROOT_CSS, ...GLASS_CSS },
};

/** Mirrored properties index.css does not declare YET. verify §2 reports one as pending while
 *  it is absent and checks it like any other once present. Empty since the Custom theme's
 *  stylesheet phase declared --panel-highlight, --globe-void and --lilith-panel-ink
 *  (2026-10-06); kept as the slot a later mirrored property lands in while its stylesheet
 *  change is in flight. */
export const PENDING_CSS_DECLARATIONS: readonly string[] = [];

/** Properties index.css declares that the engine deliberately does not mirror, each with
 *  the reason. verify §2 requires every declared property to be mirrored or listed here. */
export const UNMIRRORED_CSS: Readonly<Record<string, string>> = {
  '--map-accent': 'alias of --accent; follows it through the stylesheet, and the data-mapstate remap would lose to an inline value',
  '--map-accent-rgb': 'alias of --accent-rgb (see --map-accent)',
  '--accent-brand': 'alias of --accent; follows it through the stylesheet',
  '--accent-brand-rgb': 'alias of --accent-rgb',
  '--tag-star': 'chart tag: a fixed hue in every theme by design',
  '--tag-star-rgb': 'chart tag',
  '--tag-space': 'chart tag',
  '--tag-space-rgb': 'chart tag',
  '--tag-shared': 'chart tag',
  '--tag-shared-rgb': 'chart tag',
  '--tag-unknown': 'chart tag',
  '--tag-unknown-rgb': 'chart tag',
  '--dur-tap': 'motion timing, not colour',
  '--dur-quick': 'motion timing',
  '--dur-move': 'motion timing',
  '--dur-flourish': 'motion timing',
  '--ease-settle': 'motion easing',
  '--ease-spring': 'motion easing',
  '--ease-pop': 'motion easing',
  '--fx-blur': 'effect multiplier set by the data-fx-* rules (FX_VARS), never by the engine',
  '--fx-opaque': 'effect multiplier (FX_VARS)',
  '--fx-shadow': 'effect multiplier (FX_VARS)',
  '--fx-glow': 'effect multiplier (FX_VARS)',
  '--sheen-alpha': 'effect multiplier (FX_VARS)',
};

// ── Effects ────────────────────────────────────────────────────────────────────────────────
// What the stylesheet does with each data-fx-* attribute: the multipliers its rules read.
// The engine writes only the ATTRIBUTE (lib/appearance, and only when it isn't the default);
// index.css declares these values under the matching selectors — the defaults on :root, the
// rest under :root[data-fx-<name>='<value>'] — and consumers scale by them:
//   panels: rgba(var(--bg-panel), max(α, var(--fx-opaque)))  ·  blur(calc(Npx * var(--fx-blur)))
//   decorative shadows: alpha × var(--fx-shadow)  ·  glows: alpha × var(--fx-glow)
// Motion 'reduced' carries no multiplier: its rules set durations to 0.01ms (never
// `animation: none` — the touch sidebar unmounts on animationend).
export const FX_DEFAULTS: Readonly<Omit<AppearanceAttrs, 'panelTone'>> = {
  frost: 'full',
  shadows: 'on',
  glows: 'on',
  motion: 'full',
};
export const FX_VARS = {
  frost: {
    full: { '--fx-blur': '1', '--fx-opaque': '0' },
    subtle: { '--fx-blur': '0.5', '--fx-opaque': '0.88' },
    solid: { '--fx-blur': '0', '--fx-opaque': '1' },
  },
  shadows: { on: { '--fx-shadow': '1' }, off: { '--fx-shadow': '0' } },
  glows: { on: { '--fx-glow': '1' }, off: { '--fx-glow': '0', '--sheen-alpha': '0' } },
  motion: { full: {}, reduced: {} },
} as const;
const FX_FROM_PRESET: Record<FxPreset, Omit<AppearanceAttrs, 'panelTone'>> = {
  full: { frost: 'full', shadows: 'on', glows: 'on', motion: 'full' },
  subtle: { frost: 'subtle', shadows: 'on', glows: 'off', motion: 'full' },
  flat: { frost: 'solid', shadows: 'off', glows: 'off', motion: 'reduced' },
};

// ── Map line styles ────────────────────────────────────────────────────────────────────────
// The widths, dashes and opacities Map.tsx's layers were drawn with, as of 2ecaa91 — now the
// single source, which Map reads through MapStyle. verify §8 parses Map.tsx (as it stood at
// that commit, and as it stands) and fails on any difference.
export const LINE_STYLE_BUILTIN = {
  natal: { mcWidth: 1.9, icWidth: 1.0, horizonWidth: 1.5, vxWidth: 1.0 },
  overlay: {
    mcWidth: 1.5,
    icWidth: 0.8,
    horizonWidth: 1.1,
    vxWidth: 0.8,
    meridianDash: [3, 3],
    horizonDash: [2, 3],
  },
  paran: { width: 0.7, overlayDash: [2, 3] },
  minorParan: { width: 0.6 },
  aspect: { width: 1.3, dash: [1, 3] },
  localSpace: { width: 1.2, inboundDash: [2, 2], overlayWidth: 1.0, overlayDash: [1, 3] },
  star: { width: 0.8, opacity: 0.9, dash: [1, 2.5] },
  minor: { mcWidth: 1.4, horizonWidth: 1.1, icWidth: 0.9, vxWidth: 0.8, overlayMarkOpacity: 0.85 },
  ecliptic: { color: '#ffe14d', width: 1.6, opacity: 0.45, overlayDash: [1, 2] },
} as const;

/** The dash arrays a dash token may take: two-element [on, off] patterns only. A dash in
 *  MapLibre is in line widths, and the overlay node pair offsets its South half by a leading
 *  0 ([0, on, off]); a longer pattern would break that interleave. Every built-in is here. */
export const DASH_PRESETS: readonly (readonly number[])[] = [
  [1, 2],
  [1, 2.5],
  [1, 3],
  [2, 2],
  [2, 3],
  [3, 3],
  [4, 2],
  [4, 3],
  [6, 3],
];

// ── The tokens ─────────────────────────────────────────────────────────────────────────────
// Token ids are a SYNCED, PERSISTED CONTRACT: they are the keys of every saved custom theme,
// the rows of a Pro account's table and the payload of every share code ever copied. So:
// dotted lowerCamel (TOKEN_ID_RE), and an id is RETIRED, never repurposed — a token whose
// meaning changes gets a new id, and the old one stays unknown to sanitizeOverrides (dropped
// on read, kept verbatim by the Pro store's `extra` so a newer device's value survives an
// older one). Order here is the order the editor presents them in.
export const TOKEN_ID_RE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;

const PANEL_TONE: Record<Theme, PanelTone> = { vintage: 'dark', glass: 'light', dark: 'dark' };
/** The palette a tone flip lands on: Glass's for a light panel, Dark's for a dark one. */
const TONE_THEME: Record<PanelTone, Theme> = { light: 'glass', dark: 'dark' };
/** One-ink defaults: near-black on the light maps, near-white on the dark one. */
const INK_FOR_TABLE: Record<Theme, string> = { vintage: '#111111', glass: '#111111', dark: '#f2f2f2' };

const mirror = (t: Theme, name: string): string => UI_CSS_MIRROR[t][name] ?? '';
const mirrorHex = (t: Theme, name: string): string => toHex(mirror(t, name));
const str = (v: TokenValue): string => (typeof v === 'string' ? v : '');
const isTheme = (v: unknown): v is Theme => v === 'vintage' || v === 'glass' || v === 'dark';
const isServedMap = (v: unknown): v is ServedMap => isTheme(v) || v === 'positron';

/** The table a map token reads its built-in from: the chosen basemap's, or for the Outline
 *  map the light or dark table its land tone calls for. Reads map.land only for Outline.
 *  Positron reads GLASS's tables (2026-10-08): they were tuned on it, and a palette pinned to it
 *  must resolve every map token exactly as Glass did there. Only the offline colours are the
 *  map's own (fallbackTableOf). */
function mapTableOf(get: TokenGetter, base: Theme): Theme {
  const choice = get('map.basemap');
  if (choice === 'outline') {
    return isLightColor(str(get('map.land'))) ? (base === 'dark' ? 'glass' : base) : 'dark';
  }
  if (choice === 'positron') return 'glass';
  return isTheme(choice) ? choice : base;
}
/** The WORLD_FALLBACK_COLORS entry a palette's land, water and coastline follow: the served map
 *  chosen, Positron included; for the Outline map, mapTableOf's light or dark table. Reads only
 *  what mapTableOf reads. */
function fallbackTableOf(get: TokenGetter, base: Theme): ServedMap {
  const choice = get('map.basemap');
  return choice === 'positron' ? choice : mapTableOf(get, base);
}
const MAP_TABLE_DEPS = ['map.basemap', 'map.land'] as const;

const WIDTH = { min: 0.2, max: 4, step: 0.05 } as const;
const OPACITY = { min: 0.1, max: 1, step: 0.05 } as const;
const ON_OFF = ['on', 'off'] as const;

const T: TokenDef[] = [];
const add = (d: TokenDef) => void T.push(d);

// ── Essentials ──
add({
  id: 'ui.panel',
  kind: 'color',
  group: 'essentials',
  tier: 'seed',
  builtin: (b) => mirrorHex(b, '--bg-panel'),
  css: { name: '--bg-panel', triplet: true },
});
add({
  id: 'ui.panelTone',
  kind: 'enum',
  group: 'essentials',
  tier: 'seed',
  options: ['light', 'dark'],
  builtin: (b) => PANEL_TONE[b],
  deps: ['ui.panel'],
  derive: (get, c) => (c.moved('ui.panel') ? (isLightColor(str(get('ui.panel'))) ? 'light' : 'dark') : c.builtin),
});
// The text seed. Follows a tone flip (a dark panel's light text on a now-light panel would
// be unreadable), else stays the base's.
add({
  id: 'ui.text',
  kind: 'color',
  group: 'essentials',
  tier: 'seed',
  builtin: (b) => mirrorHex(b, '--text-strong'),
  deps: ['ui.panelTone'],
  derive: (get, c) =>
    c.moved('ui.panelTone') ? mirrorHex(TONE_THEME[get('ui.panelTone') as PanelTone], '--text-strong') : c.builtin,
});
add({
  id: 'ui.accent',
  kind: 'color',
  group: 'essentials',
  tier: 'seed',
  builtin: (b) => mirrorHex(b, '--accent'),
  css: { name: '--accent', rgbPair: true },
  deps: ['ui.panelTone'],
  derive: (get, c) =>
    c.moved('ui.panelTone') ? mirrorHex(TONE_THEME[get('ui.panelTone') as PanelTone], '--accent') : c.builtin,
});
add({
  id: 'map.basemap',
  kind: 'enum',
  group: 'essentials',
  tier: 'seed',
  options: BASEMAP_CHOICES,
  builtin: (b) => b,
});
add({
  id: 'map.land',
  kind: 'color',
  group: 'essentials',
  tier: 'seed',
  builtin: (b) => WORLD_FALLBACK_COLORS[b].land,
  deps: ['map.basemap'],
  derive: (get, c) => {
    const choice = get('map.basemap');
    return WORLD_FALLBACK_COLORS[isServedMap(choice) ? choice : c.base].land;
  },
});
add({
  id: 'map.water',
  kind: 'color',
  group: 'essentials',
  tier: 'seed',
  builtin: (b) => WORLD_FALLBACK_COLORS[b].ocean,
  deps: ['map.basemap'],
  derive: (get, c) => {
    const choice = get('map.basemap');
    return WORLD_FALLBACK_COLORS[isServedMap(choice) ? choice : c.base].ocean;
  },
});
add({
  id: 'lines.mode',
  kind: 'enum',
  group: 'essentials',
  tier: 'seed',
  options: ['planets', 'ink'],
  builtin: () => 'planets',
});
add({
  id: 'lines.ink',
  kind: 'color',
  group: 'essentials',
  tier: 'seed',
  builtin: (b) => INK_FOR_TABLE[b],
  deps: [...MAP_TABLE_DEPS],
  derive: (get, c) => INK_FOR_TABLE[mapTableOf(get, c.base)],
});
add({
  id: 'lines.weight',
  kind: 'number',
  group: 'essentials',
  tier: 'seed',
  range: { min: 0.5, max: 2, step: 0.05 },
  builtin: () => 1,
});
add({
  id: 'fx.preset',
  kind: 'enum',
  group: 'essentials',
  tier: 'seed',
  options: ['full', 'subtle', 'flat'],
  builtin: () => 'full',
});

// ── Interface ──
const panelRule =
  (f: (panel: string, tone: PanelTone, get: TokenGetter) => string) =>
  (get: TokenGetter, c: DeriveContext): TokenValue =>
    c.moved('ui.panel') ? f(str(get('ui.panel')), get('ui.panelTone') as PanelTone, get) : c.builtin;
const PANEL_DEPS = ['ui.panel', 'ui.panelTone'] as const;
add({
  id: 'ui.page',
  kind: 'color',
  group: 'interface',
  tier: 'derived',
  builtin: (b) => mirrorHex(b, '--bg-page'),
  css: { name: '--bg-page' },
  deps: [...PANEL_DEPS],
  derive: panelRule((p, tone) => toHex(mix(p, '#000000', tone === 'light' ? 0.1 : 0.45))),
});
add({
  id: 'ui.menu',
  kind: 'color',
  group: 'interface',
  tier: 'derived',
  builtin: (b) => mirrorHex(b, '--bg-menu'),
  css: { name: '--bg-menu', triplet: true },
  deps: [...PANEL_DEPS],
  derive: panelRule((p, tone) => toHex(mix(p, '#ffffff', tone === 'light' ? 0.3 : 0.04))),
});
add({
  id: 'ui.panelHighlight',
  kind: 'color',
  group: 'interface',
  tier: 'derived',
  builtin: (b) => mirrorHex(b, '--panel-highlight'),
  css: { name: '--panel-highlight', triplet: true },
  deps: [...PANEL_DEPS],
  derive: panelRule((p, tone) => (tone === 'light' ? '#ffffff' : toHex(mix(p, '#ffffff', 0.82)))),
});
add({
  id: 'ui.scrim',
  kind: 'color',
  group: 'interface',
  tier: 'derived',
  alpha: true,
  builtin: (b) => mirror(b, '--scrim'),
  css: { name: '--scrim' },
  deps: [...PANEL_DEPS],
  derive: panelRule((p, tone) =>
    formatColor(tone === 'light' ? withAlpha(mix(p, '#283044', 0.75), 0.42) : withAlpha(mix(p, '#000000', 0.8), 0.72)),
  ),
});
add({
  id: 'ui.scrimStrong',
  kind: 'color',
  group: 'interface',
  tier: 'derived',
  alpha: true,
  builtin: (b) => mirror(b, '--scrim-strong'),
  css: { name: '--scrim-strong' },
  deps: [...PANEL_DEPS],
  derive: panelRule((p, tone) =>
    formatColor(tone === 'light' ? withAlpha(mix(p, '#283044', 0.75), 0.58) : withAlpha(mix(p, '#000000', 0.8), 0.84)),
  ),
});
add({
  id: 'ui.pinStroke',
  kind: 'color',
  group: 'interface',
  tier: 'derived',
  builtin: (b) => mirrorHex(b, '--pin-stroke'),
  css: { name: '--pin-stroke' },
  deps: [...PANEL_DEPS, 'ui.page'],
  derive: panelRule((_p, tone, get) => (tone === 'light' ? '#ffffff' : str(get('ui.page')))),
});
add({
  id: 'ui.labelHalo',
  kind: 'color',
  group: 'interface',
  tier: 'derived',
  alpha: true,
  builtin: (b) => mirror(b, '--label-halo'),
  css: { name: '--label-halo' },
  deps: [...PANEL_DEPS, 'ui.page'],
  derive: panelRule((_p, tone, get) =>
    tone === 'light' ? 'rgba(255, 255, 255, 0.95)' : formatColor(withAlpha(str(get('ui.page')), 0.95)),
  ),
});
// The text ramp: named by where it is used (the editor's own labels say Titles and values,
// Body text, Labels, Hints, Unavailable controls, Placeholders). The reader's own text colour
// re-derives it, mixed toward the panel; a tone flip alone lands it on that tone's own tuned
// ramp (Glass's or Dark's); a panel tweak that keeps its tone keeps the base's.
const toneValue = (get: TokenGetter, name: string) => mirrorHex(TONE_THEME[get('ui.panelTone') as PanelTone], name);
const rampRule =
  (t: number, name: string) =>
  (get: TokenGetter, c: DeriveContext): TokenValue => {
    if (c.own('ui.text')) return toHex(mix(str(get('ui.text')), str(get('ui.panel')), t));
    if (c.moved('ui.panelTone')) return toneValue(get, name);
    return c.builtin;
  };
add({
  id: 'ui.textStrong',
  kind: 'color',
  group: 'interface',
  tier: 'derived',
  builtin: (b) => mirrorHex(b, '--text-strong'),
  css: { name: '--text-strong' },
  deps: ['ui.text'],
  derive: (get, c) => (c.moved('ui.text') ? str(get('ui.text')) : c.builtin),
});
for (const [id, name, t] of [
  ['ui.textBody', '--text', 0.12],
  ['ui.textMuted', '--text-muted', 0.32],
  ['ui.textDim', '--text-dim', 0.45],
  ['ui.textFaint', '--text-faint', 0.55],
] as const) {
  add({
    id,
    kind: 'color',
    group: 'interface',
    tier: 'derived',
    builtin: (b) => mirrorHex(b, name),
    css: { name },
    deps: ['ui.text', 'ui.panel', 'ui.panelTone'],
    derive: rampRule(t, name),
  });
}
// The placeholder is SOLVED, not mixed: index.css's note on --text-placeholder says why (every
// placeholder must clear 4.5:1). Starts from the base's own when only the panel moved.
add({
  id: 'ui.textPlaceholder',
  kind: 'color',
  group: 'interface',
  tier: 'derived',
  builtin: (b) => mirrorHex(b, '--text-placeholder'),
  css: { name: '--text-placeholder' },
  deps: ['ui.text', 'ui.panel', 'ui.panelTone'],
  derive: (get, c) => {
    const textOwn = c.own('ui.text');
    const toneMoved = c.moved('ui.panelTone');
    const panelMoved = c.moved('ui.panel');
    if (!textOwn && !toneMoved && !panelMoved) return c.builtin;
    const panel = str(get('ui.panel'));
    const text = str(get('ui.text'));
    // The starting point: the base's own, or after a tone flip that tone's own.
    const start = textOwn ? null : toneMoved ? toneValue(get, '--text-placeholder') : str(c.builtin);
    if (start && contrastRatio(start, panel) >= 4.5) return start;
    for (let t = 0.32; t > 0; t -= 0.02) {
      const cand = toHex(mix(text, panel, t)); // checked as written (see liftForContrast)
      if (contrastRatio(cand, panel) >= 4.5) return cand;
    }
    return contrastRatio(text, panel) >= 4.5 ? toHex(text) : readableOn(panel);
  },
});
add({
  id: 'ui.tint',
  kind: 'color',
  group: 'interface',
  tier: 'derived',
  builtin: (b) => mirrorHex(b, '--tint'),
  css: { name: '--tint', triplet: true },
  deps: ['ui.text', 'ui.panelTone'],
  derive: (get, c) => {
    if (c.own('ui.text')) return str(get('ui.text'));
    if (c.moved('ui.panelTone')) return toneValue(get, '--tint');
    return c.builtin;
  },
});
add({
  id: 'ui.accentHover',
  kind: 'color',
  group: 'interface',
  tier: 'derived',
  builtin: (b) => mirrorHex(b, '--accent-hover'),
  css: { name: '--accent-hover' },
  deps: ['ui.accent', 'ui.panelTone'],
  derive: (get, c) => {
    if (c.own('ui.accent')) {
      const a = str(get('ui.accent'));
      return toHex(get('ui.panelTone') === 'light' ? mix(a, '#000000', 0.16) : mix(a, '#ffffff', 0.25));
    }
    if (c.moved('ui.panelTone')) return toneValue(get, '--accent-hover');
    return c.builtin;
  },
});
// Text on an accent fill: the primary buttons (BirthDataForm, ImportChartModal, MissionGuide,
// TimelineDateModal), which hard-coded the page ink '#0a0a0f' — so that is the built-in and
// those consumers' fallback, on every theme's own accent, a tone flip's included. (The tier
// badges and the section header that also print '#fff' on a fill are NOT consumers: their
// fills are the pinned tier colours, never the reader's accent.) The reader's OWN accent gets
// whichever of pure black and white reads on it, which always clears 4.5:1 — '#0a0a0f' as the
// dark choice would dip to about 4.44 on a mid-luminance accent. (2026-10-06)
add({
  id: 'ui.onAccent',
  kind: 'color',
  group: 'interface',
  tier: 'derived',
  builtin: () => '#0a0a0f',
  css: { name: '--on-accent', fallback: true },
  deps: ['ui.accent'],
  derive: (get, c) => (c.own('ui.accent') ? readableOn(str(get('ui.accent'))) : c.builtin),
});
// The marker / state colours, each its own choice. A tone flip lands each on the palette made
// for that tone (Glass's deeper versions read on a light panel; Dark's on a dark one).
for (const [id, name] of [
  ['ui.cool', '--cool'],
  ['ui.danger', '--danger'],
  ['ui.success', '--success'],
  ['ui.neutral', '--neutral'],
  ['ui.home', '--home'],
] as const) {
  add({
    id,
    kind: 'color',
    group: 'interface',
    tier: 'detail',
    builtin: (b) => mirrorHex(b, name),
    css: { name, rgbPair: true },
    deps: ['ui.panelTone'],
    derive: (get, c) =>
      c.moved('ui.panelTone') ? mirrorHex(TONE_THEME[get('ui.panelTone') as PanelTone], name) : c.builtin,
  });
}
// A planet glyph standing alone on a panel (lib/theme panelGlyphColor): Glass declares the
// Moon's slate; null elsewhere, so the Moon keeps its tint.
add({
  id: 'ui.moonPanelInk',
  kind: 'color?',
  group: 'interface',
  tier: 'derived',
  builtin: (b) => (b === 'glass' ? MOON_LINE_DARK : null),
  css: { name: '--moon-panel-ink' },
  deps: ['planet.Moon', 'ui.panelTone'],
  derive: (get, c) => {
    if (c.moved('planet.Moon')) return str(get('planet.Moon'));
    if (c.moved('ui.panelTone')) return get('ui.panelTone') === 'light' ? MOON_LINE_DARK : null;
    return c.builtin;
  },
});
// Lilith in the settings list (Sidebar's lone exception): Earth declares a lavender lift.
add({
  id: 'ui.lilithPanelInk',
  kind: 'color?',
  group: 'interface',
  tier: 'derived',
  builtin: (b) => (b === 'vintage' ? LILITH_PANEL_GLYPH_EARTH : null),
  css: { name: '--lilith-panel-ink' },
  deps: ['planet.Lilith', 'ui.panel'],
  derive: (get, c) => {
    if (c.moved('planet.Lilith')) return str(get('planet.Lilith'));
    if (!c.moved('ui.panel')) return c.builtin;
    const panel = str(get('ui.panel'));
    return contrastRatio(PLANET_COLORS.Lilith, panel) >= 3 ? null : liftForContrast(PLANET_COLORS.Lilith, panel, 3);
  },
});
// The tier colours. --gated and --advanced explain tiers to onlookers: locked. --advanced is
// written only when --danger moves, so it stays its built-in rather than following. The
// gated INK is derived for contrast against the panel and is not a choice either.
add({
  id: 'ui.gated',
  kind: 'color',
  group: 'interface',
  tier: 'detail',
  hidden: true,
  locked: true,
  builtin: (b) => mirrorHex(b, '--gated'),
  css: { name: '--gated', rgbPair: true },
});
add({
  id: 'ui.advanced',
  kind: 'color',
  group: 'interface',
  tier: 'detail',
  hidden: true,
  locked: true,
  builtin: (b) => mirrorHex(b, '--danger'),
  css: { name: '--advanced', rgbPair: true, alias: 'ui.danger' },
});
add({
  id: 'ui.gatedInk',
  kind: 'color',
  group: 'interface',
  tier: 'derived',
  hidden: true,
  locked: true,
  builtin: (b) => (mirror(b, '--gated-ink').startsWith('var(') ? mirrorHex(b, '--gated') : mirrorHex(b, '--gated-ink')),
  css: { name: '--gated-ink', rgbPair: true },
  deps: ['ui.panel'],
  derive: (get, c) =>
    c.moved('ui.panel') ? liftForContrast(str(c.builtin), str(get('ui.panel')), 4.5) : c.builtin,
});

// ── Map lines ──
const inkMode = (get: TokenGetter) => get('lines.mode') === 'ink';
for (const p of PLANET_NAMES) {
  add({
    id: `planet.${p}`,
    kind: 'color',
    group: 'mapLines',
    tier: 'detail',
    builtin: () => PLANET_COLORS[p],
  });
}
// The colour each body's map lines, zenith and edge badge are drawn in: the body's colour,
// legibility-swapped on the basemap that needs it (the Moon's slate on the light maps) unless
// the reader chose the body's colour themselves, or one ink for every line.
for (const p of PLANET_NAMES) {
  add({
    id: `map.ink.${p}`,
    kind: 'color',
    group: 'mapLines',
    tier: 'derived',
    hidden: true,
    builtin: (b) => MAP_LINE_COLOR_OVERRIDES[b][p] ?? PLANET_COLORS[p],
    deps: [`planet.${p}`, 'lines.mode', 'lines.ink', ...MAP_TABLE_DEPS],
    derive: (get, c) => {
      if (inkMode(get)) return str(get('lines.ink'));
      const own = str(get(`planet.${p}`));
      if (c.moved(`planet.${p}`)) return own;
      return MAP_LINE_COLOR_OVERRIDES[mapTableOf(get, c.base)][p] ?? own;
    },
  });
}
// A body's parans are drawn in its map ink, the colour of its own lines on the same map — so the
// Moon's parans take the Moon's slate on the light maps like its lines do (2026-10-08). Until
// then parans kept the canonical colours ("they have never taken the Moon's legibility swap"),
// which left the Moon's parans pale grey on Glass and Earth right beside its slate lines: a
// legibility swap applied to one family of the Moon's lines and not the next. One rule now —
// the Moon is slate on a light ground, pale grey elsewhere (lib/theme MOON_LINE_DARK).
for (const p of PLANET_NAMES) {
  add({
    id: `paran.${p}`,
    kind: 'color',
    group: 'mapLines',
    tier: 'derived',
    hidden: true,
    builtin: (b) => MAP_LINE_COLOR_OVERRIDES[b][p] ?? PLANET_COLORS[p],
    deps: [`map.ink.${p}`],
    derive: (get) => str(get(`map.ink.${p}`)),
  });
}
add({
  id: 'nodePair.nn',
  kind: 'color',
  group: 'mapLines',
  tier: 'derived',
  builtin: () => PLANET_COLORS.NorthNode,
  deps: ['map.ink.NorthNode'],
  derive: (get) => str(get('map.ink.NorthNode')),
});
add({
  id: 'nodePair.sn',
  kind: 'color',
  group: 'mapLines',
  tier: 'derived',
  builtin: () => PLANET_COLORS.SouthNode,
  deps: ['map.ink.SouthNode'],
  derive: (get) => str(get('map.ink.SouthNode')),
});
for (let i = 0; i < MINOR_LINE_PALETTE.dark.length; i++) {
  add({
    id: `lines.minor.${i}`,
    kind: 'color',
    group: 'mapLines',
    tier: 'derived',
    builtin: (b) => MINOR_LINE_PALETTE[b][i],
    deps: ['lines.mode', 'lines.ink', ...MAP_TABLE_DEPS],
    derive: (get, c) => (inkMode(get) ? str(get('lines.ink')) : MINOR_LINE_PALETTE[mapTableOf(get, c.base)][i]),
  });
}
add({
  id: 'lines.star',
  kind: 'color',
  group: 'mapLines',
  tier: 'derived',
  builtin: (b) => STAR_LINE_COLORS[b],
  deps: ['lines.mode', 'lines.ink', ...MAP_TABLE_DEPS],
  derive: (get, c) => (inkMode(get) ? str(get('lines.ink')) : STAR_LINE_COLORS[mapTableOf(get, c.base)]),
});
add({
  id: 'lines.ecliptic',
  kind: 'color',
  group: 'mapLines',
  tier: 'derived',
  builtin: () => LINE_STYLE_BUILTIN.ecliptic.color,
  deps: ['lines.mode', 'lines.ink'],
  derive: (get, c) => (inkMode(get) ? str(get('lines.ink')) : c.builtin),
});
// An overlay's lines: the natal colours, or one ink of their own.
add({
  id: 'lines.overlay.mode',
  kind: 'enum',
  group: 'mapLines',
  tier: 'detail',
  options: ['natal', 'ink'],
  builtin: () => 'natal',
});
add({
  id: 'lines.overlay.ink',
  kind: 'color',
  group: 'mapLines',
  tier: 'derived',
  builtin: (b) => INK_FOR_TABLE[b],
  deps: ['lines.ink'],
  derive: (get) => str(get('lines.ink')),
});
// Aspect and midpoint lines: the bodies' colours, or one ink.
add({
  id: 'lines.aspect.mode',
  kind: 'enum',
  group: 'mapLines',
  tier: 'detail',
  options: ['bodies', 'ink'],
  builtin: () => 'bodies',
});
add({
  id: 'lines.aspect.ink',
  kind: 'color',
  group: 'mapLines',
  tier: 'derived',
  builtin: (b) => INK_FOR_TABLE[b],
  deps: ['lines.ink'],
  derive: (get) => str(get('lines.ink')),
});
const LS = LINE_STYLE_BUILTIN;
const lineStyle: [string, number | readonly number[], 'width' | 'opacity' | 'dash'][] = [
  ['lineStyle.natal.mc.width', LS.natal.mcWidth, 'width'],
  ['lineStyle.natal.horizon.width', LS.natal.horizonWidth, 'width'],
  ['lineStyle.natal.ic.width', LS.natal.icWidth, 'width'],
  ['lineStyle.natal.vx.width', LS.natal.vxWidth, 'width'],
  ['lineStyle.overlay.mc.width', LS.overlay.mcWidth, 'width'],
  ['lineStyle.overlay.horizon.width', LS.overlay.horizonWidth, 'width'],
  ['lineStyle.overlay.ic.width', LS.overlay.icWidth, 'width'],
  ['lineStyle.overlay.vx.width', LS.overlay.vxWidth, 'width'],
  ['lineStyle.overlay.meridian.dash', LS.overlay.meridianDash, 'dash'],
  ['lineStyle.overlay.horizon.dash', LS.overlay.horizonDash, 'dash'],
  ['lineStyle.paran.width', LS.paran.width, 'width'],
  ['lineStyle.paran.overlay.dash', LS.paran.overlayDash, 'dash'],
  ['lineStyle.minorParan.width', LS.minorParan.width, 'width'],
  ['lineStyle.aspect.width', LS.aspect.width, 'width'],
  ['lineStyle.aspect.dash', LS.aspect.dash, 'dash'],
  ['lineStyle.star.width', LS.star.width, 'width'],
  ['lineStyle.star.opacity', LS.star.opacity, 'opacity'],
  ['lineStyle.star.dash', LS.star.dash, 'dash'],
  ['lineStyle.localSpace.width', LS.localSpace.width, 'width'],
  ['lineStyle.localSpace.inbound.dash', LS.localSpace.inboundDash, 'dash'],
  ['lineStyle.localSpace.overlay.width', LS.localSpace.overlayWidth, 'width'],
  ['lineStyle.localSpace.overlay.dash', LS.localSpace.overlayDash, 'dash'],
  ['lineStyle.minor.mc.width', LS.minor.mcWidth, 'width'],
  ['lineStyle.minor.horizon.width', LS.minor.horizonWidth, 'width'],
  ['lineStyle.minor.ic.width', LS.minor.icWidth, 'width'],
  ['lineStyle.minor.vx.width', LS.minor.vxWidth, 'width'],
  ['lineStyle.ecliptic.width', LS.ecliptic.width, 'width'],
  ['lineStyle.ecliptic.opacity', LS.ecliptic.opacity, 'opacity'],
  ['lineStyle.ecliptic.overlay.dash', LS.ecliptic.overlayDash, 'dash'],
];
for (const [id, value, kind] of lineStyle) {
  add(
    kind === 'dash'
      ? { id, kind: 'dash', group: 'mapLines', tier: 'detail', presets: DASH_PRESETS, builtin: () => value }
      : { id, kind: 'number', group: 'mapLines', tier: 'detail', range: kind === 'width' ? WIDTH : OPACITY, builtin: () => value },
  );
}
for (const id of ['lines.arrows', 'lines.minorBeads', 'lines.starSparks']) {
  add({ id, kind: 'enum', group: 'mapLines', tier: 'detail', options: ON_OFF, builtin: () => 'on' });
}

// ── Map surface ──
// The served vector basemap's own paint, overridden only where the reader set something.
add({
  id: 'basemap.water',
  kind: 'color?',
  group: 'mapSurface',
  tier: 'derived',
  builtin: () => null,
  deps: ['map.water'],
  derive: (get, c) => (c.own('map.water') ? str(get('map.water')) : null),
});
add({
  id: 'basemap.waterway',
  kind: 'color?',
  group: 'mapSurface',
  tier: 'derived',
  builtin: () => null,
  deps: ['map.water'],
  derive: (get, c) => (c.own('map.water') ? str(get('map.water')) : null),
});
add({
  id: 'basemap.land',
  kind: 'color?',
  group: 'mapSurface',
  tier: 'derived',
  builtin: () => null,
  deps: ['map.land'],
  derive: (get, c) => (c.own('map.land') ? str(get('map.land')) : null),
});
add({
  id: 'basemap.landcover',
  kind: 'enum',
  group: 'mapSurface',
  tier: 'derived',
  options: ['keep', 'flat'],
  builtin: () => 'keep',
  deps: ['map.land'],
  derive: (_get, c) => (c.own('map.land') ? 'flat' : 'keep'),
});
add({ id: 'basemap.border', kind: 'color?', group: 'mapSurface', tier: 'detail', builtin: () => null });
// Roads: the style's own, but on Glass's map (Bright) a quiet warm grey since 2026-10-08 — lib/theme
// BASEMAP_ROAD_PAINT says why. Follows the map CHOSEN, not mapTableOf: that reads Glass's tables for
// Positron, and Positron keeps its own roads. (Outline has none to paint.)
add({
  id: 'basemap.road',
  kind: 'color?',
  group: 'mapSurface',
  tier: 'detail',
  builtin: (b) => BASEMAP_ROAD_PAINT[b],
  deps: ['map.basemap'],
  derive: (get) => {
    const choice = get('map.basemap');
    return isServedMap(choice) ? BASEMAP_ROAD_PAINT[choice] : null;
  },
});
add({ id: 'basemap.building', kind: 'color?', group: 'mapSurface', tier: 'detail', builtin: () => null });
add({
  id: 'basemap.label',
  kind: 'color?',
  group: 'mapSurface',
  tier: 'derived',
  builtin: (b) => LABEL_CONTRAST[b]?.color ?? null,
  deps: [...MAP_TABLE_DEPS],
  derive: (get, c) => LABEL_CONTRAST[mapTableOf(get, c.base)]?.color ?? null,
});
add({
  id: 'basemap.labelHalo',
  kind: 'color?',
  group: 'mapSurface',
  tier: 'derived',
  alpha: true,
  builtin: (b) => LABEL_CONTRAST[b]?.halo ?? null,
  deps: [...MAP_TABLE_DEPS],
  derive: (get, c) => LABEL_CONTRAST[mapTableOf(get, c.base)]?.halo ?? null,
});
add({
  id: 'basemap.labelHaloWidth',
  kind: 'number?',
  group: 'mapSurface',
  tier: 'derived',
  range: { min: 0, max: 3, step: 0.05 },
  builtin: (b) => LABEL_CONTRAST[b]?.haloWidth ?? null,
  deps: [...MAP_TABLE_DEPS],
  derive: (get, c) => LABEL_CONTRAST[mapTableOf(get, c.base)]?.haloWidth ?? null,
});
add({
  id: 'map.globeVoid',
  kind: 'color',
  group: 'mapSurface',
  tier: 'derived',
  builtin: (b) => mirrorHex(b, '--globe-void'),
  css: { name: '--globe-void' },
  deps: [...MAP_TABLE_DEPS],
  derive: (get, c) => mirrorHex(mapTableOf(get, c.base), '--globe-void'),
});
add({
  id: 'nightShade.color',
  kind: 'color',
  group: 'mapSurface',
  tier: 'derived',
  builtin: (b) => NIGHT_SHADE_STYLE[b].color,
  deps: [...MAP_TABLE_DEPS],
  derive: (get, c) => NIGHT_SHADE_STYLE[mapTableOf(get, c.base)].color,
});
add({
  id: 'nightShade.opacity',
  kind: 'number',
  group: 'mapSurface',
  tier: 'derived',
  range: { min: 0, max: 0.8, step: 0.01 },
  builtin: (b) => NIGHT_SHADE_STYLE[b].opacity,
  deps: [...MAP_TABLE_DEPS],
  derive: (get, c) => NIGHT_SHADE_STYLE[mapTableOf(get, c.base)].opacity,
});
// Marks drawn ON the map surface: an own land colour re-derives them for that land, else
// they follow the basemap's table.
const landRule =
  (fromLand: (land: string, light: boolean) => TokenValue, fromTable: (t: Theme) => TokenValue) =>
  (get: TokenGetter, c: DeriveContext): TokenValue => {
    if (c.own('map.land')) {
      const land = str(get('map.land'));
      return fromLand(land, isLightColor(land));
    }
    return fromTable(mapTableOf(get, c.base));
  };
const LAND_DEPS = ['map.land', 'map.basemap'] as const;
add({
  id: 'geo.grid.line',
  kind: 'color',
  group: 'mapSurface',
  tier: 'derived',
  builtin: (b) => GEO_GRID_STYLE[b].line,
  deps: [...LAND_DEPS],
  derive: landRule(
    (land, light) => toHex(light ? mix(land, '#000000', 0.72) : mix(land, '#ffffff', 0.78)),
    (t) => GEO_GRID_STYLE[t].line,
  ),
});
add({
  id: 'geo.grid.opacity',
  kind: 'number',
  group: 'mapSurface',
  tier: 'derived',
  range: { min: 0.05, max: 1, step: 0.01 },
  builtin: (b) => GEO_GRID_STYLE[b].opacity,
  deps: [...MAP_TABLE_DEPS],
  derive: (get, c) => GEO_GRID_STYLE[mapTableOf(get, c.base)].opacity,
});
add({
  id: 'geo.grid.width',
  kind: 'number',
  group: 'mapSurface',
  tier: 'derived',
  range: { min: 0.2, max: 2, step: 0.05 },
  builtin: (b) => GEO_GRID_STYLE[b].width,
  deps: [...MAP_TABLE_DEPS],
  derive: (get, c) => GEO_GRID_STYLE[mapTableOf(get, c.base)].width,
});
add({
  id: 'geo.grid.label',
  kind: 'color',
  group: 'mapSurface',
  tier: 'derived',
  builtin: (b) => GEO_GRID_STYLE[b].label,
  deps: ['geo.grid.line'],
  derive: (get) => str(get('geo.grid.line')),
});
add({
  id: 'geo.grid.hover',
  kind: 'number',
  group: 'mapSurface',
  tier: 'derived',
  range: { min: 0, max: 0.5, step: 0.01 },
  builtin: (b) => GEO_GRID_STYLE[b].hover,
  deps: [...MAP_TABLE_DEPS],
  derive: (get, c) => GEO_GRID_STYLE[mapTableOf(get, c.base)].hover,
});
// The MC zones: Auto from the element colours (modality as lightness), but only once an
// element colour has moved — until then, the basemap's tuned table.
for (const el of ELEMENT_ORDER) {
  MODALITY_ORDER.forEach((mod, i) => {
    add({
      id: `geoZone.${el}.${mod}`,
      kind: 'color',
      group: 'mapSurface',
      tier: 'derived',
      builtin: (b) => GEO_ZONE_COLORS[b][el][i],
      deps: [`element.${el}`, ...MAP_TABLE_DEPS],
      derive: (get, c) => {
        if (c.moved(`element.${el}`)) {
          const e = str(get(`element.${el}`));
          return toHex(i === 0 ? mix(e, '#000000', 0.22) : i === 1 ? e : mix(e, '#ffffff', 0.35));
        }
        return GEO_ZONE_COLORS[mapTableOf(get, c.base)][el][i];
      },
    });
  });
}
add({
  id: 'marks.zenithDisc',
  kind: 'color',
  group: 'mapSurface',
  tier: 'derived',
  alpha: true,
  builtin: (b) => ZENITH_DISC_COLORS[b],
  deps: [...LAND_DEPS],
  derive: landRule(
    (land, light) => formatColor(withAlpha(mix(land, light ? '#ffffff' : '#000000', 0.35), 0.9)),
    (t) => ZENITH_DISC_COLORS[t],
  ),
});
add({
  id: 'marks.halo',
  kind: 'color',
  group: 'mapSurface',
  tier: 'derived',
  alpha: true,
  builtin: (b) => LABEL_HALO_COLORS[b],
  deps: [...LAND_DEPS],
  derive: landRule(
    (land, light) => formatColor(withAlpha(light ? mix(land, '#ffffff', 0.6) : mix(land, '#000000', 0.5), 0.95)),
    (t) => LABEL_HALO_COLORS[t],
  ),
});
// Whether the baked glyphs carry that halo as an outline: not on a dark map (Dark's '' today).
add({
  id: 'marks.spriteHalo',
  kind: 'enum',
  group: 'mapSurface',
  tier: 'derived',
  options: ON_OFF,
  builtin: (b) => (b === 'dark' ? 'off' : 'on'),
  deps: [...LAND_DEPS],
  derive: landRule(
    (_land, light) => (light ? 'on' : 'off'),
    (t) => (t === 'dark' ? 'off' : 'on'),
  ),
});
add({
  id: 'marks.eclipseHalo',
  kind: 'color',
  group: 'mapSurface',
  tier: 'derived',
  alpha: true,
  builtin: (b) => ECLIPSE_LABEL_HALO[b].color,
  deps: [...LAND_DEPS],
  derive: landRule(
    (land, light) => formatColor(withAlpha(mix(land, light ? '#ffffff' : '#000000', 0.4), 0.95)),
    (t) => ECLIPSE_LABEL_HALO[t].color,
  ),
});
add({
  id: 'worldFallback.ocean',
  kind: 'color',
  group: 'mapSurface',
  tier: 'derived',
  hidden: true,
  builtin: (b) => WORLD_FALLBACK_COLORS[b].ocean,
  deps: ['map.water'],
  derive: (get) => str(get('map.water')),
});
add({
  id: 'worldFallback.land',
  kind: 'color',
  group: 'mapSurface',
  tier: 'derived',
  hidden: true,
  builtin: (b) => WORLD_FALLBACK_COLORS[b].land,
  deps: ['map.land'],
  derive: (get) => str(get('map.land')),
});
add({
  id: 'worldFallback.line',
  kind: 'color',
  group: 'mapSurface',
  tier: 'derived',
  builtin: (b) => WORLD_FALLBACK_COLORS[b].line,
  deps: [...LAND_DEPS],
  // landRule, but keyed by the MAP's offline colours rather than its table: Positron's coastline
  // is its own, where its other marks are Glass's (mapTableOf). Same reads, in the same order.
  derive: (get, c) => {
    if (c.own('map.land')) {
      const land = str(get('map.land'));
      return toHex(mix(land, isLightColor(land) ? '#000000' : '#ffffff', 0.38));
    }
    return WORLD_FALLBACK_COLORS[fallbackTableOf(get, c.base)].line;
  },
});
// Eclipse paths carry meaning (which kind of eclipse), so one ink leaves them alone.
for (const k of ['total', 'annular', 'iso', 'lunar'] as const) {
  add({
    id: `eclipse.${k}`,
    kind: 'color',
    group: 'mapSurface',
    tier: 'derived',
    hidden: true,
    builtin: (b) => ECLIPSE_PATH_COLORS[b][k],
    deps: [...MAP_TABLE_DEPS],
    derive: (get, c) => ECLIPSE_PATH_COLORS[mapTableOf(get, c.base)][k],
  });
}
add({
  id: 'map.orbStrength',
  kind: 'number',
  group: 'mapSurface',
  tier: 'detail',
  range: { min: 0, max: 2, step: 0.05 },
  builtin: () => 1,
});

// ── Chart wheel ──
// Planet glyphs off the map (the wheel and every panel that names a body): the map lines'
// body colours ('map', before the basemap's legibility swaps — those are for the map), the
// canonical colours ('own'), or one ink.
add({
  id: 'wheel.glyphMode',
  kind: 'enum',
  group: 'wheel',
  tier: 'detail',
  options: ['map', 'own', 'ink'],
  builtin: () => 'map',
});
add({
  id: 'wheel.glyphInk',
  kind: 'color',
  group: 'wheel',
  tier: 'derived',
  builtin: (b) => mirrorHex(b, '--text-strong'),
  deps: ['ui.textStrong'],
  derive: (get, c) => (c.moved('ui.textStrong') ? str(get('ui.textStrong')) : c.builtin),
});
for (const p of PLANET_NAMES) {
  add({
    id: `glyph.${p}`,
    kind: 'color',
    group: 'wheel',
    tier: 'derived',
    builtin: () => PLANET_COLORS[p],
    css: { name: `--planet-${PLANET_SLUG[p]}`, fallback: true },
    deps: ['wheel.glyphMode', `planet.${p}`, 'lines.mode', 'lines.ink', 'wheel.glyphInk'],
    derive: (get) => {
      const mode = get('wheel.glyphMode');
      if (mode === 'ink') return str(get('wheel.glyphInk'));
      if (mode === 'own') return PLANET_COLORS[p];
      return inkMode(get) ? str(get('lines.ink')) : str(get(`planet.${p}`));
    },
  });
}
add({
  id: 'wheel.signMode',
  kind: 'enum',
  group: 'wheel',
  tier: 'detail',
  options: ['one', 'element'],
  builtin: () => 'one',
});
add({
  id: 'wheel.sign',
  kind: 'color?',
  group: 'wheel',
  tier: 'detail',
  builtin: () => null,
  css: { name: '--wheel-sign', fallback: true },
});
// The sign-glyph mode becomes per-element variables, so no component reads a mode.
for (const el of ELEMENT_ORDER) {
  add({
    id: `wheel.sign.${el}`,
    kind: 'color?',
    group: 'wheel',
    tier: 'derived',
    hidden: true,
    builtin: () => null,
    css: { name: `--wheel-sign-${el}`, fallback: true },
    deps: ['wheel.signMode', `element.${el}`],
    derive: (get) => (get('wheel.signMode') === 'element' ? str(get(`element.${el}`)) : null),
  });
}
for (const el of ELEMENT_ORDER) {
  add({
    id: `element.${el}`,
    kind: 'color',
    group: 'wheel',
    tier: 'detail',
    builtin: () => ELEMENT_INK[el],
    css: { name: `--element-${el}`, fallback: true },
  });
}
for (const m of MODALITY_ORDER) {
  add({
    id: `modality.${m}`,
    kind: 'color',
    group: 'wheel',
    tier: 'detail',
    builtin: () => MODALITY_INK[m],
    css: { name: `--modality-${m}`, fallback: true },
  });
}
add({
  id: 'aspect.mode',
  kind: 'enum',
  group: 'wheel',
  tier: 'detail',
  options: ['classic', 'ink'],
  builtin: () => 'classic',
});
add({ id: 'aspect.conj', kind: 'color', group: 'wheel', tier: 'detail', builtin: () => ASPECT_INK_CANON.conjunction });
add({ id: 'aspect.hard', kind: 'color', group: 'wheel', tier: 'detail', builtin: () => ASPECT_INK_CANON.opposition });
add({ id: 'aspect.soft', kind: 'color', group: 'wheel', tier: 'detail', builtin: () => ASPECT_INK_CANON.trine });
add({
  id: 'aspect.ink',
  kind: 'color',
  group: 'wheel',
  tier: 'derived',
  builtin: (b) => mirrorHex(b, '--text-strong'),
  deps: ['ui.textStrong'],
  derive: (get, c) => (c.moved('ui.textStrong') ? str(get('ui.textStrong')) : c.builtin),
});
const ASPECT_SEED: Record<AspectName, string> = {
  conjunction: 'aspect.conj',
  opposition: 'aspect.hard',
  square: 'aspect.hard',
  trine: 'aspect.soft',
  sextile: 'aspect.soft',
};
for (const a of ['conjunction', 'opposition', 'trine', 'square', 'sextile'] as const) {
  add({
    id: `aspect.${a}`,
    kind: 'color',
    group: 'wheel',
    tier: 'derived',
    builtin: () => ASPECT_INK_CANON[a],
    css: { name: `--aspect-${a}`, fallback: true },
    deps: ['aspect.mode', 'aspect.ink', ASPECT_SEED[a]],
    derive: (get) => (get('aspect.mode') === 'ink' ? str(get('aspect.ink')) : str(get(ASPECT_SEED[a]))),
  });
}
// The declination aspects follow their longitude counterparts.
add({
  id: 'aspect.parallel',
  kind: 'color',
  group: 'wheel',
  tier: 'derived',
  builtin: () => ASPECT_INK_CANON.parallel,
  css: { name: '--aspect-parallel', fallback: true },
  deps: ['aspect.conjunction'],
  derive: (get) => str(get('aspect.conjunction')),
});
add({
  id: 'aspect.contraparallel',
  kind: 'color',
  group: 'wheel',
  tier: 'derived',
  builtin: () => ASPECT_INK_CANON.contraparallel,
  css: { name: '--aspect-contraparallel', fallback: true },
  deps: ['aspect.opposition'],
  derive: (get) => str(get('aspect.opposition')),
});
// Axes, rings and face. null = the component's own fallback (accent, cool, --tint, none).
add({
  id: 'wheel.axisAsc',
  kind: 'color?',
  group: 'wheel',
  tier: 'detail',
  builtin: () => null,
  css: { name: '--wheel-axis-asc', rgbPair: true, fallback: true },
});
add({
  id: 'wheel.axisMc',
  kind: 'color?',
  group: 'wheel',
  tier: 'detail',
  builtin: () => null,
  css: { name: '--wheel-axis-mc', rgbPair: true, fallback: true },
});
add({
  id: 'wheel.ink',
  kind: 'color?',
  group: 'wheel',
  tier: 'detail',
  builtin: () => null,
  css: { name: '--wheel-ink-rgb', triplet: true, fallback: true },
});
add({
  id: 'wheel.face',
  kind: 'color?',
  group: 'wheel',
  tier: 'detail',
  alpha: true,
  builtin: () => null,
  css: { name: '--wheel-face', fallback: true },
});
add({
  id: 'wheel.retro',
  kind: 'color',
  group: 'wheel',
  tier: 'detail',
  builtin: () => WHEEL_MOTION_INK_CANON.retro,
  css: { name: '--wheel-retro', fallback: true },
});
add({
  id: 'wheel.station',
  kind: 'color',
  group: 'wheel',
  tier: 'detail',
  builtin: () => WHEEL_MOTION_INK_CANON.station,
  css: { name: '--wheel-station', fallback: true },
});

// ── Effects ──
const fxRule =
  (key: keyof typeof FX_DEFAULTS) =>
  (get: TokenGetter): TokenValue => {
    const p = get('fx.preset');
    return FX_FROM_PRESET[p === 'subtle' || p === 'flat' ? p : 'full'][key];
  };
add({
  id: 'fx.frost',
  kind: 'enum',
  group: 'effects',
  tier: 'derived',
  options: ['full', 'subtle', 'solid'],
  builtin: () => FX_DEFAULTS.frost,
  deps: ['fx.preset'],
  derive: fxRule('frost'),
});
add({
  id: 'fx.shadows',
  kind: 'enum',
  group: 'effects',
  tier: 'derived',
  options: ON_OFF,
  builtin: () => FX_DEFAULTS.shadows,
  deps: ['fx.preset'],
  derive: fxRule('shadows'),
});
add({
  id: 'fx.glows',
  kind: 'enum',
  group: 'effects',
  tier: 'derived',
  options: ON_OFF,
  builtin: () => FX_DEFAULTS.glows,
  deps: ['fx.preset'],
  derive: fxRule('glows'),
});
add({
  id: 'fx.motion',
  kind: 'enum',
  group: 'effects',
  tier: 'derived',
  options: ['full', 'reduced'],
  builtin: () => FX_DEFAULTS.motion,
  deps: ['fx.preset'],
  derive: fxRule('motion'),
});

/** Every token, in the order the editor presents them. Frozen. */
export const TOKENS: readonly TokenDef[] = Object.freeze(T.map((d) => Object.freeze(d)));
const TOKEN_INDEX: ReadonlyMap<TokenId, TokenDef> = new Map(TOKENS.map((d) => [d.id, d]));

/** The definition for `id`, or undefined for an unknown (or retired) id. */
export function tokenDef(id: TokenId): TokenDef | undefined {
  return TOKEN_INDEX.get(id);
}

/** Every custom property a component reads WITH a canonical fallback and no stylesheet
 *  declares — pairs in both forms. The report paper's `.palette-canonical` rule resets
 *  exactly these to `initial`, which returns each to its fallback literal. */
export const CANONICAL_RESET_VARS: readonly string[] = Object.freeze(
  TOKENS.flatMap((d) =>
    d.css?.fallback ? (d.css.rgbPair ? [d.css.name, `${d.css.name}-rgb`] : [d.css.name]) : [],
  ),
);

// Resolution order: every token after the tokens it reads.
const ORDER: readonly TokenDef[] = (() => {
  const out: TokenDef[] = [];
  const state = new Map<TokenId, 1 | 2>();
  const visit = (d: TokenDef) => {
    const s = state.get(d.id);
    if (s === 2 || s === 1) return; // done, or a cycle (reported by checkTokenGraph)
    state.set(d.id, 1);
    for (const dep of d.deps ?? []) {
      const dd = TOKEN_INDEX.get(dep);
      if (dd) visit(dd);
    }
    state.set(d.id, 2);
    out.push(d);
  };
  TOKENS.forEach(visit);
  return out;
})();

/** Problems with the token table itself — bad or duplicate ids, unknown or cyclic
 *  dependencies, kinds without their range/options. Empty when sound (verify §0). */
export function checkTokenGraph(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const d of TOKENS) {
    if (!TOKEN_ID_RE.test(d.id)) problems.push(`${d.id}: not a dotted lowerCamel id`);
    if (seen.has(d.id)) problems.push(`${d.id}: duplicate id`);
    seen.add(d.id);
    for (const dep of d.deps ?? []) if (!TOKEN_INDEX.has(dep)) problems.push(`${d.id}: unknown dependency ${dep}`);
    if (d.derive && !d.deps?.length) problems.push(`${d.id}: a rule with no declared dependencies`);
    if ((d.kind === 'number' || d.kind === 'number?') && !d.range) problems.push(`${d.id}: number without a range`);
    if (d.kind === 'enum' && !d.options?.length) problems.push(`${d.id}: enum without options`);
    if (d.kind === 'dash' && !d.presets?.length) problems.push(`${d.id}: dash without presets`);
  }
  // Cycles: a token must come after all its deps in ORDER.
  const pos = new Map(ORDER.map((d, i) => [d.id, i]));
  for (const d of ORDER) {
    for (const dep of d.deps ?? []) {
      if ((pos.get(dep) ?? -1) > (pos.get(d.id) ?? -1)) problems.push(`${d.id}: dependency cycle through ${dep}`);
    }
  }
  return problems;
}

// ── Sanitizing ─────────────────────────────────────────────────────────────────────────────

const decimals = (step: number) => {
  const s = String(step);
  return s.includes('.') ? s.length - s.indexOf('.') - 1 : 0;
};
function stepNumber(v: number, r: { min: number; max: number; step: number }): number {
  const c = clamp(v, r.min, r.max);
  const q = Math.round((c - r.min) / r.step) * r.step + r.min;
  return clamp(Number(q.toFixed(decimals(r.step))), r.min, r.max);
}
const sameDash = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** One value for one token, or undefined when it can't be one. */
function sanitizeValue(d: TokenDef, raw: unknown): TokenValue | undefined {
  if (raw === null) return d.kind === 'color?' || d.kind === 'number?' ? null : undefined;
  if (d.kind === 'color' || d.kind === 'color?') {
    if (typeof raw !== 'string') return undefined;
    const p = parseColor(raw);
    if (!p) return undefined;
    return d.alpha ? toHex8(p) : toHex(p);
  }
  if (d.kind === 'number' || d.kind === 'number?') {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || !d.range) return undefined;
    return stepNumber(raw, d.range);
  }
  if (d.kind === 'enum') return typeof raw === 'string' && d.options?.includes(raw) ? raw : undefined;
  if (d.kind === 'dash') {
    if (!Array.isArray(raw)) return undefined;
    return d.presets?.find((p) => sameDash(p, raw as number[]));
  }
  return undefined;
}

const EMPTY: PaletteOverrides = Object.freeze({});

/** Overrides as the engine accepts them: unknown and locked ids dropped, colours normalized
 *  to lowercase '#rrggbb' (or '#rrggbbaa' on a token that takes alpha), numbers clamped and
 *  stepped, enums and dashes checked against their options. Ordered as TOKENS, frozen.
 *  Never throws — anything it can't read is simply not an override. */
export function sanitizeOverrides(raw: unknown): PaletteOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY;
  let keys: string[];
  try {
    keys = Object.keys(raw);
  } catch {
    return EMPTY;
  }
  const found = new Map<TokenId, TokenValue>();
  for (const k of keys) {
    const d = TOKEN_INDEX.get(k);
    if (!d || d.locked) continue;
    let v: unknown;
    try {
      v = (raw as Record<string, unknown>)[k];
    } catch {
      continue;
    }
    const s = sanitizeValue(d, v);
    if (s !== undefined) found.set(k, s);
  }
  if (!found.size) return EMPTY;
  const out: Record<TokenId, TokenValue> = {};
  for (const d of TOKENS) if (found.has(d.id)) out[d.id] = found.get(d.id)!;
  return Object.freeze(out);
}

// ── Resolution ─────────────────────────────────────────────────────────────────────────────

type Values = Record<TokenId, TokenValue>;

/** Whether two token values are the same value. */
export function sameTokenValue(a: TokenValue | undefined, b: TokenValue | undefined): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return sameDash(a, b);
  return false;
}

function deepFreeze<O>(o: O): O {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

// FNV-1a, 32-bit: a short stable name for a canonical string. Caches key on the full string,
// so a collision could only ever give two different palettes one name, never one palette.
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** A small most-recently-used cache. */
class Recent<V> {
  private m = new Map<string, V>();
  private max: number;
  constructor(max: number) {
    this.max = max;
  }
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  set(k: string, v: V): V {
    this.m.set(k, v);
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
    return v;
  }
}

const BUILTIN_VALUES = new Map<Theme, Readonly<Values>>();
function builtinValues(base: Theme): Readonly<Values> {
  let v = BUILTIN_VALUES.get(base);
  if (!v) {
    const out: Values = {};
    for (const d of TOKENS) {
      try {
        out[d.id] = d.builtin(base);
      } catch {
        out[d.id] = null;
      }
    }
    v = Object.freeze(out);
    BUILTIN_VALUES.set(base, v);
  }
  return v;
}

/** The custom properties a palette must write: those whose value differs from what the
 *  stylesheet gives (its alias, or the base's built-in). */
function cssOf(values: Values, B: Readonly<Values>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of TOKENS) {
    const c = d.css;
    if (!c) continue;
    const value = values[d.id];
    const sheet = c.alias ? values[c.alias] : B[d.id];
    if (sameTokenValue(value, sheet)) continue;
    if (typeof value !== 'string' || !value) {
      // "Not set here" over a stylesheet that does set it: `initial` makes var() fall back.
      out[c.name] = 'initial';
      if (c.rgbPair) out[`${c.name}-rgb`] = 'initial';
      continue;
    }
    if (c.triplet) {
      out[c.name] = toTriplet(value);
      continue;
    }
    out[c.name] = cssColor(value);
    if (c.rgbPair) out[`${c.name}-rgb`] = toTriplet(value);
  }
  return out;
}

function attrsOf(v: Values): AppearanceAttrs {
  return {
    panelTone: v['ui.panelTone'] === 'light' ? 'light' : 'dark',
    frost: (v['fx.frost'] as FxFrost) ?? FX_DEFAULTS.frost,
    shadows: (v['fx.shadows'] as FxSwitch) ?? FX_DEFAULTS.shadows,
    glows: (v['fx.glows'] as FxSwitch) ?? FX_DEFAULTS.glows,
    motion: (v['fx.motion'] as FxMotion) ?? FX_DEFAULTS.motion,
  };
}

// ── Sections: inks and map, each memoized on its own contents ──

type InksBody = Omit<MapInks, 'key' | 'minorOf'>;
function inksBodyOf(v: Values): InksBody {
  const planet = {} as Record<PlanetName, string>;
  const paran = {} as Record<PlanetName, string>;
  for (const p of PLANET_NAMES) {
    planet[p] = cssColor(str(v[`map.ink.${p}`]));
    paran[p] = cssColor(str(v[`paran.${p}`]));
  }
  return {
    planet,
    paran,
    star: cssColor(str(v['lines.star'])),
    minor: MINOR_LINE_PALETTE.dark.map((_, i) => cssColor(str(v[`lines.minor.${i}`]))),
    eclipse: {
      total: cssColor(str(v['eclipse.total'])),
      annular: cssColor(str(v['eclipse.annular'])),
      iso: cssColor(str(v['eclipse.iso'])),
      lunar: cssColor(str(v['eclipse.lunar'])),
    },
    overlay: v['lines.overlay.mode'] === 'ink' ? cssColor(str(v['lines.overlay.ink'])) : null,
    aspect: v['lines.aspect.mode'] === 'ink' ? cssColor(str(v['lines.aspect.ink'])) : null,
  };
}
function makeInks(body: InksBody, key: string): MapInks {
  const minor = body.minor;
  return deepFreeze({ ...body, key, minorOf: (n: number) => minor[minorPaletteSlot(n)] ?? minor[0] });
}

const scaleBy = (w: number, k: number) => (k === 1 ? w : Math.round(w * k * 1000) / 1000);
type MapBody = Omit<MapStyle, 'key'>;
function mapBodyOf(base: Theme, v: Values): MapBody {
  const k = typeof v['lines.weight'] === 'number' ? (v['lines.weight'] as number) : 1;
  const W = (id: string) => scaleBy(v[id] as number, k);
  const D = (id: string) => v[id] as readonly number[];
  const C = (id: string) => cssColor(str(v[id]));
  const N = (id: string) => (typeof v[id] === 'string' && v[id] ? cssColor(v[id] as string) : null);
  const table = mapTableOf((id) => v[id], base);
  const ovMer = D('lineStyle.overlay.meridian.dash');
  const ovInk = v['lines.overlay.mode'] === 'ink' ? C('lines.overlay.ink') : null;
  const halo = C('marks.halo');
  const geoZones = {} as Record<Element, readonly [string, string, string]>;
  for (const el of ELEMENT_ORDER) {
    geoZones[el] = MODALITY_ORDER.map((m) => C(`geoZone.${el}.${m}`)) as unknown as readonly [string, string, string];
  }
  const basemap = v['map.basemap'];
  return {
    basemap: BASEMAP_CHOICES.includes(basemap as BasemapChoice) ? (basemap as BasemapChoice) : base,
    natal: {
      mcWidth: W('lineStyle.natal.mc.width'),
      icWidth: W('lineStyle.natal.ic.width'),
      horizonWidth: W('lineStyle.natal.horizon.width'),
      vxWidth: W('lineStyle.natal.vx.width'),
    },
    overlay: {
      mcWidth: W('lineStyle.overlay.mc.width'),
      icWidth: W('lineStyle.overlay.ic.width'),
      horizonWidth: W('lineStyle.overlay.horizon.width'),
      vxWidth: W('lineStyle.overlay.vx.width'),
      meridianDash: ovMer,
      horizonDash: D('lineStyle.overlay.horizon.dash'),
    },
    nodePair: { nn: C('nodePair.nn'), sn: C('nodePair.sn') },
    overlayNodePair: {
      nn: ovInk ?? C('nodePair.nn'),
      sn: ovInk ?? C('nodePair.sn'),
      nnDash: ovMer,
      snDash: [0, ...ovMer],
    },
    paran: { width: W('lineStyle.paran.width'), overlayDash: D('lineStyle.paran.overlay.dash') },
    minorParan: { width: W('lineStyle.minorParan.width'), overlayDash: D('lineStyle.paran.overlay.dash') },
    aspect: { width: W('lineStyle.aspect.width'), dash: D('lineStyle.aspect.dash') },
    localSpace: {
      width: W('lineStyle.localSpace.width'),
      inboundDash: D('lineStyle.localSpace.inbound.dash'),
      overlayWidth: W('lineStyle.localSpace.overlay.width'),
      overlayDash: D('lineStyle.localSpace.overlay.dash'),
    },
    star: {
      width: W('lineStyle.star.width'),
      opacity: v['lineStyle.star.opacity'] as number,
      dash: D('lineStyle.star.dash'),
    },
    minor: {
      mcWidth: W('lineStyle.minor.mc.width'),
      horizonWidth: W('lineStyle.minor.horizon.width'),
      icWidth: W('lineStyle.minor.ic.width'),
      vxWidth: W('lineStyle.minor.vx.width'),
      overlayMeridianDash: ovMer,
      overlayHorizonDash: D('lineStyle.overlay.horizon.dash'),
      overlayMarkOpacity: LINE_STYLE_BUILTIN.minor.overlayMarkOpacity,
    },
    ecliptic: {
      color: C('lines.ecliptic'),
      width: W('lineStyle.ecliptic.width'),
      opacity: v['lineStyle.ecliptic.opacity'] as number,
      overlayDash: D('lineStyle.ecliptic.overlay.dash'),
    },
    zenithDisc: C('marks.zenithDisc'),
    halo,
    crossingStroke: halo || 'rgba(0,0,0,0.4)',
    eclipseHalo: { color: C('marks.eclipseHalo'), width: ECLIPSE_LABEL_HALO[table].width },
    geoGrid: {
      line: C('geo.grid.line'),
      opacity: v['geo.grid.opacity'] as number,
      width: W('geo.grid.width'),
      label: C('geo.grid.label'),
      hover: v['geo.grid.hover'] as number,
    },
    nightShade: { color: C('nightShade.color'), opacity: v['nightShade.opacity'] as number },
    geoZones,
    worldFallback: { ocean: C('worldFallback.ocean'), land: C('worldFallback.land'), line: C('worldFallback.line') },
    basemapPaint: {
      water: N('basemap.water'),
      waterway: N('basemap.waterway'),
      land: N('basemap.land'),
      landcover: v['basemap.landcover'] === 'flat' ? 'flat' : 'keep',
      border: N('basemap.border'),
      road: N('basemap.road'),
      building: N('basemap.building'),
      label: N('basemap.label'),
      labelHalo: N('basemap.labelHalo'),
      labelHaloWidth: typeof v['basemap.labelHaloWidth'] === 'number' ? (v['basemap.labelHaloWidth'] as number) : null,
    },
    arrows: v['lines.arrows'] !== 'off',
    minorBeads: v['lines.minorBeads'] !== 'off',
    starSparks: v['lines.starSparks'] !== 'off',
    orbStrength: typeof v['map.orbStrength'] === 'number' ? (v['map.orbStrength'] as number) : 1,
    lineWeight: k,
  };
}

interface BuiltinSections {
  inks: MapInks;
  inksJson: string;
  map: MapStyle;
  mapJson: string;
}
const BUILTIN_SECTIONS = new Map<Theme, BuiltinSections>();
function builtinSections(base: Theme): BuiltinSections {
  let s = BUILTIN_SECTIONS.get(base);
  if (!s) {
    const B = builtinValues(base) as Values;
    const ib = inksBodyOf(B);
    const mb = mapBodyOf(base, B);
    s = {
      inks: makeInks(ib, base),
      inksJson: JSON.stringify(ib),
      map: deepFreeze({ key: base, ...mb }),
      mapJson: JSON.stringify(mb),
    };
    BUILTIN_SECTIONS.set(base, s);
  }
  return s;
}
const INKS_MEMO = new Recent<MapInks>(12);
const MAP_MEMO = new Recent<MapStyle>(12);
function inksFor(base: Theme, v: Values): MapInks {
  const body = inksBodyOf(v);
  const json = JSON.stringify(body);
  const b = builtinSections(base);
  if (json === b.inksJson) return b.inks;
  const k = `${base}|${json}`;
  return INKS_MEMO.get(k) ?? INKS_MEMO.set(k, makeInks(body, `${base}~${fnv(json)}`));
}
function mapFor(base: Theme, v: Values): MapStyle {
  const body = mapBodyOf(base, v);
  const json = JSON.stringify(body);
  const b = builtinSections(base);
  if (json === b.mapJson) return b.map;
  const k = `${base}|${json}`;
  return MAP_MEMO.get(k) ?? MAP_MEMO.set(k, deepFreeze({ key: `${base}~${fnv(json)}`, ...body }));
}

interface Trace {
  readonly reads: Readonly<Record<TokenId, readonly TokenId[]>>;
  readonly auto: Readonly<Values>;
}
const TRACES = new WeakMap<ResolvedPalette, Trace>();

/** The uncached resolver walk itself — resolvePalette memoizes it. Exported for
 *  verify:theme-palette, which needs the walk and the built-in assembly as two separate
 *  parts. Never throws. */
export function walkPalette(baseIn: Theme, rawOverrides?: unknown): ResolvedPalette {
  const base: Theme = isTheme(baseIn) ? baseIn : 'vintage';
  const overrides = sanitizeOverrides(rawOverrides);
  const B = builtinValues(base);
  const values: Values = {};
  const auto: Values = {};
  const origin: Record<TokenId, TokenOrigin> = {};
  const reads: Record<TokenId, readonly TokenId[]> = {};
  const valueOf = (id: TokenId): TokenValue => (id in values ? values[id] : B[id]);
  for (const d of ORDER) {
    let nat: TokenValue = B[d.id];
    if (d.derive) {
      const seen: TokenId[] = [];
      const track = (id: TokenId) => {
        if (!seen.includes(id)) seen.push(id);
      };
      const get: TokenGetter = (id) => {
        track(id);
        return valueOf(id);
      };
      const ctx: DeriveContext = {
        base,
        builtin: B[d.id],
        moved: (id) => {
          track(id);
          return !sameTokenValue(valueOf(id), B[id]);
        },
        own: (id) => {
          track(id);
          return origin[id] === 'override' && !sameTokenValue(values[id], auto[id]);
        },
      };
      let derived: TokenValue | undefined;
      try {
        derived = sanitizeDerived(d, d.derive(get, ctx));
      } catch {
        derived = undefined;
      }
      reads[d.id] = seen;
      if (derived !== undefined && seen.some((id) => !sameTokenValue(valueOf(id), B[id]))) nat = derived;
    }
    auto[d.id] = nat;
    if (Object.prototype.hasOwnProperty.call(overrides, d.id)) {
      values[d.id] = overrides[d.id];
      origin[d.id] = 'override';
    } else {
      values[d.id] = nat;
      origin[d.id] = sameTokenValue(nat, B[d.id]) ? 'base' : 'derived';
    }
  }
  // Present the values in TOKENS order (resolution order is an implementation detail).
  const ordered: Values = {};
  const orderedOrigin: Record<TokenId, TokenOrigin> = {};
  for (const d of TOKENS) {
    ordered[d.id] = values[d.id];
    orderedOrigin[d.id] = origin[d.id];
  }
  const diffs = TOKENS.filter((d) => !sameTokenValue(values[d.id], B[d.id])).map((d) => [d.id, values[d.id]]);
  const palette: ResolvedPalette = deepFreeze({
    base,
    key: diffs.length ? `${base}~${fnv(JSON.stringify(diffs))}` : base,
    overrides,
    values: ordered,
    origin: orderedOrigin,
    css: cssOf(values, B),
    attrs: attrsOf(values),
    inks: inksFor(base, values),
    map: mapFor(base, values),
  });
  TRACES.set(palette, { reads, auto });
  return palette;
}

/** A rule's output, checked like an override but without stepping (a derived width or
 *  opacity is the table's own figure). undefined = unusable, so the built-in stands. */
function sanitizeDerived(d: TokenDef, v: TokenValue): TokenValue | undefined {
  if (v === null) return d.kind === 'color?' || d.kind === 'number?' ? null : undefined;
  if (d.kind === 'color' || d.kind === 'color?') return typeof v === 'string' && parseColor(v) ? v : undefined;
  if (d.kind === 'number' || d.kind === 'number?') return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  if (d.kind === 'enum') return typeof v === 'string' && d.options?.includes(v) ? v : undefined;
  if (d.kind === 'dash') return Array.isArray(v) ? v : undefined;
  return undefined;
}

const BUILTIN_PALETTES = new Map<Theme, ResolvedPalette>();
/** A built-in theme's palette, assembled straight from the tokens' built-ins (not through
 *  the walk). Cached: the same object for the life of the page. */
export function builtinPalette(theme: Theme): ResolvedPalette {
  const base: Theme = isTheme(theme) ? theme : 'vintage';
  let p = BUILTIN_PALETTES.get(base);
  if (!p) {
    const B = builtinValues(base) as Values;
    const origin: Record<TokenId, TokenOrigin> = {};
    for (const d of TOKENS) origin[d.id] = 'base';
    const s = builtinSections(base);
    p = deepFreeze({
      base,
      key: base,
      overrides: EMPTY,
      values: { ...B },
      origin,
      css: cssOf(B, B),
      attrs: attrsOf(B),
      inks: s.inks,
      map: s.map,
    });
    TRACES.set(p, { reads: {}, auto: B });
    BUILTIN_PALETTES.set(base, p);
  }
  return p;
}

const RESOLVED = new Recent<ResolvedPalette>(16);
/** Resolve a theme: `base` plus the reader's overrides (sanitized here, whatever they are).
 *  No overrides → builtinPalette(base) itself. Memoized on the sanitized input, so an
 *  unchanged spec gives the identical object. Never throws: anything unreadable resolves to
 *  the built-in. */
export function resolvePalette(base: Theme, overrides?: unknown): ResolvedPalette {
  try {
    const b: Theme = isTheme(base) ? base : 'vintage';
    const clean = sanitizeOverrides(overrides);
    if (clean === EMPTY) return builtinPalette(b);
    const k = `${b}|${JSON.stringify(clean)}`;
    return RESOLVED.get(k) ?? RESOLVED.set(k, walkPalette(b, clean));
  } catch {
    return builtinPalette(isTheme(base) ? base : 'vintage');
  }
}

/** What an editor row shows for token `id`; null for an unknown id. */
export function explain(palette: ResolvedPalette, id: TokenId): TokenExplanation | null {
  const d = TOKEN_INDEX.get(id);
  if (!d || !(id in palette.values)) return null;
  const tr = TRACES.get(palette);
  const B = builtinValues(palette.base);
  let parent: TokenId | undefined;
  if (d.deps?.length) {
    const reads = tr?.reads[id] ?? [];
    parent = reads.find((r) => !sameTokenValue(palette.values[r], B[r])) ?? d.deps[0];
  }
  return {
    id,
    value: palette.values[id],
    origin: palette.origin[id],
    auto: tr?.auto[id] ?? B[id],
    builtin: B[id],
    ...(parent ? { parent } : null),
  };
}

/** The tokens each rule actually read while resolving `palette` (verify §0 and §4; an editor
 *  may use it to show what a row follows). Empty for a built-in assembled directly. */
export function paletteTrace(palette: ResolvedPalette): Readonly<Record<TokenId, readonly TokenId[]>> {
  return TRACES.get(palette)?.reads ?? {};
}

/** The basemap table a palette's map tokens read (its basemap — Glass's for Positron — or
 *  Outline's light/dark one). */
export function paletteMapTable(palette: ResolvedPalette): Theme {
  return mapTableOf((id) => palette.values[id] ?? null, palette.base);
}

/** Every built-in palette, in THEMES order. */
export function builtinPalettes(): readonly ResolvedPalette[] {
  return THEMES.map(builtinPalette);
}
