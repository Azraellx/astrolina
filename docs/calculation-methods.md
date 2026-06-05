# Astrocartography — Calculation Method Notes (for review)

This note describes two newly added calculation features in the astrocartography app — the **Geodetic ("Mundane")** line mode and the **Progressions & Directions** overlays (Solar Arc, Secondary Progressions, Primary Directions). It is written for you as the app's primary astrologer-reviewer: it lays out, in plain astrological terms, the conventions that were chosen and — at the end of each section — the specific decisions flagged for your confirmation. The underlying positions come from the Swiss Ephemeris — the same engine the professional desktop tools use — reading genuine JPL DE441 data, with agreement to those tools well under an arcsecond (see the companion note *differences-vs-pro-tools*). So the question under review is never the planetary accuracy — only whether the *conventions* match what a professional would expect.

## How the lines work (quick model)

An astrocartography line is the set of places on Earth where a chosen body sits exactly on one of the four chart angles at the chart's moment. Each body draws its own four lines: **MC** (the body culminating on the upper meridian), **IC** (the lower meridian — always the exact antipode of the MC), and **ASC / DSC** (the body on the eastern/western horizon, rising/setting). MC and IC lines are straight north–south meridians (lines of constant geographic longitude); ASC and DSC lines are the curves traced as the body's hour angle sweeps out. Each body also gets a **zenith** (sub-planetary) stamp: the single point where it stands exactly overhead, sitting on the MC line at the latitude equal to the body's declination.

In the standard ("Celestial") map, the longitude of each angle is driven by sidereal time: a body's meridian longitude equals its right ascension minus Greenwich *apparent* sidereal time. That single sidereal-time reference is what ties the whole map to the chart's exact moment.

## 1. Geodetic ("Mundane") lines

### What it is & when to use it

"Mundane" mode switches the entire map from standard astrocartography to **Sepharial's geodetic equivalents**. Instead of placing each angle by the clock-and-sidereal-time of the birth, it anchors every angle to the Earth's longitudes through the zodiac itself — so the map becomes *independent of birth time*. Use it when you want to read a chart's planets against a fixed zodiacal grid laid over the globe, the classic geodetic technique, rather than against the moment-specific sidereal map.

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

The two systems differ in exactly one step — how a meridian's right ascension becomes a geographic longitude:

- **Celestial (standard):** longitude = right ascension − Greenwich apparent sidereal time. Time-dependent.
- **Mundane (geodetic):** longitude = the zodiacal longitude that corresponds to that right ascension, with no sidereal-time term at all.

Precisely, the geodetic longitude is `λ = atan2(sin α, cos α · cos ε)`, where α is the right ascension and ε the obliquity of the ecliptic — i.e. the ecliptic longitude (at zero latitude) whose right ascension is α. This is applied to the body's right ascension *after* it has been projected onto the ecliptic (latitude zeroed); the projection and this conversion together recover the body's zodiacal longitude. With Greenwich pinned at 0° Aries, that longitude *is* the geographic longitude of the meridian. IC is still MC + 180°, and ASC/DSC still meet cleanly at their shared apex and nadir, in both systems.

### Scope: what switches, what stays celestial

**Switches to geodetic** when Mundane is on: all four angles (MC/IC meridians and ASC/DSC horizon curves), the zenith sub-points, the ecliptic reference line on the map, and the timeline/overlay layer. A directed overlay drawn while Mundane is active uses the geodetic mapping too — its angle meridians are placed by the same conversion, evaluated at the overlay date's obliquity.

**Keep the celestial sidereal-time reference** even in Mundane: **parans** and **local space**. Their *placement* is intrinsically tied to the rotating sky at the birth moment — they read the Greenwich apparent sidereal-time reference directly — so that handle is deliberately left in the celestial frame rather than forced onto a time-independent grid. Note, however, that this is not a clean split: in Mundane mode parans and local space are built from the same ecliptic-projected (zero-latitude) body positions as the angle lines. So while their placement frame stays sidereal-time-based, off-ecliptic bodies (Pluto, the Moon) still shift versus a true-sky celestial map. The overlay's parans and local space behave the same way — sidereal placement on ecliptic-projected positions, not a full geodetic mapping. This hybrid behaviour is a flagged decision (below).

### Why off-ecliptic bodies are projected (and why In Mundo/In Zodiaco is hidden)

