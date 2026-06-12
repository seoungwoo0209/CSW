/* =========================================================
   api/astro-calc.js  v3.1
   행성 위치 계산 — ephemeris 패키지 (Moshier, 오차 1' 이내)
   하우스: Placidus
   세컨더리 프로그레션: 태양 실제 이동 기반 (정밀 공식)
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

    const [yyyy, mm, dd] = birthDate.split('-').map(Number);
    const [hh, mi]       = birthTime.split(':').map(Number);

    // UTC 변환
    const offsetHours      = (utcOffset != null) ? utcOffset : (lng / 15);
    const localDecimalHour = hh + mi / 60;
    const utcDecimalHour   = localDecimalHour - offsetHours;
    const utcH  = Math.floor(utcDecimalHour);
    const utcM  = Math.round((utcDecimalHour - utcH) * 60);
    const birthUTC = new Date(Date.UTC(yyyy, mm - 1, dd, utcH, utcM, 0));

    // 나탈 행성 계산
    const natalRaw = Ephemeris.getAllPlanets(birthUTC, lng, lat, 0);
    const planets  = extractPlanets(natalRaw.observed);

    // 하우스 계산 (Placidus)
    const jd = calcJulianDay(yyyy, mm, dd, utcDecimalHour);
    const { asc, mc, houses } = calcHousesPlacidus(jd, lat, lng);
    const planetsWithHouse = assignHouses(planets, houses);

    // ── 세컨더리 프로그레션 (태양 실제 이동 기반 정밀 공식)
    // 1일 = 1년. 현재 나이(년) = 출생일로부터 경과한 일수
    const now      = new Date();
    const ageYears = (now.getTime() - birthUTC.getTime()) / (365.25 * 86400000);

    // 출생 태양 경도
    const birthSunLon = planets.sun.lon;
    // 목표 태양 경도 = 출생 태양 + 나이(도)
    const targetSunLon = ((birthSunLon + ageYears) % 360 + 360) % 360;

    // 이분법으로 태양이 targetSunLon에 도달하는 정확한 날짜 계산
    // 탐색 범위: 출생일 + (ageYears ± 2)일
    let lo = new Date(birthUTC.getTime() + (ageYears - 2) * 86400000);
    let hi = new Date(birthUTC.getTime() + (ageYears + 2) * 86400000);
    for (let i = 0; i < 50; i++) {
      const mid    = new Date((lo.getTime() + hi.getTime()) / 2);
      const midRes = Ephemeris.getAllPlanets(mid, lng, lat, 0);
      const midSun = ((midRes.observed.sun.apparentLongitudeDd % 360) + 360) % 360;
      let diff = targetSunLon - midSun;
      if (diff > 180)  diff -= 360;
      if (diff < -180) diff += 360;
      if (diff > 0) lo = mid; else hi = mid;
    }
    const progUTC = new Date((lo.getTime() + hi.getTime()) / 2);

    // 프로그레션 행성 계산
    const progRaw    = Ephemeris.getAllPlanets(progUTC, lng, lat, 0);
    const progPlanets = extractPlanets(progRaw.observed);
    const progJD     = jd + ageYears;
    const { asc: progAsc, mc: progMc, houses: progHouses } = calcHousesPlacidus(progJD, lat, lng);
    const progPlanetsWithHouse = assignHouses(progPlanets, progHouses);

    // 에스펙트 계산
    const natalAspects       = calcAspects(planets);
    const progToNatalAspects = calcAspectsProgToNatal(progPlanets, planets);

    // 사인 변환
    const SIGNS = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                   '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];

    function toSignInfo(lon) {
      const norm    = ((lon % 360) + 360) % 360;
      const signIdx = Math.floor(norm / 30);
      const degree  = norm % 30;
      return {
        longitude: norm,
        sign:      SIGNS[signIdx],
        signIndex: signIdx,
        degree:    Math.floor(degree),
        minute:    Math.floor((degree % 1) * 60)
      };
    }

    const KEYS = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];

    const natalResult = {};
    KEYS.forEach(k => {
      natalResult[k] = { ...toSignInfo(planetsWithHouse[k].lon), house: planetsWithHouse[k].house };
    });

    const progResult = {};
    KEYS.forEach(k => {
      progResult[k] = { ...toSignInfo(progPlanetsWithHouse[k].lon), house: progPlanetsWithHouse[k].house };
    });

    return res.status(200).json({
      natal:       natalResult,
      angles:      { asc: toSignInfo(asc), mc: toSignInfo(mc) },
      houses:      houses.map((h, i) => ({ house: i + 1, ...toSignInfo(h) })),
      natalAspects,
      progression: {
        meta: {
          progDate:  progUTC.toISOString().slice(0, 10),
          ageYears:  Math.round(ageYears * 100) / 100,
          method:    '태양 실제 이동 기반 (정밀)'
        },
        planets:        progResult,
        angles:         { asc: toSignInfo(progAsc), mc: toSignInfo(progMc) },
        houses:         progHouses.map((h, i) => ({ house: i + 1, ...toSignInfo(h) })),
        aspectsToNatal: progToNatalAspects,
      },
      meta: {
        name:        name || '',
        gender:      gender || 'M',
        birthDate,
        birthTime,
        lat,
        lng,
        utcOffset:   offsetHours,
        houseSystem: 'Placidus'
      }
    });

  } catch (error) {
    console.error('astro-calc error:', error);
    return res.status(500).json({ error: '천문 계산 중 오류가 발생했습니다: ' + error.message });
  }
}

/* =========================================================
   ephemeris 결과에서 행성 경도 추출
   ========================================================= */
