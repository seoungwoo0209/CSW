/* =========================================================
   api/astro-calc.js
   VSOP87 간략판 — 네이탈 + 세컨더리 프로그레션 + 에스펙트 일괄 계산
   AI 해석용 데이터를 한 번에 반환
   ========================================================= */

const PLANET_KEYS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

const PLANET_LABELS = {
  sun: '태양', moon: '달', mercury: '수성', venus: '금성', mars: '화성',
  jupiter: '목성', saturn: '토성', uranus: '천왕성', neptune: '해왕성', pluto: '명왕성'
};

const SIGNS = ['양자리', '황소자리', '쌍둥이자리', '게자리', '사자자리', '처녀자리',
  '천칭자리', '전갈자리', '사수자리', '염소자리', '물병자리', '물고기자리'];
const SIGNS_EN = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const SIGN_RULERS = ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury',
  'venus', 'pluto', 'jupiter', 'saturn', 'uranus', 'neptune'];

const ASPECT_DEFS = [
  { name: '합', en: 'conjunction', angle: 0, orb: 8 },
  { name: '육분', en: 'sextile', angle: 60, orb: 6 },
  { name: '사분', en: 'square', angle: 90, orb: 8 },
  { name: '삼분', en: 'trine', angle: 120, orb: 8 },
  { name: '대분', en: 'opposition', angle: 180, orb: 8 },
];

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
    const [hh, mi] = birthTime.split(':').map(Number);

    const utcHour = hh + mi / 60 - 9;
    const jd = calcJulianDay(yyyy, mm, dd, utcHour);

    const planets = calcPlanets(jd);
    const { asc, mc, houses } = calcHouses(jd, lat, lng);
    const planetsWithHouse = assignHouses(planets, houses);

    const birthMs = Date.UTC(yyyy, mm - 1, dd, hh - 9, mi);
    const now = new Date();
    const ageYears = (now.getTime() - birthMs) / (365.25 * 86400000);
    const progJD = jd + ageYears;
    const progDate = now.toISOString().slice(0, 10);

    const progPlanets = calcPlanets(progJD);
    const { asc: progAsc, mc: progMc, houses: progHouses } = calcHouses(progJD, lat, lng);
    const progPlanetsWithHouse = assignHouses(progPlanets, progHouses);

    const toSignInfo = (lon) => {
      const norm = norm360(lon);
      const signIdx = Math.floor(norm / 30);
      const degree = norm % 30;
      return {
        longitude: norm,
        sign: SIGNS[signIdx],
        signEn: SIGNS_EN[signIdx],
        signIndex: signIdx,
        degree: Math.floor(degree),
        minute: Math.floor((degree % 1) * 60)
      };
    };

    const buildPlanetChart = (raw) => {
      const chart = {};
      for (const key of PLANET_KEYS) {
        chart[key] = { ...toSignInfo(raw[key].lon), house: raw[key].house };
      }
      return chart;
    };

    const natal = buildPlanetChart(planetsWithHouse);
    const progressionPlanets = buildPlanetChart(progPlanetsWithHouse);

    const angles = { asc: toSignInfo(asc), mc: toSignInfo(mc) };
    const progressionAngles = { asc: toSignInfo(progAsc), mc: toSignInfo(progMc) };

    const houseList = houses.map((h, i) => ({ house: i + 1, ...toSignInfo(h) }));
    const progressionHouses = progHouses.map((h, i) => ({ house: i + 1, ...toSignInfo(h) }));

    const aspectsNatal = calcAspectsWithin(planetsWithHouse, '네이탈');
    const aspectsProgression = calcAspectsWithin(progPlanetsWithHouse, '프로그레션');
    const aspectsProgToNatal = calcAspectsBetween(progPlanetsWithHouse, planetsWithHouse, '프로그레션', '네이탈');

    const chartRulerKey = SIGN_RULERS[angles.asc.signIndex];
    const chartRuler = {
      planet: chartRulerKey,
      label: PLANET_LABELS[chartRulerKey],
      ...natal[chartRulerKey]
    };

    const progression = {
      date: progDate,
      ageYears: Math.round(ageYears * 100) / 100,
      planets: progressionPlanets,
      angles: progressionAngles,
      houses: progressionHouses
    };

    const interpretation = buildInterpretationBundle({
      natal, angles, houseList, progression, chartRuler,
      aspectsNatal, aspectsProgression, aspectsProgToNatal,
      meta: { name: name || '', gender: gender || 'M', birthDate, birthTime, lat, lng }
    });

    return res.status(200).json({
      natal,
      angles,
      houses: houseList,
      progression,
      aspects: {
        natal: aspectsNatal,
        progression: aspectsProgression,
        progressionToNatal: aspectsProgToNatal
      },
      chartRuler,
      interpretation,
      meta: { name: name || '', gender: gender || 'M', birthDate, birthTime, lat, lng }
    });

  } catch (error) {
    console.error('astro-calc error:', error);
    return res.status(500).json({ error: '천문 계산 중 오류가 발생했습니다: ' + error.message });
  }
}

