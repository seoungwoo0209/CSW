import Ephemeris from 'ephemeris';
import { applyCors } from './_cors.js';

function norm360(a) { return ((a % 360) + 360) % 360; }

// 오늘 트랜짓 금성이 역행 중인지 — 오늘과 내일의 황경을 비교 (위치 무관, 지구중심 기준이라 출생지 불필요)
function isVenusRetrogradeNow() {
  const today    = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const lonToday    = norm360(Ephemeris.getAllPlanets(today, 0, 0, 0).observed.venus.apparentLongitudeDd);
  const lonTomorrow = norm360(Ephemeris.getAllPlanets(tomorrow, 0, 0, 0).observed.venus.apparentLongitudeDd);
  let diff = lonTomorrow - lonToday;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff < 0;
}

/* =========================================================
   솔로 "올해의 연애 타이밍" 점수/타임라인 — api/gemini-career.js와 동일한 패턴
   ========================================================= */
function currentLongitude(planetKey) {
  return norm360(Ephemeris.getAllPlanets(new Date(), 0, 0, 0).observed[planetKey].apparentLongitudeDd);
}
function getHouseOf(lon, houses) {
  const n = norm360(lon);
  for (let i = 0; i < 12; i++) {
    const s = houses[i]?.longitude, e = houses[(i + 1) % 12]?.longitude;
    if (s == null || e == null) continue;
    if (s > e) { if (n >= s || n < e) return i + 1; }
    else       { if (n >= s && n < e) return i + 1; }
  }
  return 12;
}
function angularDistance(a, b) {
  const diff = Math.abs(norm360(a) - norm360(b));
  return diff > 180 ? 360 - diff : diff;
}
const ASPECT_DEFS = [
  { name: '합',     angle: 0,   orb: 6 },
  { name: '섹스타일', angle: 60,  orb: 4 },
  { name: '트라인',  angle: 120, orb: 6 },
  { name: '스퀘어',  angle: 90,  orb: 6 },
  { name: '어포지션', angle: 180, orb: 8 },
];
function aspectName(lon1, lon2) {
  if (lon1 == null || lon2 == null) return null;
  const dist = angularDistance(lon1, lon2);
  for (const a of ASPECT_DEFS) {
    if (Math.abs(dist - a.angle) <= a.orb) return a.name;
  }
  return null;
}
const _isHarmoniousAspect  = (name) => name === '트라인' || name === '섹스타일';
const _isChallengingAspect = (name) => name === '스퀘어' || name === '어포지션';
function aspectScore(transitLon, natalLons) {
  for (const lon of natalLons) {
    const a = aspectName(transitLon, lon);
    if (_isHarmoniousAspect(a)) return 1;
    if (_isChallengingAspect(a)) return -1;
  }
  return 0;
}
function monthlyLon(transits, monthIdx, planetKey) {
  return transits?.[monthIdx]?.planets?.[planetKey]?.longitude ?? null;
}
function monthlyHouse(transits, monthIdx, planetKey) {
  return transits?.[monthIdx]?.planets?.[planetKey]?.house ?? null;
}
function monthlyRetroFlags(transits, planetKey) {
  if (!Array.isArray(transits) || transits.length !== 12) return null;
  const lons = transits.map(t => t.planets?.[planetKey]?.longitude);
  if (lons.some(l => l == null)) return null;
  return lons.map((lon, i) => {
    const a = i === 0 ? lons[0] : lons[i - 1];
    const b = i === 0 ? lons[1] : lons[i];
    let diff = b - a;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return diff < 0;
  });
}
function eclipseMonthIndex(eclipseSignal) {
  if (!eclipseSignal) return null;
  return new Date(eclipseSignal.dateLocal).getMonth();
}
function patchedTransitsForNow(transits, houses, nowMonthIdx, planetKeys) {
  if (!Array.isArray(transits) || transits.length !== 12) return transits;
  const patched = transits.map((t, i) => i === nowMonthIdx ? { ...t, planets: { ...t.planets } } : t);
  for (const key of planetKeys) {
    const lon = currentLongitude(key);
    const house = (houses && houses.length === 12) ? getHouseOf(lon, houses) : patched[nowMonthIdx].planets[key]?.house;
    patched[nowMonthIdx].planets[key] = { ...patched[nowMonthIdx].planets[key], longitude: lon, house };
  }
  return patched;
}
function buildMonthlyStrength(scores, nowIdx) {
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const bestIndices = (min !== max && max > 0)
    ? scores.reduce((acc, s, i) => { if (s === max) acc.push(i); return acc; }, [])
    : [];
  return { scores, nowIdx, bestIndices };
}
function buildConclusion(monthlyStrength, strengthFixed, reasonFn, ctx) {
  const { scores, bestIndices } = monthlyStrength;
  const h1 = scores.slice(0, 6).reduce((a, b) => a + b, 0) / 6;
  const h2 = scores.slice(6).reduce((a, b) => a + b, 0) / 6;
  const halfTrend = h1 === h2 ? 'even' : (h2 > h1 ? 'h2' : 'h1');
  const hasBest = bestIndices.length > 0;
  return {
    strengthFixed,
    halfTrend,
    hasVariation: hasBest,
    bestMonths: hasBest ? bestIndices.map(i => i + 1) : [],
    reason: hasBest ? reasonFn(bestIndices[0], ctx) : null,
  };
}
function strengthFromScore(score) {
  if (score >= 1) return '강함';
  if (score <= -1) return '약함';
  return '보통';
}
function loveScoreAt(monthIdx, ctx) {
  const { transits, venusLon, house7RulerLon, eclipseMonth, venusRetroFlags } = ctx;
  let s = 0;
  if ([5, 7].includes(monthlyHouse(transits, monthIdx, 'jupiter'))) s += 1;
  if ([5, 7].includes(monthlyHouse(transits, monthIdx, 'saturn'))) s -= 1;
  if (venusRetroFlags?.[monthIdx]) s -= 1;
  if (eclipseMonth === monthIdx) s += 1;
  s += aspectScore(monthlyLon(transits, monthIdx, 'jupiter'), [venusLon, house7RulerLon]);
  s += aspectScore(monthlyLon(transits, monthIdx, 'saturn'), [venusLon, house7RulerLon]);
  return s;
}
function loveReasonAt(monthIdx, ctx) {
  const { transits, eclipseMonth } = ctx;
  if (eclipseMonth === monthIdx) return '일식·월식이 가까운 시기';
  if ([5, 7].includes(monthlyHouse(transits, monthIdx, 'jupiter'))) return '목성이 연애·관계 영역(5·7하우스)을 지나는 시기';
  return null;
}

/* =========================================================
   재회운 — 올해의 재회 타이밍 점수·타임라인 (①단독·②상대방 있음 둘 다 동일 공식, 내 차트 기준 트랜짓)
   ========================================================= */
