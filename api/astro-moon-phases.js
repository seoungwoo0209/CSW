/* =========================================================
   api/astro-moon-phases.js  v2.0
   신월/만월(+개기/부분 일식·월식) 캘린더 — ephemeris 패키지로 연도 무관 직접 탐색
   - (KST 기준) 올해 1/1~12/31 사이의 신월/만월을 ephemeris로 직접 탐색
     (태양-달 황경차를 2일 간격으로 스캔 → 0°/180° 교차 구간을 이분탐색으로 정밀화)
   - 종류(신월/만월/일식/월식)는 그 시각 달의 황위(ecliptic latitude)로 판별
     (|황위| < 1.5° 이면 달이 노드 근처 → 일식/월식 가능성. 2026년 실제 일식·월식
     4개 날짜로 검증: 해당 4개는 0.36°~0.93°, 나머지 21개는 모두 1.68° 이상)
   - 달의 "하우스"는 나탈 하우스 휠에 겹쳐서(바이휠) 배정 (솔라리턴/루나리턴과 동일 방식)
   - "네이탈 행성과의 애스펙트"는 그 시각 달의 위치 vs 나탈 10행성+ASC/MC/IC/DSC/북노드/릴리스
     (카이론 제외) 중 0° 컨정션, 오브 3° 이내만 표시
   - 각 이벤트의 전체 차트(트랜짓 10행성+ASC/MC+노드, 바이휠 하우스, 12포인트 에스펙트)는
     적용 도시 기준으로 계산 — 솔라리턴/루나리턴과 동일한 형태(item)로 반환
   ========================================================= */

import Ephemeris from 'ephemeris';

