/* =========================================================
   인생 그래프 엔진 (life_graph_engine.js) v2.0
   ─────────────────────────────────────────────────────────
   Layer 1 (40%): 프로그레션 태양 사인 — 계절 베이스
   Layer 2 (35%): 세운 목성/토성 트랜짓 + 리턴 이벤트
   Layer 3 (25%): 프로그레션 달 에스펙트
   기간: 출생 ~ 80세
   ========================================================= */

console.log("🔥 life_graph_engine.js v2.0 로드 시작");

(function () {
  'use strict';

  /* ── 유틸 ─────────────────────────────────────────────── */
  function norm360(a) { return ((a % 360) + 360) % 360; }
  function rad(d)     { return d * Math.PI / 180; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  /* ── 율리우스일 계산 ──────────────────────────────────── */
  function calcJD(y, m, d, utcHour = 12) {
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716))
         + Math.floor(30.6001 * (m + 1))
         + d + utcHour / 24 + B - 1524.5;
  }

  /* ── 행성 계산 (VSOP87 축약) ──────────────────────────── */
  function calcSun(T) {
    const L0 = 280.46646 + 36000.76983*T + 0.0003032*T*T;
    const M  = 357.52911 + 35999.05029*T - 0.0001537*T*T;
    const mr = rad(M);
    const C  = (1.914602 - 0.004817*T - 0.000014*T*T)*Math.sin(mr)
             + (0.019993 - 0.000101*T)*Math.sin(2*mr)
             + 0.000289*Math.sin(3*mr);
    return norm360(L0 + C);
  }

  function calcMoon(T) {
    const D  = 297.85036 + 445267.111480*T - 0.0019142*T*T;
    const M  = 357.52772 + 35999.050340*T  - 0.0001603*T*T;
    const Mp = 134.96298 + 477198.867398*T + 0.0086972*T*T;
    const F  = 93.27191  + 483202.017538*T - 0.0036825*T*T;
    const L1 = 218.3165  + 481267.8813*T;
    return norm360(L1
      + 6.289*Math.sin(rad(Mp))
      - 1.274*Math.sin(rad(2*D - Mp))
      + 0.658*Math.sin(rad(2*D))
      - 0.214*Math.sin(rad(2*Mp))
      - 0.186*Math.sin(rad(M))
      - 0.114*Math.sin(rad(2*F)));
  }

  function calcJupiter(T) {
    const L = 34.351519  + 3036.3027748*T;
    const M = 20.9       + 3034.74*T;
    return norm360(L + 5.555*Math.sin(rad(M)) + 0.168*Math.sin(rad(2*M)));
  }

  function calcSaturn(T) {
    const L = 50.077444  + 1223.5110686*T;
    const M = 317.9      + 1222.114*T;
    return norm360(L + 6.393*Math.sin(rad(M)) + 0.120*Math.sin(rad(2*M)));
  }

  function calcUranus(T) {
    const L = 314.055005 + 429.8640561*T;
    const M = 142.5      + 428.9*T;
    return norm360(L + 5.460*Math.sin(rad(M)));
  }

  function getPlanets(jd) {
    const T = (jd - 2451545.0) / 36525.0;
    return {
      sun:     calcSun(T),
      moon:    calcMoon(T),
      jupiter: calcJupiter(T),
      saturn:  calcSaturn(T),
      uranus:  calcUranus(T),
    };
  }

  /* ── Naibod key 프로그레션 ASC/MC ─────────────────────── */
  function calcProgAscMC(natalJD, ageYears, lat, lng) {
    const NAIBOD = 0.98564736629;
    const T      = (natalJD - 2451545.0) / 36525.0;
    const GMST   = norm360(280.46061837 + 360.98564736629*(natalJD-2451545.0) + 0.000387933*T*T);
    const natalRAMC = norm360(GMST + lng);
    const progRAMC  = norm360(natalRAMC + ageYears * NAIBOD);
    const eps  = 23.4392911 - 0.013004167*T;
    const epsr = rad(eps);
    const latR = rad(lat);
    const mc  = norm360(Math.atan2(Math.tan(rad(progRAMC)), Math.cos(epsr)) * 180/Math.PI);
    const asc = norm360(
      Math.atan2(Math.cos(rad(progRAMC)),
        -(Math.sin(epsr)*Math.tan(latR)+Math.cos(epsr)*Math.sin(rad(progRAMC)))
      ) * 180/Math.PI
    );
    return { asc, mc };
  }

  /* ── 각도 차이 (0~180) ────────────────────────────────── */
  function angDist(a, b) {
    const d = Math.abs(norm360(a) - norm360(b));
    return d > 180 ? 360 - d : d;
  }

  /* ── 행성 성질 ────────────────────────────────────────── */
  const PLANET_NATURE = {
    sun:     0.7,
    moon:    0.2,
    mercury: 0.1,
    venus:   0.6,
    mars:   -0.5,
    jupiter: 1.0,
    saturn: -0.7,
    uranus:  0.0,
    neptune:-0.1,
    pluto:  -0.4,
  };

  /* ── 에스펙트 점수 (행성 성질 반영) ──────────────────── */
  const ASPECT_BASE = {
    0:   { orb: 8, dir:  1.0 },
    60:  { orb: 4, dir:  0.6 },
    120: { orb: 6, dir:  0.9 },
    90:  { orb: 6, dir: -0.8 },
    180: { orb: 8, dir: -0.9 },
  };

  function aspectScore(a, b, planetKey) {
    const dist   = angDist(a, b);
    const nature = PLANET_NATURE[planetKey] ?? 0;
    let best = 0;
    for (const [angleStr, asp] of Object.entries(ASPECT_BASE)) {
      const angle = Number(angleStr);
      const diff  = Math.abs(dist - angle);
      if (diff <= asp.orb) {
        const strength = 1 - diff / asp.orb;
        let s;
        if (angle === 0) {
          s = nature * strength;
        } else if (asp.dir > 0) {
          s = asp.dir * (nature >= 0 ? 1.0 : 0.3) * strength;
        } else {
          s = asp.dir * (nature < 0 ? 1.0 : 0.5) * strength;
        }
        if (Math.abs(s) > Math.abs(best)) best = s;
      }
    }
    return best;
  }

  /* =========================================================
     LAYER 1: 프로그레션 태양 사인 — 계절 베이스 (40%)
     봄(양·황소·쌍둥이) / 여름(게·사자·처녀)
     가을(천칭·전갈·사수) / 겨울(염소·물병·물고기)
     사인 전환 전후 3년: 전환기 보너스
   ========================================================= */
  const SEASON_BASE = {
    // 봄 (0=양자리, 1=황소, 2=쌍둥이)
    0: 70, 1: 70, 2: 70,
    // 여름 (3=게, 4=사자, 5=처녀)
    3: 65, 4: 65, 5: 65,
    // 가을 (6=천칭, 7=전갈, 8=사수)
    6: 58, 7: 58, 8: 58,
    // 겨울 (9=염소, 10=물병, 11=물고기)
    9: 52, 10: 52, 11: 52,
  };

  function calcSeasonBase(natalJD, ageYears) {
    // 프로그레션 태양 위치 (1일=1년)
    const progJD  = natalJD + ageYears;
    const T       = (progJD - 2451545.0) / 36525.0;
    const progSun = calcSun(T);
    const signIdx = Math.floor(progSun / 30);
    const base    = SEASON_BASE[signIdx] ?? 60;

    // 사인 전환 전후 3년 보너스
    const degInSign = progSun % 30;
    let bonus = 0;
    if (degInSign < 3) bonus = 8 * (1 - degInSign / 3);       // 새 사인 진입
    if (degInSign > 27) bonus = 8 * ((degInSign - 27) / 3);   // 전환 직전

    return base + bonus;
  }

  /* =========================================================
     LAYER 2: 세운 목성/토성 트랜짓 + 리턴 이벤트 (35%)
   ========================================================= */
  function calcTransitLayer(transitJD, natal) {
    const tr = getPlanets(transitJD);

    // 목성 트랜짓 → 나탈 태양·달·MC·ASC
    const jupToSun  = aspectScore(tr.jupiter, natal.sun,  'jupiter');
    const jupToMoon = aspectScore(tr.jupiter, natal.moon, 'jupiter');
    const jupToMC   = aspectScore(tr.jupiter, natal.mc,   'jupiter');
    const jupToAsc  = aspectScore(tr.jupiter, natal.asc,  'jupiter');
    const jupScore  = (jupToSun*0.30 + jupToMoon*0.20 + jupToMC*0.30 + jupToAsc*0.20);

    // 토성 트랜짓 → 나탈 태양·달·MC·ASC
    const satToSun  = aspectScore(tr.saturn, natal.sun,  'saturn');
    const satToMoon = aspectScore(tr.saturn, natal.moon, 'saturn');
    const satToMC   = aspectScore(tr.saturn, natal.mc,   'saturn');
    const satToAsc  = aspectScore(tr.saturn, natal.asc,  'saturn');
    const satScore  = (satToSun*0.30 + satToMoon*0.20 + satToMC*0.30 + satToAsc*0.20);

    // 천왕성 트랜짓 → 나탈 태양·MC
    const uraScore  = (aspectScore(tr.uranus, natal.sun, 'uranus')*0.55
                     + aspectScore(tr.uranus, natal.mc,  'uranus')*0.45) * 0.4;

    // 목성 리턴 (12년 주기) — 나탈 목성과 컨정션
    const jupReturn = angDist(tr.jupiter, natal.jupiter) < 5 ? 0.6 : 0;

    // 토성 리턴 (29.5년 주기) — 나탈 토성과 컨정션
    const satReturn = angDist(tr.saturn, natal.saturn) < 5 ? -0.4 : 0;

    // 천왕성 오포지션 (42세 전후) — 나탈 천왕성과 180°
    const uraOpposition = angDist(tr.uranus, natal.uranus) > 170 ? -0.3 : 0;

    const combined = 0.45*jupScore + 0.35*satScore + 0.10*uraScore
                   + jupReturn + satReturn + uraOpposition;

    return clamp(combined, -1.0, 1.0);
  }

  /* =========================================================
     LAYER 3: 프로그레션 달 에스펙트 (25%)
   ========================================================= */
  function calcProgMoon(natalJD, ageYears, natal, lat, lng) {
    const progJD   = natalJD + ageYears;
    const T        = (progJD - 2451545.0) / 36525.0;
    const progMoon = calcMoon(T);
    const { asc: progAsc, mc: progMC } = calcProgAscMC(natalJD, ageYears, lat, lng);

    const moonVsSun  = aspectScore(progMoon, natal.sun,     'moon');
    const moonVsMoon = aspectScore(progMoon, natal.moon,    'moon');
    const moonVsJup  = aspectScore(progMoon, natal.jupiter, 'moon');
    const moonVsSat  = aspectScore(progMoon, natal.saturn,  'moon');
    const moonVsAsc  = aspectScore(progMoon, natal.asc,     'moon');
    const moonVsMC   = aspectScore(progMoon, natal.mc,      'moon');
    const ascScore   = aspectScore(progAsc,  natal.sun,     'sun') * 0.5
                     + aspectScore(progAsc,  natal.moon,    'moon') * 0.5;

    return clamp(
      moonVsSun*0.20 + moonVsMoon*0.15 + moonVsJup*0.20
      + moonVsSat*0.15 + moonVsAsc*0.15 + moonVsMC*0.15 + ascScore*0.15,
      -1.0, 1.0
    );
  }

  /* =========================================================
     메인: computeLifeGraph
   ========================================================= */
  function computeLifeGraph(input) {
    const { birthDate, birthTime, lat, lng, utcOffset } = input;
    const [by, bm, bd] = birthDate.split('-').map(Number);
    const [bh, bmin]   = birthTime.split(':').map(Number);
    const utcHour      = bh + bmin/60 - (utcOffset || 9);
    const natalJD      = calcJD(by, bm, bd, utcHour);

    // 나탈 행성
    const natalPlanets = getPlanets(natalJD);
    const { asc: natalAsc, mc: natalMC } = calcProgAscMC(natalJD, 0, lat, lng);
    const natal = { ...natalPlanets, asc: natalAsc, mc: natalMC };

    // 오늘 날짜 (KST 기준)
    const nowRaw   = new Date();
    const todayKST = new Date(Date.UTC(
      nowRaw.getUTCFullYear(),
      nowRaw.getUTCMonth(),
      nowRaw.getUTCDate() + (nowRaw.getUTCHours() >= 15 ? 1 : 0),
      0, 0, 0
    ));
    const currentYear = todayKST.getUTCFullYear();
    const endYear     = by + 80;

    const scores = [];

    for (let year = by; year <= endYear; year++) {
      const ageYears  = year - by + 0.5;

      // Layer 1: 프로그레션 태양 계절 베이스
      const seasonBase = calcSeasonBase(natalJD, ageYears);

      // Layer 2: 세운 트랜짓 (-1~+1)
      const transitJD = calcJD(year, 7, 1, 12);
      const l2        = calcTransitLayer(transitJD, natal);

      // Layer 3: 프로그레션 달 (-1~+1)
      const l3 = calcProgMoon(natalJD, ageYears, natal, lat, lng);

      // 최종 점수
      // seasonBase(20~95) + l2 가산감산(최대 ±15) + l3 가산감산(최대 ±8)
      const score = Math.round(clamp(
        seasonBase * 0.40 + 60 * 0.60   // 베이스 블렌딩
        + l2 * 15                        // 트랜짓 가감
        + l3 * 8,                        // 달 가감
        20, 95
      ));

      scores.push({
        year,
        age:    Math.floor(ageYears),
        score,
        layer1: Math.round(seasonBase),
        layer2: Math.round(clamp(50 + l2*30, 10, 90)),
        layer3: Math.round(clamp(50 + l3*25, 10, 90)),
      });
    }

    const currentAge = currentYear - by;

    return { scores, natal, birthYear: by, currentAge, currentYear };
  }

  window.LifeGraphEngine = { computeLifeGraph };
  console.log("✅ life_graph_engine.js v2.0 로드 완료");
})();
