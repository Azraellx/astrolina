# Calculation Methods

This note documents the calculation conventions AstroLina uses, in plain astrological terms: the ephemeris and the bodies it computes, how the map lines are placed, parans, the relationship charts (Davison and composite), house systems, the Geodetic ("Mundane") line mode, and the Progressions & Directions overlays. The underlying positions come from the Swiss Ephemeris, the same engine the professional desktop tools use, reading genuine JPL DE441 data, with agreement to those tools well under an arcsecond (see the companion [About](about.md) page). The planetary accuracy is therefore settled; what these notes lay out is which *conventions* were chosen, so it is always clear what the map is showing.

## Ephemeris engine & data

All astronomical positions come from the **Swiss Ephemeris** (Astrodienst's port of JPL data), compiled to WebAssembly via `@swisseph/browser` and running entirely in the browser under the AGPL-3.0 license. The self-hosted compressed data files (`.se1`) live in `public/ephe/` and total about 2 MB.

**Bodies computed:** the ten classical planets (Sun through Pluto); the lunar nodes (mean or true, selectable); Black Moon Lilith (mean lunar apogee); Chiron; and the four classical asteroids (Ceres, Pallas, Juno, Vesta). Chiron and the asteroids read from the bundled `seas_18.se1` file and are accurate to roughly an arcsecond, including Chiron's chaotic centaur orbit.

**Date range and fallback.** The bundled data covers **1800–2399 AD**, and the birth-data form accepts years **1800–2200**. This is a download-size choice, not an engine limit (the Swiss Ephemeris itself spans roughly 13201 BC to 17191 AD). Outside the bundled window the planets and Moon fall back automatically to Swiss's built-in **Moshier** model, so the Sun through Pluto, the lunar nodes, and Lilith resolve for any date. The asteroids have no such fallback: each 600-year block is a separate file, so for a date outside coverage the asteroids are silently dropped (the rest of the chart still computes) rather than raising an error. A chart imported with a pre-1800 date therefore still draws its planets, nodes, and Lilith, but omits its asteroids.

**Calendar.** Dates before the Gregorian reform are cast on the **Julian** calendar (Julian 4 October 1582 was followed by Gregorian 15 October 1582), the conventional handling. Otherwise a pre-1582 birth would land about ten days off, shifting the Sun by roughly ten degrees.

## Astronomical conventions

These are the physical conventions every line, paran, and readout shares. They match standard astrocartography practice (the Jim Lewis maps and the professional desktop tools):

- **Geometric horizon, no refraction.** A rising/setting line marks where the body's true (airless) altitude is exactly 0°. Atmospheric refraction, which lifts the *visible* rise a few minutes earlier, is deliberately not applied — astrological angularity is geometric, not optical.
- **Geocentric body centers.** Positions are Earth-centered. For the planets the difference from an observer on the surface is arcseconds; for the **Moon** it can reach a degree (her parallax), so the Moon's ASC line is the geocentric convention's line, not the place you would *watch* moonrise at that instant. This is the standard ACG convention.
- **Apparent positions, frame of date.** All positions are apparent (light-time and aberration applied), referred to the true equator and equinox of date; the sidereal-time reference is Greenwich **apparent** sidereal time and the obliquity is the **true** obliquity of date. One consistent frame end to end — mixing in a mean value anywhere would skew conversions by the ~9″ nutation terms.
- **Universal Time in, ΔT inside.** The birth moment is converted to a Universal-Time instant; the Swiss Ephemeris applies the ΔT correction to its internal dynamical timescale itself. (Verified against JPL Horizons via the Moon, the fastest hand on the clock.)
- **Stations.** A body is flagged *stationary* when its longitude motion reverses sign within about a day on either side of the chart moment — a bracket in time, not a speed threshold, so the slow outer planets aren't "stationary" year-round.
- **Out of bounds.** The declination threshold is the **Sun's maximum declination — the true obliquity at the chart's moment** (≈23°26′), not a hard-coded constant: a fixed value sitting below the real obliquity would absurdly flag the Sun itself as out-of-bounds for a couple of days around each solstice. (Some tools use a fixed 23°26′, 23°27′, or ~23°28′; the spread between those published constants is larger than the fixed-vs-of-date difference.)
- **Local space geometry.** Azimuth lines are great circles on a spherical Earth (radius 6371 km); the ellipsoid is not modeled, consistent with the astrological local-space literature.

## Time zones & historical births

The birth form detects the IANA time zone from the birthplace and resolves its DST-aware offset at the birth moment (the same tz database browsers and operating systems use — including the historical record: first-generation US DST in 1918, Britain's wartime double summer time, half-hour zones, Lord Howe's 30-minute DST, Nepal's 1986 switch to +5:45, and seconds-precision legal standards like Paris Mean Time all resolve correctly).

- **Births before standard time (LMT).** Before a region adopted a standard time, clocks kept **local mean time**. The tz database carries only its reference city's mean time for that era (all of Germany before April 1893 reads as Berlin's +0:53:28), so AstroLina substitutes the **birthplace's own** mean time — longitude ÷ 15 — exactly as the astrological atlases do. Einstein's Ulm 1879 chart thus gets Ulm's +0:39:57 (the atlas value "m9e59"), not Berlin's. The boundary dates come from the tz database source itself (see `npm run build:lmt`), because they can't be inferred from offsets alone: France's *legal* Paris Mean Time (1891–1911) equals Paris LMT to the second and is correctly kept. If you pick a zone **manually** for an LMT-era birth, the zone's reference-city value is used as given and the chart is flagged for verification.
- **DST edge cases.** A birth time falling in a spring-forward gap (a clock time that never existed) resolves to the post-gap offset; a time in the fall-back overlap (a clock time that happened twice) takes the **earlier** pass (still on DST). Birth records that straddle these edges deserve a source check either way.
- **The "verify DST" flag.** Pre-1970 births outside the regions with well-digitized DST history (the Americas, Europe, Hawaii) are flagged so the offset can be checked against an atlas, as are manually-picked zones in their LMT era. Note that regional time practice in the late 19th century (railway times, observatory times) is modeled at tz-database granularity; for rectification-grade work on 19th-century charts, consult a historical atlas.

## How the lines work (quick model)

An astrocartography line is the set of places on Earth where a chosen body sits exactly on one of the four chart angles at the chart's moment. Each body draws its own four lines: **MC** (the body culminating on the upper meridian), **IC** (the lower meridian, always the exact antipode of the MC), and **ASC / DSC** (the body on the eastern/western horizon, rising/setting). MC and IC lines are straight north–south meridians (lines of constant geographic longitude); ASC and DSC lines are the curves traced as the body's hour angle sweeps out. Each body also gets a **zenith** (sub-planetary) stamp: the single point where it stands exactly overhead, sitting on the MC line at the latitude equal to the body's declination.

The **lunar nodes** are the one exception, because the North and South Node are exact antipodes: a South Node line falls precisely on a North Node line with the angle swapped (North Node MC = South Node IC, North Node ASC = South Node DSC, and so on). So when **only one** node is shown it draws its four lines normally, in its own colour; when **both** are shown the coincident lines are **fused into a single two-toned line** labelled for both nodes, rather than drawn twice on top of each other — on the natal chart a solid line split half North-Node colour / half South-Node, and on a time overlay (whose lines are dashed) the same two colours interleave as alternating dashes. **Parans** follow the same idea: with both nodes shown, each South-Node paran (which coincides with a North-Node one) is dropped so the nodal-axis paran is drawn once. In **local space** the two nodes are opposite directions of one axis, so both are kept and labelled at their own ends. Neither node gets a zenith stamp, being an abstract ecliptic point rather than a body that stands overhead anywhere; both still appear as points in the chart wheel, where they are not redundant.

In the standard ("Celestial") map, the longitude of each angle is driven by sidereal time: a body's meridian longitude equals its right ascension minus Greenwich *apparent* sidereal time. That single sidereal-time reference is what ties the whole map to the chart's exact moment.

## Parans

The app computes all **planet-to-planet** parans:

- **Meridian × horizon:** planet A on the **MC** or **IC** while planet B is on the horizon (rising or setting).
- **Horizon × horizon:** both planets on the horizon together, in any rising/setting combination. This is solved in closed form rather than by iteration: the two-on-the-horizon condition reduces to a linear equation in the local sidereal time, `cos(θ − raA) = k · cos(θ − raB)` with `k = tan(decA) / tan(decB)`, giving two latitudes per pair.

**Latitude band.** Paran rows are listed to **±72°** of latitude, while the angle lines themselves draw on to ±85°: rising/setting geometry degrades toward the circumpolar zone, so in the 72°–85° band you may see two lines visibly cross with no paran row for the crossing.

**The intersection point.** Each paran's badge offers a fly-to target — the spot where planet A's meridian (or its own horizon curve) crosses the paran latitude. That point follows the same meridian mapping as the drawn lines, so it lands on the visible crossing in both the Celestial and the Geodetic ("Mundane") line systems; the paran *latitudes* themselves are identical in both systems, since the two bodies' mutual geometry doesn't depend on how meridians map to longitudes.

**Fixed-star parans** (star × planet) are computed with the same closed forms, using each star's proper-motion-corrected, precessed position of date — a star culminating while a planet rises, and every other mundane combination. They are computed but not drawn as map lines: a bright-set catalog times the planet set yields hundreds of latitude rows (which would bury the map), and the conventional reading — Bernadette Brady's school, the classic ACG latitude-crossing listings — is a per-location list anyway. Star-to-star parans are not computed.

## Local space

Local-space lines are compass bearings: each body's line leaves the **origin** — the placed pin by default (relocated local space), or the birthplace via the Origin setting — at the body's azimuth, and is extended as a **great circle** (not a rhumb line: a constant-compass course would miss the body's sub-point by thousands of kilometres, while the great circle passes exactly through it, which is what the line labels' click-to-fly relies on). Each body draws two halves, *out* toward the body and *in* the opposite way (the inbound half can be hidden), on a spherical Earth.

Local space always uses each body's **true** sky position (actual RA and declination), regardless of the **In Zodiaco** / **Mundane** projection toggle — it is inherently a true-sky technique, so it doesn't inherit the ecliptic projection the rest of the linework applies. (Projecting an off-ecliptic body onto the ecliptic first would skew its bearing — roughly 3.7° for high-latitude Pluto.) The map lines and the Advanced table's azimuth column therefore agree. Local space is **not drawn in Mundane (Geodetic) mode**: that mode is time-independent while local space needs the specific birth moment, so the two are incompatible (Solar Maps withholds local space in geodetic mode for the same reason); switching to Mundane closes the Local Space view.

## Zodiac mode (Tropical vs Sidereal)

The **Advanced ▸ Zodiac** setting reads the chart in the **tropical** zodiac
(the default: 0° Aries pinned to the March equinox) or a **sidereal** one
(signs pinned to the fixed stars), offset by the chosen **ayanamsa**:
**Lahiri** (the Indian national standard) or **Fagan/Bradley** (the Western
sidereal standard).

Conventions:

- **Display layer only — the map lines never move.** An astrocartography line
  marks where a body is physically angular, a zodiac-independent event, so the
  same lines serve both zodiacs. What shifts is every *reading*: the wheel's
  sign ring, degree·sign·minute readouts, the coordinate readout, element and
  modality tallies, essential dignities, and the eclipse-degree readout.
- **Ayanamsa math.** The bundled Swiss wrapper exposes no sidereal API, so the
  ayanamsa is computed in-app: each mode anchors the Swiss Ephemeris epoch
  value (mean-equinox referred) and accumulates IAU-2006 general precession in
  longitude. Agreement with the genuine Swiss values is sub-arcsecond for both
  modes across 1800–2399 (≤ 0.1″ Lahiri, ≤ 0.4″ Fagan/Bradley) — far below the
  arcminute readout grain (verified by `npm run verify:ayanamsa` against
  `@swisseph/node`).
- **Each ring uses its own epoch's ayanamsa.** The sidereal frame rides the
  stars, so the natal ring shifts by the ayanamsa at birth and an overlay ring
  (transits, progressions) by the ayanamsa at the overlay date — the standard
  sidereal practice, and why sidereal transit contacts differ from tropical
  ones by the natal point's precession since birth.
- **Whole Sign houses are rebuilt, not offset**: in sidereal mode their cusps
  are the sidereal sign boundaries starting at the sidereal Ascendant's sign.
  Equal and the quadrant systems shift uniformly (their geometry is
  zodiac-independent).
- **Geodetic (Mundane) is tropical-only and unavailable in sidereal mode** —
  that technique maps the *tropical* zodiac onto Earth's longitudes by
  definition here (see the Geodetic section's conventions); a sidereal-geodetic
  variant would be a separate convention. So the Geodetic option is hidden and
  the line frame falls back to Celestial whenever a sidereal zodiac is active.
- The equatorial/horizontal tables (RA, declination, azimuth, altitude) read
  identically either way, and WITHIN one chart aspect orbs are unchanged (a
  uniform shift cancels in every separation). CROSS-chart separations — the
  bi-wheel's overlay-to-natal aspects — differ from tropical by the precession
  between the two epochs, which is precisely the per-epoch convention's point.
- **The eclipse Contacts list reads in the active zodiac**, per-epoch like every
  other overlay: the eclipse degree shifts by the ayanamsa at the eclipse moment
  and the natal points by the ayanamsa at birth, so in sidereal mode an
  eclipse-to-natal contact (3° orb) differs from the tropical one by the
  inter-epoch precession — and now agrees with the bi-wheel's cross-aspect orb
  for the same pair (the two disagreed when contacts were frozen to tropical).

## Relationship charts (Davison & Composite)

The Synastry overlay's **Generate** button turns the active chart + partner into
a relationship chart by one of two methods, saved to the library with the
"Space" place tag.

**Davison** is a real chart: the arithmetic mean of the two births in Universal
Time, cast at the geographic midpoint of the birthplaces (simple mean latitude;
shorter-arc mean longitude). Everything about it — positions, angles, houses,
overlays — is ordinary natal math.

**Composite (midpoints)** has no real moment. Its conventions here:

- **Planets** sit at the **shorter-arc midpoint** of the two charts' zodiacal
  longitudes, **on the ecliptic** (latitude zero, so In Mundo and In Zodiaco
  coincide). An exactly-opposed pair (no shorter arc) takes the side nearer the
  composite Sun. Bodies resolve only when both parents can compute them, and
  the lunar nodes follow the sidebar's mean/true setting; the South Node
  midpoint stays exactly antipodal to the North Node midpoint by construction.
- **The wheel angles and houses** use the **midpoint method à la Robert Hand**:
  every angle and house cusp is the **shorter-arc midpoint of the two parents' own
  angles/cusps** (each cast at its own parent's place). So the composite
  **Ascendant** is the exact midpoint of the two natal Ascendants and the composite
  **Midheaven** is the exact midpoint of the two natal Midheavens — both read true
  on the wheel (matching Solar Fire / Hand). Opposite points are kept exact
  (`Ds = As + 180°`, `Ic = Mc + 180°`), and the cusp midpoints keep cusp 1 = Asc
  and cusp 10 = MC for quadrant systems.
- **The map frame** (which fixes every MC/IC/ASC/DSC line, parans, and local space)
  is a single sky-frame — one RAMC — **anchored on the Midheaven**: the instant
  whose Greenwich sidereal time culminates the composite MC at the geographic
  midpoint. Because the MC↔RAMC mapping carries no latitude term, the map is fixed
  by sidereal time alone. From one RAMC the Ascendant and Midheaven are not
  independent, so **no single frame can place both on their midpoints**: the map is
  anchored on the MC, so its meridian **MC/IC lines pass through the wheel's
  Midheaven, but its ASC/DSC lines do not pass through the wheel's Ascendant** (the
  unavoidable cost of the midpoint angles not forming one coherent sky-frame). The
  frame is realized as a real stored moment, so the map pipeline treats a composite
  like any chart; only the planet positions and the wheel angles are overridden.
  (An earlier method derived *both* angles from the midpoint of the two charts'
  Greenwich sidereal times, producing composite angles unrelated to the partners'
  own; it is no longer used.)
- **The reference place** is the same geographic midpoint Davison uses,
  labeled "Space".
- **Time overlays** over a composite are limited to **Transits and Eclipses**
  (see "Forecasting overlays on relationship charts" below): the transiting or
  eclipse body is real and forms a genuine current-sky contact with the composite
  positions — a composite "solar return" is the transiting Sun back on the
  composite Sun. The progression/direction techniques (secondary & tertiary
  progressions, solar arc, primary directions, cyclocartography) and the Synastry
  overlay are disabled on a composite: a midpoint construct has no real moment to
  advance.
- **No motion**: composite points have no speed, so retrograde/station badges
  don't apply.

## Forecasting overlays on relationship charts

Which forecasting overlays are valid depends on whether the relationship chart is
a real moment. A forecasting technique is only as sound as the underlying
astrological technique it maps; an astrocartography line is just the geographic
projection of a chart factor, so projecting an incoherent technique onto a map
does not make it valid.

- **Davison** is a real chart — a real averaged moment in real time — so it can
  be legitimately progressed and directed, exactly like a natal chart. It keeps
  the **full overlay set**: Transits, Eclipses, Secondary & Tertiary
  Progressions, Solar Arc, Primary Directions, and Cyclocartography.
- **Composite (midpoints)** is a symbolic midpoint construct with **no real
  moment**, so progressions, solar arc, and primary directions have no real
  referent to advance — they could only be faked by borrowing a real moment,
  which AstroLina declines to do. A composite therefore supports **Transits and
  Eclipses only**: the transiting/eclipse body is real and forms a genuine
  current-sky aspect to the composite points regardless of whether those points
  correspond to a real moment. The Synastry overlay is likewise disabled on a
  composite.

Therefore: Davison supports the full overlay set; composite supports Transits and
Eclipses only. This is a deliberate accuracy-first design stance.

## House systems

The expanded chart wheel draws all twelve house cusps in any of **ten** systems, switchable from the **Advanced** section of the sidebar (houses shape the wheel only — no map line moves with this setting): **Placidus** (the default), **Koch**, **Regiomontanus**, **Campanus**, **Porphyry**, **Alcabitus**, **Meridian**, **Morinus**, **Whole Sign**, and **Equal**. All are computed natively by the Swiss Ephemeris, including polar-circle behaviour for the quadrant systems.

The two **axial** systems divide the celestial equator into equal 30° arcs from the MC's right ascension: **Meridian** projects them onto the ecliptic along hour circles, **Morinus** along circles through the ecliptic poles. In both, the **1st cusp is an East Point, not the Ascendant** — the rising degree floats free of the cusps, exactly as the angles already do in Equal and Whole Sign. Their reward is robustness: both stay fully defined at every latitude (Morinus references neither Ascendant, MC, nor Vertex at all), which makes them the systems of choice for polar-latitude charts, where the quadrant systems degrade.

The four angle axes (ASC/MC/DSC/IC) are drawn as bold diameters regardless of system; intermediate cusps that don't fall on an angle are drawn as spokes, so a system like Equal (whose 4th and 10th float off the meridian) renders correctly. The mini wheel shows the angles only, to stay legible at small size.

### The Vertex axis (Vx / Avx)

The **Vx** and **Avx** toggles sit with the line filters (below As/Ds) and behave exactly like the four classical angles, on the map and in the chart alike — both default off. The Vertex is the **prime vertical** (the great circle through due east, the zenith, and due west) taken on the **western** side; the **Anti-Vertex** is its eastern counterpart.

- **On the map**, a body's **Vx line** joins every place where that body stands exactly on the local prime vertical's western crossing (the Avx line its eastern) — curves traced by `tan(lat) = tan(dec)/cos(H)`, the prime-vertical counterpart of the rising/setting equation, drawn a touch thinner than the ASC/DSC lines and badged Vx/Avx at the viewport edge. Each curve runs from the body's zenith point to its antipode, spiking poleward a quarter-turn from the zenith. Every vertex is verified to sit exactly on the prime vertical, west or east as labelled.
- **In the chart**, the same toggles add the relocated chart's **Vertex point** (the ecliptic ∩ prime-vertical intersection, the Swiss Ephemeris value — its axis verified against Robert Hand's closed form, its western branch from the point's azimuth) to the wheel marks, the readout list, and the Advanced table. As with rising lines vs the rising degree, the body's Vx **line** is an in-mundo event, while the chart's Vertex **point** is its ecliptic reading; In Zodiaco projection aligns the two conventions.

One geometric caution: near the **equator** the prime vertical approaches the celestial equator, so the chart Vertex collapses toward an equinox point (0° Aries / 0° Libra) and moves erratically as sidereal time advances — the same family of degeneracy the Ascendant suffers near the poles, mirrored into the tropics (the horizon at 80°N is the prime vertical at 10°S). Tropical-latitude Vertex readings deserve the same skeptical eye as polar-latitude house cusps. On the bi-wheel, the Vertex is marked on **both** rings: the natal Vertex and a **directed** Vertex point. The directed one is re-derived from the **advanced RAMC** (the RAMC that culminates the directed MC) — not by adding the arc to the natal Vertex's longitude, which has no declination to hold and would misplace it — so it tracks the directed angles (the MC advancing ~1°/yr) in both the longitude and RAMC frames. Keeping the natal Vertex alongside keeps the equator caution above in view. On the **map**, a directed overlay's per-body Vx/Avx **lines** are unchanged — still drawn from the directed bodies, exactly like the directed MC/ASC lines.

### Houses at extreme latitudes

Above the polar circles (beyond about ±66.5°) house division gets genuinely ambiguous: the Ascendant has two competing definitions (the *eastern* horizon–ecliptic intersection vs the *ascending* node of the ecliptic on the horizon), the MC two (the *southern* meridian intersection vs the one *above the horizon*), and the definitions stop agreeing. The conventions here are inherited from the Swiss Ephemeris:

- **Placidus and Koch are undefined** at such latitudes (some cusps never rise or set). When that happens the cusps are computed with **Porphyry** instead — the documented Swiss Ephemeris fallback — so a chart relocated to Svalbard still renders, and the wheel shows a caution under its title so the substitution is never silent. The angles themselves (ASC/MC/DSC/IC) are house-system-independent and unaffected.
- The returned **Ascendant is the eastern intersection**, which inside the polar circles can be the *descending* node of the ecliptic (and can sit west of the MC); Regiomontanus and Campanus flip the MC to its above-horizon branch, while Porphyry, Alcabitus, Equal, and Whole Sign keep the southern one. Cusp sequences from the quadrant systems can run backward through the zodiac there. None of this is an error — it is what these systems *are* at polar latitudes — but intermediate cusps polewards of the circles deserve a skeptical eye.
- **Equal houses** degenerate for an instant exactly *on* the polar circles, where once a day the horizon momentarily coincides with the ecliptic; this affects only that infinitesimal band and moment, not practice.
- **Meridian and Morinus stay clean polewards** — both are defined at every latitude with cusps in regular zodiacal order (verified against Robert Hand's published 80°N cusp tables to well under an arcminute), so they are the natural choice for polar charts.
- The **map lines** never use houses and are exact at every latitude.

## Geodetic ("Mundane") lines

### What it is & when to use it

"Mundane" mode switches the entire map from standard astrocartography to **Sepharial's geodetic equivalents**. Instead of placing each angle by the clock-and-sidereal-time of the birth, it anchors every angle to the Earth's longitudes through the zodiac itself, so the map becomes *independent of birth time*. Use it when you want to read a chart's planets against a fixed zodiacal grid laid over the globe, the classic geodetic technique, rather than against the moment-specific sidereal map.

### Convention chosen (Sepharial zodiacal; Greenwich = 0° Aries)

The placement rule is simple to state: **a planet's MC meridian falls on the Earth-longitude whose number equals the planet's zodiacal longitude**, with the Greenwich meridian fixed at 0° Aries and longitude counted eastward as positive. Worked around the globe:

| Zodiacal longitude | Earth meridian |
|---|---|
| 0° Aries | Greenwich (0°) |
| 0° Cancer (90°) | 90° East |
| 0° Libra (180°) | 180° (date line) |
| 0° Capricorn (270°) | 90° West |

So a planet at, say, 15° Taurus (45° of zodiacal longitude) culminates over 45° East, regardless of what time the chart was set for.

### The rule / how a line is placed

The two systems differ in exactly one step, how a meridian's right ascension becomes a geographic longitude:

- **Celestial (standard):** longitude = right ascension − Greenwich apparent sidereal time. Time-dependent.
- **Mundane (geodetic):** longitude = the zodiacal longitude that corresponds to that right ascension, with no sidereal-time term at all.

Precisely, the geodetic longitude is `λ = atan2(sin α, cos α · cos ε)`, where α is the right ascension and ε the obliquity of the ecliptic; that is, the ecliptic longitude (at zero latitude) whose right ascension is α. This is applied to the body's right ascension *after* it has been projected onto the ecliptic (latitude zeroed); the projection and this conversion together recover the body's zodiacal longitude. With Greenwich pinned at 0° Aries, that longitude *is* the geographic longitude of the meridian. IC is still MC + 180°, and ASC/DSC still meet cleanly at their shared apex and nadir, in both systems.

### Scope: what switches, what stays celestial

**Switches to geodetic** when Mundane is on: all four angles (MC/IC meridians and ASC/DSC horizon curves), the zenith sub-points, the ecliptic reference line on the map, and the timeline/overlay layer. A directed overlay drawn while Mundane is active uses the geodetic mapping too: its angle meridians are placed by the same conversion, evaluated at the overlay date's obliquity.

**Keep the celestial sidereal-time reference** even in Mundane: **parans** and **local space**. Their *placement* is intrinsically tied to the rotating sky at the birth moment (they read the Greenwich apparent sidereal-time reference directly), so that handle is deliberately left in the celestial frame rather than forced onto a time-independent grid. This is not a clean split, though: in Mundane mode parans and local space are built from the same ecliptic-projected (zero-latitude) body positions as the angle lines. So while their placement frame stays sidereal-time-based, off-ecliptic bodies (Pluto, the Moon) still shift versus a true-sky celestial map. The overlay's parans and local space behave the same way: sidereal placement on ecliptic-projected positions, not a full geodetic mapping. This hybrid behaviour is noted under Conventions below.

### Why off-ecliptic bodies are projected (and why In Mundo/In Zodiaco is hidden)

For the MC to land *exactly* on a planet's zodiacal longitude, the planet must be read on the ecliptic. So in Mundane mode every body is first projected onto the ecliptic (its ecliptic latitude is set to zero) before its lines are drawn. After this projection the round-trip is exact and the MC sits precisely on the zodiacal degree. Because this projection is built into Mundane mode by definition, the separate **In Mundo / In Zodiaco** "Line projection" control (which only matters in Celestial mode) is hidden when Mundane is selected: there is no "In Mundo" choice to make once everything is already on the ecliptic. The difference this makes is largest for the high-latitude bodies, Pluto (up to ~17°) and the Moon (up to ~5°), whose rising/setting curves and zenith move relative to their true-sky (In Mundo) geometry. Because parans and local space also consume these projected positions, they shift for the same bodies even though their placement stays celestial.

### How to turn it on

Open the sidebar and click the **Calculation** header to expand it (the sidebar shows one section at a time, and **Filters** is open by default). The first radio group at the top of Calculation offers **Celestial** and **Mundane**; choose **Mundane**. The hint under it reads: *"Geodetic mapping: the zodiac mapped onto Earth's longitudes (Greenwich = 0° Aries), independent of birth time."* Once Mundane is chosen, the **In Mundo / In Zodiaco** "Line projection" control disappears from the same panel (everything is already on the ecliptic). The choice is remembered between sessions.

### Conventions used

- **Reference frame.** The math uses the *true obliquity of date*, Greenwich *apparent* sidereal time, and apparent positions (apparent rather than mean sidereal time differs by ~0.004°, which slightly shifts every meridian).
- **Greenwich = 0° Aries.** This is the Sepharial zodiacal convention; a competing scheme (often credited to L. Edward Johndro) anchors Greenwich differently. The app uses Sepharial-zodiacal, labelled "Mundane".
- **Projecting off-ecliptic bodies.** Forcing every body onto the ecliptic makes the MC exact, but it computes Pluto's and the Moon's ASC/DSC and zenith from their zero-latitude positions rather than their true-sky positions. This is intended for the angles other than MC/IC.
- **The ecliptic reference line.** In Mundane mode the ecliptic reference circle on the map follows the geodetic mapping.
- **Hybrid frame for parans.** In Mundane mode parans are built from ecliptic-projected (zero-latitude) bodies. Paran *latitudes* are identical in both line systems, and each paran's recorded intersection point follows the drawn lines' meridian mapping, so its badge lands on the visible crossing in either mode. (Local space is not shown in Mundane mode — see **Local space** — so it has no hybrid-frame behaviour here.)
- **Tropical, not sidereal.** The geodetic MC lands on the *tropical* zodiacal longitude; no ayanamsa offset is applied.

## Progressions & directions

These are chosen from the top-bar **Overlay** menu (None, Transits, Progressed, Solar Arc, Primary Directions, Synastry); "Progressed" is secondary progressions. Selecting one of the time-based modes (Progressed, Solar Arc, Primary Directions, Transits) draws a second, tagged set of lines over the natal map and reveals a timeline bar to set the target moment; Synastry adds its own line-set but has no timeline (there is no date to scrub). Two dropdowns in the **Calculation** tab choose the underlying method: **Chart angle progression** (drives Solar Arc + Progressed) and **Primary directions rate** (drives Primary Directions).

### Chart angle progression (drives Solar Arc + Progressed)

The solar arc itself is the progressed Sun's distance from the natal Sun (the day-for-a-year secondary-progressed Sun), measured either along the ecliptic or in right ascension; Naibod methods substitute a mean solar rate instead. On the map, **Solar Arc** advances every natal body by the arc (so the directed angles move with the bodies); **Progressed** keeps the day-for-a-year progressed planets and uses the setting only to decide how the chart angle (the RAMC) advances.

| Method | On Solar Arc directions | On Secondary Progressions |
|---|---|---|
| **SA in Longitude** | Each body advanced by the true solar arc, measured in ecliptic longitude (the classic default) | Angles advanced by the true solar arc in longitude |
| **SA in RA** | Each body advanced by the true solar arc, measured in right ascension | Angles advance the RAMC by the true solar arc in RA (`RAMC + arc`) |
| **Naibod in Long** | Each body advanced by the Naibod mean rate (0.985647°/yr), in longitude | Angles advanced by the Naibod arc, in longitude |
| **Naibod in RA** | Each body advanced by the Naibod mean rate, in RA | Angles advance the RAMC by the Naibod arc (`RAMC + arc`) |
| **Natal Frame** *(default)* | *No distinct natal-frame solar-arc → behaves as SA in Longitude* | Angles hold the natal RAMC: the progressed planets read against the birth chart's angular frame (the true quotidian progressed angle — the progressed chart's own sidereal time — is a planned option) |

**The default is Natal Frame, and it deliberately changes nothing:** it preserves exactly the behaviour that existed before this dropdown was added. On Secondary Progressions the angles hold the natal RAMC — the progressed planets fall through the birth chart's angular frame, consistent with the Transits overlay's default — and on Solar Arc it behaves as **SA in Longitude**. So an astrologer who never opens the dropdown gets SA-in-longitude on the Solar Arc map and natal-framed progressions, the prior defaults. (This option was labelled "Mean Quotidian" until the June 2026 audit; the label promised progressed-angle motion the overlay deliberately doesn't perform. The true quotidian progressed angle — the progressed chart's own sidereal time — remains a planned option.)

### Primary Directions

Primary Directions here model the **primary (diurnal) motion**: the daily rotation of the heavens carries the chart's angles forward, while the planets themselves stay at their natal places in the sky (natal right ascension and declination unchanged). The *rate* you choose is the time-key, how much arc accrues per year of life. As that arc is applied, the directed RAMC advances and **the entire set of lines rotates rigidly with it**: a positive arc directs forward, the RAMC increases, and every line shifts **west** by the same amount. (This is an angle-only treatment, a rigid rotation of the line-set by an arc-per-year key, not a classical promissor-to-significator mundane direction with latitude.)

| Rate (key) | Arc per year |
|---|---|
| **Ptolemy (1°/yr)** *(default)* | 1° per year (one degree, one year) |
| **Naibod (59′08″/yr)** | 0.985647° per year (the Sun's mean motion) |
| **Cardan (59′12″/yr)** | 0.986667° per year |
| **Solar Daily Motion (RA)** | Kepler's key — the natal Sun's daily motion in right ascension × years |
| **Solar Daily Motion (Longitude)** | The natal Sun's daily motion in ecliptic longitude × years |
| **True Solar Arc (RA)** | The true secondary-progressed solar arc in RA (nonlinear with time) |
| **User rate** | Your own degrees-per-year value |

The default is **Ptolemy (1°/yr)**. Choosing **User rate** reveals a number field directly below for entering your own degrees-per-year (positive values only; default 1).

### How to use both

1. From the top bar, open **Overlay** and choose **Progressed**, **Solar Arc**, or **Primary Directions**.
2. A **timeline bar** appears across the bottom; drag it to set the target date.
3. In the sidebar **Calculation** tab, set **Chart angle progression** (for Progressed/Solar Arc) or **Primary directions rate** (for Primary Directions). Each shows a hint describing the selected method.
4. The overlaid lines are tagged with a two-letter prefix: **Sp** secondary progressions, **Sa** solar arc, **Pd** primary directions (e.g. "Pd ♂ MC"), alongside **Tr** transits and **Sy** synastry. Cyclo·carto·graphy tags each feature by its actual source — **Sp** on the progressed personal planets (Sun–Mars), **Tr** on the transiting outers — and reserves **Cy** for a paran that pairs one of each.
5. The timeline's readout shows the directed amount: **Progressed** shows "Age N.N"; **Solar Arc** and **Primary Directions** show the arc in degrees (e.g. "30.2°").

All three settings are remembered between sessions.

### Bi-wheel angle marks & the directed-overlay representation

With an overlay active, the expanded chart wheel becomes a bi-wheel (natal inner ring, overlay outer ring). Two implementation notes from this layer:

- **Overlay MC/IC/AS/DS marks.** The outer ring marks the overlay chart's own four angles (with the same degree·sign·minute readout as the natal ring), gated by the same MC/IC/ASC/DSC filter toggles. For the overlays with a genuine second moment (**Transits, Synastry**) the angles come straight from `relocate(jd, …)` at the active point. For the **directed and progressed** overlays (**Solar Arc, Primary Directions, Progressed**) the angles are **inferred**: the relocated *natal* angles are advanced by the overlay's arc (ecliptic longitude for the "…in Long" methods; **`RAMC + arc`** — the arc added to the RAMC, the angle re-derived on the advanced meridian — for the "…in RA" methods and Primary Directions; no advance at all under the Natal Frame default), so the wheel's angle marks and the map's frame always agree. `MC + 180° = IC` / `ASC + 180° = DSC` are preserved by construction. *(Before the June 2026 audit the Progressed wheel showed the true-quotidian angles — `relocate(progressed JD)` — regardless of the chosen method, drifting ~1°/yr from the map's frame.)*

- **Primary Directions in the bi-wheel.** On the *map*, primary directions are the RAMC advancing while the bodies hold their natal RA/dec (a rigid westward rotation of the line-set). The bi-wheel shows the **bodies** at their directed positions via the mathematically-equivalent rigid RA rotation (arc carried in right ascension, declination unchanged), which draws the **identical** lines (the hour angle is unchanged); but the directed **MC/AS marks advance forward via `RAMC + arc`** — the classical meridian motion, so the directed MC advances ~1°/yr. Riding the bodies' rigid rotation instead would freeze the body-to-angle separations and creep the directed MC *backward* through the zodiac, contradicting the textbook heuristic — an angle has no declination to hold, so it is re-derived from the advanced RAMC rather than RA-shifted like a body.

### Conventions used

- **Natal Frame default on Solar Arc.** Because it is the default and has no distinct solar-arc form, it gives SA-in-longitude on Solar Arc and natal-framed angles on Progressed, matching the behaviour that existed before the method dropdown was added.
- **"SA in RA" definition.** This computes the arc as a raw RA difference (progressed-Sun RA minus natal-Sun RA) and adds it directly to every **body's** RA, leaving declination fixed — a literal RA increment, intended for the bodies (it differs from an along-the-ecliptic arc and from how some programs define "solar arc in RA"). The bi-wheel's directed **angles**, by contrast, advance via `RAMC + arc` (an angle is a meridian position fixed by the RAMC, with no independent declination to freeze), matching the convention the Progressed overlay's map frame already uses — so the bi-wheel and map now agree (the old declination-fixed shift split them ~2.4° at age 30).
- **Angles anchored to Greenwich.** All directed angles advance the natal *Greenwich* RAMC, not the birthplace's local sidereal time. For astrocartography this is internally consistent: the directed MC is referenced to Greenwich rather than the birthplace meridian.
- **Forward only.** Primary Directions (and the positive-only user rate) always direct *forward*; there is no converse/backward option.
- **"True Solar Arc (RA)" naming.** This rate (storage key `placidus-ra`) is the true secondary-progressed solar arc in RA applied as a primary-direction rate, not a Placidian semi-arc / mundane primary direction. It was formerly labelled "Placidus: True SA in RA", which wrongly implied a classical Placidus technique; the label now drops the Placidus attribution.
- **Day-for-a-year constant.** The year length used is 365.2422 days (the tropical year), which sets both the progressed date and every per-year rate.
- **Naibod precision.** The Naibod rate is 0.985647°/yr (59′08″); in the app it appears as 0.985647°/yr in the Primary-rate hint and rounded to 0.9856°/yr in the angle-progression hint.
- **Directed-overlay bi-wheel.** All overlays draw second-ring angle marks. Transits and Synastry take them from `relocate(jd, …)` at the active point; the directed overlays (Solar Arc, Primary Directions, and the non-Natal-Frame Progressed methods) **infer** them by advancing the relocated natal angles by the overlay's arc — in ecliptic longitude for the "…in Long" methods, via `RAMC + arc` for the "…in RA" methods and Primary Directions, and not at all under the Natal Frame default (see "Overlay MC/IC/AS/DS marks" above). The Primary-Directions bi-wheel still shows the bodies at their *directed* RA positions (the rigid rotation that draws the identical map lines); only the angle marks use `RAMC + arc`.

## Glossary

- **RAMC:** Right Ascension of the Midheaven, the point of the celestial equator culminating on the upper meridian; the single sidereal-time handle that fixes where every angle falls in longitude.
- **Solar arc:** the distance the secondary-progressed Sun has moved from its natal place (the day-for-a-year Sun); in solar-arc directions every body is advanced by this same arc.
- **Naibod:** a mean solar rate of 0°59′08″ per year (0.985647°), used as a time-key in place of the Sun's true motion.
- **Cardan:** a mean solar rate of 0°59′12″ per year (0.986667°).
- **Ptolemy key:** the "one degree for one year" rate (1°/yr), the simplest primary-directions time-key.
- **Quotidian:** "of each day", the progressed angle obtained from the day-for-a-year sidereal time (the genuine progressed chart angle).
- **Mundane / geodetic:** placing the zodiac directly onto the Earth's longitudes (here Greenwich = 0° Aries), so each angle's location is fixed by zodiacal position rather than by birth time.
- **Zenith / sub-planetary point:** the single spot on Earth where a body stands exactly overhead (altitude 90°), sitting on its MC line at the latitude equal to its declination. With **In Zodiaco** (or Mundane) selected, the stamp marks the sub-point of the body's *ecliptic-projected* position — keeping it on the In-Zodiaco MC line — which for an off-ecliptic body is not the physical overhead point (Pluto can differ by ~17° of latitude, the Moon by ~5°). The lunar nodes draw no stamp: the nodal axis renders as one merged two-toned line, and its two antipodal sub-points would label the same axis twice.

## How this was validated

The astronomical engine is the Swiss Ephemeris running client-side, reading self-hosted JPL DE441 data files, the same data lineage the desktop tools rely on. A June 2026 ephemeris audit verified those files against JPL Horizons; agreement with the professional desktop tools is well under an arcsecond. A single obliquity (true-of-date) and a single Greenwich apparent sidereal-time reference drive every line, paran, local-space, geodetic, and directed calculation, so the systems stay mutually consistent at the chart instant.

A second, deeper audit (June 2026) verifies the app's **own geometry code** — not a re-derivation, the very modules the app ships — under Node against independent oracles (`scripts/verify-*.ts`, run via a harness that swaps the WASM ephemeris for the native one over the same data files):

- every ASC/DSC line vertex sits on the geometric horizon and is genuinely *rising* on ASC lines / *setting* on DSC lines (altitude finite-differences), and the Swiss Ephemeris's independent rise/transit/set search reproduces the chart instant at points on the lines to seconds;
- polyline sampling strays at most ~0.004° off the true curves;
- every paran latitude is confirmed by event simultaneity, and an independent brute-force scan finds *exactly* the paran set the closed forms produce — nothing missing, nothing extra;
- local-space azimuths match JPL Horizons and the navigation bearing to the body's sub-point;
- relocated angles match an independent closed-form ASC/MC computation to machine precision, and a polar-latitude battery covers all eight house systems;
- the time chain is pinned by tz-database goldens (LMT-era, Paris Mean Time, 1918 DST, double summer time, half-hour zones), calendar-reform continuity, and Horizons checks of the Moon and apparent sidereal time (≤0.1″);
- progression ratios, solar-arc and primary-direction keys, transit frames, synastry framing, and the Davison midpoints are each pinned by exact assertions.

The geodetic mode is checked by the round-trip identity that makes it work: projecting a body onto the ecliptic and converting back, the MC lands exactly on its zodiacal longitude. The Progressions & Directions defaults are chosen to change nothing already in use: Natal Frame reproduces the prior Solar Arc (SA-in-longitude) and Progressed (natal-framed) behaviour exactly. The Primary Directions overlay uses standard mean-rate and solar-rate time-keys applied as a rigid rotation of the angles, conventional for an angle-only treatment. Directed and progressed positions follow the sidebar's Lunar-node setting (default **True** node), the same convention used everywhere else in the chart; there is no separate node setting for the directed math.
