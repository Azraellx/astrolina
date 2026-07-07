// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Typed code->label accessors that replace the hardcoded display maps (THEME_LABELS,
// PLANET_DISPLAY, and the colocated {value,label,hint} arrays in Sidebar/InfoBar). Each
// accessor is keyed by an existing union member, so adding a new enum value without a
// catalog entry surfaces immediately (resolvePath returns undefined and the raw key
// shows — caught in review / by scripts/check-i18n). The catalog keys mirror the code
// values verbatim, including proper-noun house systems (placidus, koch, …).
import type {
  PlanetName,
  HouseSystem,
  LineSystem,
  CoordSystem,
  FortuneFormula,
  NodeType,
} from '../lib/ephemeris';
import type {
  AngleProgression,
  PrimaryRate,
} from '../lib/astro/timeline';
import type { LineType } from '../lib/astro/lines';
import type { Theme } from '../lib/theme';
import type { MapProjectionMode } from '../lib/projection';
import type { TFn } from './types';

// 0-based zodiac index -> catalog key, matching the SIGN order used across the app
// (Aries = 0 … Pisces = 11).
const SIGN_KEYS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
] as const;

export function makeEnumLabels(t: TFn) {
  return {
    planet: (p: PlanetName) => t(`planets.${p}.name`),
    planetTheme: (p: PlanetName) => t(`planets.${p}.theme`),
    sign: (index: number) => t(`signs.${SIGN_KEYS[index] ?? 'aries'}`),

    theme: (th: Theme) => t(`settings.theme.${th}.label`),

    projection: (p: MapProjectionMode) => t(`settings.projection.${p}.label`),
    projectionHint: (p: MapProjectionMode) => t(`settings.projection.${p}.hint`),

    lineSystem: (l: LineSystem) => t(`settings.lineSystem.${l}.label`),
    lineSystemHint: (l: LineSystem) => t(`settings.lineSystem.${l}.hint`),

    coordSystem: (c: CoordSystem) => t(`settings.coordSystem.${c}.label`),
    coordSystemHint: (c: CoordSystem) => t(`settings.coordSystem.${c}.hint`),

    fortuneFormula: (f: FortuneFormula) => t(`settings.fortuneFormula.${f}.label`),
    fortuneFormulaHint: (f: FortuneFormula) => t(`settings.fortuneFormula.${f}.hint`),

    nodeType: (n: NodeType) => t(`settings.nodeType.${n}.label`),
    nodeTypeHint: (n: NodeType) => t(`settings.nodeType.${n}.hint`),

    houseSystem: (h: HouseSystem) => t(`settings.houseSystem.${h}.label`),
    houseSystemHint: (h: HouseSystem) => t(`settings.houseSystem.${h}.hint`),

    primaryRate: (r: PrimaryRate) => t(`settings.primaryRate.${r}.label`),
    primaryRateHint: (r: PrimaryRate) => t(`settings.primaryRate.${r}.hint`),

    chartAngle: (a: AngleProgression) => t(`settings.chartAngle.${a}.label`),
    chartAngleHint: (a: AngleProgression) => t(`settings.chartAngle.${a}.hint`),

    lineTypeHint: (lt: LineType) => t(`settings.lineType.${lt}.hint`),
  };
}

export type EnumLabels = ReturnType<typeof makeEnumLabels>;
