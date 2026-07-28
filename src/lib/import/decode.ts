// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Bytes to text.
//
// Reading a dropped file as UTF-8 and hoping is not good enough. Plenty of
// desktop software still writes single-byte Windows text, where an accented
// place name arrives as mojibake — and a mangled place name then fails to match
// anything, so the damage does not stay cosmetic. Sniff instead: honour a byte
// order mark, else try UTF-8 strictly, and fall back to the single-byte encoding
// only when strict UTF-8 actually fails.
//
// The fallback is safe in one direction only, which is why the order matters:
// valid UTF-8 is almost never valid-looking Windows-1252 text, but every byte
// sequence is *decodable* as Windows-1252, so trying it first would silently
// mangle correct files.

export interface DecodedText {
  text: string;
  /** What we ended up reading it as — surfaced in the preview so a surprising
   *  result is explainable rather than mysterious. */
  encoding: 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'windows-1252';
}

function hasBom(bytes: Uint8Array, ...sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

export function decodeBytes(buffer: ArrayBuffer): DecodedText {
  const bytes = new Uint8Array(buffer);

  if (hasBom(bytes, 0xef, 0xbb, 0xbf)) {
    return { text: strip(new TextDecoder('utf-8').decode(bytes.subarray(3))), encoding: 'utf-8-bom' };
  }
  if (hasBom(bytes, 0xff, 0xfe)) {
    return { text: strip(new TextDecoder('utf-16le').decode(bytes.subarray(2))), encoding: 'utf-16le' };
  }
  if (hasBom(bytes, 0xfe, 0xff)) {
    return { text: strip(new TextDecoder('utf-16be').decode(bytes.subarray(2))), encoding: 'utf-16be' };
  }

  try {
    // `fatal` is the whole point: without it an invalid byte becomes U+FFFD and
    // the decode "succeeds", so the fallback would never run.
    return { text: strip(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), encoding: 'utf-8' };
  } catch {
    return { text: strip(new TextDecoder('windows-1252').decode(bytes)), encoding: 'windows-1252' };
  }
}

/** Normalize line endings and drop a trailing blank line, so readers can count
 *  lines without every one of them re-deriving the same thing. */
function strip(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
}

/** The same normalization for text that arrived already decoded (a paste). */
export function normalizeText(text: string): string {
  return strip(text);
}
