# AstroLina

<p align="center">
  <a href="https://astrolina.org">
    <img src="assets/astrolina-banner-v1.webp" alt="AstroLina: astrocartography for curious minds" width="100%">
  </a>
</p>

<p align="center">
  <a href="https://maps.astrolina.org"><img alt="Live app" src="https://img.shields.io/badge/launch-maps.astrolina.org-22c55e"></a>
  <a href="https://astrolina.org"><img alt="Website" src="https://img.shields.io/badge/website-astrolina.org-6d28d9"></a>
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-2563eb"></a>
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-db2777"></a>
</p>

**A modern, web-based astrocartography tool for curious minds.** Plot a natal
chart's planetary lines on an interactive world map and drag to relocate with the
chart wheel updating live. It features planet-to-planet parans and local space,
eight house systems, geodetic (Mundane) lines, time overlays (transits, secondary
progressions, solar-arc and primary directions) with an animated timeline, and
synastry. Every position is computed client-side with the Swiss Ephemeris. Runs
on any device, no install.

Deployed as a static site on Cloudflare Pages, with two edge functions for
geocoding.

<!-- TEMP: accuracy disclaimer. Remove once outputs are corroborated against other tools. -->
> **⚠️ Early access: accuracy is still being verified.** AstroLina
> uses the same astronomical datasets as the professional tools (Swiss Ephemeris
> / JPL DE441), but its output is still being cross-checked against established
> software, and display bugs could currently misplace a line or other element.
> Until this note is removed, please treat the results as provisional and
> double-check anything important against a tool you already trust.
<!-- /TEMP -->

## Features

- **Astrocartography lines** for the ten classical planets plus the lunar nodes,
  Black Moon Lilith, Chiron, and the four main asteroids: MC / IC / ASC / DSC,
  color-coded per body and dashed per angle, each with its zenith point.
- **Parans** (planet-to-planet, meridian and horizon) and **local-space** lines,
  toggleable.
- **Time overlays** in one slot: transits, secondary progressions, solar-arc
  directions, and primary directions, with a date scrubber and play/pause
  animation that sweeps the lines across the map over time.
- **Relationship mapping**: overlay a second chart (synastry), with a bi-wheel and
  natal-to-overlay cross-aspects.
- **Live relocation**: hover or pin anywhere on the map; the relocated angles and
  chart wheel update in real time. Pin your natal location, or recenter the map
  on the active pin.
- **Relocated chart wheel**: a compact wheel beside the map, plus an expandable
  detailed view with an Advanced mode (degree · sign · minute readouts and the
  aspect grid). Eight house systems: Placidus (default), Koch, Regiomontanus,
  Campanus, Porphyry, Alcabitus, Whole Sign, Equal.
- **Calculation conventions** as live toggles: Celestial vs geodetic (Mundane)
  line placement, In Mundo vs In Zodiaco, house system, lunar-node type
  (mean/true), and the progression/direction method.
- **Chart library**: store multiple charts (localStorage), switch between them,
  edit, and delete.
- **Birthplace geocoding + timezone resolution**: search any place, offline-first
  from a bundled GeoNames dataset with an OpenStreetMap fallback, with
  historical-DST handling and an "uncertain" flag for pre-1970 births outside the
  Americas or Europe.
- **Import**: paste an AstroDataBank-style text block or a comma-delimited export,
  or drop a `.txt` / `.csv`, to add charts in bulk.
- **Flat or globe** map projection, and **three basemap themes** (Earth, Glass,
  Dark).

## Tech stack

- **Vite + React + TypeScript**
- **MapLibre GL** rendering **OpenFreeMap** vector basemaps (OpenMapTiles schema,
  OpenStreetMap data); the "Earth" theme uses a self-hosted **MapTiler Basic**
  style (BSD-3-Clause)
- **Swiss Ephemeris** (`@swisseph/browser`, WebAssembly, AGPL-3.0) for all body
  positions, houses, and sidereal time, client-side, with self-hosted `.se1`
  data in `public/ephe/`