For the MC to land *exactly* on a planet's zodiacal longitude, the planet must be read on the ecliptic. So in Mundane mode every body is first projected onto the ecliptic — its ecliptic latitude is set to zero — before its lines are drawn. After this projection the round-trip is exact and the MC sits precisely on the zodiacal degree. Because this projection is built into Mundane mode by definition, the separate **In Mundo / In Zodiaco** "Line projection" control (which only matters in Celestial mode) is hidden when Mundane is selected — there is no "In Mundo" choice to make once everything is already on the ecliptic. The difference this makes is largest for the high-latitude bodies — Pluto (up to ~17°) and the Moon (up to ~5°) — whose rising/setting curves and zenith move relative to their true-sky (In Mundo) geometry. Because parans and local space also consume these projected positions, they shift for the same bodies even though their placement stays celestial.

### How to turn it on

Open the sidebar and click the **Calculation** header to expand it (the sidebar shows one section at a time, and **Filters** is open by default). The first radio group at the top of Calculation (no title) offers **Celestial** and **Mundane**. Choose **Mundane**. The hint under it reads: *"Mundane / geodetic — the zodiac mapped onto Earth's longitudes (Greenwich = 0° Aries), independent of birth time."* Once Mundane is chosen, the **In Mundo / In Zodiaco** "Line projection" control disappears from the same panel (everything is already on the ecliptic). The choice is remembered between sessions.

### ✔ Points to confirm

- **Reference frame.** The math uses the *true obliquity of date*, Greenwich *apparent* sidereal time, and apparent positions. Sepharial's original work predates this precision — confirm true-of-date obliquity (rather than mean, or a fixed J2000 frame), and apparent rather than mean sidereal time (~0.004° different), are the intended geodetic conventions, since each slightly shifts every meridian.
- **Greenwich = 0° Aries.** This is the Sepharial zodiacal convention; a competing scheme (often credited to L. Edward Johndro) anchors Greenwich differently / sidereally. Confirm Sepharial-zodiacal is the one you want, and that "Mundane" is the right label (vs "Geodetic" or "Sepharial").
- **Projecting off-ecliptic bodies.** Forcing every body onto the ecliptic makes the MC exact, but it computes Pluto's and the Moon's ASC/DSC and zenith from their zero-latitude positions, not their true sky positions. Confirm this is the desired geodetic behavior for the angles *other than* MC/IC.
- **The ecliptic reference line.** It currently follows the geodetic mapping in Mundane mode. Decide whether the ecliptic reference circle on the map *should* follow the geodetic frame (as it does now) or remain a fixed celestial reference.
- **Hybrid frame for parans / local space.** In Mundane mode parans and local space keep the celestial sidereal-time placement but are built from ecliptic-projected (zero-latitude) bodies — so they differ from a true-sky celestial map *and* from a fully geodetic one. Confirm this hybrid is astrologically coherent to display alongside the geodetic angles, or whether parans/local space should instead be hidden in Mundane mode.
- **Tropical, not sidereal.** The geodetic MC lands on the *tropical* zodiacal longitude; no ayanamsa offset is applied. Confirm tropical (not sidereal) is intended.

## 2. Progressions & Directions

These are chosen from the top-bar **Overlay** menu (None, Transits, Progressed, Solar Arc, Primary Directions, Synastry). Selecting one of the time-based modes (Progressed, Solar Arc, Primary Directions, Transits) draws a second, tagged set of lines over the natal map and reveals a timeline bar to set the target moment; Synastry adds its own line-set but has no timeline (there is no date to scrub).  Two dropdowns in the **Calculation** tab choose the underlying method: **Chart angle progression** (drives Solar Arc + Progressed) and **Primary directions rate** (drives Primary Directions).

### Chart angle progression (drives Solar Arc + Progressed)

The solar arc itself is the progressed Sun's distance from the natal Sun (the day-for-a-year secondary-progressed Sun), measured either along the ecliptic or in right ascension; Naibod methods substitute a mean solar rate instead. On the map, **Solar Arc** advances every natal body by the arc (so the directed angles move with the bodies); **Progressed** keeps the day-for-a-year progressed planets and uses the setting only to decide how the chart angle (the RAMC) advances.

| Method | On Solar Arc directions | On Secondary Progressions |
|---|---|---|
| **SA in Longitude** | Each body advanced by the true solar arc, measured in ecliptic longitude (the classic default) | Angles advanced by the true solar arc in longitude |
| **SA in RA** | Each body advanced by the true solar arc, measured in right ascension | Angles advanced by the true solar arc in RA |
| **Naibod in Long** | Each body advanced by the Naibod mean rate (0.985647°/yr), in longitude | Angles advanced by the Naibod arc, in longitude |
| **Naibod in RA** | Each body advanced by the Naibod mean rate, in RA | Angles advanced by the Naibod arc, in RA |
| **Mean Quotidian** *(default)* | *No distinct quotidian solar-arc → behaves as SA in Longitude* | The progressed sidereal time (the angle of the progressed chart) |

