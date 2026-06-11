/* =========================================================
   인생 그래프 엔진 (life_graph_engine.js)
   ─────────────────────────────────────────────────────────
   3층 점성학 기반 인생 운세 점수 계산
   Layer 1 (Trend)      : 세컨더리 프로그레션 태양/달 → 10년 큰 흐름
   Layer 2 (Annual)     : 솔라 리턴 + 프로펙션     → 연간 성취
   Layer 3 (Trigger)    : 목성/토성 트랜짓         → 상승/하락 타이밍

   행성 계산: VSOP87 축약 (astro-calc.js와 동일 알고리즘)
   입력: { birthDate, birthTime, lat, lng, utcOffset }
   출력: 생년 ~ 현재+20년까지 연도별 점수 배열
   ========================================================= */

console.log("🔥 life_graph_engine.js 로드 시작");

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
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    const M  = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    const mr = rad(M);
    const C  = (1.914602 - 0.004817*T - 0.000014*T*T) * Math.sin(mr)
             + (0.019993 - 0.000101*T) * Math.sin(2*mr)
             + 0.000289 * Math.sin(3*mr);
    return norm360(L0 + C);
  }

  function calcMoon(T) {
    const D  = 297.85036 + 445267.111480*T - 0.0019142*T*T;
    const M  = 357.52772 + 35999.050340 *T - 0.0001603*T*T;
    const Mp = 134.96298 + 477198.867398*T + 0.0086972*T*T;
    const F  = 93.27191  + 483202.017538*T - 0.0036825*T*T;
    const L1 = 218.3165  + 481267.8813  *T;
    return norm360(L1
      + 6.289  * Math.sin(rad(Mp))
      - 1.274  * Math.sin(rad(2*D - Mp))
      + 0.658  * Math.sin(rad(2*D))
      - 0.214  * Math.sin(rad(2*Mp))
      - 0.186  * Math.sin(rad(M))
      - 0.114  * Math.sin(rad(2*F))
      + 0.059  * Math.sin(rad(2*D - 2*Mp))
      + 0.053  * Math.sin(rad(2*D + Mp)));
  }

  function calcJupiter(T) {
    const L = 34.351519 + 3036.3027748*T + 0.00022330*T*T;
    const M = 20.9      + 3034.74      *T;
    return norm360(L + 5.555*Math.sin(rad(M)) + 0.168*Math.sin(rad(2*M)));
  }

  function calcSaturn(T) {
    const L = 50.077444 + 1223.5110686*T + 0.00051908*T*T;
    const M = 317.9     + 1222.114     *T;
    return norm360(L + 6.393*Math.sin(rad(M)) + 0.120*Math.sin(rad(2*M)));
  }

  function calcUranus(T) {
    const L = 314.055005 + 429.8640561*T + 0.00030390*T*T;
    const M = 142.5      + 428.9       *T;
    return norm360(L + 5.460*Math.sin(rad(M)) + 0.168*Math.sin(rad(2*M)));
  }

  function calcMercury(T) {
    const L = 252.250906 + 149474.0722491*T;
    const M = 174.7948   + 149472.5159   *T;
    return norm360(L + 1.912*Math.sin(rad(M)) + 0.120*Math.sin(rad(2*M)));
  }

  function calcVenus(T) {
    const L = 181.979801 + 58519.2130302*T;
    const M = 212.8      + 58517.80     *T;
    return norm360(L + 0.7758*Math.sin(rad(M)));
  }

  function calcMars(T) {
    const L = 355.433 + 19141.6964471*T;
    const M = 19.373  + 19140.3      *T;
    return norm360(L + 10.691*Math.sin(rad(M)) + 0.623*Math.sin(rad(2*M)));
  }

  function getPlanets(jd) {
    const T = (jd - 2451545.0) / 36525.0;
    return {
      sun:     calcSun(T),
      moon:    calcMoon(T),
      mercury: calcMercury(T),
      venus:   calcVenus(T),
      mars:    calcMars(T),
      jupiter: calcJupiter(T),
      saturn:  calcSaturn(T),
      uranus:  calcUranus(T),
    };
  }

  /* ── ASC / Equal House ────────────────────────────────── */
  function calcAscMC(jd, lat, lng) {
    const T    = (jd - 2451545.0) / 36525.0;
    const GMST = norm360(280.46061837 + 360.98564736629*(jd-2451545.0) + 0.000387933*T*T);
    const LST  = norm360(GMST + lng);
    const eps  = 23.4392911 - 0.013004167*T;
    const epsr = rad(eps);
    const mc   = norm360(Math.atan2(Math.tan(rad(LST)), Math.cos(epsr)) * 180/Math.PI);
    const latR = rad(lat);
    const RAMC = rad(LST);
    const asc  = norm360(
      Math.atan2(Math.cos(RAMC), -(Math.sin(epsr)*Math.tan(latR)+Math.cos(epsr)*Math.sin(RAMC))) * 180/Math.PI
    );
    return { asc, mc };
  }

  /* ── 각도 차이 (0~180) ────────────────────────────────── */
  function angDist(a, b) {
    const d = Math.abs(norm360(a) - norm360(b));
    return d > 180 ? 360 - d : d;
  }

  /* ── 에스펙트 점수 (-1.0 ~ +1.0) ─────────────────────── */
  // 트라인(120)·섹스타일(60)·컨정션(0) = 양성
  // 스퀘어(90)·오포지션(180) = 음성
  // orb: 컨정션/오포지션 8°, 트라인/스퀘어 6°, 섹스타일 4°
  const ASPECTS = [
    { angle:   0, orb: 8, score:  1.0 },  // 컨정션
    { angle:  60, orb: 4, score:  0.5 },  // 섹스타일
    { angle: 120, orb: 6, score:  0.8 },  // 트라인
    { angle:  90, orb: 6, score: -0.7 },  // 스퀘어
    { angle: 180, orb: 8, score: -1.0 },  // 오포지션
  ];

  function aspectScore(a, b) {
    const dist = angDist(a, b);
    let best = 0;
    for (const asp of ASPECTS) {
      const diff = Math.abs(dist - asp.angle);
      if (diff <= asp.orb) {
        // orb 내에서 중심일수록 강함 (선형 감쇠)
        const strength = 1 - diff / asp.orb;
        const s = asp.score * strength;
        if (Math.abs(s) > Math.abs(best)) best = s;
      }
    }
    return best;
  }

  /* =========================================================
     LAYER 1: 세컨더리 프로그레션
     1일 = 1년 치환
     프로그레션 태양: 연간 약 1° 이동 → 하우스·에스펙트 변화 추적
     프로그레션 달: 약 12°/년 → 나탈 행성과의 관계
     가중치: 태양 40% / 달 35% / ASC·MC 25%
   ========================================================= */
  function calcProgression(natalJD, ageYears, natal, lat, lng) {
    const progJD     = natalJD + ageYears;           // 1일 = 1년
    const progPlanets = getPlanets(progJD);
    const { asc: progAsc, mc: progMC } = calcAscMC(progJD, lat, lng);

    // 프로그레션 행성 vs 나탈 행성 에스펙트 점수
    // 태양: 나탈 태양·달·ASC·MC와의 에스펙트
    const sunVsSun  = aspectScore(progPlanets.sun, natal.sun);
    const sunVsMoon = aspectScore(progPlanets.sun, natal.moon);
    const sunVsAsc  = aspectScore(progPlanets.sun, natal.asc);
    const sunVsMC   = aspectScore(progPlanets.sun, natal.mc);

    // 달: 나탈 행성 전체와의 에스펙트
    const moonVsSun  = aspectScore(progPlanets.moon, natal.sun);
    const moonVsMoon = aspectScore(progPlanets.moon, natal.moon);
    const moonVsJup  = aspectScore(progPlanets.moon, natal.jupiter);
    const moonVsSat  = aspectScore(progPlanets.moon, natal.saturn);
    const moonVsAsc  = aspectScore(progPlanets.moon, natal.asc);
    const moonVsMC   = aspectScore(progPlanets.moon, natal.mc);

    // ASC/MC 프로그레션 vs 나탈
    const ascScore   = aspectScore(progAsc, natal.sun) * 0.5
                     + aspectScore(progAsc, natal.moon) * 0.3
                     + aspectScore(progAsc, natal.mc) * 0.2;
    const mcScore    = aspectScore(progMC, natal.sun) * 0.4
                     + aspectScore(progMC, natal.jupiter) * 0.35
                     + aspectScore(progMC, natal.saturn) * 0.25;

    const sunScore  = (sunVsSun*0.30 + sunVsMoon*0.25 + sunVsAsc*0.25 + sunVsMC*0.20);
    const moonScore = (moonVsSun*0.20 + moonVsMoon*0.15 + moonVsJup*0.20
                     + moonVsSat*0.15 + moonVsAsc*0.15 + moonVsMC*0.15);

    return clamp(
      0.40 * sunScore +
      0.35 * moonScore +
      0.15 * ascScore +
      0.10 * mcScore,
      -1.0, 1.0
    );
  }

  /* =========================================================
     LAYER 2: 솔라 리턴 + 프로펙션
     솔라 리턴: 매년 태양이 나탈 태양 위치로 돌아오는 시점의 차트
     프로펙션: 나이 % 12 → 활성 하우스 → 하우스 지배 행성 활성
   ========================================================= */

  // 솔라 리턴 JD 근사 (해당 연도에 태양이 나탈 태양 경도로 돌아오는 날)
  function solarReturnJD(natalJD, targetYear, natalSunLon) {
    // 해당 연도 1월 1일에서 시작해 탐색
    let jd = calcJD(targetYear, 1, 1, 12);
    for (let i = 0; i < 370; i++) {
      const T   = (jd - 2451545.0) / 36525.0;
      const lon = calcSun(T);
      const diff = natalSunLon - lon;
      // 빠른 수렴: 태양은 하루 약 1° 이동
      const step = ((diff + 540) % 360) - 180;
      if (Math.abs(step) < 0.01) break;
      jd += step / 360 * 365.25;
    }
    return jd;
  }

  // 솔라 리턴 차트 점수
  // 10하우스(커리어) + 2하우스(재물) + 1하우스(자아) 상태 분석
  function calcSolarReturnScore(srJD, natal, lat, lng) {
    const srPlanets = getPlanets(srJD);
    const { asc: srAsc, mc: srMC } = calcAscMC(srJD, lat, lng);

    // SR 목성이 나탈 MC·태양·달과 맺는 에스펙트
    const jupToMC   = aspectScore(srPlanets.jupiter, natal.mc);
    const jupToSun  = aspectScore(srPlanets.jupiter, natal.sun);
    const jupToMoon = aspectScore(srPlanets.jupiter, natal.moon);

    // SR 토성이 나탈 MC·태양과 맺는 에스펙트 (토성은 부담/책임)
    const satToMC   = aspectScore(srPlanets.saturn, natal.mc);
    const satToSun  = aspectScore(srPlanets.saturn, natal.sun);

    // SR ASC가 나탈 MC·태양과 맺는 에스펙트 (SR ASC = 올해의 페르소나)
    const ascToMC  = aspectScore(srAsc, natal.mc);
    const ascToSun = aspectScore(srAsc, natal.sun);

    // SR MC가 나탈 태양·MC와 맺는 에스펙트
    const mcToSun = aspectScore(srMC, natal.sun);
    const mcToMC  = aspectScore(srMC, natal.mc);

    // 긍정: 목성 / 부정: 토성 (토성은 성장통이기도 하므로 절반만 감점)
    const jupScore = (jupToMC*0.40 + jupToSun*0.35 + jupToMoon*0.25);
    const satScore = (satToMC*0.55 + satToSun*0.45) * 0.6; // 토성 감점 완화
    const angleScore = (ascToMC*0.30 + ascToSun*0.30 + mcToSun*0.20 + mcToMC*0.20);

    return clamp(
      0.45 * jupScore +
      0.30 * satScore +
      0.25 * angleScore,
      -1.0, 1.0
    );
  }

  // 프로펙션 점수
  // 나이 % 12 → 활성 하우스 → 나탈 해당 하우스 커스프의 지배 행성
  // 목성·태양·금성 하우스 = 상승 / 토성·화성 하우스 = 하락
  function calcProfectionScore(ageYears, natal) {
    const activeHouse = (Math.floor(ageYears) % 12) + 1; // 1~12

    // Equal House 커스프: ASC + (house-1)*30
    const houseCusp = norm360(natal.asc + (activeHouse - 1) * 30);

    // 어느 사인(星座)에 해당하는가 → 지배 행성
    const signIdx   = Math.floor(houseCusp / 30);
    // 전통 지배 행성 (현대: 천왕성·해왕성·명왕성 제외)
    const RULERS = [
      "mars",    // 양자리 (0)
      "venus",   // 황소자리 (1)
      "mercury", // 쌍둥이자리 (2)
      "moon",    // 게자리 (3)
      "sun",     // 사자자리 (4)
      "mercury", // 처녀자리 (5)
      "venus",   // 천칭자리 (6)
      "mars",    // 전갈자리 (7)  (전통: 화성)
      "jupiter", // 사수자리 (8)
      "saturn",  // 염소자리 (9)
      "saturn",  // 물병자리 (10) (전통: 토성)
      "jupiter", // 물고기자리 (11) (전통: 목성)
    ];
    const lord = RULERS[signIdx];

    // Lord of the Year의 나탈 위치 → MC·태양·달과의 에스펙트
    const lordLon = natal[lord];
    if (lordLon == null) return 0;

    const lordToMC   = aspectScore(lordLon, natal.mc);
    const lordToSun  = aspectScore(lordLon, natal.sun);
    const lordToMoon = aspectScore(lordLon, natal.moon);

    // 목성·태양·금성·달이 lord이면 가산, 토성·화성이면 감산
    const lordBias = {
      sun: 0.3, moon: 0.15, venus: 0.25, jupiter: 0.35,
      mercury: 0.05, mars: -0.2, saturn: -0.3
    }[lord] || 0;

    return clamp(
      lordToMC*0.35 + lordToSun*0.30 + lordToMoon*0.20 + lordBias * 0.15,
      -1.0, 1.0
    );
  }

  /* =========================================================
     LAYER 3: 외행성 트랜짓
     목성(11.86년) · 토성(29.5년) · 천왕성(84년)
     나탈 태양·달·MC·ASC와의 에스펙트 추적
     목성 = 확장/기회(+) / 토성 = 시련/성장(-~+) / 천왕성 = 급변
   ========================================================= */
  function calcTransitScore(transitJD, natal) {
    const tr = getPlanets(transitJD);

    // 목성 트랜짓: 나탈 태양·달·MC·ASC
    const jupToSun  = aspectScore(tr.jupiter, natal.sun);
    const jupToMoon = aspectScore(tr.jupiter, natal.moon);
    const jupToMC   = aspectScore(tr.jupiter, natal.mc);
    const jupToAsc  = aspectScore(tr.jupiter, natal.asc);

    // 토성 트랜짓: 나탈 태양·달·MC·ASC (토성 리턴 포함)
    const satToSun  = aspectScore(tr.saturn, natal.sun);
    const satToMoon = aspectScore(tr.saturn, natal.moon);
    const satToMC   = aspectScore(tr.saturn, natal.mc);
    const satToAsc  = aspectScore(tr.saturn, natal.asc);

    // 천왕성 트랜짓: 나탈 태양·MC (급격한 변화)
    const uraToSun  = aspectScore(tr.uranus, natal.sun);
    const uraToMC   = aspectScore(tr.uranus, natal.mc);

    const jupScore = (jupToSun*0.30 + jupToMoon*0.20 + jupToMC*0.30 + jupToAsc*0.20);
    // 토성은 트라인/섹스타일이면 긍정, 스퀘어/오포지션이면 부정 (그대로 반영)
    const satScore = (satToSun*0.30 + satToMoon*0.20 + satToMC*0.30 + satToAsc*0.20);
    // 천왕성은 모든 에스펙트가 변동성 (절댓값의 절반만)
    const uraScore = (uraToSun*0.55 + uraToMC*0.45) * 0.5;

    return clamp(
      0.50 * jupScore +
      0.35 * satScore +
      0.15 * uraScore,
      -1.0, 1.0
    );
  }

  /* =========================================================
     메인: computeLifeGraph
     입력: { birthDate, birthTime, lat, lng, utcOffset }
     출력: { scores: [{year, age, score, layer1, layer2, layer3}], natal }
   ========================================================= */
  function computeLifeGraph(input) {
    const { birthDate, birthTime, lat, lng, utcOffset } = input;
    const [by, bm, bd] = birthDate.split('-').map(Number);
    const [bh, bmin]   = birthTime.split(':').map(Number);
    const localHour    = bh + bmin / 60;
    const utcHour      = localHour - (utcOffset || 9);
    const natalJD      = calcJD(by, bm, bd, utcHour);

    // 나탈 행성 위치
    const natalPlanets = getPlanets(natalJD);
    const { asc: natalAsc, mc: natalMC } = calcAscMC(natalJD, lat, lng);
    const natal = {
      ...natalPlanets,
      asc: natalAsc,
      mc:  natalMC,
    };

    const currentYear = new Date().getFullYear();
    const startYear   = by;                  // 출생년
    const endYear     = currentYear + 15;    // 현재 +15년

    const scores = [];

    for (let year = startYear; year <= endYear; year++) {
      const ageYears = year - by + 0.5; // 해당 연도 중반 기준
      if (ageYears < 0) continue;

      // Layer 1: 세컨더리 프로그레션
      const l1 = calcProgression(natalJD, ageYears, natal, lat, lng);

      // Layer 2: 솔라 리턴 + 프로펙션
      let l2 = 0;
      try {
        const srJD   = solarReturnJD(natalJD, year, natal.sun);
        const srScore = calcSolarReturnScore(srJD, natal, lat, lng);
        const profScore = calcProfectionScore(ageYears, natal);
        l2 = 0.60 * srScore + 0.40 * profScore;
      } catch(e) { l2 = 0; }

      // Layer 3: 외행성 트랜짓 (해당 연도 중반 JD)
      const transitJD = calcJD(year, 7, 1, 12);
      const l3 = calcTransitScore(transitJD, natal);

      // 3층 합산 (가중치: Trend 45% / Annual 35% / Trigger 20%)
      const combined = 0.45*l1 + 0.35*l2 + 0.20*l3;

      // 0~100 정규화 (−1~+1 → 35~85 범위, 기준선 60)
      // 인생이 항상 극단이지 않도록 중간값 60 중심 분포
      const score = Math.round(clamp(60 + combined * 22, 20, 95));

      scores.push({
        year,
        age:    Math.floor(ageYears),
        score,
        layer1: Math.round(clamp(50 + l1*25, 10, 90)),
        layer2: Math.round(clamp(50 + l2*25, 10, 90)),
        layer3: Math.round(clamp(50 + l3*25, 10, 90)),
      });
    }

    // 현재 나이 표시용
    const currentAge = currentYear - by;

    return { scores, natal, birthYear: by, currentAge, currentYear };
  }

  window.LifeGraphEngine = { computeLifeGraph };
  console.log("✅ life_graph_engine.js 로드 완료");
})();