function extractPlanets(observed) {
  const KEYS = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];
  const result = {};
  KEYS.forEach(k => {
    const lon = observed[k]?.apparentLongitudeDd ?? 0;
    result[k] = { lon: ((lon % 360) + 360) % 360 };
  });
  return result;
}

/* =========================================================
   율리우스력 날짜 계산 (하우스 계산용)
   ========================================================= */
function calcJulianDay(y, m, d, utcHour = 0) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + utcHour / 24 + B - 1524.5;
}

/* =========================================================
   Placidus 하우스 계산
   ========================================================= */
function norm360(a) { return ((a % 360) + 360) % 360; }
function rad(d)     { return d * Math.PI / 180; }

function calcHousesPlacidus(jd, lat, lng) {
  const T    = (jd - 2451545.0) / 36525.0;
  const GMST = norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T);
  const LST  = norm360(GMST + lng);
  const RAMC = LST;
  const eps  = 23.4392911 - 0.013004167 * T;
  const epsR = rad(eps);
  const latR = rad(lat);

  const mc_raw = Math.atan(Math.tan(rad(RAMC)) / Math.cos(epsR)) * 180 / Math.PI;
  const mc     = norm360(Math.cos(rad(RAMC)) < 0 ? mc_raw + 180 : mc_raw);
  const asc    = norm360(
    Math.atan2(Math.cos(rad(RAMC)), -(Math.sin(epsR) * Math.tan(latR) + Math.cos(epsR) * Math.sin(rad(RAMC)))) * 180 / Math.PI
  );

  function raToEcl(ra_deg) {
    const r = rad(ra_deg);
    return norm360(Math.atan2(Math.sin(r) * Math.cos(epsR), Math.cos(r)) * 180 / Math.PI);
  }

  function getCuspRA(frac, baseRAMC_deg) {
    let ra = norm360(baseRAMC_deg + frac * 180);
    for (let i = 0; i < 100; i++) {
      const decR = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR));
      const cosH = -Math.tan(latR) * Math.tan(decR);
      if (cosH > 1)  { ra = norm360(baseRAMC_deg);       break; }
      if (cosH < -1) { ra = norm360(baseRAMC_deg + 180); break; }
      const H     = Math.acos(cosH) * 180 / Math.PI;
      const newRA = norm360(baseRAMC_deg + frac * H);
      if (Math.abs(newRA - ra) < 0.00001) break;
      ra = (ra + newRA) / 2;
    }
    return ra;
  }

  const c11 = raToEcl(getCuspRA(1/3, RAMC));
  const c12 = raToEcl(getCuspRA(2/3, RAMC));
  const c2  = raToEcl(getCuspRA(1/3, norm360(RAMC + 180)));
  const c3  = raToEcl(getCuspRA(2/3, norm360(RAMC + 180)));

  return {
    asc, mc,
    houses: [
      asc, c2, c3,
      norm360(mc + 180),
      norm360(c11 + 180),
      norm360(c12 + 180),
      norm360(asc + 180),
      norm360(c2 + 180),
      norm360(c3 + 180),
      mc, c11, c12,
    ]
  };
}