function reunionScoreAt(monthIdx, ctx) {
  const { transits, natalVenusLon, natalSaturnLon, eclipseMonth, venusRetroFlags } = ctx;
  let s = 0;
  if ([7, 8].includes(monthlyHouse(transits, monthIdx, 'saturn'))) s += 1;
  if (venusRetroFlags?.[monthIdx]) s += 1;
  if (eclipseMonth === monthIdx) s += 1;
  s += aspectScore(monthlyLon(transits, monthIdx, 'jupiter'), [natalVenusLon]);
  s += aspectScore(monthlyLon(transits, monthIdx, 'venus'), [natalSaturnLon]);
  return s;
}
function reunionReasonAt(monthIdx, ctx) {
  const { transits, eclipseMonth } = ctx;
  if (eclipseMonth === monthIdx) return '일식·월식이 가까운 시기';
  if ([7, 8].includes(monthlyHouse(transits, monthIdx, 'saturn'))) return '토성이 관계·유대의 영역(7·8하우스)을 지나며 재시험·재정비를 요구하는 시기';
  return null;
}
// 골든타임(가장 점수 높은 달)을 AI 본문이 "지금"만 보고 쓰지 않도록, 지금/미래/과거 중 어디에 있는지에 따라 다른 지침을 만든다.
function reunionBestMonthsInstruction(bestIndices, nowMonthIdx, ctx) {
  if (!bestIndices?.length) return '';
  const nowMonth = nowMonthIdx + 1;
  const bestMonths = bestIndices.map(i => i + 1);
  if (bestMonths.includes(nowMonth)) {
    const reason = reunionReasonAt(nowMonthIdx, ctx) || '여러 신호가 겹치는 시기';
    return `올해 중 재회 흐름이 가장 강하게 열리는 시기가 바로 지금(${nowMonth}월)이다(${reason}). 이 점을 적극적으로 강조해서 써라.`;
  }
  const futureIndices = bestIndices.filter(i => i + 1 > nowMonth);
  if (futureIndices.length) {
    const reason = reunionReasonAt(futureIndices[0], ctx) || '여러 신호가 겹치는 시기';
    return `올해 중 재회 흐름이 가장 강하게 열리는 달은 ${futureIndices.map(i => i + 1).join('·')}월이다(${reason}). 지금의 흐름을 설명한 뒤, 다가올 그 달들도 함께 언급해서 글을 마무리해라.`;
  }
  const reason = reunionReasonAt(bestIndices[0], ctx) || '여러 신호가 겹치는 시기';
  return `올해 중 재회 흐름이 가장 강했던 시기는 이미 지나간 ${bestMonths.join('·')}월이다(${reason}). "다가올"이라는 표현은 쓰지 말고, 그 시점을 회고적으로 짚어준 뒤 올해 남은 기간은 차분한 흐름이 이어진다는 걸 솔직하게 써라.`;
}

/* =========================================================
   궁합 — 6가지 핵심 시너지 등급 (정적 비교라 타임라인 없음, 강도 배지만)
   ========================================================= */
// topAspects의 point1/point2는 항상 "나 X" / "상대 Y" 형태 (calcAllAspects가 그렇게 라벨링)
function findAspectsBetweenPlanets(aspects, planetA, planetB) {
  return (aspects || []).filter(a =>
    (a.point1 === `나 ${planetA}` && a.point2 === `상대 ${planetB}`) ||
    (a.point1 === `나 ${planetB}` && a.point2 === `상대 ${planetA}`)
  );
}
function aspectPairScore(aspects, pairs) {
  let s = 0;
  for (const [pa, pb] of pairs) {
    for (const a of findAspectsBetweenPlanets(aspects, pa, pb)) {
      if (a.aspect === '트라인' || a.aspect === '섹스타일') s += 1;
      if (a.aspect === '스퀘어' || a.aspect === '어포지션') s -= 1;
    }
  }
  return s;
}
// 출생시각 모르면 상대방 하우스가 부정확해서(정오로 가정) 하우스 오버레이 신호는 신뢰할 수 없음 — 그때는 0 처리
function houseOverlayBonus(houseOverlay, partnerTimeUnknown, planetKeys, targetHouses) {
  if (!houseOverlay || partnerTimeUnknown) return 0;
  for (const k of planetKeys) {
    if (targetHouses.includes(houseOverlay.partnerPlanetsInMyHouses?.[k])) return 1;
    if (targetHouses.includes(houseOverlay.myPlanetsInPartnerHouses?.[k])) return 1;
  }
  return 0;
}
// 하우스 오버레이는 +1만 있는 비대칭 신호라(상응하는 -1 신호가 없음) 행성·하우스 1개로 좁혀서
// 강함 쪽으로 과하게 치우치지 않게 한다(시뮬레이션으로 확인).
// 첫인상 끌림 — ASC(겉모습·첫 느낌)↔금성, 금성↔금성(서로의 미적 취향), 1하우스(첫인상의 집) 오버레이
function firstImpressionScore(aspects, houseOverlay, partnerTimeUnknown) {
  return aspectPairScore(aspects, [['ASC', '금성'], ['금성', '금성']]) + houseOverlayBonus(houseOverlay, partnerTimeUnknown, ['venus'], [1]);
}
// 육체적 끌림(속궁합) — 화성-화성(원초적 욕망 매칭)·태양-화성(매그너틱 케미)·금성-화성, 8하우스(육체적·성적 친밀감)
function physicalAttractionScore(aspects, houseOverlay, partnerTimeUnknown) {
  return aspectPairScore(aspects, [['금성', '화성'], ['화성', '화성'], ['태양', '화성']]) + houseOverlayBonus(houseOverlay, partnerTimeUnknown, ['mars'], [8]);
}
function communicationScore(aspects, houseOverlay, partnerTimeUnknown) {
  return aspectPairScore(aspects, [['수성', '수성']]) + houseOverlayBonus(houseOverlay, partnerTimeUnknown, ['mercury'], [3]);
}
function emotionalSafetyScore(aspects, houseOverlay, partnerTimeUnknown) {
  return aspectPairScore(aspects, [['달', '달'], ['달', '태양']]) + houseOverlayBonus(houseOverlay, partnerTimeUnknown, ['moon'], [4]);
}
function longTermSynergyScore(aspects, houseOverlay, partnerTimeUnknown) {
  return aspectPairScore(aspects, [['토성', '토성'], ['토성', '태양'], ['토성', '달'], ['토성', '금성']])
    + houseOverlayBonus(houseOverlay, partnerTimeUnknown, ['saturn'], [7]);
}
// 운명적 인연 — 북노드(인생 방향·운명)↔태양/달/금성. 하우스 오버레이는 안 씀(내 북노드 하우스가 가변적이라 단순화)
function destinyConnectionScore(aspects) {
  return aspectPairScore(aspects, [['북노드(☊)', '태양'], ['북노드(☊)', '달'], ['북노드(☊)', '금성']]);
}

