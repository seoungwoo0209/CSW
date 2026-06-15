/* =========================================================
   api/astro-solar-return.js  v2.1
   솔라리턴(태양 회귀) 풀 차트 계산 — ephemeris 패키지로 정밀 계산
   - 트랜짓 태양 = 나탈 태양 황경이 되는 정확한 시각을 이분법으로 탐색
   - 그 시각에 솔라리턴 적용 도시 기준으로 행성 10개 + ASC/MC + 북노드/릴리스 계산
   - 행성/노드의 "하우스"는 나탈 차트의 하우스 휠에 겹쳐서(바이휠) 배정
     (외부 점성술 사이트의 "솔라리턴 행성 위치" 표 방식과 동일)
   - 솔라리턴-솔라리턴, 솔라리턴-나탈 에스펙트(12포인트)는 솔라리턴 자체 ASC/MC 기준으로 전부 계산
   ========================================================= */

import Ephemeris from 'ephemeris';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { birthDate, birthTime, lat, lng, utcOffset, srLat, srLng, srUtcOffset, natal, angles, nodes, houses } = req.body;

    if (!birthDate || !birthTime || lat == null || lng == null) {
      return res.status(400).json({ error: '생년월일, 출생시각, 출생지(위도/경도)가 필요합니다.' });
    }
    if (!natal || !angles || !nodes || !houses) {
      return res.status(400).json({ error: '나탈 차트 데이터(natal/angles/nodes/houses)가 필요합니다.' });
    }

    const natalHouseLons = houses.map(h => h.longitude);

    const [yyyy, mm, dd] = birthDate.split('-').map(Number);
    const [hh, mi]       = birthTime.split(':').map(Number);

    const offsetHours      = (utcOffset != null) ? utcOffset : (lng / 15);
    const localDecimalHour = hh + mi / 60;
    const utcDecimalHour   = localDecimalHour - offsetHours;
    const utcH = Math.floor(utcDecimalHour);
    const utcM = Math.round((utcDecimalHour - utcH) * 60);
    const birthUTC = new Date(Date.UTC(yyyy, mm - 1, dd, utcH, utcM, 0));

    // 나탈 태양 황경 (정밀) — 솔라리턴 시점 탐색용
    const natalRaw    = Ephemeris.getAllPlanets(birthUTC, lng, lat, 0);
    const natalSunLon = norm360(natalRaw.observed.sun.apparentLongitudeDd);

    // 솔라리턴 적용 도시 (없으면 출생지와 동일)
    const aLat    = (srLat != null) ? srLat : lat;
    const aLng    = (srLng != null) ? srLng : lng;
    const aOffset = (srUtcOffset != null) ? srUtcOffset : offsetHours;

    const now        = new Date();
    const currentAge = (now - birthUTC) / (365.25 * 86400000);
    const curAge     = Math.floor(currentAge);

    // 나탈 12포인트 (행성10 + ASC + MC + 북노드 + 릴리스) — 에스펙트 비교용
    const natalPoints = buildPointsFromChart(natal, angles, nodes);

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
      const srJD = calcJulianDay(ey, em, ed, ehr);

      // 솔라리턴 행성 위치 (적용 도시 기준)
      const srRaw     = Ephemeris.getAllPlanets(exactDate, aLng, aLat, 0);
      const srPlanets = extractPlanets(srRaw.observed);

      // 솔라리턴 ASC/MC (Placidus, 적용 도시 기준) — 에스펙트 계산용
      const { asc: srAsc, mc: srMc } = calcHousesPlacidus(srJD, aLat, aLng);

      // 솔라리턴 행성의 하우스는 나탈 하우스 휠에 겹쳐서(바이휠) 배정
      const srPlanetsWithHouse = assignHouses(srPlanets, natalHouseLons);

      // 솔라리턴 북노드/릴리스 (행성과 동일한 JD 기준)
      const { northLon: srNorth, southLon: srSouth } = calcLunarNodes(srJD);

      // 12포인트 구성 + 에스펙트 전부 계산
      const srPoints       = buildAspectPoints(srPlanets, srAsc, srMc, srNorth, srSouth);
      const aspectsFull    = calcAllAspects(srPoints, srPoints, { sameSet: true });
      const aspectsToNatal = calcAllAspects(srPoints, natalPoints, {
        labelPrefixA: '솔라리턴 ', labelPrefixB: '네이탈 '
      });

      const planetsResult = {};
      PLANET_KEYS.forEach(k => {
        planetsResult[k] = { ...toSignInfo(srPlanetsWithHouse[k].lon), house: srPlanetsWithHouse[k].house };
      });

      const dateLocal = new Date(exactDate.getTime() + aOffset * 3600000);

      return {
        dateLocal: dateLocal.toISOString(),
        age:  targetAge,
        year: birthUTC.getUTCFullYear() + targetAge,
        planets: planetsResult,
        angles: { asc: toSignInfo(srAsc), mc: toSignInfo(srMc) },
        nodes: {
          north: { ...toSignInfo(srNorth), house: getNodeHouse(srNorth, natalHouseLons) },
          south: { ...toSignInfo(srSouth), house: getNodeHouse(srSouth, natalHouseLons) },
        },
        aspectsFull,
        aspectsToNatal,
      };
    }

    return res.status(200).json({
      current: findReturn(curAge),
      next:    findReturn(curAge + 1),
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

const PLANET_KEYS = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];
const PLANET_KR   = {
  sun:'태양', moon:'달', mercury:'수성', venus:'금성', mars:'화성',
  jupiter:'목성', saturn:'토성', uranus:'천왕성', neptune:'해왕성', pluto:'명왕성'
};

function extractPlanets(observed) {
  const result = {};
  PLANET_KEYS.forEach(k => {
    const lon = observed[k]?.apparentLongitudeDd ?? 0;
    result[k] = { lon: norm360(lon) };
  });
  return result;
}

/* =========================================================
   Placidus 하우스 계산 (astro-calc.js와 동일 공식)
   ========================================================= */
function calcHousesPlacidus(jd, lat, lng) {
  const T = (jd - 2451545.0) / 36525.0;

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
    Math.atan2(Math.cos(rad(RAMC)), -(Math.sin(epsR) * Math.tan(latR) + Math.cos(epsR) * Math.sin(rad(RAMC)))) * 180 / Math.PI
  );

  function raDecToEcl(ra_deg, dec_deg) {
    const aR = rad(ra_deg);
    const dR = rad(dec_deg);
    return norm360(
      Math.atan2(
        Math.sin(aR) * Math.cos(epsR) + Math.tan(dR) * Math.sin(epsR),
        Math.cos(aR)
      ) * 180 / Math.PI
    );
  }

  const IC_RAMC = norm360(RAMC + 180);

  function getCuspUpper(frac) {
    let ra = norm360(RAMC + frac * 180);
    for (let i = 0; i < 100; i++) {
      const decR = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR));
      const cosH = -Math.tan(latR) * Math.tan(decR);
      if (cosH > 1)  { ra = norm360(RAMC);       break; }
      if (cosH < -1) { ra = norm360(RAMC + 180); break; }
      const H     = Math.acos(cosH) * 180 / Math.PI;
      const newRA = norm360(RAMC + frac * H);
      if (Math.abs(newRA - ra) < 0.00001) break;
      ra = (ra + newRA) / 2;
    }
    const decDeg = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR)) * 180 / Math.PI;
    return raDecToEcl(ra, decDeg);
  }

  function getCuspLower(frac) {
    let ra = norm360(IC_RAMC - frac * 180);
    for (let i = 0; i < 100; i++) {
      const decR = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR));
      const cosH = -Math.tan(latR) * Math.tan(decR);
      if (cosH > 1)  { ra = norm360(IC_RAMC);       break; }
      if (cosH < -1) { ra = norm360(IC_RAMC + 180); break; }
      const NSA   = 180 - Math.acos(cosH) * 180 / Math.PI;
      const newRA = norm360(IC_RAMC - frac * NSA);
      if (Math.abs(newRA - ra) < 0.00001) break;
      ra = (ra + newRA) / 2;
    }
    const decDeg = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR)) * 180 / Math.PI;
    return raDecToEcl(ra, decDeg);
  }

  const c11 = getCuspUpper(1/3);
  const c12 = getCuspUpper(2/3);
  const cA  = getCuspLower(1/3);
  const cB  = getCuspLower(2/3);

  return {
    asc, mc,
    houses: [
      asc, cB, cA,
      norm360(mc + 180),
      norm360(c11 + 180),
      norm360(c12 + 180),
      norm360(asc + 180),
      norm360(cB + 180),
      norm360(cA + 180),
      mc,
      c11, c12,
    ]
  };
}

