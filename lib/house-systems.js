/* =========================================================
   lib/house-systems.js
   하우스 커스프 계산 — Placidus (확장 가능 구조)
   나중에 Koch, Equal, Whole Sign 추가 가능
   ========================================================= */

import { norm360, rad } from './astro-core.js';

/* ── Placidus ── */
export function calcHousesPlacidus(jd, lat, lng) {
  const T    = (jd - 2451545.0) / 36525.0;
  const GMST = norm360(
    280.46061837
    + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T
    - (T * T * T) / 38710000.0
  );
  const RAMC = norm360(GMST + lng);
  const eps  = 23.4392911 - 0.013004167 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
  return _placidusFromRAMC(RAMC, eps, lat);
}

/* ── Placidus — Naibod key (프로그레션용) ── */
export function calcProgHousesNaibod(natalJD, ageYears, lat, lng) {
  const NAIBOD = 0.98564736629;
  const T      = (natalJD - 2451545.0) / 36525.0;
  const GMST   = norm360(
    280.46061837
    + 360.98564736629 * (natalJD - 2451545.0)
    + 0.000387933 * T * T
    - (T * T * T) / 38710000.0
  );
  const natalRAMC = norm360(GMST + lng);
  const progRAMC  = norm360(natalRAMC + ageYears * NAIBOD);
  const eps = 23.4392911 - 0.013004167 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
  return _placidusFromRAMC(progRAMC, eps, lat);
}

/* ── 내부: RAMC → Placidus 커스프 ── */
function _placidusFromRAMC(RAMC, eps, lat) {
  const epsR = rad(eps), latR = rad(lat);

  const mc_raw = Math.atan(Math.tan(rad(RAMC)) / Math.cos(epsR)) * 180 / Math.PI;
  const mc     = norm360(Math.cos(rad(RAMC)) < 0 ? mc_raw + 180 : mc_raw);
  const asc    = norm360(
    Math.atan2(Math.cos(rad(RAMC)),
      -(Math.sin(epsR) * Math.tan(latR) + Math.cos(epsR) * Math.sin(rad(RAMC)))
    ) * 180 / Math.PI
  );

  function raDecToEcl(ra, dec) {
    return norm360(Math.atan2(
      Math.sin(rad(ra)) * Math.cos(epsR) + Math.tan(rad(dec)) * Math.sin(epsR),
      Math.cos(rad(ra))
    ) * 180 / Math.PI);
  }
  function upper(frac) {
    let ra = norm360(RAMC + frac * 180);
    for (let i = 0; i < 100; i++) {
      const cosH = -Math.tan(latR) * Math.tan(Math.asin(Math.sin(rad(ra)) * Math.sin(epsR)));
      if (cosH > 1) { ra = norm360(RAMC); break; }
      if (cosH < -1){ ra = norm360(RAMC + 180); break; }
      const n = norm360(RAMC + frac * Math.acos(cosH) * 180 / Math.PI);
      if (Math.abs(n - ra) < 0.00001) break; ra = (ra + n) / 2;
    }
    return raDecToEcl(ra, Math.asin(Math.sin(rad(ra)) * Math.sin(epsR)) * 180 / Math.PI);
  }
  function lower(frac) {
    const IC = norm360(RAMC + 180);
    let ra = norm360(IC - frac * 180);
    for (let i = 0; i < 100; i++) {
      const cosH = -Math.tan(latR) * Math.tan(Math.asin(Math.sin(rad(ra)) * Math.sin(epsR)));
      if (cosH > 1) { ra = norm360(IC); break; }
      if (cosH < -1){ ra = norm360(IC + 180); break; }
      const NSA = 180 - Math.acos(cosH) * 180 / Math.PI;
      const n   = norm360(IC - frac * NSA);
      if (Math.abs(n - ra) < 0.00001) break; ra = (ra + n) / 2;
    }
    return raDecToEcl(ra, Math.asin(Math.sin(rad(ra)) * Math.sin(epsR)) * 180 / Math.PI);
  }

  const c11 = upper(1/3), c12 = upper(2/3);
  const cA  = lower(1/3), cB  = lower(2/3);

  return {
    asc, mc,
    houses: [
      asc, cB, cA, norm360(mc + 180),
      norm360(c11 + 180), norm360(c12 + 180),
      norm360(asc + 180), norm360(cB + 180), norm360(cA + 180),
      mc, c11, c12
    ]
  };
}

/* ── 행성 → 하우스 배정 ── */
export function assignHouses(planets, houses) {
  function getHouse(lon) {
    const n = norm360(lon);
    for (let i = 0; i < 12; i++) {
      const s = houses[i], e = houses[(i + 1) % 12];
      if (s > e) { if (n >= s || n < e) return i + 1; }
      else       { if (n >= s && n < e) return i + 1; }
    }
    return 12;
  }
  const result = {};
  for (const [k, v] of Object.entries(planets))
    result[k] = { lon: v.lon, house: getHouse(v.lon) };
  return result;
}
