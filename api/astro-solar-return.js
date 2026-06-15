/* =========================================================
   api/astro-solar-return.js  v1.0
   솔라리턴(태양 회귀) 계산 — ephemeris 패키지로 정밀 계산
   트랜짓 태양 = 나탈 태양 황경이 되는 정확한 시각을 이분법으로 탐색,
   그 시각의 ASC(어센던트)를 솔라리턴 적용 도시 기준으로 계산
   ========================================================= */

import Ephemeris from 'ephemeris';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { birthDate, birthTime, lat, lng, utcOffset, srLat, srLng, srUtcOffset } = req.body;

    if (!birthDate || !birthTime || lat == null || lng == null) {
      return res.status(400).json({ error: '생년월일, 출생시각, 출생지(위도/경도)가 필요합니다.' });
    }

    const [yyyy, mm, dd] = birthDate.split('-').map(Number);
    const [hh, mi]       = birthTime.split(':').map(Number);

    const offsetHours      = (utcOffset != null) ? utcOffset : (lng / 15);
    const localDecimalHour = hh + mi / 60;
    const utcDecimalHour   = localDecimalHour - offsetHours;
    const utcH = Math.floor(utcDecimalHour);
    const utcM = Math.round((utcDecimalHour - utcH) * 60);
    const birthUTC = new Date(Date.UTC(yyyy, mm - 1, dd, utcH, utcM, 0));

    // 나탈 태양 황경 (정밀)
    const natalRaw    = Ephemeris.getAllPlanets(birthUTC, lng, lat, 0);
    const natalSunLon = norm360(natalRaw.observed.sun.apparentLongitudeDd);

    // 솔라리턴 적용 도시 (없으면 출생지와 동일)
    const aLat    = (srLat != null) ? srLat : lat;
    const aLng    = (srLng != null) ? srLng : lng;
    const aOffset = (srUtcOffset != null) ? srUtcOffset : offsetHours;

    const now        = new Date();
    const currentAge = (now - birthUTC) / (365.25 * 86400000);
    const curAge     = Math.floor(currentAge);

    function sunLonAt(date) {
      const raw = Ephemeris.getAllPlanets(date, lng, lat, 0);
      return norm360(raw.observed.sun.apparentLongitudeDd);
    }
    function signedDiff(a, b) {
      let d = (a - b) % 360;
      if (d <= -180) d += 360;
      if (d > 180)   d -= 360;
      return d;
    }

    function findReturn(targetAge) {
      const guessMs = birthUTC.getTime() + targetAge * 365.25 * 86400000;
      let lo = guessMs - 3 * 86400000;
      let hi = guessMs + 3 * 86400000;

      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const diff = signedDiff(sunLonAt(new Date(mid)), natalSunLon);
        if (diff < 0) lo = mid; else hi = mid;
      }

      const exactDate = new Date((lo + hi) / 2);
      const ey  = exactDate.getUTCFullYear();
      const em  = exactDate.getUTCMonth() + 1;
      const ed  = exactDate.getUTCDate();
      const ehr = exactDate.getUTCHours() + exactDate.getUTCMinutes() / 60 + exactDate.getUTCSeconds() / 3600;

      const jd  = calcJulianDay(ey, em, ed, ehr);
      const asc = calcAscendant(jd, aLat, aLng);

      const dateLocal = new Date(exactDate.getTime() + aOffset * 3600000);

      return {
        dateLocal: dateLocal.toISOString(),
        asc:  toSignInfo(asc),
        age:  targetAge,
        year: birthUTC.getUTCFullYear() + targetAge,
      };
    }

    return res.status(200).json({
      natalSun: toSignInfo(natalSunLon),
      current:  findReturn(curAge),
      next:     findReturn(curAge + 1),
    });

  } catch (error) {
    console.error('astro-solar-return error:', error);
    return res.status(500).json({ error: '솔라리턴 계산 중 오류가 발생했습니다: ' + error.message });
  }
}

/* =========================================================
   유틸리티
   ========================================================= */
function norm360(a) { return ((a % 360) + 360) % 360; }
function rad(d)     { return d * Math.PI / 180; }

function calcJulianDay(y, m, d, utcHour = 0) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + utcHour / 24 + B - 1524.5;
}

// ASC(어센던트) 황경 계산
function calcAscendant(jd, lat, lng) {
  const T    = (jd - 2451545.0) / 36525.0;
  const GMST = norm360(
    280.46061837
    + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T
    - (T * T * T) / 38710000.0
  );
  const RAMC = norm360(GMST + lng);
  const eps  = 23.4392911 - 0.013004167 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
  const epsR = rad(eps);
  const latR = rad(lat);
  return norm360(
    Math.atan2(Math.cos(rad(RAMC)), -(Math.sin(epsR) * Math.tan(latR) + Math.cos(epsR) * Math.sin(rad(RAMC)))) * 180 / Math.PI
  );
}

const SIGNS = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
               '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];

function toSignInfo(lon) {
  const norm    = norm360(lon);
  const signIdx = Math.floor(norm / 30);
  const degree  = norm % 30;
  return {
    longitude: norm,
    sign:      SIGNS[signIdx],
    signIndex: signIdx,
    degree:    Math.floor(degree),
    minute:    Math.floor((degree % 1) * 60),
  };
}
