// Quick sanity check: compute planet positions for Einstein's birth and a known reference date,
// then print MC line longitudes. Compare against astro.com's free ACG tool / Astrodienst ephemeris.
import {
  julian,
  planetposition,
  elliptic,
  solar,
  moonposition,
  pluto,
  sidereal,
  nutation,
  coord,
} from 'astronomia';
import data from 'astronomia/data';

const earth = new planetposition.Planet(data.vsop87Bearth);
const mercury = new planetposition.Planet(data.vsop87Bmercury);
const venus = new planetposition.Planet(data.vsop87Bvenus);
const mars = new planetposition.Planet(data.vsop87Bmars);
const jupiter = new planetposition.Planet(data.vsop87Bjupiter);
const saturn = new planetposition.Planet(data.vsop87Bsaturn);
const uranus = new planetposition.Planet(data.vsop87Buranus);
const neptune = new planetposition.Planet(data.vsop87Bneptune);

function jdOf(year, month, day, hour, minute, tzOffset) {
  const utcHour = hour + minute / 60 - tzOffset;
  const dayFraction = day + utcHour / 24;
  return new julian.CalendarGregorian(year, month, dayFraction).toJD();
}

function gmstRad(jd) {
  return ((sidereal.mean(jd) / 86400) * 2 * Math.PI) % (2 * Math.PI);
}

function moonEq(jd) {
  const { lon, lat } = moonposition.position(jd);
  const [dpsi, deps] = nutation.nutation(jd);
  const eps = nutation.meanObliquity(jd) + deps;
  return new coord.Ecliptic(lon + dpsi, lat).toEquatorial(eps);
}

function fmtDeg(rad) {
  let d = (rad * 180) / Math.PI;
  if (d < 0) d += 360;
  return d.toFixed(2);
}

function fmtLng(rad, gmst) {
  let d = ((rad - gmst) * 180) / Math.PI;
  d = ((d + 180) % 360 + 360) % 360 - 180;
  return d.toFixed(2);
}

function report(label, year, month, day, hour, minute, tzOffset) {
  const jd = jdOf(year, month, day, hour, minute, tzOffset);
  const gmst = gmstRad(jd);
  console.log(`\n=== ${label} ===`);
  console.log(`JD: ${jd.toFixed(5)}    GMST: ${fmtDeg(gmst)}°`);

  const sun = solar.apparentEquatorialVSOP87(earth, jd);
  const moon = moonEq(jd);
  const me = elliptic.position(mercury, earth, jd);
  const ve = elliptic.position(venus, earth, jd);
  const ma = elliptic.position(mars, earth, jd);
  const ju = elliptic.position(jupiter, earth, jd);
  const sa = elliptic.position(saturn, earth, jd);
  const ur = elliptic.position(uranus, earth, jd);
  const ne = elliptic.position(neptune, earth, jd);
  const pl = pluto.astrometric(jd, earth);

  const planets = [
    ['Sun', sun],
    ['Moon', moon],
    ['Mercury', me],
    ['Venus', ve],
    ['Mars', ma],
    ['Jupiter', ju],
    ['Saturn', sa],
    ['Uranus', ur],
    ['Neptune', ne],
    ['Pluto', pl],
  ];
  console.log('Planet    RA°      Dec°    MC-line lng°');
  for (const [n, p] of planets) {
    console.log(
      `${n.padEnd(8)} ${fmtDeg(p.ra).padStart(7)} ${(
        (p.dec * 180) /
        Math.PI
      )
        .toFixed(2)
        .padStart(7)} ${fmtLng(p.ra, gmst).padStart(8)}`,
    );
  }
}

// Einstein: 1879-03-14 11:30 LMT (Ulm 9.9876°E → tz offset ~+0.6166h)
report('Einstein 1879-03-14 11:30 LMT Ulm', 1879, 3, 14, 11, 30, 0.6166666666666667);

// J2000.0 epoch: 2000-01-01 12:00 UTC. Sun's RA should be ~281°, GMST ~18.7° (1h14m → 18.7°)
report('J2000.0 reference (2000-01-01 12:00 UTC)', 2000, 1, 1, 12, 0, 0);

// Today-ish to sanity check current ephemeris
report('2024-06-21 12:00 UTC (summer solstice)', 2024, 6, 21, 12, 0, 0);
