/* =========================================================
   api/astro-calc.js  v3.2
   행성 위치 계산 — ephemeris 패키지 (Moshier, 오차 1' 이내)
   하우스: Placidus
   세컨더리 프로그레션: 태양 실제 이동 기반 (정밀 공식)

   [v3.2 수정 내역]
   FIX 1. UTC 변환 후 birthUTC 기준으로 JD 역산 재계산 (날짜 경계 오류 수정)
   FIX 2. progJD를 progUTC 실제 날짜에서 직접 계산 (년/일 단위 혼용 제거)
   FIX 3. GMST T³ 항(-T³/38710000) 추가 (IAU 표준 공식 완성)
   FIX 4. raToEcl에 적위(dec) 반영하여 황경 변환 정밀도 향상
   FIX 5. 이분법 탐색 범위 ±3일, 반복 60회로 확장 (수렴 안정성 강화)
   FIX 6. 에스펙트에 applying/separating 필드 추가
   ========================================================= */

import Ephemeris from 'ephemeris';
import { applyCors } from './_cors.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { birthDate, birthTime, lat, lng, name, gender, utcOffset, partner } = req.body;

    if (!birthDate || !birthTime || lat == null || lng == null) {
      return res.status(400).json({ error: '생년월일, 출생시각, 출생지(위도/경도)가 필요합니다.' });
    }

    const {
      birthUTC, jd, planets, planetsWithHouse, asc, mc, houses,
      offsetHours
    } = computeNatalChart(birthDate, birthTime, lat, lng, utcOffset);

    // ── 세컨더리 프로그레션 (태양 실제 이동 기반 정밀 공식)
    // 1일 = 1년. 현재 나이(년) = 출생일로부터 경과한 일수
    // 현재 날짜 (KST 기준 오늘 자정)
    const nowRaw  = new Date();
    const todayKST = new Date(Date.UTC(
      nowRaw.getUTCFullYear(),
      nowRaw.getUTCMonth(),
      nowRaw.getUTCDate() + (nowRaw.getUTCHours() >= 15 ? 1 : 0), // UTC 15시 = KST 자정
      0, 0, 0
    ));
    const ageYears = (todayKST.getTime() - birthUTC.getTime()) / (365.25 * 86400000);

    // 프로그레션 날짜: 출생일 + 나이(일수) — astro-seek 방식
    const progUTC = new Date(birthUTC.getTime() + ageYears * 86400000);

    // 프로그레션 행성 계산
    const progRaw     = Ephemeris.getAllPlanets(progUTC, lng, lat, 0);
    const progPlanets = extractPlanets(progRaw.observed);

    // [FIX 7] 프로그레션 ASC/MC: Naibod key 방식
    // 네이탈 RAMC + 경과년수 x 0.9856(태양 평균 하루 이동량)으로 계산
    const { asc: progAsc, mc: progMc, houses: progHouses } =
      calcProgAnglesNaibod(jd, ageYears, lat, lng);
    // 프로그레션 행성 하우스는 네이탈 커스프 기준으로 배정 (점성술 표준)
    const progPlanetsWithHouse = assignHouses(progPlanets, houses);

    // ── 북노드/릴리스 계산 (행성과 동일한 JD 기준)
    const { northLon, southLon } = calcLunarNodes(jd);

    // ── 프로그레션 북노드/릴리스 계산
    const progY  = progUTC.getUTCFullYear();
    const progM  = progUTC.getUTCMonth() + 1;
    const progD  = progUTC.getUTCDate();
    const progHr = progUTC.getUTCHours() + progUTC.getUTCMinutes() / 60;
    const progJD = calcJulianDay(progY, progM, progD, progHr);
    const { northLon: progNorthLon, southLon: progSouthLon } = calcLunarNodes(progJD);

    // ── 에스펙트 계산 (행성 10개 + ASC + MC + 북노드 + 릴리스 = 12포인트 전부)
    const natalPoints = buildAspectPoints(planets, asc, mc, northLon, southLon);
    const progPoints  = buildAspectPoints(progPlanets, progAsc, progMc, progNorthLon, progSouthLon);

    const natalAspectsFull = calcAllAspects(natalPoints, natalPoints, { sameSet: true });
    const progAspectsFull  = calcAllAspects(progPoints, natalPoints, {
      labelPrefixA: '프로그레션 ', labelPrefixB: '네이탈 '
    });

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

    // 올해(KST 기준) 월별 트랜짓 계산
    const transitsYear = todayKST.getUTCFullYear();
    const transits = calcTransitsByYear(houses, transitsYear);

    // ── 궁합(시너지) — partner 정보가 같이 온 경우에만 계산 (없으면 기존 응답과 완전히 동일)
    let synastry = null;
    if (partner && partner.birthDate && partner.lat != null && partner.lng != null) {
      const pBirthTime = partner.timeUnknown ? '12:00' : (partner.birthTime || '12:00');
      const pChart = computeNatalChart(partner.birthDate, pBirthTime, partner.lat, partner.lng, partner.utcOffset);

      const myPoints      = buildAspectPoints(planets, asc, mc, northLon, southLon);
      const partnerPoints = buildAspectPoints(pChart.planets, pChart.asc, pChart.mc, pChart.northLon, pChart.southLon);
      const synastryAspects = calcAllAspects(myPoints, partnerPoints, { labelPrefixA: '나 ', labelPrefixB: '상대 ' });

      // 하우스 오버레이 (양방향)
      const partnerPlanetsInMyHouses = assignHouses(pChart.planets, houses);
      const myPlanetsInPartnerHouses = assignHouses(planets, pChart.houses);

      // 컴포지트 차트 (중간점, 짧은 호 기준)
      function circMid(a, b) {
        const aN = norm360(a), bN = norm360(b);
        let diff = bN - aN;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        return norm360(aN + diff / 2);
      }
      const compositePlanets = {};
      PLANET_KEYS.forEach(k => {
        compositePlanets[k] = toSignInfo(circMid(planets[k].lon, pChart.planets[k].lon));
      });

      const partnerNatalResult = {};
      PLANET_KEYS.forEach(k => {
        partnerNatalResult[k] = { ...toSignInfo(pChart.planetsWithHouse[k].lon), house: pChart.planetsWithHouse[k].house };
      });

      synastry = {
        partnerNatal: {
          planets: partnerNatalResult,
          angles:  { asc: toSignInfo(pChart.asc), mc: toSignInfo(pChart.mc) },
          meta:    { name: partner.name || '', gender: partner.gender || 'M', timeUnknown: !!partner.timeUnknown }
        },
        synastryAspects,
        houseOverlay: {
          partnerPlanetsInMyHouses: PLANET_KEYS.reduce((acc, k) => { acc[k] = partnerPlanetsInMyHouses[k].house; return acc; }, {}),
          myPlanetsInPartnerHouses: PLANET_KEYS.reduce((acc, k) => { acc[k] = myPlanetsInPartnerHouses[k].house; return acc; }, {}),
        },
        composite: {
          planets: compositePlanets,
          angles: { asc: toSignInfo(circMid(asc, pChart.asc)), mc: toSignInfo(circMid(mc, pChart.mc)) }
        }
      };
    }

    return res.status(200).json({
      natal:       natalResult,
      angles:      { asc: toSignInfo(asc), mc: toSignInfo(mc) },
      houses:      houses.map((h, i) => ({ house: i + 1, ...toSignInfo(h) })),
      natalAspectsFull,
      nodes: {
        north: { ...toSignInfo(northLon), house: getNodeHouse(northLon, houses) },
        south: { ...toSignInfo(southLon), house: getNodeHouse(southLon, houses) },
      },
      transitsYear,
      transits,
      progression: {
        meta: {
          progDate:  progUTC.toISOString().slice(0, 10),
          ageYears:  Math.round(ageYears * 100) / 100,
          method:    '태양 실제 이동 기반 (정밀)'
        },
        planets:        progResult,
        angles:         { asc: toSignInfo(progAsc), mc: toSignInfo(progMc) },
        houses:         progHouses.map((h, i) => ({ house: i + 1, ...toSignInfo(h) })),
        aspectsFull:    progAspectsFull,
        nodes: {
          north: { ...toSignInfo(progNorthLon), house: getNodeHouse(progNorthLon, houses) },
          south: { ...toSignInfo(progSouthLon), house: getNodeHouse(progSouthLon, houses) },
        },
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
      },
      synastry
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
   네이탈 차트 계산 (UTC 변환 → 행성 → 하우스 → 노드) — 본인/상대방 공용
   기존 handler 본문 그대로 추출한 것이라 동작 변화 없음
   ========================================================= */
function computeNatalChart(birthDate, birthTime, lat, lng, utcOffset) {
  const [yyyy, mm, dd] = birthDate.split('-').map(Number);
  const [hh, mi]       = birthTime.split(':').map(Number);

  // ── UTC 변환
  const offsetHours      = (utcOffset != null) ? utcOffset : (lng / 15);
  const localDecimalHour = hh + mi / 60;
  const utcDecimalHour   = localDecimalHour - offsetHours;

  // Date.UTC는 utcH/utcM이 범위를 벗어나도 날짜를 자동 조정함
  const utcH = Math.floor(utcDecimalHour);
  const utcM = Math.round((utcDecimalHour - utcH) * 60);
  const birthUTC = new Date(Date.UTC(yyyy, mm - 1, dd, utcH, utcM, 0));

  // birthUTC에서 실제 UTC 날짜/시각을 역산 → JD 계산에 사용
  const bY  = birthUTC.getUTCFullYear();
  const bM  = birthUTC.getUTCMonth() + 1;
  const bD  = birthUTC.getUTCDate();
  const bHr = birthUTC.getUTCHours() + birthUTC.getUTCMinutes() / 60
              + birthUTC.getUTCSeconds() / 3600;

  // 네이탈 행성 계산
  const natalRaw = Ephemeris.getAllPlanets(birthUTC, lng, lat, 0);
  const planets  = extractPlanets(natalRaw.observed);

  // 하우스 계산 (Placidus) — birthUTC 기준 JD 사용
  const jd = calcJulianDay(bY, bM, bD, bHr);
  const { asc, mc, houses } = calcHousesPlacidus(jd, lat, lng);
  const planetsWithHouse = assignHouses(planets, houses);

  const { northLon, southLon } = calcLunarNodes(jd);

  return { birthUTC, jd, planets, planetsWithHouse, asc, mc, houses, northLon, southLon, offsetHours };
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


/* =========================================================
   프로그레션 ASC/MC — Naibod key 방식
   RAMC_prog = RAMC_natal + ageYears * 0.9856°
   네이탈 RAMC에서 태양 평균 이동량만큼 누적
   ========================================================= */
function calcProgAnglesNaibod(natalJD, ageYears, lat, lng) {
  const NAIBOD = 0.98564736629;  // 태양 하루 평균 이동량(도)

  // 네이탈 RAMC 계산
  const T = (natalJD - 2451545.0) / 36525.0;
  const GMST = norm360(
    280.46061837
    + 360.98564736629 * (natalJD - 2451545.0)
    + 0.000387933 * T * T
    - (T * T * T) / 38710000.0
  );
  const natalRAMC = norm360(GMST + lng);

  // 프로그레션 RAMC = 네이탈 RAMC + 경과년수 * Naibod rate
  const progRAMC = norm360(natalRAMC + ageYears * NAIBOD);

  // 황도 경사 (네이탈 시점 기준)
  const eps  = 23.4392911 - 0.013004167 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
  const epsR = rad(eps);
  const latR = rad(lat);

  // ASC/MC 계산
  const mc_raw = Math.atan(Math.tan(rad(progRAMC)) / Math.cos(epsR)) * 180 / Math.PI;
  const mc     = norm360(Math.cos(rad(progRAMC)) < 0 ? mc_raw + 180 : mc_raw);
  const asc    = norm360(
    Math.atan2(Math.cos(rad(progRAMC)),
      -(Math.sin(epsR) * Math.tan(latR) + Math.cos(epsR) * Math.sin(rad(progRAMC)))
    ) * 180 / Math.PI
  );

  // 하우스 커스프도 progRAMC 기준으로 계산
  function raDecToEcl(ra, dec) {
    return norm360(Math.atan2(
      Math.sin(rad(ra)) * Math.cos(epsR) + Math.tan(rad(dec)) * Math.sin(epsR),
      Math.cos(rad(ra))
    ) * 180 / Math.PI);
  }
  function getCuspUpper(frac) {
    let ra = norm360(progRAMC + frac * 180);
    for (let i = 0; i < 100; i++) {
      const decR = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR));
      const cosH = -Math.tan(latR) * Math.tan(decR);
      if (cosH > 1) { ra = norm360(progRAMC); break; }
      if (cosH < -1) { ra = norm360(progRAMC + 180); break; }
      const newRA = norm360(progRAMC + frac * Math.acos(cosH) * 180 / Math.PI);
      if (Math.abs(newRA - ra) < 0.00001) break;
      ra = (ra + newRA) / 2;
    }
    return raDecToEcl(ra, Math.asin(Math.sin(rad(ra)) * Math.sin(epsR)) * 180 / Math.PI);
  }
  function getCuspLower(frac) {
    const IC_R = norm360(progRAMC + 180);
    let ra = norm360(IC_R - frac * 180);
    for (let i = 0; i < 100; i++) {
      const decR = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR));
      const cosH = -Math.tan(latR) * Math.tan(decR);
      if (cosH > 1) { ra = norm360(IC_R); break; }
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
    houses: [
      asc, cB, cA, norm360(mc + 180),
      norm360(c11 + 180), norm360(c12 + 180),
      norm360(asc + 180), norm360(cB + 180), norm360(cA + 180),
      mc, c11, c12
    ]
  };
}