/* =========================================================
   행성 → 하우스 배정 / 노드 하우스 배정 (astro-calc.js와 동일)
   ========================================================= */
function assignHouses(planets, houses) {
  function getHouse(lon) {
    const normLon = norm360(lon);
    for (let i = 0; i < 12; i++) {
      const start = houses[i];
      const end   = houses[(i + 1) % 12];
      if (start > end) {
        if (normLon >= start || normLon < end) return i + 1;
      } else {
        if (normLon >= start && normLon < end) return i + 1;
      }
    }
    return 12;
  }
  const result = {};
  for (const [key, val] of Object.entries(planets)) {
    result[key] = { lon: val.lon, house: getHouse(val.lon) };
  }
  return result;
}

function getNodeHouse(lon, houses) {
  const n = norm360(lon);
  for (let i = 0; i < 12; i++) {
    const s = houses[i], e = houses[(i + 1) % 12];
    if (s > e) { if (n >= s || n < e) return i + 1; }
    else       { if (n >= s && n < e) return i + 1; }
  }
  return 12;
}

/* =========================================================
   북노드/릴리스 계산 (Mean Node, astro-calc.js와 동일)
   ========================================================= */
function calcLunarNodes(jd) {
  const T     = (jd - 2451545.0) / 36525.0;
  const omega = norm360(125.04452  - 1934.136261   * T + 0.0020708 * T * T);

  const northLon = omega;

  const bml = norm360(
    83.3532465 + 4069.0137287 * T - 0.0103200 * T * T
    - T * T * T / 80053 + T * T * T * T / 18999000
  );
  const southLon = norm360(bml + 180);

  return { northLon, southLon };
}

