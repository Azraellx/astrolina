// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Which positions carry a SPEED, and which must not.
//
// The expanded sidebar prints an overlay's daily motion, and the honest answer is
// not the same for every overlay. A transit ring is the real sky at an instant and
// has a rate per body; a solar-arc or primary-directions ring is the birth sky
// advanced by ONE shared arc, so its bodies have no daily motion of their own and
// quoting the natal rate there would be a fabricated figure. The distinction is
// carried by the presence or absence of the field — so it is worth a test, since
// "undefined" is easy to reintroduce by accident and impossible to see in a diff.
//
//   npm run verify:overlay-speed

import {
  initEphemeris,
  getMinorSamples,
  getPlanetPositions,
  getEclipticPositions,
  minorPositionOf,
  toEclipticPositions,
  shiftMinorEclipticLongitude,
  shiftMinorRightAscension,
  shiftRightAscension,
  shiftEclipticLongitude,
  obliquity,
} from '../src/lib/ephemeris';
import { overlayMinorSamples } from '../src/lib/astro/timeline';
import { buildWheelMinor } from '../src/lib/minorBodies/wheel';
import type { TFn } from '../src/i18n';

await initEphemeris();

const JD = 2460000.5; // 2023-02-24 00:00 UT — nothing special, just a real instant
let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
};

const sampled = getPlanetPositions(JD, 'mean');
check('the sky sample carries a speed for every body', sampled.every((p) => p.speed != null),
  sampled.filter((p) => p.speed == null).map((p) => p.name).join(',') || 'all present');

// The natal wheel's own path has always had it; the overlay path must now agree
// with it body for body, since both come from the same underlying sample.
const natal = getEclipticPositions(JD, 'mean');
const viaOverlay = toEclipticPositions(sampled, JD);
const worst = natal.reduce((w, n) => {
  const o = viaOverlay.find((x) => x.name === n.name);
  if (!o || n.speed == null || o.speed == null) return w;
  return Math.max(w, Math.abs(n.speed - o.speed));
}, 0);
check('overlay speeds match the natal path exactly', worst === 0, 'max delta ' + worst);
check('retrograde is derived wherever a speed exists',
  viaOverlay.every((p) => (p.speed == null) === (p.retrograde === undefined)));
check('at least one body is retrograde at this instant (the flag is live, not always false)',
  viaOverlay.some((p) => p.retrograde === true),
  viaOverlay.filter((p) => p.retrograde).map((p) => p.name).join(',') || 'none');

// Directed rings: built by shifting, and must arrive WITHOUT a rate.
const eps = obliquity(JD);
const arc = (30 * Math.PI) / 180;
const inRa = sampled.map((p) => shiftRightAscension(p, arc));
const inLon = sampled.map((p) => shiftEclipticLongitude(p, arc, eps));
check('solar arc / primary directions (in RA) carry no speed',
  inRa.every((p) => p.speed == null));
check('solar arc (in longitude) carries no speed', inLon.every((p) => p.speed == null));
check('…and so their table cells stay empty',
  toEclipticPositions(inRa, JD).every((p) => p.speed == null && p.retrograde === undefined));

// The shift must still have MOVED them — a test that only proves speed is absent
// would pass just as well against an empty array.
check('the directed shift still moved every body',
  inRa.every((p, i) => Math.abs(p.ra - sampled[i].ra) > 1e-9));

// The catalog bodies' twins. Ceres by its number (the engine's own alias of body 10001)
// and Pholus (5145, the main-asteroid file's body 16): both read from files every
// checkout has. A catalog sample has a rate; a directed one — through the twin helpers,
// or through the overlay sampler that uses them — must not, and the wheel then prints
// none; a sampled overlay keeps the planets' own rate for the same body.
const minors = getMinorSamples(JD, [1, 5145]);
check('the catalog sample carries a speed for both bodies',
  minors.length === 2 && minors.every((s) => typeof s.speed === 'number'), `${minors.length} sampled`);
const asLines = minors.map(minorPositionOf);
const mRa = asLines.map((p) => shiftMinorRightAscension(p, arc));
const mLon = asLines.map((p) => shiftMinorEclipticLongitude(p, arc, eps));
check('catalog twins (in RA and in longitude) carry no speed, though their input did',
  asLines.every((p) => p.speed != null) && [...mRa, ...mLon].every((p) => !('speed' in p)));
check('…and still moved every body',
  mRa.every((p, i) => Math.abs(p.ra - asLines[i].ra) > 1e-9) &&
    mLon.every((p, i) => Math.abs(p.ra - asLines[i].ra) > 1e-9));
const natalMinor = { jd: JD, samples: minors };
const directed = [
  ...overlayMinorSamples({ by: 'shift-ra', baseJd: JD, arc }, [1, 5145], natalMinor),
  ...overlayMinorSamples({ by: 'shift-long', baseJd: JD, arc, eps }, [1, 5145], natalMinor),
];
const t = ((key: string) => key) as unknown as TFn;
const wheel = buildWheelMinor(directed, {
  ayan: 0, decor: () => ({ name: '', color: '#000', icon: 'i' }), t, list: [{ n: 1 }, { n: 5145 }],
});
check('directed overlay samples carry no speed, and the wheel built from them prints none (no ℞ either)',
  directed.length === 4 && directed.every((s) => !('speed' in s)) &&
    wheel.length === 4 && wheel.every((w) => w.speed === undefined && w.retrograde === undefined),
  `${directed.length} directed, ${wheel.length} on the wheel`);
const [ovCeres] = overlayMinorSamples({ by: 'sample', jd: JD }, [1], null);
const ceres = sampled.find((p) => p.name === 'Ceres');
check('a sampled overlay keeps its rate — the planets\' own Ceres rate, exactly',
  !!ovCeres && !!ceres && ceres.speed != null && ovCeres.speed === ceres.speed,
  `${ovCeres?.speed} vs ${ceres?.speed}`);

console.log(failures ? `\n${failures} FAILING CHECK(S)` : '\nall checks pass');
process.exit(failures ? 1 : 0);