function calcHousesPlacidus(jd, lat, lng) {
  const T = (jd - 2451545.0) / 36525.0;

  // [FIX 3] IAU 표준 GMST 공식 — T³ 항 추가 (수십 년 범위 오차 감소)
  const GMST = norm360(
    280.46061837
    + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T
    - (T * T * T) / 38710000.0
  );
  const LST  = norm360(GMST + lng);
  const RAMC = LST;

  // 황도 경사 (고차 항 포함)
  const eps  = 23.4392911 - 0.013004167 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
  const epsR = rad(eps);
  const latR = rad(lat);

  const mc_raw = Math.atan(Math.tan(rad(RAMC)) / Math.cos(epsR)) * 180 / Math.PI;
  const mc     = norm360(Math.cos(rad(RAMC)) < 0 ? mc_raw + 180 : mc_raw);
  const asc    = norm360(
    Math.atan2(Math.cos(rad(RAMC)), -(Math.sin(epsR) * Math.tan(latR) + Math.cos(epsR) * Math.sin(rad(RAMC)))) * 180 / Math.PI
  );

  // [FIX 4] 적경(RA) + 적위(Dec) → 황경 변환 (sin(eps) 항 포함 완전 공식)
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

  // 상부 하우스(11H,12H): RAMC 기준 + 방향, DSA(낮 세미호) 사용
  function getCuspUpper(frac) {
    let ra = norm360(RAMC + frac * 180);
    for (let i = 0; i < 100; i++) {
      const decR = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR));
      const cosH = -Math.tan(latR) * Math.tan(decR);
      if (cosH > 1)  { ra = norm360(RAMC);       break; }
      if (cosH < -1) { ra = norm360(RAMC + 180); break; }
      const H     = Math.acos(cosH) * 180 / Math.PI;  // DSA
      const newRA = norm360(RAMC + frac * H);
      if (Math.abs(newRA - ra) < 0.00001) break;
      ra = (ra + newRA) / 2;
    }
    const decDeg = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR)) * 180 / Math.PI;
    return raDecToEcl(ra, decDeg);
  }

  // 하부 하우스(2H,3H): IC_RAMC 기준 - 방향, NSA(밤 세미호) 사용
  function getCuspLower(frac) {
    let ra = norm360(IC_RAMC - frac * 180);
    for (let i = 0; i < 100; i++) {
      const decR = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR));
      const cosH = -Math.tan(latR) * Math.tan(decR);
      if (cosH > 1)  { ra = norm360(IC_RAMC);       break; }
      if (cosH < -1) { ra = norm360(IC_RAMC + 180); break; }
      const NSA   = 180 - Math.acos(cosH) * 180 / Math.PI;  // NSA = 180 - DSA
      const newRA = norm360(IC_RAMC - frac * NSA);
      if (Math.abs(newRA - ra) < 0.00001) break;
      ra = (ra + newRA) / 2;
    }
    const decDeg = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR)) * 180 / Math.PI;
    return raDecToEcl(ra, decDeg);
  }

  const c11 = getCuspUpper(1/3);
  const c12 = getCuspUpper(2/3);
  // c2=1/3, c3=2/3 이지만 방향이 역순이므로 배열에서 교체
  const cA  = getCuspLower(1/3);  // 물병(300°) → 3H
  const cB  = getCuspLower(2/3);  // 사수(265°) → 2H

  return {
    asc, mc,
    houses: [
      asc, cB, cA,              // 1H=ASC, 2H=cB(2/3), 3H=cA(1/3)
      norm360(mc + 180),        // 4H=IC
      norm360(c11 + 180),       // 5H
      norm360(c12 + 180),       // 6H
      norm360(asc + 180),       // 7H=DSC
      norm360(cB + 180),        // 8H
      norm360(cA + 180),        // 9H
      mc,                       // 10H=MC
      c11, c12,                 // 11H=c11(1/3), 12H=c12(2/3)
    ]
  };
}

