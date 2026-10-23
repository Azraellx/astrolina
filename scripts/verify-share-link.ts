// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies what a share link carries about the chart's RECORD (src/lib/shareState.ts):
// its source rating, and never its notes. Runs the REAL src/lib code through the
// harness (`npm run verify:share-link`). The zone entry's round trip is
// verify:zone-entry's.
//
// Each section says which KIND of check it is:
//
//   INTERNAL IDENTITY  — the module agrees with itself (encode then decode).
//   TWO PARTS AGREE    — the link's reader and the rating scale (lib/sourceRating)
//                        asked the same question: which codes exist.

import { decodeShareState, encodeShareState, shareChart, type ShareState } from '../src/lib/shareState';
import { applyTimeHypothesis } from '../src/lib/birthData';
import { SOURCE_RATINGS, type SourceRating } from '../src/lib/sourceRating';
import type { StoredChart } from '../src/lib/chartLibrary';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** One PASS/FAIL line for a whole set: fails when the set is empty. */
function every<T>(label: string, items: readonly T[], bad: (x: T) => string | null) {
  if (items.length === 0) {
    check(label, false, 'empty set — nothing was compared');
    return;
  }
  const broken = items.map(bad).filter((s): s is string => s != null);
  check(`${label} (${items.length})`, broken.length === 0, broken.slice(0, 6).join('; '));
}

/** The token's own JSON, read back the way a decoder sees it. */
const wireOf = (token: string): Record<string, unknown> => {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))) as Record<string, unknown>;
};
/** A token written by hand, as anyone may mint one. */
const tokenOf = (wire: Record<string, unknown>): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(wire))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const base: StoredChart = {
  id: 'v', createdAt: 0, name: 'Share Test', year: 1941, month: 6, day: 5, hour: 9, minute: 30,
  tzOffset: -4, tzIana: 'America/New_York',
  birthplace: { label: 'Yonkers', lat: 40.9312, lng: -73.8988 },
};
const roundTrip = (chart: ShareState['chart']) => decodeShareState(encodeShareState({ chart }))?.chart;

console.log('\n── 1. INTERNAL IDENTITY: the rating goes with the link, the notes never do ──');
{
  every('every rating round-trips', SOURCE_RATINGS, (r) => {
    const back = roundTrip({ ...base, sourceRating: r });
    return back?.sourceRating === r ? null : `${r} → ${String(back?.sourceRating)}`;
  });
  const none = roundTrip(base);
  check('no rating stays no rating (absent is "nobody has said", not C)', !!none && none.sourceRating === undefined && !('sr' in wireOf(encodeShareState({ chart: base }))));
  const noted = { ...base, sourceRating: 'C' as SourceRating, notes: 'Rectified from five events; the birth certificate says morning' };
  const token = encodeShareState({ chart: noted });
  const back = decodeShareState(token)?.chart as (ShareState['chart'] & { notes?: string }) | undefined;
  check('the notes never enter the token, and never come out of it',
    !JSON.stringify(wireOf(token)).includes('Rectified') && back?.notes === undefined && back?.sourceRating === 'C');
}

console.log('\n── 2. TWO PARTS AGREE: the reader takes only the scale’s seven codes, and a bad one costs only itself ──');
{
  const good = wireOf(encodeShareState({ chart: base }));
  const bad: unknown[] = ['D', 'aa', 'AAA', 'Z', '', 7, null, ['A'], { r: 'A' }];
  every('an unknown or malformed rating is dropped, and the chart still opens exactly', bad, (sr) => {
    const back = decodeShareState(tokenOf({ ...good, sr }))?.chart;
    return back && back.sourceRating === undefined && back.hour === 9 && back.minute === 30 && back.name === 'Share Test'
      ? null
      : `${JSON.stringify(sr)} → ${JSON.stringify(back ?? null)}`;
  });
  every('each of the scale’s codes is read as itself, written by hand', SOURCE_RATINGS, (r) =>
    decodeShareState(tokenOf({ ...good, sr: r }))?.chart.sourceRating === r ? null : r,
  );
  const old = decodeShareState(tokenOf(good))?.chart;
  check('a link from before the rating (no sr) opens as it always did', !!old && old.sourceRating === undefined && old.tzIana === 'America/New_York');
}

console.log('\n── 3. INTERNAL IDENTITY: a time being tried on travels without the record’s rating ──');
{
  const rated = { ...base, sourceRating: 'AA' as SourceRating };
  const trying = applyTimeHypothesis(rated, 14 * 60 + 5)!;
  const sent = roundTrip(shareChart(trying, true));
  check('trying a time: the link carries the trial time and no rating',
    !!sent && sent.hour === 14 && sent.minute === 5 && sent.sourceRating === undefined);
  check('…and the chart itself keeps its rating (shareChart copies, never edits)', trying.sourceRating === 'AA' && rated.sourceRating === 'AA');
  const plain = roundTrip(shareChart(rated, false));
  check('not trying a time: the record’s own time, with its rating', !!plain && plain.hour === 9 && plain.sourceRating === 'AA');
  check('no rating to drop: the same object back', shareChart(base, true) === base);
}

console.log('\n── 4. INTERNAL IDENTITY: an event chart arrives as one, and a person exactly as before ──');
{
  // 2026-10-20: the chart's kind rides as the optional `k`, like `sr` — older decoders
  // ignore it, and a link from before it existed opens as the person it always was.
  const event = { ...base, kind: 'event' as const };
  const eventToken = encodeShareState({ chart: event });
  const back = decodeShareState(eventToken)?.chart;
  check('an event round-trips as an event, written as k: "e"',
    back?.kind === 'event' && wireOf(eventToken).k === 'e', JSON.stringify(wireOf(eventToken)));
  const personWire = wireOf(encodeShareState({ chart: base }));
  check('a person writes no k, and decodes with no kind',
    !('k' in personWire) && roundTrip(base)?.kind === undefined && !('kind' in (roundTrip(base) ?? {})));
  // Moved: the same chart, its kind flipped and nothing else, differs in k and in nothing else.
  const eventWire = wireOf(eventToken);
  const { k, ...rest } = eventWire;
  check('  flipping the kind moves k and nothing else in the token',
    k === 'e' && JSON.stringify(rest) === JSON.stringify(personWire),
    `${JSON.stringify(rest)} vs ${JSON.stringify(personWire)}`);
  const good = wireOf(encodeShareState({ chart: base }));
  const bad: unknown[] = ['E', 'event', 'p', '', 1, 0, null, ['e'], { k: 'e' }];
  every('an unknown k is ignored: the chart opens, as a person', bad, (kv) => {
    const c = decodeShareState(tokenOf({ ...good, k: kv }))?.chart;
    return c && c.kind === undefined && c.hour === 9 && c.name === 'Share Test' ? null : `${JSON.stringify(kv)} → ${JSON.stringify(c ?? null)}`;
  });
  const old = decodeShareState(tokenOf(good))?.chart;
  check('a link from before the kind (no k) opens as a person, as it always did', !!old && old.kind === undefined);
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
