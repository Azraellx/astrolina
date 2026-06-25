// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Inject textual metadata into a PNG blob, entirely client-side. canvas.toBlob() emits a
// PNG with no text chunks, so the Capture export carries no provenance; this splices the
// standard `tEXt` chunks (Title/Author/… read by basic viewers) plus one `iTXt` XMP packet
// (the format Google / Adobe / Pinterest actually read) in right after IHDR. It's used to
// stamp generic AstroLina attribution so it travels with a re-shared image — never the
// chart's birth data. Best-effort: any malformed input returns the original blob unchanged,
// so metadata can never break an export.

// CRC-32 (PNG polynomial 0xEDB88320), table built once.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const latin1 = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);

// Assemble one PNG chunk: [length(4, BE)][type(4)][data][CRC(4, over type+data)].
function chunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const out = new Uint8Array(12 + len);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i) & 0xff;
  out.set(data, 8);
  dv.setUint32(8 + len, crc32(out.subarray(4, 8 + len)));
  return out;
}

// `tEXt`: keyword \0 text, both Latin-1 (callers must pass Latin-1-safe strings).
function textChunk(keyword: string, text: string): Uint8Array {
  const kw = latin1(keyword);
  const tx = latin1(text);
  const data = new Uint8Array(kw.length + 1 + tx.length);
  data.set(kw, 0);
  data.set(tx, kw.length + 1); // the single 0 byte between is already zero-filled
  return chunk('tEXt', data);
}

// `iTXt` carrying an uncompressed UTF-8 XMP packet (keyword "XML:com.adobe.xmp"):
// keyword \0 compFlag(0) compMethod(0) langTag \0 translatedKeyword \0 text.
function xmpChunk(xml: string): Uint8Array {
  const kw = latin1('XML:com.adobe.xmp');
  const body = new TextEncoder().encode(xml);
  const data = new Uint8Array(kw.length + 5 + body.length);
  data.set(kw, 0);
  // bytes kw.length..kw.length+4 are the 5 control bytes (all 0): null, compFlag,
  // compMethod, empty-langTag-null, empty-translatedKeyword-null — already zero-filled.
  data.set(body, kw.length + 5);
  return chunk('iTXt', data);
}

export interface PngTextMeta {
  Title?: string;
  Author?: string;
  Description?: string;
  Copyright?: string;
  Software?: string;
  Source?: string;
  Comment?: string;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
// Signature(8) + IHDR's length(4)+type(4)+data(13)+CRC(4): ancillary text chunks are valid
// anywhere between IHDR and IEND, and right after IHDR is the conventional spot.
const AFTER_IHDR = 8 + 4 + 4 + 13 + 4;

/** Return a copy of `blob` with the given text metadata (+ optional XMP) spliced in. On any
 *  error — or a non-PNG blob — returns the original blob so the export still succeeds. */
export async function addPngMetadata(
  blob: Blob,
  text: PngTextMeta,
  xmp?: string,
): Promise<Blob> {
  try {
    const buf = new Uint8Array(await blob.arrayBuffer());
    for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIGNATURE[i]) return blob;
    const chunks: Uint8Array[] = [];
    for (const [keyword, value] of Object.entries(text)) {
      if (value) chunks.push(textChunk(keyword, value));
    }
    if (xmp) chunks.push(xmpChunk(xmp));
    if (!chunks.length) return blob;
    const extra = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(buf.length + extra);
    out.set(buf.subarray(0, AFTER_IHDR), 0);
    let o = AFTER_IHDR;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    out.set(buf.subarray(AFTER_IHDR), o);
    return new Blob([out], { type: 'image/png' });
  } catch {
    return blob;
  }
}