/* =========================================================
   에스펙트 계산 (astro-calc.js와 동일)
   ========================================================= */
const ASPECT_DEFS = [
  { name: '컨정션',  angle:   0, orb: 8, symbol: '☌' },
  { name: '섹스타일',angle:  60, orb: 4, symbol: '⚹' },
  { name: '트라인',  angle: 120, orb: 6, symbol: '△' },
  { name: '스퀘어',  angle:  90, orb: 6, symbol: '□' },
  { name: '어포지션',angle: 180, orb: 8, symbol: '☍' },
];

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

function buildAspectPoints(planets, asc, mc, northLon, southLon) {
  return [
    ...PLANET_KEYS.map(k => ({ key: k, label: PLANET_KR[k], lon: planets[k].lon })),
    { key: 'asc',       label: 'ASC',      lon: asc },
    { key: 'mc',        label: 'MC',       lon: mc },
    { key: 'northNode', label: '북노드(☊)', lon: northLon },
    { key: 'southNode', label: '릴리스(☋)', lon: southLon },
  ];
}

function buildPointsFromChart(natal, angles, nodes) {
  return [
    ...PLANET_KEYS.map(k => ({ key: k, label: PLANET_KR[k], lon: natal[k].longitude })),
    { key: 'asc',       label: 'ASC',      lon: angles.asc.longitude },
    { key: 'mc',        label: 'MC',       lon: angles.mc.longitude },
    { key: 'northNode', label: '북노드(☊)', lon: nodes.north.longitude },
    { key: 'southNode', label: '릴리스(☋)', lon: nodes.south.longitude },
  ];
}

function calcAllAspects(pointsA, pointsB, opts = {}) {
  const { sameSet = false, labelPrefixA = '', labelPrefixB = '' } = opts;
  const aspects = [];

  function tryPush(p1, p2, prefix1, prefix2) {
    const dist = angularDistance(p1.lon, p2.lon);
    for (const asp of ASPECT_DEFS) {
      const diff = Math.abs(dist - asp.angle);
      if (diff <= asp.orb) {
        const signed   = signedAngularDiff(p1.lon, p2.lon);
        const applying = signed > 0 ? dist < asp.angle : dist > asp.angle;
        aspects.push({
          point1:  prefix1 + p1.label,
          point2:  prefix2 + p2.label,
          aspect:  asp.name,
          symbol:  asp.symbol,
          orb:     Math.round(diff * 10) / 10,
          applying,
        });
      }
    }
  }

  if (sameSet) {
    for (let i = 0; i < pointsA.length; i++) {
      for (let j = i + 1; j < pointsA.length; j++) {
        tryPush(pointsA[i], pointsA[j], labelPrefixA, labelPrefixA);
      }
    }
  } else {
    for (const p1 of pointsA) {
      for (const p2 of pointsB) {
        tryPush(p1, p2, labelPrefixA, labelPrefixB);
      }
    }
  }

  return aspects.sort((a, b) => a.orb - b.orb);
}
