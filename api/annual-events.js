import { applyCors } from './_cors.js';

/* =========================================================
   api/annual-events.js  v1.0
   연간운세 이벤트 엔진 — 서버사이드, ephemeris 정밀 계산
   ─────────────────────────────────────────────────────────
   astro-events-engine.js(클라이언트, VSOP87 축약식)를 대체하는
   서버 버전. 출력 스키마는 동일하게 유지한다:
     { year, profection, events: [...], speculative: [...] }
   각 이벤트: { id, when, layer, tier, category, technique,
               bodies, house, orb, valence, fact, importance }

   변경점:
   - 트랜짓 행성 위치를 ephemeris(Moshier) 패키지로 계산
     (astro-calc.js / astro-solar-return.js와 동일 소스 — 두 화면 간
     행성 위치 불일치 제거).
   - 트랜짓 임팩트·생애주기 리턴의 "when"을 월 근사 대신
     일/시간 단위로 정밀화(거친 스캔 → 구간별 극값 정밀화).
   - 해당 targetYear의 솔라리턴 사실(ASC 사인·태양 나탈 하우스·
     SR-나탈 타이트 에스펙트 top3)을 layer:'common' 이벤트로 추가.

   범위 밖(작업지시서 0절): 사주 통합 안 함, 일식 표 확장 안 함
   (2030 월식 데이터는 검증된 출처가 없어 추가하지 않음 — 5절 참조).
   ========================================================= */

import Ephemeris from 'ephemeris';

/* ─── 공통 유틸 ─────────────────────────────────────────── */
function norm360(a) { return ((a % 360) + 360) % 360; }
function rad(d)     { return d * Math.PI / 180; }

function angDist(a, b) {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
}

function calcJulianDay(y, m, d, utcHour = 0) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + utcHour / 24 + B - 1524.5;
}

const SIGNS = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
               '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];

function toSignInfo(lon) {
  const norm    = norm360(lon);
  const signIdx = Math.floor(norm / 30);
  const degree  = norm % 30;
  return {
    longitude: norm,
    sign:      SIGNS[signIdx],
    signIndex: signIdx,
    degree:    Math.floor(degree),
    minute:    Math.floor((degree % 1) * 60),
  };
}

const PLANET_KEYS = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];
const PLANET_KR   = {
  sun:'태양', moon:'달', mercury:'수성', venus:'금성', mars:'화성',
  jupiter:'목성', saturn:'토성', uranus:'천왕성', neptune:'해왕성', pluto:'명왕성'
};

function getHouseOf(lon, cusps) {
  const n = norm360(lon);
  for (let i = 0; i < 12; i++) {
    const s = cusps[i], e = cusps[(i + 1) % 12];
    if (s > e) { if (n >= s || n < e) return i + 1; }
    else        { if (n >= s && n < e) return i + 1; }
  }
  return 12;
}

/* ─── ephemeris 행성 황경 (lng/lat는 황경 계산엔 영향 없음 — 위치권장값 사용) ─── */
function makeLonAt(refLng, refLat) {
  return function lonAt(date, planetKey) {
    const raw = Ephemeris.getAllPlanets(date, refLng, refLat, 0);
    return norm360(raw.observed[planetKey].apparentLongitudeDd);
  };
}

/* ─── 노드(평균 교점) — astro-calc.js / astro-solar-return.js와 동일 공식 ─── */
function calcLunarNodes(jd) {
  const T     = (jd - 2451545.0) / 36525.0;
  const omega = norm360(125.04452 - 1934.136261 * T + 0.0020708 * T * T);
  const northLon = omega;
  const bml = norm360(
    83.3532465 + 4069.0137287 * T - 0.0103200 * T * T
    - T * T * T / 80053 + T * T * T * T / 18999000
  );
  const southLon = norm360(bml + 180);
  return { northLon, southLon };
}

/* ─── Placidus 하우스 — astro-calc.js / astro-solar-return.js와 동일 공식 ─── */
function calcHousesPlacidus(jd, lat, lng) {
  const T = (jd - 2451545.0) / 36525.0;
  const GMST = norm360(
    280.46061837 + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T - (T * T * T) / 38710000.0
  );
  const RAMC = norm360(GMST + lng);
  const eps  = 23.4392911 - 0.013004167 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
  const epsR = rad(eps);
  const latR = rad(lat);

  const mc_raw = Math.atan(Math.tan(rad(RAMC)) / Math.cos(epsR)) * 180 / Math.PI;
  const mc     = norm360(Math.cos(rad(RAMC)) < 0 ? mc_raw + 180 : mc_raw);
  const asc    = norm360(
    Math.atan2(Math.cos(rad(RAMC)), -(Math.sin(epsR) * Math.tan(latR) + Math.cos(epsR) * Math.sin(rad(RAMC)))) * 180 / Math.PI
  );

  function raDecToEcl(ra_deg, dec_deg) {
    const aR = rad(ra_deg), dR = rad(dec_deg);
    return norm360(Math.atan2(Math.sin(aR) * Math.cos(epsR) + Math.tan(dR) * Math.sin(epsR), Math.cos(aR)) * 180 / Math.PI);
  }

  const IC_RAMC = norm360(RAMC + 180);

  function getCuspUpper(frac) {
    let ra = norm360(RAMC + frac * 180);
    for (let i = 0; i < 100; i++) {
      const decR = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR));
      const cosH = -Math.tan(latR) * Math.tan(decR);
      if (cosH > 1)  { ra = norm360(RAMC);       break; }
      if (cosH < -1) { ra = norm360(RAMC + 180); break; }
      const H     = Math.acos(cosH) * 180 / Math.PI;
      const newRA = norm360(RAMC + frac * H);
      if (Math.abs(newRA - ra) < 0.00001) break;
      ra = (ra + newRA) / 2;
    }
    const decDeg = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR)) * 180 / Math.PI;
    return raDecToEcl(ra, decDeg);
  }

  function getCuspLower(frac) {
    let ra = norm360(IC_RAMC - frac * 180);
    for (let i = 0; i < 100; i++) {
      const decR = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR));
      const cosH = -Math.tan(latR) * Math.tan(decR);
      if (cosH > 1)  { ra = norm360(IC_RAMC);       break; }
      if (cosH < -1) { ra = norm360(IC_RAMC + 180); break; }
      const NSA   = 180 - Math.acos(cosH) * 180 / Math.PI;
      const newRA = norm360(IC_RAMC - frac * NSA);
      if (Math.abs(newRA - ra) < 0.00001) break;
      ra = (ra + newRA) / 2;
    }
    const decDeg = Math.asin(Math.sin(rad(ra)) * Math.sin(epsR)) * 180 / Math.PI;
    return raDecToEcl(ra, decDeg);
  }

  const c11 = getCuspUpper(1/3), c12 = getCuspUpper(2/3);
  const cA  = getCuspLower(1/3), cB  = getCuspLower(2/3);

  return {
    asc, mc,
    houses: [asc, cB, cA, norm360(mc + 180), norm360(c11 + 180), norm360(c12 + 180),
              norm360(asc + 180), norm360(cB + 180), norm360(cA + 180), mc, c11, c12],
  };
}

