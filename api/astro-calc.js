/* =========================================================
   api/astro-calc.js
   Swiss Ephemeris 기반 행성 위치 계산 (VSOP87 간략판)
   출생 정보 → 네이탈 차트 데이터 반환
   ========================================================= */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { birthDate, birthTime, lat, lng, name, gender } = req.body;

    if (!birthDate || !birthTime || lat == null || lng == null) {
      return res.status(400).json({ error: '생년월일, 출생시각, 출생지(위도/경도)가 필요합니다.' });
    }

    const [yyyy, mm, dd] = birthDate.split('-').map(Number);
    const [hh, mi]       = birthTime.split(':').map(Number);

    // ── UTC 변환 (KST -9h)
    const utcHour = hh + mi / 60 - 9 + (-lng / 15); // 로컬 평균태양시 보정
    const jd = calcJulianDay(yyyy, mm, dd, hh + mi / 60 - 9); // UTC 기준 JD

    // ── 행성 위치 계산
    const planets = calcPlanets(jd);

    // ── 어센던트 & 하우스 계산 (Placidus)
    const { asc, mc, houses } = calcHouses(jd, lat, lng);

    // ── 행성 → 하우스 배정
    const planetsWithHouse = assignHouses(planets, houses);

    // ── 세컨더리 프로그레션 계산 (현재 날짜)
    const now = new Date();
    const ageYears = (now - new Date(yyyy, mm-1, dd)) / (365.25 * 86400000);
    const progJD = jd + ageYears; // 1일 = 1년
    const progPlanets = calcPlanets(progJD);

    // ── 사인명 변환
    const SIGNS = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                   '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
    const SIGNS_EN = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
                      'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];

    function toSignInfo(lon) {
      const signIdx = Math.floor(((lon % 360) + 360) % 360 / 30);
      const degree  = ((lon % 360) + 360) % 360 % 30;
      return {
        longitude: ((lon % 360) + 360) % 360,
        sign: SIGNS[signIdx],
        signEn: SIGNS_EN[signIdx],
        signIndex: signIdx,
        degree: Math.floor(degree),
        minute: Math.floor((degree % 1) * 60)
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
      houses: houses.map((h, i) => ({ house: i + 1, ...toSignInfo(h) })),
      progression: {
        sun:  { ...toSignInfo(progPlanets.sun.lon) },
        moon: { ...toSignInfo(progPlanets.moon.lon) },
      },
      meta: { name: name || '', gender: gender || 'M', birthDate, birthTime, lat, lng }
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
  const T = (jd - 2451545.0) / 36525.0; // J2000.0 기준 율리우스 세기

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
  const M  = 357.52772 + 35999.050340 * T - 0.0001603 * T * T;
  const Mp = 134.96298 + 477198.867398 * T + 0.0086972 * T * T;
  const F  = 93.27191  + 483202.017538 * T - 0.0036825 * T * T;
  const L1 = 218.3165 + 481267.8813 * T;

  const lon = L1
    + 6.289 * Math.sin(rad(Mp))
    - 1.274 * Math.sin(rad(2*D - Mp))
    + 0.658 * Math.sin(rad(2*D))
    - 0.214 * Math.sin(rad(2*Mp))
    - 0.186 * Math.sin(rad(M))
    - 0.114 * Math.sin(rad(2*F))
    + 0.059 * Math.sin(rad(2*D - 2*Mp))
    + 0.057 * Math.sin(rad(2*D - M - Mp))
    + 0.053 * Math.sin(rad(2*D + Mp))
    + 0.046 * Math.sin(rad(2*D - M))
    + 0.041 * Math.sin(rad(Mp - M))
    - 0.034 * Math.sin(rad(D))
    - 0.030 * Math.sin(rad(M + Mp))
    - 0.022 * Math.sin(rad(2*(D-F)))
    + 0.017 * Math.sin(rad(2*(Mp+F)));

  return norm360(lon);
}

function calcMercury(T) {
  const L = 252.250906 + 149474.0722491 * T + 0.00030397 * T * T;
  const M = 174.7948   + 149472.5159    * T;
  return norm360(L + 1.912 * Math.sin(rad(M)) + 0.120 * Math.sin(rad(2*M)));
}

function calcVenus(T) {
  const L = 181.979801 + 58519.2130302 * T + 0.00031014 * T * T;
  const M = 212.8       + 58517.80       * T;
  return norm360(L + 0.7758 * Math.sin(rad(M)) + 0.0033 * Math.sin(rad(2*M)));
}

function calcMars(T) {
  const L = 355.433 + 19141.6964471 * T + 0.00031052 * T * T;
  const M = 19.3730 + 19140.3       * T;
  return norm360(L + 10.691 * Math.sin(rad(M)) + 0.623 * Math.sin(rad(2*M)) + 0.050 * Math.sin(rad(3*M)));
}

function calcJupiter(T) {
  const L = 34.351519 + 3036.3027748 * T + 0.00022330 * T * T;
  const M = 20.9   + 3034.74 * T;
  return norm360(L + 5.555 * Math.sin(rad(M)) + 0.168 * Math.sin(rad(2*M)));
}

function calcSaturn(T) {
  const L = 50.077444 + 1223.5110686 * T + 0.00051908 * T * T;
  const M = 317.9 + 1222.114 * T;
  return norm360(L + 6.393 * Math.sin(rad(M)) + 0.120 * Math.sin(rad(2*M)));
}

function calcUranus(T) {
  const L = 314.055005 + 429.8640561 * T + 0.00030390 * T * T;
  const M = 142.5    + 428.9        * T;
  return norm360(L + 5.460 * Math.sin(rad(M)) + 0.168 * Math.sin(rad(2*M)));
}

function calcNeptune(T) {
  const L = 304.348665 + 219.8833092 * T + 0.00030882 * T * T;
  const M = 267.9      + 218.46       * T;
  return norm360(L + 1.769 * Math.sin(rad(M)));
}

function calcPluto(T) {
  // 명왕성은 단순 평균운동 근사
  const L = 238.92881 + 145.20780 * T;
  const M = 14.864    + 144.960   * T;
  return norm360(L + 28.3 * Math.sin(rad(M)) + 4.68 * Math.sin(rad(2*M)));
}

/* =========================================================
   하우스 계산 (Placidus)
   ========================================================= */
function calcHouses(jd, lat, lng) {
  const T    = (jd - 2451545.0) / 36525.0;
  const GMST = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T;
  const LST  = norm360(GMST + lng);

  // 황도 기울기
  const eps = 23.4392911 - 0.013004167 * T;
  const epsr = rad(eps);

  // MC 계산
  const mc = norm360(Math.atan2(Math.tan(rad(LST)), Math.cos(epsr)) * 180 / Math.PI);

  // ASC 계산
  const latR = rad(lat);
  const RAMC = rad(LST);
  const asc  = norm360(
    Math.atan2(Math.cos(RAMC), -(Math.sin(epsr) * Math.tan(latR) + Math.cos(epsr) * Math.sin(RAMC))) * 180 / Math.PI
  );

  // Placidus 하우스 (근사 - 등분 하우스로 보완)
  const houses = [];
  for (let i = 0; i < 12; i++) {
    houses.push(norm360(asc + i * 30));
  }
  // 1, 4, 7, 10 하우스는 ASC/MC 기반
  houses[0]  = asc;
  houses[3]  = norm360(mc + 180);
  houses[6]  = norm360(asc + 180);
  houses[9]  = mc;
  houses[1]  = norm360(asc + 30);
  houses[2]  = norm360(asc + 60);
  houses[4]  = norm360(mc + 210);
  houses[5]  = norm360(mc + 240);
  houses[7]  = norm360(asc + 210);
  houses[8]  = norm360(asc + 240);
  houses[10] = norm360(mc + 30);
  houses[11] = norm360(mc + 60);

  return { asc, mc, houses };
}

/* =========================================================
   행성 → 하우스 배정
   ========================================================= */
function assignHouses(planets, houses) {
  function getHouse(lon) {
    const normLon = ((lon % 360) + 360) % 360;
    for (let i = 0; i < 12; i++) {
      const start = houses[i];
      const end   = houses[(i + 1) % 12];
      if (start <= end) {
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
