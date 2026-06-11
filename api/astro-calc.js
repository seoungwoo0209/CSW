/* =========================================================
   api/astro-calc.js  v2.0
   행성 위치 계산 (VSOP87 축약) + Equal House + 세컨더리 프로그레션(전 행성) + 에스펙트
   =========================================================
   변경 사항:
   - UTC 변환 버그 수정: utcHour(경도 보정 포함)를 calcJulianDay에 반영
   - 하우스: "Placidus 근사" → Equal House로 명시 (일관성 확보)
   - 세컨더리 프로그레션: 태양·달 → 10행성 전체 + prog ASC/MC + prog 하우스 배정
   - 에스펙트 계산 추가: natal↔natal, prog↔natal (주요 5각도)
   - progression 객체 확장: { planets, angles, houses, aspectsToNatal, meta }
   ========================================================= */

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

    // ── UTC 변환
    // utcOffset이 명시적으로 넘어오면 우선 사용 (예: 한국 +9, 뉴욕 -5)
    // 없으면 경도 기반 로컬 평균태양시(LMT) 사용
    const offsetHours = (utcOffset != null) ? utcOffset : (lng / 15);
    const localDecimalHour = hh + mi / 60;
    const utcDecimalHour   = localDecimalHour - offsetHours;

    // ── 나탈 JD (UTC 기준)
    const jd = calcJulianDay(yyyy, mm, dd, utcDecimalHour);

    // ── 행성 위치 계산
    const planets = calcPlanets(jd);

    // ── 하우스 계산 (Equal House — ASC 기준 30° 등분)
    const { asc, mc, houses } = calcHousesEqual(jd, lat, lng);

    // ── 행성 → 하우스 배정
    const planetsWithHouse = assignHouses(planets, houses);

    // ── 세컨더리 프로그레션 (1일 = 1년)
    const now      = new Date();
    // 출생 시각 포함한 정밀 나이 계산
    const birthMs  = Date.UTC(yyyy, mm - 1, dd, hh, mi);
    const ageYears = (now.getTime() - birthMs) / (365.25 * 86400000);
    const progJD   = jd + ageYears;

    const progPlanets = calcPlanets(progJD);
    const { asc: progAsc, mc: progMc, houses: progHouses } = calcHousesEqual(progJD, lat, lng);
    const progPlanetsWithHouse = assignHouses(progPlanets, progHouses);

    // ── 에스펙트 계산
    const natalAspects = calcAspects(planets);
    const progToNatalAspects = calcAspectsProgToNatal(progPlanets, planets);

    // ── 사인 변환 유틸
    const SIGNS    = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                      '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
    const SIGNS_EN = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
                      'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];

    function toSignInfo(lon) {
      const norm    = ((lon % 360) + 360) % 360;
      const signIdx = Math.floor(norm / 30);
      const degree  = norm % 30;
      return {
        longitude: norm,
        sign:      SIGNS[signIdx],
        signEn:    SIGNS_EN[signIdx],
        signIndex: signIdx,
        degree:    Math.floor(degree),
        minute:    Math.floor((degree % 1) * 60)
      };
    }

    // ── 결과 조립
    const result = {
      natal: {
        sun:     { ...toSignInfo(planetsWithHouse.sun.lon),     house: planetsWithHouse.sun.house },
        moon:    { ...toSignInfo(planetsWithHouse.moon.lon),    house: planetsWithHouse.moon.house },
        mercury: { ...toSignInfo(planetsWithHouse.mercury.lon), house: planetsWithHouse.mercury.house },
        venus:   { ...toSignInfo(planetsWithHouse.venus.lon),   house: planetsWithHouse.venus.house },
        mars:    { ...toSignInfo(planetsWithHouse.mars.lon),    house: planetsWithHouse.mars.house },
        jupiter: { ...toSignInfo(planetsWithHouse.jupiter.lon), house: planetsWithHouse.jupiter.house },
        saturn:  { ...toSignInfo(planetsWithHouse.saturn.lon),  house: planetsWithHouse.saturn.house },
        uranus:  { ...toSignInfo(planetsWithHouse.uranus.lon),  house: planetsWithHouse.uranus.house },
        neptune: { ...toSignInfo(planetsWithHouse.neptune.lon), house: planetsWithHouse.neptune.house },
        pluto:   { ...toSignInfo(planetsWithHouse.pluto.lon),   house: planetsWithHouse.pluto.house },
      },
      angles: {
        asc: toSignInfo(asc),
        mc:  toSignInfo(mc),
      },
      houses:      houses.map((h, i) => ({ house: i + 1, ...toSignInfo(h) })),
      natalAspects,

      progression: {
        meta: {
          progDate:  now.toISOString().slice(0, 10),
          ageYears:  Math.round(ageYears * 100) / 100,
        },
        planets: {
          sun:     { ...toSignInfo(progPlanetsWithHouse.sun.lon),     house: progPlanetsWithHouse.sun.house },
          moon:    { ...toSignInfo(progPlanetsWithHouse.moon.lon),    house: progPlanetsWithHouse.moon.house },
          mercury: { ...toSignInfo(progPlanetsWithHouse.mercury.lon), house: progPlanetsWithHouse.mercury.house },
          venus:   { ...toSignInfo(progPlanetsWithHouse.venus.lon),   house: progPlanetsWithHouse.venus.house },
          mars:    { ...toSignInfo(progPlanetsWithHouse.mars.lon),    house: progPlanetsWithHouse.mars.house },
          jupiter: { ...toSignInfo(progPlanetsWithHouse.jupiter.lon), house: progPlanetsWithHouse.jupiter.house },
          saturn:  { ...toSignInfo(progPlanetsWithHouse.saturn.lon),  house: progPlanetsWithHouse.saturn.house },
          uranus:  { ...toSignInfo(progPlanetsWithHouse.uranus.lon),  house: progPlanetsWithHouse.uranus.house },
          neptune: { ...toSignInfo(progPlanetsWithHouse.neptune.lon), house: progPlanetsWithHouse.neptune.house },
          pluto:   { ...toSignInfo(progPlanetsWithHouse.pluto.lon),   house: progPlanetsWithHouse.pluto.house },
        },
        angles: {
          asc: toSignInfo(progAsc),
          mc:  toSignInfo(progMc),
        },
        houses: progHouses.map((h, i) => ({ house: i + 1, ...toSignInfo(h) })),
        aspectsToNatal: progToNatalAspects,
      },

      meta: {
        name:      name || '',
        gender:    gender || 'M',
        birthDate,
        birthTime,
        lat,
        lng,
        utcOffset: offsetHours,
        houseSystem: 'Equal House'
      }
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('astro-calc error:', error);
    return res.status(500).json({ error: '천문 계산 중 오류가 발생했습니다: ' + error.message });
  }
}