// |달의 황위| 가 이 값보다 작으면 노드 근접 → 일식/월식으로 판정
const ECLIPSE_LAT_THRESHOLD = 1.5;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { natal, angles, nodes, houses, appLat, appLng, appUtcOffset } = req.body;

    if (!natal || !angles || !nodes || !houses) {
      return res.status(400).json({ error: '나탈 차트 데이터(natal/angles/nodes/houses)가 필요합니다.' });
    }

    const natalHouseLons = houses.map(h => h.longitude);
    const natalPoints = buildPointsFromChart(natal, angles, nodes);

    // IC/DSC (MC/ASC + 180°) — "네이탈 행성과의 애스펙트" 컨정션 대상 확장용
    const icLon  = norm360(angles.mc.longitude + 180);
    const dscLon = norm360(angles.asc.longitude + 180);
    const conjTargets = [
      ...natalPoints,
      { key: 'ic',  label: 'IC',  lon: icLon },
      { key: 'dsc', label: 'DSC', lon: dscLon },
    ];

    const aLat    = (appLat != null) ? appLat : 37.5665;
    const aLng    = (appLng != null) ? appLng : 126.9780;
    const aOffset = (appUtcOffset != null) ? appUtcOffset : 9;

    // KST 기준 올해의 신월/만월을 직접 탐색
    const nowKST = new Date(Date.now() + 9 * 3600000);
    const year   = nowKST.getUTCFullYear();
    const rawEvents = findMoonPhaseEvents(year, aLng, aLat);

    const events = rawEvents.map(({ date, kind, moonLon, moonLat }) => {
      const jd = calcJulianDay(
        date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
        date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
      );

      const isEclipse = Math.abs(moonLat) < ECLIPSE_LAT_THRESHOLD;
      const type = kind === 'new'
        ? (isEclipse ? 'solarEclipse' : 'newMoon')
        : (isEclipse ? 'lunarEclipse' : 'fullMoon');

      const moonHouse = getNodeHouse(moonLon, natalHouseLons);

      const conjunctions = conjTargets
        .map(p => ({ point: p.label, dist: angularDistance(moonLon, p.lon) }))
        .filter(c => c.dist <= 3)
        .sort((a, b) => a.dist - b.dist)
        .map(c => ({
          point:  c.point,
          degree: Math.floor(c.dist),
          minute: Math.floor((c.dist % 1) * 60),
        }));

      // 전체 차트 (트랜짓 10행성+ASC/MC+노드, 적용 도시 기준)
      const raw     = Ephemeris.getAllPlanets(date, aLng, aLat, 0);
      const planets = extractPlanets(raw.observed);
      const { asc, mc } = calcHousesPlacidus(jd, aLat, aLng);
      const planetsWithHouse = assignHouses(planets, natalHouseLons);
      const { northLon, southLon } = calcLunarNodes(jd);

      const points         = buildAspectPoints(planets, asc, mc, northLon, southLon);
      const aspectsFull    = calcAllAspects(points, points, { sameSet: true });
      const aspectsToNatal = calcAllAspects(points, natalPoints, {
        labelPrefixA: '트랜짓 ', labelPrefixB: '네이탈 '
      });

      const planetsResult = {};
      PLANET_KEYS.forEach(k => {
        planetsResult[k] = { ...toSignInfo(planetsWithHouse[k].lon), house: planetsWithHouse[k].house };
      });

      return {
        dateLocal: new Date(date.getTime() + aOffset * 3600000).toISOString(),
        type,
        moon: { ...toSignInfo(moonLon), house: moonHouse },
        conjunctions,
        planets: planetsResult,
        angles: { asc: toSignInfo(asc), mc: toSignInfo(mc) },
        nodes: {
          north: { ...toSignInfo(northLon), house: getNodeHouse(northLon, natalHouseLons) },
          south: { ...toSignInfo(southLon), house: getNodeHouse(southLon, natalHouseLons) },
        },
        aspectsFull,
        aspectsToNatal,
      };
    });

    return res.status(200).json({ year, events });

  } catch (error) {
    console.error('astro-moon-phases error:', error);
    return res.status(500).json({ error: '신월/만월 차트 계산 중 오류가 발생했습니다: ' + error.message });
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

// 신월/만월 탐색: 태양-달 황경차(elongation)를 2일 간격으로 스캔하여
// 0°(신월)/180°(만월) 교차 구간을 찾고 24회 이분탐색으로 분 단위까지 정밀화.
// moonLat(달의 황위)은 일식/월식 판별용 — geometric.latitude가 실제 황위.
function findMoonPhaseEvents(year, lng, lat) {
  function sample(date) {
    const raw = Ephemeris.getAllPlanets(date, lng, lat, 0);
    return {
      moonLon: raw.observed.moon.apparentLongitudeDd,
      sunLon:  raw.observed.sun.apparentLongitudeDd,
      moonLat: raw.observed.moon.raw.position.geometric.latitude,
    };
  }

  const stepDays = 2;
  const start = new Date(Date.UTC(year - 1, 11, 10));
  const end   = new Date(Date.UTC(year + 1, 0, 20));

  const events = [];
  let prevT = start;
  let prevS = sample(prevT);
  let prevElong = norm360(prevS.moonLon - prevS.sunLon);

  for (let t = new Date(start.getTime() + stepDays * 86400000); t <= end; t = new Date(t.getTime() + stepDays * 86400000)) {
    const s = sample(t);
    const elong = norm360(s.moonLon - s.sunLon);

    let kind = null;
    if (elong < prevElong - 180) {
      kind = 'new';  // 360° -> 0° 래핑
    } else if (prevElong < 180 && elong >= 180) {
      kind = 'full'; // 180° 교차
    }

    if (kind) {
      let lo = prevT.getTime(), hi = t.getTime();
      const f = (timeMs) => {
        const samp = sample(new Date(timeMs));
        const e = norm360(samp.moonLon - samp.sunLon);
        return kind === 'new' ? (e > 180 ? e - 360 : e) : (e - 180);
      };
      let fLo = f(lo);
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if ((fm < 0) === (fLo < 0)) { lo = mid; fLo = fm; }
        else { hi = mid; }
      }
      const evDate = new Date((lo + hi) / 2);
      const evSample = sample(evDate);
      events.push({ date: evDate, kind, moonLon: evSample.moonLon, moonLat: evSample.moonLat });
    }

    prevT = t;
    prevElong = elong;
  }

  // KST 기준으로 해당 연도(1/1~12/31)에 속하는 이벤트만 반환
  return events.filter(ev => {
    const kst = new Date(ev.date.getTime() + 9 * 3600000);
    return kst.getUTCFullYear() === year;
  });
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
