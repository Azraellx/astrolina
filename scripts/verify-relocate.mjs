import { julian, sidereal, nutation } from 'astronomia';

function jdOf(y, m, d, h, min, tz) {
  const utcH = h + min / 60 - tz;
  const df = d + utcH / 24;
  return new julian.CalendarGregorian(y, m, df).toJD();
}

function gmstRad(jd) {
  return ((sidereal.mean(jd) / 86400) * 2 * Math.PI) % (2 * Math.PI);
}

function obliquity(jd) {
  const [, deps] = nutation.nutation(jd);
  return nutation.meanObliquity(jd) + deps;
}

function relocate(jd, latDeg, lngDeg) {
  const eps = obliquity(jd);
  const gmst = gmstRad(jd);
  const phi = (latDeg * Math.PI) / 180;
  const lst = (gmst + (lngDeg * Math.PI) / 180 + 2 * Math.PI) % (2 * Math.PI);
  const sinLst = Math.sin(lst);
  const cosLst = Math.cos(lst);
  const cosEps = Math.cos(eps);
  const sinEps = Math.sin(eps);

  let mc = Math.atan2(sinLst, cosLst * cosEps);
  if (mc < 0) mc += 2 * Math.PI;

  let asc = Math.atan2(-cosLst, sinLst * cosEps + Math.tan(phi) * sinEps);
  if (asc < 0) asc += 2 * Math.PI;
  let diff = ((asc - mc) + 2 * Math.PI) % (2 * Math.PI);
  if (diff > Math.PI) asc = (asc + Math.PI) % (2 * Math.PI);

  return { asc, mc };
}

const SIGNS = ['Ari','Tau','Gem','Can','Leo','Vir','Lib','Sco','Sag','Cap','Aqu','Pis'];
function fmt(rad) {
  const d = ((rad * 180) / Math.PI + 360) % 360;
  const sign = SIGNS[Math.floor(d / 30)];
  const inS = d % 30;
  const deg = Math.floor(inS);
  const min = Math.floor((inS - deg) * 60);
  return `${deg}°${String(min).padStart(2, '0')}' ${sign}`;
}

// Einstein 1879-03-14 11:30 LMT Ulm (9.9876E, 48.4011N, tz +0.6167)
// Published: ASC ~ 5° Cancer, MC ~ 14° Pisces  (depends on source)
const jd = jdOf(1879, 3, 14, 11, 30, 0.6166666666666667);
console.log('JD:', jd);
console.log('GMST°:', (gmstRad(jd) * 180 / Math.PI).toFixed(3));
const r = relocate(jd, 48.4011, 9.9876);
console.log('Ulm  ASC:', fmt(r.asc), '  MC:', fmt(r.mc));

// Same time, but New York (40.71N, -74.01W)
const r2 = relocate(jd, 40.71, -74.01);
console.log('NYC  ASC:', fmt(r2.asc), '  MC:', fmt(r2.mc));

// Same time, Tokyo (35.68N, 139.69E)
const r3 = relocate(jd, 35.68, 139.69);
console.log('Tokyo ASC:', fmt(r3.asc), '  MC:', fmt(r3.mc));