/* =========================================================
   수성/금성/화성 계산 (트랜짓용)
   ========================================================= */
function calcMercury(T) {
  const L = 252.250906 + 149474.0722491 * T;
  const M = 174.7948   + 149472.5153    * T;
  return norm360(L + 23.440*Math.sin(rad(M)) + 2.994*Math.sin(rad(2*M)));
}
function calcVenus(T) {
  const L = 181.979801 + 58519.2130302 * T;
  const M = 50.4161    + 58517.8039    * T;
  return norm360(L + 0.7758*Math.sin(rad(M)) + 0.0033*Math.sin(rad(2*M)));
}
function calcMars(T) {
  const L = 355.433275 + 19141.6964746 * T;
  const M = 19.387     + 19140.30      * T;
  return norm360(L + 10.691*Math.sin(rad(M)) + 0.623*Math.sin(rad(2*M)));
}
function calcJupiterLon(T) {
  const L = 34.351519  + 3036.3027748 * T;
  const M = 20.9       + 3034.74      * T;
  return norm360(L + 5.555*Math.sin(rad(M)) + 0.168*Math.sin(rad(2*M)));
}
function calcSaturnLon(T) {
  const L = 50.077444  + 1223.5110686 * T;
  const M = 317.9      + 1222.114     * T;
  return norm360(L + 6.393*Math.sin(rad(M)) + 0.120*Math.sin(rad(2*M)));
}
function calcSunLon(T) {
  const L0 = 280.46646 + 36000.76983*T + 0.0003032*T*T;
  const M  = 357.52911 + 35999.05029*T - 0.0001537*T*T;
  const mr = rad(M);
  const C  = (1.914602-0.004817*T-0.000014*T*T)*Math.sin(mr)
           + (0.019993-0.000101*T)*Math.sin(2*mr)
           + 0.000289*Math.sin(3*mr);
  return norm360(L0+C);
}