function buildInterpretationBundle(data) {
  const fmtPlanet = (label, p) =>
    `${label}: ${p.sign} ${p.degree}°${p.minute}'${p.house ? `, ${p.house}하우스` : ''}`;

  const natalPlanets = PLANET_KEYS.map(k => fmtPlanet(`${PLANET_LABELS[k]}(${k})`, data.natal[k])).join('\n');
  const progPlanets = PLANET_KEYS.map(k => fmtPlanet(`${PLANET_LABELS[k]}(${k})`, data.progression.planets[k])).join('\n');

  const houseCusps = data.houseList.map(h =>
    `${h.house}하우스 커스프: ${h.sign} ${h.degree}°${h.minute}'`
  ).join('\n');

  const progHouseCusps = data.progression.houses.map(h =>
    `${h.house}하우스 커스프: ${h.sign} ${h.degree}°${h.minute}'`
  ).join('\n');

  const fmtAspects = (list) =>
    list.length
      ? list.map(a => `${a.bodyA} ${a.name}(${a.en}) ${a.bodyB} — 오차 ${a.orbDelta.toFixed(1)}°`).join('\n')
      : '(주요 에스펙트 없음)';

  return {
    natalPlanets,
    houseCusps,
    progressionPlanets: progPlanets,
    progressionAngles: [
      `프로그레션 ASC: ${data.progression.angles.asc.sign} ${data.progression.angles.asc.degree}°${data.progression.angles.asc.minute}'`,
      `프로그레션 MC: ${data.progression.angles.mc.sign} ${data.progression.angles.mc.degree}°${data.progression.angles.mc.minute}'`
    ].join('\n'),
    progressionHouses: progHouseCusps,
    progressionMeta: `기준일: ${data.progression.date}, 나이: ${data.progression.ageYears}세 (세컨더리 1일=1년)`,
    chartRuler: `차트 지배행성(ASC ${data.angles.asc.sign}): ${data.chartRuler.label} — ${data.chartRuler.sign} ${data.chartRuler.degree}°${data.chartRuler.minute}', ${data.chartRuler.house}하우스`,
    aspectsNatal: fmtAspects(data.aspectsNatal),
    aspectsProgression: fmtAspects(data.aspectsProgression),
    aspectsProgToNatal: fmtAspects(data.aspectsProgToNatal)
  };
}

function calcAspectsWithin(planetsWithLon, prefix) {
  const aspects = [];
  for (let i = 0; i < PLANET_KEYS.length; i++) {
    for (let j = i + 1; j < PLANET_KEYS.length; j++) {
      const a = PLANET_KEYS[i];
      const b = PLANET_KEYS[j];
      const asp = findAspect(planetsWithLon[a].lon, planetsWithLon[b].lon);
      if (asp) {
        aspects.push({
          bodyA: `${prefix} ${PLANET_LABELS[a]}`,
          bodyB: `${prefix} ${PLANET_LABELS[b]}`,
          ...asp
        });
      }
    }
  }
  return aspects;
}

function calcAspectsBetween(setA, setB, labelA, labelB) {
  const aspects = [];
  for (const a of PLANET_KEYS) {
    for (const b of PLANET_KEYS) {
      const asp = findAspect(setA[a].lon, setB[b].lon);
      if (asp) {
        aspects.push({
          bodyA: `${labelA} ${PLANET_LABELS[a]}`,
          bodyB: `${labelB} ${PLANET_LABELS[b]}`,
          ...asp
        });
      }
    }
  }
  return aspects;
}

function findAspect(lonA, lonB) {
  let diff = Math.abs(norm360(lonA) - norm360(lonB));
  if (diff > 180) diff = 360 - diff;

  for (const def of ASPECT_DEFS) {
    const orbDelta = Math.abs(diff - def.angle);
    if (orbDelta <= def.orb) {
      return { name: def.name, en: def.en, angle: def.angle, separation: Math.round(diff * 10) / 10, orbDelta };
    }
  }
  return null;
}

