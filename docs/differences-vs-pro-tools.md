# What a Pro Will Notice

A reference for explaining how this prototype compares to Solar Fire / Solar Maps, Astro Gold, AstroZeus, and Matrix Horizons. Written as plain facts — neither apologetic nor boastful — so you can have substantive conversations with practitioners who ask.

The structure: **what we don't do yet** (with the reason and the path to fix), then **what we already do better**.

---

## What we don't do yet

### 1. Ephemeris engine: Swiss Ephemeris ✓ (done)

We now use **Swiss Ephemeris** (Astrodienst's port of JPL data) compiled to WebAssembly via `@swisseph/browser`, running entirely in the browser under the **AGPL-3.0** license — the same engine Solar Fire, Astro Gold, and the desktop tools use. The self-hosted `.se1` data files (`public/ephe/`) cover 1800–2399 AD.

**Practical impact:**
- Planet, node, asteroid, Lilith, and angle positions now read from the same source of truth as the desktop tools — agreement is well under an arcsecond.
- This single engine swap also resolved the former minor-bodies gap (§5) and unlocked the additional house systems (§4).
- **What a pro might catch:** nothing on the ephemeris front anymore — the numbers match Solar Fire.

### 2. Atlas: tzdb-based, not ACS-grade historical curation

Birthplace search and the map's place-name readout resolve **offline-first** from a bundled GeoNames cities dataset (~31k places ≥ 15,000 population, CC-BY); only a miss — a small/rural locality, or a point far from any city — falls through to OpenStreetMap (Nominatim, proxied and edge-cached through a Cloudflare Pages Function). The timezone / UTC offset is resolved with `tz-lookup` + the IANA `tzdb` via luxon. That stack is excellent for **post-1970** dates and **for North America and Europe**. The app already flags pre-1970 births outside those regions as "uncertain" so the user knows to spot-check.

**Practical impact:**
- For pre-1970 births, especially outside North America and Western Europe, historical DST and local mean time records get spotty. Edge cases: WWII-era European DST changes, 19th-century US births before standard time zones (1883), pre-1949 Chinese local times, etc.
- Solar Fire and Astro Gold license the proprietary **ACS Atlas** (Astro Computing Services), which captures these edge cases by hand-curation across decades.
- **What a pro might catch:** a famous pre-1900 chart calculated 1–4 minutes off, putting the MC line 0.25°–1° off its expected longitude.
- **Note:** imported charts carry their own coordinates and offset, so import sidesteps both the geocoder and tzdb entirely — the source data is authoritative.

**Path to fix:** the "uncertain birth time / location" flag already ships; beyond that, license ACS Atlas data or build an open atlas through user-submitted corrections.

### 3. Parans: planet–planet complete; no fixed-star parans yet

We compute all planet-to-planet parans:
- Planet A on **MC** or **IC** while Planet B is on the horizon (rising or setting).
- **Horizon × horizon** — both planets on the horizon together, in any rising/setting combination. Solved in closed form: the two-on-the-horizon condition reduces to a linear equation in the local sidereal time (`cos(θ−raA) = k·cos(θ−raB)`, `k = tan(decA)/tan(decB)`), giving two latitudes per pair with no iteration.

**What we don't compute yet:**
- Fixed-star parans (Bernadette Brady's work) — planet-to-star and star-to-star.

**Practical impact:**
- Planet–planet parans (meridian and horizon) are now complete, covering what most practitioners discuss.
- **What a pro might catch:** a Bernadette Brady–trained "Star Phase Astrology" practitioner will want fixed-star parans; those aren't in yet.

**Path to fix:** fixed-star parans need a star catalog (e.g., FK6 or Hipparcos with proper motion); the same meridian/horizon machinery then applies once a star's RA/dec is available.

### 4. Chart wheel: Placidus, Koch, Regiomontanus, Campanus, Porphyry, Alcabitus, Whole Sign, Equal ✓

The expanded (large) chart wheel draws all twelve house cusps, switchable from the **Calculation** section of the sidebar between **Placidus** (default, matching Solar Fire and Astro Gold), **Koch**, **Regiomontanus**, **Campanus**, **Porphyry**, **Alcabitus**, **Whole Sign**, and **Equal** — all computed natively by Swiss Ephemeris. The four angle axes (ASC/MC/DSC/IC) are drawn as bold diameters regardless of system; intermediate cusps that don't fall on an angle are drawn as spokes (so e.g. Equal's 4th/10th, which float off the meridian, appear correctly). The mini wheel still shows angles only, to stay legible at small size.

**Practical impact:**
- Covers the systems the overwhelming majority of Western practitioners use. Polar-circle behaviour for the quadrant systems is handled by Swiss Ephemeris directly.
- **What a pro might catch:** a few rarer systems (Vehlow, Meridian/axial, Morinus, Polich/Page) aren't in the selector yet — Swiss can compute them, so each is a one-line addition to the house-system map in `relocate`.

### 5. Minor bodies: Swiss-grade ✓ (done)

Chiron and the four classical asteroids (Ceres, Pallas, Juno, Vesta) now read from Swiss Ephemeris's precomputed positions (the `seas_18.se1` asteroid file) — the same swap that put the planets on Swiss.

**Practical impact:**
- Accurate to ~1 arcsecond, including for Chiron's chaotic centaur orbit, where the old static-orbital-element model drifted several tenths of a degree on older charts. A side-by-side with Solar Fire now matches.

### 6. Not implemented: fixed stars, Transpluto, other hypotheticals

**Black Moon Lilith** (mean apogee) is now included alongside the nodes and asteroids — toggle it on in the sidebar. Still missing:

- **Fixed stars** (Regulus, Algol, Spica, etc.) — wanted by traditional and Bernadette Brady–trained practitioners. Need a star catalog (FK6 or Hipparcos) with proper motion.
- **Transpluto** and other hypothetical bodies (Vulcan, Cupido, Hades, etc.) — deliberately omitted because there's no consensus ephemeris. Different schools publish different positions. (Swiss Ephemeris does expose the Uranian/fictitious points, so these are now a small addition if demand appears.)
- **Centaurs beyond Chiron** (Pholus, Nessus, Chariklo) — Swiss computes Pholus directly; the others need their asteroid-number data files. Not enough demand to justify yet.

### 7. Not implemented (and explicitly deferred to v2)

These are in the roadmap but intentionally out of scope for the prototype:

- **Composite and midpoint maps** — Davison or composite chart projected as ACG lines. (Synastry — two charts overlaid — already ships; see "What we already do better" below.)
- **Vedic / sidereal mode** — tropical only at the moment. Vedic astrocartography is barely served by any tool, which is a real opportunity.
- **Embeddable widgets** — so an astrologer can drop a map into their own website.
- **Server-side PDF rendering** — export currently relies on the browser, fine for prototype but limited for branded high-quality exports at scale.

---

## What we already do better than the incumbents

These are the things a pro will notice immediately in the other direction — they're the reason a B2B product can win on UX even before reaching feature parity.

### 1. Platform-agnostic and instant

No install, no Windows-only restriction, no "Mac users open Astro Gold, PC users open Matrix Horizons." A URL works on any device — phone, tablet, client's laptop during a reading. Solar Fire is Windows-only and looks it. Astro Gold is Mac/iOS only. AstroZeus is desktop-bound.

### 2. Live drag-relocation with the relocated wheel inline

Astro Gold pioneered live drag-relocation on the map — it's their headline feature. We match it, plus we show the **relocated chart wheel updating in real time next to the map**. In the desktop tools, viewing the relocated wheel requires switching to a separate window (or opening Solar Fire). Eliminating that switch is one of the main goals of this product. As you move the point, its **place name** is surfaced in the top bar too — the country resolves instantly offline while you hover (bundled boundary polygons, no network), and a placed pin resolves to its full *city · region · country* from a bundled GeoNames city index (also offline; the online geocoder is touched only when no nearby city is in the set) — so it's always clear where on Earth the relocated chart is being cast.

### 3. Modern visual design

Dark, minimal basemap. Planet lines do the talking. Color-coded by planet, dashed patterns to distinguish ASC/DSC/MC/IC, faint parans that don't overwhelm. The desktop tools render maps that look like 1998. A clean look is itself a feature — astrologers screenshot maps to share with clients, and a screenshot from this tool will look professionally credible in a way Solar Maps' won't.

### 4. Toggleable techniques without modal dialogs

Show / hide parans, local space, individual planets — all from one sidebar, instant feedback. In the desktop tools, changing what's shown often involves a multi-tab settings dialog and a re-render.

### 5. Built for sharing and embedding (path)

Once the PDF export and embeddable widgets are wired up (Phase E), the tool becomes part of the astrologer's deliverable — branded map in the client report, embedded map on their website. The desktop tools produce maps the astrologer prints and emails as a screenshot. The distribution flywheel here (every client gets a branded export, sees the tool's quality) is straightforward.