/* ─── 에스펙트 — astro-solar-return.js와 동일 정의/방식 ─── */
const ASPECT_DEFS = [
  { name: '컨정션',  angle:   0, orb: 8, symbol: '☌' },
  { name: '섹스타일',angle:  60, orb: 4, symbol: '⚹' },
  { name: '트라인',  angle: 120, orb: 6, symbol: '△' },
  { name: '스퀘어',  angle:  90, orb: 6, symbol: '□' },
  { name: '어포지션',angle: 180, orb: 8, symbol: '☍' },
];

function signedAngularDiff(lonA, lonB) {
  let diff = norm360(lonB) - norm360(lonA);
  if (diff > 180)  diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

function buildAspectPoints(planets, asc, mc, northLon, southLon) {
  return [
    ...PLANET_KEYS.map(k => ({ key: k, label: PLANET_KR[k], lon: planets[k].lon })),
    { key: 'asc', label: 'ASC', lon: asc },
    { key: 'mc',  label: 'MC',  lon: mc },
    { key: 'northNode', label: '북노드(☊)', lon: northLon },
    { key: 'southNode', label: '릴리스(☋)', lon: southLon },
  ];
}

function buildPointsFromChart(natal, angles, nodes) {
  return [
    ...PLANET_KEYS.map(k => ({ key: k, label: PLANET_KR[k], lon: natal[k].longitude })),
    { key: 'asc', label: 'ASC', lon: angles.asc.longitude },
    { key: 'mc',  label: 'MC',  lon: angles.mc.longitude },
    { key: 'northNode', label: '북노드(☊)', lon: nodes.north.longitude },
    { key: 'southNode', label: '릴리스(☋)', lon: nodes.south.longitude },
  ];
}

function calcAllAspects(pointsA, pointsB, opts = {}) {
  const { sameSet = false, labelPrefixA = '', labelPrefixB = '' } = opts;
  const aspects = [];
  function tryPush(p1, p2, prefix1, prefix2) {
    const dist = angDist(p1.lon, p2.lon);
    for (const asp of ASPECT_DEFS) {
      const diff = Math.abs(dist - asp.angle);
      if (diff <= asp.orb) {
        const signed   = signedAngularDiff(p1.lon, p2.lon);
        const applying = signed > 0 ? dist < asp.angle : dist > asp.angle;
        aspects.push({ point1: prefix1 + p1.label, point2: prefix2 + p2.label,
          aspect: asp.name, symbol: asp.symbol, orb: Math.round(diff * 10) / 10, applying });
      }
    }
  }
  if (sameSet) {
    for (let i = 0; i < pointsA.length; i++)
      for (let j = i + 1; j < pointsA.length; j++) tryPush(pointsA[i], pointsA[j], labelPrefixA, labelPrefixA);
  } else {
    for (const p1 of pointsA) for (const p2 of pointsB) tryPush(p1, p2, labelPrefixA, labelPrefixB);
  }
  return aspects.sort((a, b) => a.orb - b.orb);
}

/* ─── 상수: 하우스 테마, 사인 지배성 ─────────────────────── */
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
const SIGN_RULER_KR = ['화성','금성','수성','달','태양','수성','금성','화성','목성','토성','토성','목성'];

/* ─── 일식·월식 표 — astro-events-engine.js와 동일(확장 안 함) ───
   주의: 2030년은 일식 2건만 등록되어 있고 월식 데이터가 없다.
   검증된 천문 출처가 없어 이번 작업에서는 추가하지 않음(작업지시서 5절). */
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

function getEclipseEvents(year, cusps) {
  return ECLIPSES.filter(e => e.year === year).map(e => {
    const house    = getHouseOf(e.lon, cusps);
    const typeKR   = e.type === 'solar' ? '일식' : '월식';
    const signKR   = SIGNS[Math.floor(norm360(e.lon) / 30)] || '';
    const deg      = Math.floor(e.lon % 30);
    const category = HOUSE_CAT[house] || 'general';
    const hStr      = `나탈 ${house}하우스(${HOUSE_THEME[house]}) 활성화. `;
    return {
      id:`eclipse_${e.type}_${e.date}`, when:e.date,
      layer:'common', tier:1, category,
      technique:`${typeKR} (${signKR} ${deg}°)`,
      bodies: e.type === 'solar' ? ['태양','달'] : ['달'],
      house, orb:null, valence:'double_edged',
      fact:`${e.date} ${typeKR} — ${signKR} ${deg}°. ${hStr}일·월식은 해당 영역 주제의 전환·변화 신호.`,
      importance: [1,4,7,10].includes(house) ? 'major' : 'minor',
    };
  });
}

/* ─── 프로펙션 — 변경 없음(포팅) ───────────────────────── */
function calcProfection(birthYear, targetYear, cusps) {
  const age   = targetYear - birthYear;
  const house = (age % 12) + 1;
  const theme = HOUSE_THEME[house] || '';
  const signIdx = Math.floor(norm360(cusps[house - 1]) / 30);
  const lord = SIGN_RULER_KR[signIdx] || '알 수 없음';
  return { house, theme, lord, age };
}

/* ─── 거친 스캔 + 구간별 극값 정밀화로 트랜짓 근접일 찾기 ───
   calcLon(date): 그 시각의 트랜짓 행성 황경.
   natalLon: 비교할 나탈 포인트 황경. aspectAngle/orb: 에스펙트 각/허용오차.
   stepDays: 거친 스캔 간격(외행성은 느리므로 3일이면 1.5°오브도 놓치지 않음).
   반환: [{ date, orb }] 오브 이내로 근접한 모든 시점(역행 등으로 여러 번 가능). */
function findClosestApproaches(year, calcLon, natalLon, aspectAngle, orb, stepDays = 3) {
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd   = Date.UTC(year, 11, 31, 23, 59, 59);
  const stepMs    = stepDays * 86400000;

  const samples = [];
  for (let t = yearStart; t <= yearEnd; t += stepMs) {
    const d = Math.abs(angDist(calcLon(new Date(t)), natalLon) - aspectAngle);
    samples.push({ t, d });
  }

  const candidates = [];
  for (let i = 0; i < samples.length; i++) {
    const cur = samples[i], prev = samples[i - 1], next = samples[i + 1];
    const isLocalMin = (!prev || cur.d <= prev.d) && (!next || cur.d <= next.d);
    if (isLocalMin && cur.d <= orb + 1.0) candidates.push(cur.t);
  }

  const results = [];
  for (const center of candidates) {
    let lo = center - stepMs, hi = center + stepMs;
    for (let i = 0; i < 20; i++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      const d1 = Math.abs(angDist(calcLon(new Date(m1)), natalLon) - aspectAngle);
      const d2 = Math.abs(angDist(calcLon(new Date(m2)), natalLon) - aspectAngle);
      if (d1 < d2) hi = m2; else lo = m1;
    }
    const bestT = (lo + hi) / 2;
    const bestD = Math.abs(angDist(calcLon(new Date(bestT)), natalLon) - aspectAngle);
    if (bestD <= orb) results.push({ date: new Date(bestT), orb: Math.round(bestD * 10) / 10 });
  }
  return results;
}

function fmtWhen(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/* ─── 발란스/카테고리 헬퍼 — 변경 없음(포팅) ─────────────── */
function resolveValence(planetName, aspAngle) {
  if (planetName === 'jupiter') return aspAngle === 90 || aspAngle === 180 ? 'double_edged' : 'supportive';
  if (planetName === 'saturn')  return aspAngle === 120 || aspAngle === 60 ? 'double_edged' : 'challenging';
  return 'double_edged';
}
function resolveCategory(natalKey) {
  return { mc:'career', saturn:'career', venus:'relationship', moon:'family', jupiter:'wealth' }[natalKey] || 'general';
}

/* ─── 트랜짓 외행성 × 나탈 포인트 임팩트 이벤트 ──────────── */
const ASPECTS_TIGHT = [
  { angle:   0, name:'컨정션',   sym:'☌', orb:2.5 },
  { angle:  60, name:'섹스타일', sym:'⚹', orb:1.5 },
  { angle:  90, name:'스퀘어',   sym:'□', orb:2.5 },
  { angle: 120, name:'트라인',   sym:'△', orb:2.0 },
  { angle: 180, name:'어포지션', sym:'☍', orb:2.5 },
];

function collectImpacts(year, lonAt, natal, cusps) {
  const TRANSIT = [
    { name:'jupiter', kr:'목성',   tier:1 },
    { name:'saturn',  kr:'토성',   tier:1 },
    { name:'uranus',  kr:'천왕성', tier:1 },
    { name:'neptune', kr:'해왕성', tier:2 },
    { name:'pluto',   kr:'명왕성', tier:1 },
  ];
  const NAT_PTS = [
    { key:'sun', kr:'태양' }, { key:'moon', kr:'달' }, { key:'asc', kr:'ASC' }, { key:'mc', kr:'MC' },
    { key:'venus', kr:'금성' }, { key:'jupiter', kr:'목성' }, { key:'saturn', kr:'토성' },
  ];

  const events = [];
  for (const tp of TRANSIT) {
    const calcLon = (date) => lonAt(date, tp.name);
    for (const np of NAT_PTS) {
      const nLon = natal[np.key]?.longitude;
      if (nLon == null || isNaN(nLon)) continue;

      for (const asp of ASPECTS_TIGHT) {
        const hits = findClosestApproaches(year, calcLon, nLon, asp.angle, asp.orb);
        if (!hits.length) continue;

        // 같은 (트랜짓 행성·어스펙트·나탈 포인트) 조합이 한 해에 여러 번 잡히면(주로 외행성
        // 역행으로 같은 지점을 다시 지나갈 때) 별개 사건이 아니라 "한 흐름이 여러 번 정점을
        // 찍는다"는 하나의 사건으로 합친다 — 따로 두면 같은 이야기가 사건 개수만큼 반복된다.
        const sortedByDate = [...hits].sort((a, b) => a.date - b.date);
        const tightest     = [...hits].sort((a, b) => a.orb - b.orb)[0];
        const tpHouse       = getHouseOf(calcLon(tightest.date), cusps);
        const valence   = resolveValence(tp.name, asp.angle);
        const category  = resolveCategory(np.key);
        const important = ['sun','moon','asc','mc'].includes(np.key) && [0, 90, 180].includes(asp.angle);
        const vStr  = { supportive:'기회·상승', challenging:'긴장·도전', double_edged:'양면 에너지', neutral:'중립' }[valence] || '';
        const whenStr = fmtWhen(tightest.date);

        const factStr = sortedByDate.length === 1
          ? `${whenStr} · 트랜짓 ${tp.kr} ${asp.sym} 나탈 ${np.kr} (${tpHouse}하우스). 오브 ${tightest.orb}° — ${vStr}.`
          : `${sortedByDate.map(h => fmtWhen(h.date)).join(', ')} · 트랜짓 ${tp.kr} ${asp.sym} 나탈 ${np.kr} (${tpHouse}하우스)이 한 해 동안 ${sortedByDate.length}번 정점을 찍는 하나의 흐름(역행으로 같은 지점을 반복해서 지나감). 가장 타이트한 시점은 ${whenStr}, 오브 ${tightest.orb}° — ${vStr}.`;

        events.push({
          id: `tr_${tp.name}_${asp.angle}_${np.key}_${whenStr}`,
          when: whenStr, layer:'impact', tier: tp.tier, category,
          technique: `Transit ${tp.name} ${asp.name} natal ${np.key}`,
          bodies: [tp.kr], house: tpHouse, orb: tightest.orb, valence,
          fact: factStr,
          importance: important ? 'major' : 'minor',
          peakDates: sortedByDate.map(h => fmtWhen(h.date)),
        });
      }
    }
  }
  events.sort((a, b) => a.orb - b.orb);
  return events;
}

/* ─── 생애주기 리턴(목성/토성/천왕성) — ephemeris 정밀 + 정확 일자 ─── */
function collectLifeCycle(birthYear, targetYear, lonAt, natal) {
  const events = [];
  const age = targetYear - birthYear;

  const nJup = natal.jupiter?.longitude;
  if (nJup != null) {
    const hits = findClosestApproaches(targetYear, (d) => lonAt(d, 'jupiter'), nJup, 0, 7);
    if (hits.length) {
      const best = hits.sort((a, b) => a.orb - b.orb)[0];
      const rn = Math.round(age / 12);
      events.push({
        id:`jupiter_return_${rn}_${targetYear}`, when: fmtWhen(best.date),
        layer:'impact', tier:1, category:'wealth', technique:`Jupiter Return ${rn}차`,
        bodies:['목성'], house: natal.jupiter?.house ?? null, orb: best.orb, valence:'supportive',
        fact:`목성 귀환 ${rn}차 (만 ${age}세). 목성이 출생 위치로 돌아오는 ~12년 성장 사이클 시작점. 새 확장·기회의 씨앗을 심는 해.`,
        importance:'minor',
      });
    }
  }

  const nSat = natal.saturn?.longitude;
  if (nSat != null && ((age >= 26 && age <= 33) || (age >= 56 && age <= 63))) {
    const hits = findClosestApproaches(targetYear, (d) => lonAt(d, 'saturn'), nSat, 0, 5);
    if (hits.length) {
      const best = hits.sort((a, b) => a.orb - b.orb)[0];
      const rn = age < 45 ? 1 : 2;
      events.push({
        id:`saturn_return_${rn}_${targetYear}`, when: fmtWhen(best.date),
        layer:'impact', tier:1, category:'general', technique:`Saturn Return ${rn}차`,
        bodies:['토성'], house: natal.saturn?.house ?? null, orb: best.orb, valence:'double_edged',
        fact:`토성 귀환 ${rn}차 (만 ${age}세). 인생 구조 전면 재점검기. 책임·방향·성숙도를 압박하며 가장 힘들지만 가장 중요한 전환점.`,
        importance:'major',
      });
    }
  }

  const nUra = natal.uranus?.longitude;
  if (nUra != null && age >= 38 && age <= 46) {
    const oppLon = norm360(nUra + 180);
    const hits = findClosestApproaches(targetYear, (d) => lonAt(d, 'uranus'), oppLon, 0, 5);
    if (hits.length) {
      const best = hits.sort((a, b) => a.orb - b.orb)[0];
      events.push({
        id:`uranus_opposition_${targetYear}`, when: fmtWhen(best.date),
        layer:'impact', tier:1, category:'general', technique:'Uranus Opposition (~42세 중년 전환)',
        bodies:['천왕성'], house:null, orb: best.orb, valence:'double_edged',
        fact:`천왕성 대충 (만 ${age}세). 자유·진정성·독립에 대한 강렬한 내적 충동. 삶의 방향을 흔드는 중년 혁명 에너지.`,
        importance:'major',
      });
    }
  }
  return events;
}

/* ─── 프로그레션 달 신월/보름 — ephemeris 정밀 + 일 단위 bisection ─── */
function collectProgMoonPhase(meta, targetYear, lonAt) {
  const [bY, bM, bD] = meta.birthDate.split('-').map(Number);
  const [hh, mi]     = (meta.birthTime || '12:00').split(':').map(Number);
  const utcOff       = meta.utcOffset ?? 9;
  const birthUTC     = new Date(Date.UTC(bY, bM - 1, bD, hh, mi) - utcOff * 3600000);

  function phaseAtDay(yr, mo, day) {
    const date = new Date(Date.UTC(yr, mo - 1, day));
    const elapsedDays = (date - birthUTC) / 86400000;
    const progDate = new Date(birthUTC.getTime() + elapsedDays / 365.25 * 86400000);
    return norm360(lonAt(progDate, 'moon') - lonAt(progDate, 'sun'));
  }

  const events = [];
  let prevPhase = null, prevDate = null;

  for (let d = 0; d <= 396; d++) {
    const date = new Date(Date.UTC(targetYear, 0, 1) + d * 86400000);
    const yr = date.getUTCFullYear(), mo = date.getUTCMonth() + 1, day = date.getUTCDate();
    if (yr > targetYear + 1) break;
    const phase = phaseAtDay(yr, mo, day);

    if (prevPhase !== null && yr === targetYear) {
      const crossedNew  = prevPhase > 340 && phase < 20;
      const crossedFull = (prevPhase < 180 && phase >= 180);
      if (crossedNew || crossedFull) {
        // 전날~오늘 사이를 이분법으로 정밀화(위상이 단조 증가하므로 root-find 가능)
        let lo = prevDate.getTime(), hi = date.getTime();
        const target = crossedNew ? 360 : 180;
        for (let i = 0; i < 20; i++) {
          const mid = (lo + hi) / 2;
          const midYr = new Date(mid).getUTCFullYear(), midMo = new Date(mid).getUTCMonth() + 1, midDay = new Date(mid).getUTCDate();
          let p = phaseAtDay(midYr, midMo, midDay);
          if (crossedNew && p < 180) p += 360; // 0 근처 랩어라운드 보정
          if (p < target) lo = mid; else hi = mid;
        }
        const exact = new Date((lo + hi) / 2);
        const whenStr = fmtWhen(exact);
        if (crossedNew) {
          events.push({
            id:`prog_new_${targetYear}_${whenStr}`, when: whenStr.slice(0, 7),
            layer:'impact', tier:2, category:'general', technique:'Progressed New Moon',
            bodies:['프로그레션 달'], house:null, orb:null, valence:'double_edged',
            fact:`프로그레션 신월 (${whenStr}경). ~29년 감정 사이클의 새 챕터 시작. 내면의 새 씨앗을 심는 전환점.`,
            importance:'major',
          });
        } else {
          events.push({
            id:`prog_full_${targetYear}_${whenStr}`, when: whenStr.slice(0, 7),
            layer:'impact', tier:2, category:'general', technique:'Progressed Full Moon',
            bodies:['프로그레션 달'], house:null, orb:null, valence:'double_edged',
            fact:`프로그레션 보름달 (${whenStr}경). 지난 ~14.5년간 심어온 것이 절정에 이르는 시점. 감정·관계의 클라이맥스.`,
            importance:'major',
          });
        }
      }
    }
    prevPhase = phase; prevDate = date;
  }
  return events;
}

/* ─── 프로그레션 인격행성 사인 진입(ingress) — 1일=1년 기법, ephemeris 정밀 ───
   대상: 태양·수성·금성·화성(인격행성). 달·외행성은 이번 단계에서 제외:
   - 달은 진행 속도가 빨라(연 ~13°) 한 해에 여러 번 사인을 넘어 "희귀한 전환점"
     이라는 의미가 옅음(별도 후속 검토 대상).
   - 목성~명왕성은 진행 속도가 너무 느려(연 0.01~0.3°) 인간 생애 동안 사인을
     거의 넘지 않음.
   태양의 사인 진입은 평생 한두 번뿐인 약 28~30년 주기 인생 챕터 전환점이라
   importance:'major'로 두고, 나머지(수성·금성·화성)는 'minor'로 둔다. */
function collectProgIngress(meta, targetYear, lonAt) {
  const [bY, bM, bD] = meta.birthDate.split('-').map(Number);
  const [hh, mi]     = (meta.birthTime || '12:00').split(':').map(Number);
  const utcOff       = meta.utcOffset ?? 9;
  const birthUTC     = new Date(Date.UTC(bY, bM - 1, bD, hh, mi) - utcOff * 3600000);

  function progLon(realDate, key) {
    const elapsedDays = (realDate - birthUTC) / 86400000;
    const progDate    = new Date(birthUTC.getTime() + elapsedDays / 365.25 * 86400000);
    return lonAt(progDate, key);
  }

  const TARGETS = [
    { key:'sun',     kr:'태양', importance:'major' },
    { key:'mercury', kr:'수성', importance:'minor' },
    { key:'venus',   kr:'금성', importance:'minor' },
    { key:'mars',    kr:'화성', importance:'minor' },
  ];

  const yearStart = new Date(Date.UTC(targetYear, 0, 1));
  const yearEnd   = new Date(Date.UTC(targetYear, 11, 31));

  const events = [];
  for (const t of TARGETS) {
    const signStart = Math.floor(norm360(progLon(yearStart, t.key)) / 30);
    const signEnd   = Math.floor(norm360(progLon(yearEnd, t.key)) / 30);
    if (signStart === signEnd) continue; // 그 해엔 사인 진입 없음

    // 연초~연말 사이를 이분법으로 정밀화해 경계를 넘는 정확한 날짜를 찾는다
    let lo = yearStart.getTime(), hi = yearEnd.getTime();
    for (let i = 0; i < 25; i++) {
      const mid = (lo + hi) / 2;
      const midSign = Math.floor(norm360(progLon(new Date(mid), t.key)) / 30);
      if (midSign === signStart) lo = mid; else hi = mid;
    }
    const exact   = new Date((lo + hi) / 2);
    const whenStr = fmtWhen(exact);
    const fromSign = SIGNS[signStart];
    const toSign   = SIGNS[signEnd];
    const isSun    = t.key === 'sun';

    events.push({
      id: `prog_ingress_${t.key}_${targetYear}`,
      when: whenStr, layer:'impact', tier: isSun ? 1 : 2, category:'general',
      technique: `Progressed ${t.key} sign ingress`,
      bodies: [`프로그레션 ${t.kr}`], house: null, orb: null, valence:'double_edged',
      fact: isSun
        ? `${whenStr} 프로그레션 태양이 ${fromSign}에서 ${toSign}로 진입. 약 28~30년에 한 번, 평생 한두 번뿐인 정체성·삶의 방향 전환점.`
        : `${whenStr} 프로그레션 ${t.kr}이 ${fromSign}에서 ${toSign}로 진입. 내면의 동기·태도가 점진적으로 바뀌는 시점.`,
      importance: t.importance,
    });
  }
  return events;
}

/* ─── 목성·토성 연간 하우스 위치(공통 배경) — ephemeris 정밀 ─── */
function commonPlanetEvent(year, cusps, planetName, lonAt, planetKR, baseCat) {
  const bm = [];
  for (let m = 1; m <= 12; m++) {
    const date = new Date(Date.UTC(year, m - 1, 15, 12));
    bm.push({ m, h: getHouseOf(lonAt(date, planetName), cusps) });
  }
  const segs = [];
  let cur = bm[0], start = 1;
  for (let i = 1; i < bm.length; i++) {
    if (bm[i].h !== cur.h) { segs.push({ h: cur.h, from: start, to: i }); cur = bm[i]; start = i + 1; }
  }
  segs.push({ h: cur.h, from: start, to: 12 });
  const majorSeg = segs.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a), segs[0]);
  segs.sort((a, b) => a.from - b.from);
  const text = segs.length === 1
    ? `${year}년 내내 ${segs[0].h}하우스`
    : segs.map(s => `${s.from}~${s.to}월 ${s.h}하우스`).join(' → ');

  return {
    id:`common_${planetName}_${year}`, when:`${year}`,
    layer:'common', tier:1, category: HOUSE_CAT[majorSeg.h] || baseCat,
    technique:`Transit ${planetName} house position`,
    bodies:[planetKR], house: majorSeg.h, orb:null,
    valence: planetName === 'jupiter' ? 'supportive' : 'double_edged',
    fact:`${planetKR} 연간 위치 — ${text}. 핵심 주제: ${HOUSE_THEME[majorSeg.h] || ''}.`,
    importance:'minor',
  };
}

