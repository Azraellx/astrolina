// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// How far a chart's birth data can be trusted — the rating astrologers know
// from Lois Rodden's scale, kept to seven codes.
//
// This matters more here than in most programs. Everything drawn on the map
// hangs off the exact minute, so a chart from a birth certificate and a chart
// from somebody's recollection are not the same kind of object, however alike
// they look once cast. The rating is the only place that difference is written
// down, which is why imports go to the trouble of preserving it.
//
// Seven codes, deliberately. Collections in the wild carry all sorts of
// variants — longer letter runs, a bare D, house conventions nobody documented
// — and rather than grow the set to fit each one, `normalizeRating` fits them
// to the nearest of these. A rating that is approximately right is useful; a
// vocabulary that grows with every file it meets is not.

export type SourceRating = 'AA' | 'A' | 'B' | 'C' | 'DD' | 'X' | 'XX';

/** In confidence order, best first — the order the picker offers them. */
export const SOURCE_RATINGS: readonly SourceRating[] = ['AA', 'A', 'B', 'C', 'DD', 'X', 'XX'];

const KNOWN = new Set<string>(SOURCE_RATINGS);

/** A label prefix some sources put in front of the code. */
const LABEL = /^(?:RODDEN\s*)?(?:RATING|RODDEN|RR)\s*[:=-]?\s*/;

/**
 * Fit any source's rating to the nearest of the seven.
 *
 * Returns null when there is nothing rating-shaped to read — absent is not the
 * same as "source unknown", and asserting C over an empty field would be
 * inventing a judgement nobody made.
 *
 * Where a code IS present but unrecognised, it maps by its leading letter,
 * which is what the scale is built on:
 *
 *   A…      one letter is A, more is AA     (AAA and A+ mean "very sure")
 *   B…      B
 *   C…      C
 *   D…      DD                              (a bare D is DD elsewhere)
 *   E…G     DD                              (below D on a letter ladder)
 *   X…      one letter is X, more is XX
 *   U, N    XX                              (unknown / none)
 *   other   C                               (on the scale somewhere, but we
 *                                            cannot say where — and "source
 *                                            unknown" is exactly that)
 *
 * Numbers are deliberately NOT read. Programs that rate 1–5 disagree about
 * which end is best, and picking a direction would silently invert half of
 * them — a wrong rating is worse than none, because it will be believed.
 */
export function normalizeRating(raw: string | null | undefined): SourceRating | null {
  if (!raw) return null;
  const text = raw.trim().toUpperCase().replace(LABEL, '');
  const letters = text.replace(/[^A-Z]/g, '');
  if (!letters) return null;
  if (KNOWN.has(letters)) return letters as SourceRating;

  const head = letters[0];
  const long = letters.length >= 2;
  if (head === 'A') return long ? 'AA' : 'A';
  if (head === 'B') return 'B';
  if (head === 'C') return 'C';
  if (head >= 'D' && head <= 'G') return 'DD';
  if (head === 'X' || head === 'Y' || head === 'Z') return long ? 'XX' : 'X';
  if (head === 'U' || head === 'N') return 'XX';
  return 'C';
}

/**
 * Pull a rating out of free text, when it is announced as one.
 *
 * Only an explicitly labelled rating ("Rodden: AA", "Rating B") or a line that
 * is nothing but a code. Scanning prose for stray capitals would find a rating
 * in every second sentence — "A" and "B" are ordinary words and initials — and
 * a confidently wrong rating is worse than a missing one.
 */
export function extractRating(text: string | null | undefined): SourceRating | null {
  if (!text) return null;
  const labelled = text.match(/(?:rodden|rating|\bRR)\s*[:=-]?\s*([A-Za-z]{1,3})\b/i);
  if (labelled) {
    const fitted = normalizeRating(labelled[1]);
    if (fitted) return fitted;
  }
  for (const line of text.split('\n')) {
    const bare = line.trim();
    if (bare && bare.length <= 3 && KNOWN.has(bare.toUpperCase())) {
      return bare.toUpperCase() as SourceRating;
    }
  }
  return null;
}

/** Strip a labelled rating out of notes, so it is not stored twice over. */
export function stripRatingLine(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const bare = line.trim();
      if (!bare) return true;
      if (bare.length <= 3 && KNOWN.has(bare.toUpperCase())) return false;
      return !/^(?:rodden|rating|RR)\s*[:=-]?\s*[A-Za-z]{1,3}$/i.test(bare);
    })
    .join('\n')
    .trim();
}
