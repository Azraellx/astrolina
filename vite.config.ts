// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

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
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client'],
    // The Swiss Ephemeris package loads its WASM via a dynamic import of the
    // emscripten glue + a locateFile hook; let Vite serve it as-is rather than
    // pre-bundling (which mangles the wasm/glue resolution).
    exclude: ['@swisseph/browser'],
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
