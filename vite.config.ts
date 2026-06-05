// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import {
  fetchGeocode,
  fetchReverseGeocode,
} from './functions/_shared/geocodeSource';

// Dev-only: serve /api/geocode locally (the Pages Function isn't running under
// `vite`), reusing the same Nominatim fetch the edge function uses.
function geocodeDevApi(): Plugin {
  return {
    name: 'geocode-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/geocode', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost');
          const q = url.searchParams.get('q') ?? '';
          const limit = Number(url.searchParams.get('limit') ?? '6');
          const results =
            q.trim().length < 2
              ? []
              : await fetchGeocode(q, limit, undefined, process.env.GEOCODER_UA);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(results));
        } catch {
          res.statusCode = 502;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'geocode_failed' }));
        }
      });
    },
  };
}

// Dev-only: serve /api/reverse-geocode locally, mirroring the Pages Function.
function reverseGeocodeDevApi(): Plugin {
  return {
    name: 'reverse-geocode-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/reverse-geocode', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost');
          const lat = Number(url.searchParams.get('lat'));
          const lng = Number(url.searchParams.get('lng'));
          const label =
            Number.isFinite(lat) && Number.isFinite(lng)
              ? await fetchReverseGeocode(lat, lng, undefined, process.env.GEOCODER_UA)
              : null;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ label }));
        } catch {
          res.statusCode = 502;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'reverse_geocode_failed' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), geocodeDevApi(), reverseGeocodeDevApi()],
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