/* =========================================================
   율리우스력 날짜 계산
   ========================================================= */
function calcJulianDay(y, m, d, utcHour = 0) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + utcHour / 24 + B - 1524.5;
}

/* =========================================================
   행성 위치 계산 (VSOP87 축약 + 달 ELP2000 축약)
   ========================================================= */
function calcPlanets(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  return {
    sun:     { lon: calcSun(T) },
    moon:    { lon: calcMoon(T) },
    mercury: { lon: calcMercury(T) },
    venus:   { lon: calcVenus(T) },
    mars:    { lon: calcMars(T) },
    jupiter: { lon: calcJupiter(T) },
    saturn:  { lon: calcSaturn(T) },
    uranus:  { lon: calcUranus(T) },
    neptune: { lon: calcNeptune(T) },
    pluto:   { lon: calcPluto(T) },
  };
}

function norm360(a) { return ((a % 360) + 360) % 360; }
function rad(d) { return d * Math.PI / 180; }

function calcSun(T) {
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M  = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const mr = rad(M);
  const C  = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(mr)
           + (0.019993 - 0.000101 * T) * Math.sin(2 * mr)
           + 0.000289 * Math.sin(3 * mr);
  return norm360(L0 + C);
}

function calcMoon(T) {
  const D  = 297.85036 + 445267.111480 * T - 0.0019142 * T * T;
  const M  = 357.52772 + 35999.050340  * T - 0.0001603 * T * T;
  const Mp = 134.96298 + 477198.867398 * T + 0.0086972 * T * T;
  const F  = 93.27191  + 483202.017538 * T - 0.0036825 * T * T;
  const L1 = 218.3165  + 481267.8813   * T;
  return norm360(L1
    + 6.289  * Math.sin(rad(Mp))
    - 1.274  * Math.sin(rad(2*D - Mp))
    + 0.658  * Math.sin(rad(2*D))
    - 0.214  * Math.sin(rad(2*Mp))
    - 0.186  * Math.sin(rad(M))
    - 0.114  * Math.sin(rad(2*F))
    + 0.059  * Math.sin(rad(2*D - 2*Mp))
    + 0.057  * Math.sin(rad(2*D - M - Mp))
    + 0.053  * Math.sin(rad(2*D + Mp))
    + 0.046  * Math.sin(rad(2*D - M))
    + 0.041  * Math.sin(rad(Mp - M))
    - 0.034  * Math.sin(rad(D))
    - 0.030  * Math.sin(rad(M + Mp))
    - 0.022  * Math.sin(rad(2*(D - F)))
    + 0.017  * Math.sin(rad(2*(Mp + F))));
}

