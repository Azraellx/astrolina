import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fetchGeocode } from './functions/_shared/geocodeSource';

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
            q.trim().length < 2 ? [] : await fetchGeocode(q, limit);
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

export default defineConfig({
  plugins: [react(), geocodeDevApi()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          astronomia: ['astronomia', 'astronomia/data'],
        },
      },
    },
  },
});