/* =========================================================
   행성 → 하우스 배정
   ========================================================= */
function assignHouses(planets, houses) {
  function getHouse(lon) {
    const normLon = norm360(lon);
    for (let i = 0; i < 12; i++) {
      const start = houses[i];
      const end   = houses[(i + 1) % 12];
      if (start < end) {
        if (normLon >= start && normLon < end) return i + 1;
      } else {
        if (normLon >= start || normLon < end) return i + 1;
      }
    }
    return 1;
  }
  const result = {};
  for (const [key, val] of Object.entries(planets)) {
    result[key] = { lon: val.lon, house: getHouse(val.lon) };
  }
  return result;
}

/* =========================================================
   에스펙트 계산
   ========================================================= */
const ASPECT_DEFS = [
  { name: '합',     angle:   0, orb: 8, symbol: '☌' },
  { name: '육합',   angle:  60, orb: 4, symbol: '⚹' },
  { name: '삼합',   angle: 120, orb: 6, symbol: '△' },
  { name: '스퀘어', angle:  90, orb: 6, symbol: '□' },
  { name: '충',     angle: 180, orb: 8, symbol: '☍' },
];

const PLANET_KEYS = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];
const PLANET_KR   = {
  sun:'태양', moon:'달', mercury:'수성', venus:'금성', mars:'화성',
  jupiter:'목성', saturn:'토성', uranus:'천왕성', neptune:'해왕성', pluto:'명왕성'
};

function angularDistance(a, b) {
  const diff = Math.abs(norm360(a) - norm360(b));
  return diff > 180 ? 360 - diff : diff;
}

function calcAspects(planets) {
  const aspects = [];
  for (let i = 0; i < PLANET_KEYS.length; i++) {
    for (let j = i + 1; j < PLANET_KEYS.length; j++) {
      const p1   = PLANET_KEYS[i];
      const p2   = PLANET_KEYS[j];
      const dist = angularDistance(planets[p1].lon, planets[p2].lon);
      for (const asp of ASPECT_DEFS) {
        if (Math.abs(dist - asp.angle) <= asp.orb) {
          aspects.push({
            planet1: PLANET_KR[p1], planet2: PLANET_KR[p2],
            aspect: asp.name, symbol: asp.symbol,
            orb: Math.round((dist - asp.angle) * 10) / 10
          });
        }
      }
    }
  }
  return aspects;
}

function calcAspectsProgToNatal(progPlanets, natalPlanets) {
  const aspects  = [];
  const progKeys = ['sun','moon','mercury','venus','mars'];
  for (const pk of progKeys) {
    for (const nk of PLANET_KEYS) {
      const dist = angularDistance(progPlanets[pk].lon, natalPlanets[nk].lon);
      for (const asp of ASPECT_DEFS) {
        if (Math.abs(dist - asp.angle) <= asp.orb) {
          aspects.push({
            progPlanet:  `프로그레션 ${PLANET_KR[pk]}`,
            natalPlanet: `네이탈 ${PLANET_KR[nk]}`,
            aspect: asp.name, symbol: asp.symbol,
            orb: Math.round((dist - asp.angle) * 10) / 10
          });
        }
      }
    }
  }
  return aspects;
}