/* ─── 솔라리턴 사실 추출 — astro-solar-return.js의 findReturn 로직 포팅 ───
   화면(차트)을 옮기는 게 아니라, 그 해 SR의 ASC 사인·태양 나탈 하우스·
   SR↔나탈 타이트 에스펙트 top3 "사실"만 뽑아 연간 이벤트 스키마로 만든다. */
function buildSolarReturnEvents(birthUTC, lng, lat, natal, angles, nodes, houses, targetYear) {
  const natalHouseLons = houses.map(h => h.longitude);
  const lonAt = makeLonAt(lng, lat);
  const natalSunLon = lonAt(birthUTC, 'sun');
  const age = targetYear - birthUTC.getUTCFullYear();
  if (age < 0) return [];

  function signedDiff(a, b) {
    let d = (a - b) % 360;
    if (d <= -180) d += 360;
    if (d > 180)   d -= 360;
    return d;
  }

  const guessMs = birthUTC.getTime() + age * 365.25 * 86400000;
  let lo = guessMs - 3 * 86400000, hi = guessMs + 3 * 86400000;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const diff = signedDiff(lonAt(new Date(mid), 'sun'), natalSunLon);
    if (diff < 0) lo = mid; else hi = mid;
  }
  const srDate = new Date((lo + hi) / 2);
  const srY = srDate.getUTCFullYear(), srM = srDate.getUTCMonth() + 1, srD = srDate.getUTCDate();
  const srHr = srDate.getUTCHours() + srDate.getUTCMinutes() / 60;
  const srJD = calcJulianDay(srY, srM, srD, srHr);

  const srRaw = Ephemeris.getAllPlanets(srDate, lng, lat, 0);
  const srPlanets = {};
  PLANET_KEYS.forEach(k => { srPlanets[k] = { lon: norm360(srRaw.observed[k].apparentLongitudeDd) }; });

  const { asc: srAsc, mc: srMc } = calcHousesPlacidus(srJD, lat, lng);
  const { northLon: srNorth, southLon: srSouth } = calcLunarNodes(srJD);

  const srSunHouse = getHouseOf(srPlanets.sun.lon, natalHouseLons);
  const ascSignInfo = toSignInfo(srAsc);

  const srPoints    = buildAspectPoints(srPlanets, srAsc, srMc, srNorth, srSouth);
  const natalPoints = buildPointsFromChart(natal, angles, nodes);
  const aspectsToNatal = calcAllAspects(srPoints, natalPoints, { labelPrefixA: '솔라리턴 ', labelPrefixB: '네이탈 ' })
    .sort((a, b) => a.orb - b.orb)
    .slice(0, 3);

  const whenStr = fmtWhen(srDate);
  const events = [{
    id: `solar_return_${targetYear}`, when: whenStr,
    layer: 'common', tier: 1, category: 'general',
    technique: 'Solar Return',
    bodies: ['태양'], house: srSunHouse, orb: null, valence: 'neutral',
    fact: `${whenStr} 솔라리턴 — 그 해의 어센던트는 ${ascSignInfo.sign}, 태양은 나탈 ${srSunHouse}하우스(${HOUSE_THEME[srSunHouse]})에 위치. `
      + `이 해 전체의 분위기와 에너지가 집중되는 영역을 보여주는 1년 단위 회귀점.`,
    importance: 'major',
  }];

  if (aspectsToNatal.length) {
    const aspText = aspectsToNatal.map(a => `${a.point1}↔${a.point2}(오브 ${a.orb}°)`).join(', ');
    events.push({
      id: `solar_return_aspects_${targetYear}`, when: whenStr,
      layer: 'common', tier: 1, category: 'general',
      technique: 'Solar Return aspects to natal',
      bodies: ['태양'], house: srSunHouse, orb: aspectsToNatal[0].orb, valence: 'double_edged',
      fact: `솔라리턴 차트가 나탈과 가장 타이트하게 맞물리는 지점: ${aspText}. 이 연결이 그 해 SR이 삶에 가장 직접적으로 건드리는 부분.`,
      importance: 'minor',
    });
  }
  return events;
}

