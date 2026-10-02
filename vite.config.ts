// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import {
  handleDevGeocode,
  handleDevReverseGeocode,
} from './functions/_shared/devGeocodeApi';

// Dev-only: serve the geocoding endpoints locally (the Pages Functions aren't
// running under `vite`). The handling lives in functions/_shared/devGeocodeApi
// so a downstream build can mount the same behaviour in its own config — see
// that file for why the shared piece is the handler and not the plugin.
function geocodeDevApi(): Plugin {
  return {
    name: 'geocode-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/geocode', (req, res) =>
        handleDevGeocode(req, res, {
          userAgent: process.env.GEOCODER_UA,
          base: process.env.GEOCODER_BASE,
        }),
      );
      server.middlewares.use('/api/reverse-geocode', (req, res) =>
        handleDevReverseGeocode(req, res, {
          userAgent: process.env.GEOCODER_UA,
          base: process.env.REVERSE_GEOCODER_BASE,
        }),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), geocodeDevApi()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      // The right-to-left text plugin's built file, imported with `?url` and handed to MapLibre's
      // worker (src/components/Map/rtlTextPlugin.ts). The package's `exports` map publishes only
      // its ES-module source, which a worker's importScripts can't load, and Vite refuses any
      // subpath `exports` doesn't list — so the built file is reached by its path. The `?url`
      // query survives the replacement (it sits after the matched part). The Pro build carries
      // the same alias, pointed at its own node_modules.
      {
        find: /^@mapbox\/mapbox-gl-rtl-text\/dist\/mapbox-gl-rtl-text\.js/,
        replacement: fileURLToPath(
          new URL('./node_modules/@mapbox/mapbox-gl-rtl-text/dist/mapbox-gl-rtl-text.js', import.meta.url),
        ),
      },
    ],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client'],
    // The Swiss Ephemeris package loads its WASM via a dynamic import of the
    // emscripten glue + a locateFile hook; let Vite serve it as-is rather than
    // pre-bundling (which mangles the wasm/glue resolution).
    exclude: [
      '@swisseph/browser',
      // The right-to-left text plugin's built file is an asset (`?url`), never a module: left to
      // the pre-bundler, the alias above (a path inside node_modules) made it try to pre-bundle
      // `…/mapbox-gl-rtl-text.js?url` and fail, taking the map's module with it.
      '@mapbox/mapbox-gl-rtl-text',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        // Group Swiss Ephemeris, maplibre, and the offline country polygons
        // into their own cacheable chunks.
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre';
          if (id.includes('node_modules/@swisseph')) return 'swisseph';
          if (
            id.includes('node_modules/world-atlas') ||
            id.includes('node_modules/topojson-client')
          ) {
            return 'geo-country';
          }
          return undefined;
        },
      },
    },
  },
});
