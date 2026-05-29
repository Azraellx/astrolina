# What a Pro Will Notice

A reference for explaining how this prototype compares to Solar Fire / Solar Maps, Astro Gold, AstroZeus, and Matrix Horizons. Written as plain facts — neither apologetic nor boastful — so you can have substantive conversations with practitioners who ask.

The structure: **what we don't do yet** (with the reason and the path to fix), then **what we already do better**.

---

## What we don't do yet

### 1. Ephemeris engine: Moshier, not Swiss Ephemeris

We use the Moshier engine via the MIT-licensed `astronomia` package, running entirely in the browser. Solar Fire, Astro Gold, and most of the desktop tools use Swiss Ephemeris (Astrodienst's port of JPL data).

**Practical impact:**
- Planet positions differ by **~1 arcsecond or less** vs Swiss Ephemeris. That's ~1/3600 of a degree — well below any orb a working astrologer reads with, and invisible at the scale astrocartography lines are interpreted.
- For dates more than ±3000 years from now, Moshier accuracy degrades to a few arcminutes; this is irrelevant for client work.
- **What a pro might catch:** if they pull up the same chart in Solar Fire and zoom to compare planet positions to a tenth of an arcminute, they'll see a tiny discrepancy. They won't see it on the map.

**Path to fix:** swap in Swiss Ephemeris compiled to WebAssembly behind the same function signature. ~1–2 days of work, requires either AGPL acceptance (open-source SaaS) or a one-time commercial license from Astrodienst (~$750).

### 2. Atlas: tzdb-based, not ACS-grade historical curation

Birthplace search uses OpenStreetMap (Nominatim, proxied and edge-cached through a Cloudflare Pages Function), and the timezone / UTC offset is resolved with `tz-lookup` + the IANA `tzdb` via luxon. That stack is excellent for **post-1970** dates and **for North America and Europe**. The app already flags pre-1970 births outside those regions as "uncertain" so the user knows to spot-check.

**Practical impact:**
- For pre-1970 births, especially outside North America and Western Europe, historical DST and local mean time records get spotty. Edge cases: WWII-era European DST changes, 19th-century US births before standard time zones (1883), pre-1949 Chinese local times, etc.
- Solar Fire and Astro Gold license the proprietary **ACS Atlas** (Astro Computing Services), which captures these edge cases by hand-curation across decades.
- **What a pro might catch:** a famous pre-1900 chart calculated 1–4 minutes off, putting the MC line 0.25°–1° off its expected longitude.
- **Note:** imported charts carry their own coordinates and offset, so import sidesteps both the geocoder and tzdb entirely — the source data is authoritative.

**Path to fix:** the "uncertain birth time / location" flag already ships; beyond that, license ACS Atlas data or build an open atlas through user-submitted corrections.

### 3. Parans: only meridian × horizon cases

We compute parans for the four closed-form cases:
- Planet A on **MC** + Planet B on horizon (rising or setting)
- Planet A on **IC** + Planet B on horizon (rising or setting)

These are the "angular" parans that practitioners discuss most often.

**What we don't compute yet:**
- Horizon × horizon parans (one planet rising while another is rising or setting). These require numerical root-finding rather than a closed-form formula.
- Pre-1900 fixed-star parans (Bernadette Brady's work).

**Practical impact:**
- For typical chart reading, the meridian × horizon parans cover the latitudes most practitioners want to discuss. Horizon × horizon parans tend to fall at similar latitudes anyway and add maybe 20% more lines.
- **What a pro might catch:** if they're a Bernadette Brady–trained "Star Phase Astrology" practitioner, they'll immediately ask for fixed-star parans and horizon × horizon parans. We'd need to add those before they could fully replace their existing workflow.

**Path to fix:** add a numerical solver (Newton's method, ~30 lines) for horizon × horizon. Fixed-star parans require a star catalog (e.g., FK6 or Hipparcos with proper motion).

### 4. Chart wheel: Placidus / Whole Sign / Equal selectable; Koch & others not yet

The expanded (large) chart wheel draws all twelve house cusps, switchable between **Placidus**, **Whole Sign**, and **Equal** from the **Calculation** section of the sidebar (default Placidus, which matches Solar Fire and Astro Gold). The four angle axes (ASC/MC/DSC/IC) are drawn as bold diameters regardless of system; intermediate cusps that don't fall on an angle are drawn as spokes (so e.g. Equal's 4th/10th, which float off the meridian, appear correctly). The mini wheel still shows angles only, to stay legible at small size.

**Practical impact:**
- Placidus uses the standard semi-arc time-division (cusps 11/12/8/9 by iteration, the rest by symmetry); it's undefined inside the polar circles (~±66°), where the semi-arc cosine is clamped so the wheel degrades gracefully rather than rendering NaN spokes. Whole Sign keys houses to the rising sign; Equal steps 30° from the Ascendant.
- **What a pro might catch:** practitioners who use Koch, Regiomontanus, Campanus, Porphyry, etc. can't switch to those yet — the selector covers the three most common.

**Path to fix:** add the remaining systems. Porphyry is trivial (trisect the quadrants in longitude); Koch/Regiomontanus/Campanus are a few more lines of the same semi-arc machinery already in `relocate`.

### 5. Line calculation: in-mundo / in-zodiaco toggle ✓ shipped

Both conventions are now available, switchable from the **Calculation** section of the sidebar (default **in mundo**). In mundo uses each body's actual position in the sky (RA/declination — "in space"); in zodiaco projects each body onto the ecliptic plane first (latitude → 0), then draws the line for that projected point. The toggle applies to lines, parans, and local space, and to any active overlay (transits/progressions/synastry) as well; the chart wheel is unaffected since ecliptic longitude is identical either way.

**Practical impact:**
- For planets near the ecliptic (Sun by definition, Mercury, Venus, Mars, Jupiter, Saturn — all within ~3°), the two methods give nearly identical lines.
- For planets with high ecliptic latitude — **Pluto** especially (up to 17° latitude), and **the Moon** (up to 5°) — the two methods diverge noticeably. In a representative chart the projection moves Pluto's MC line ~3° of longitude and the Moon's ~0.5°.
- Astrologers disagree about which method is correct. Most pre-2000 books and tools default to in-zodiaco; in-mundo is increasingly preferred for being "what the sky actually shows." Solar Maps defaults to in-zodiaco — set the toggle to match if cross-checking against it.

### 6. Lunar nodes: mean only, true node deferred

Lunar nodes are computed using the **mean node** formula (Ω = 125.04452 − 0.0529538083 · d, the standard Brown's lunar theory linear approximation). Most desktop tools default to **true node**, which oscillates around the mean position with a ~173-day cycle and ±1.5° amplitude due to the moon's actual orbital wobble.

**Practical impact:**
- For most chart reading, the mean and true node positions agree within a degree, and which one a practitioner uses is a matter of school/tradition.
- **What a pro might catch:** if they cross-check against Solar Fire or Astrodienst and see the North Node 0.5–1.5° off, that's the mean-vs-true difference, not an error.

**Path to fix:** compute true node from the moon's actual orbital position (~30 lines, requires iterating the lunar orbit beyond what astronomia exposes directly).

### 7. Minor bodies: orbital-element ephemerides, not Swiss-grade

For Chiron and the four classical asteroids (Ceres, Pallas, Juno, Vesta), we use **static orbital elements at J2000** with a Kepler-equation solver, rather than Swiss Ephemeris's precomputed positions.

**Practical impact:**
- Accurate to **~0.1°** for ±200 years around J2000 — fine for any living client's birth chart.
- Swiss Ephemeris is accurate to ~1 arcsecond. The 0.1° difference would only be visible if a pro pulled up the same chart side-by-side in Solar Fire.
- **What a pro might catch:** Chiron specifically is in a chaotic orbit (centaur), so over decades the simple Kepler model drifts more than the major planets would. For an 1850 birth chart, Chiron could be off by several tenths of a degree.

**Path to fix:** swap to Swiss Ephemeris (same swap that fixes the planets — both benefit from one change).

### 8. Not implemented: fixed stars, Lilith, Transpluto, other hypotheticals

Still missing:

- **Fixed stars** (Regulus, Algol, Spica, etc.) — wanted by traditional and Bernadette Brady–trained practitioners. Need a star catalog (FK6 or Hipparcos) with proper motion.
- **Black Moon Lilith** (mean or true) — moon's apogee point. Trivial to add (~10 lines for mean).
- **Transpluto** and other hypothetical bodies (Vulcan, Cupido, Hades, etc.) — deliberately omitted because there's no consensus ephemeris. Different schools publish different positions.
- **Centaurs beyond Chiron** (Pholus, Nessus, Chariklo) — same orbital-element approach would work; not enough demand to justify yet.

### 9. Not implemented (and explicitly deferred to v2)

These are in the roadmap but intentionally out of scope for the prototype:

- **Composite and midpoint maps** — Davison or composite chart projected as ACG lines. (Synastry — two charts overlaid — already ships; see "What we already do better" below.)
- **Vedic / sidereal mode** — tropical only at the moment. Vedic astrocartography is barely served by any tool, which is a real opportunity.
- **Embeddable widgets** — so an astrologer can drop a map into their own website.
- **Server-side PDF rendering** — export currently relies on the browser, fine for prototype but limited for branded high-quality exports at scale.

Note: **cyclocartography** (transits, secondary progressions, and solar-arc directions plotted on the map), **time animation** (a date scrubber that sweeps the lines, with play/pause), and **relationship maps** (a second chart overlaid as a bi-wheel with cross-aspects) were on this list and have since shipped.

---

## What we already do better than the incumbents

These are the things a pro will notice immediately in the other direction — they're the reason a B2B product can win on UX even before reaching feature parity.

### 1. Platform-agnostic and instant

No install, no Windows-only restriction, no "Mac users open Astro Gold, PC users open Matrix Horizons." A URL works on any device — phone, tablet, client's laptop during a reading. Solar Fire is Windows-only and looks it. Astro Gold is Mac/iOS only. AstroZeus is desktop-bound.

### 2. Live drag-relocation with the relocated wheel inline

Astro Gold pioneered live drag-relocation on the map — it's their headline feature. We match it, plus we show the **relocated chart wheel updating in real time next to the map**. In the desktop tools, viewing the relocated wheel requires switching to a separate window (or opening Solar Fire). Eliminating that switch is one of the main goals of this product.

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

> "It's a web-based astrocartography tool for practitioners. The map and the live drag-relocation already match or beat Astro Gold's interactivity, and you can geocode any birthplace, resolve its timezone, and import charts in bulk from astro.com-style text or CSV. We compute the ten classical planets, plus mean lunar nodes, Chiron, and the four main asteroids (Ceres, Pallas, Juno, Vesta). The planets use VSOP87 / Meeus (accurate to ~1 arcsecond, invisible on the map); the minor bodies use static orbital elements (accurate to ~0.1° within ±200 years of J2000). You can overlay transits, secondary progressions, and solar-arc directions on the map, scrub or animate them over time, overlay a second chart for relationship work, and switch lines between in-mundo and in-zodiaco. We don't yet have fixed stars, true node, Lilith, house systems beyond Placidus / Whole Sign / Equal, Swiss-grade ephemeris, or a hand-curated ACS-grade atlas (we geocode and resolve timezones via tzdb, just not the proprietary historical records) — those are on the roadmap. If your workflow leans on those, you'll still want your existing tool open. If it leans on the ten planets + asteroids/Chiron/nodes, parans, local space, a relocated wheel, transits/progressions, and relationship maps, this can already replace the map portion of your workflow on any device."

Concrete, specific, and doesn't oversell.