function calcMercury(T) {
  const L = 252.250906 + 149474.0722491 * T + 0.00030397 * T * T;
  const M = 174.7948   + 149472.5159    * T;
  return norm360(L + 1.912 * Math.sin(rad(M)) + 0.120 * Math.sin(rad(2*M)));
}

function calcVenus(T) {
  const L = 181.979801 + 58519.2130302 * T + 0.00031014 * T * T;
  const M = 212.8      + 58517.80      * T;
  return norm360(L + 0.7758 * Math.sin(rad(M)) + 0.0033 * Math.sin(rad(2*M)));
}

function calcMars(T) {
  const L = 355.433 + 19141.6964471 * T + 0.00031052 * T * T;
  const M = 19.3730 + 19140.3       * T;
  return norm360(L + 10.691 * Math.sin(rad(M)) + 0.623 * Math.sin(rad(2*M)) + 0.050 * Math.sin(rad(3*M)));
}

function calcJupiter(T) {
  const L = 34.351519 + 3036.3027748 * T + 0.00022330 * T * T;
  const M = 20.9      + 3034.74      * T;
  return norm360(L + 5.555 * Math.sin(rad(M)) + 0.168 * Math.sin(rad(2*M)));
}

function calcSaturn(T) {
  const L = 50.077444 + 1223.5110686 * T + 0.00051908 * T * T;
  const M = 317.9     + 1222.114     * T;
  return norm360(L + 6.393 * Math.sin(rad(M)) + 0.120 * Math.sin(rad(2*M)));
}

function calcUranus(T) {
  const L = 314.055005 + 429.8640561 * T + 0.00030390 * T * T;
  const M = 142.5      + 428.9       * T;
  return norm360(L + 5.460 * Math.sin(rad(M)) + 0.168 * Math.sin(rad(2*M)));
}

function calcNeptune(T) {
  const L = 304.348665 + 219.8833092 * T + 0.00030882 * T * T;
  const M = 267.9      + 218.46      * T;
  return norm360(L + 1.769 * Math.sin(rad(M)));
}

function calcPluto(T) {
  const L = 238.92881 + 145.20780 * T;
  const M = 14.864    + 144.960   * T;
  return norm360(L + 28.3 * Math.sin(rad(M)) + 4.68 * Math.sin(rad(2*M)));
}