### 6. Chart data import and portability

Paste an AstroDataBank-style text block (the format astro.com and many tools export) or a comma-delimited export — or drop a `.txt` / `.csv` — and charts import in bulk, with coordinates and timezone offset read straight from the source. Charts then live in a local library you can switch between, edit, and delete. The desktop tools each have their own database format and limited cross-import; getting a roster of clients in is often manual re-entry.

### 7. Time-based overlays and relationship maps in one view

A single overlay slot sits on top of the natal map and can show **transits**, **secondary progressions**, or **solar-arc directions** — with a date scrubber and a play/pause animation that sweeps the lines across the map over time (cyclocartography). The same slot does **relationship maps**: overlay a second chart's lines, with a bi-wheel and natal↔overlay cross-aspects in the expanded view. Overlay lines reuse the per-planet colors but render dashed so they're never confused with the base chart. Solar Maps is the benchmark for the timed-line work and a separate tool (Maphrodite) for the relationship maps; having both in one interactive web view, sharing the same toggles, is the differentiator.

---

## Honest summary for a pro audience

> "It's a web-based astrocartography tool for practitioners. The map and the live drag-relocation already match or beat Astro Gold's interactivity, and you can geocode any birthplace, resolve its timezone, and import charts in bulk from astro.com-style text or CSV. We compute the ten classical planets, plus the lunar nodes (mean or true, your choice), Black Moon Lilith, Chiron, and the four main asteroids (Ceres, Pallas, Juno, Vesta) — all with Swiss Ephemeris (the same JPL-derived engine as Solar Fire / Astro Gold), running in the browser under AGPL. You can overlay transits, secondary progressions, and solar-arc directions on the map, scrub or animate them over time, overlay a second chart for relationship work, draw the full set of planet-to-planet parans, and switch lines between in-mundo and in-zodiaco. We don't yet have fixed stars (or fixed-star parans) or a hand-curated ACS-grade atlas (we geocode and resolve timezones via tzdb, just not the proprietary historical records) — those are on the roadmap. If your workflow leans on those, you'll still want your existing tool open. If it leans on the ten planets + asteroids/Chiron/nodes, parans, local space, a relocated wheel, transits/progressions, and relationship maps, this can already replace the map portion of your workflow on any device."

Concrete, specific, and doesn't oversell.