/* ─── 행성별 연중 역행 구간(시작~종료일) — 인격행성만(수성·금성·화성) ───
   외행성(목성~명왕성)은 해마다 4~5개월씩 거의 항상 역행 중이라 "특별한
   시기"라는 의미가 옅고, 목성·토성은 commonPlanetEvent로 이미 연간 배경을
   다루고 있어 이번 단계에서는 인격행성만 다룬다.
   역행 시작/종료 = 황경 변화 속도(velocity)의 부호가 바뀌는 station 지점.
   연도 경계를 걸치는 구간도 잡기 위해 전후 100일 여유를 두고 스캔한다
   (화성 역행은 최장 ~80일까지 가므로 안전 마진 확보). */
function collectRetrogradeWindows(targetYear, lonAt) {
  const RETRO_PLANETS = [
    { key:'mercury', kr:'수성' },
    { key:'venus',   kr:'금성' },
    { key:'mars',    kr:'화성' },
  ];

  function velocity(date, key) {
    const a = lonAt(new Date(date.getTime() - 43200000), key); // -12h
    const b = lonAt(new Date(date.getTime() + 43200000), key); // +12h
    let d = b - a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d; // >0 순행, <0 역행
  }

  const scanStart = Date.UTC(targetYear, 0, 1) - 100 * 86400000;
  const scanEnd   = Date.UTC(targetYear, 11, 31) + 100 * 86400000;
  const stepMs    = 4 * 86400000;
  const yearStart = new Date(Date.UTC(targetYear, 0, 1));
  const yearEnd   = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59));

  const events = [];
  for (const p of RETRO_PLANETS) {
    const stations = [];
    let prevV = velocity(new Date(scanStart), p.key);
    for (let t = scanStart + stepMs; t <= scanEnd; t += stepMs) {
      const v = velocity(new Date(t), p.key);
      if ((prevV >= 0) !== (v >= 0)) {
        let lo = t - stepMs, hi = t;
        for (let i = 0; i < 25; i++) {
          const mid = (lo + hi) / 2;
          const vm = velocity(new Date(mid), p.key);
          if ((vm >= 0) === (prevV >= 0)) lo = mid; else hi = mid;
        }
        stations.push({ date: new Date((lo + hi) / 2), type: prevV >= 0 ? 'retroStart' : 'retroEnd' });
      }
      prevV = v;
    }

    for (let i = 0; i < stations.length; i++) {
      if (stations[i].type !== 'retroStart') continue;
      const next = stations[i + 1];
      if (!next || next.type !== 'retroEnd') continue;
      const startDate = stations[i].date, endDate = next.date;
      if (endDate < yearStart || startDate > yearEnd) continue; // 그 해와 안 겹치면 제외

      const whenStr = fmtWhen(startDate);
      events.push({
        id: `retrograde_${p.key}_${whenStr}`,
        when: whenStr, layer:'common', tier:2, category:'general',
        technique: `${p.key} retrograde`,
        bodies: [p.kr], house:null, orb:null, valence:'double_edged',
        fact: `${fmtWhen(startDate)} ~ ${fmtWhen(endDate)} ${p.kr} 역행. 이 구간엔 일이 더디게 풀리거나 이미 정한 결정을 다시 들여다보게 되는 경우가 잦다 — 새로 시작하기보다 점검·재검토·마무리에 쓰면 수월하다.`,
        importance: 'minor',
        retroStart: fmtWhen(startDate),
        retroEnd:   fmtWhen(endDate),
      });
    }
  }
  return events;
}