function buildLovePrompt(body) {
  const {
    name, gender, venus, mars, moon, saturn,
    house5Sign, house7Sign, house5Occupants, house7Occupants,
    house7Ruler, satVenusAspect, satRulerAspect,
    transitNow, progMoonHouse, progMoonSign,
    ascSign, ascRuler, house5Ruler, house8Sign, house8Occupants,
    progVenusSign, progVenusHouse, northNodeSign, northNodeHouse,
    jupiterVenusAspect, eclipseSignal, venusRetro, isInRelationship,
    transits, houses
  } = body;

  const displayName = name?.trim() || '당신';
  const genderKr     = gender === 'M' ? '남성' : '여성';
  const isSolo = !isInRelationship;

  // 솔로일 때만 "올해의 만남 타이밍" 점수·타임라인 계산 (연애 중인 사람에겐 의미 없는 질문이라 스킵)
  let monthlyStrength = null, conclusion = null, strengthFixed = null;
  if (isSolo && Array.isArray(transits) && transits.length === 12 && Array.isArray(houses) && houses.length === 12) {
    const nowMonthIdx = new Date().getMonth();
    const venusRetroFlags = monthlyRetroFlags(transits, 'venus');
    if (venusRetroFlags) venusRetroFlags[nowMonthIdx] = venusRetro;
    const ctx = {
      transits: patchedTransitsForNow(transits, houses, nowMonthIdx, ['jupiter', 'saturn']),
      venusLon: venus?.longitude,
      house7RulerLon: house7Ruler?.longitude,
      eclipseMonth: eclipseMonthIndex(eclipseSignal),
      venusRetroFlags,
    };
    const monthlyScores = Array.from({ length: 12 }, (_, m) => loveScoreAt(m, ctx));
    strengthFixed = strengthFromScore(monthlyScores[nowMonthIdx]);
    monthlyStrength = buildMonthlyStrength(monthlyScores, nowMonthIdx);
    conclusion = buildConclusion(monthlyStrength, strengthFixed, loveReasonAt, ctx);
  }

  // timing 섹션의 해석 관점만 분기 — 계산에 쓰는 천체 신호(트랜짓·프로그레션 등)는 솔로/연애 중 동일하게 공유
  const timingFocus = isInRelationship
    ? `(올해의 연애 흐름 — 트랜짓·프로그레션이 보여주는 타이밍, ${displayName}님이 현재 연애 중인 상태를 전제로 해석)
- 지금 관계에 어떤 변화(개선·갈등 해소·시험대 등)가 다가오는지
- 그 변화에 ${displayName}님이 어떻게 대응하면 좋을지 실질적인 조언`
    : `(올해의 연애 흐름 — 트랜짓·프로그레션이 보여주는 타이밍, ${displayName}님이 현재 솔로인 상태를 전제로 해석)
- 새로운 인연이 다가오는 시기인지를, 지금 강도는 이미 "${strengthFixed}"로 확정되어 있으니 그 흐름과 어긋나지 않게 써라(강함이면 적극적으로, 약함이면 차분히 기반을 다지는 시기로, 보통이면 균형있게)
- 어떤 계기·환경에서 만나게 될 가능성이 높은지를 5하우스(취미·모임·사교 자리)/11하우스(친구 소개·동호회·커뮤니티)/9하우스(여행·낯선 환경·새로운 분야 공부) 중 ${displayName}님 차트에 부합하는 쪽으로 구체적으로 짚어라. 금성 별자리 기질도 반영해라(불 원소면 활동적인 자리, 흙 원소면 일상·업무 관련 자리, 공기 원소면 대화·온라인 중심, 물 원소면 소규모 친밀한 자리)
- 구체적인 동네·장소명 같은 건 절대 언급하지 마라 — 어떤 "맥락·상황"인지만 짚어라
- 구체적으로 어떻게 행동하면 좋을지 실질적인 조언`;

  const house5Str = `${house5Sign}${house5Occupants?.length ? ` (${house5Occupants.join(', ')} 위치)` : ''}`;
  const house7Str = `${house7Sign}${house7Occupants?.length ? ` (${house7Occupants.join(', ')} 위치)` : ''}`;
  const house8Str = `${house8Sign}${house8Occupants?.length ? ` (${house8Occupants.join(', ')} 위치)` : ''}`;

  let transitStr = '트랜짓 정보 없음';
  if (transitNow) {
    transitStr = `이번 달 트랜짓 — 금성: ${transitNow.planets.venus.sign}, 화성: ${transitNow.planets.mars.sign}`;
  }
  const progMoonStr = progMoonSign ? `프로그레션 달: ${progMoonSign} ${progMoonHouse}하우스` : '프로그레션 정보 없음';
  const progVenusStr = progVenusSign ? `프로그레션 금성: ${progVenusSign} ${progVenusHouse}하우스 (지금 어떤 사랑에 끌리는지의 변화)` : '프로그레션 금성 정보 없음';

  const house7RulerStr = house7Ruler
    ? `7하우스(${house7Sign}) 지배행성: ${house7Ruler.label} — ${house7Ruler.sign} ${house7Ruler.house}하우스`
    : '7하우스 지배행성 정보 없음';
  const house5RulerStr = house5Ruler
    ? `5하우스(${house5Sign}) 지배행성: ${house5Ruler.label} — ${house5Ruler.sign} ${house5Ruler.house}하우스`
    : '5하우스 지배행성 정보 없음';
  const ascRulerStr = ascRuler
    ? `차트 지배행성(ASC ${ascSign}): ${ascRuler.label} — ${ascRuler.sign} ${ascRuler.house}하우스 (연애를 대하는 전체적인 태도)`
    : '차트 지배행성 정보 없음';
  const satVenusStr = satVenusAspect
    ? `토성-금성: ${satVenusAspect.aspect} (orb ${satVenusAspect.orb}°)`
    : '토성-금성 간 뚜렷한 어스펙트 없음';
  const satRulerStr = satRulerAspect
    ? `토성-7하우스 지배행성: ${satRulerAspect.aspect} (orb ${satRulerAspect.orb}°)`
    : '';
  const jupVenusStr = jupiterVenusAspect
    ? `목성-금성: ${jupiterVenusAspect.aspect} (orb ${jupiterVenusAspect.orb}°) — 전통적으로 "사랑의 행운" 지표`
    : '목성-금성 간 뚜렷한 어스펙트 없음';
  const nodeStr = northNodeSign ? `북노드: ${northNodeSign} ${northNodeHouse}하우스 — 어떤 관계로 성장해가야 하는지의 방향` : '';
  const venusRetroStr = `금성 역행 여부: ${venusRetro ? '역행 중 (전통적으로 옛 인연이나 과거의 사랑 방식이 다시 떠오르는 시기)' : '순행 중'}`;
  const eclipseStr = eclipseSignal
    ? (() => {
        const d = new Date(eclipseSignal.dateLocal);
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${eclipseSignal.type}이 ${eclipseSignal.conjunctPoint}에 근접 — 관계의 중요한 전환점으로 해석 가능`;
      })()
    : '올해 연애 관련 일식/월식 시그널 없음';

  const prompt = `
너는 20년 경력의 서양 점성술 전문가야.
아래 차트 데이터를 바탕으로 ${displayName}님만을 위한 연애운 리포트를 작성해.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기본 정보]
이름: ${displayName} / 성별: ${genderKr}

[타고난 연애 기질 — 네이탈 차트]
금성(Venus): ${venus.sign} ${venus.house}하우스 — 끌림의 방식·사랑을 표현하고 받는 방식
화성(Mars): ${mars.sign} ${mars.house}하우스 — 욕망·연애에서의 추진력
달(Moon): ${moon.sign} ${moon.house}하우스 — 정서적으로 원하는 것
5하우스(연애·설렘): ${house5Str}
7하우스(진지한 파트너십): ${house7Str}
8하우스(깊은 정서적·성적 유대): ${house8Str}
${house5RulerStr}
${ascRulerStr}
${jupVenusStr}
${nodeStr}

[결혼·지속적 관계 — 토성·7하우스 지배행성]
토성(Saturn): ${saturn.sign} ${saturn.house}하우스 — 책임감·관계를 얼마나 오래 지속시키는가
${house7RulerStr}
${satVenusStr}
${satRulerStr}

[올해의 흐름]
${transitStr}
${progMoonStr}
${progVenusStr}
${venusRetroStr}
${eclipseStr}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 삶의 언어로 번역해라.
   예) "금성이 7하우스" → "가벼운 만남보다 처음부터 진지한 관계를 추구하는 끌림의 방식"
2. ${displayName}님만의 특징처럼 구체적으로 써라. 일반적인 운세 상투어("좋은 인연이 옵니다" 등) 금지.
3. "~할 수 있습니다", "~일 수도 있어요" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 길흉 예언(예: "올해 반드시 결혼한다")은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 문법(#, **볼드**, 목록 기호 등) 전부 사용 금지 — 순수 텍스트로만 작성해라.

[섹션 구성 — 반드시 아래 ${isSolo ? '5개' : '3개'} 마커를 정확히 그대로 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라: ===SECTION:nature===
마커 자체는 사용자에게 보이지 않는 구분선이므로, 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.
${isSolo ? '5개 섹션 전부 빠짐없이, 각자 요청된 분량을 줄이지 말고 작성해라 — 어떤 이유로도 마커를 생략하거나 일부만 쓰고 끝내면 안 된다.' : ''}

===SECTION:nature===
(타고난 연애 기질 — 금성·화성·달·5/7하우스가 만드는 ${displayName}님의 연애 패턴)
- 어떤 사람에게 끌리는지, 사랑을 표현하는 방식, 진지한 관계 vs 가벼운 만남 중 무엇을 추구하는지
- 분량: 4~5문단, 각 문단 3~4문장

===SECTION:marriage===
(결혼·지속적 관계 — 토성과 7하우스 지배행성이 보여주는 결혼 성향)
- 연애와 결혼은 다르다는 점을 살려서, ${displayName}님이 관계를 얼마나 오래/진지하게 지속시키는 성향인지
- 토성-금성, 토성-7하우스지배행성 어스펙트가 있다면 그게 결혼/헌신에 어떤 의미인지 (없다면 토성과 7하우스 지배행성의 별자리·하우스만으로 해석)
- 단정적인 결혼 시기 예언("올해 결혼한다" 등)은 금지, 결혼에 대한 태도와 패턴 위주로
- 분량: 3~4문단

===SECTION:timing===
${timingFocus}
- 분량: 3~4문단
${isSolo ? `
===SECTION:strength===
(아래 한 단어를 정확히 그대로, 다른 말 절대 덧붙이지 말고 출력: "${strengthFixed}")

===SECTION:suggestion===
(위에서 정해진 강도·흐름·시기 신호를 바탕으로 한 줄 제안. 직접적인 행동 지시("~하세요", "나가보세요" 등 명령형)는 절대 쓰지 말고, 돌려서 말하는 부드러운 제안을 딱 한 문장으로 적어라.
예시 톤: "서두르기보다 신호가 강해지는 시점에 맞춰 움직여보는 것도 방법입니다." 같은 느낌.
이 SECTION:suggestion 섹션 안에서만 한 문장으로 끝내라(마크다운 금지). 이 규칙은 이 섹션 안에만 적용되는 것이고, 위의 nature·marriage·timing·strength 섹션은 각각 요청한 분량과 형식을 그대로 지켜서 절대 줄이지 마라.)` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 ${isSolo ? 'nature, marriage, timing, strength, suggestion 다섯' : 'nature, marriage, timing 세'} 섹션을 마커와 함께 전부 작성해.
`.trim();

  return { prompt, monthlyStrength, conclusion };
}

function buildReunionPrompt(body) {
  const {
    name, gender, venus, mars, moon, saturn,
    house7Sign, house7Occupants, house7Ruler,
    satVenusAspect, satRulerAspect,
    transitNow, progMoonHouse, progMoonSign,
    venusRetro,
    ascSign, ascRuler, house8Sign, house8Occupants,
    progVenusSign, progVenusHouse, northNodeSign, northNodeHouse,
    jupiterVenusAspect, eclipseSignal, transits, houses
  } = body;

  const nowMonthIdx = new Date().getMonth();
  let monthlyStrength = null, conclusion = null, strengthFixed = null, ctx = null, bestMonthsInstr = '';
  if (Array.isArray(transits) && transits.length === 12 && Array.isArray(houses) && houses.length === 12) {
    const venusRetroFlags = monthlyRetroFlags(transits, 'venus');
    if (venusRetroFlags) venusRetroFlags[nowMonthIdx] = venusRetro;
    ctx = {
      transits: patchedTransitsForNow(transits, houses, nowMonthIdx, ['jupiter', 'saturn', 'venus']),
      natalVenusLon: venus?.longitude,
      natalSaturnLon: saturn?.longitude,
      eclipseMonth: eclipseMonthIndex(eclipseSignal),
      venusRetroFlags,
    };
    const monthlyScores = Array.from({ length: 12 }, (_, m) => reunionScoreAt(m, ctx));
    strengthFixed = strengthFromScore(monthlyScores[nowMonthIdx]);
    monthlyStrength = buildMonthlyStrength(monthlyScores, nowMonthIdx);
    conclusion = buildConclusion(monthlyStrength, strengthFixed, reunionReasonAt, ctx);
    bestMonthsInstr = reunionBestMonthsInstruction(monthlyStrength.bestIndices, nowMonthIdx, ctx);
  }

  const displayName = name?.trim() || '당신';
  const genderKr     = gender === 'M' ? '남성' : '여성';

  const house7Str = `${house7Sign}${house7Occupants?.length ? ` (${house7Occupants.join(', ')} 위치)` : ''}`;
  const house8Str = `${house8Sign}${house8Occupants?.length ? ` (${house8Occupants.join(', ')} 위치)` : ''}`;

  const house7RulerStr = house7Ruler
    ? `7하우스(${house7Sign}) 지배행성: ${house7Ruler.label} — ${house7Ruler.sign} ${house7Ruler.house}하우스`
    : '7하우스 지배행성 정보 없음';
  const ascRulerStr = ascRuler
    ? `차트 지배행성(ASC ${ascSign}): ${ascRuler.label} — ${ascRuler.sign} ${ascRuler.house}하우스`
    : '차트 지배행성 정보 없음';
  const satVenusStr = satVenusAspect
    ? `토성-금성: ${satVenusAspect.aspect} (orb ${satVenusAspect.orb}°)`
    : '토성-금성 간 뚜렷한 어스펙트 없음';
  const satRulerStr = satRulerAspect
    ? `토성-7하우스 지배행성: ${satRulerAspect.aspect} (orb ${satRulerAspect.orb}°)`
    : '';
  const jupVenusStr = jupiterVenusAspect
    ? `목성-금성: ${jupiterVenusAspect.aspect} (orb ${jupiterVenusAspect.orb}°)`
    : '목성-금성 간 뚜렷한 어스펙트 없음';
  const nodeStr = northNodeSign
    ? `북노드: ${northNodeSign} ${northNodeHouse}하우스 — 전통적으로 "운명적·카르마적 재회"를 가리키는 핵심 지표`
    : '';

  // "지금 토성이 몇 하우스인가"는 점수 계산에 쓴 라이브 패치 값을 단일 출처로 사용 — 이번 달 15일 샘플과 어긋나지 않게 한다.
  const liveSaturn = ctx?.transits?.[nowMonthIdx]?.planets?.saturn;
  const liveVenus  = ctx?.transits?.[nowMonthIdx]?.planets?.venus;
  const transitSaturnHouse = liveSaturn?.house ?? (transitNow?.planets?.saturn?.house ?? null);
  const saturnIn78 = transitSaturnHouse === 7 || transitSaturnHouse === 8;

  let transitStr = '트랜짓 정보 없음';
  if (transitNow) {
    const venusSignStr  = liveVenus?.sign  || transitNow.planets.venus.sign;
    const saturnSignStr = liveSaturn?.sign || transitNow.planets.saturn.sign;
    transitStr = `이번 달 트랜짓 — 금성: ${venusSignStr}, 토성: ${saturnSignStr} (${transitSaturnHouse}하우스)`;
  }
  const progMoonStr = progMoonSign ? `프로그레션 달: ${progMoonSign} ${progMoonHouse}하우스` : '프로그레션 정보 없음';
  const progVenusStr = progVenusSign ? `프로그레션 금성: ${progVenusSign} ${progVenusHouse}하우스` : '프로그레션 금성 정보 없음';
  const eclipseStr = eclipseSignal
    ? (() => {
        const d = new Date(eclipseSignal.dateLocal);
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${eclipseSignal.type}이 ${eclipseSignal.conjunctPoint}에 근접 — 관계의 중요한 전환점으로 해석 가능`;
      })()
    : '올해 연애 관련 일식/월식 시그널 없음';

  const prompt = `
너는 20년 경력의 서양 점성술 전문가야.
아래 차트 데이터를 바탕으로 ${displayName}님만을 위한 재회운 리포트를 작성해.
("재회운"은 과거 연인과 다시 만날 가능성/타이밍을 보는 것으로, 일반적인 연애운과는 다른 영역이야.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기본 정보]
이름: ${displayName} / 성별: ${genderKr}

[재회와 관련된 본인의 패턴 — 네이탈 차트]
금성(Venus): ${venus.sign} ${venus.house}하우스 — 과거 인연에 대한 애착 방식
화성(Mars): ${mars.sign} ${mars.house}하우스
달(Moon): ${moon.sign} ${moon.house}하우스 — 미련·정서적 애착의 패턴
토성(Saturn): ${saturn.sign} ${saturn.house}하우스 — 관계를 다시 시험하고 재정비하려는 성향
7하우스(진지한 파트너십): ${house7Str}
8하우스(깊은 정서적·성적 유대, 미련의 뿌리): ${house8Str}
${house7RulerStr}
${ascRulerStr}
${satVenusStr}
${satRulerStr}
${jupVenusStr}
${nodeStr}

[지금 시점의 재회 타이밍 신호]
금성 역행 여부: ${venusRetro ? '역행 중 (전통적으로 과거 인연이 다시 떠오르는 시기로 해석됨)' : '순행 중'}
트랜짓 토성이 7/8하우스를 지나는 중인가: ${saturnIn78 ? `예 (${transitSaturnHouse}하우스 — 관계의 재시험/재정비 시기)` : '아니오'}
${transitStr}
${progMoonStr}
${progVenusStr}
${eclipseStr}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 삶의 언어로 번역해라.
2. ${displayName}님만의 특징처럼 구체적으로 써라. 일반적인 운세 상투어 금지.
3. "~할 수 있습니다" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 예언(예: "반드시 재회한다", "이 사람과 다시 만난다")은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 문법(#, **볼드**, 목록 기호 등) 전부 사용 금지 — 순수 텍스트로만 작성해라.

[섹션 구성 — 반드시 아래 ${monthlyStrength ? '4개' : '2개'} 마커를 정확히 그대로 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라: ===SECTION:pattern===
마커 자체는 사용자에게 보이지 않는 구분선이므로, 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.
${monthlyStrength ? '4개 섹션 전부 빠짐없이, 각자 요청된 분량을 줄이지 말고 작성해라 — 어떤 이유로도 마커를 생략하거나 일부만 쓰고 끝내면 안 된다.' : ''}

===SECTION:pattern===
(재회와 관련된 ${displayName}님의 패턴 — 금성·화성·달·토성·7하우스가 보여주는 과거 인연에 대한 애착과 미련의 방식)
- 헤어진 인연을 어떻게 정리하는 편인지, 다시 떠올리는 패턴이 있는지
- 분량: 4~5문단, 각 문단 3~4문장

===SECTION:timing===
(지금이 재회에 유리한 시기인지 — 금성 역행·토성 트랜짓·프로그레션이 보여주는 타이밍)
${monthlyStrength ? `지금 시기의 강도는 이미 "${strengthFixed}"로 확정되어 있다. 이 글의 어조와 결론이 그 강도와 어긋나지 않게 써라(강함이면 적극적으로, 약함이면 신중론으로, 보통이면 균형있게).` : ''}
${bestMonthsInstr}
- 지금 흐름이 재회에 유리한지, 불리한지, 어떤 신호를 주목해야 하는지
- 구체적으로 어떻게 행동하면 좋을지 실질적인 조언
- 분량: 3~4문단
${monthlyStrength ? `
===SECTION:strength===
(아래 한 단어를 정확히 그대로, 다른 말 절대 덧붙이지 말고 출력: "${strengthFixed}")

===SECTION:suggestion===
(위에서 정해진 강도·흐름·시기 신호를 바탕으로 한 줄 제안. 직접적인 행동 지시("~하세요", "연락하세요" 등 명령형)는 절대 쓰지 말고, 돌려서 말하는 부드러운 제안을 딱 한 문장으로 적어라.
예시 톤: "서두르기보다 신호가 강해지는 시점에 맞춰 움직여보는 것도 방법입니다." 같은 느낌.
이 SECTION:suggestion 섹션 안에서만 한 문장으로 끝내라(마크다운 금지). 이 규칙은 이 섹션 안에만 적용되는 것이고, 위의 pattern·timing·strength 섹션은 각각 요청한 분량과 형식을 그대로 지켜서 절대 줄이지 마라.)` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 ${monthlyStrength ? 'pattern, timing, strength, suggestion 네' : 'pattern과 timing 두'} 섹션을 마커와 함께 전부 작성해.
`.trim();

  return { prompt, monthlyStrength, conclusion, liveSaturnHouse: transitSaturnHouse };
}

function buildCompatibilityPrompt(body) {
  const {
    myName, myGender, partnerName, partnerGender,
    myPlanets, partnerPlanets, partnerTimeUnknown,
    topAspects, houseOverlay, composite
  } = body;

  const myLabel      = myName?.trim() || '나';
  const partnerLabel = partnerName?.trim() || '상대방';
  const myGenderKr      = myGender === 'M' ? '남성' : '여성';
  const partnerGenderKr = partnerGender === 'M' ? '남성' : '여성';

  const aspectsStr = (topAspects || []).length
    ? topAspects.map(a => `${a.point1} ${a.symbol} ${a.point2} (${a.aspect}, orb ${a.orb}°)`).join('\n')
    : '뚜렷한 어스펙트 없음';

  const overlayStr = houseOverlay
    ? `${partnerLabel}의 태양이 ${myLabel}의 ${houseOverlay.partnerPlanetsInMyHouses.sun}하우스, 달이 ${houseOverlay.partnerPlanetsInMyHouses.moon}하우스, 금성이 ${houseOverlay.partnerPlanetsInMyHouses.venus}하우스, 화성이 ${houseOverlay.partnerPlanetsInMyHouses.mars}하우스, 수성이 ${houseOverlay.partnerPlanetsInMyHouses.mercury}하우스, 토성이 ${houseOverlay.partnerPlanetsInMyHouses.saturn}하우스에 위치\n`
      + `${myLabel}의 태양이 ${partnerLabel}의 ${houseOverlay.myPlanetsInPartnerHouses.sun}하우스, 달이 ${houseOverlay.myPlanetsInPartnerHouses.moon}하우스, 금성이 ${houseOverlay.myPlanetsInPartnerHouses.venus}하우스, 화성이 ${houseOverlay.myPlanetsInPartnerHouses.mars}하우스, 수성이 ${houseOverlay.myPlanetsInPartnerHouses.mercury}하우스, 토성이 ${houseOverlay.myPlanetsInPartnerHouses.saturn}하우스에 위치`
    : '하우스 오버레이 정보 없음';

  const timeNote = partnerTimeUnknown ? `\n(주의: ${partnerLabel}의 출생시각이 불명확해 정오로 가정함 — 하우스 오버레이는 참고용일 뿐 정밀하지 않음)` : '';

  const categoryGrades = {
    firstImpression:    strengthFromScore(firstImpressionScore(topAspects, houseOverlay, partnerTimeUnknown)),
    physicalAttraction: strengthFromScore(physicalAttractionScore(topAspects, houseOverlay, partnerTimeUnknown)),
    communication:      strengthFromScore(communicationScore(topAspects, houseOverlay, partnerTimeUnknown)),
    emotionalSafety:    strengthFromScore(emotionalSafetyScore(topAspects, houseOverlay, partnerTimeUnknown)),
    longTerm:           strengthFromScore(longTermSynergyScore(topAspects, houseOverlay, partnerTimeUnknown)),
    destinyConnection:  strengthFromScore(destinyConnectionScore(topAspects)),
  };
  const gradesStr = `첫인상 끌림: ${categoryGrades.firstImpression} / 육체적 끌림(속궁합): ${categoryGrades.physicalAttraction} / 소통·가치관 싱크: ${categoryGrades.communication} / 정서적 안전지대: ${categoryGrades.emotionalSafety} / 장기 안정성: ${categoryGrades.longTerm} / 운명적 인연: ${categoryGrades.destinyConnection}`;

  const prompt = `
너는 20년 경력의 서양 점성술 전문가야.
아래 두 사람의 차트 데이터를 바탕으로 ${myLabel}님과 ${partnerLabel}님의 궁합(시너지) 리포트를 작성해.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기본 정보]
${myLabel}: ${myGenderKr} / ${partnerLabel}: ${partnerGenderKr}

[각자의 핵심 행성]
${myLabel} — 태양: ${myPlanets.sun.sign}, 달: ${myPlanets.moon.sign}, 금성: ${myPlanets.venus.sign}, 화성: ${myPlanets.mars.sign}
${partnerLabel} — 태양: ${partnerPlanets.sun.sign}, 달: ${partnerPlanets.moon.sign}, 금성: ${partnerPlanets.venus.sign}, 화성: ${partnerPlanets.mars.sign}

[시너지 어스펙트 — 두 사람 차트 간 가장 강한 연결 (orb 작을수록 강함)]
${aspectsStr}

[하우스 오버레이]
${overlayStr}${timeNote}

[컴포지트 차트 — 관계 자체의 성격]
컴포지트 태양: ${composite.sun.sign} / 컴포지트 달: ${composite.moon.sign} / 컴포지트 ASC: ${composite.asc.sign}

[4가지 핵심 시너지 등급 — 이미 확정되어 있음]
${gradesStr}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 관계의 실제 느낌으로 번역해라.
   예) "금성-화성 트라인" → "서로의 끌림이 자연스럽게 맞아떨어지는 케미"
2. ${myLabel}님과 ${partnerLabel}님 두 사람 모두의 관점에서 구체적으로 써라. 일반적인 궁합 상투어("운명적인 만남" 등) 금지.
3. "~할 수 있습니다" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 좋은 점만 나열하지 말고, 마찰이 생길 수 있는 지점도 솔직하게 짚어라.
5. 마크다운 문법(#, **볼드**, 목록 기호 등) 전부 사용 금지 — 순수 텍스트로만 작성해라.
6. 위 "6가지 핵심 시너지 등급"은 이미 확정된 값이다. chemistry·dynamics 해설의 어조와 결론이 그 등급들과 어긋나지 않게 써라(예: 육체적 끌림이 약함인데 "불꽃 같은 매력"이라고 쓰면 안 됨).

[섹션 구성 — 반드시 아래 2개 마커를 정확히 그대로 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라: ===SECTION:chemistry===
마커 자체는 사용자에게 보이지 않는 구분선이므로, 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:chemistry===
(끌림과 케미 — 두 사람의 핵심 행성과 시너지 어스펙트가 보여주는 매력의 지점. 첫인상 끌림·육체적 끌림·소통·정서적 안전지대 등급을 자연스럽게 반영)
- 서로 어디에 끌리는지, 어떤 마찰 지점이 있을 수 있는지
- 분량: 4~5문단, 각 문단 3~4문장

===SECTION:dynamics===
(관계의 결 — 컴포지트 차트가 보여주는 이 관계 자체의 성격. 장기 안정성·운명적 인연 등급을 자연스럽게 반영)
- 이 관계가 어떤 목적/성격을 가지는지, 오래 갈 수 있는 구조인지
- 분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 chemistry와 dynamics 두 섹션을 마커와 함께 전부 작성해.
`.trim();

  return { prompt, categoryGrades };
}

function buildReunionKnownPrompt(body) {
  const {
    myName, myGender, partnerName, partnerGender,
    myPlanets, partnerPlanets, partnerTimeUnknown,
    topAspects, houseOverlay, composite,
    transitSaturnHouse, venusRetro, eclipseSignal, transits, houses
  } = body;

  const myLabel      = myName?.trim() || '나';
  const partnerLabel = partnerName?.trim() || '상대방';
  const myGenderKr      = myGender === 'M' ? '남성' : '여성';
  const partnerGenderKr = partnerGender === 'M' ? '남성' : '여성';

  const aspectsStr = (topAspects || []).length
    ? topAspects.map(a => `${a.point1} ${a.symbol} ${a.point2} (${a.aspect}, orb ${a.orb}°)`).join('\n')
    : '뚜렷한 어스펙트 없음';

  const overlayStr = houseOverlay
    ? `${partnerLabel}의 태양이 ${myLabel}의 ${houseOverlay.partnerPlanetsInMyHouses.sun}하우스, 금성이 ${houseOverlay.partnerPlanetsInMyHouses.venus}하우스에 위치\n`
      + `${myLabel}의 태양이 ${partnerLabel}의 ${houseOverlay.myPlanetsInPartnerHouses.sun}하우스, 금성이 ${houseOverlay.myPlanetsInPartnerHouses.venus}하우스에 위치`
    : '하우스 오버레이 정보 없음';

  const timeNote = partnerTimeUnknown ? `\n(주의: ${partnerLabel}의 출생시각이 불명확해 정오로 가정함)` : '';
  const eclipseStr = eclipseSignal
    ? (() => {
        const d = new Date(eclipseSignal.dateLocal);
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${eclipseSignal.type}이 ${eclipseSignal.conjunctPoint}에 근접 — 관계의 중요한 전환점으로 해석 가능`;
      })()
    : '올해 재회 관련 일식/월식 시그널 없음';

  const nowMonthIdx = new Date().getMonth();
  let monthlyStrength = null, conclusion = null, strengthFixed = null, ctx = null, bestMonthsInstr = '';
  if (Array.isArray(transits) && transits.length === 12 && Array.isArray(houses) && houses.length === 12) {
    const venusRetroFlags = monthlyRetroFlags(transits, 'venus');
    if (venusRetroFlags) venusRetroFlags[nowMonthIdx] = venusRetro;
    ctx = {
      transits: patchedTransitsForNow(transits, houses, nowMonthIdx, ['jupiter', 'saturn', 'venus']),
      natalVenusLon: myPlanets?.venus?.longitude,
      natalSaturnLon: myPlanets?.saturn?.longitude,
      eclipseMonth: eclipseMonthIndex(eclipseSignal),
      venusRetroFlags,
    };
    const monthlyScores = Array.from({ length: 12 }, (_, m) => reunionScoreAt(m, ctx));
    strengthFixed = strengthFromScore(monthlyScores[nowMonthIdx]);
    monthlyStrength = buildMonthlyStrength(monthlyScores, nowMonthIdx);
    conclusion = buildConclusion(monthlyStrength, strengthFixed, reunionReasonAt, ctx);
    bestMonthsInstr = reunionBestMonthsInstruction(monthlyStrength.bestIndices, nowMonthIdx, ctx);
  }

  // "지금 토성이 몇 하우스인가"는 점수 계산에 쓴 라이브 패치 값을 단일 출처로 사용 — 클라이언트가 보낸 15일 샘플 값과 어긋나지 않게 한다.
  const liveSaturnHouse = ctx?.transits?.[nowMonthIdx]?.planets?.saturn?.house ?? transitSaturnHouse ?? null;
  const saturnIn78 = liveSaturnHouse === 7 || liveSaturnHouse === 8;

  const prompt = `
너는 20년 경력의 서양 점성술 전문가야.
아래 두 사람의 차트 데이터를 바탕으로 ${myLabel}님과 ${partnerLabel}님의 재회운 리포트를 작성해.
("재회운"은 과거 연인과 다시 만날 가능성/타이밍을 보는 것으로, 단순 궁합과는 다르게 "재회"라는 맥락에 초점을 맞춰야 해.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기본 정보]
${myLabel}: ${myGenderKr} / ${partnerLabel}: ${partnerGenderKr}

[각자의 핵심 행성]
${myLabel} — 태양: ${myPlanets.sun.sign}, 달: ${myPlanets.moon.sign}, 금성: ${myPlanets.venus.sign}, 화성: ${myPlanets.mars.sign}
${partnerLabel} — 태양: ${partnerPlanets.sun.sign}, 달: ${partnerPlanets.moon.sign}, 금성: ${partnerPlanets.venus.sign}, 화성: ${partnerPlanets.mars.sign}

[시너지 어스펙트 — 두 사람 차트 간 가장 강한 연결]
${aspectsStr}

[하우스 오버레이]
${overlayStr}${timeNote}

[컴포지트 차트 — 관계 자체의 성격]
컴포지트 태양: ${composite.sun.sign} / 컴포지트 달: ${composite.moon.sign} / 컴포지트 ASC: ${composite.asc.sign}

[지금 시점의 재회 타이밍 신호]
금성 역행 여부: ${venusRetro ? '역행 중 (전통적으로 과거 인연이 다시 떠오르는 시기로 해석됨)' : '순행 중'}
${myLabel}의 트랜짓 토성이 7/8하우스를 지나는 중인가: ${saturnIn78 ? `예 (${liveSaturnHouse}하우스 — 관계의 재시험/재정비 시기)` : '아니오'}
${eclipseStr}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 관계의 실제 느낌으로 번역해라.
2. ${myLabel}님과 ${partnerLabel}님 두 사람 모두의 관점에서 구체적으로 써라. 일반적인 상투어 금지.
3. "~할 수 있습니다" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 예언(예: "반드시 재회한다")은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 문법(#, **볼드**, 목록 기호 등) 전부 사용 금지 — 순수 텍스트로만 작성해라.

[섹션 구성 — 반드시 아래 ${monthlyStrength ? '4개' : '2개'} 마커를 정확히 그대로 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라: ===SECTION:bond===
마커 자체는 사용자에게 보이지 않는 구분선이므로, 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.
${monthlyStrength ? '4개 섹션 전부 빠짐없이, 각자 요청된 분량을 줄이지 말고 작성해라 — 어떤 이유로도 마커를 생략하거나 일부만 쓰고 끝내면 안 된다.' : ''}

===SECTION:bond===
(관계 패턴 — 시너지 어스펙트와 컴포지트 차트가 보여주는 두 사람의 관계 자체의 성격, 재회와 관련된 맥락에서)
- 두 사람이 왜 끌렸는지, 헤어졌다면 어떤 마찰 지점이 있었을지, 관계의 본질적 성격
- 분량: 4~5문단, 각 문단 3~4문장

===SECTION:timing===
(지금이 재회에 유리한 시기인지 — 금성 역행·토성 트랜짓이 보여주는 타이밍)
${monthlyStrength ? `지금 시기의 강도는 이미 "${strengthFixed}"로 확정되어 있다. 이 글의 어조와 결론이 그 강도와 어긋나지 않게 써라(강함이면 적극적으로, 약함이면 신중론으로, 보통이면 균형있게).` : ''}
${bestMonthsInstr}
- 지금 흐름이 재회에 유리한지, 불리한지, 어떤 신호를 주목해야 하는지
- 구체적으로 어떻게 행동하면 좋을지 실질적인 조언
- 분량: 3~4문단
${monthlyStrength ? `
===SECTION:strength===
(아래 한 단어를 정확히 그대로, 다른 말 절대 덧붙이지 말고 출력: "${strengthFixed}")

===SECTION:suggestion===
(위에서 정해진 강도·흐름·시기 신호를 바탕으로 한 줄 제안. 직접적인 행동 지시("~하세요", "연락하세요" 등 명령형)는 절대 쓰지 말고, 돌려서 말하는 부드러운 제안을 딱 한 문장으로 적어라.
예시 톤: "서두르기보다 신호가 강해지는 시점에 맞춰 움직여보는 것도 방법입니다." 같은 느낌.
이 SECTION:suggestion 섹션 안에서만 한 문장으로 끝내라(마크다운 금지). 이 규칙은 이 섹션 안에만 적용되는 것이고, 위의 bond·timing·strength 섹션은 각각 요청한 분량과 형식을 그대로 지켜서 절대 줄이지 마라.)` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 ${monthlyStrength ? 'bond, timing, strength, suggestion 네' : 'bond와 timing 두'} 섹션을 마커와 함께 전부 작성해.
`.trim();

  return { prompt, monthlyStrength, conclusion, liveSaturnHouse };
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { type, venus, mars, moon, saturn, myPlanets, partnerPlanets } = req.body;
    const isReunion       = type === 'reunion';
    const isCompatibility = type === 'compatibility';
    const isReunionKnown  = type === 'reunion-known';

    if (isCompatibility || isReunionKnown) {
      if (!myPlanets || !partnerPlanets) {
        return res.status(400).json({ error: '필수 파라미터(myPlanets, partnerPlanets)가 누락되었습니다.' });
      }
    } else if (!venus || !mars || !moon || (isReunion && !saturn)) {
      return res.status(400).json({ error: '필수 파라미터(venus, mars, moon)가 누락되었습니다.' });
    }

    let venusRetro = false;
    if (!isCompatibility) {
      try { venusRetro = isVenusRetrogradeNow(); } catch (e) { console.warn('금성 역행 계산 실패:', e.message); }
    }

    const isLove = !isReunionKnown && !isCompatibility && !isReunion;
    const built = isReunionKnown
      ? buildReunionKnownPrompt({ ...req.body, venusRetro })
      : isCompatibility
        ? buildCompatibilityPrompt(req.body)
        : isReunion
          ? buildReunionPrompt({ ...req.body, venusRetro })
          : buildLovePrompt({ ...req.body, venusRetro });
    const prompt = (isLove || isCompatibility || isReunion || isReunionKnown) ? built.prompt : built;
    const monthlyStrength = (isLove || isReunion || isReunionKnown) ? built.monthlyStrength : null;
    const conclusion = (isLove || isReunion || isReunionKnown) ? built.conclusion : null;
    const categoryGrades = isCompatibility ? built.categoryGrades : null;
    const liveSaturnHouse = (isReunion || isReunionKnown) ? built.liveSaturnHouse : null;
    // strength·suggestion 2개 섹션이 추가될 때만(연애 솔로, 재회 타이밍 신호 확보 시) 본문이 길어지므로 토큰 한도를 더 넉넉히 잡는다.
    const maxOutputTokens = monthlyStrength ? 6500 : 4096;

    // ═══════════════════════════════════════
    // Gemini API 호출 (시간차 이중 요청 — 1번을 먼저 쏘고, 1번이 실패하거나 5초가 지나면 2번을 쏜다.
    // 둘 중 먼저 성공하는 응답을 채택. 매 요청마다 무조건 3배를 쏘던 것보다 평소엔 요청량을 줄여
    // Gemini 쪽 분당 한도에 덜 부담을 주면서도, 진짜 막혔을 때는 빠르게 백업이 붙는다.)
    // ═══════════════════════════════════════
    const controllers = [];
    const fireAttempt = () => {
      const controller = new AbortController();
      controllers.push(controller);
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.9,
              maxOutputTokens,
            }
          })
        }
      ).then(async r => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        const json = await r.json();
        const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!reply) throw new Error(`빈 응답 (finishReason: ${json?.candidates?.[0]?.finishReason || '알수없음'})`);
        return reply;
      });
    };

    const attempt1 = fireAttempt();
    let secondAttempt = null;
    const fireSecond = () => { if (!secondAttempt) secondAttempt = fireAttempt(); return secondAttempt; };
    // 1번이 한도초과(429) 등으로 즉시 실패하면, 0.7초만 숨 고르고 2번을 쏜다(0초 만에 바로 재시도하면
    // 구글 쪽 분당 한도 윈도우가 아직 안 풀려 2번도 똑같이 막힐 확률이 높음).
    const earlyTrigger = new Promise(resolve => { attempt1.catch(() => setTimeout(resolve, 700)); });
    const timerTrigger = new Promise(resolve => setTimeout(resolve, 5000));
    const staggeredAttempt = Promise.race([earlyTrigger, timerTrigger]).then(fireSecond);

    // 1·2차가 둘 다 실패로 확정되면 3차를 한 번 더 쏜다(동시 3중 발사로 자체 과부하 유발 방지)
    let thirdAttempt = null;
    const fireThird = () => { if (!thirdAttempt) thirdAttempt = fireAttempt(); return thirdAttempt; };
    const bothFailedTrigger = Promise.allSettled([attempt1, staggeredAttempt]).then(results => {
      if (results.every(r => r.status === 'rejected')) return fireThird();
      throw new Error('다른 시도가 이미 성공함');
    });

    let reply, lastError;
    try {
      reply = await Promise.any([attempt1, staggeredAttempt, bothFailedTrigger]);
    } catch (aggErr) {
      lastError = aggErr;
    }
    controllers.forEach(c => c.abort());
    if (!reply) {
      console.error('Gemini API error (all parallel attempts failed):', lastError?.errors ? lastError.errors.map(e => e?.message || e).join(' | ') : (lastError?.message || lastError));
      return res.status(502).json({ error: '현재 접속자가 많아 응답이 지연되고 있습니다. 잠시만 기다리시거나, 버튼을 몇 번 더 시도해 주시면 정상적으로 이용하실 수 있습니다.' });
    }

    if (isLove) {
      const requiredMarkers = monthlyStrength
        ? ['===SECTION:nature===', '===SECTION:marriage===', '===SECTION:timing===', '===SECTION:strength===', '===SECTION:suggestion===']
        : ['===SECTION:nature===', '===SECTION:marriage===', '===SECTION:timing==='];
      if (requiredMarkers.some(marker => !reply.includes(marker))) {
        console.warn('연애운 AI 응답에 필수 섹션 마커 누락 — 원문 앞부분:', reply.slice(0, 300));
      }
    }
    if (isCompatibility && (!reply.includes('===SECTION:chemistry===') || !reply.includes('===SECTION:dynamics==='))) {
      console.warn('궁합 AI 응답에 필수 섹션 마커 누락 — 원문 앞부분:', reply.slice(0, 300));
    }
    if (isReunion) {
      const requiredMarkers = monthlyStrength
        ? ['===SECTION:pattern===', '===SECTION:timing===', '===SECTION:strength===', '===SECTION:suggestion===']
        : ['===SECTION:pattern===', '===SECTION:timing==='];
      if (requiredMarkers.some(marker => !reply.includes(marker))) {
        console.warn('재회운 AI 응답에 필수 섹션 마커 누락 — 원문 앞부분:', reply.slice(0, 300));
      }
    }
    if (isReunionKnown) {
      const requiredMarkers = monthlyStrength
        ? ['===SECTION:bond===', '===SECTION:timing===', '===SECTION:strength===', '===SECTION:suggestion===']
        : ['===SECTION:bond===', '===SECTION:timing==='];
      if (requiredMarkers.some(marker => !reply.includes(marker))) {
        console.warn('재회운(상대방 있음) AI 응답에 필수 섹션 마커 누락 — 원문 앞부분:', reply.slice(0, 300));
      }
    }

    const responseBody = { result: reply };
    if (!isCompatibility) responseBody.venusRetrograde = venusRetro;
    if (isLove || isReunion || isReunionKnown) { responseBody.monthlyStrength = monthlyStrength; responseBody.conclusion = conclusion; }
    if (isReunion || isReunionKnown) { responseBody.liveSaturnHouse = liveSaturnHouse; }
    if (isCompatibility) { responseBody.categoryGrades = categoryGrades; }
    return res.status(200).json(responseBody);

  } catch (error) {
    console.error('handler error:', error);
    return res.status(500).json({ error: 'AI 운세를 불러오는 중 오류가 발생했습니다.' });
  }
}
