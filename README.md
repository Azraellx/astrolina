# Astrocartography

A web-based astrocartography tool for practicing astrologers. Plot a natal
chart's planetary lines on an interactive world map, drag to relocate, and read
the relocated chart wheel inline — on any device, no install.

Runs entirely in the browser (ephemeris included), deployed as a static site on
Cloudflare Pages with a single edge function for geocoding.

## Features

- **Astrocartography lines** — MC / IC / ASC / DSC for the ten classical
  planets, color-coded per planet, dashed per angle.
- **Parans** (meridian × horizon) and **local-space** lines, toggleable.
- **Live relocation** — hover or pin anywhere on the map; the relocated angles
  and chart wheel update in real time. Pin your natal location, or recenter the
  map on the active pin.
- **Relocated chart wheel** — a compact wheel beside the map, plus an expandable
  detailed view with an Advanced mode that draws each planet's
  degree · sign · minute readout and the aspect grid.
- **Chart library** — store multiple charts (localStorage), switch between them,
  edit, and delete.
- **Birthplace geocoding + timezone resolution** — search any place
  (OpenStreetMap), with historical-DST handling and an "uncertain" flag for
  pre-1970 births outside US/Europe.
- **Import** — paste an AstroDataBank-style text block or a comma-delimited
  export, or drop a `.txt` / `.csv`, to add charts in bulk.
- **Light / dark basemap** themes.

## Tech stack

- **Vite + React + TypeScript**
- **MapLibre GL** with **Protomaps** vector basemaps (`.pmtiles`)
- **astronomia** (Moshier ephemeris) for planetary positions — client-side
- **tz-lookup** + **luxon** for timezone/offset resolution
- **Cloudflare Pages** hosting; one **Pages Function** (`/api/geocode`) proxies
  and edge-caches OpenStreetMap's Nominatim

## Getting started

Requires Node 20.19+ or 22.12+.

```bash
npm install
npm run dev        # Vite dev server (http://localhost:5173)
```

In dev, `/api/geocode` is served by a Vite middleware (see `vite.config.ts`) so
the search box works the same as in production.

### Build & preview

```bash
npm run build      # tsc -b + vite build  → dist/
npm run preview    # preview the built static site (no functions)
```

To preview exactly as Cloudflare serves it — static assets **and** the
`functions/` directory — use Wrangler:

```bash
npm run build
npx wrangler pages dev dist     # serves dist/ + runs /api/geocode for real
```

### Deploy

```bash
npm run deploy     # npm run build && wrangler pages deploy dist --project-name astrolina
```

`wrangler pages deploy` automatically discovers the `functions/` directory at
the project root and bundles it with the upload — no separate Worker deploy is
needed. The deploy output should mention compiling/uploading a Functions bundle.

## Project layout

```
src/
  components/        UI (Map, Sidebar, ChartWheel, ExpandedChartSidebar,
                     BirthDataForm, ImportChartModal, …)
  lib/
    ephemeris.ts     planetary positions, angles, relocation
    astro/           lines, parans, local-space generation
    atlas/           geocode (client) + timezone resolution
    chartLibrary.ts  localStorage-backed chart store
    importCharts.ts  text-block / CSV import parser
    theme.ts         basemap themes
functions/
  api/geocode.ts     Cloudflare Pages Function: cached Nominatim proxy
  _shared/           server-side fetch shared by the function and the dev shim
docs/
  differences-vs-pro-tools.md   honest comparison vs Solar Fire / Astro Gold / …
```

## Notes

- **Geocoder contact:** Nominatim's usage policy asks for an identifying
  `User-Agent` with contact info — set in `functions/_shared/geocodeSource.ts`.
  Update it (or swap to a paid provider) before heavy production traffic; only
  that one file changes.
- **Accuracy & scope:** for how this prototype compares to desktop pro tools —
  ephemeris precision, atlas coverage, parans, house cusps, and what's
  deliberately deferred — see
  [`docs/differences-vs-pro-tools.md`](docs/differences-vs-pro-tools.md).
