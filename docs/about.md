# About This App

A modern, web-based astrocartography tool for curious minds. Plot a natal chart's planetary lines on an interactive world map, drag to relocate, and view the relocated chart wheel instantly, on any device, with no install. The astronomical engine runs entirely in your browser.

This page explains what the app computes, what it deliberately doesn't do yet, and where its accuracy has limits. For the underlying math and conventions, see [Calculation Methods](calculation-methods.md).

## What it computes

- **Bodies:** the ten classical planets (Sun through Pluto), the lunar nodes (mean or true, your choice), Black Moon Lilith (mean apogee), Chiron, and the four main asteroids (Ceres, Pallas, Juno, Vesta).
- **Lines:** for every body, a line for each of the four chart angles (MC, IC, ASC, DSC) — plus optional **Vertex-axis lines** (Vx/Avx, where a body stands on the local prime vertical) — color-coded per planet, with each body's zenith point (the spot on Earth where it passes directly overhead, also called the sub-planetary point).
- **Parans:** all planet-to-planet parans: any latitude where two bodies are simultaneously on angles (MC, IC, ASC, or DSC), whether one is on the meridian while the other rises or sets, or both share the horizon.
- **Local space:** directional lines radiating from the origin (the placed pin by default, or the birthplace), each launched along a body's compass bearing (azimuth) and extended as a great circle — so each line passes exactly through the spot on Earth where that body is overhead.
- **House systems:** ten, switchable, Placidus (default), Koch, Regiomontanus, Campanus, Porphyry, Alcabitus, Meridian, Morinus, Whole Sign, and Equal — the last four well-defined at every latitude. The **Vertex axis** (Vx/Avx) joins the map, wheel, and tables via its own line filters.
- **Line conventions:** switch the entire map between Celestial (standard astrocartography, placed by sidereal time) and Mundane (the geodetic technique, mapping the zodiac onto Earth's longitudes). You can also switch between In Mundo and In Zodiaco calculations for planetary positions before mapping.
- **Time overlays:** lay transits, secondary or tertiary progressions, solar-arc directions, primary directions, cyclo·carto·graphy (progressed inners with transiting outers), or eclipse charts over the natal map, with a timeline you can scrub or animate to sweep the lines across the map over time.
- **Relationship maps:** overlay a second chart's lines, with a bi-wheel and natal-to-overlay cross-aspects in the expanded view.
- **Relocation:** hover or drop a pin anywhere on the map; the relocated angles and chart wheel update in real time, with the place name and coordinates resolved as you go.
- **Import and library:** paste an AstroDataBank-style text block or a comma-delimited export (or drop a `.txt` / `.csv`) to add charts in bulk; charts live in a local library you can switch between, edit, and delete.

## Why a web-based tool

These are the things that set a browser-based tool apart from established desktop software.

- **Platform-agnostic and instant.** No install and no operating-system restriction. A URL works on any device: phone, tablet, or a client's laptop during a reading. The professional desktop tools are typically Windows-only or Mac-only.
- **Live drag-relocation with the relocated wheel inline.** Drag a point on the map and the relocated chart wheel updates in real time, right beside the map, with no switching to a separate window to see the relocated chart.
- **Modern, legible map design.** A dark, minimal basemap lets the planet lines stand out, with faint parans that never overwhelm. A clean map is itself useful, since astrologers screenshot maps to share with clients.
- **Techniques toggle without dialogs.** Show or hide parans and individual planets, and switch calculation conventions (Celestial/Mundane, In Mundo/In Zodiaco, house system, lunar-node type, progression/direction method) from one sidebar, with local space on its own movable Location panel — each re-rendering the map instantly.
- **Everything in one view.** Time overlays (transits, secondary progressions, solar-arc and primary directions) and relationship maps share the same map and the same toggles, rather than living in separate tools or modal dialogs.
- **Import and portability.** Bring charts in from astro.com-style text or CSV in bulk, with coordinates and timezone offset read straight from the source.
- **Sharing and embedding (planned).** Branded PDF export and embeddable map widgets are on the roadmap, so a map can become part of an astrologer's client deliverable.

## What it doesn't do (yet)

Set against full-featured desktop software, these are the deliberate gaps:

- **Star parans.** Fixed-star angle lines ship (a 40-star catalog with proper motion), but the per-location star × planet paran list and star-to-star parans are not surfaced.
- **A full classical primary-directions engine.** The map's directions (solar arc, secondary progressions, primary directions) are an angle-only treatment: the directed angles and their lines, not individual promissor-to-significator directions with latitude, semi-arc proportions, or converse motion. (A dated directions list does not ship.)
- **Sidereal mode is a reading layer.** A sidereal zodiac mode ships (Lahiri
  and Fagan/Bradley ayanamsas) over the wheel and readouts — the map lines mark
  zodiac-independent events and don't move — and the Geodetic technique is
  tropical by definition (so it's unavailable in sidereal mode). Its conventions
  are documented in
  [Calculation Methods](calculation-methods.md).
- **Relationship charts.** Synastry (two charts overlaid), Davison, and composite-midpoint charts all ship; the composite's conventions (shorter-arc planet midpoints on the ecliptic, an ASC-midpoint angle frame) are documented in [Calculation Methods](calculation-methods.md).
- **A hand-curated historical atlas.** Birthplaces are geocoded and timezones resolved from open data, not from a proprietary hand-curated historical atlas (see Accuracy & limitations).
- **Date entry before 1800.** The birth-data form accepts years 1800–2200. An imported chart with an earlier date still computes its planets, nodes, and Lilith, but its asteroids are omitted (see [Calculation Methods](calculation-methods.md) for why).
- **Hypothetical bodies.** Transpluto and the Uranian points are omitted (there is no consensus ephemeris for them), and centaurs beyond Chiron aren't bundled.
- **Server-side PDF export and embeddable widgets.** Planned; export currently runs in the browser.

## Accuracy & limitations

**Planetary positions.** The app reads the Swiss Ephemeris, the same JPL-derived engine the professional desktop tools use, so planet, node, asteroid, Lilith, and angle positions agree with those tools to well under an arcsecond. The engine, data files, and date range are described in [Calculation Methods](calculation-methods.md).

**Birthplace atlas and timezones.** Birthplaces resolve offline-first from a bundled GeoNames cities dataset, falling back to OpenStreetMap for places not in that set; timezones and historical daylight-saving offsets come from the IANA time-zone database. That stack is excellent for **post-1970 dates and for locations in the Americas or Europe**. For earlier dates, especially elsewhere, historical daylight-saving and local-mean-time records get spotty (wartime European DST changes, 19th-century births before standard time zones, and so on). The app flags such births as "uncertain" so you know to spot-check: a famous pre-1900 chart can land a minute or two off, nudging its MC line up to a degree of longitude. The professional desktop tools license a proprietary, hand-curated historical atlas that captures these edge cases.

**Imported charts.** A chart imported from text or CSV carries its own coordinates and timezone offset, so import bypasses the geocoder and timezone lookup entirely; the source data is authoritative.

## Data sources & licensing

- **Swiss Ephemeris** (Astrodienst's port of JPL DE441 data), the astronomical engine and its `.se1` data files, used under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.
- **GeoNames** city data, **CC-BY 4.0**.
- **OpenStreetMap / Nominatim**, the geocoding fallback, © OpenStreetMap contributors (**ODbL**); requests are proxied and cached through a Cloudflare Pages Function.
- **OpenFreeMap** basemap vector tiles (OpenMapTiles schema, OpenStreetMap data, **ODbL**); the Earth theme's **MapTiler Basic** style is **BSD-3-Clause**.
- **Natural Earth** country boundaries (via the `world-atlas` package), public domain.
- **Noto Sans Symbols** astrological glyphs, **SIL Open Font License 1.1**.

This application is open source under the **AGPL-3.0**.

## In short

It's a web-based astrocartography tool for practitioners. The map and live drag-relocation match or beat desktop interactivity, and you can geocode any birthplace, resolve its timezone, and import charts in bulk. It computes the ten classical planets plus the lunar nodes, Black Moon Lilith, Chiron, and the four main asteroids, all with the Swiss Ephemeris, in the browser. You can overlay transits, secondary progressions, and directions and animate them over time, overlay a second chart for relationship work, draw the full set of planet-to-planet parans, and switch lines between in-mundo and in-zodiaco or between celestial and geodetic placement. It doesn't yet have fixed-star parans, a hand-curated historical atlas, or a full primary-directions engine. If your work leans on those, keep your existing tool alongside it; if it leans on planets, asteroids, nodes, parans, local space, a relocated wheel, transits and secondary progressions, and relationship maps, this can already handle the map portion of your workflow on any device.
