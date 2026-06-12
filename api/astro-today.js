/* =========================================================
   api/astro-today.js  v1.0
   오늘의 운세용 — 오늘 날짜 트랜짓 계산
   기존 astro-calc.js의 함수들을 재활용
   ========================================================= */

import Ephemeris from 'ephemeris';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { birthDate, birthTime, lat, lng, name, gender, utcOffset } = req.body;

    if (!birthDate || !birthTime || lat == null || lng == null) {
      return res.status(400).json({ error: '생년월일, 출생시각, 출생지(위도/경도)가 필요합니다.' });
    }

    // ── 출생 UTC 변환
    const [yyyy, mm, dd] = birthDate.split('-').map(Number);
    const [hh, mi]       = birthTime.split(':').map(Number);
    const offsetHours    = (utcOffset != null) ? utcOffset : (lng / 15);
    const utcDecimalHour = hh + mi / 60 - offsetHours;
    const utcH = Math.floor(utcDecimalHour);
    const utcM = Math.round((utcDecimalHour - utcH) * 60);
    const birthUTC = new Date(Date.UTC(yyyy, mm - 1, dd, utcH, utcM, 0));

    const bY  = birthUTC.getUTCFullYear();
    const bM  = birthUTC.getUTCMonth() + 1;
    const bD  = birthUTC.getUTCDate();
    const bHr = birthUTC.getUTCHours() + birthUTC.getUTCMinutes() / 60;

    // ── 네이탈 행성 계산
    const natalRaw    = Ephemeris.getAllPlanets(birthUTC, lng, lat, 0);
    const natalPlanets = extractPlanets(natalRaw.observed);
    const jd           = calcJulianDay(bY, bM, bD, bHr);
    const { asc, mc, houses } = calcHousesPlacidus(jd, lat, lng);
    const natalWithHouse = assignHouses(natalPlanets, houses);

    // ── 오늘 날짜 (KST 자정 기준)
    const nowRaw   = new Date();
    const todayKST = new Date(Date.UTC(
      nowRaw.getUTCFullYear(),
      nowRaw.getUTCMonth(),
      nowRaw.getUTCDate() + (nowRaw.getUTCHours() >= 15 ? 1 : 0),
      12, 0, 0   // 정오 기준
    ));

    // ── 오늘 트랜짓 행성 계산
    const todayRaw     = Ephemeris.getAllPlanets(todayKST, lng, lat, 0);
    const todayPlanets = extractPlanets(todayRaw.observed);
    const todayWithHouse = assignHouses(todayPlanets, houses); // 네이탈 하우스 기준

    // ── 오늘 트랜짓 → 네이탈 에스펙트
    const todayAspects = calcAspectsTransitToNatal(todayPlanets, natalPlanets, { asc, mc });

    const SIGNS = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                   '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];

    function toSignInfo(lon) {
      const n       = ((lon % 360) + 360) % 360;
      const signIdx = Math.floor(n / 30);
      const degree  = n % 30;
      return {
        longitude: n,
        sign:      SIGNS[signIdx],
        signIndex: signIdx,
        degree:    Math.floor(degree),
        minute:    Math.floor((degree % 1) * 60)
      };
    }

    const KEYS = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];

    // 네이탈 결과
    const natalResult = {};
    KEYS.forEach(k => {
      natalResult[k] = { ...toSignInfo(natalWithHouse[k].lon), house: natalWithHouse[k].house };
    });

    // 오늘 트랜짓 결과
    const todayResult = {};
    KEYS.forEach(k => {
      todayResult[k] = { ...toSignInfo(todayWithHouse[k].lon), house: todayWithHouse[k].house };
    });

    // 오늘 날짜 문자열 (KST)
    const todayStr = `${todayKST.getUTCFullYear()}-${String(todayKST.getUTCMonth()+1).padStart(2,'0')}-${String(todayKST.getUTCDate()).padStart(2,'0')}`;

    return res.status(200).json({
      natal:         natalResult,
      natalAngles:   { asc: toSignInfo(asc), mc: toSignInfo(mc) },
      todayTransit:  todayResult,
      todayAspects,
      todayDate:     todayStr,
      meta: {
        name:      name || '',
        gender:    gender || 'M',
        birthDate, birthTime,
        lat, lng,
        utcOffset: offsetHours,
      }
    });

  } catch (error) {
    console.error('astro-today error:', error);
    return res.status(500).json({ error: '오늘 운세 계산 중 오류가 발생했습니다: ' + error.message });
  }
}

/* ── 공통 유틸 (astro-calc.js와 동일) ── */
function norm360(a) { return ((a % 360) + 360) % 360; }
function rad(d)     { return d * Math.PI / 180; }

function calcJulianDay(y, m, d, utcHour = 0) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + utcHour / 24 + B - 1524.5;
}

function extractPlanets(observed) {
  const KEYS = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];
  const result = {};
  KEYS.forEach(k => {
    const lon = observed[k]?.apparentLongitudeDd ?? 0;
    result[k] = { lon: norm360(lon) };
  });
  return result;
}