/* ─── 프로그레션 ASC/MC — astro-today.js와 동일 공식(Naibod 키 기법) ─── */
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

/* ─── 프로그레션 "현재 위치" — 사인 진입(그 해에 경계를 넘는지)과는 별개로,
   그 해 기준 "지금 어디에 있는지" 늘 참인 배경 사실. "당신이라는 사람" 섹션
   전용 재료(다른 섹션엔 쓰지 않음).
   대상: 인격행성 5개(태양·달·수성·금성·화성) + 프로그레션 ASC/MC.
   3년 전 같은 기준일과 사인을 비교해 "최근 진입" 여부도 같이 표시한다. ─── */
function buildProgNowFacts(meta, targetYear, lonAt, cusps, lat, lng) {
  const [bY, bM, bD] = meta.birthDate.split('-').map(Number);
  const [hh, mi]     = (meta.birthTime || '12:00').split(':').map(Number);
  const utcOff       = meta.utcOffset ?? 9;
  const birthUTC     = new Date(Date.UTC(bY, bM - 1, bD, hh, mi) - utcOff * 3600000);
  const natalJD      = calcJulianDay(
    birthUTC.getUTCFullYear(), birthUTC.getUTCMonth() + 1, birthUTC.getUTCDate(),
    birthUTC.getUTCHours() + birthUTC.getUTCMinutes() / 60
  );

  function ageYearsAt(realDate) { return (realDate - birthUTC) / 86400000 / 365.25; }
  function progDateAt(realDate) {
    return new Date(birthUTC.getTime() + ageYearsAt(realDate) * 86400000);
  }

  const refDate     = new Date(Date.UTC(targetYear, 11, 31)); // 그 해 연말 기준 "현재"
  const progDate    = progDateAt(refDate);
  const pastRefDate = new Date(Date.UTC(targetYear - 3, 11, 31)); // 최근 진입 판정용(3년 전)
  const pastProgDate = progDateAt(pastRefDate);

  const PLANETS = [
    { key:'sun', kr:'태양' }, { key:'moon', kr:'달' }, { key:'mercury', kr:'수성' },
    { key:'venus', kr:'금성' }, { key:'mars', kr:'화성' },
  ];

  const facts = [];
  for (const p of PLANETS) {
    const lon  = lonAt(progDate, p.key);
    const info = toSignInfo(lon);
    const house = getHouseOf(lon, cusps);
    const pastSign = toSignInfo(lonAt(pastProgDate, p.key)).sign;
    const recent = pastSign !== info.sign;
    facts.push(`프로그레션 ${p.kr} — ${info.sign} ${info.degree}°${info.minute}' · ${house}하우스${recent ? ' (최근 몇 년 내 사인 진입)' : ''}`);
  }

  const { asc: progAsc, mc: progMc } = calcProgAnglesNaibod(natalJD, ageYearsAt(refDate), lat, lng);
  const { asc: pastAsc, mc: pastMc } = calcProgAnglesNaibod(natalJD, ageYearsAt(pastRefDate), lat, lng);
  const ascInfo = toSignInfo(progAsc), mcInfo = toSignInfo(progMc);
  const ascRecent = toSignInfo(pastAsc).sign !== ascInfo.sign;
  const mcRecent  = toSignInfo(pastMc).sign  !== mcInfo.sign;
  facts.push(`프로그레션 ASC — ${ascInfo.sign} ${ascInfo.degree}°${ascInfo.minute}'${ascRecent ? ' (최근 몇 년 내 사인 진입)' : ''}`);
  facts.push(`프로그레션 MC — ${mcInfo.sign} ${mcInfo.degree}°${mcInfo.minute}'${mcRecent ? ' (최근 몇 년 내 사인 진입)' : ''}`);

  return facts;
}

