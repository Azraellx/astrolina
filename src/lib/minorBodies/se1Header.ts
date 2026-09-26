// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// A Swiss Ephemeris .se1 header check, run on the bytes BEFORE they are handed to
// the engine. It mirrors the engine's own `read_const` (sweph.c) line for line, so
// a file this accepts is one the engine will open — and a file it rejects never
// reaches the engine at all.
//
// Why bother, when the engine checks too: the engine's failure path is expensive.
// A bad file makes read_const bail through free_planets(), which throws away every
// planet's cached segments — so a garbage file that stays mounted and keeps being
// sampled thrashes the whole sampling layer. And the commonest garbage is not a
// damaged file but no file at all: a static host with no 404 page answers a
// missing path with its HTML shell and a 200.
//
// The header is text: `SWISSEPH <ver>\r\n`, `<file name>\r\n`, a copyright line,
// then (for a single-asteroid file) the orbital-elements line, which opens with the
// MPC number and the body's name. Real headers pad with spaces ("SWISSEPH  3").

export type Se1HeaderResult =
  | { ok: true; number: number | null; name: string | null }
  | { ok: false; reason: 'html' | 'damaged' | 'name' | 'number' };

// read_const's name field: after the number and ONE separator character, the
// engine copies exactly this many characters (lastnam = 19).
const NAME_FIELD = 19;

/** Read up to `max` bytes as one CRLF-terminated line from `pos`; null if no CRLF. */
function readLine(bytes: Uint8Array, pos: number, max: number): { text: string; next: number } | null {
  const end = Math.min(bytes.length, pos + max);
  for (let i = pos; i < end - 1; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) {
      let text = '';
      for (let j = pos; j < i; j++) text += String.fromCharCode(bytes[j]);
      return { text, next: i + 2 };
    }
  }
  return null;
}

/**
 * Check `bytes` as the .se1 file named `expectedName` (its bare file name, e.g.
 * `se00433s.se1`). `expectNumber`, when given, must equal the MPC number on the
 * elements line — so a file served under the wrong body's URL is refused too.
 */
export function checkSe1Header(
  bytes: Uint8Array,
  expectedName: string,
  expectNumber?: number,
): Se1HeaderResult {
  // An HTML page (a static host's SPA fallback, an error page) — say so plainly.
  let first = 0;
  while (first < bytes.length && (bytes[first] === 0x20 || bytes[first] === 0x09 || bytes[first] === 0x0a || bytes[first] === 0x0d)) first++;
  if (bytes[first] === 0x3c /* '<' */) return { ok: false, reason: 'html' };

  // Line 1 — the version line: must end CRLF and carry a digit.
  const l1 = readLine(bytes, 0, 256);
  if (!l1 || !/\d/.test(l1.text) || !l1.text.startsWith('SWISSEPH')) {
    return { ok: false, reason: 'damaged' };
  }
  // Line 2 — the file's own name, which the engine compares with the name it was
  // OPENED under (trailing spaces/CR/LF trimmed, both lowercased). A mismatch is a
  // hard failure in the engine, so it is one here.
  const l2 = readLine(bytes, l1.next, 256);
  if (!l2) return { ok: false, reason: 'damaged' };
  if (l2.text.replace(/[\s]+$/, '').toLowerCase() !== expectedName.toLowerCase()) {
    return { ok: false, reason: 'name' };
  }
  // Line 3 — copyright.
  const l3 = readLine(bytes, l2.next, 512);
  if (!l3) return { ok: false, reason: 'damaged' };

  // Line 4 — only a single-asteroid file has it (the main-asteroid/planet files
  // go straight to binary). Parse it the way the engine does: skip spaces, take
  // the digits, skip ONE character, then the name field.
  if (!/^(se\d{5}|s\d{6,})s?\.se1$/i.test(expectedName)) {
    return { ok: true, number: null, name: null };
  }
  const l4 = readLine(bytes, l3.next, 1024);
  if (!l4) return { ok: false, reason: 'damaged' };
  const m = /^ *(\d+)./.exec(l4.text);
  if (!m) return { ok: false, reason: 'damaged' };
  const number = Number(m[1]);
  if (expectNumber !== undefined && number !== expectNumber) return { ok: false, reason: 'number' };
  // The engine then trims trailing spaces and cuts the name at its first DOUBLE space
  // (sweph.c, just after the name is copied out of the elements record), so this cuts
  // there too: the name returned is the one the engine will report for the file.
  const name = l4.text.slice(m[0].length, m[0].length + NAME_FIELD).split('  ')[0].trim();
  return { ok: true, number, name: name || null };
}