function calcHousesPlacidus(jd, lat, lng) {
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
  function getCuspUpper(frac) {
    let ra = norm360(RAMC + frac * 180);
    for (let i = 0; i < 100; i++) {
      const decR = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR));
      const cosH = -Math.tan(latR) * Math.tan(decR);
      if (cosH > 1)  { ra = norm360(RAMC); break; }
      if (cosH < -1) { ra = norm360(RAMC + 180); break; }
      const newRA = norm360(RAMC + frac * Math.acos(cosH) * 180 / Math.PI);
      if (Math.abs(newRA - ra) < 0.00001) break;
      ra = (ra + newRA) / 2;
    }
    return raDecToEcl(ra, Math.asin(Math.sin(rad(ra)) * Math.sin(epsR)) * 180 / Math.PI);
  }
  function getCuspLower(frac) {
    const IC_R = norm360(RAMC + 180);
    let ra = norm360(IC_R - frac * 180);
    for (let i = 0; i < 100; i++) {
      const decR = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR));
      const cosH = -Math.tan(latR) * Math.tan(decR);
      if (cosH > 1)  { ra = norm360(IC_R); break; }
      if (cosH < -1) { ra = norm360(IC_R + 180); break; }
      const NSA   = 180 - Math.acos(cosH) * 180 / Math.PI;
      const newRA = norm360(IC_R - frac * NSA);
      if (Math.abs(newRA - ra) < 0.00001) break;
      ra = (ra + newRA) / 2;
    }
    return raDecToEcl(ra, Math.asin(Math.sin(rad(ra)) * Math.sin(epsR)) * 180 / Math.PI);
  }

  const c11 = getCuspUpper(1/3), c12 = getCuspUpper(2/3);
  const cA  = getCuspLower(1/3), cB  = getCuspLower(2/3);

  return {
    asc, mc,
    houses: [asc, cB, cA, norm360(mc+180), norm360(c11+180), norm360(c12+180),
             norm360(asc+180), norm360(cB+180), norm360(cA+180), mc, c11, c12]
  };
}

function assignHouses(planets, houses) {
  function getHouse(lon) {
    const n = norm360(lon);
    for (let i = 0; i < 12; i++) {
      const s = houses[i], e = houses[(i+1)%12];
      if (s > e) { if (n >= s || n < e) return i+1; }
      else       { if (n >= s && n < e) return i+1; }
    }
    return 12;
  }
  const result = {};
  for (const [k, v] of Object.entries(planets))
    result[k] = { lon: v.lon, house: getHouse(v.lon) };
  return result;
}

function angularDistance(a, b) {
  const diff = Math.abs(norm360(a) - norm360(b));
  return diff > 180 ? 360 - diff : diff;
}

function signedAngularDiff(lonA, lonB) {
  let diff = norm360(lonB) - norm360(lonA);
  if (diff > 180)  diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

const ASPECT_DEFS = [
  { name:'컨정션',   angle:  0, orb:8, symbol:'☌' },
  { name:'섹스타일', angle: 60, orb:4, symbol:'⚹' },
  { name:'트라인',   angle:120, orb:6, symbol:'△' },
  { name:'스퀘어',   angle: 90, orb:6, symbol:'□' },
  { name:'어포지션', angle:180, orb:8, symbol:'☍' },
];

const PLANET_KEYS = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];
const PLANET_KR   = {
  sun:'태양', moon:'달', mercury:'수성', venus:'금성', mars:'화성',
  jupiter:'목성', saturn:'토성', uranus:'천왕성', neptune:'해왕성', pluto:'명왕성'
};

// 오늘 트랜짓 → 네이탈 에스펙트 (ASC/MC 포함)
function calcAspectsTransitToNatal(transitPlanets, natalPlanets, natalAngles) {
  const aspects = [];

  const natalPoints = [
    ...PLANET_KEYS.map(k => ({ key:k, lon: natalPlanets[k].lon, label:`네이탈 ${PLANET_KR[k]}` })),
    ...(natalAngles ? [
      { key:'asc', lon: natalAngles.asc, label:'네이탈 ASC' },
      { key:'mc',  lon: natalAngles.mc,  label:'네이탈 MC'  },
    ] : [])
  ];

  for (const tk of PLANET_KEYS) {
    for (const np of natalPoints) {
      const dist = angularDistance(transitPlanets[tk].lon, np.lon);
      for (const asp of ASPECT_DEFS) {
        if (Math.abs(dist - asp.angle) <= asp.orb) {
          const signed   = signedAngularDiff(transitPlanets[tk].lon, np.lon);
          const applying = signed > 0 ? dist < asp.angle : dist > asp.angle;
          aspects.push({
            transitPlanet: `오늘 ${PLANET_KR[tk]}`,
            natalPlanet:   np.label,
            aspect:  asp.name,
            symbol:  asp.symbol,
            orb:     Math.round(Math.abs(dist - asp.angle) * 10) / 10,
            applying,
          });
        }
      }
    }
  }
  return aspects;
}
