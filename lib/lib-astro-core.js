/* =========================================================
   lib/astro-core.js
   핵심 천문 유틸 — 모든 엔진이 공유
   ========================================================= */

export function norm360(a) { return ((a % 360) + 360) % 360; }
export function rad(d)     { return d * Math.PI / 180; }

export function calcJulianDay(y, m, d, utcHour = 0) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1))
       + d + utcHour / 24 + B - 1524.5;
}

export function toSignInfo(lon) {
  const SIGNS = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                 '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
  const n       = norm360(lon);
  const signIdx = Math.floor(n / 30);
  const degree  = n % 30;
  return { longitude:n, sign:SIGNS[signIdx], signIndex:signIdx,
           degree:Math.floor(degree), minute:Math.floor((degree % 1) * 60) };
}

export function birthToUTC(birthDate, birthTime, utcOffset, lng) {
  const [yyyy, mm, dd] = birthDate.split('-').map(Number);
  const [hh, mi]       = birthTime.split(':').map(Number);
  const offsetHours    = (utcOffset != null) ? utcOffset : (lng / 15);
  const utcDecimal     = hh + mi / 60 - offsetHours;
  const utcH = Math.floor(utcDecimal);
  const utcM = Math.round((utcDecimal - utcH) * 60);
  const birthUTC = new Date(Date.UTC(yyyy, mm - 1, dd, utcH, utcM, 0));
  const bY  = birthUTC.getUTCFullYear();
  const bM  = birthUTC.getUTCMonth() + 1;
  const bD  = birthUTC.getUTCDate();
  const bHr = birthUTC.getUTCHours() + birthUTC.getUTCMinutes() / 60
              + birthUTC.getUTCSeconds() / 3600;
  return { birthUTC, bY, bM, bD, bHr, offsetHours };
}

export function extractPlanets(observed) {
  const KEYS = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];
  const result = {};
  KEYS.forEach(k => {
    const lon = observed[k]?.apparentLongitudeDd ?? 0;
    result[k] = { lon: norm360(lon) };
  });
  return result;
}