/* =========================================================
   Equal House 계산 (ASC 기준 30° 등분 — 일관성 확보)
   ========================================================= */
function calcHousesEqual(jd, lat, lng) {
  const T    = (jd - 2451545.0) / 36525.0;
  const GMST = norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T);
  const LST  = norm360(GMST + lng);

  const eps  = 23.4392911 - 0.013004167 * T;
  const epsr = rad(eps);

  // MC
  const mc = norm360(Math.atan2(Math.tan(rad(LST)), Math.cos(epsr)) * 180 / Math.PI);

  // ASC
  const latR = rad(lat);
  const RAMC = rad(LST);
  const asc  = norm360(
    Math.atan2(Math.cos(RAMC), -(Math.sin(epsr) * Math.tan(latR) + Math.cos(epsr) * Math.sin(RAMC))) * 180 / Math.PI
  );

  // Equal House: 1하우스 = ASC, 이후 30° 씩
  const houses = Array.from({ length: 12 }, (_, i) => norm360(asc + i * 30));

  return { asc, mc, houses };
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
   주요 각도: 합(0°) 육합(60°) 삼합(120°) 스퀘어(90°) 충(180°)
   orb: 합·충 8°, 트라인·스퀘어 6°, 섹스타일 4°
   ========================================================= */
const ASPECT_DEFS = [
  { name: '합',   angle:   0, orb: 8,  symbol: '☌' },
  { name: '육합', angle:  60, orb: 4,  symbol: '⚹' },
  { name: '삼합', angle: 120, orb: 6,  symbol: '△' },
  { name: '스퀘어', angle: 90, orb: 6, symbol: '□' },
  { name: '충',   angle: 180, orb: 8,  symbol: '☍' },
];

const PLANET_KEYS = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];
const PLANET_KR   = { sun:'태양', moon:'달', mercury:'수성', venus:'금성', mars:'화성',
                      jupiter:'목성', saturn:'토성', uranus:'천왕성', neptune:'해왕성', pluto:'명왕성' };

function angularDistance(a, b) {
  const diff = Math.abs(norm360(a) - norm360(b));
  return diff > 180 ? 360 - diff : diff;
}

function calcAspects(planets) {
  const aspects = [];
  for (let i = 0; i < PLANET_KEYS.length; i++) {
    for (let j = i + 1; j < PLANET_KEYS.length; j++) {
      const p1 = PLANET_KEYS[i];
      const p2 = PLANET_KEYS[j];
      const dist = angularDistance(planets[p1].lon, planets[p2].lon);
      for (const asp of ASPECT_DEFS) {
        if (Math.abs(dist - asp.angle) <= asp.orb) {
          aspects.push({
            planet1: PLANET_KR[p1],
            planet2: PLANET_KR[p2],
            aspect:  asp.name,
            symbol:  asp.symbol,
            orb:     Math.round((dist - asp.angle) * 10) / 10
          });
        }
      }
    }
  }
  return aspects;
}

function calcAspectsProgToNatal(progPlanets, natalPlanets) {
  const aspects = [];
  // 프로그레션 태양·달·수성·금성·화성만 (외행성은 변화 미미)
  const progKeys  = ['sun','moon','mercury','venus','mars'];
  const natalKeys = PLANET_KEYS;

  for (const pk of progKeys) {
    for (const nk of natalKeys) {
      const dist = angularDistance(progPlanets[pk].lon, natalPlanets[nk].lon);
      for (const asp of ASPECT_DEFS) {
        if (Math.abs(dist - asp.angle) <= asp.orb) {
          aspects.push({
            progPlanet:  `프로그레션 ${PLANET_KR[pk]}`,
            natalPlanet: `네이탈 ${PLANET_KR[nk]}`,
            aspect:  asp.name,
            symbol:  asp.symbol,
            orb:     Math.round((dist - asp.angle) * 10) / 10
          });
        }
      }
    }
  }
  return aspects;
}
