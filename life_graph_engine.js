/* =========================================================
   인생 그래프 엔진 (life_graph_engine.js) v4.0
   ─────────────────────────────────────────────────────────
   [v4.0 변경 내역]
   FIX 1. 토성/천왕성 → 루미너리 에스펙트: 강도 채널 분리 (종합 점수에서 제거)
   FIX 2. 프로그레션 라우터: 트랜짓 행성 하우스 → 도메인 증폭
   FIX 3. 3-도메인 독립 점수 (직업/재물/관계) 추가
   FIX 4. 하우스 유틸리티 추가 (getHouseOf, _houseCusps)
   ─────────────────────────────────────────────────────────
   Layer 0 (1회): 민감도 계수 (jupW · satW · moonW · plutW)
   Layer 1 (30%, ±18): 프로그레션 태양 × 나탈 에스펙트
   Layer 2 (30%, ±18): 세운 트랜짓 2A(70%) + 쏠라 리턴 2B(30%)
   Layer 3 (25%, ±15): 프로그 달 3A(50%) + 토성리턴 3B(25%) + 루나이션 3C(25%)
   Layer 4 (15%, ±9):  프로그레션 금성(55%) + 화성(45%)
   도메인: career · wealth · relationship (각 독립 계산)
   시련강도: intensity [0-100] (토성/천왕성 → 루미너리 + 4/7/8H)
   ========================================================= */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════
     유틸
  ════════════════════════════════════════════ */
  function norm360(a) { return ((a % 360) + 360) % 360; }
  function rad(d)     { return d * Math.PI / 180; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  /* ═══════════════════════════════════════════
     율리우스일
  ════════════════════════════════════════════ */
  function calcJD(y, m, d, utcHour) {
    if (utcHour === undefined) utcHour = 12;
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716))
         + Math.floor(30.6001 * (m + 1))
         + d + utcHour / 24 + B - 1524.5;
  }

  /* ═══════════════════════════════════════════
     VSOP87 행성 계산 (축약)
  ════════════════════════════════════════════ */
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
    const Mp = 134.96298 + 477198.867398 * T + 0.0086972 * T * T;
    const F  = 93.27191  + 483202.017538 * T - 0.0036825 * T * T;
    const L1 = 218.3165  + 481267.8813 * T;
    const M  = 357.52772 + 35999.050340 * T  - 0.0001603 * T * T;
    return norm360(L1
      + 6.289 * Math.sin(rad(Mp))
      - 1.274 * Math.sin(rad(2 * D - Mp))
      + 0.658 * Math.sin(rad(2 * D))
      - 0.214 * Math.sin(rad(2 * Mp))
      - 0.186 * Math.sin(rad(M))
      - 0.114 * Math.sin(rad(2 * F)));
  }

  function calcVenus(T) {
    const L = 181.979801 + 58517.815676 * T;
    const M = 212.0      + 58519.0 * T;
    return norm360(L + 0.776 * Math.sin(rad(M)) + 0.023 * Math.sin(rad(2 * M)));
  }

  function calcMars(T) {
    const L = 355.433 + 19140.299 * T;
    const M = 19.373  + 19140.30  * T;
    return norm360(L + 10.691 * Math.sin(rad(M)) + 0.623 * Math.sin(rad(2 * M)));
  }

  function calcJupiter(T) {
    const L = 34.351519 + 3036.302775 * T;
    const M = 20.9      + 3034.74 * T;
    return norm360(L + 5.555 * Math.sin(rad(M)) + 0.168 * Math.sin(rad(2 * M)));
  }

  function calcSaturn(T) {
    const L = 50.077444 + 1223.511069 * T;
    const M = 317.9     + 1222.114 * T;
    return norm360(L + 6.393 * Math.sin(rad(M)) + 0.120 * Math.sin(rad(2 * M)));
  }

  function calcUranus(T) {
    const L = 314.055005 + 429.864056 * T;
    const M = 142.5      + 428.9 * T;
    return norm360(L + 5.460 * Math.sin(rad(M)));
  }

  function calcPluto(T) {
    return norm360(238.96 + 145.18 * T);
  }

  function getPlanets(jd) {
    const T = (jd - 2451545.0) / 36525.0;
    return {
      sun:     calcSun(T),
      moon:    calcMoon(T),
      venus:   calcVenus(T),
      mars:    calcMars(T),
      jupiter: calcJupiter(T),
      saturn:  calcSaturn(T),
      uranus:  calcUranus(T),
      pluto:   calcPluto(T),
    };
  }

  function calcProgAscMC(natalJD, ageYears, lat, lng) {
    const NAIBOD = 0.98564736629;
    const T      = (natalJD - 2451545.0) / 36525.0;
    const GMST   = norm360(280.46061837
                 + 360.98564736629 * (natalJD - 2451545.0)
                 + 0.000387933 * T * T);
    const natalRAMC = norm360(GMST + lng);
    const progRAMC  = norm360(natalRAMC + ageYears * NAIBOD);
    const eps   = 23.4392911 - 0.013004167 * T;
    const epsr  = rad(eps);
    const latR  = rad(lat);
    const RAMC_r = rad(progRAMC);
    const mc  = norm360(
      Math.atan2(Math.tan(RAMC_r), Math.cos(epsr)) * 180 / Math.PI
    );
    const asc = norm360(
      Math.atan2(
        Math.cos(RAMC_r),
        -(Math.sin(epsr) * Math.tan(latR) + Math.cos(epsr) * Math.sin(RAMC_r))
      ) * 180 / Math.PI
    );
    return { asc, mc };
  }

  function angDist(a, b) {
    const d = Math.abs(norm360(a) - norm360(b));
    return d > 180 ? 360 - d : d;
  }

  /* ═══════════════════════════════════════════
     하우스 유틸리티 (v4.0 신규)
  ════════════════════════════════════════════ */
  // 주어진 경도가 몇 번째 하우스인지 반환 (12개 커스프 배열 기준)
  function getHouseOf(lon, cusps) {
    if (!cusps || cusps.length < 12) return null;
    const n = norm360(lon);
    for (let i = 0; i < 12; i++) {
      const s = cusps[i], e = cusps[(i + 1) % 12];
      if (s > e) { if (n >= s || n < e) return i + 1; }
      else       { if (n >= s && n < e) return i + 1; }
    }
    return 12;
  }

  /* ═══════════════════════════════════════════
     나탈 데이터 추출 (AstroResult 우선, VSOP87 폴백)
     v4.0: _houseCusps 추가
  ════════════════════════════════════════════ */
  function extractNatal(astroResult, natalJD, lat, lng) {
    const vsop = getPlanets(natalJD);
    const { asc: vsopAsc, mc: vsopMc } = calcProgAscMC(natalJD, 0, lat, lng);

    if (!astroResult?.natal) {
      return {
        ...vsop,
        asc: vsopAsc,
        mc:  vsopMc,
        _signIdx: Object.fromEntries(
          Object.keys(vsop).map(k => [k, Math.floor(norm360(vsop[k]) / 30)])
        ),
        _houseOf:   {},
        _houseCusps: null,
      };
    }

    const n   = astroResult.natal;
    const ang = astroResult.angles || {};

    function plon(key) {
      return (n[key]?.longitude != null) ? n[key].longitude : (vsop[key] ?? 0);
    }

    const result = {
      sun:     plon('sun'),
      moon:    plon('moon'),
      venus:   plon('venus'),
      mars:    plon('mars'),
      jupiter: plon('jupiter'),
      saturn:  plon('saturn'),
      uranus:  plon('uranus'),
      pluto:   plon('pluto'),
      asc:     ang.asc?.longitude ?? vsopAsc,
      mc:      ang.mc?.longitude  ?? vsopMc,
    };

    const KEYS8 = ['sun','moon','venus','mars','jupiter','saturn','uranus','pluto'];
    result._signIdx = Object.fromEntries(
      KEYS8.map(k => [k, n[k]?.signIndex ?? Math.floor(norm360(result[k]) / 30)])
    );
    result._houseOf = Object.fromEntries(
      KEYS8.map(k => [k, n[k]?.house ?? null])
    );

    // v4.0: 하우스 커스프 배열 (라우터용)
    result._houseCusps = astroResult?.houses?.map(h => h.longitude) ?? null;

    return result;
  }

  /* ═══════════════════════════════════════════
     에스펙트 점수 시스템
  ════════════════════════════════════════════ */
  const ASPECT_LIST = [
    { angle:   0, orb: 8 },
    { angle:  60, orb: 4 },
    { angle:  90, orb: 6 },
    { angle: 120, orb: 6 },
    { angle: 180, orb: 8 },
  ];

  const PLANET_NATURE = {
    sun: 0.7, moon: 0.2, venus: 0.6, mars: -0.5,
    jupiter: 1.0, uranus: 0.0, neptune: -0.1, pluto: -0.4,
  };

  function aspectNatureDir(nature, angle) {
    if (angle === 0)   return nature;
    if (angle === 120) return nature >= 0 ? 0.90 * nature : 0.25 * nature;
    if (angle === 60)  return nature >= 0 ? 0.65 * nature : 0.20 * nature;
    if (angle === 90)  return nature >= 0 ? -0.35 : 0.80 * nature;
    if (angle === 180) return nature >= 0 ? -0.45 : 0.90 * nature;
    return 0;
  }

  function aspectScore(a, b, planetKey) {
    const dist   = angDist(a, b);
    const nature = PLANET_NATURE[planetKey] ?? 0;
    let best = 0;
    for (const { angle, orb } of ASPECT_LIST) {
      const diff = Math.abs(dist - angle);
      if (diff > orb) continue;
      const s = aspectNatureDir(nature, angle) * (1 - diff / orb);
      if (Math.abs(s) > Math.abs(best)) best = s;
    }
    return best;
  }

  // v4.0: 강도 테이블 (토성/천왕성 → 루미너리 전용: 부호 없는 크기)
  const SAT_INTENSITY_BY_ASPECT = { 120:0.40, 60:0.30, 0:0.30, 90:0.70, 180:0.80 };
  const URA_INTENSITY_BY_ASPECT = { 120:0.50, 60:0.30, 0:0.10, 90:0.40, 180:0.50 };

  // v4.0: 극성 테이블 (토성/천왕성 → 앵글/행성 전용: 방향성 유지)
  const SAT_VALENCE_BY_ASPECT = { 120:+0.40, 60:+0.30, 0:-0.30, 90:-0.70, 180:-0.80 };
  const URA_VALENCE_BY_ASPECT = { 120:+0.50, 60:+0.30, 0:+0.10, 90:-0.40, 180:-0.50 };

  function aspectScoreByNature(a, b, natureByAngle) {
    const dist = angDist(a, b);
    let best = 0;
    for (const { angle, orb } of ASPECT_LIST) {
      const diff = Math.abs(dist - angle);
      if (diff > orb) continue;
      const nature = natureByAngle[angle] ?? 0;
      const s = nature * (1 - diff / orb);
      if (Math.abs(s) > Math.abs(best)) best = s;
    }
    return best;
  }

  /* ═══════════════════════════════════════════
     Layer 0: 민감도 계수 (1회 계산)
  ════════════════════════════════════════════ */
  function calcLayer0(natal, natalAspects) {
    const ANGLE_HOUSES = [1, 4, 7, 10];

    const JUP_DIG  = { 8:+2, 11:+2, 3:+3, 2:-2, 5:-2, 9:-1 };
    const SAT_DIG  = { 9:+2, 10:+2, 6:+3, 3:-2, 4:-2, 0:-1 };
    const MOON_DIG = { 3:+3, 1:+2, 9:-2, 7:-2 };

    let jupScore = 0, satScore = 0, moonScore = 0, plutScore = 0;

    jupScore  += JUP_DIG[natal._signIdx?.jupiter]  ?? 0;
    satScore  += SAT_DIG[natal._signIdx?.saturn]    ?? 0;
    moonScore += MOON_DIG[natal._signIdx?.moon]     ?? 0;

    const jupH  = natal._houseOf?.jupiter;
    const satH  = natal._houseOf?.saturn;
    const moonH = natal._houseOf?.moon;
    const plutH = natal._houseOf?.pluto;
    if (jupH  != null && ANGLE_HOUSES.includes(jupH))  jupScore  += 2;
    if (satH  != null && ANGLE_HOUSES.includes(satH))  satScore  += 2;
    if (moonH != null && ANGLE_HOUSES.includes(moonH)) moonScore += 2;
    if (plutH != null && ANGLE_HOUSES.includes(plutH)) plutScore += 1.5;

    for (const asp of (natalAspects || [])) {
      const p1     = asp.point1 || '';
      const p2     = asp.point2 || '';
      const aType  = asp.aspect || '';
      const bonus  = asp.applying === true ? 1.1 : 1.0;
      const isJup  = p1.includes('목성')   || p2.includes('목성');
      const isSat  = p1.includes('토성')   || p2.includes('토성');
      const isMoon = p1.includes('달')     || p2.includes('달');
      const isPlut = p1.includes('명왕성') || p2.includes('명왕성');
      const isSun  = p1.includes('태양')   || p2.includes('태양');
      const isMC   = p1.includes('MC')     || p2.includes('MC');
      const isASC  = p1.includes('ASC')    || p2.includes('ASC');
      const isSoft = ['트라인','섹스타일','컨정션'].includes(aType);
      const isHard = ['스퀘어','어포지션'].includes(aType);

      if (isJup) {
        if (isSoft && (isSun || isMC || isASC)) jupScore += 1.5 * bonus;
        if (isHard && isSat)                    jupScore -= 1.5;
        if (isSoft && isMoon)                   moonScore += 1.0 * bonus;
      }
      if (isSat) {
        if (isHard && (isSun || isMoon)) satScore -= 1.5;
        if (isSoft && (isSun || isMoon)) satScore += 0.5 * bonus;
      }
      if (isMoon) {
        if (isSoft && isJup)  moonScore += 1.5 * bonus;
        if (isHard && isSat)  moonScore -= 1.5;
      }
      if (isPlut && (isSun || isMC)) {
        if (['컨정션','트라인'].includes(aType)) plutScore += 1.2 * bonus;
        if (isHard)                              plutScore -= 0.5;
      }
    }

    function toWeight(score, lo, hi) {
      return clamp(1.0 + score * 0.075, lo, hi);
    }

    return {
      jupW:  toWeight(jupScore,  0.70, 1.30),
      satW:  toWeight(satScore,  0.70, 1.30),
      moonW: toWeight(moonScore, 0.70, 1.30),
      plutW: toWeight(plutScore, 0.80, 1.20),
    };
  }

  /* ═══════════════════════════════════════════
     Layer 1: 프로그레션 태양 에스펙트 (30%, ±18)
  ════════════════════════════════════════════ */
  const PROG_ASPECT_LIST = [
    { angle:   0, orb: 12 },
    { angle:  60, orb:  8 },
    { angle:  90, orb:  8 },
    { angle: 120, orb: 12 },
    { angle: 180, orb: 12 },
  ];

  function progAspectScore(a, b, planetKey) {
    const dist   = angDist(a, b);
    const nature = PLANET_NATURE[planetKey] ?? 0.5;
    let best = 0;
    for (const { angle, orb } of PROG_ASPECT_LIST) {
      const diff = Math.abs(dist - angle);
      if (diff > orb) continue;
      const s = aspectNatureDir(nature, angle) * (1 - diff / orb);
      if (Math.abs(s) > Math.abs(best)) best = s;
    }
    return best;
  }

  function progAspectScoreByNature(a, b, natureMap) {
    const dist = angDist(a, b);
    let best = 0;
    for (const { angle, orb } of PROG_ASPECT_LIST) {
      const diff = Math.abs(dist - angle);
      if (diff > orb) continue;
      const nature = natureMap[angle] ?? 0;
      const s = nature * (1 - diff / orb);
      if (Math.abs(s) > Math.abs(best)) best = s;
    }
    return best;
  }

  function calcLayer1(progSunLon, prevProgSunLon, natal, jupW) {
    const jup  = progAspectScore(progSunLon, natal.jupiter, 'jupiter') * 1.20;
    // v4.0: SAT_VALENCE (이름 변경, 값 동일)
    const sat  = progAspectScoreByNature(progSunLon, natal.saturn, SAT_VALENCE_BY_ASPECT) * 1.00;
    const mc   = progAspectScore(progSunLon, natal.mc,      'sun')     * 1.00;
    const asc  = progAspectScore(progSunLon, natal.asc,     'sun')     * 0.90;
    const sun  = progAspectScore(progSunLon, natal.sun,     'sun')     * 0.80;
    const moon = progAspectScore(progSunLon, natal.moon,    'moon')    * 0.70;

    let total = jup + sat + mc + asc + sun + moon;

    if (prevProgSunLon != null) {
      const targets = [natal.jupiter, natal.saturn, natal.mc, natal.asc, natal.sun, natal.moon]
        .filter(t => t != null);
      const applying = targets.filter(t =>
        angDist(progSunLon, t) < angDist(prevProgSunLon, t)
      ).length;
      if (applying > targets.length / 2) total *= 1.1;
    }

    return clamp(total * jupW * 0.58, -1.0, 1.0) * 18;
  }

  /* ═══════════════════════════════════════════
     쏠라 리턴 JD 탐색 (이분법)
  ════════════════════════════════════════════ */
  function findSolarReturnJD(year, birthMonth, natalSunLon) {
    const baseJD = calcJD(year, birthMonth, 15, 12);
    function sunDiff(jd) {
      const T = (jd - 2451545) / 36525;
      let d = norm360(calcSun(T) - natalSunLon);
      if (d > 180) d -= 360;
      return d;
    }
    let lo = baseJD - 20, hi = baseJD + 20;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const d = sunDiff(mid);
      if (Math.abs(d) < 0.0001) break;
      if (d < 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* ═══════════════════════════════════════════
     시련강도 채널 (v4.0 신규)
     · 토성/천왕성 → 루미너리: 부호 없는 크기만 반영
     · 4H/7H/8H 행성 통과: 가족·관계·사별 사건 감지
     · 반환값: [0, 1.5] (나중에 0-100 정수로 변환)
  ════════════════════════════════════════════ */
  function calcIntensitySignal(tr, natal) {
    const satSun  = aspectScoreByNature(tr.saturn, natal.sun,  SAT_INTENSITY_BY_ASPECT);
    const satMoon = aspectScoreByNature(tr.saturn, natal.moon, SAT_INTENSITY_BY_ASPECT);
    const uraSun  = aspectScoreByNature(tr.uranus, natal.sun,  URA_INTENSITY_BY_ASPECT);
    const uraMoon = aspectScoreByNature(tr.uranus, natal.moon, URA_INTENSITY_BY_ASPECT);

    // 하우스 기반 사건 신호 (4H=가족, 7H=관계, 8H=사별/변환)
    let houseSignal = 0;
    const cusps = natal._houseCusps;
    if (cusps) {
      const satH = getHouseOf(tr.saturn, cusps);
      const pluH = getHouseOf(tr.pluto,  cusps);
      if (satH === 4 || satH === 7 || satH === 8) houseSignal += 0.35;
      if (pluH === 4 || pluH === 7 || pluH === 8) houseSignal += 0.25;
    }

    // 천왕성 어포지션 천왕성 (~42세 미들라이프 위기)
    const uraOppUra = angDist(tr.uranus, natal.uranus) > 170 ? 0.30 : 0;

    return clamp(satSun + satMoon + uraSun + uraMoon + houseSignal + uraOppUra, 0, 1.5);
  }

  /* ═══════════════════════════════════════════
     도메인 트랜짓 신호 함수 (v4.0 신규)
     · 하우스 라우터 내장 (행성 하우스 → 도메인 증폭)
     · 반환값: clamp[-1.0, 1.0]
  ════════════════════════════════════════════ */

  // 직업 도메인: MC · 10H · ASC · 태양 중심
  function careerTransitSignal(tr, natal, jupW, satW) {
    const jup = (
        aspectScore(tr.jupiter, natal.mc,  'jupiter') * 1.50
      + aspectScore(tr.jupiter, natal.sun, 'jupiter') * 0.80
      + aspectScore(tr.jupiter, natal.asc, 'jupiter') * 0.70
    ) * jupW;

    // 토성/천왕성 → 앵글: 극성 유지 (트라인=안정, 스퀘어=도전)
    const sat = (
        aspectScoreByNature(tr.saturn, natal.mc,  SAT_VALENCE_BY_ASPECT) * 1.20
      + aspectScoreByNature(tr.saturn, natal.asc, SAT_VALENCE_BY_ASPECT) * 0.60
      + aspectScoreByNature(tr.uranus, natal.mc,  URA_VALENCE_BY_ASPECT) * 0.60
    ) * satW;

    // 라우터: 목성 10H/6H → 직업 증폭, 토성 10H → 직업 압박
    let router = 1.0;
    const cusps = natal._houseCusps;
    if (cusps) {
      const jupH = getHouseOf(tr.jupiter, cusps);
      const satH = getHouseOf(tr.saturn,  cusps);
      if      (jupH === 10) router *= 1.50;
      else if (jupH === 6)  router *= 1.20;
      if (satH === 10)      router *= 0.82;
    }

    return clamp((jup + sat) * router * 0.45, -1.0, 1.0);
  }

  // 재물 도메인: 금성 · 목성(리턴) · 2H 중심
  function wealthTransitSignal(tr, natal, jupW, satW) {
    const jupReturn = angDist(tr.jupiter, natal.jupiter) < 5 ? 0.40 * jupW : 0;

    const jup = (
        aspectScore(tr.jupiter, natal.venus,   'jupiter') * 1.20
      + aspectScore(tr.jupiter, natal.jupiter, 'jupiter') * 0.90
      + aspectScore(tr.jupiter, natal.moon,    'jupiter') * 0.50
    ) * jupW;

    const sat = (
        aspectScoreByNature(tr.saturn, natal.venus,   SAT_VALENCE_BY_ASPECT) * 0.70
      + aspectScoreByNature(tr.saturn, natal.jupiter, SAT_VALENCE_BY_ASPECT) * 0.50
    ) * satW;

    // 라우터: 목성 2H/8H/11H → 재물 증폭, 토성 2H/8H → 재물 압박
    let router = 1.0;
    const cusps = natal._houseCusps;
    if (cusps) {
      const jupH = getHouseOf(tr.jupiter, cusps);
      const satH = getHouseOf(tr.saturn,  cusps);
      if      (jupH === 2)               router *= 1.50;
      else if (jupH === 8)               router *= 1.30;
      else if (jupH === 11)              router *= 1.20;
      if (satH === 2 || satH === 8)      router *= 0.82;
    }

    return clamp((jup + sat + jupReturn) * router * 0.45, -1.0, 1.0);
  }

  // 관계 도메인: 금성 · 달 · 천왕성-금성(변화) · 7H 중심
  function relTransitSignal(tr, natal, jupW, satW) {
    const jup = (
        aspectScore(tr.jupiter, natal.venus, 'jupiter') * 1.30
      + aspectScore(tr.jupiter, natal.moon,  'jupiter') * 1.10
      + aspectScore(tr.jupiter, natal.asc,   'jupiter') * 0.50
    ) * jupW;

    // 천왕성 → 금성/달: 극성 유지 (트라인=돌파, 스퀘어=이별/갈등)
    const ura = (
        aspectScoreByNature(tr.uranus, natal.venus, URA_VALENCE_BY_ASPECT) * 1.10
      + aspectScoreByNature(tr.uranus, natal.moon,  URA_VALENCE_BY_ASPECT) * 0.60
    ) * 0.55;

    const sat = (
        aspectScoreByNature(tr.saturn, natal.venus, SAT_VALENCE_BY_ASPECT) * 0.70
      + aspectScoreByNature(tr.saturn, natal.moon,  SAT_VALENCE_BY_ASPECT) * 0.50
    ) * satW;

    // 라우터: 목성 7H/5H/11H → 관계 증폭
    let router = 1.0;
    const cusps = natal._houseCusps;
    if (cusps) {
      const jupH = getHouseOf(tr.jupiter, cusps);
      if      (jupH === 7)  router *= 1.50;
      else if (jupH === 5)  router *= 1.30;
      else if (jupH === 11) router *= 1.15;
    }

    return clamp((jup + ura + sat) * router * 0.45, -1.0, 1.0);
  }

  /* ═══════════════════════════════════════════
     Layer 2A: 세운 트랜짓 (v4.0: 토성/천왕성 → 루미너리 제거)
     · 토성→태양/달, 천왕성→태양: 강도 채널로 이동
     · 이 함수는 종합 점수(overall) 전용
  ════════════════════════════════════════════ */
  function calcLayer2A(tr, natal, jupW, satW, plutW) {
    const jup = (
        aspectScore(tr.jupiter, natal.sun,     'jupiter')
      + aspectScore(tr.jupiter, natal.moon,    'jupiter') * 0.80
      + aspectScore(tr.jupiter, natal.mc,      'jupiter') * 1.30
      + aspectScore(tr.jupiter, natal.asc,     'jupiter') * 1.30
      + aspectScore(tr.jupiter, natal.saturn,  'jupiter') * 0.70
      + aspectScore(tr.jupiter, natal.venus,   'jupiter') * 0.60
      + aspectScore(tr.jupiter, natal.mars,    'jupiter') * 0.50
    ) * jupW;

    // v4.0: natal.sun/natal.moon 제거 → 강도 채널
    const sat = (
        aspectScoreByNature(tr.saturn, natal.mc,      SAT_VALENCE_BY_ASPECT) * 1.30
      + aspectScoreByNature(tr.saturn, natal.asc,     SAT_VALENCE_BY_ASPECT) * 1.30
      + aspectScoreByNature(tr.saturn, natal.jupiter, SAT_VALENCE_BY_ASPECT) * 0.70
      + aspectScoreByNature(tr.saturn, natal.venus,   SAT_VALENCE_BY_ASPECT) * 0.60
    ) * satW;

    // v4.0: natal.sun 제거 → 강도 채널
    const ura = (
        aspectScoreByNature(tr.uranus, natal.mc,  URA_VALENCE_BY_ASPECT) * 1.30
      + aspectScoreByNature(tr.uranus, natal.asc, URA_VALENCE_BY_ASPECT) * 1.30
    ) * 0.45;

    const plu = (
        aspectScore(tr.pluto, natal.mc,  'pluto') * 1.30
      + aspectScore(tr.pluto, natal.asc, 'pluto') * 1.30
      + aspectScore(tr.pluto, natal.sun, 'pluto')
    ) * plutW * 0.40;

    const jupReturn = angDist(tr.jupiter, natal.jupiter) < 5 ? 0.40 * jupW : 0;
    const uraOpp    = angDist(tr.uranus, natal.uranus) > 170 ? -0.22 : 0;

    return clamp(
      (jup + sat + ura + plu + jupReturn + uraOpp) * 0.45,
      -1.0, 1.0
    );
  }

  /* ═══════════════════════════════════════════
     Layer 2B: 쏠라 리턴 (v4.0: SR 토성→태양 제거)
  ════════════════════════════════════════════ */
  function calcLayer2B(srJD, natal) {
    if (!srJD) return 0;
    const sr = getPlanets(srJD);

    const jToJ   = aspectScore(sr.jupiter, natal.jupiter, 'jupiter');
    const jToSun = aspectScore(sr.jupiter, natal.sun,     'jupiter');
    const jToMC  = aspectScore(sr.jupiter, natal.mc,      'jupiter') * 1.20;
    // v4.0: SR 토성→태양 제거 (강도 채널로 이동)
    const sToMC  = aspectScoreByNature(sr.saturn, natal.mc, SAT_VALENCE_BY_ASPECT) * 1.20;

    return clamp(
      (jToJ + jToSun + jToMC + sToMC) * 0.25,
      -1.0, 1.0
    );
  }

  /* ═══════════════════════════════════════════
     calcLayer2: 피크월 + 도메인 피크 동시 산출 (v4.0)
     · 12개월 루프에서 종합 피크 + 도메인별 피크 독립 산출
     · 반환: { overall, careerPeak, wealthPeak, relPeak, intensityPeak }
  ════════════════════════════════════════════ */
  function calcLayer2(year, birthMonth, natalSunLon, natal, jupW, satW, plutW) {
    let l2aPeak = 0;
    let careerPeak = 0, wealthPeak = 0, relPeak = 0, intensityPeak = 0;

    for (let mo = 1; mo <= 12; mo++) {
      const jd = calcJD(year, mo, 15, 12);
      const tr = getPlanets(jd);

      // 종합 피크
      const overall = calcLayer2A(tr, natal, jupW, satW, plutW);
      if (Math.abs(overall) > Math.abs(l2aPeak)) l2aPeak = overall;

      // 도메인 피크 (각 도메인 독립)
      const cs = careerTransitSignal(tr, natal, jupW, satW);
      const ws = wealthTransitSignal(tr, natal, jupW, satW);
      const rs = relTransitSignal(tr, natal, jupW, satW);
      const is = calcIntensitySignal(tr, natal);

      if (Math.abs(cs) > Math.abs(careerPeak))  careerPeak  = cs;
      if (Math.abs(ws) > Math.abs(wealthPeak))  wealthPeak  = ws;
      if (Math.abs(rs) > Math.abs(relPeak))     relPeak     = rs;
      if (is > intensityPeak)                   intensityPeak = is;
    }

    const srJD = findSolarReturnJD(year, birthMonth, natalSunLon);
    const l2b  = calcLayer2B(srJD, natal);

    const overall = clamp(l2aPeak * 0.70 + l2b * 0.30, -1.0, 1.0) * 22;

    return { overall, careerPeak, wealthPeak, relPeak, intensityPeak };
  }

  /* ═══════════════════════════════════════════
     Layer 3A: 프로그레션 달 에스펙트
  ════════════════════════════════════════════ */
  function calcProgMoonScore(progMoonLon, progAscLon, natal, moonW) {
    const moonAsp =
        aspectScore(progMoonLon, natal.sun,     'sun')     * 0.20
      + aspectScore(progMoonLon, natal.moon,    'moon')    * 0.15
      + aspectScore(progMoonLon, natal.jupiter, 'jupiter') * 0.20
      + aspectScoreByNature(progMoonLon, natal.saturn, SAT_VALENCE_BY_ASPECT) * 0.15
      + aspectScore(progMoonLon, natal.asc,     'moon')   * 0.15
      + aspectScore(progMoonLon, natal.mc,      'moon')   * 0.15;

    const ascAsp = (
        aspectScore(progAscLon, natal.sun,  'sun')  * 0.50
      + aspectScore(progAscLon, natal.moon, 'moon') * 0.50
    ) * 0.15;

    return clamp((moonAsp + ascAsp) * moonW, -1.0, 1.0);
  }

  /* ═══════════════════════════════════════════
     Layer 3B: 토성 리턴 orb 비례 점수
  ════════════════════════════════════════════ */
  function calcSaturnReturnScore(trSatLon, natalSatLon, ageYears, prevSatDist) {
    const dist = angDist(trSatLon, natalSatLon);
    const ORB  = 8;
    if (dist > ORB) return 0;

    const is1st = ageYears >= 27 && ageYears <= 32;
    const is2nd = ageYears >= 56 && ageYears <= 62;
    if (!is1st && !is2nd) return 0;

    const strength      = 1 - dist / ORB;
    const isApproaching = prevSatDist != null && prevSatDist > dist;
    return isApproaching ? -0.70 * strength : -0.20 * strength;
  }

  /* ═══════════════════════════════════════════
     Layer 3C: 루나이션 사이클 (프로그 달-태양 위상)
  ════════════════════════════════════════════ */
  function calcLunationScore(progMoonLon, progSunLon) {
    const phase = norm360(progMoonLon - progSunLon);
    const PHASES = [
      { angle:   0, score: +8  },
      { angle:  45, score: +4  },
      { angle:  90, score: +3  },
      { angle: 135, score: +2  },
      { angle: 180, score: +10 },
      { angle: 225, score: +1  },
      { angle: 270, score: -3  },
      { angle: 315, score: -2  },
    ];

    let best = 0;
    for (const { angle, score } of PHASES) {
      const dist = angDist(phase, angle);
      if (dist < 15) {
        const s = score * (1 - dist / 15) / 10;
        if (Math.abs(s) > Math.abs(best)) best = s;
      }
    }
    return clamp(best, -1.0, 1.0);
  }

  function calcLayer3(progMoonLon, progSunLon, progAscLon, trSatLon, natal, ageYears, prevSatDist, satW, moonW) {
    const l3a = calcProgMoonScore(progMoonLon, progAscLon, natal, moonW);
    const l3b = calcSaturnReturnScore(trSatLon, natal.saturn, ageYears, prevSatDist) * satW;
    const l3c = calcLunationScore(progMoonLon, progSunLon);
    return clamp(l3a * 0.50 + l3b * 0.25 + l3c * 0.25, -1.0, 1.0) * 18;
  }

  /* ═══════════════════════════════════════════
     Layer 4: 프로그레션 금성·화성 (15%, ±9)
  ════════════════════════════════════════════ */
  function calcLayer4(progVenusLon, progMarsLon, natal) {
    const ven =
        aspectScore(progVenusLon, natal.sun,     'venus')   * 0.30
      + aspectScore(progVenusLon, natal.jupiter, 'jupiter') * 0.35
      + aspectScore(progVenusLon, natal.asc,     'venus')   * 0.20
      + aspectScore(progVenusLon, natal.moon,    'venus')   * 0.15;

    const mar =
        aspectScore(progMarsLon, natal.sun,    'mars')  * 0.30
      + aspectScore(progMarsLon, natal.mc,     'mars')  * 0.35
      + aspectScoreByNature(progMarsLon, natal.saturn, SAT_VALENCE_BY_ASPECT) * 0.20
      + aspectScore(progMarsLon, natal.moon,   'mars')  * 0.15;

    return clamp(ven * 0.55 + mar * 0.45, -1.0, 1.0) * 11;
  }

  /* ═══════════════════════════════════════════
     최종 점수 곡선 (tanh 보정)
  ════════════════════════════════════════════ */
  function applyScoreCurve(rawScore) {
    const delta  = rawScore - 60;
    const curved = Math.tanh(delta / 22) * 30;
    return Math.round(clamp(60 + curved, 40, 100));
  }

  /* ═══════════════════════════════════════════
     메인: computeLifeGraph(input, astroResult?)
  ════════════════════════════════════════════ */
  function computeLifeGraph(input, astroResult) {
    const { birthDate, birthTime, lat, lng, utcOffset } = input;
    const [by, bm, bd] = birthDate.split('-').map(Number);
    const [bh, bmin]   = birthTime.split(':').map(Number);
    const utcHour      = bh + bmin / 60 - (utcOffset || 9);
    const natalJD      = calcJD(by, bm, bd, utcHour);

    const natal        = extractNatal(astroResult, natalJD, lat, lng);
    const natalAspects = astroResult?.natalAspectsFull || [];

    const { jupW, satW, moonW, plutW } = calcLayer0(natal, natalAspects);
    console.log(`⚙️ [L0] jupW=${jupW.toFixed(2)} satW=${satW.toFixed(2)} moonW=${moonW.toFixed(2)} plutW=${plutW.toFixed(2)}`);
    console.log(`⚙️ [v4.0] _houseCusps: ${natal._houseCusps ? '로드됨' : 'VSOP폴백(라우터 비활성)'}`);

    const currentYear = new Date().getFullYear();
    const endYear     = by + 80;
    const scores      = [];

    let prevSatDist    = null;
    let prevProgSunLon = null;

    for (let year = by; year <= endYear; year++) {
      const ageYears    = year - by + 0.5;
      const progJD      = natalJD + ageYears;
      const Tp          = (progJD - 2451545) / 36525;

      const progSunLon   = calcSun(Tp);
      const progMoonLon  = calcMoon(Tp);
      const progVenusLon = calcVenus(Tp);
      const progMarsLon  = calcMars(Tp);
      const { asc: progAscLon } = calcProgAscMC(natalJD, ageYears, lat, lng);

      const tr7       = getPlanets(calcJD(year, 7, 1, 12));
      const trSatDist = angDist(tr7.saturn, natal.saturn);

      const L1 = calcLayer1(progSunLon, prevProgSunLon, natal, jupW);
      const l2 = calcLayer2(year, bm, natal.sun, natal, jupW, satW, plutW);
      const L2 = l2.overall;
      const L3 = calcLayer3(progMoonLon, progSunLon, progAscLon, tr7.saturn, natal, ageYears, prevSatDist, satW, moonW);
      const L4 = calcLayer4(progVenusLon, progMarsLon, natal);

      const rawScore = 60 + L1 + L2 + L3 + L4;
      const score    = applyScoreCurve(rawScore);

      // v4.0: 도메인 점수
      // 직업: 트랜짓 피크 + 프로그 태양→MC 보조
      const careerL1  = progAspectScore(progSunLon, natal.mc, 'sun') * 0.50;
      const career    = applyScoreCurve(60 + clamp(l2.careerPeak + careerL1, -1.0, 1.0) * 22);

      // 재물: 트랜짓 피크 + 프로그 금성→나탈 목성 보조
      const wealthL4  = (
          aspectScore(progVenusLon, natal.jupiter, 'jupiter') * 0.55
        + aspectScore(progVenusLon, natal.sun,     'venus')   * 0.30
      ) * 0.40;
      const wealth    = applyScoreCurve(60 + clamp(l2.wealthPeak + wealthL4, -1.0, 1.0) * 22);

      // 관계: 트랜짓 피크 + 프로그 달→나탈 금성/달 보조
      const relL3a    = calcProgMoonScore(progMoonLon, progAscLon, natal, moonW) * 0.50;
      const relationship = applyScoreCurve(60 + clamp(l2.relPeak + relL3a, -1.0, 1.0) * 22);

      // 시련강도: 0-100 정수
      const intensity = Math.min(100, Math.round(l2.intensityPeak * 75));

      scores.push({
        year,
        age:    Math.floor(ageYears),
        score,
        career,
        wealth,
        relationship,
        intensity,
        layer1: Math.round(clamp(60 + L1, 30, 90)),
        layer2: Math.round(clamp(60 + L2, 30, 90)),
        layer3: Math.round(clamp(60 + L3, 30, 90)),
        layer4: Math.round(clamp(60 + L4, 30, 90)),
      });

      prevSatDist    = trSatDist;
      prevProgSunLon = progSunLon;
    }

    return { scores, natal, birthYear: by, currentAge: currentYear - by, currentYear };
  }

  window.LifeGraphEngine = { computeLifeGraph };
  console.log('✅ life_graph_engine.js v4.0 로드 완료');
})();