/* =========================================================
   연도별 월별 트랜짓 계산 (연도 무관)
   매달 15일 기준, 네이탈 하우스 커스프로 하우스 배정
   ========================================================= */
function calcTransitsByYear(natalHouses, year) {
  const SIGNS = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                 '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
  const MONTHS = ['1월','2월','3월','4월','5월','6월',
                  '7월','8월','9월','10월','11월','12월'];

  function getHouse(lon) {
    const n = norm360(lon);
    for (let i=0; i<12; i++) {
      const s=natalHouses[i], e=natalHouses[(i+1)%12];
      if(s>e){if(n>=s||n<e)return i+1;}
      else{if(n>=s&&n<e)return i+1;}
    }
    return 12;
  }

  function signStr(lon) {
    const n=norm360(lon);
    return `${SIGNS[Math.floor(n/30)]} ${Math.floor(n%30)}°`;
  }

  const result = [];
  for (let m=1; m<=12; m++) {
    let y=year, mm=m, d=15;
    if(mm<=2){y--;mm+=12;}
    const A=Math.floor(y/100),B=2-A+Math.floor(A/4);
    const jd=Math.floor(365.25*(y+4716))+Math.floor(30.6001*(mm+1))+d+0.5+B-1524.5;
    const T=(jd-2451545.0)/36525.0;

    const uranusDate = new Date(Date.UTC(year, m - 1, 15));
    const uranusLon  = norm360(Ephemeris.getAllPlanets(uranusDate, 0, 0, 0).observed.uranus.apparentLongitudeDd);

    const planets = {
      sun:     calcSunLon(T),
      mercury: calcMercury(T),
      venus:   calcVenus(T),
      mars:    calcMars(T),
      jupiter: calcJupiterLon(T),
      saturn:  calcSaturnLon(T),
      uranus:  uranusLon,
    };

    const monthData = { month: MONTHS[m-1], planets: {} };
    for (const [key, lon] of Object.entries(planets)) {
      monthData.planets[key] = {
        longitude: Math.round(lon * 10) / 10,
        sign: signStr(lon),
        house: getHouse(lon)
      };
    }
    result.push(monthData);
  }
  return result;
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
      // 0°/360° 경계를 넘는 하우스 (예: 4H 335°~7°)
      if (start > end) {
        if (normLon >= start || normLon < end) return i + 1;
      } else {
        if (normLon >= start && normLon < end) return i + 1;
      }
    }
    // 마지막 하우스(12H)의 끝이 1H 시작(ASC)이므로 여기까지 오면 12H
    return 12;
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
  { name: '컨정션',  angle:   0, orb: 8, symbol: '☌' },
  { name: '섹스타일',angle:  60, orb: 4, symbol: '⚹' },
  { name: '트라인',  angle: 120, orb: 6, symbol: '△' },
  { name: '스퀘어',  angle:  90, orb: 6, symbol: '□' },
  { name: '어포지션',angle: 180, orb: 8, symbol: '☍' },
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