function calcJulianDay(y, m, d, utcHour = 0) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + utcHour / 24 + B - 1524.5;
}

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
  const M  = 357.52772 + 35999.050340 * T - 0.0001603 * T * T;
  const Mp = 134.96298 + 477198.867398 * T + 0.0086972 * T * T;
  const F  = 93.27191  + 483202.017538 * T - 0.0036825 * T * T;
  const L1 = 218.3165 + 481267.8813 * T;
  const lon = L1
    + 6.289 * Math.sin(rad(Mp))
    - 1.274 * Math.sin(rad(2 * D - Mp))
    + 0.658 * Math.sin(rad(2 * D))
    - 0.214 * Math.sin(rad(2 * Mp))
    - 0.186 * Math.sin(rad(M))
    - 0.114 * Math.sin(rad(2 * F))
    + 0.059 * Math.sin(rad(2 * D - 2 * Mp))
    + 0.057 * Math.sin(rad(2 * D - M - Mp))
    + 0.053 * Math.sin(rad(2 * D + Mp))
    + 0.046 * Math.sin(rad(2 * D - M))
    + 0.041 * Math.sin(rad(Mp - M))
    - 0.034 * Math.sin(rad(D))
    - 0.030 * Math.sin(rad(M + Mp))
    - 0.022 * Math.sin(rad(2 * (D - F)))
    + 0.017 * Math.sin(rad(2 * (Mp + F)));
  return norm360(lon);
}

function calcMercury(T) {
  const L = 252.250906 + 149474.0722491 * T + 0.00030397 * T * T;
  const M = 174.7948 + 149472.5159 * T;
  return norm360(L + 1.912 * Math.sin(rad(M)) + 0.120 * Math.sin(rad(2 * M)));
}

function calcVenus(T) {
  const L = 181.979801 + 58519.2130302 * T + 0.00031014 * T * T;
  const M = 212.8 + 58517.80 * T;
  return norm360(L + 0.7758 * Math.sin(rad(M)) + 0.0033 * Math.sin(rad(2 * M)));
}

function calcMars(T) {
  const L = 355.433 + 19141.6964471 * T + 0.00031052 * T * T;
  const M = 19.3730 + 19140.3 * T;
  return norm360(L + 10.691 * Math.sin(rad(M)) + 0.623 * Math.sin(rad(2 * M)) + 0.050 * Math.sin(rad(3 * M)));
}

function calcJupiter(T) {
  const L = 34.351519 + 3036.3027748 * T + 0.00022330 * T * T;
  const M = 20.9 + 3034.74 * T;
  return norm360(L + 5.555 * Math.sin(rad(M)) + 0.168 * Math.sin(rad(2 * M)));
}

function calcSaturn(T) {
  const L = 50.077444 + 1223.5110686 * T + 0.00051908 * T * T;
  const M = 317.9 + 1222.114 * T;
  return norm360(L + 6.393 * Math.sin(rad(M)) + 0.120 * Math.sin(rad(2 * M)));
}

function calcUranus(T) {
  const L = 314.055005 + 429.8640561 * T + 0.00030390 * T * T;
  const M = 142.5 + 428.9 * T;
  return norm360(L + 5.460 * Math.sin(rad(M)) + 0.168 * Math.sin(rad(2 * M)));
}

function calcNeptune(T) {
  const L = 304.348665 + 219.8833092 * T + 0.00030882 * T * T;
  const M = 267.9 + 218.46 * T;
  return norm360(L + 1.769 * Math.sin(rad(M)));
}

function calcPluto(T) {
  const L = 238.92881 + 145.20780 * T;
  const M = 14.864 + 144.960 * T;
  return norm360(L + 28.3 * Math.sin(rad(M)) + 4.68 * Math.sin(rad(2 * M)));
}

function calcHouses(jd, lat, lng) {
  const T    = (jd - 2451545.0) / 36525.0;
  const GMST = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T;
  const LST  = norm360(GMST + lng);
  const eps = 23.4392911 - 0.013004167 * T;
  const epsr = rad(eps);
  const mc = norm360(Math.atan2(Math.tan(rad(LST)), Math.cos(epsr)) * 180 / Math.PI);
  const latR = rad(lat);
  const RAMC = rad(LST);
  const asc  = norm360(
    Math.atan2(Math.cos(RAMC), -(Math.sin(epsr) * Math.tan(latR) + Math.cos(epsr) * Math.sin(RAMC))) * 180 / Math.PI
  );

  const houses = [];
  for (let i = 0; i < 12; i++) houses.push(norm360(asc + i * 30));
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

function assignHouses(planets, houses) {
  function getHouse(lon) {
    const normLon = norm360(lon);
    for (let i = 0; i < 12; i++) {
      const start = houses[i];
      const end   = houses[(i + 1) % 12];
      if (start <= end) {
        if (normLon >= start && normLon < end) return i + 1;
      } else if (normLon >= start || normLon < end) {
        return i + 1;
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
