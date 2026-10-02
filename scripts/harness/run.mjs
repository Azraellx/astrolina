// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verify-script harness: bundles a TypeScript verify script TOGETHER WITH the
// real src/lib modules it imports, then runs the bundle under Node. This lets
// the verify suite test the code the app actually ships instead of re-deriving
// the same math in a parallel .mjs copy (where a shared mistake would hide).
//
// Four things keep the browser-targeted source happy under Node:
//   1. '@swisseph/browser' is aliased to swisseph-browser-shim.ts, which
//      delegates to @swisseph/node (same Swiss Ephemeris C core, same .se1
//      files from public/ephe).
//   2. Vite-only `?url` asset imports are stubbed to an empty URL: the engine's
//      `swisseph.wasm?url` (no WASM in Node), and any other asset a reached
//      module names by URL (the map's symbol font in glyphImages.ts, the RTL text
//      plugin) — Node never fetches them, and esbuild has no loader for them.
//   3. `import.meta.env.BASE_URL` is defined to '/' (Vite injects it at build
//      time; esbuild does the same here).
//   4. A Vite `?raw` import (the hypothetical points' elements file, ephemeris.ts)
//      is the file's text, as Vite gives it — the REAL file, never a stub, so the
//      suite mounts exactly the bytes the app ships.
//
// Usage: node scripts/harness/run.mjs scripts/verify-something.ts
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entry = process.argv[2];
if (!entry) {
  console.error('usage: node scripts/harness/run.mjs <verify-script.ts>');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '.cache', basename(entry).replace(/\.[cm]?tsx?$/, '') + '.mjs');

const browserShim = {
  name: 'swisseph-browser-shim',
  setup(b) {
    b.onResolve({ filter: /^@swisseph\/browser$/ }, () => ({
      path: resolve(here, 'swisseph-browser-shim.ts'),
    }));
    b.onResolve({ filter: /\?url$/ }, (args) => ({
      path: args.path,
      namespace: 'asset-url-stub',
    }));
    b.onLoad({ filter: /.*/, namespace: 'asset-url-stub' }, () => ({
      contents: 'export default "";',
      loader: 'js',
    }));
    b.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.replace(/\?raw$/, '')),
      namespace: 'raw-text',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw-text' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

await build({
  entryPoints: [entry],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // Inline source maps so assertion failures point at real src/ lines.
  sourcemap: 'inline',
  define: { 'import.meta.env.BASE_URL': '"/"' },
  // Native binding — must stay a runtime require, never bundled.
  external: ['@swisseph/node'],
  plugins: [browserShim],
  logLevel: 'warning',
});

await import(pathToFileURL(outFile).href);
