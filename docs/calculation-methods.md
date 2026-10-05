# Calculation Methods

This note documents the calculation conventions AstroLina uses, in plain astrological terms: the ephemeris and the bodies it computes, how the map lines are placed, parans, the daily rise and set times and the planetary hours, the relationship charts (Davison and composite), house systems, the Geodetic ("Mundane") line mode, and the Progressions & Directions overlays. The underlying positions come from the Swiss Ephemeris, reading genuine JPL DE441 data, verified against JPL Horizons in a June 2026 audit (see the companion [About](about.md) page). The planetary accuracy is therefore settled; what these notes lay out is which *conventions* were chosen, so it is always clear what the map is showing.

## Ephemeris engine & data

All astronomical positions come from the **Swiss Ephemeris** (Astrodienst's port of JPL data), compiled to WebAssembly via `@swisseph/browser` and running entirely in the browser under the AGPL-3.0 license. The self-hosted compressed data files (`.se1`) live in `public/ephe/`: about 2 MB for the planets, the Moon and the main asteroids, and about 1.5 MB more for the forty or so minor planets described [below](#numbered-minor-planets). The [hypothetical points](#hypothetical-points) need no ephemeris file: they are computed from `seorbel.txt`, a 6 KB text file of orbital elements that is part of the same distribution.

**Bodies computed:** the ten classical planets (Sun through Pluto); the lunar nodes (mean or true, selectable); Black Moon Lilith (mean lunar apogee); Chiron; and the four classical asteroids (Ceres, Pallas, Juno, Vesta). Chiron and the four asteroids read from the main-asteroid file, `seas_18.se1`, which ships with AstroLina. Chiron and Ceres have been measured against JPL Horizons at four dates from 1880 to 2090 and agree within half an arcsecond at every one, Chiron's chaotic centaur orbit included (the figures are under *How close to the sky* in [Numbered minor planets](#numbered-minor-planets)); Pallas, Juno and Vesta come from the same file. Beyond these, any **numbered minor planet** can be computed from a file of its own (see [Numbered minor planets](#numbered-minor-planets)), and ten **hypothetical points** — the Uranian points, TransPluto and Selena — from a published set of orbital elements (see [Hypothetical points](#hypothetical-points)).

**Date range and fallback.** The data that ships with AstroLina for these bodies covers **1800–2399 AD**, and a birth date can be entered for the years **1800–2200**. This is a download-size choice, not an engine limit (the Swiss Ephemeris itself spans roughly 13201 BC to 17191 AD). Outside that window the planets and Moon fall back automatically to Swiss's built-in **Moshier** model, so the Sun through Pluto, the lunar nodes, and Lilith resolve for any date. Chiron and the four asteroids have no such fallback: each 600-year block is a separate file, so for a date outside coverage they are silently dropped (the rest of the chart still computes) rather than raising an error. A chart imported with a pre-1800 date therefore still draws its planets, nodes, and Lilith, but omits those five. The numbered minor planets below keep their own span, and are never dropped silently. The hypothetical points have no span of their own and follow the planets'.

**Calendar.** Dates before the Gregorian reform are cast on the **Julian** calendar (Julian 4 October 1582 was followed by Gregorian 15 October 1582), the conventional handling. Otherwise a pre-1582 birth would land about ten days off, shifting the Sun by roughly ten degrees.

### Numbered minor planets

Numbered minor planets — those with a Minor Planet Center number — each have a Swiss Ephemeris file of their own: an integration of the body's orbit, perturbations included, made against the JPL DE441 planetary ephemeris. Any of them is computed the same way: the position is read from that file (not computed from a set of orbital elements, as the [hypothetical points](#hypothetical-points) are) through the same engine calls as the planets' — apparent, geocentric, true equator and equinox of date — so a minor planet sits in exactly the frame every other body does. In Zodiaco, the geodetic mapping and the other line conventions apply to it unchanged. Each one draws the four classical angle lines — MC, IC, ASC and DSC — and a zenith point on its MC line at the latitude of its declination, in a shared palette of twelve colours picked by number, since there are far too many bodies for each to own one. The optional Vertex axis is not drawn for them; it stays with the built-in bodies, Chiron, Ceres, Pallas, Juno and Vesta among them. A body's Vertex axis is four more curves that shoot off toward the poles, so with several minor planets switched on it would double their lines for a specialist reading and crowd the four classical ones. A numbered minor planet is always named with its number: Lilith (1181), the asteroid, is not Black Moon Lilith, and Fortuna (19) is not the Part of Fortune. A hypothetical point has no number, and is named with *(hyp)* in its place. A minor planet is marked with its established astrological symbol if it has one, and otherwise with a filled diamond (◆); a hypothetical point is always marked with an outline diamond (◇).

**Short files: roughly 1500–2100.** Each body's ephemeris is published in two spans, a short file for roughly 1500–2100 and a long one for 3000 BC–3000 AD, and the short one is used (for a damaged one, see below). The reason is size. A short file is about 10–60 KB for most bodies — distant ones at the small end, main-belt ones at the large — where a long file covers ten times the span and is correspondingly larger. Near-Earth bodies, whose close passes by the Earth need finer sampling, are the largest at either span: up to about 180 KB for a short file that ships with AstroLina, and over a megabyte for some of the others. Six centuries covers the historical and modern charts most readers cast; what it costs is charts dated after about 2100, whose planets still compute, and imported charts from before 1500.

**Outside a file's span.** A numbered minor planet has no fallback model. Outside its file's span it is not drawn, and it is reported as having no data for that date — never dropped silently, and never replaced by an approximation. The test is made at the instant the lines are drawn for — the chart's own moment, or any other the map is moved to — so what is reported and what is drawn always agree. Each file's span is its own: most of the per-asteroid files that ship with AstroLina run from 1500 to somewhere between September 2100 and May 2102; a few near-Earth files are shorter (the one for Apollo, number 1862, covers 1866–2104). Before 1800 the minor planet's own position still comes from its file, and the Earth's — which a geocentric place needs — comes from the Moshier model, as the planets' do.

**Where a short file is damaged.** A short file can be damaged — recording the wrong length for itself, say, or placing its body far from the orbit its own header gives. Where one is and the body's long file is sound, the long file can be supplied in its place; the body is then read from it through the same engine calls, and its dates are that file's own, which are not always the full 3000 BC–3000 AD.

**Pholus, and numbers that are already bodies here.** Pholus (5145) is in the main-asteroid file alongside Chiron, Ceres, Pallas, Juno and Vesta, and is read from there rather than from a file of its own — so it follows that file's 1800–2399 span. Numbers 1–4 (Ceres, Pallas, Juno, Vesta), 2060 (Chiron) and 134340 (Pluto) *are* bodies listed above, and are never loaded a second time from a per-asteroid file: a second copy of the same object, integrated separately, could differ slightly from the first and draw two lines for one body.

**Geocentric, which matters only up close.** Like every body's, the position is the Earth-centred one (see [Astronomical conventions](#astronomical-conventions)). For anything beyond the Earth's neighbourhood that differs from an observer's view on the surface by about ten arcseconds at most. For a near-Earth asteroid near a close approach it reaches arcminutes — about 1′ for Eros at 0.15 AU in 1975 — and on the very closest passes, degrees.

**How close to the sky.** Bodies whose data ships with AstroLina: within 0.5″ of JPL Horizons at present-day dates, and up to about 1½′ at dates far from the present, where near-Earth asteroids drift most. Other bodies can drift further: up to about 2′ in our tests. The reason is how a per-asteroid file is made: it is an integration of the body's orbit from one set of elements, so the further a date lies from the elements' epoch, the more it can drift from the best current orbit. The drift was measured against JPL Horizons, retrieved on 29 September 2026, for sixteen bodies at four dates — 1 January 1880, 5 June 1941, 29 September 2026 and 1 January 2090 — nine of the minor planets listed under *What ships* below, five from per-asteroid files that do not ship with AstroLina, and Chiron and Ceres from the main-asteroid file. Each gap was read beside Horizons' own stated uncertainty for that body and date (its 3-sigma):

- **In 2026**, close to the per-asteroid files' elements epoch, every body agrees within half an arcsecond but one: Leleākūhonua (541132), a distant body whose orbit rests on few observations, at 3.2″. Its file was built in March 2026, and the orbit JPL now holds for it was fitted in May.
- **The main belt, Jupiter's Trojans, Chiron and Ceres** — Astraea and Hygiea; Achilles (588) and Admetos (85030); Kaʻepaokaʻāwela (514107), a retrograde co-orbital of Jupiter; Chiron and Ceres — agree within about an arcsecond at every date. The largest is 1.0″, Hygiea in 1880; Chiron and Ceres are within half an arcsecond throughout.
- **Centaurs and bodies beyond Neptune** — Pholus, Chariklo, Eris, Sedna and Gonggong — are within 2.6″ in 1941 and reach about 11″ in 1880 and 2090 (Gonggong 10.9″ in 1880, Pholus 11.2″ in 2090, Eris 5.4″ in 1880). For Pholus, Sedna and Gonggong at every date, and Eris at three of the four, the gap is inside Horizons' own uncertainty: at those dates JPL's orbit cannot tell the two apart. An earlier run found Eris within an arcsecond from 1950 to 2026.
- **Near-Earth asteroids**, whose repeated close passes by the Earth amplify small differences, drift the most of the bodies whose data ships with AstroLina: Eros 17.7″ in 1880, 4.6″ in 1941 and 2.4″ in 2090; Apollo 9.4″, 3.1″ and then 60″ in 2090. Zoozve (524522), whose data does not ship with AstroLina, is about 11″ off in both 1880 and 2090. An earlier run found Eros 9″ off in 2012, about 40″ in 1975 and 2100, and 84″ in 1600.
- **Leleākūhonua**, whose data does not ship with AstroLina either, is the largest measured: 73″ in 1880, 34″ in 1941 and 117″ in 2090, outside JPL's own uncertainty at every date.

Part of every figure below about 0.3″ is not the orbit at all. On the Sun, the Moon and Mars, which both sides take from the same JPL planetary ephemeris, the two differ by 0.05″ in 2026 and by up to 0.30″ in 1880, because their models of the Earth's axis (its precession and nutation) are not quite the same. The 2090 figures carry a second difference that neither side can settle yet: Horizons holds ΔT — the gap between the Earth's rotation and uniform time — at its present value for every future date, while the engine extrapolates it, and in 2090 the two are 19.6 seconds apart, worth up to 1.3″ on the fastest-moving of these bodies. On the map, a minute of arc of right ascension moves a body's MC and IC lines by a minute of longitude: about 1.9 km at the equator, less toward the poles.

**What ships.** The data for about forty numbered minor planets ships with AstroLina, in about 1.5 MB of short files. The bodies are chosen for their place in astrological practice and grouped by orbit class: the dwarf planets Eris, Haumea and Makemake with the other trans-Neptunian objects (Gonggong, Quaoar, Sedna, Orcus, Varuna, Ixion, Salacia); the centaurs (Pholus, Nessus, Asbolus, Chariklo, Hylonome, Bienor, Echeclus, Hidalgo); main-belt asteroids with an interpretive tradition (Astraea, Iris, Hygiea, Psyche, Fortuna, Proserpina, Circe, Isis, Ariadne, Pandora, Sappho, Hekate, Nemesis, Persephone, Lilith, Aphrodite, Karma); and the near-Earth asteroids Eros, Amor, Apollo and Bacchus — a group kept small because its files are the largest. The ten [hypothetical points](#hypothetical-points) ship too; they need no ephemeris file of their own, only the small elements file they are computed from. Any other numbered minor planet is computed identically once its file is supplied.

**Orbit classes.** Orbit classes follow NASA JPL's Small-Body Database (data as of 29 September 2026). Dwarf-planet status follows the IAU; AstroLina lists Pluto with the planets. Each numbered minor planet therefore falls in one class: a **dwarf planet** (Ceres, Eris, Haumea or Makemake, whatever their orbit); otherwise, by its orbit, a **trans-Neptunian object** (orbiting beyond Neptune), a **centaur** (between Jupiter and Neptune), a **main-belt asteroid** (between Mars and Jupiter — JPL's inner, main and outer belt together), a **near-Earth asteroid** (an orbit coming within 1.3 times the Earth's distance from the Sun — JPL's Atira, Aten, Apollo and Amor classes), a **Jupiter Trojan** (sharing Jupiter's orbit, about 60° ahead of or behind it), a **Mars-crosser** (crossing Mars's orbit without coming close enough to the Earth to be near-Earth), or, for the few that fit none of these, a body with an **unusual orbit**. A class describes a body; it changes nothing about how the body is computed or drawn.

**How a class is labelled.** A class is named in full as a heading — *Centaurs*, *Near-Earth asteroids* — and in short as a tag beside a body's name. A tag uses the key word or words of its heading, in sentence case, and is short enough to fit on one line with the name: *Centaur*, *Near-Earth*, *Trans-Neptunian*. *Main belt* is the one exception: its heading, *Main-belt asteroids*, keeps the hyphen, and the tag does not. A body in none of the classes is tagged *Unusual orbit*. JPL's own class codes are never shown.

**Why those sources.** An orbit class is a fact about the size and shape of an orbit, so it is taken from a published classification that covers every numbered asteroid, each from its current orbit. An orbit can be refined across a class boundary, which is why the data carries its date. Dwarf-planet status is not an orbit class but a designation, and the IAU is the body that makes it; nor is it tied to where a body orbits — Ceres is in the main belt, the other three beyond Neptune — so no orbit class could stand in for it. Bodies often described as dwarf planets that the IAU has not designated, Gonggong, Quaoar, Sedna and Orcus among them, are therefore classed by their orbit. Pluto, the IAU's fifth dwarf planet, stays with the planets because it is drawn, aspected and counted as one everywhere else in the chart, as astrological practice treats it (the [line classes](#orbs-of-influence-by-line-class) rank it with the planets for the same reason); classing it a dwarf planet in one place would contradict every other.

**Names.** Minor-planet numbers and names are those the IAU assigns and the Minor Planet Center publishes. The names of the minor planets listed under *What ships* were checked against the Center's list of numbered minor planets of 8 September 2026, and all of them agree.

**In the chart.** A numbered minor planet is also placed in the chart, from the same engine sample its lines are drawn from — the chart's own moment, apparent and geocentric of date — at its ecliptic longitude, and, when a sidereal zodiac is chosen, moved into it by the ayanamsa at the chart's moment, as every other body in the chart is. Its retrograde and stationary flags come from the same tests as the planets' (see *Stations* under [Astronomical conventions](#astronomical-conventions)). It is placed but not aspected, and it is not counted in the element and modality tallies. Both are judgements rather than conventions, and the reasons are these.

**Why it is not aspected.** At the default orbs — 7° for each of the five major aspects — two bodies at unrelated longitudes are within orb of one aspect or another for 56° of every 180° of separation between them: about 31% of the time. The ten planets make about 14 aspects among themselves on an average chart. Twenty minor planets, the most that can be shown at once, would add about 120 more, leaving the planets' own aspects about one in ten of the chart's. (Each of these figures comes out the same whether estimated from that 31% or counted across real skies between 1900 and 2090.) Chiron and the four main asteroids are aspected like the planets, as are the lunar nodes and Black Moon Lilith: they are a fixed set, the same bodies in every chart, so what they add is bounded and known in advance — about 19 aspects for the five. The numbered minor planets are an open list the reader draws from, up to twenty at a time, and it is that open end, not being a minor planet, that keeps them out of the aspects. Orbs are set per aspect, not per body, so there is no narrower orb a minor planet could be given instead. The Part of Fortune is also placed without aspects, for a reason that does not reach these bodies: a Lot has no body behind it — it is a longitude computed from the Ascendant, the Sun and the Moon — and aspects to a Lot are read by a doctrine of their own, which is not drawn here. A minor planet is a body, so it needs the reason above instead.

**Why it is not in the tallies.** The element and modality tallies count the chart's shown planets, points and main asteroids by sign — by default the ten planets. Those are a fixed set, the same in every chart. Up to twenty numbered minor planets can be shown at once — twice as many — and which twenty is a matter of the reader's interests rather than of the chart. Counted in, they could outweigh the planets two to one, and the tallies would measure which bodies are switched on rather than the chart.

**Not yet.** Parans and the dated overlays (transits, progressions, directions) do not include these bodies or the hypothetical points yet, and neither is yet computed for composite charts.

### Hypothetical points

Ten points with no observed body behind them are computed as well: the eight **Uranian points** of the Hamburg School — Cupido, Hades, Zeus, Kronos, Apollon, Admetos, Vulcanus and Poseidon — and **TransPluto** and **Selena** (the White Moon). Hypothetical points are computed by Swiss Ephemeris from the orbital elements in its `seorbel.txt` file (Uranian points: Witte/Sieggrün elements as refined by James Neely). These points have no observed physical counterpart; their positions are defined entirely by these published elements. Where Swiss Ephemeris's built-in values differ from `seorbel.txt` (Kronos), AstroLina uses `seorbel.txt`.

**One named set of elements.** More than one set of elements has been published for some of these points — the Uranian points' were refined after Witte and Sieggrün first gave them — and no observation can choose between the sets, because there is nothing to observe. A position for a hypothetical point therefore means something only together with the elements it came from, so AstroLina computes each point from one named set, and says which. It is the elements file of Swiss Ephemeris version 2.10.03, with every element line unchanged and some of its comment lines removed:

- **The Uranian points:** the Witte/Sieggrün elements as refined by James Neely, heliocentric orbits referred to the ecliptic and equinox of 1900.
- **TransPluto:** the elements published by Strubell in *Die Sterne* 3/1952, a heliocentric orbit referred to the equinox of 1945, which the file supplies because Strubell gives none.
- **Selena:** a circular orbit around the Earth in the plane of the ecliptic, completing one turn in seven years.

**The file, never the built-in values.** The engine also carries element sets compiled into it for all of these points but Selena. They agree with the file for every point except Kronos, whose built-in semi-axis, 64.81960 AU, transposes two digits of the published 64.81690 — enough to move Kronos by 14″ of longitude in 1990 and by 20″ in 2026. So the file is used, and only the file: if it cannot be read, the hypothetical points are not drawn at all, rather than drawn from the built-in values. Whether it was read is tested rather than assumed: for the nine points it has built-in sets for, the engine does not report a missing file but answers from those sets instead. Selena has none, so no point is drawn until Selena has been computed from the file.

**No date span of its own.** A hypothetical point has no ephemeris file, so no span of its own: its elements give a position for any date. It is seen from the Earth, whose position comes from the planets' ephemeris, so the points are computed for exactly the dates the planets are (see *Date range and fallback* above).

**On the ecliptic, and off it.** Cupido and Hades have orbits inclined about a degree to the ecliptic (1.08° and 1.05° in the elements), so like the Moon and Pluto they carry an ecliptic latitude, of up to about 1.1°. Their In Mundo lines, drawn from where the point actually is, therefore differ from their In Zodiaco lines, drawn from its ecliptic longitude, by up to about a degree of declination: in 1990, Cupido's In Zodiaco zenith point sits a full degree of latitude south of its In Mundo one. The other eight have no inclination in their elements. What latitude they show comes only from the elements being referred to the ecliptic of an earlier date — 1900 for the Uranian points, 1945 for TransPluto; Selena's is the ecliptic of date, so she has none — and it stays under 0.02° for any date from 1850 to 2050, and under 0.03° from 1800 to 2100. For those eight, between 1800 and 2100, the two projections place the zenith point within about 3 km of each other, and the MC and IC lines within about half a kilometre.

**In the chart.** A hypothetical point is placed in the chart as a numbered minor planet is, at its ecliptic longitude at the chart's moment and moved into a sidereal zodiac the same way, and for the same reasons it is neither aspected nor counted in the element and modality tallies: the points are drawn from the same open list as the minor planets, and share its limit of twenty at a time.

**Named, not numbered.** A hypothetical point has no Minor Planet Center number, so it is named with *(hyp)* instead — hypothetical: a point with no observed physical body, defined by a published orbit. That keeps it apart from the real asteroids that share or once shared its name: the asteroids Zeus (5731), Cupido (763), Admetos (85030) and Poseidon (4341) are not the Uranian points; TransPluto was called Isis, Persephone or Bacchus in older literature, and the asteroids with those names (42, 399 and 2063) are different objects; and Selena is not the asteroid Selene (580). Each point is drawn in a colour of the shared palette assigned to it, never the colour of the asteroid that shares its name, and is always marked with an outline diamond (◇), where a minor planet has its established astrological symbol if it has one and a filled diamond (◆) otherwise.

## Astronomical conventions

These are the physical conventions every line, paran, and readout shares, with one exception: the daily rise and set times, which are [treated below](#daily-rise-and-set-times). They match the standard astrocartography practice established by the Jim Lewis maps:

- **Geometric horizon, no refraction.** A rising/setting line marks where the body's true (airless) altitude is exactly 0°. Atmospheric refraction, which lifts the *visible* rise a few minutes earlier, is deliberately not applied — astrological angularity is geometric, not optical. The daily rise and set *times* are the exception: they are clock times for a place, meant to be checked against the sky and an almanac, so they are the visible ones. A printed rise therefore comes before the body's rising line reaches the place — by about two to five minutes at low and middle latitudes, and by longer toward the poles.
- **Geocentric body centers.** Positions are Earth-centered. For the planets the difference from an observer on the surface is arcseconds; for the **Moon** it can reach a degree (her parallax), so the Moon's ASC line is the geocentric convention's line, not the place you would *watch* moonrise at that instant. This is the standard ACG convention.
- **Apparent positions, frame of date.** All positions are apparent (light-time and aberration applied), referred to the true equator and equinox of date; the sidereal-time reference is Greenwich **apparent** sidereal time and the obliquity is the **true** obliquity of date. One consistent frame end to end — mixing in a mean value anywhere would skew conversions by the ~9″ nutation terms.
- **Universal Time in, ΔT inside.** The birth moment is converted to a Universal-Time instant; the Swiss Ephemeris applies the ΔT correction to its internal dynamical timescale itself. (Verified against JPL Horizons via the Moon, the fastest hand on the clock.)
- **Stations.** A body is flagged *stationary* when its longitude motion reverses sign within about a day on either side of the chart moment — a bracket in time, not a speed threshold, so the slow outer planets aren't "stationary" year-round.
- **Out of bounds.** The declination threshold is the **Sun's maximum declination — the true obliquity at the chart's moment** (≈23°26′), not a hard-coded constant: a fixed value sitting below the real obliquity would absurdly flag the Sun itself as out-of-bounds for a couple of days around each solstice. (Some tools use a fixed 23°26′, 23°27′, or ~23°28′; the spread between those published constants is larger than the fixed-vs-of-date difference.)
- **Local space geometry.** Azimuth lines are great circles on a spherical Earth (radius 6371 km); the ellipsoid is not modeled, consistent with the astrological local-space literature.

## Time zones & historical births

By default the IANA time zone is detected from the birthplace, and its DST-aware offset is resolved at the birth moment (the same tz database browsers and operating systems use — including the historical record: first-generation US DST in 1918, Britain's wartime double summer time, half-hour zones, Lord Howe's 30-minute DST, Nepal's 1986 switch to +5:45, and seconds-precision legal standards like Paris Mean Time all resolve correctly). Detection is the default because the birthplace and the moment are all it needs: the tz database records which clock was legally kept at a place on a date, daylight saving included, so nothing has to be translated by hand — and a hand translation is where a sign flips or a daylight hour is counted twice. The zone can instead be **stated**, in the terms a source gives it, for when the source knows more than the database: a birth record that prints its zone, or an atlas that has researched a town's own practice where the database records only its region's.

- **Births before standard time (LMT).** Before a region adopted a standard time, clocks kept **local mean time**. The tz database carries only its reference city's mean time for that era (all of Germany before April 1893 reads as Berlin's +0:53:28), so AstroLina substitutes the **birthplace's own** mean time — longitude ÷ 15 — exactly as the astrological atlases do. Einstein's Ulm 1879 chart thus gets Ulm's +0:39:57 (the atlas value "m9e59"), not Berlin's. The boundary dates come from the tz database source itself (see `npm run build:lmt`), because they can't be inferred from offsets alone: France's *legal* Paris Mean Time (1891–1911) equals Paris LMT to the second and is correctly kept. If you name a tz-database zone yourself for an LMT-era birth, the zone's reference-city value is used as given and the chart is flagged for verification (naming the very zone that was detected counts as detection, so the birthplace's mean time is kept). The birthplace's mean time can also be stated outright, as an exact offset (below).
- **DST edge cases.** A birth time falling in a spring-forward gap (a clock time that never existed) resolves to the post-gap offset; a time in the fall-back overlap (a clock time that happened twice) takes the **earlier** pass (still on DST). Birth records that straddle these edges deserve a source check either way. A zone stated as a standard time with its daylight correction settles such a time outright, since nothing is looked up.
- **A standard zone and its daylight correction.** Birth records and atlases give a zone as its standard time plus the correction in force — "EST, daylight saving" — and it can be stated that way. The offset is the zone's standard offset plus one of five corrections: none (standard time), daylight saving (+1 h), war time (+1 h), double summer time (+2 h) and half-hour daylight saving (+0:30). War time adds the same hour as daylight saving and is listed apart only because sources record it under its own name. These are the corrections the AAF exchange format records for a birth, so a chart imported from such a file and one entered by hand from the same terms come out the same, to the second. Each standard zone is named with its region and offset, never by its abbreviation alone, because the abbreviations collide: CST stands for four standard times — North America's Central, China's, Cuba's and Taiwan's; IST is India Standard Time, Israel Standard Time and Irish summer time; BST is British Summer Time and Bangladesh Standard Time. Each zone's standard offset is checked against the tz database, and between them the zones carry every half- and quarter-hour standard offset the database records since 1868 — India's UTC+5:30, Nepal's UTC+5:45, Newfoundland's UTC−3:30, and historic ones, named with their years, such as Hawaii's UTC−10:30 of 1896–1947. An offset that is not a whole quarter hour, such as a legal mean time, is detected or stated as an exact offset instead.
- **Naming the zone behind a detected offset.** A detected offset can be re-expressed as a standard zone and its correction, and the two always add up to the detected offset exactly. Adding up is not enough, though: Istanbul's UTC+3 in July 2000 is also the sum of Turkey's present standard time and no correction, but that summer Istanbul kept Eastern European Time with daylight saving. So a correction is named only where the tz database has summer or war time in force at that moment — Moscow's UTC+4 in 2012 was its standard time that year, not UTC+3 with an hour of daylight saving — and it is named against the standard time the birthplace kept **that year**: the season the time-zone data names as standard time, or, where it names none (Britain kept summer time through the winters of the Second World War, and many zones carry no names before 1970), the lowest offset the place kept in the years around the birth. London in July 1941 is Greenwich Mean Time with double summer time. The zone named must be one listed for the birthplace's tz-database zone with that standard offset; war time, being the same hour, is named as daylight saving. A birth in local mean time, a birthplace whose standard time that year none of the standard zones gives, or an offset no correction accounts for gets no name at all rather than a neighbour's.
- **An exact offset.** An offset can also be stated as a number, to the second: as a source prints it, as the birthplace's local mean time, or as zero for a time recorded in Universal Time. The local mean time is the birthplace's longitude ÷ 15, rounded to the whole second — New York's 74°00′23″ W gives 4h56m02s W — counted on the calendar the birthplace kept on the birth date, as detection counts it: a place that sat across the date line from the reckoning its longitude implies (Alaska before 1867, the Philippines before 1845) kept a civil date a day apart, so its mean time is moved by that whole day, and a birth date read on the local calendar lands on the same instant either way. Both notations below are read, in the forms sources print them — 5hw00, 4:56:02 W, −05:00, +5:30 — and text that could mean two things is refused rather than guessed: a decimal (is 5.30 five and a half hours, or five hours thirty?), a sign together with a direction letter, a run of digits that splits more than one way. An offset read wrong still casts a perfectly plausible chart, so nothing would show the mistake afterwards. A bare figure such as 5 or 0530 states no direction, and sources disagree about which way an unsigned offset runs, so its direction is supplied separately, never read into the figure. Anything beyond 15 hours is refused as a misread field.
- **Two notations, one offset.** Offsets are written two ways that run in opposite directions. The civil notation counts from Universal Time, so a place west of Greenwich, whose clocks are behind UT, is negative: UTC−5. The astrological notation names the direction instead: 5h W. **UTC−5 and 5h W are the same offset** — the clock reads five hours less than UT — so 14:30 at UTC−4 (4h W) is 18:30 UT. The tz database's own fixed-offset zones invert the sign once more, following the POSIX convention: Etc/GMT+5 is UTC−5.
- **The stored offset is the record.** However it is arrived at, a chart stores one number — its offset from UT at the birth moment — and is cast from that number alone. A saved chart is never re-resolved: a later revision of the tz database, a change in how a zone is detected, or a change to the standard zones does not move it. Saving a chart again with its zone, place and moment unchanged writes its zone back exactly as stored, to the fraction of a second and with its "verify DST" flag as it was. How the offset was arrived at — a standard zone and its correction, an offset as the source printed it, the birthplace's mean time, UT — is recorded beside it as a description of the number, not a second source for it; where the two would ever disagree (a description that no longer adds up, or a zone that would now be detected differently), the number stands, as an exact offset, and nothing is re-derived. An imported chart is the same: it is cast from the offset settled at import, and where an AAF file gives that offset as a standard time and a daylight code that add up to it exactly, the terms are recorded with it.
- **The "verify DST" flag.** Pre-1970 births outside the regions with well-digitized DST history (the Americas, Europe, Hawaii) are flagged so the offset can be checked against an atlas, as are tz-database zones named for a birth in their LMT era. The flag is a warning about the tz database's record, so it is raised only where that record was consulted: a zone detected from the birthplace, or a place's zone named from the database. An offset stated from a source — a standard zone with its daylight correction, an exact offset, a whole-hour offset from UTC — is not flagged, and neither is an imported file's own offset: nothing was looked up, so the database's gaps cannot have reached it. Re-expressing a detected offset in those terms, without stating anything, is not a statement: the number is still the lookup's, and so is the flag. Note that regional time practice in the late 19th century (railway times, observatory times) is modeled at tz-database granularity; for rectification-grade work on 19th-century charts, consult a historical atlas, whose offset can be stated exactly.

## How the lines work (quick model)

An astrocartography line is the set of places on Earth where a chosen body sits exactly on one of the four chart angles at the chart's moment. Each body draws its own four lines: **MC** (the body culminating on the upper meridian), **IC** (the lower meridian, always the exact antipode of the MC), and **ASC / DSC** (the body on the eastern/western horizon, rising/setting). MC and IC lines are straight north–south meridians (lines of constant geographic longitude); ASC and DSC lines are the curves traced as the body's hour angle sweeps out. Each body also gets a **zenith** (sub-planetary) stamp: the single point where it stands exactly overhead, sitting on the MC line at the latitude equal to the body's declination.

The **lunar nodes** are the one exception, because the North and South Node are exact antipodes: a South Node line falls precisely on a North Node line with the angle swapped (North Node MC = South Node IC, North Node ASC = South Node DSC, and so on). So when **only one** node is shown it draws its four lines normally, in its own colour; when **both** are shown the coincident lines are **fused into a single two-toned line** labelled for both nodes, rather than drawn twice on top of each other — on the natal chart a solid line split half North-Node colour / half South-Node, and on a time overlay (whose lines are dashed) the same two colours interleave as alternating dashes. **Parans** follow the same idea: with both nodes shown, each South-Node paran (which coincides with a North-Node one) is dropped so the nodal-axis paran is drawn once. In **local space** the two nodes are opposite directions of one axis, so both are kept and labelled at their own ends. Neither node gets a zenith stamp, being an abstract ecliptic point rather than a body that stands overhead anywhere; both still appear as points in the chart wheel, where they are not redundant.

In the standard ("Celestial") map, the longitude of each angle is driven by sidereal time: a body's meridian longitude equals its right ascension minus Greenwich *apparent* sidereal time. That single sidereal-time reference is what ties the whole map to the chart's exact moment.

## Dated arrivals (when a moving body reaches a place's angle)

The lines answer *where*. The same geometry answers *when*: fix a place, take a moving body — transiting, progressed, or directed — and solve for the instants it arrives on one of that place's four relocated angles. Two conventions have to be stated for such a date to mean anything, and they are stated here rather than left to whichever surface lists them.

### The target is the natal-relocated angle, held fixed

A place's four angles are a product of one moment — the birth moment — and the geography. They are computed once, from that moment, and they do not advance: not with the Arc or Angles setting, not with the primary-directions rate, not with the technique in play. Those settings govern the **moving** side (and how an overlay draws its own frame); the thing being arrived at is a fact about the birth chart at that place.

One consequence is worth naming, because the alternative fails silently. If the target advanced by the same arc as the mover, the two would travel together and the arrival could never occur — the list would simply be short, with nothing to indicate why. A fixed target cannot cancel, and that is checkable rather than merely intended: across a scan, the change in the gap between body and target must equal the distance the body itself travels.

A second consequence: **before the birth moment there is nothing to arrive at.** A body's position six years before the birth is perfectly computable; the arrival is not, because the angles it would be arriving at do not exist yet. Such a scan therefore floors at the birth instant, in every technique including transits.

### The arrival follows the line projection

**In Zodiaco** — and in the geodetic mapping, which is zodiacal by construction — every body is projected onto the ecliptic before its line is drawn, so the body is on the angle exactly when its ecliptic longitude equals the angle's. That is an identity rather than an approximation: RA(λ, 0) is monotonic in λ, so "the projected body culminates" and "the longitudes are equal" are one statement.

**In Mundo** each body is drawn where it actually stands, so the arrival is geometric. The body reaches the MC when its right ascension reaches the place's RAMC — frozen at the birth moment, the same sidereal-time reference the lines themselves are drawn with — and the IC half a turn away. It reaches the ASC or DSC when its altitude on that frozen horizon passes through zero: east of the meridian rising, west setting.

For a body on the ecliptic the two readings are the same event. For a body carrying ecliptic latitude they are not — reaching a degree and reaching a meridian are different events — and the separation is made of that latitude: a few tenths of a degree of arrival longitude per degree of latitude, the exact factor depending on where on the ecliptic the angle falls. The Moon (β to 5.3°) and the mean lunar apogee (β to 5.15°) can differ by days between the two readings; Pluto (β to 17.7°) by more. The lunar nodes, which are ecliptic points by construction, agree.

Two further consequences of the mundane reading:

- **A frozen horizon a body never crosses.** Where the body's declination exceeds 90° − |latitude| it stays above or below that horizon for the whole scan, so no ASC/DSC arrival exists — at a place where the longitude reading always eventually produced one. This is ordinary at high latitude: at 70°N the limit is 20°, which the Sun, Moon and Venus all exceed for much of the year.
- **A Lot has no arrival in mundo — and the test is a position in space, not a planet.** A Lot is a construction on the ecliptic with no position in the sky: no right ascension of its own to culminate, and no direction to rise from. So it is read by degree in either projection, and its lines are drawn only in a zodiacal frame for the same reason. Black Moon Lilith is the contrast that makes the treatment consistent rather than arbitrary — the mean lunar apogee is a real point on the Moon's orbit, carrying a latitude, a right ascension and a declination of its own, so it culminates and crosses a horizon like any body and is read geometrically here.

Both readings freeze their target in the natal frame, one in longitude and one in right ascension, and the map between those two coordinates drifts slowly with the obliquity (which falls about 47″ a century). So even for a body with no latitude the two dates differ by a few arcseconds' worth of its motion — a lifetime of scan is worth around 5″ at a mid-northern MC. That is inherent to freezing the frame, and it is the same convention the drawn lines are under.

## Parans

The app computes all **planet-to-planet** parans:

- **Meridian × horizon:** planet A on the **MC** or **IC** while planet B is on the horizon (rising or setting).
- **Horizon × horizon:** both planets on the horizon together, in any rising/setting combination. This is solved in closed form rather than by iteration: the two-on-the-horizon condition reduces to a linear equation in the local sidereal time, `cos(θ − raA) = k · cos(θ − raB)` with `k = tan(decA) / tan(decB)`, giving two latitudes per pair.

**Latitude band.** Paran rows are listed to **±72°** of latitude, while the angle lines themselves draw on to ±85°: rising/setting geometry degrades toward the circumpolar zone, so in the 72°–85° band you may see two lines visibly cross with no paran row for the crossing.

**The intersection point.** Each paran records an intersection point — the spot where planet A's meridian (or its own horizon curve) crosses the paran latitude. That point follows the same meridian mapping as the drawn lines, so it lands on the visible crossing in both the Celestial and the Geodetic ("Mundane") line systems; the paran *latitudes* themselves are identical in both systems, since the two bodies' mutual geometry doesn't depend on how meridians map to longitudes. **Which parans are labelled.** Each paran's label sits where its latitude crosses the middle of the view, or one label's width to either side when that spot is taken; where labels would still collide, the chart's own parans are labelled before an overlay's, then pairs are taken by their stronger body and then their weaker one (the luminaries, the personal planets, Jupiter and Saturn, the outer planets, then calculated points and minor bodies — the same class order as the orbs), then those nearer the middle. An unlabelled paran is still drawn and still named when pointed at.

**Under an overlay.** When a technique or relationship overlay is active — transits, secondary or tertiary progressions, solar arc, primary directions, cyclocartography, or synastry — the parans are drawn from the **overlay's** frame only; the base-chart parans are hidden (never both frames at once), whether or not the natal lines are shown. A paran is two bodies angular at one moment, so a cross-frame pair — one natal body, one overlay body — is not a paran and is never listed. Cyclocartography is the further exception that draws no parans at all: its sky blends two epochs (secondary-progressed personal planets with transiting outers), so no single simultaneous moment exists for any pair to share. The **Eclipses** overlay sits outside this rule — it leaves the natal parans on the map, and the eclipse chart's own parans are a separate opt-in (the eclipse map linework), so the two sets can appear together.

**Fixed-star parans** (star × planet) are computed with the same closed forms, using each star's proper-motion-corrected, precessed position of date — a star culminating while a planet rises, and every other mundane combination. They are computed but not drawn as map lines: a bright-set catalog times the planet set yields hundreds of latitude rows (which would bury the map), and the conventional reading — Bernadette Brady's school, the classic ACG latitude-crossing listings — is a per-location list anyway. Star-to-star parans are not computed. These star × planet parans are the natal frame's own: an active overlay hides them (no overlay-frame replacement is generated), on the same one-frame rule and with the same Eclipses exception as the planet-to-planet parans above.

## Daily rise and set times

A place's daily clock — when each body rises, culminates, sets and anti-culminates there on a given day — is read in the place's own local time: the civil day from midnight to midnight, with the time-zone database's offset for that date, daylight saving included.

**Visible rise and set.** Unlike the lines, these are the instants you would see from the place, over a sea-level horizon in a standard atmosphere. A body rises or sets when its centre is 0°34′ below the geometric horizon — the standard allowance for refraction, which lifts a body into view before it is geometrically up — and the Sun when its upper edge is, which puts its centre at 0°50′ below. This is the definition published sunrise and sunset tables use, so a sunrise here can be checked against the reader's own almanac. The alternative is the lines' own definition, the body's centre on the geometric horizon; it is not used for these times, because it would print a sunrise several minutes later than the almanac's. Culminations are unaffected: refraction doesn't change when a body crosses the meridian.

**The Moon.** Positions are geocentric (see [Astronomical conventions](#astronomical-conventions)), but the Moon is close enough that from the Earth's surface she stands lower than her geocentric place by her parallax — about a degree, twice her own width and more than refraction lifts her. So her rise and set are taken where an almanac takes them, the upper edge of her disc on the visible horizon as seen from the surface, which on geocentric positions puts her centre at her standard altitude: 0.7275 × her horizontal parallax, less the same 0°34′ of refraction. That is about 0°07′ *above* the geometric horizon at her mean distance, a little more near perigee and less near apogee, and it is recomputed from her distance at every step of the solution. So a printed moonrise can be checked against an almanac, as a sunrise can. Timed at a planet's 0°34′ below instead, every moonrise would be printed a few minutes early and every moonset a few minutes late — about three minutes at the equator, seven or eight at 60° of latitude, and more beyond.

**Each crossing on its own motion.** Each rise and set is solved on the body's position at the crossing itself: its right ascension and declination are re-read at every step of the solution, so the Moon's fast motion and the Sun's drift in declination through the day are both accounted for. A body that stays above the horizon all day, or below it, at that latitude is reported as such, with no rise or set time — never an interpolated one.

**Two of an event, or none.** A body's own day, from one culmination to the next, is not the clock's 24 hours: for most bodies it is a few minutes shorter, and for the Moon about fifty minutes longer. So a civil day can hold two of the same event — a body that culminates just after midnight can culminate again just before the next — and then both times are given; or it can hold none, as when the Moon skips a culmination (or a rise, or a set) about once a month, and then none is given. Every occurrence is solved on its own, between the two meridian passages that bracket it; none is carried over from the day before or after.

### Planetary days and hours

A **planetary day** runs from one sunrise to the next. Its daylight, from sunrise to sunset, is divided into twelve equal **planetary hours**, and its night, from sunset to the next sunrise, into twelve more. A day hour and a night hour therefore differ in length, the more so the further the place is from the equator and the date from an equinox. The sunrise and sunset are the visible ones above — the same instants the daily times give for the Sun — for the same reason: they can be checked against an almanac.

**Rulers.** Each day is ruled by the planet of its weekday — the Sun on Sunday, the Moon on Monday, Mars on Tuesday, Mercury on Wednesday, Jupiter on Thursday, Venus on Friday and Saturn on Saturday — and that planet also rules the day's first hour. The hours then follow the **Chaldean order**, the planets ranked from the slowest to the fastest: Saturn, Jupiter, Mars, the Sun, Venus, Mercury, the Moon, and round again. Twenty-four hours advance that cycle by three places (24 = 3 × 7 + 3), which lands the next day's first hour on the next weekday's planet: the order of the weekdays falls out of the order of the hours.

**The day begins at sunrise.** An instant between midnight and sunrise belongs to the previous planetary day: to its night hours, under the previous weekday's ruler. At three in the morning on a Friday it is still Thursday's night.

**Which date names the day.** A planetary day is named for the calendar date of its midday. That is also the date of its sunrise, except near the polar circles at a place whose clock runs well behind the Sun, where the sunrise after a short summer night can fall just before local midnight. Naming the day by its sunrise there would give two days running the same ruler.

**Clock changes.** The hours are equal in elapsed time. On a night when the clocks change, each hour keeps its length, and the clock times printed for the hours jump or repeat by an hour.

**Where there is no planetary day.** Where the Sun doesn't rise or doesn't set — polar night and midnight sun — there is no sunrise-to-sunrise day to divide, and the planetary hours are reported as unavailable for that date. They are never replaced with equal or clock hours.

**What they depend on.** Only the Sun's rise and set at the place. The zodiac (tropical or sidereal), the line system, the house system, the chart's birth time and which bodies are shown play no part.

## Eclipse times at a place

For a chosen point, a solar eclipse's local circumstances are its contacts there — the partial phase beginning and ending, totality (or the annular ring) beginning and ending, and the moment of greatest eclipse — with the length of the central phase. For a lunar eclipse they are the phase contacts, each with whether the Moon is above the horizon there at that moment, and any moonrise or moonset that falls during the eclipse.

**Each time is given twice: in the place's own civil time, then in Universal Time (UTC).** The civil time is that of the point's time zone, with the zone's offset at each contact's own instant, daylight saving included — the clock that was, or will be, on the wall there. The place's time comes first because a contact time at a place is something to watch for from that place, and a time given in UTC alone reads as local to anyone who doesn't already know otherwise: it is hours out for most of the world. UTC stays beside it because published eclipse circumstances are tabulated in Universal Time, so every figure can be checked against them directly. Where the place's clock agrees with UTC at every contact, the time is given once.

- **Which day.** An eclipse is dated by its moment of greatest eclipse, the date it is catalogued under (the catalog keeps that moment in dynamical time, which over the centuries it covers stays within minutes of UTC). Far enough east or west the same moment falls on the day before or after — an evening lunar eclipse seen from the Americas happens on the previous calendar day there — so where the place's clock puts the maximum on another day, that day is given, and a single contact that crosses midnight carries its own date.
- **Before standard time.** For a place and date before its region adopted standard time, the time-zone database knows only the mean time of the zone's reference city, so the place's own local mean time — longitude ÷ 15 — is used instead and labelled LMT, exactly as for a birth in that era (see [Time zones & historical births](#time-zones--historical-births)).
- **Future eclipses** are read on the zone's rules as they stand today. If a region later changes its clocks, the civil time changes with it; the UTC time does not.
- **Rounding.** Contact times are rounded to the whole second. A duration is rounded to the resolution it is shown at before it is split into units, so no figure ever ends in "60": the second below an hour and the minute from an hour up for a solar eclipse's central phase, whose length is known to the second (the catalog's greatest duration, and the length computed at a place); and the minute throughout for a lunar eclipse's phases, which the catalog gives to a tenth of a minute — read to the second they would claim a precision the figure doesn't have.
- **Magnitude and obscuration are different quantities.** Magnitude is the fraction of the eclipsed body's *diameter* covered, given as a decimal (above 1 for a total eclipse); obscuration is the fraction of the Sun's *area* covered, given as a percentage. Magnitudes are given to three decimal places, for the published figure and the place-by-place one alike, so the two can be read against each other directly; a fourth place is a ten-thousandth of the diameter, a difference no observer can see. (At greatest eclipse the place-by-place figure is checked against the published one, and is required to agree within 0.004.)

## Local space

Local-space lines are compass bearings: each body's line leaves the **origin** — the placed pin by default (relocated local space), or the birthplace via the Origin setting — at the body's azimuth, and is extended as a **great circle** (not a rhumb line: a constant-compass course would miss the body's sub-point by thousands of kilometres, while the great circle passes exactly through it). Each body draws two halves, *out* toward the body and *in* the opposite way (the inbound half can be hidden), on a spherical Earth.

Local space always uses each body's **true** sky position (actual RA and declination), regardless of the **In Zodiaco** / **Mundane** projection — it is inherently a true-sky technique, so it doesn't inherit the ecliptic projection the rest of the linework applies. (Projecting an off-ecliptic body onto the ecliptic first would skew its bearing — roughly 3.7° for high-latitude Pluto.) The map lines and every azimuth readout therefore agree, and every readout quotes **geographic azimuth**: 0° at North, clockwise (E = 90°, S = 180°, W = 270°). (Some chart-wheel traditions instead count the horizon like a zodiac, East = 0° counter-clockwise; positions are identical either way — only the printed numbers differ.) Local space is **not drawn in Mundane (Geodetic) mode**: that mode is time-independent while local space needs the specific birth moment, so the two are incompatible; switching to Mundane closes the Local Space view.

### Bearing alignment

Because a local-space line is a **direction**, not a zone of influence, distance to it carries no interpretive meaning — a point 5 km off a bearing 8,000 km from the origin is astrologically nowhere near it. The meaningful question is angular: **does a place lie along one of the chart's bearings?** The test compares the initial great-circle bearing from the origin to the place against each body's azimuth, in **degrees of azimuth** (default orb 3°, adjustable), and works identically for a move across town and across the world. Because the drawn lines are great circles seeded at those azimuths, a place exactly on a drawn line matches its azimuth exactly; both halves count — the outgoing half (drawn solid) and its inbound continuation toward the antipode (drawn dashed), the latter labelled *inbound*. A body's azimuth from any origin equals the bearing to its sub-point, so the alignment can be asked from origins other than the drawn lines' own — the birthplace, the placed pin, or a saved home location — without recomputing the sky (this equality is asserted by the verification harness). Within roughly 5 km of the origin the bearing is undefined (every line passes through the origin), and alignment strength reads as the same orb fractions as the class orbs below.

## Orbs of influence by line class

Surfaces that rank line proximity group every drawn line into a **class**, each with its own default **orb of influence** (user-adjustable); a line only lists within its class orb, and its **strength is the distance as a fraction of that orb — never the raw distance**. This is the working astrocartographer's ranking: a planetary line at 50 km (12% of its orb) reads stronger than a minor line at 30 km (27% of its own), whatever the raw kilometres say.

The default orb has **one canonical figure per unit** rather than one value converted between them: a kilometre user's planetary orb *is* 400 km, a mile user's *is* 250 mi (which is 402 km). They differ by under a percent, and the point is that every number a user reads is the number actually in force — dividing one stored value showed odd conversions (249/149) for the round convention.

| Class | Contents | Default orb |
|---|---|---|
| Planetary lines | MC/IC/ASC/DSC (and Vertex-axis) lines of the Sun through Pluto | 250 mi / 400 km |
| Points (calculated) | Node lines, Black Moon Lilith, and Fortune | 150 mi / 240 km |
| Minor bodies (physical) | Chiron, Ceres, Pallas, Juno, Vesta (scales to further centaurs/TNOs) | 150 mi / 240 km |
| Parans | Latitude-band contacts (about a 1° band) | 70 mi / 110 km |
| Aspect lines | Body square/trine/sextile to an angle | 100 mi / 160 km |
| Midpoint lines | Two-body midpoints on angles | 70 mi / 110 km |
| Fixed stars | The drawn star lines (bright catalog) | 70 mi / 110 km |

The hierarchy — the order the classes rank and display everywhere — is: **planetary lines → points → minor bodies → (a future line-intersection slot) → parans → aspect lines → midpoint lines → fixed stars.** The dividing principle for splitting bodies is physical body vs. calculated point vs. frame position: the classical planets and the physical minor bodies are bodies; nodes, Lilith and Fortune are calculated points. Pluto ranks with the planets by convention.

Strength tiers are fixed fractions of the governing orb: within **25%** = *on the line*, within **60%** = *near*, inside the orb = *within orb*; beyond the orb a line does not list. The local-space bearing alignment uses the same fractions in its own unit (degrees of the bearing orb), where the top tier reads *aligned* rather than *on the line* — a bearing is aligned with a line, not on it. Classification is by **body** for the angular families, and angles are a frame position, not a class of their own: which of the six angles a line is (MC/IC/ASC/DSC/Vertex/Anti-Vertex) is a filter, and — as a ranking sub-key — a line on one of the four classical angles ranks above the same body's Vertex-axis line within its class. Star × planet parans count as parans (latitude contacts); the *Fixed stars* class is the drawn star lines. The class list is ordered and open: future line kinds (e.g. line-intersection points) slot in without renumbering.

## Ranking places by theme

A place-ranking surface can score the world's cities for a life theme — where a theme is a curated set of angular lines split into a **primary** and a **secondary** tier. A city is ranked by its **single strongest theme line**, never by a sum, so a lone exact contact isn't outweighed by a cluster of distant ones. The sort key, in order:

1. **Tier** — a primary theme line before a secondary one.
2. **Body class** — the line-class hierarchy above: a planetary line outranks a points or minor-body line **in the same tier** (so a classical planet leads, without demoting the asteroid/point lines from the theme).
3. **Strength** — proximity as the fraction of that line's class orb (the 25% / 60% tiers above), nearer first.

Ties break by how many **other** theme lines the city also carries, then by population tier (capitals and larger cities first). City size is a **filter**, never a ranking input. A place also carries a neutral heads-up when a demanding line (Saturn, Pluto, Mars, Chiron, the South Node) runs within about a degree — excluding the line the place is ranked for.

A complementary **diffuse** mode inverts the question: it ranks the places **farthest from every planetary line** — the zones where the natal pattern is least triggered (after Jim Lewis) — by the distance to the nearest planetary line, most-cleared first, once no planetary line falls within a chosen clearance (default twice the planetary orb).

The specific line set behind each theme is editorial and is published with the tool that uses it, not here.

## Zodiac mode (Tropical vs Sidereal)

The **Zodiac** setting reads the chart in the **tropical** zodiac
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

## Rulerships (traditional vs modern)

The **Rulerships** setting decides which rulership table the **essential
dignity** reading uses — the only use of rulership in the app. Two values:
**modern** (the default) and **traditional**.

**The modern scheme ADDS; it does not replace.** Three signs gain a second ruler,
and the classical one keeps its claim:

| Sign | Classical ruler | Modern ruler |
|---|---|---|
| Scorpio | Mars | *and* Pluto |
| Aquarius | Saturn | *and* Uranus |
| Pisces | Jupiter | *and* Neptune |

Conventions:

- **Detriment does not move with the choice.** Detriment is the sign opposite one
  the planet rules, so *both* rulers of a shared sign are in detriment opposite it:
  Mars **and** Pluto in Taurus, Saturn **and** Uranus in Leo, Jupiter **and**
  Neptune in Virgo. Mars is in detriment in Taurus under either scheme, because
  Mars rules Scorpio under either scheme.
- **Traditional only ever REMOVES the outer three's rows.** No classical planet's
  dignity differs between the two schemes — verified exhaustively over all seven
  classical bodies × twelve signs. That is the whole difference, and it is why
  there are two values here and not three.
- **`modern` is the default** because it is what the app did when the scheme was
  not a choice: the table that shipped was the classical seven plus the outer
  three, which is precisely this. No existing install's reading moves.
- **Rows on the three shared signs name their era** (`rulership (traditional)` /
  `rulership (modern)`) so Mars and Pluto in Scorpio can be told apart. Only under
  `modern`, and only where the sign genuinely has a ruler from each era — for a
  detriment that test is on the sign actually RULED, so Venus in Scorpio stays
  unlabelled (it is in detriment there for ruling Taurus, which no outer planet
  claims, and has nothing to do with the Mars/Pluto pair).
- **Exaltations are the seven classical ones under both schemes**, and the setting
  does not touch them. The moderns assign the outer planets no exaltation, so those
  three can hold rulership and detriment but never exaltation or fall.
- **Independent of the zodiac mode.** Sidereal shifts which sign a body is in, not
  which planet rules that sign, and sidereal + modern rulers is unusual rather than
  invalid — so the two settings are not coupled.

## Relationship charts (Davison & Composite)

A relationship chart is made from the active chart and a synastry partner by one
of two methods, and saved as a chart in its own right, with the "Space" place tag.

**Davison** is a real chart: the arithmetic mean of the two births in Universal
Time, cast at the geographic midpoint of the birthplaces (simple mean latitude;
shorter-arc mean longitude). Everything about it — positions, angles, houses,
overlays — is ordinary natal math.

**Composite (midpoints)** has no real moment. Its conventions here:

- **Planets** are **coordinate-wise midpoints** of the two charts' own
  coordinates, each averaged independently (the midpoint tradition): zodiacal longitude = the **shorter-arc midpoint** (an
  exactly-opposed pair — no shorter arc — takes the side nearer the composite
  Sun); ecliptic **latitude** = the plain mean; **declination** = the plain
  mean of the two charts' native declinations (each at its own moment);
  **right ascension** = the shorter-arc midpoint of the native RAs (ties break
  toward the composite Sun's RA midpoint, and a pair straddling opposition
  differently per frame keeps its RA on the longitude midpoint's side of the
  sky, so the map can never contradict the wheel by half a turn). A composite row is deliberately
  **not** a self-consistent 3D sky point — its declination is the mean of the
  parents' declinations, not the declination of its (longitude, latitude)
  point — so **In Mundo and In Zodiaco genuinely differ** for composites:
  In-Mundo lines are placed by the mean RA/declination, while In-Zodiaco and
  geodetic lines still derive from the longitude midpoint on the ecliptic.
  Bodies resolve only when both parents can compute them, and the lunar nodes
  follow the mean/true node setting; the South Node stays exactly
  antipodal to the North Node midpoint in all four coordinates by
  construction.
- **The wheel angles and houses** use the **midpoint method à la Robert Hand**:
  every angle and house cusp is the **shorter-arc midpoint of the two parents' own
  angles/cusps** (each cast at its own parent's place). So the composite
  **Ascendant** is the exact midpoint of the two natal Ascendants and the composite
  **Midheaven** is the exact midpoint of the two natal Midheavens — both read true
  on the wheel (matching Hand). Opposite points are kept exact
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
- **As a synastry partner** — compared against another chart rather than read as
  the chart itself — a composite keeps the same midpoint planets **and the same
  midpoint angles and houses**. A partner's angles are otherwise cast at the active
  point; a composite's are not cast anywhere, so they don't move with it. One
  composite therefore shows one set of angles in either role. (Casting it at the
  point from its frame moment would put the MC on the midpoint only along the
  parents' midpoint meridian, and the Ascendant never on the midpoint at all — the
  same limit as the map frame above.)
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

The chart wheel draws all twelve house cusps in any of **ten** systems, chosen by the house-system setting (houses shape the wheel only — no map line moves with it): **Placidus** (the default), **Koch**, **Regiomontanus**, **Campanus**, **Porphyry**, **Alcabitus**, **Meridian**, **Morinus**, **Whole Sign**, and **Equal**. All are computed natively by the Swiss Ephemeris, including polar-circle behaviour for the quadrant systems.

The two **axial** systems divide the celestial equator into equal 30° arcs from the MC's right ascension: **Meridian** projects them onto the ecliptic along hour circles, **Morinus** along circles through the ecliptic poles. In both, the **1st cusp is an East Point, not the Ascendant** — the rising degree floats free of the cusps, exactly as the angles already do in Equal and Whole Sign. Their reward is robustness: both stay fully defined at every latitude (Morinus references neither Ascendant, MC, nor Vertex at all), which makes them the systems of choice for polar-latitude charts, where the quadrant systems degrade.

The four angle axes (ASC/MC/DSC/IC) are drawn as bold diameters regardless of system; intermediate cusps that don't fall on an angle are drawn as spokes, so a system like Equal (whose 4th and 10th float off the meridian) renders correctly. The mini wheel shows the angles only, to stay legible at small size.

**What sits at due left** is the **1st house cusp**, not the Ascendant. Under every system whose first house begins at the rising degree the two are the same longitude and the ASC–DSC axis is a flat horizontal diameter, as it has always been. **Whole Sign** is the case where they part: its first house *is* a sign, beginning at 0° of the rising sign, so that boundary takes the left of the wheel and the Ascendant is drawn where it actually falls inside the first house — which is how whole-sign charts are drawn conventionally, and what makes the house divisions line up with the zodiac band rather than cutting across it. The ASC–DSC axis tilts accordingly there.

The wheel identifies that case from the cusps themselves — whole sign is the only system whose twelve cusps all sit on sign boundaries — rather than from the house-system setting, so a wheel rendered from stored angles alone (an export, a report) reaches the same layout as the live one. Equal houses are 30° apart too, but offset from the Ascendant; they coincide with this test only when the Ascendant is itself exactly on a boundary, where both anchors are the same degree anyway. **Meridian** and **Morinus** keep the Ascendant anchor: their first cusp is an East Point, and their cusps are not uniform, so the test does not catch them.

### The Vertex axis (Vx / Avx)

**Vx** and **Avx** behave exactly like the four classical angles, on the map and in the chart alike, and are shown or hidden the same way — both default off. The Vertex is the **prime vertical** (the great circle through due east, the zenith, and due west) taken on the **western** side; the **Anti-Vertex** is its eastern counterpart.

- **On the map**, a body's **Vx line** joins every place where that body stands exactly on the local prime vertical's western crossing (the Avx line its eastern) — curves traced by `tan(lat) = tan(dec)/cos(H)`, the prime-vertical counterpart of the rising/setting equation, drawn a touch thinner than the ASC/DSC lines and badged Vx/Avx at the viewport edge. Each curve runs from the body's zenith point to its antipode, spiking poleward a quarter-turn from the zenith. Every vertex is verified to sit exactly on the prime vertical, west or east as labelled.
- **In the chart**, showing them adds the relocated chart's **Vertex point** (the ecliptic ∩ prime-vertical intersection, the Swiss Ephemeris value — its axis verified against Robert Hand's closed form, its western branch from the point's azimuth) to the wheel and to the chart's position readouts. As with rising lines vs the rising degree, the body's Vx **line** is an in-mundo event, while the chart's Vertex **point** is its ecliptic reading; In Zodiaco projection aligns the two conventions.

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

**Switches to geodetic** when Mundane is on: all four angles (MC/IC meridians and ASC/DSC horizon curves), the zenith sub-points, the ecliptic reference line on the map, and the overlay lines. A directed overlay drawn while Mundane is active uses the geodetic mapping too: its angle meridians are placed by the same conversion, evaluated at the overlay date's obliquity.

**Keep the celestial sidereal-time reference** even in Mundane: **parans**. Their *placement* is intrinsically tied to the rotating sky at the birth moment (they read the Greenwich apparent sidereal-time reference directly), so that handle is deliberately left in the celestial frame rather than forced onto a time-independent grid. This is not a clean split, though: in Mundane mode parans are built from the same ecliptic-projected (zero-latitude) body positions as the angle lines. So while their placement frame stays sidereal-time-based, off-ecliptic bodies (Pluto, the Moon) still shift versus a true-sky celestial map. The overlay's parans behave the same way: sidereal placement on ecliptic-projected positions, not a full geodetic mapping. This hybrid behaviour is noted under Conventions below. **Local space** is not part of either list: it is not drawn in Mundane mode at all, and wherever it is drawn it uses true-sky positions (see [Local space](#local-space)).

### Why off-ecliptic bodies are projected (and why In Mundo/In Zodiaco is hidden)

For the MC to land *exactly* on a planet's zodiacal longitude, the planet must be read on the ecliptic. So in Mundane mode every body is first projected onto the ecliptic (its ecliptic latitude is set to zero) before its lines are drawn. After this projection the round-trip is exact and the MC sits precisely on the zodiacal degree. Because this projection is built into Mundane mode by definition, the separate **In Mundo / In Zodiaco** line-projection choice (which only matters in Celestial mode) does not apply under Mundane: there is no "In Mundo" choice to make once everything is already on the ecliptic. The difference this makes is largest for the high-latitude bodies, Pluto (up to ~17°) and the Moon (up to ~5°), whose rising/setting curves and zenith move relative to their true-sky (In Mundo) geometry. Because parans also consume these projected positions, they shift for the same bodies even though their placement stays celestial.

### Conventions used

- **Reference frame.** The math uses the *true obliquity of date*, Greenwich *apparent* sidereal time, and apparent positions (apparent rather than mean sidereal time differs by ~0.004°, which slightly shifts every meridian).
- **Greenwich = 0° Aries.** This is the Sepharial zodiacal convention; a competing scheme (often credited to L. Edward Johndro) anchors Greenwich differently. The app uses Sepharial-zodiacal, labelled "Mundane".
- **Projecting off-ecliptic bodies.** Forcing every body onto the ecliptic makes the MC exact, but it computes Pluto's and the Moon's ASC/DSC and zenith from their zero-latitude positions rather than their true-sky positions. This is intended for the angles other than MC/IC.
- **The ecliptic reference line.** In Mundane mode the ecliptic reference circle on the map follows the geodetic mapping.
- **Hybrid frame for parans.** In Mundane mode parans are built from ecliptic-projected (zero-latitude) bodies. Paran *latitudes* are identical in both line systems, and each paran's recorded intersection point follows the drawn lines' meridian mapping, so it lands on the visible crossing in either mode. (Local space is not shown in Mundane mode — see **Local space** — so it has no hybrid-frame behaviour here.)
- **Tropical, not sidereal.** The geodetic MC lands on the *tropical* zodiacal longitude; no ayanamsa offset is applied.

## Transits, and which frame they are drawn against

The **Angles** pair on the transits bar chooses which sidereal time the lines are framed by, and the two answers are different maps rather than different renderings of one. **Natal angles** holds the birth chart's own RAMC still and lets the transiting planets fall through it: the lines move only with the planets' own zodiacal motion, drifting slowly day to day. **Transit angles** frames each body against the moment's own sidereal time, so a line marks where that body is genuinely angular at that instant — the standard transit astrocartography, and what most other programs draw. The two can place the same line most of the globe apart (measured 0.01°–179.97°).

**Natal angles is the default, and the reason is a judgement rather than a convention.** It is the more intuitive first map for a reader who has come here to ask where to live: it holds still enough to be read across a season, where the moment's own frame sweeps about 15° an hour and only means anything at an instant deliberately chosen — an event, an election, a return. Someone weighing a move is not asking about 3:47 on a Tuesday.

## Returns (solar & lunar)

A return is the instant a transiting luminary comes back to its exact natal ecliptic longitude — the Sun once a year, the Moon roughly every 27.3 days. Snapping the transits overlay to one makes the resulting map the return chart's astrocartography.

**Solved, not rounded.** The instant is found by Newton iteration on `wrap(λ(t) − λ_natal)`, using the body's instantaneous longitude speed straight from the ephemeris as the derivative, to a tolerance of 1e-9 radians — about **5 milliseconds** of clock time. The timeline is set to that full-precision instant and only the *readout* is rounded to the displayed minute, so a return printed as 04:17 is being drawn at whatever second it truly falls on. This matters more than the display suggests: one arcminute of solar longitude is about 25 minutes of clock and therefore ~6° of map, so a root-finder that stopped at arcminute precision would be visibly wrong. This one stops nine orders of magnitude tighter.

**No precession correction.** The return is the transiting luminary back on its natal *tropical* longitude, with no precession adjustment applied — the common convention, and the one most software defaults to. A **precession-corrected** option is planned; until it exists, note that the two are not variants of one chart. Over 86 years precession accumulates about **1.20°**, which the Sun covers in roughly 30 hours near early June — some 90° of frame rotation, enough to move the return Moon most of a sign (21 Gemini to 10 Cancer on one test chart). Anyone comparing against a desktop program with its corrected setting on is looking at a different chart, not a refined one, and should expect the whole line set to sit elsewhere.

**Frame.** A return snap *borrows* the overlay frame for the return's own moment, because in the natal frame the returning body is pinned to its birth degree by construction and its lines would not move from one return to the next. The borrow is marked on screen and is given back when the reader leaves the return — see [When a setting changes by itself](forced-settings.md).

**Composites.** A composite chart's reference is its midpoint Sun/Moon, so a composite "return" is the transiting luminary arriving back on the *composite* point; the chart's stored moment is only its sidereal-frame anchor, not a sky to return to.

## Progressions & directions

Progressions and directions are drawn as **overlays** on the natal map, as transits and synastry are ("Progressed" is secondary progressions). A time-based overlay — transits, the progressions, solar arc, primary directions — draws a second, tagged set of lines for a target moment you choose; Synastry adds its own line-set but has no target moment (there is no date to move). The **primary angle lines** (MC/IC/ASC/DSC) show the natal and overlay sets together, but the four **auxiliary families** — aspect lines, midpoint lines, parans, and fixed-star lines — follow a **one-frame rule**: while one of these overlays is active they are drawn from the overlay's frame alone and their natal counterparts are hidden (never both), whether or not the natal lines are shown. Cyclocartography additionally draws no parans or midpoint lines at all (its two epochs share no single sky-moment). The Eclipses overlay is the sole exception and keeps the natal auxiliaries (see Parans). The underlying method is one setting per overlay: **Arc** (Solar Arc), **Angles** (Progressed/Tertiary) and **Rate** (Primary Directions).

### Arc, and progressed Angles (drives Solar Arc + Progressed)

The solar arc itself is the progressed Sun's distance from the natal Sun, measured either along the ecliptic or in right ascension; Naibod methods substitute a mean solar rate instead. On the map, **Solar Arc** advances every natal body by the arc (so the directed angles move with the bodies); **Progressed** keeps the progressed planets and uses its setting only to decide how the chart angle (the RAMC) advances.

**Which progressed Sun** is the overlay's own. Secondary progressions read it at the day-for-a-year instant; **tertiary progressions read it at the tertiary instant** — a day for a tropical month — the same one their bodies are read at, and the Naibod rate is measured over that interval likewise. One overlay, one instant: the angles and the bodies of a given chart are never derived from two different moments. (Until August 2026 the tertiary angle arc was taken from the secondary-progressed Sun, which made tertiary angles identical to secondary ones at the same date — two clocks inside one overlay, which is exactly what the one-instant rule above rules out.) Because the tertiary hand covers a full turn of solar motion every 27.32 years of life, its arc is the residue — an arc is a rotation, and only the residue means anything.

**Which month, and why we always say so.** The tertiary clock runs on the **tropical month — 27.32 days** — and the app names that number wherever it names the technique, which is deliberate. Three months could be meant, and they are not equally at stake:

| Month | Length | Effect on the tertiary instant at age 85 |
|---|---|---|
| Sidereal | 27.32166 d | differs by 4.7 minutes — **2.6 arcminutes** of Moon |
| **Tropical** *(used here)* | 27.32158 d | — |
| Synodic | 29.53059 d | differs by **85 progressed days** — Sun 84° apart, Moon three full cycles |

Sidereal versus tropical is immaterial: the seven-second gap is precession over one month and never compounds to anything readable. **Synodic is a different chart entirely.** So the risk is not that a reader picks the wrong one of the two 27-day months — it is that the common phrase "lunar month" reads as *synodic* to a good share of astrologers. Someone checking a progressed date against 29.53 days would compute 1,053 progressed days where this app uses 1,139, and conclude the app was wrong. Naming the number closes that: anyone who thinks in lunar months recognises 27.32 at once, and anyone who would have assumed synodic is corrected before being misled.

It also lets the cycle below explain itself. *The tertiary frame returns to natal every 27.32 years of life — the tropical month in days* reads as the identity it is; under "lunar month" it would read as a coincidence.

**The tertiary frame returns to its natal position every 27.32 years of life**, and that period is exact rather than approximate. A full turn of mean solar motion takes 360 ÷ 0.985647 = 365.24 progressed days — a tropical year of them — and on this clock each progressed day is a tropical month of life. So the period *in years* is the length of the tropical month *in days*: 27.32. At age 85 a chart is on its fourth lap, with about 43° of the fifth accumulated.

We state this because it appears to be a real cycle in the technique that the literature does not discuss — tertiary progressions are usually read over months, and a 27-year period in the angles is not something a table of positions makes visible. It is a consequence of the day-for-a-month ratio, not a choice of ours, and it would hold for any implementation that measures the angle arc on the tertiary clock. Readers doing original work with tertiary angles may find it worth more than the arc value itself.

**How the angles follow.** Under the two `…in Long` methods only the **Midheaven** is advanced in longitude directly; it is a point on the ecliptic, so for it "the chart shifts in longitude" and "the meridian moves" are the same statement. The **Ascendant is not a linear function of the RAMC**, and neither are the Vertex or the quadrant cusps — all of them depend on the latitude the chart is read at. So they are re-derived from the RAMC that culminates the directed MC, not shifted by the arc. Adding the arc to the Ascendant's longitude names a point that does not rise against the directed meridian at all: on the Jim Lewis chart at age 85 the two are 15° apart, and the arc-shifted one sits 17° below its own horizon.

These are **two controls**, not one, because the two overlays ask different questions of the same four calculations — on Solar Arc, how far the *bodies* advance; on progressions, how far the *angles* do. Solar Arc's is labelled **Arc**; the progressed overlays' is **Angles**, a `Natal angles` / `Progressed angles` pair with the calculation hanging off the second.

| Calculation | On Solar Arc (`Arc`) | On progressions (`Angles ▸ Progressed angles`) |
|---|---|---|
| **Solar arc — in longitude** *(Arc default)* | Each body advanced by the true solar arc, measured in ecliptic longitude (the classic method) | The **MC's** longitude advanced by the true solar arc; Ascendant, Vertex and house cusps then derived from the RAMC that culminates it |
| **Solar arc — in right ascension** | Each body advanced by the true solar arc, measured in right ascension | Angles advance the RAMC by the true solar arc in RA (`RAMC + arc`) |
| **Naibod, mean rate — in longitude** | Each body advanced by the Naibod mean rate (0.985647°/yr), in longitude | The **MC's** longitude advanced by the Naibod arc; the rest derived from the resulting RAMC, as above |
| **Naibod, mean rate — in right ascension** | Each body advanced by the Naibod mean rate, in RA | Angles advance the RAMC by the Naibod arc (`RAMC + arc`) |

**`Natal angles` is the progressed default, and it deliberately changes nothing:** the angles hold the natal RAMC, so the progressed planets fall through the birth chart's angular frame, consistent with the Transits overlay's own default. (The true quotidian progressed angle — the progressed chart's own sidereal time — remains a planned option.) With `Arc` defaulting to solar arc in longitude, an astrologer who opens neither control gets exactly the behaviour that existed before either existed.

*A retired fifth entry.* Both overlays shared one five-valued **Chart angle** menu until August 2026, whose extra member was labelled **Natal Frame** (storage key `mean-quotidian`, and "Mean Quotidian" in the UI until the June 2026 audit). It was a frame answer living in a list of calculations: on progressions it meant "hold the natal angles", which is now the `Angles` pair's first segment; on Solar Arc it had no distinct solar-arc form and fell through to solar arc in longitude, so the menu carried two entries with identical output. It survives as the internal value the natal-angles segment resolves to, and stored choices migrate unchanged — no map moves.

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

The default is **Ptolemy (1°/yr)**. **User rate** takes your own degrees-per-year value (positive values only; default 1).

### Line tags

The overlaid lines are tagged with a two-letter prefix: **Sp** secondary progressions, **Sa** solar arc, **Pd** primary directions (e.g. "Pd ♂ MC"), alongside **Tr** transits and **Sy** synastry. Cyclo·carto·graphy tags each of its per-body features by its actual source — **Sp** on the progressed personal planets (Sun–Mars), **Tr** on the transiting outers (and on its fixed-star lines). Because no single sky-moment spans its two epochs, it draws no paran or midpoint lines at all, so no combined-frame tag is used.

### Bi-wheel angle marks & the directed-overlay representation

With an overlay active, the chart wheel becomes a bi-wheel (natal inner ring, overlay outer ring). Two implementation notes from this layer:

- **Overlay MC/IC/AS/DS marks.** The outer ring marks the overlay chart's own four angles (with the same degree·sign·minute readout as the natal ring), shown or hidden with the same MC/IC/ASC/DSC filters. For the overlays with a genuine second moment (**Transits, Synastry**) the angles come straight from `relocate(jd, …)` at the active point — except a composite synastry partner, which keeps its midpoint angles (see *Relationship charts*). The active point is the point chosen on the map, else the point the pointer is resting on, else the base chart's birthplace — so, with nothing chosen or pointed at, a synastry partner's angles and houses are cast for **the base chart's birthplace, not their own**. That is deliberate: two people rarely share a birthplace, and casting each wheel at its own would read the pair on two different horizons, while casting the partner where the base chart is read keeps both wheels on one. Choosing a point casts both wheels for that point — the partner's own birthplace included, which is how to read them there. For the **directed and progressed** overlays (**Solar Arc, Primary Directions, Progressed**) the angles are **inferred**: the relocated *natal* angles are advanced by the overlay's arc (for the "…in Long" methods the **MC's** ecliptic longitude, with everything latitude-dependent re-derived from the RAMC that culminates it; **`RAMC + arc`** — the arc added to the RAMC, the angles re-derived on the advanced meridian — for the "…in RA" methods and Primary Directions; no advance at all under `Angles ▸ Natal angles`). Under the "…in RA" methods the wheel's angle marks and the map's frame agree exactly, at any pin. Under the "…in Long" methods they agree at the chart's own meridian and part by a bounded amount elsewhere — see *Where a directed frame is anchored* below. **The twelve house cusps are the directed chart's own** in both frames, re-derived from the same advanced RAMC rather than carried over from the natal chart; whole-sign cusps come back on their sign boundaries, which is what lets the wheel keep detecting whole sign and anchor itself on the *directed* rising sign. `MC + 180° = IC` / `ASC + 180° = DSC` are preserved by construction. *(Before the June 2026 audit the Progressed wheel showed the true-quotidian angles — `relocate(progressed JD)` — regardless of the chosen method, drifting ~1°/yr from the map's frame.)*

- **Primary Directions in the bi-wheel.** On the *map*, primary directions are the RAMC advancing while the bodies hold their natal RA/dec (a rigid westward rotation of the line-set). The bi-wheel shows the **bodies** at their directed positions via the mathematically-equivalent rigid RA rotation (arc carried in right ascension, declination unchanged), which draws the **identical** lines (the hour angle is unchanged); but the directed **MC/AS marks advance forward via `RAMC + arc`** — the classical meridian motion, so the directed MC advances ~1°/yr. Riding the bodies' rigid rotation instead would freeze the body-to-angle separations and creep the directed MC *backward* through the zodiac, contradicting the textbook heuristic — an angle has no declination to hold, so it is re-derived from the advanced RAMC rather than RA-shifted like a body.

### Conventions used

- **Defaults change nothing.** `Arc` defaults to solar arc in longitude and `Angles` to natal angles — between them exactly the behaviour that existed before either control did (and before the retired shared menu, whose `Natal Frame` default resolved to the same two things).
- **Solar arc, not "true solar arc".** Both the page and the UI say **solar arc** for the measured arc; the `Naibod, mean rate` label now carries the mean/true contrast, so "true" is no longer doing work in the name. It survives in the Primary-directions rate **True Solar Arc (RA)**, where the contrast is with the fixed-rate keys listed beside it.
- **Solar arc in RA, as applied to bodies.** "Solar arc in RA" names two different operations. **Adding the arc to a body's own right ascension:** the arc is a raw RA difference (progressed-Sun RA minus natal-Sun RA), added directly to every body's RA with declination left fixed, so the body travels along its own parallel. **Adding the arc to the meridian:** `RAMC + arc`, which rotates the whole frame and re-derives whatever then culminates. The app applies the first to the **bodies** and the second to the bi-wheel's directed **angles** — an angle is a meridian position fixed by the RAMC, with no independent declination to freeze — and the second is what the Progressed overlay's map frame already used, so the bi-wheel and map now agree (the old declination-fixed shift split them ~2.4° at age 30). Both are distinct from an along-the-ecliptic arc, which is what the `…in Long` methods apply.
- **Where a directed frame is anchored, and why it only matters for one family of methods.** The map's frame is stored as a Greenwich sidereal time, because the map is global. The question is which *meridian* the arc is applied at before it is expressed that way, and the answer differs between the two families — which is the part this page previously ran together.

  Under the `…in RA` methods and Primary Directions the question is empty: advancing the RAMC by an arc in right ascension is a **rigid rotation** of the celestial sphere, so every meridian advances by the same amount and the anchor is a free choice. Greenwich, the birthplace, the map pin — all three give the identical frame.

  Under the `…in Long` methods it is not. "Add the arc to the culminating degree" gives a *different* RA advance at every meridian, because the ecliptic-to-equator map is nonlinear, so **no single global frame satisfies it everywhere** and the anchor decides the one meridian where it holds. That meridian is the **chart's own** — the only one with a claim to it, where Greenwich has none. The frame culminates the directed MC at the birthplace, which is the MC the wheel prints. (Anchoring at Greenwich instead drew a frame a few degrees off — measured 3.74° at Yonkers on the Jim Lewis chart, and varying with the chart's longitude, which is what made it look like a moving target rather than a constant offset. Corrected August 2026.)

  **The residual this leaves, which is a property of the method and not a defect.** Because a longitude arc is not rigid, a wheel read at a *relocated* point cannot agree exactly with the global frame: the Midheaven parts from it by up to a few degrees as the pin moves away from the birth meridian (zero at the birthplace, largest around 90° of right ascension from it), and the Ascendant cannot be made to agree anywhere, since one sidereal parameter cannot satisfy two angle conditions at once. The `…in RA` methods have no such residual. If exact map/wheel agreement at an arbitrary relocation matters more than the longitude convention itself, that is the reason to prefer them.
- **School names live here, not in the app.** This page names Kepler for the solar-daily-motion key and Placidus for the arc the `True Solar Arc (RA)` rate is built on, because a reference page is where an attribution is useful. The controls themselves do not: a rate picker says what the rate *does*, since the reader choosing one needs to know how much arc accrues per year, not whose name is attached. The two are meant to be read together — the control to choose, the page to place what was chosen.
- **The mundo/zodiacal seam reaches the angles too.** Every statement above about where a directed or progressed angle *falls* is a statement about the meridian mapping, which the line system and line projection also govern: under Mundane the angle meridians are placed by the geodetic conversion at the overlay date's obliquity, and under In Zodiaco every body is read at zero ecliptic latitude first. So an angle treatment and a projection are not independent choices about the same line — see **Dated arrivals** for the same seam on the timing side, where a body with latitude reaches its degree and its meridian at different instants.
- **Forward only.** Primary Directions (and the positive-only user rate) always direct *forward*; there is no converse/backward option.
- **Neither setting reaches a dated arrival's target.** The arc/angle settings and the primary rate move the bodies and the drawn frame; the angle a moving body is timed *against* is the natal-relocated one, held fixed under every value of any of them (see "Dated arrivals" above). `Arc` reaches only the solar-arc mover — not the progressed or primary ones — so those two families give identical dates under all four of its values. `Angles`, on the progressed overlays, reaches neither the mover nor the target: it moves the drawn FRAME alone, which is why a non-natal setting there parts the map from the dates without changing them.
- **"True Solar Arc (RA)" naming.** This rate (storage key `placidus-ra`) is the true secondary-progressed solar arc in RA applied as a primary-direction rate, not a Placidian semi-arc / mundane primary direction. It was formerly labelled "Placidus: True SA in RA", which wrongly implied a classical Placidus technique; the label now drops the Placidus attribution.
- **Day-for-a-year constant.** The year length used is 365.2422 days (the tropical year), which sets both the progressed date and every per-year rate.
- **Naibod precision.** The Naibod rate is 0.985647°/yr (59′08″); in the app it appears as 0.985647°/yr in the Primary-rate hint and rounded to 0.9856°/yr in the angle-progression hint.
- **Directed-overlay bi-wheel.** All overlays draw second-ring angle marks. Transits and Synastry take them from `relocate(jd, …)` at the active point (a composite partner keeps its midpoint angles); the directed overlays (Solar Arc, Primary Directions, and Progressed under `Progressed angles`) **infer** them by advancing the relocated natal angles by the overlay's arc — the MC's longitude for the "…in Long" methods, with the rest derived from the RAMC that culminates it; via `RAMC + arc` for the "…in RA" methods and Primary Directions; and not at all under `Natal angles` (see "Overlay MC/IC/AS/DS marks" above). The Primary-Directions bi-wheel still shows the bodies at their *directed* RA positions (the rigid rotation that draws the identical map lines); only the angle marks use `RAMC + arc`.

## Glossary

- **RAMC:** Right Ascension of the Midheaven, the point of the celestial equator culminating on the upper meridian; the single sidereal-time handle that fixes where every angle falls in longitude.
- **Solar arc:** the distance the secondary-progressed Sun has moved from its natal place (the day-for-a-year Sun); in solar-arc directions every body is advanced by this same arc.
- **Naibod:** a mean solar rate of 0°59′08″ per year (0.985647°), used as a time-key in place of the Sun's true motion.
- **Cardan:** a mean solar rate of 0°59′12″ per year (0.986667°).
- **Ptolemy key:** the "one degree for one year" rate (1°/yr), the simplest primary-directions time-key.
- **Quotidian:** "of each day", the progressed angle obtained from the day-for-a-year sidereal time (the genuine progressed chart angle).
- **Mundane / geodetic:** placing the zodiac directly onto the Earth's longitudes (here Greenwich = 0° Aries), so each angle's location is fixed by zodiacal position rather than by birth time.
- **Hypothetical point:** a point with no observed physical body, whose position is defined entirely by a published set of orbital elements — here the eight Uranian points, TransPluto and Selena (see [Hypothetical points](#hypothetical-points)).
- **Planetary hour:** one twelfth of the daylight (sunrise to sunset) or of the night (sunset to the next sunrise) at a place, ruled in turn by the planets in the Chaldean order; the planetary day they make up begins at sunrise and is ruled by the planet of its weekday.
- **Zenith / sub-planetary point:** the single spot on Earth where a body stands exactly overhead (altitude 90°), sitting on its MC line at the latitude equal to its declination. With **In Zodiaco** (or Mundane) selected, the stamp marks the sub-point of the body's *ecliptic-projected* position — keeping it on the In-Zodiaco MC line — which for an off-ecliptic body is not the physical overhead point (Pluto can differ by ~17° of latitude, the Moon by ~5°). The lunar nodes draw no stamp: the nodal axis renders as one merged two-toned line, and its two antipodal sub-points would label the same axis twice.

## How this was validated

The astronomical engine is the Swiss Ephemeris running client-side, reading self-hosted JPL DE441 data files. A June 2026 ephemeris audit verified those files against JPL Horizons — Moon apparent RA and declination within 0.03″ and 0.01″, Greenwich apparent sidereal time within 0.08″ — and any program reading the same ephemeris data therefore lands in the same place, to well under an arcsecond. A single obliquity (true-of-date) and a single Greenwich apparent sidereal-time reference drive every line, paran, local-space, geodetic, and directed calculation, so the systems stay mutually consistent at the chart instant.

A second, deeper audit (June 2026) verifies the app's **own geometry code** — not a re-derivation, the very modules the app ships — under Node against independent oracles (`scripts/verify-*.ts`, run via a harness that swaps the WASM ephemeris for the native one over the same data files):

- every ASC/DSC line vertex sits on the geometric horizon and is genuinely *rising* on ASC lines / *setting* on DSC lines (altitude finite-differences), and the Swiss Ephemeris's independent rise/transit/set search reproduces the chart instant at points on the lines to seconds;
- polyline sampling strays at most ~0.004° off the true curves;
- every paran latitude is confirmed by event simultaneity, and an independent brute-force scan finds *exactly* the paran set the closed forms produce — nothing missing, nothing extra;
- local-space azimuths match JPL Horizons and the navigation bearing to the body's sub-point;
- the Sun's visible sunrise and sunset agree with the Swiss Ephemeris's own rise/transit/set search (upper edge, standard atmosphere) within 9 seconds up to 60° of latitude and 14 seconds at 64°, through 2026 and on dates in 1850 and 2150; the daily times and the planetary day come from one computation and agree to within milliseconds; the planetary hours tile each day exactly, every day's 25th hour falls on the next weekday's planet, and the hours before sunrise, clock changes, the date line, polar night, midnight sun and sunrises before local midnight are each pinned by named cases;
- relocated angles match an independent closed-form ASC/MC computation to machine precision, and a polar-latitude battery covers all eight house systems;
- the time chain is pinned by tz-database goldens (LMT-era, Paris Mean Time, 1918 DST, double summer time, half-hour zones), calendar-reform continuity, and Horizons checks of the Moon and apparent sidereal time (≤0.1″);
- progression ratios, solar-arc and primary-direction keys, transit frames, synastry framing, and the Davison midpoints are each pinned by exact assertions;
- numbered minor planets: file names against the engine's own naming, the file check that runs before the engine ever sees a file, the edges of each file's span, sampling one body at a time, lines and zenith points against the engine's own right ascension, declination and sidereal time, geometry identical to a planet's at the same place, the place in the chart against the body's own lines (its longitude, put on the ecliptic, culminates where its MC line is drawn, and with its latitude gives back the right ascension and declination its In Mundo lines are drawn from, to a few millionths of an arcsecond), a sidereal shift and an azimuth and altitude each identical to a planet's in the same place, a stationary flag raised at every station the engine's own speeds locate, for planets and minor planets alike, and JPL Horizons — at seven epochs for Eros and Eris, then at four dates from 1880 to 2090 for sixteen bodies from the main belt to beyond Neptune, Chiron and Ceres among them, each gap reported beside Horizons' own uncertainty (the figures under [Numbered minor planets](#numbered-minor-planets)). Past the end of every short file (1 January 2300) none of those bodies is given a position, while Pholus, read from the main-asteroid file, still is. Every body listed under *What ships* in [Numbered minor planets](#numbered-minor-planets) has the orbit class of the group it appears in;
- hypothetical points: the elements file checked against the published one, every element line identical (only some comment lines are removed); nothing computed until the file is proven read (without it the engine answers Kronos 14″ off, silently, and cannot compute Selena at all), and nothing computed if it cannot be; thirty independently computed reference longitudes for the ten points, in 1990, 2000 and 2026, reproduced within 0.2″, with Cupido's and Hades' latitudes; In Zodiaco within 0.02° of In Mundo for the eight points near the ecliptic at those dates, and more than half a degree away for Cupido and Hades; and, on Cupido, the same line-geometry and chart-placement checks as a minor planet's.

The geodetic mode is checked by the round-trip identity that makes it work: projecting a body onto the ecliptic and converting back, the MC lands exactly on its zodiacal longitude. The Progressions & Directions defaults are chosen to change nothing already in use: `Arc` = solar arc in longitude and `Angles` = natal angles reproduce the prior Solar Arc and Progressed behaviour exactly. The Primary Directions overlay uses standard mean-rate and solar-rate time-keys applied as a rigid rotation of the angles, conventional for an angle-only treatment. Directed and progressed positions follow the Lunar-node setting (default **True** node), the same convention used everywhere else in the chart; there is no separate node setting for the directed math.