/* ─── 배경 팩트 — 나탈-나탈/프로그레션-나탈 에스펙트 중 가장 타이트한 것들 ───
   "그 해의 사건"이 아니라 "이 사람 자체"에 대한 늘 참인 배경 정보라
   이벤트 스키마(when/tier 등)에 끼워넣지 않고 별도 background 필드로 둔다.
   natalAspectsFull/progAspectsFull은 클라이언트(astro-calc.js 결과)에서
   온 그대로이며 이미 오브 오름차순 정렬되어 있다 — 앞에서 N개만 취하면
   가장 타이트한(=가장 의미있는) 에스펙트가 된다. */
function pickAspectHighlights(aspectsFull, n = 5) {
  if (!Array.isArray(aspectsFull)) return [];
  return aspectsFull.slice(0, n).map(a =>
    `${a.point1} ${a.symbol}(${a.aspect}) ${a.point2} — 오브 ${a.orb}°`
  );
}

/* ─── 메인 핸들러 ─────────────────────────────────────────── */
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { meta, natal, angles, nodes, houses, targetYear, natalAspectsFull, progAspectsFull } = req.body;
    if (!meta?.birthDate || !natal || !angles || !nodes || !houses || !targetYear) {
      return res.status(400).json({ error: 'meta/natal/angles/nodes/houses/targetYear가 필요합니다.' });
    }

    const { birthDate, birthTime, lat, lng, utcOffset } = meta;
    const [bY, bM, bD] = birthDate.split('-').map(Number);
    const [hh, mi]     = (birthTime || '12:00').split(':').map(Number);
    const offsetHours  = utcOffset != null ? utcOffset : (lng / 15);
    const localDecHour = hh + mi / 60;
    const utcDecHour   = localDecHour - offsetHours;
    const utcH = Math.floor(utcDecHour);
    const utcM = Math.round((utcDecHour - utcH) * 60);
    const birthUTC = new Date(Date.UTC(bY, bM - 1, bD, utcH, utcM, 0));

    const cusps = houses.map(h => h.longitude);
    const lonAt = makeLonAt(lng, lat);

    const profection = calcProfection(bY, targetYear, cusps);
    const eclipses   = getEclipseEvents(targetYear, cusps);
    const jupEvt = commonPlanetEvent(targetYear, cusps, 'jupiter', lonAt, '목성', 'wealth');
    const satEvt = commonPlanetEvent(targetYear, cusps, 'saturn',  lonAt, '토성', 'career');
    const srEvents = buildSolarReturnEvents(birthUTC, lng, lat, natal, angles, nodes, houses, targetYear);

    const retrogrades = collectRetrogradeWindows(targetYear, lonAt);
    const common = [...eclipses, jupEvt, satEvt, ...srEvents, ...retrogrades];

    const impacts = [
      ...collectImpacts(targetYear, lonAt, natal, cusps),
      ...collectLifeCycle(bY, targetYear, lonAt, natal),
      ...collectProgMoonPhase(meta, targetYear, lonAt),
      ...collectProgIngress(meta, targetYear, lonAt),
    ];

    // 선별(중요도/tier)은 각 collect* 함수에서 이미 끝났다. 여기서는 "표시 순서"만 정한다 —
    // 레이어로 1차 그룹화한 뒤, 같은 그룹 안에서는 오브가 아니라 날짜(when) 오름차순으로 배열해
    // 주요 이벤트 장이 1월→연말 시간 순으로 나오게 한다(작업지시서: 선별=중요도, 나열=시간순).
    const all = [...common, ...impacts];
    all.sort((a, b) => {
      if (a.layer !== b.layer) return a.layer === 'impact' ? -1 : 1;
      return (a.when || '').localeCompare(b.when || '');
    });

    const background = {
      natalHighlights: pickAspectHighlights(natalAspectsFull, 5),
      progHighlights:  pickAspectHighlights(progAspectsFull, 5),
      progNow:         buildProgNowFacts(meta, targetYear, lonAt, cusps, lat, lng),
    };

    return res.status(200).json({
      year: targetYear,
      profection,
      background,
      events:      all.filter(e => e.tier <= 2),
      speculative: all.filter(e => e.tier === 3),
    });

  } catch (error) {
    console.error('annual-events error:', error);
    return res.status(500).json({ error: '연간 이벤트 계산 중 오류가 발생했습니다: ' + error.message });
  }
}
