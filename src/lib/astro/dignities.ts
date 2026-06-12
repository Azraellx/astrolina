// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Element/modality tallies and essential dignities — pure sign-table lookups
// over longitudes the chart already has. Rulerships merge the traditional and
// modern schemes (Mars keeps Scorpio alongside Pluto, Saturn keeps Aquarius
// alongside Uranus, Jupiter keeps Pisces alongside Neptune); exaltations are
// the seven classical ones.
import type { PlanetName } from '../ephemeris';

export type Element = 'fire' | 'earth' | 'air' | 'water';
export type Modality = 'cardinal' | 'fixed' | 'mutable';
export type Dignity = 'rulership' | 'exaltation' | 'detriment' | 'fall';

const ELEMENTS: Element[] = ['fire', 'earth', 'air', 'water'];
const MODALITIES: Modality[] = ['cardinal', 'fixed', 'mutable'];

/** 0-based sign index (0 = Aries) of an ecliptic longitude in radians. */
export function signIndex(lonRad: number): number {
  const deg = (((lonRad * 180) / Math.PI) % 360 + 360) % 360;
  return Math.floor(deg / 30);
}

export const signElement = (signIdx: number): Element => ELEMENTS[signIdx % 4];
export const signModality = (signIdx: number): Modality => MODALITIES[signIdx % 3];

// Sign indices ruled by each planet (traditional + modern merged).
const RULERSHIP: Partial<Record<PlanetName, number[]>> = {
  Sun: [4], // Leo
  Moon: [3], // Cancer
  Mercury: [2, 5], // Gemini, Virgo
  Venus: [1, 6], // Taurus, Libra
  Mars: [0, 7], // Aries, Scorpio
  Jupiter: [8, 11], // Sagittarius, Pisces
  Saturn: [9, 10], // Capricorn, Aquarius
  Uranus: [10], // Aquarius
  Neptune: [11], // Pisces
  Pluto: [7], // Scorpio
};

// The classical exaltation degrees' signs.
const EXALTATION: Partial<Record<PlanetName, number>> = {
  Sun: 0, // Aries
  Moon: 1, // Taurus
  Mercury: 5, // Virgo
  Venus: 11, // Pisces
  Mars: 9, // Capricorn
  Jupiter: 3, // Cancer
  Saturn: 6, // Libra
};

const opposite = (signIdx: number) => (signIdx + 6) % 12;

/** The planet's essential dignity in a sign, or null when it has none there. */
export function essentialDignity(
  planet: PlanetName,
  signIdx: number,
): Dignity | null {
  const ruled = RULERSHIP[planet];
  if (ruled?.includes(signIdx)) return 'rulership';
  const exalted = EXALTATION[planet];
  if (exalted === signIdx) return 'exaltation';
  if (ruled?.some((s) => opposite(s) === signIdx)) return 'detriment';
  if (exalted !== undefined && opposite(exalted) === signIdx) return 'fall';
  return null;
}
