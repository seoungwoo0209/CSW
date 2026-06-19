/* =========================================================
   점성술 연간 이벤트 엔진 (astro-events-engine.js) v1.0
   ─────────────────────────────────────────────────────────
   A단계: 사실(fact) 계산 전용.
   AI(Gemini)에 넘길 구조화 JSON을 생성한다.
   B단계 해석 → api/gemini-events.js
   ─────────────────────────────────────────────────────────
   출력 구조:
   {
     year, profection: { house, theme, lord, age },
     events: [ { id, when, layer, tier, category,
                 technique, bodies, house, orb,
                 valence, fact, importance } ... ],
     speculative: [ ... ]
   }
   ========================================================= */

(function () {
  'use strict';

  /* ─── 유틸 ─────────────────────────────────────────────── */
  function norm360(a) { return ((a % 360) + 360) % 360; }
  function rad(d)     { return d * Math.PI / 180; }

  function calcJD(y, m, d, h) {
    if (h === undefined) h = 12;
    if (m <= 2) { y--; m += 12; }
    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716))
         + Math.floor(30.6001 * (m + 1))
         + d + h / 24 + B - 1524.5;
  }

  function angDist(a, b) {
    const d = Math.abs(norm360(a) - norm360(b));
    return d > 180 ? 360 - d : d;
  }

  function getHouseOf(lon, cusps) {
    if (!cusps || cusps.length < 12) return null;
    const n = norm360(lon);
    for (let i = 0; i < 12; i++) {
      const s = cusps[i], e = cusps[(i + 1) % 12];
      if (s > e) { if (n >= s || n < e) return i + 1; }
      else        { if (n >= s && n < e) return i + 1; }
    }
    return 12;
  }

  /* ─── VSOP87 행성 계산 (축약) ───────────────────────────── */
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
    const L1 = 218.3165  + 481267.8813   * T;
    const M  = 357.52772 + 35999.050340  * T - 0.0001603 * T * T;
    return norm360(L1
      + 6.289 * Math.sin(rad(Mp))
      - 1.274 * Math.sin(rad(2 * D - Mp))
      + 0.658 * Math.sin(rad(2 * D))
      - 0.214 * Math.sin(rad(2 * Mp))
      - 0.186 * Math.sin(rad(M))
      - 0.114 * Math.sin(rad(2 * F)));
  }

  function calcJupiter(T) {
    const L = 34.351519 + 3036.302775 * T;
    const M = 20.9      + 3034.74     * T;
    return norm360(L + 5.555 * Math.sin(rad(M)) + 0.168 * Math.sin(rad(2 * M)));
  }

  function calcSaturn(T) {
    const L = 50.077444 + 1223.511069 * T;
    const M = 317.9     + 1222.114    * T;
    return norm360(L + 6.393 * Math.sin(rad(M)) + 0.120 * Math.sin(rad(2 * M)));
  }

  function calcUranus(T) {
    const L = 314.055005 + 429.864056 * T;
    const M = 142.5      + 428.9      * T;
    return norm360(L + 5.460 * Math.sin(rad(M)));
  }

  function calcNeptune(T) {
    const L = 304.348665 + 219.8824475 * T;
    const M = 267.767    + 218.4581    * T;
    return norm360(L + 1.769 * Math.sin(rad(M)));
  }

  function calcPluto(T) {
    return norm360(238.96 + 145.18 * T);
  }

  /* ─── 상수 ──────────────────────────────────────────────── */
  const HOUSE_THEME = {
    1:'자아·시작',  2:'재물·가치',    3:'소통·이동',   4:'가정·뿌리',
    5:'창조·즐거움',6:'일·고용',      7:'관계·파트너', 8:'변환·상속',
    9:'철학·여행', 10:'직업·명예',   11:'공동체·목표',12:'은둔·내면',
  };

  const HOUSE_CAT = {
    1:'general',2:'wealth',3:'general',4:'family',
    5:'relationship',6:'career',7:'relationship',8:'wealth',
    9:'general',10:'career',11:'general',12:'general',
  };

  const SIGN_KR = [
    '양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
    '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리',
  ];

  const SIGN_RULER_KR = [
    '화성','금성','수성','달','태양','수성',
    '금성','화성','목성','토성','토성','목성',
  ];

  /* 에스펙트 정의 — impact 이벤트용 tight orb */
  const ASPECTS = [
    { angle:   0, name:'컨정션',   sym:'☌', orb:2.5 },
    { angle:  60, name:'섹스타일', sym:'⚹', orb:1.5 },
    { angle:  90, name:'스퀘어',   sym:'□', orb:2.5 },
    { angle: 120, name:'트라인',   sym:'△', orb:2.0 },
    { angle: 180, name:'어포지션', sym:'☍', orb:2.5 },
  ];

  /* ─── 일식·월식 테이블 (2024~2030) ─────────────────────── */
  const ECLIPSES = [
    { year:2024, date:'2024-04-08', type:'solar', lon: 19.8 },
    { year:2024, date:'2024-10-02', type:'solar', lon:189.8 },
    { year:2024, date:'2024-03-25', type:'lunar', lon:185.0 },
    { year:2024, date:'2024-09-18', type:'lunar', lon:355.5 },
    { year:2025, date:'2025-03-29', type:'solar', lon:  8.8 },
    { year:2025, date:'2025-09-21', type:'solar', lon:178.5 },
    { year:2025, date:'2025-03-14', type:'lunar', lon:174.2 },
    { year:2025, date:'2025-09-07', type:'lunar', lon:345.2 },
    { year:2026, date:'2026-02-17', type:'solar', lon:328.3 },
    { year:2026, date:'2026-08-12', type:'solar', lon:140.0 },
    { year:2026, date:'2026-03-03', type:'lunar', lon:163.0 },
    { year:2026, date:'2026-08-28', type:'lunar', lon:334.5 },
    { year:2027, date:'2027-02-06', type:'solar', lon:317.4 },
    { year:2027, date:'2027-08-02', type:'solar', lon:129.7 },
    { year:2027, date:'2027-02-20', type:'lunar', lon:152.0 },
    { year:2027, date:'2027-08-17', type:'lunar', lon:324.5 },
    { year:2028, date:'2028-01-26', type:'solar', lon:305.9 },
    { year:2028, date:'2028-07-22', type:'solar', lon:119.6 },
    { year:2028, date:'2028-01-12', type:'lunar', lon:112.0 },
    { year:2028, date:'2028-07-07', type:'lunar', lon:286.0 },
    { year:2029, date:'2029-06-12', type:'solar', lon: 81.5 },
    { year:2029, date:'2029-12-05', type:'solar', lon:253.0 },
    { year:2029, date:'2029-06-26', type:'lunar', lon:275.0 },
    { year:2029, date:'2029-12-20', type:'lunar', lon: 89.0 },
    { year:2030, date:'2030-06-01', type:'solar', lon: 70.5 },
    { year:2030, date:'2030-11-25', type:'solar', lon:242.8 },
  ];

  /* ─── 프로펙션 ──────────────────────────────────────────── */
  function calcProfection(birthYear, targetYear, cusps) {
    const age   = targetYear - birthYear;
    const house = (age % 12) + 1;
    const theme = HOUSE_THEME[house] || '';

    let lord = '알 수 없음';
    if (cusps && cusps.length >= house) {
      const signIdx = Math.floor(norm360(cusps[house - 1]) / 30);
      lord = SIGN_RULER_KR[signIdx] || '알 수 없음';
    }
    return { house, theme, lord, age };
  }

  /* ─── 월별 행성 위치 샘플 ───────────────────────────────── */
  function monthlyPos(year, calcFn) {
    const out = [];
    for (let m = 1; m <= 12; m++) {
      const T = (calcJD(year, m, 15, 12) - 2451545) / 36525;
      out.push({ month: m, lon: calcFn(T) });
    }
    return out;
  }

  /* 하우스 구간 텍스트 — 연속 구간 묶어 "3~10월 10하우스" 형태 */
  function houseRangeResult(year, positions, cusps) {
    if (!cusps) return null;
    const bm = positions.map(p => ({ m: p.month, h: getHouseOf(p.lon, cusps) }));

    const segs = [];
    let cur = bm[0], start = 1;
    for (let i = 1; i < bm.length; i++) {
      if (bm[i].h !== cur.h) {
        segs.push({ h: cur.h, from: start, to: i });
        cur = bm[i]; start = i + 1;
      }
    }
    segs.push({ h: cur.h, from: start, to: 12 });

    const majorSeg = segs.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a), segs[0]);
    segs.sort((a, b) => a.from - b.from);

    const text = segs.length === 1
      ? `${year}년 내내 ${segs[0].h}하우스`
      : segs.map(s => `${s.from}~${s.to}월 ${s.h}하우스`).join(' → ');

    return { majorH: majorSeg.h, text };
  }

  /* ─── 에스펙트 체크 ─────────────────────────────────────── */
  function findAsp(trLon, natLon) {
    const dist = angDist(trLon, natLon);
    for (const a of ASPECTS) {
      const diff = Math.abs(dist - a.angle);
      if (diff <= a.orb) {
        return { angle: a.angle, name: a.name, sym: a.sym, orb: Math.round(diff * 10) / 10 };
      }
    }
    return null;
  }

  /* 해당 년도에서 transit planet × natal point 의 최근접 window 탐색 */
  function transitWindow(year, calcFn, natalLon) {
    const months = monthlyPos(year, calcFn);
    let best = null;
    const active = [];

    for (const { month, lon } of months) {
      const asp = findAsp(lon, natalLon);
      if (asp) {
        active.push(month);
        if (!best || asp.orb < best.orb) best = { month, asp };
      }
    }
    if (!best) return null;

    const whenStr = active.length === 1
      ? `${year}-${String(active[0]).padStart(2, '0')}`
      : `${year}-${String(active[0]).padStart(2, '0')}~${String(active[active.length - 1]).padStart(2, '0')}`;

    return { best, whenStr };
  }

  /* ─── 밸런스·카테고리 헬퍼 ──────────────────────────────── */
  function resolveValence(planetName, aspAngle) {
    if (planetName === 'jupiter') {
      return aspAngle === 90 || aspAngle === 180 ? 'double_edged' : 'supportive';
    }
    if (planetName === 'saturn') {
      return aspAngle === 120 || aspAngle === 60 ? 'double_edged' : 'challenging';
    }
    return 'double_edged';
  }

  function resolveCategory(natalKey) {
    return { mc:'career', saturn:'career', venus:'relationship', moon:'family',
             jupiter:'wealth' }[natalKey] || 'general';
  }

  /* ─── 임팩트 이벤트 수집 (트랜짓 외행성 × 나탈 포인트) ──── */
  function collectImpacts(year, natal, cusps) {
    const TRANSIT = [
      { name:'jupiter', kr:'목성',   fn:calcJupiter, tier:1 },
      { name:'saturn',  kr:'토성',   fn:calcSaturn,  tier:1 },
      { name:'uranus',  kr:'천왕성', fn:calcUranus,  tier:1 },
      { name:'neptune', kr:'해왕성', fn:calcNeptune, tier:2 },
      { name:'pluto',   kr:'명왕성', fn:calcPluto,   tier:1 },
    ];

    const NAT_PTS = [
      { key:'sun',     kr:'태양' },
      { key:'moon',    kr:'달'   },
      { key:'asc',     kr:'ASC'  },
      { key:'mc',      kr:'MC'   },
      { key:'venus',   kr:'금성' },
      { key:'jupiter', kr:'목성' },
      { key:'saturn',  kr:'토성' },
    ];

    const events = [];

    for (const tp of TRANSIT) {
      for (const np of NAT_PTS) {
        const nLon = natal[np.key]?.longitude;
        if (nLon == null || isNaN(nLon)) continue;

        const win = transitWindow(year, tp.fn, nLon);
        if (!win) continue;

        const { best, whenStr } = win;
        const asp = best.asp;

        const peakT   = (calcJD(year, best.month, 15, 12) - 2451545) / 36525;
        const tpLon   = tp.fn(peakT);
        const tpHouse = cusps ? getHouseOf(tpLon, cusps) : null;

        const valence   = resolveValence(tp.name, asp.angle);
        const category  = resolveCategory(np.key);
        const important = ['sun','moon','asc','mc'].includes(np.key) &&
                          [0, 90, 180].includes(asp.angle);

        const hStr  = tpHouse ? ` (${tpHouse}하우스)` : '';
        const vStr  = { supportive:'기회·상승', challenging:'긴장·도전',
                        double_edged:'양면 에너지', neutral:'중립' }[valence] || '';

        events.push({
          id:        `tr_${tp.name}_${asp.angle}_${np.key}`,
          when:      whenStr,
          layer:     'impact',
          tier:      tp.tier,
          category,
          technique: `Transit ${tp.name} ${asp.name} natal ${np.key}`,
          bodies:    [tp.kr],
          house:     tpHouse,
          orb:       asp.orb,
          valence,
          fact:      `${whenStr} · 트랜짓 ${tp.kr} ${asp.sym} 나탈 ${np.kr}${hStr}. 오브 ${asp.orb}° — ${vStr}.`,
          importance: important ? 'major' : 'minor',
        });
      }
    }

    events.sort((a, b) => a.orb - b.orb);
    return events;
  }

  /* ─── 생애 주기 이벤트 ──────────────────────────────────── */
  function collectLifeCycle(birthYear, targetYear, natal) {
    const events = [];
    const age = targetYear - birthYear;

    /* 목성 귀환 ~12년 주기 */
    const nJup = natal.jupiter?.longitude;
    if (nJup != null) {
      const T = (calcJD(targetYear, 7, 1, 12) - 2451545) / 36525;
      const d = angDist(calcJupiter(T), nJup);
      if (d < 7) {
        const rn = Math.round(age / 12);
        events.push({
          id:`jupiter_return_${rn}`, when:`${targetYear}`,
          layer:'impact', tier:1, category:'wealth',
          technique:`Jupiter Return ${rn}차`,
          bodies:['목성'], house:natal.jupiter?.house ?? null,
          orb:Math.round(d * 10) / 10, valence:'supportive',
          fact:`목성 귀환 ${rn}차 (만 ${age}세). 목성이 출생 위치로 돌아오는 ~12년 성장 사이클 시작점. 새 확장·기회의 씨앗을 심는 해.`,
          importance:'minor',
        });
      }
    }

    /* 토성 리턴 ~29.5년 주기 */
    const nSat = natal.saturn?.longitude;
    if (nSat != null) {
      const T = (calcJD(targetYear, 7, 1, 12) - 2451545) / 36525;
      const d = angDist(calcSaturn(T), nSat);
      if (d < 8 && ((age >= 26 && age <= 33) || (age >= 56 && age <= 63))) {
        const rn = age < 45 ? 1 : 2;
        events.push({
          id:`saturn_return_${rn}`, when:`${targetYear}`,
          layer:'impact', tier:1, category:'general',
          technique:`Saturn Return ${rn}차`,
          bodies:['토성'], house:natal.saturn?.house ?? null,
          orb:Math.round(d * 10) / 10, valence:'double_edged',
          fact:`토성 귀환 ${rn}차 (만 ${age}세). 인생 구조 전면 재점검기. 책임·방향·성숙도를 압박하며 가장 힘들지만 가장 중요한 전환점.`,
          importance:'major',
        });
      }
    }

    /* 천왕성 대충 ~42세 */
    const nUra = natal.uranus?.longitude;
    if (nUra != null && age >= 38 && age <= 46) {
      const T      = (calcJD(targetYear, 7, 1, 12) - 2451545) / 36525;
      const oppLon = norm360(nUra + 180);
      const d      = angDist(calcUranus(T), oppLon);
      if (d < 6) {
        events.push({
          id:'uranus_opposition', when:`${targetYear}`,
          layer:'impact', tier:1, category:'general',
          technique:'Uranus Opposition (~42세 중년 전환)',
          bodies:['천왕성'], house:null,
          orb:Math.round(d * 10) / 10, valence:'double_edged',
          fact:`천왕성 대충 (만 ${age}세). 자유·진정성·독립에 대한 강렬한 내적 충동. 삶의 방향을 흔드는 중년 혁명 에너지.`,
          importance:'major',
        });
      }
    }

    return events;
  }

  /* ─── 프로그레션 달 신월/보름 탐색 ─────────────────────── */
  function collectProgMoonPhase(input, targetYear, natalJD) {
    if (!natalJD) return [];

    const [bY, bM, bD] = input.birthDate.split('-').map(Number);
    const [hh, mi]     = (input.birthTime || '12:00').split(':').map(Number);
    const utcOff       = input.utcOffset ?? 9;
    const birthUTC     = new Date(Date.UTC(bY, bM - 1, bD, hh, mi) - utcOff * 3600000);

    const events = [];
    let prevPhase = null, prevM = null;

    /* 13개월 스캔 (다음 해 1월 포함해 연말 전환 감지) */
    for (let m = 1; m <= 13; m++) {
      const yr2  = targetYear + (m > 12 ? 1 : 0);
      const mo2  = m > 12 ? 1 : m;
      const date = new Date(Date.UTC(yr2, mo2 - 1, 1));
      const days = (date - birthUTC) / 86400000;
      const T    = (natalJD + days / 365.25 - 2451545) / 36525;
      const phase = norm360(calcMoon(T) - calcSun(T));

      if (prevPhase !== null && m <= 12) {
        if (prevPhase > 340 && phase < 20) {
          events.push({
            id:`prog_new_${targetYear}_${prevM}`, when:`${targetYear}-${String(prevM).padStart(2,'0')}`,
            layer:'impact', tier:2, category:'general',
            technique:'Progressed New Moon',
            bodies:['프로그레션 달'], house:null, orb:null, valence:'double_edged',
            fact:`프로그레션 신월 (${targetYear}년 ${prevM}월경). ~29년 감정 사이클의 새 챕터 시작. 내면의 새 씨앗을 심는 전환점.`,
            importance:'major',
          });
        }
        if ((prevPhase < 180 && phase >= 180) || (prevPhase > 165 && prevPhase < 180 && phase > 175)) {
          events.push({
            id:`prog_full_${targetYear}_${prevM}`, when:`${targetYear}-${String(prevM).padStart(2,'0')}`,
            layer:'impact', tier:2, category:'general',
            technique:'Progressed Full Moon',
            bodies:['프로그레션 달'], house:null, orb:null, valence:'double_edged',
            fact:`프로그레션 보름달 (${targetYear}년 ${prevM}월경). 지난 ~14.5년간 심어온 것이 절정에 이르는 시점. 감정·관계의 클라이맥스.`,
            importance:'major',
          });
        }
      }
      prevPhase = phase; prevM = m;
    }
    return events;
  }

  /* ─── 일식·월식 이벤트 ──────────────────────────────────── */
  function getEclipseEvents(year, cusps) {
    return ECLIPSES.filter(e => e.year === year).map(e => {
      const house    = cusps ? getHouseOf(e.lon, cusps) : null;
      const typeKR   = e.type === 'solar' ? '일식' : '월식';
      const signKR   = SIGN_KR[Math.floor(norm360(e.lon) / 30)] || '';
      const deg      = Math.floor(e.lon % 30);
      const category = house ? (HOUSE_CAT[house] || 'general') : 'general';
      const hStr     = house ? `나탈 ${house}하우스(${HOUSE_THEME[house]}) 활성화. ` : '';
      return {
        id:`eclipse_${e.type}_${e.date}`,
        when:e.date,
        layer:'common', tier:1, category,
        technique:`${typeKR} (${signKR} ${deg}°)`,
        bodies: e.type === 'solar' ? ['태양','달'] : ['달'],
        house, orb:null, valence:'double_edged',
        fact:`${e.date} ${typeKR} — ${signKR} ${deg}°. ${hStr}일·월식은 해당 영역 주제의 전환·변화 신호.`,
        importance: house && [1,4,7,10].includes(house) ? 'major' : 'minor',
      };
    });
  }

  /* ─── 목성·토성 하우스 공통 이벤트 ─────────────────────── */
  function commonPlanetEvent(year, cusps, planetName, calcFn, planetKR, baseCat) {
    if (!cusps) return null;
    const positions = monthlyPos(year, calcFn);
    const rr = houseRangeResult(year, positions, cusps);
    if (!rr) return null;
    const { majorH, text } = rr;
    return {
      id:`common_${planetName}_${year}`, when:`${year}`,
      layer:'common', tier:1, category:HOUSE_CAT[majorH] || baseCat,
      technique:`Transit ${planetName} house position`,
      bodies:[planetKR], house:majorH, orb:null,
      valence:planetName === 'jupiter' ? 'supportive' : 'double_edged',
      fact:`${planetKR} 연간 위치 — ${text}. 핵심 주제: ${HOUSE_THEME[majorH] || ''}.`,
      importance:'minor',
    };
  }

  /* ─── 나탈 데이터 추출 ──────────────────────────────────── */
  function extractNatal(astroResult) {
    const p = k => astroResult.natal?.[k];
    return {
      sun:     p('sun'),
      moon:    p('moon'),
      venus:   p('venus'),
      mars:    p('mars'),
      jupiter: p('jupiter'),
      saturn:  p('saturn'),
      uranus:  p('uranus'),
      neptune: p('neptune'),
      pluto:   p('pluto'),
      asc:     astroResult.angles?.asc   ? { longitude:astroResult.angles.asc.longitude  } : null,
      mc:      astroResult.angles?.mc    ? { longitude:astroResult.angles.mc.longitude   } : null,
    };
  }

  /* ─── 메인 공개 함수 ─────────────────────────────────────── */
  function computeYearEvents(input, astroResult, targetYear) {
    if (!input?.birthDate || !astroResult) return null;

    const [bY, bM, bD] = input.birthDate.split('-').map(Number);
    const [hh, mi]     = (input.birthTime || '12:00').split(':').map(Number);
    const utcOff       = input.utcOffset ?? 9;
    const natalJD      = calcJD(bY, bM, bD, hh + mi / 60 - utcOff);

    const natal = extractNatal(astroResult);
    const cusps = astroResult.houses?.map(h => h.longitude) ?? null;

    const profection = calcProfection(bY, targetYear, cusps);

    const eclipses = getEclipseEvents(targetYear, cusps);

    const jupEvt = commonPlanetEvent(targetYear, cusps, 'jupiter', calcJupiter, '목성', 'wealth');
    const satEvt = commonPlanetEvent(targetYear, cusps, 'saturn',  calcSaturn,  '토성', 'career');
    const common = [
      ...eclipses,
      ...(jupEvt ? [jupEvt] : []),
      ...(satEvt ? [satEvt] : []),
    ];

    const impacts = [
      ...collectImpacts(targetYear, natal, cusps),
      ...collectLifeCycle(bY, targetYear, natal),
      ...collectProgMoonPhase(input, targetYear, natalJD),
    ];

    const all = [...common, ...impacts];

    /* 정렬: impact 먼저 → orb 오름차순 */
    all.sort((a, b) => {
      if (a.layer !== b.layer) return a.layer === 'impact' ? -1 : 1;
      return (a.orb ?? 99) - (b.orb ?? 99);
    });

    return {
      year: targetYear,
      profection,
      events:      all.filter(e => e.tier <= 2),
      speculative: all.filter(e => e.tier === 3),
    };
  }

  window.AstroEventsEngine = { computeYearEvents };
  console.log('✅ astro-events-engine.js v1.0 로드 완료');
})();