- **tz-lookup** + **luxon** for timezone/offset resolution
- **Cloudflare Pages** hosting; two **Pages Functions** (`/api/geocode` and
  `/api/reverse-geocode`) proxy and edge-cache OpenStreetMap's Nominatim
- **Noto Sans Symbols** (subset, **SIL Open Font License 1.1**) for the
  astrological glyphs; license + attribution in
  [`public/fonts/`](public/fonts/) (shipped to `dist/fonts/OFL.txt`)

## Getting started

Requires Node 24 LTS (see `.nvmrc`). Node 22.12+ also works; Node 20 is
end-of-life.

```bash
npm install
npm run dev        # Vite dev server (http://localhost:5173)
```

In dev, `/api/geocode` and `/api/reverse-geocode` are served by Vite middleware
(see `vite.config.ts`) so search and reverse-geocoding work the same as in
production.

### Build & preview

```bash
npm run build      # tsc -b + vite build  → dist/
npm run preview    # preview the built static site (no functions)
```

To preview exactly as Cloudflare serves it (static assets and the `functions/`
directory), use Wrangler:

```bash
npm run build
npx wrangler pages dev dist     # serves dist/ + runs the API functions for real
```

### Deploy

```bash
npm run deploy     # npm run build && wrangler pages deploy dist --project-name astrolina
```

`wrangler pages deploy` automatically discovers the `functions/` directory at the
project root and bundles it with the upload; no separate Worker deploy is needed.
The deploy output should mention compiling/uploading a Functions bundle.

## Project layout

```
src/
  components/        UI (Map, Sidebar, ChartWheel, ExpandedChartSidebar,
                     BirthDataForm, ImportChartModal, CreditsModal, …)
  lib/
    ephemeris.ts     planetary positions, angles, relocation, house systems
    astro/           lines, parans, local-space, timeline/overlays
    atlas/           geocode (client) + timezone resolution
    chartLibrary.ts  localStorage-backed chart store
    importCharts.ts  text-block / CSV import parser
    theme.ts         basemap themes
functions/
  api/geocode.ts          Cloudflare Pages Function: cached Nominatim search proxy
  api/reverse-geocode.ts  Cloudflare Pages Function: cached Nominatim reverse proxy
  _shared/                server-side fetch shared by the functions and the dev shim
docs/
  about.md                what the app does, its limits, data & licensing
  calculation-methods.md  ephemeris, lines, parans, houses, geodetic, directions
LICENSE                   GNU AGPL-3.0
NOTICE                    copyright, the §7(b) attribution term, third-party credits
CONTRIBUTING.md           how to contribute
CLA.md                    Contributor License Agreement
```

## License

AstroLina is free, open-source software, copyright © 2026 AstroLina, licensed
under the **GNU Affero General Public License v3.0** (see [LICENSE](LICENSE)). The
same license covers the Swiss Ephemeris engine and data the app redistributes.

Under an additional term permitted by AGPL section 7(b), any copy, modified
version, or network deployment must preserve the **"© AstroLina"** attribution
(linking to https://astrolina.org) shown in the app's user interface. See
[NOTICE](NOTICE) for that term and the full third-party attributions.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md); merging
a contribution requires agreeing to the [Contributor License Agreement](CLA.md)
(you keep your copyright and grant AstroLina a broad license, including the right
to relicense the project in the future).

## Notes

- **Geocoder contact:** Nominatim's usage policy asks for an identifying
  `User-Agent` with a real contact. The default lives in
  `functions/_shared/geocodeSource.ts`; **if you self-host or fork this, set your
  own** via the `GEOCODER_UA` environment variable (on your Cloudflare Pages
  project, and locally for dev) so rate-limiting or abuse reports reach you, not
  the upstream contact. For heavy traffic, self-host Nominatim or use a paid
  provider.
- **Accuracy & scope:** what the app computes, where its accuracy has limits, and
  its data sources and licensing are in [`docs/about.md`](docs/about.md); the
  calculation conventions (ephemeris, lines, parans, house cusps, geodetic,
  directions) are in
  [`docs/calculation-methods.md`](docs/calculation-methods.md).
