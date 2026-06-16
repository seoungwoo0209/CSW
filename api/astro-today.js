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
    const { birthDate, birthTime, lat, lng, name, gender, utcOffset,
            appLat: _appLat, appLng: _appLng, appUtcOffset: _appUtcOffset } = req.body;
    const appLat = (_appLat != null) ? _appLat : lat;
    const appLng = (_appLng != null) ? _appLng : lng;

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

    // ── 네이탈 북노드/릴리스
    const { northLon: natalNorthLon, southLon: natalSouthLon } = calcLunarNodes(jd);

    // ── 현재 KST 시각으로 트랜짓 계산
    const nowRaw  = new Date();
    const kstMs   = nowRaw.getTime() + 9 * 3600000;
    const kstDate = new Date(kstMs);
    const kstY    = kstDate.getUTCFullYear();
    const kstM    = kstDate.getUTCMonth() + 1;
    const kstD    = kstDate.getUTCDate();
    const kstH    = kstDate.getUTCHours();
    const kstMin  = kstDate.getUTCMinutes();
    const currentKSTTimeStr = `${String(kstH).padStart(2,'0')}:${String(kstMin).padStart(2,'0')}`;
    const todayKST = nowRaw; // 트랜짓 계산용 현재 UTC

    // ── 세컨더리 프로그레션 태양/달 (1일=1년, 태양 실제 이동 기반)
    const ageYears = (todayKST.getTime() - birthUTC.getTime()) / (365.25 * 86400000);
    const progUTC  = new Date(birthUTC.getTime() + ageYears * 86400000);
    const progRaw  = Ephemeris.getAllPlanets(progUTC, lng, lat, 0);
    const progPlanets = extractPlanets(progRaw.observed);
    const progWithHouse = assignHouses(progPlanets, houses);
    const { asc: progAsc, mc: progMc } = calcProgAnglesNaibod(jd, ageYears, lat, lng);

    // ── 프로그레션 JD + 북노드/릴리스
    const progJD = calcJulianDay(
      progUTC.getUTCFullYear(), progUTC.getUTCMonth() + 1, progUTC.getUTCDate(),
      progUTC.getUTCHours() + progUTC.getUTCMinutes() / 60
    );
    const { northLon: progNorthLon, southLon: progSouthLon } = calcLunarNodes(progJD);

    // ── 오늘 트랜짓 행성 계산
    const todayRaw     = Ephemeris.getAllPlanets(todayKST, appLng, appLat, 0);
    const todayPlanets = extractPlanets(todayRaw.observed);
    const todayWithHouse = assignHouses(todayPlanets, houses); // 네이탈 하우스 기준

    // ── 달의 위상 계산
    const moonElongation   = norm360(todayPlanets.moon.lon - todayPlanets.sun.lon);
    const moonIllumination = Math.round((1 - Math.cos(moonElongation * Math.PI / 180)) / 2 * 100);
    let moonPhaseName, moonPhaseIcon, moonPhaseEnergy;
    if      (moonElongation < 22.5)  { moonPhaseName='신월';    moonPhaseIcon='🌑'; moonPhaseEnergy='새로운 시작과 의도 설정의 시기 — 에너지가 내부로 축적됨'; }
    else if (moonElongation < 67.5)  { moonPhaseName='초승달';  moonPhaseIcon='🌒'; moonPhaseEnergy='씨앗 발아 단계 — 행동 개시와 추진 시작에 유리'; }
    else if (moonElongation < 112.5) { moonPhaseName='상현달';  moonPhaseIcon='🌓'; moonPhaseEnergy='결단과 도전의 시기 — 장애를 넘어 추진력이 강해짐'; }
    else if (moonElongation < 157.5) { moonPhaseName='보름 전'; moonPhaseIcon='🌔'; moonPhaseEnergy='에너지 절정을 향해 상승 — 확장과 가시화에 좋음'; }
    else if (moonElongation < 202.5) { moonPhaseName='보름달';  moonPhaseIcon='🌕'; moonPhaseEnergy='에너지 절정 — 성취·완성·감정이 최고조에 달함'; }
    else if (moonElongation < 247.5) { moonPhaseName='보름 후'; moonPhaseIcon='🌖'; moonPhaseEnergy='수확과 나눔의 시기 — 감사·공유·관계 강화에 좋음'; }
    else if (moonElongation < 292.5) { moonPhaseName='하현달';  moonPhaseIcon='🌗'; moonPhaseEnergy='정리와 놓아주기 — 불필요한 것을 내려놓는 시기'; }
    else if (moonElongation < 337.5) { moonPhaseName='그믐달';  moonPhaseIcon='🌘'; moonPhaseEnergy='내면 성찰과 휴식 — 재충전과 다음 시작 준비'; }
    else                              { moonPhaseName='신월';    moonPhaseIcon='🌑'; moonPhaseEnergy='새로운 시작과 의도 설정의 시기 — 에너지가 내부로 축적됨'; }
    const moonPhase = {
      elongation:    Math.round(moonElongation * 10) / 10,
      illumination:  moonIllumination,
      phaseName:     moonPhaseName,
      phaseIcon:     moonPhaseIcon,
      energy:        moonPhaseEnergy,
    };

    // ── 오늘 트랜짓 ASC/MC + 북노드/릴리스
    const todayJD = calcJulianDay(
      todayKST.getUTCFullYear(), todayKST.getUTCMonth() + 1, todayKST.getUTCDate(),
      todayKST.getUTCHours() + todayKST.getUTCMinutes() / 60
    );
    const { asc: todayAsc, mc: todayMc } = calcHousesPlacidus(todayJD, appLat, appLng);
    const { northLon: todayNorthLon, southLon: todaySouthLon } = calcLunarNodes(todayJD);

    // ── 오늘 트랜짓 → 네이탈 에스펙트 (행성 10개 + ASC + MC + 북노드 + 릴리스 = 12포인트 전부)
    const natalPoints   = buildAspectPoints(natalPlanets, asc, mc, natalNorthLon, natalSouthLon);
    const transitPoints = buildAspectPoints(todayPlanets, todayAsc, todayMc, todayNorthLon, todaySouthLon);
    const todayAspectsFull = calcAllAspects(transitPoints, natalPoints, {
      labelPrefixA: '오늘 ', labelPrefixB: '네이탈 '
    });

    // ── 프로그레션 → 트랜짓 에스펙트 (12포인트 × 12포인트)
    const progPoints = buildAspectPoints(progPlanets, progAsc, progMc, progNorthLon, progSouthLon);
    const progTransitAspects = calcAllAspects(progPoints, transitPoints, {
      labelPrefixA: '프로그레션 ', labelPrefixB: '오늘 '
    });

    // ── 역행 계산 (어제 정오 vs 오늘 정오 경도 비교)
    const yesterdayKST = new Date(todayKST.getTime() - 86400000);
    const yesterdayRaw = Ephemeris.getAllPlanets(yesterdayKST, lng, lat, 0);
    const yesterdayPlanets = extractPlanets(yesterdayRaw.observed);

    const RETRO_KEYS = ['mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];
    const retrograde = {};
    RETRO_KEYS.forEach(k => {
      const todayLon     = todayPlanets[k].lon;
      const yesterdayLon = yesterdayPlanets[k].lon;
      // 경도 차이 계산 (0° 경계 처리)
      let diff = todayLon - yesterdayLon;
      if (diff > 180)  diff -= 360;
      if (diff < -180) diff += 360;
      retrograde[k] = diff < 0;
    });

    // ── 달의 VOC 계산
    // 오늘 1시간 단위로 달 위치를 계산해서
    // 마지막 에스펙트 시각 ~ 다음 사인 진입 시각 = VOC 구간
    const ASPECT_ANGLES = [0, 60, 90, 120, 180];
    const MAJOR_PLANET_KEYS = ['sun','mercury','venus','mars','jupiter','saturn'];

    function getMoonLon(date) {
      const r = Ephemeris.getAllPlanets(date, appLng, appLat, 0);
      return ((r.observed.moon?.apparentLongitudeDd ?? 0) % 360 + 360) % 360;
    }

    function hasAspect(moonLon, planetLon) {
      let diff = Math.abs(moonLon - planetLon);
      if (diff > 180) diff = 360 - diff;
      return ASPECT_ANGLES.some(a => Math.abs(diff - a) <= 1.0); // orb 1° 이내
    }

    // KST 자정(00:00 KST)부터 24시간 스캔
    const dayStart = new Date(Date.UTC(kstY, kstM - 1, kstD, 0, 0, 0) - 9 * 3600000);

    let lastAspectHour  = -1;
    let vocStartHour    = -1;
    let vocEndHour      = -1;
    let currentMoonSign = Math.floor(getMoonLon(dayStart) / 30);

    for (let h = 0; h <= 24; h++) {
      const t       = new Date(dayStart.getTime() + h * 3600000);
      const moonLon = getMoonLon(t);
      const moonSign = Math.floor(moonLon / 30);

      // 사인 변경 = VOC 종료
      if (moonSign !== currentMoonSign) {
        vocEndHour = h;
        break;
      }

      // 행성과 에스펙트 확인
      const planets24 = extractPlanets(Ephemeris.getAllPlanets(t, lng, lat, 0).observed);
      const inAspect = MAJOR_PLANET_KEYS.some(k =>
        k !== 'moon' && hasAspect(moonLon, planets24[k].lon)
      );

      if (inAspect) {
        lastAspectHour = h;
        vocStartHour   = -1; // 리셋
      } else if (lastAspectHour >= 0 && vocStartHour === -1) {
        vocStartHour = h;
      }
    }

    const SIGNS_KR = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                      '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];

    // 다음 달 사인
    const tomorrowMoonLon  = getMoonLon(new Date(dayStart.getTime() + 25 * 3600000));
    const nextMoonSignIdx  = Math.floor(tomorrowMoonLon / 30);
    const nextMoonSign     = SIGNS_KR[nextMoonSignIdx];

    const vocData = vocStartHour >= 0 && vocEndHour > vocStartHour
      ? {
          isVoc:      true,
          startHour:  vocStartHour,   // KST 기준
          endHour:    vocEndHour,
          startStr:   `${String(vocStartHour).padStart(2,'0')}:00`,
          endStr:     `${String(vocEndHour).padStart(2,'0')}:00`,
          nextSign:   nextMoonSign,
          desc: `오늘 ${String(vocStartHour).padStart(2,'0')}:00 ~ ${String(vocEndHour).padStart(2,'0')}:00 달이 ${nextMoonSign}으로 넘어가기 전 보이드 오브 코스(VOC) 구간입니다.`
        }
      : { isVoc: false, desc: '오늘은 달의 VOC 구간이 없습니다.' };



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

    // 오늘 날짜/시각 문자열 (KST)
    const todayStr = `${kstY}-${String(kstM).padStart(2,'0')}-${String(kstD).padStart(2,'0')}`;

    return res.status(200).json({
      natal:         natalResult,
      natalAngles:   { asc: toSignInfo(asc), mc: toSignInfo(mc) },
      todayTransit:  todayResult,
      todayAspectsFull,
      progTransitAspects,
      retrograde,
      vocData,
      moonPhase,
      progression: {
        sun:      { ...toSignInfo(progWithHouse.sun.lon),  house: progWithHouse.sun.house  },
        moon:     { ...toSignInfo(progWithHouse.moon.lon), house: progWithHouse.moon.house },
        asc:      toSignInfo(progAsc),
        ageYears: Math.round(ageYears * 100) / 100,
      },
      todayDate:     todayStr,
      currentTime:   currentKSTTimeStr,
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

function calcProgAnglesNaibod(natalJD, ageYears, lat, lng) {
  const NAIBOD = 0.98564736629;
  const T = (natalJD - 2451545.0) / 36525.0;
  const GMST = norm360(
    280.46061837 + 360.98564736629 * (natalJD - 2451545.0)
    + 0.000387933 * T * T - (T * T * T) / 38710000.0
  );
  const natalRAMC = norm360(GMST + lng);
  const progRAMC  = norm360(natalRAMC + ageYears * NAIBOD);
  const eps  = 23.4392911 - 0.013004167 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
  const epsR = rad(eps);
  const latR = rad(lat);
  const mc_raw = Math.atan(Math.tan(rad(progRAMC)) / Math.cos(epsR)) * 180 / Math.PI;
  const mc     = norm360(Math.cos(rad(progRAMC)) < 0 ? mc_raw + 180 : mc_raw);
  const asc    = norm360(Math.atan2(
    Math.cos(rad(progRAMC)),
    -(Math.sin(epsR) * Math.tan(latR) + Math.cos(epsR) * Math.sin(rad(progRAMC)))
  ) * 180 / Math.PI);
  return { asc, mc };
}

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

/* =========================================================
   북노드/릴리스 계산 (평균 노드, Mean Node)
   astro-calc.js와 동일 로직
   ========================================================= */
function calcLunarNodes(jd) {
  const T     = (jd - 2451545.0) / 36525.0;
  const omega = norm360(125.04452  - 1934.136261   * T + 0.0020708 * T * T);

  // 평균 북노드 (Mean Node)
  const northLon = omega;

  // 릴리스 = 달의 근지점 (Black Moon Lilith + 180°)
  const bml = norm360(
    83.3532465 + 4069.0137287 * T - 0.0103200 * T * T
    - T * T * T / 80053 + T * T * T * T / 18999000
  );
  const southLon = norm360(bml + 180);

  return { northLon, southLon };
}

/* =========================================================
   에스펙트 포인트 구성 — 행성 10개 + ASC + MC + 북노드 + 릴리스
   ========================================================= */
function buildAspectPoints(planets, asc, mc, northLon, southLon) {
  return [
    ...PLANET_KEYS.map(k => ({ key: k, label: PLANET_KR[k], lon: planets[k].lon })),
    { key: 'asc',       label: 'ASC',      lon: asc },
    { key: 'mc',        label: 'MC',       lon: mc },
    { key: 'northNode', label: '북노드(☊)', lon: northLon },
    { key: 'southNode', label: '릴리스(☋)', lon: southLon },
  ];
}

/* =========================================================
   범용 에스펙트 계산 — pointsA × pointsB 전체 조합
   ========================================================= */
function calcAllAspects(pointsA, pointsB, opts = {}) {
  const { labelPrefixA = '', labelPrefixB = '' } = opts;
  const aspects = [];

  for (const p1 of pointsA) {
    for (const p2 of pointsB) {
      const dist = angularDistance(p1.lon, p2.lon);
      for (const asp of ASPECT_DEFS) {
        const diff = Math.abs(dist - asp.angle);
        if (diff <= asp.orb) {
          const signed   = signedAngularDiff(p1.lon, p2.lon);
          const applying = signed > 0 ? dist < asp.angle : dist > asp.angle;
          aspects.push({
            point1:  labelPrefixA + p1.label,
            point2:  labelPrefixB + p2.label,
            aspect:  asp.name,
            symbol:  asp.symbol,
            orb:     Math.round(diff * 10) / 10,
            applying,
          });
        }
      }
    }
  }

  return aspects.sort((a, b) => a.orb - b.orb);
}
