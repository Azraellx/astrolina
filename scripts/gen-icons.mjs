// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Regenerate the favicon raster set from the master pin SVG (public/pin.svg).
//
// The map marker and the browser-tab SVG favicon both use pin.svg directly; this
// script only bakes the legacy/home-screen rasters that can't be an SVG:
//   favicon.ico (32+48), favicon-16/32, apple-touch (180), android-chrome 192/512.
// Each is just the pin centred over a TRANSPARENT background (no tile), matching the
// in-tab SVG favicon and the on-map marker.
//
// One-off tool — needs `npm i -D sharp png-to-ico` (or `npm i --no-save ...`) to run:
//   node scripts/gen-icons.mjs [--preview]
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAV = join(ROOT, 'public', 'favicon');

const pin = await readFile(join(ROOT, 'public', 'pin.svg'), 'utf8');

// The pin (64×88, tall) centred in a transparent square of `size` px, fit by height
// with `pad` as the share left as margin. Wrapping at the exact target size makes
// sharp rasterise the SVG natively (crisp at every size — no upscaled blur).
function pinIcon(size, pad) {
  const h = Math.round(size * (1 - pad * 2));
  const w = Math.round((64 / 88) * h);
  const x = Math.round((size - w) / 2);
  const y = Math.round((size - h) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <g transform="translate(${x} ${y})">
      <svg width="${w}" height="${h}" viewBox="0 0 64 88">${pin}</svg>
    </g>
  </svg>`;
}

const render = (size, pad) =>
  sharp(Buffer.from(pinIcon(size, pad))).png().toBuffer();

const jobs = [
  ['favicon-16x16.png', 16, 0.04],
  ['favicon-32x32.png', 32, 0.05],
  ['apple-touch-icon.png', 180, 0.12],
  ['android-chrome-192x192.png', 192, 0.12],
  ['android-chrome-512x512.png', 512, 0.12],
];

for (const [name, size, pad] of jobs) {
  await writeFile(join(FAV, name), await render(size, pad));
  console.log('wrote', name);
}

// favicon.ico bundles 32 + 48.
await writeFile(
  join(FAV, 'favicon.ico'),
  await pngToIco([await render(32, 0.05), await render(48, 0.06)]),
);
console.log('wrote favicon.ico');

// --preview: a large render over a checker-ish split (dark / light) to eyeball the
// glass against varied map backgrounds.
if (process.argv.includes('--preview')) {
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
    <rect width="320" height="360" fill="#1b2336"/>
    <rect x="320" width="320" height="360" fill="#f3f4f7"/>
    <g transform="translate(50 28)"><svg width="220" height="302" viewBox="0 0 64 88">${pin}</svg></g>
    <g transform="translate(370 28)"><svg width="220" height="302" viewBox="0 0 64 88">${pin}</svg></g>
  </svg>`;
  await writeFile(
    join(ROOT, 'scripts', '_preview.png'),
    await sharp(Buffer.from(bg)).png().toBuffer(),
  );
  console.log('wrote scripts/_preview.png');
}