// [FIX 6] applying/separating 판별용 부호 있는 각거리
// 반환값 양수: p1에서 p2 방향이 순행(applying 후보), 음수: 역행(separating 후보)
function signedAngularDiff(lonA, lonB) {
  let diff = norm360(lonB) - norm360(lonA);
  if (diff > 180)  diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
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
   범용 에스펙트 계산
   sameSet=true: pointsA 내부 조합 (i<j)
   sameSet=false: pointsA × pointsB 전체 조합
   ========================================================= */
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

/* =========================================================
   노드 하우스 배정 헬퍼
   ========================================================= */
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
   북노드/릴리스 계산 (평균 노드, Mean Node)
   행성과 동일한 JD 기준으로 계산 → 에스펙트 정확도 보장
   ========================================================= */
function calcLunarNodes(jd) {
  const T     = (jd - 2451545.0) / 36525.0;
  const omega = norm360(125.04452  - 1934.136261   * T + 0.0020708 * T * T);

  // 평균 북노드 (Mean Node)
  const northLon = omega;

  // 릴리스 = 달의 근지점 (Black Moon Lilith + 180°)
  // astro-seek 기준: 릴리스는 남노드가 아닌 달 근지점
  const bml = norm360(
    83.3532465 + 4069.0137287 * T - 0.0103200 * T * T
    - T * T * T / 80053 + T * T * T * T / 18999000
  );
  const southLon = norm360(bml + 180);

  return { northLon, southLon };
}