**The default is Mean Quotidian, and it deliberately changes nothing** — it preserves exactly the behaviour that existed before this dropdown was added. On Secondary Progressions it gives the genuine progressed sidereal time (the quotidian progressed angle); on Solar Arc, where "quotidian" has no distinct meaning, it behaves as **SA in Longitude**. So an astrologer who never opens the dropdown gets SA-in-longitude on the Solar Arc map and the progressed-angle on the Progressed map — the prior defaults.

### Primary Directions (new overlay)

Primary Directions here model the **primary (diurnal) motion**: the daily rotation of the heavens carries the chart's angles forward, while the planets themselves stay at their natal places in the sky (natal right ascension and declination unchanged). The *rate* you choose is the time-key — how much arc accrues per year of life. As that arc is applied, the directed RAMC advances and **the entire set of lines rotates rigidly with it**: a positive arc directs forward, the RAMC increases, and every line shifts **west** by the same amount. (This is an angle-only treatment — a rigid rotation of the line-set by an arc-per-year key — not a classical promissor-to-significator mundane direction with latitude.)

| Rate (key) | Arc per year |
|---|---|
| **Ptolemy** *(default)* | 1° per year (one degree = one year) |
| **Naibod** | 0°59′08″ per year (0.985647° — the Sun's mean motion) |
| **Cardan** | 0°59′12″ per year (0.986667°) |
| **Kepler — natal solar RA** | The natal Sun's daily motion in right ascension × years |
| **Natal solar — longitude** | The natal Sun's daily motion in ecliptic longitude × years |
| **Placidus — true SA in RA** | The true secondary-progressed solar arc in RA (nonlinear with time) |
| **User rate** | Your own degrees-per-year value |

The default is **Ptolemy (1°/yr)**. Choosing **User rate** reveals a number field directly below for entering your own degrees-per-year (positive values only; default 1).

### How to use both

1. From the top bar, open **Overlay** and choose **Progressed**, **Solar Arc**, or **Primary Directions**.
2. A **timeline bar** appears across the bottom — drag it to set the target date.
3. In the sidebar **Calculation** tab, set **Chart angle progression** (for Progressed/Solar Arc) or **Primary directions rate** (for Primary Directions). Each shows a hint describing the selected method; the angle-progression hint ends with *"Drives the Solar Arc and Progressed overlays."*
4. The overlaid lines are tagged with a two-letter prefix — **Sp** secondary progressions, **Sa** solar arc, **Pd** primary directions (e.g. "Pd ♂ MC"), alongside **Tr** transits and **Sy** synastry.
5. The timeline's readout shows the directed amount: **Progressed** → "Age N.N"; **Solar Arc** and **Primary Directions** → the arc in degrees (e.g. "30.2°").

All three settings are remembered between sessions.

### Bi-wheel angle marks & the directed-overlay representation

With an overlay active, the expanded chart wheel becomes a bi-wheel (natal inner ring, overlay outer ring). Two implementation notes from this layer:

- **Overlay MC/IC/AS/DS marks.** The outer ring marks the overlay chart's own four angles, gated by the same MC/IC/ASC/DSC filter toggles as the natal angles. These are drawn for the **time-based** overlays — **Transits, Progressed, Synastry** — whose second moment is a real Julian Day, so the angles come straight from `relocate(jd, …)`. They are **deliberately not drawn for Solar Arc or Primary Directions**: those advance the RAMC *frame* rather than sitting at a second JD, and the bundled Swiss-Ephemeris wrapper exposes only JD-based house calculation (no `houses_armc`), so converting their directed RAMC into MC/ASC angles isn't available. Drawing the *natal* angles there would be misleading, so they're omitted rather than approximated.

- **Primary Directions in the bi-wheel.** On the *map*, primary directions are described above as the RAMC advancing while the bodies hold their natal RA/dec (a rigid westward rotation of the line-set). The bi-wheel uses the mathematically-equivalent view — the bodies carry the arc in right ascension (declination unchanged) against the natal frame — which draws the **identical** lines (the hour angle is unchanged) but lets the overlay ring show the bodies at their **directed** zodiac positions instead of duplicating the natal ring. Both are the same rigid rotation; only the chosen frame differs.

### ✔ Points to confirm

- **Mean-Quotidian default on Solar Arc.** Because it is the default and has no distinct solar-arc form, it gives SA-in-longitude on Solar Arc. Confirm this default pairing (SA-in-longitude on Solar Arc, progressed-angle on Progressed) is what you want out of the box.
- **"SA in RA" definition.** This computes the arc as a raw RA difference (progressed-Sun RA − natal-Sun RA) and adds it directly to every body's RA, leaving declination fixed. That differs from an along-the-ecliptic arc and from how some programs define "solar arc in RA." Confirm a literal RA increment is intended.
- **Angles anchored to Greenwich.** All directed angles advance the natal *Greenwich* RAMC, not the birthplace's local sidereal time. For astrocartography this is internally consistent, but confirm you expect the directed MC referenced to Greenwich rather than the birthplace meridian.
- **Forward only.** Primary Directions (and the positive-only user rate) always direct *forward* — there is no converse/backward option. Confirm converse directions are intentionally out of scope.
- **"Placidus — true SA in RA" naming.** This rate is the true secondary-progressed solar arc in RA — *not* a Placidian semi-arc/mundane primary direction. Confirm the label won't be mistaken for classical Placidus directions.
- **Day-for-a-year constant.** The year length used is 365.2422 days (the tropical year), which sets both the progressed date and every per-year rate. Confirm this is the desired constant (vs 365.25 or a true solar-return interval).
- **Naibod precision wording.** The Naibod rate reads 0.985647°/yr (59′08″) throughout this note; in the app it appears as 0.985647°/yr in the Primary-rate hint but as 0.9856°/yr in the angle-progression hint. Confirm whether the in-app rounding/wording should be unified.
- **Directed-overlay bi-wheel.** Solar Arc / Primary Directions draw **no** second-ring angle marks (the ephemeris wrapper has no ARMC-based houses to direct them); Transits / Progressed / Synastry do. And the Primary-Directions bi-wheel shows the bodies at their **directed** RA positions, not the classical fixed-bodies / moving-angles view. Confirm both choices are acceptable, or flag if Solar Arc / Primary angles should be approximated instead of omitted.

## Glossary

- **RAMC** — Right Ascension of the Midheaven: the point of the celestial equator culminating on the upper meridian; the single sidereal-time handle that fixes where every angle falls in longitude.
- **Solar arc** — the distance the secondary-progressed Sun has moved from its natal place (the day-for-a-year Sun); in solar-arc directions every body is advanced by this same arc.
- **Naibod** — a mean solar rate of 0°59′08″ per year (0.985647°), used as a time-key in place of the Sun's true motion.
- **Cardan** — a mean solar rate of 0°59′12″ per year (0.986667°).
- **Ptolemy key** — the "one degree for one year" rate (1°/yr), the simplest primary-directions time-key.
- **Quotidian** — "of each day": the progressed angle obtained from the day-for-a-year sidereal time (the genuine progressed chart angle).
- **Mundane / geodetic** — placing the zodiac directly onto the Earth's longitudes (here Greenwich = 0° Aries), so each angle's location is fixed by zodiacal position rather than by birth time.
- **Zenith / sub-planetary point** — the single spot on Earth where a body stands exactly overhead (altitude 90°), sitting on its MC line at the latitude equal to its declination.

## How this was validated

The astronomical engine is the Swiss Ephemeris running client-side, reading self-hosted JPL DE441 data files — the same data lineage the desktop tools rely on. A June 2026 ephemeris audit verified those files against JPL Horizons; agreement with the professional desktop tools is well under an arcsecond (see the companion note *differences-vs-pro-tools*). A single obliquity (true-of-date) and a single Greenwich apparent sidereal-time reference drive every line, paran, local-space, geodetic, and directed calculation, so the systems stay mutually consistent at the chart instant.

The geodetic mode was checked by the round-trip identity that makes it work: projecting a body onto the ecliptic and converting back, the MC lands exactly on its zodiacal longitude. The Progressions & Directions defaults were chosen to change nothing already in use — Mean Quotidian reproduces the prior Solar Arc (SA-in-longitude) and Progressed (progressed-angle) behaviour exactly. The Primary Directions overlay uses standard mean-rate and solar-rate time-keys applied as a rigid rotation of the angles; that math is conventional for an angle-only treatment, but — as with the geodetic conventions above — the *choices* (forward-only, Greenwich-anchored, the rate labels) are flagged above for your sign-off rather than asserted as settled. Directed and progressed positions follow the sidebar's Lunar-node setting (default **True** node), the same convention used everywhere else in the chart — there is no separate node setting for the directed math.
