/* =========================================================
   api/gemini-career.js  v1.0
   직업 — 취업·합격운 / 직장·승진운 / 이직·스카웃운 / 창업·부업운
   4종류를 type 분기로 처리 (연애와 동일 패턴, 새 계산 함수 없음)
   ========================================================= */

import Ephemeris from 'ephemeris';
import { applyCors } from './_cors.js';

function norm360(a) { return ((a % 360) + 360) % 360; }

// 오늘/내일 황경 비교로 역행 여부 판단 (지구중심, 출생지 무관 — 금성 역행 체크와 동일 방식)
function isRetrogradeNow(planetKey) {
  const today    = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const lonToday    = norm360(Ephemeris.getAllPlanets(today, 0, 0, 0).observed[planetKey].apparentLongitudeDd);
  const lonTomorrow = norm360(Ephemeris.getAllPlanets(tomorrow, 0, 0, 0).observed[planetKey].apparentLongitudeDd);
  let diff = lonTomorrow - lonToday;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff < 0;
}

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

// 강도 점수에 쓰는 에스펙트 판정 — 하우스 위치만으론 못 잡는 신호를 보강
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
function aspectStr(transitLon, natalLon, transitLabel, natalLabel) {
  const a = aspectName(transitLon, natalLon);
  if (!a) return `${transitLabel}-${natalLabel} 에스펙트: 없음`;
  const tone = _isHarmoniousAspect(a) ? '호의적' : _isChallengingAspect(a) ? '도전적' : '중립적';
  return `${transitLabel}-${natalLabel} 에스펙트: ${a} (${tone})`;
}
// 둘 중 하나라도 트랜짓 행성과 호의적/도전적 에스펙트면 점수 반영 (점이 null이면 무시)
function aspectScore(transitLon, natalLons) {
  for (const lon of natalLons) {
    const a = aspectName(transitLon, lon);
    if (_isHarmoniousAspect(a)) return 1;
    if (_isChallengingAspect(a)) return -1;
  }
  return 0;
}

// ── "올해의 흐름" 타임라인용 — 월별(day=15 샘플) 트랜짓 조회 ──
// astro-calc.js의 calcTransitsByYear가 만들어놓은 12개월 배열을 그대로 재사용 (새 정밀도 도입 없음)
function monthlyLon(transits, monthIdx, planetKey) {
  return transits?.[monthIdx]?.planets?.[planetKey]?.longitude ?? null;
}
function monthlyHouse(transits, monthIdx, planetKey) {
  return transits?.[monthIdx]?.planets?.[planetKey]?.house ?? null;
}
// app.js의 _retrogradeWindow와 동일한 "전월 대비 경도 차이가 음수면 역행" 판정을 월별 배열로 생성
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
// "이번달" 막대가 기존 "지금" 배지와 정확히 같은 값이 나오도록, 12개월 배열 중 이번달 인덱스만
// day-15 샘플이 아니라 실시간 Ephemeris 경도/하우스로 덮어쓴다 (다른 11개월은 그대로 day-15 샘플 유지 — 새 정밀도 도입 없음)
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
// scores(12개, 강도 점수 또는 호의신호 개수)와 현재월 인덱스로 타임라인 응답 객체 생성
function buildMonthlyStrength(scores, nowIdx) {
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  // 골든타임은 "그 해 안에서 가장 나쁘지 않은 달"이 아니라 "실제로 양(+)의 신호가 있는 달"이어야 한다.
  // 12개월이 전부 동점이거나(min===max), 최고점 자체가 0 이하(중립/부정적 신호뿐)면 강조할 달이 없는 게 맞다.
  const bestIndices = (min !== max && max > 0)
    ? scores.reduce((acc, s, i) => { if (s === max) acc.push(i); return acc; }, [])
    : [];
  return { scores, nowIdx, bestIndices };
}

// 골든타임(가장 점수 높은 달)이 "왜" 좋은지 — 실제로 그 달 점수에 기여한 신호 중 하나를 우선순위대로 골라 설명.
// 근거 없는 추측은 절대 만들지 않고, 해당 신호가 진짜로 그 달에 켜져 있을 때만 문구를 반환한다.
function jobHuntingReasonAt(m, ctx) {
  const { transits, eclipseMonth } = ctx;
  if (eclipseMonth === m) return '일식·월식이 가까운 시기';
  if ([6, 10].includes(monthlyHouse(transits, m, 'jupiter'))) return '목성이 취업·직장 영역(6·10하우스)을 지나는 시기';
  return null;
}
function promotionReasonAt(m, ctx) {
  const { transits, eclipseMonth } = ctx;
  if (eclipseMonth === m) return '일식·월식이 가까운 시기';
  if ([2, 10, 11].includes(monthlyHouse(transits, m, 'jupiter'))) return '목성이 승진·인정 영역(2·10·11하우스)을 지나는 시기';
  return null;
}
function startupReasonAt(m, ctx) {
  const { transits, eclipseMonth, natalJupiterLon } = ctx;
  if (eclipseMonth === m) return '일식·월식이 가까운 시기';
  const jLonM = monthlyLon(transits, m, 'jupiter');
  if (natalJupiterLon != null && jLonM != null && angularDistance(jLonM, natalJupiterLon) <= 5) return '목성 회귀(약 12년 주기 확장기)';
  if ([2, 8, 10].includes(monthlyHouse(transits, m, 'jupiter'))) return '목성이 창업·수익 영역(2·8·10하우스)을 지나는 시기';
  return null;
}
function jobChangeReasonAt(m, ctx) {
  const { transits, eclipseMonth, mcChanged, natalJupiterLon } = ctx;
  if (eclipseMonth === m) return '일식·월식이 가까운 시기';
  const jLonM = monthlyLon(transits, m, 'jupiter');
  if (natalJupiterLon != null && jLonM != null && angularDistance(jLonM, natalJupiterLon) <= 5) return '목성 회귀(약 12년 주기 확장기)';
  if (mcChanged) return '진행 MC가 전환되는 시기(경력 테마 전환기)';
  if ([1, 10].includes(monthlyHouse(transits, m, 'uranus'))) return '천왕성이 정체성·경력 영역(1·10하우스)을 지나는 시기';
  return null;
}

// AI 호출과 무관하게(추가 비용·지연 없이) 이미 계산된 monthlyStrength로부터 "결론" 데이터를 만든다.
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

// 4개 기능 각각의 점수식 — "몇 번째 달인지"만 받아서 그 달 기준으로 계산.
// "지금" 강도도 이 함수에 nowMonthIdx를 넣어 호출하므로, 배지 값과 타임라인의 이번달 막대가 항상 일치한다.
function jobHuntingScoreAt(monthIdx, ctx) {
  const { transits, mercuryLon, eclipseMonth, mercuryRetroFlags } = ctx;
  let s = 0;
  if ([6, 10].includes(monthlyHouse(transits, monthIdx, 'jupiter'))) s += 1;
  if ([6, 10].includes(monthlyHouse(transits, monthIdx, 'saturn'))) s -= 1;
  if (mercuryRetroFlags?.[monthIdx]) s -= 1;
  if (eclipseMonth === monthIdx) s += 1;
  s += aspectScore(monthlyLon(transits, monthIdx, 'jupiter'), [mercuryLon]);
  s += aspectScore(monthlyLon(transits, monthIdx, 'saturn'), [mercuryLon]);
  return s;
}
function promotionScoreAt(monthIdx, ctx) {
  const { transits, mcLon, sunLon, eclipseMonth, marsRetroFlags } = ctx;
  let s = 0;
  if ([2, 10, 11].includes(monthlyHouse(transits, monthIdx, 'jupiter'))) s += 1;
  if ([10, 12].includes(monthlyHouse(transits, monthIdx, 'saturn'))) s -= 1;
  if (eclipseMonth === monthIdx) s += 1;
  s += aspectScore(monthlyLon(transits, monthIdx, 'jupiter'), [mcLon, sunLon]);
  s += aspectScore(monthlyLon(transits, monthIdx, 'saturn'), [mcLon, sunLon]);
  if (marsRetroFlags?.[monthIdx]) s -= 1;
  return s;
}
function startupScoreAt(monthIdx, ctx) {
  const { transits, marsLon, eclipseMonth, jupiterRetroFlags, natalJupiterLon } = ctx;
  let s = 0;
  if ([2, 8, 10].includes(monthlyHouse(transits, monthIdx, 'jupiter'))) s += 1;
  if ([2, 8, 10].includes(monthlyHouse(transits, monthIdx, 'saturn'))) s -= 1;
  if (eclipseMonth === monthIdx) s += 1;
  s += aspectScore(monthlyLon(transits, monthIdx, 'jupiter'), [marsLon]);
  s += aspectScore(monthlyLon(transits, monthIdx, 'saturn'), [marsLon]);
  if (jupiterRetroFlags?.[monthIdx]) s -= 1;
  const jLonM = monthlyLon(transits, monthIdx, 'jupiter');
  if (natalJupiterLon != null && jLonM != null && angularDistance(jLonM, natalJupiterLon) <= 5) s += 1;
  return s;
}
function jobChangeFavCountAt(monthIdx, ctx) {
  const { transits, mcLon, ascLon, eclipseMonth, natalJupiterLon, mcChanged } = ctx;
  const uranusHouseFav = [1, 10].includes(monthlyHouse(transits, monthIdx, 'uranus'));
  const uranusLonM = monthlyLon(transits, monthIdx, 'uranus');
  const uranusAspectFav = [mcLon, ascLon].some(lon => {
    const a = aspectName(uranusLonM, lon);
    return a === '합' || _isHarmoniousAspect(a);
  });
  const jLonM = monthlyLon(transits, monthIdx, 'jupiter');
  const jupiterReturnActiveM = natalJupiterLon != null && jLonM != null && angularDistance(jLonM, natalJupiterLon) <= 5;
  return [uranusHouseFav, !!mcChanged, jupiterReturnActiveM, uranusAspectFav, eclipseMonth === monthIdx].filter(Boolean).length;
}

// 직업 4종류 공통 — "지금 하늘" 시그널 한 번에 계산 (Ephemeris 호출, 새 계산 파일 불필요)
function computeCareerSkySignals(houses, natalJupiterLon) {
  const uranusLon = currentLongitude('uranus');
  const uranusHouse = (houses && houses.length === 12) ? getHouseOf(uranusLon, houses) : null;

  let jupiterReturnActive = false;
  if (natalJupiterLon != null) {
    const jupiterLon = currentLongitude('jupiter');
    jupiterReturnActive = angularDistance(jupiterLon, natalJupiterLon) <= 5;
  }

  return {
    mercuryRetro: isRetrogradeNow('mercury'),
    marsRetro:    isRetrogradeNow('mars'),
    jupiterRetro: isRetrogradeNow('jupiter'),
    uranusHouse,
    jupiterReturnActive,
  };
}

function eclipseStr(eclipseSignal) {
  if (!eclipseSignal) return '올해 경력 관련 일식/월식 시그널 없음';
  const d = new Date(eclipseSignal.dateLocal);
  const dateStr = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${dateStr} ${eclipseSignal.type}이 ${eclipseSignal.conjunctPoint}에 근접 — 경력의 중요한 전환점으로 해석 가능`;
}

// 목성·토성처럼 느린 행성의 하우스 체류 구간을 "몇 월부터 몇 월까지"로 문장화
function transitWindowStr(win, label) {
  if (!win) return `${label}: 정보 없음`;
  const enter = win.enterKnown ? `${win.enterMonthLabel}부터` : '올해 시작 전부터 이미';
  const exit  = win.exitKnown  ? `${win.exitMonthLabel}에 다음 하우스로 이동` : '연말까지 이 흐름 유지';
  return `${label} ${win.house}하우스 — ${enter} 머무는 중(현재 ${win.monthsInSoFar}개월째), ${exit}`;
}

// 화성·목성 역행이 지금 진행 중이면 그 구간을 "몇 월부터 몇 월까지"로 문장화 (역행 아니면 null)
function retroWindowStr(win, label) {
  if (!win) return null;
  const enter = win.enterKnown ? `${win.enterMonthLabel}부터` : '올해 시작 전부터';
  const exit  = win.exitKnown  ? `${win.exitMonthLabel}에 순행으로 전환` : '연말까지 역행 지속';
  return `${label} 역행 — ${enter} ${exit}`;
}

// AI가 매번 "강함"으로만 판정하는 긍정 편향을 막기 위해, 강도를 AI 판단이 아니라
// 실제 신호 점수로 코드에서 먼저 확정한다. AI는 이 결과를 설명만 한다.
function strengthFromScore(score) {
  if (score >= 1) return '강함';
  if (score <= -1) return '약함';
  return '보통';
}
// 직장·승진운은 +1 신호(목성 하우스/일식)가 -1 신호보다 구조적으로 더 자주 나와서
// 일반 임계값(>=1)을 쓰면 "강함"이 과대 표집됨 — 실제 데이터 시뮬레이션으로 확인 후 기준을 높임
function strengthFromScoreStrict(score) {
  if (score >= 2) return '강함';
  if (score <= -1) return '약함';
  return '보통';
}

/* =========================================================
   1) 취업·합격운
   ========================================================= */
function buildJobHuntingPrompt(body, sky) {
  const {
    name, gender, ascSign, ascRuler, mcSign, mcRuler, progMcSign,
    house6Sign, house6Occupants, house6Ruler, house10Sign, house10Occupants,
    mercury, mars, jupiterSign, saturn, eclipseSignal,
    jupiterTransitWindow, saturnTransitWindow, transits, houses
  } = body;

  const displayName = name?.trim() || '당신';
  const genderKr = gender === 'M' ? '남성' : '여성';

  const house6Str = `${house6Sign}${house6Occupants?.length ? ` (${house6Occupants.join(', ')} 위치)` : ''}, 지배행성 ${house6Ruler?.label || '?'}(${house6Ruler?.sign || '?'})`;

  const nowMonthIdx = new Date().getMonth();
  const mercuryRetroFlags = monthlyRetroFlags(transits, 'mercury');
  if (mercuryRetroFlags) mercuryRetroFlags[nowMonthIdx] = sky.mercuryRetro;
  const ctx = {
    transits: patchedTransitsForNow(transits, houses, nowMonthIdx, ['jupiter', 'saturn']),
    mercuryLon: mercury.longitude,
    eclipseMonth: eclipseMonthIndex(eclipseSignal),
    mercuryRetroFlags,
  };
  const monthlyScores = Array.from({ length: 12 }, (_, m) => jobHuntingScoreAt(m, ctx));
  const strengthScore = monthlyScores[nowMonthIdx];
  const strengthFixed = strengthFromScore(strengthScore);
  const monthlyStrength = buildMonthlyStrength(monthlyScores, nowMonthIdx);
  const conclusion = buildConclusion(monthlyStrength, strengthFixed, jobHuntingReasonAt, ctx);
  const house10Str = `${house10Sign}(MC)${house10Occupants?.length ? ` (${house10Occupants.join(', ')} 위치)` : ''}`;

  const prompt = `
너는 20년 경력의 서양 점성술 전문가야.
아래 차트 데이터를 바탕으로 ${displayName}님(${genderKr})의 "취업·합격운" 리포트를 작성해.
(취준·시험·면접의 타이밍에 초점 — 일반적인 직업운 전반이 아니라 "지금 합격/채용에 가까워지고 있는가"에 집중해.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[타고난 취업 기질]
6하우스(일상 업무·고용): ${house6Str}
10하우스(MC, 경력 정체성): ${house10Str}
차트 지배행성(ASC ${ascSign}): ${ascRuler?.label || '?'} — ${ascRuler?.sign || '?'} ${ascRuler?.house || '?'}하우스
MC 지배행성: ${mcRuler?.label || '?'} — ${mcRuler?.sign || '?'} ${mcRuler?.house || '?'}하우스
수성(시험·면접·소통): ${mercury.sign} ${mercury.house}하우스
화성(경쟁력·추진력): ${mars.sign} ${mars.house}하우스
목성(기회 포착력): ${jupiterSign}
토성(인내·끈기): ${saturn.sign} ${saturn.house}하우스

[지금 시점의 타이밍 신호]
${transitWindowStr(jupiterTransitWindow, '트랜짓 목성')} (채용 행운기 여부)
${transitWindowStr(saturnTransitWindow, '트랜짓 토성')} (결과가 시험받는 시기 여부)
${aspectStr(currentLongitude('jupiter'), mercury.longitude, '트랜짓 목성', '나탈 수성')}
${aspectStr(currentLongitude('saturn'), mercury.longitude, '트랜짓 토성', '나탈 수성')}
수성 역행 여부: ${sky.mercuryRetro ? '역행 중 — 전통적으로 면접·계약·서류에 불리하거나 재시도가 필요한 시기' : '순행 중'}
프로그레션 MC: ${progMcSign || '정보 없음'} (나탈 MC ${mcSign}과 다르면 경력 테마 전환기)
${eclipseStr(eclipseSignal)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 실제 취업 활동의 느낌으로 번역해라.
2. ${displayName}님의 관점에서 구체적으로 써라. 일반적인 상투어 금지.
3. "~할 수 있습니다" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 예언(예: "반드시 합격한다")은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 헤더(#) 사용 금지 — **볼드**만 사용.

[섹션 구성 — 반드시 아래 4개 마커를 정확히 그대로 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라. 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:nature===
(타고난 취업 기질 — 6하우스·10하우스·수성·화성·토성이 보여주는 ${displayName}님만의 취업 활동 스타일과 강점)
분량: 4~5문단, 각 문단 3~4문장

===SECTION:timing===
(지금이 합격·면접에 유리한 시기인지 — 트랜짓 목성/토성, 수성 역행, 프로그레션 MC, 일식/월식 종합)
지금 시기의 강도는 이미 "${strengthFixed}"로 확정되어 있다. 이 글의 어조와 결론이 그 강도와 어긋나지 않게 써라(강함이면 긍정적으로, 약함이면 신중론으로, 보통이면 균형있게).
구체적으로 어떻게 준비/행동하면 좋을지 실질적인 조언 포함
분량: 3~4문단

===SECTION:strength===
(아래 한 단어를 정확히 그대로, 다른 말 절대 덧붙이지 말고 출력: "${strengthFixed}")

===SECTION:suggestion===
(위에서 정해진 강도·흐름·시기 신호를 바탕으로 한 줄 제안. 직접적인 행동 지시("~하세요", "지원하세요", "기다리세요" 등 명령형)는 절대 쓰지 말고, 돌려서 말하는 부드러운 제안을 딱 한 문장으로 적어라.
예시 톤: "서두르기보다 신호가 강해지는 시점에 맞춰 움직여보는 것도 방법입니다." 같은 느낌.
한 문장만, 마크다운 금지, 그 문장 외 다른 설명 없이.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 nature·timing·strength·suggestion 4개 섹션을 마커와 함께 전부 작성해.
`.trim();

  return { prompt, monthlyStrength, conclusion };
}

/* =========================================================
   2) 직장·승진운
   ========================================================= */
function buildPromotionPrompt(body, sky) {
  const {
    name, gender, mcSign, mcRuler, house10Occupants,
    saturn, sun, mars, venus, house11Sign, house11Occupants, house12Sign,
    house2Sign, house2Occupants, house2Ruler, jupiterSign,
    eclipseSignal, jupiterTransitWindow, saturnTransitWindow, marsRetroWindow, mcLon, transits, houses
  } = body;

  const displayName = name?.trim() || '당신';
  const genderKr = gender === 'M' ? '남성' : '여성';

  const house10Str = `${mcSign}(MC)${house10Occupants?.length ? ` (${house10Occupants.join(', ')} 위치)` : ''}, 지배행성 ${mcRuler?.label || '?'}(${mcRuler?.sign || '?'} ${mcRuler?.house || '?'}하우스)`;
  const house11Str = `${house11Sign}${house11Occupants?.length ? ` (${house11Occupants.join(', ')} 위치)` : ''}`;
  const house2Str  = `${house2Sign}${house2Occupants?.length ? ` (${house2Occupants.join(', ')} 위치)` : ''}, 지배행성 ${house2Ruler?.label || '?'}(${house2Ruler?.sign || '?'})`;
  const marsRetroStr = retroWindowStr(marsRetroWindow, '화성');

  const nowMonthIdx = new Date().getMonth();
  const marsRetroFlags = monthlyRetroFlags(transits, 'mars');
  if (marsRetroFlags) marsRetroFlags[nowMonthIdx] = sky.marsRetro;
  const ctx = {
    transits: patchedTransitsForNow(transits, houses, nowMonthIdx, ['jupiter', 'saturn']),
    mcLon, sunLon: sun.longitude,
    eclipseMonth: eclipseMonthIndex(eclipseSignal),
    marsRetroFlags,
  };
  const monthlyScores = Array.from({ length: 12 }, (_, m) => promotionScoreAt(m, ctx));
  const strengthScore = monthlyScores[nowMonthIdx];
  const strengthFixed = strengthFromScoreStrict(strengthScore);
  const monthlyStrength = buildMonthlyStrength(monthlyScores, nowMonthIdx);
  const conclusion = buildConclusion(monthlyStrength, strengthFixed, promotionReasonAt, ctx);

  const prompt = `
너는 20년 경력의 서양 점성술 전문가야.
아래 차트 데이터를 바탕으로 ${displayName}님(${genderKr})의 "직장·승진운" 리포트를 작성해.
(연봉 협상·사내 인간관계·승진 타이밍에 초점.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[타고난 직장 내 위치]
10하우스(MC, 경력 정체성): ${house10Str}
토성(체계·권위에서 인정받는 방식): ${saturn.sign} ${saturn.house}하우스
태양(인정·가시성): ${sun.sign} ${sun.house}하우스
화성(협상력·추진력): ${mars.sign} ${mars.house}하우스
금성(처세·친화력): ${venus.sign} ${venus.house}하우스
11하우스(인맥·동료 지지): ${house11Str}
12하우스(숨은 정치·견제): ${house12Sign}
2하우스(소득·연봉협상력): ${house2Str}
목성(확장·인정받는 기회운): ${jupiterSign}

[지금 시점의 승진·협상 타이밍 신호]
${transitWindowStr(saturnTransitWindow, '트랜짓 토성')} (전통적 "승진 시험" 시그널 — MC/10하우스 근접 시 강함)
${transitWindowStr(jupiterTransitWindow, '트랜짓 목성')} (확장·인정기 여부)
${aspectStr(currentLongitude('jupiter'), mcLon, '트랜짓 목성', '나탈 MC')}
${aspectStr(currentLongitude('saturn'), sun.longitude, '트랜짓 토성', '나탈 태양')}
화성 역행 여부: ${sky.marsRetro ? (marsRetroStr || '역행 중') + ' — 협상·assertive한 행동을 서두르면 역효과 가능' : '순행 중'}
${eclipseStr(eclipseSignal)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 실제 직장 생활의 느낌으로 번역해라.
2. ${displayName}님의 관점에서 구체적으로 써라. 일반적인 상투어 금지.
3. "~할 수 있습니다" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 예언은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 헤더(#) 사용 금지 — **볼드**만 사용.

[섹션 구성 — 반드시 아래 4개 마커를 정확히 그대로 사용해서 구분할 것]
마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:nature===
(타고난 직장 스타일과 인간관계 — 10하우스·토성·태양·화성·금성·11/12하우스·2하우스·목성이 보여주는 ${displayName}님만의 직장 내 위치와 처세)
분량: 4~5문단

===SECTION:timing===
(지금이 승진·연봉협상에 유리한 시기인지 — 트랜짓 토성/목성, 화성 역행, 일식/월식 종합)
지금 시기의 강도는 이미 "${strengthFixed}"로 확정되어 있다. 이 글의 어조와 결론이 그 강도와 어긋나지 않게 써라(강함이면 긍정적으로, 약함이면 신중론으로, 보통이면 균형있게).
구체적인 협상 타이밍·행동 조언 포함
분량: 3~4문단

===SECTION:strength===
(아래 한 단어를 정확히 그대로, 다른 말 절대 덧붙이지 말고 출력: "${strengthFixed}")

===SECTION:suggestion===
(위에서 정해진 강도·흐름·시기 신호를 바탕으로 한 줄 제안. 직접적인 행동 지시("~하세요", "협상하세요", "기다리세요" 등 명령형)는 절대 쓰지 말고, 돌려서 말하는 부드러운 제안을 딱 한 문장으로 적어라.
예시 톤: "서두르기보다 신호가 강해지는 시점에 맞춰 움직여보는 것도 방법입니다." 같은 느낌.
한 문장만, 마크다운 금지, 그 문장 외 다른 설명 없이.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 nature·timing·strength·suggestion 4개 섹션을 마커와 함께 전부 작성해.
`.trim();

  return { prompt, monthlyStrength, conclusion };
}

/* =========================================================
   3) 이직·스카웃운
   ========================================================= */
function buildJobChangePrompt(body, sky) {
  const {
    name, gender, mcSign, progMcSign, uranus, northNodeSign, northNodeHouse,
    house9Sign, eclipseSignal, uranusTransitWindow, jupiterSign, mcLon, ascLon, jupiter, transits, houses
  } = body;

  const displayName = name?.trim() || '당신';
  const genderKr = gender === 'M' ? '남성' : '여성';
  const mcChanged = progMcSign && progMcSign !== mcSign;

  // 트랜짓 천왕성이 나탈 MC·ASC(정체성·출발점)와 합/트라인/섹스타일인지는 jobChangeFavCountAt 안에서 월별로 판단
  const uranusLonNow = currentLongitude('uranus');

  const nowMonthIdx = new Date().getMonth();
  const ctx = {
    transits: patchedTransitsForNow(transits, houses, nowMonthIdx, ['uranus', 'jupiter']),
    mcLon, ascLon, mcChanged,
    natalJupiterLon: jupiter?.longitude,
    eclipseMonth: eclipseMonthIndex(eclipseSignal),
  };
  const monthlyScores = Array.from({ length: 12 }, (_, m) => jobChangeFavCountAt(m, ctx));
  const favorableCount = monthlyScores[nowMonthIdx];
  // 5개 항목 중 호의신호가 3개 이상이어야 "강함"인 기준은 시뮬레이션 결과 너무 엄격해서(강함이 거의 안 나옴) 2개로 완화
  const strengthFixed = favorableCount >= 2 ? '강함' : favorableCount === 0 ? '약함' : '보통';
  const monthlyStrength = buildMonthlyStrength(monthlyScores, nowMonthIdx);
  const conclusion = buildConclusion(monthlyStrength, strengthFixed, jobChangeReasonAt, ctx);

  const prompt = `
너는 20년 경력의 서양 점성술 전문가야.
아래 차트 데이터를 바탕으로 ${displayName}님(${genderKr})의 "이직·스카웃운" 리포트를 작성해.
(커리어 점프·헤드헌팅 제안·오퍼 수락 여부의 타이밍에 초점 — 단순 직장운이 아니라 "지금 떠나도 되는가"에 집중해.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[타고난 이직 패턴]
천왕성(돌발적 변화·혁신 욕구): ${uranus.sign} ${uranus.house}하우스
북노드(인생 방향·운명적 경로): ${northNodeSign} ${northNodeHouse}하우스
9하우스(확장·도약형 이동): ${house9Sign}
나탈 MC: ${mcSign}
목성(기회를 알아채고 잡는 타고난 감각): ${jupiterSign}

[지금 시점의 이직 타이밍 신호]
${transitWindowStr(uranusTransitWindow, '트랜짓 천왕성')} (MC·태양·10하우스 근접 시 급작스런 제안/변화 가능성 강함)
${aspectStr(uranusLonNow, mcLon, '트랜짓 천왕성', '나탈 MC')}
${aspectStr(uranusLonNow, ascLon, '트랜짓 천왕성', '나탈 ASC')}
프로그레션 MC: ${progMcSign || '정보 없음'}${mcChanged ? ' — 나탈 MC와 달라짐 (경력 테마 전환기, 떠날 준비가 된 시기로 해석 가능)' : ' — 나탈 MC와 동일 (아직 전환기 아님)'}
목성 회귀 진행 중인가(나탈 목성 위치로 트랜짓 목성이 돌아옴, ~12년 주기): ${sky.jupiterReturnActive ? '예 — 확장·기회의 시기' : '아니오'}
${eclipseStr(eclipseSignal)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 실제 이직 결정의 느낌으로 번역해라.
2. ${displayName}님의 관점에서 구체적으로 써라. 일반적인 상투어 금지.
3. "~할 수 있습니다" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 예언(예: "반드시 이직한다")은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 헤더(#) 사용 금지 — **볼드**만 사용.

[섹션 구성 — 반드시 아래 4개 마커를 정확히 그대로 사용해서 구분할 것]
마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:nature===
(타고난 이직 패턴 — 천왕성·북노드·9하우스·목성이 보여주는 ${displayName}님만의 커리어 점프 스타일)
분량: 4~5문단

===SECTION:timing===
(지금이 이직·스카웃 제안을 받아들이기 좋은 시기인지 — 트랜짓 천왕성, 프로그레션 MC 전환, 목성 회귀, 일식/월식 종합)
지금 시기의 강도는 이미 "${strengthFixed}"로 확정되어 있다. 이 글의 어조와 결론이 그 강도와 어긋나지 않게 써라(강함이면 긍정적으로, 약함이면 신중론으로, 보통이면 균형있게).
오퍼를 받았을 때 어떻게 판단하면 좋을지 실질적인 조언 포함
분량: 3~4문단

===SECTION:strength===
(아래 한 단어를 정확히 그대로, 다른 말 절대 덧붙이지 말고 출력: "${strengthFixed}")

===SECTION:suggestion===
(위에서 정해진 강도·흐름·시기 신호를 바탕으로 한 줄 제안. 직접적인 행동 지시("~하세요", "받아들이세요", "기다리세요" 등 명령형)는 절대 쓰지 말고, 돌려서 말하는 부드러운 제안을 딱 한 문장으로 적어라.
예시 톤: "서두르기보다 신호가 강해지는 시점에 맞춰 움직여보는 것도 방법입니다." 같은 느낌.
한 문장만, 마크다운 금지, 그 문장 외 다른 설명 없이.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 nature·timing·strength·suggestion 4개 섹션을 마커와 함께 전부 작성해.
`.trim();

  return { prompt, monthlyStrength, conclusion };
}

/* =========================================================
   4) 창업·부업운
   ========================================================= */
function buildStartupPrompt(body, sky) {
  const {
    name, gender, house2Sign, house2Occupants, house2Ruler,
    house8Sign, house8Occupants, house8Ruler,
    mars, jupiterSign, sun, house5Sign, eclipseSignal,
    jupiterTransitWindow, saturnTransitWindow, jupiterRetroWindow,
    mcSign, mcRuler, saturn, jupiter, transits, houses
  } = body;

  const displayName = name?.trim() || '당신';
  const genderKr = gender === 'M' ? '남성' : '여성';

  const house2Str = `${house2Sign}${house2Occupants?.length ? ` (${house2Occupants.join(', ')} 위치)` : ''}, 지배행성 ${house2Ruler?.label || '?'}(${house2Ruler?.sign || '?'})`;
  const house8Str = `${house8Sign}${house8Occupants?.length ? ` (${house8Occupants.join(', ')} 위치)` : ''}, 지배행성 ${house8Ruler?.label || '?'}(${house8Ruler?.sign || '?'})`;
  const jupiterRetroStr = retroWindowStr(jupiterRetroWindow, '목성');

  const nowMonthIdx = new Date().getMonth();
  const jupiterRetroFlags = monthlyRetroFlags(transits, 'jupiter');
  if (jupiterRetroFlags) jupiterRetroFlags[nowMonthIdx] = sky.jupiterRetro;
  const ctx = {
    transits: patchedTransitsForNow(transits, houses, nowMonthIdx, ['jupiter', 'saturn']),
    marsLon: mars.longitude,
    eclipseMonth: eclipseMonthIndex(eclipseSignal),
    jupiterRetroFlags,
    natalJupiterLon: jupiter?.longitude,
  };
  const monthlyScores = Array.from({ length: 12 }, (_, m) => startupScoreAt(m, ctx));
  const strengthScore = monthlyScores[nowMonthIdx];
  const strengthFixed = strengthFromScore(strengthScore);
  const monthlyStrength = buildMonthlyStrength(monthlyScores, nowMonthIdx);
  const conclusion = buildConclusion(monthlyStrength, strengthFixed, startupReasonAt, ctx);

  const prompt = `
너는 20년 경력의 서양 점성술 전문가야.
아래 차트 데이터를 바탕으로 ${displayName}님(${genderKr})의 "창업·부업운" 리포트를 작성해.
(N잡러·개인 사업의 시작 타이밍에 초점 — 일반적인 재물운이 아니라 "지금 시작해도 되는가"에 집중해.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[타고난 사업가 기질]
2하우스(자기자본): ${house2Str}
8하우스(투자·타인자본·리스크): ${house8Str}
화성(추진력·기업가 기질): ${mars.sign} ${mars.house}하우스
목성(과감함·확장운): ${jupiterSign}
태양(브랜드·리더십): ${sun.sign} ${sun.house}하우스
5하우스(투기·창의적 사업): ${house5Sign}
MC(나만의 사업 정체성): ${mcSign}, 지배행성 ${mcRuler?.label || '?'}(${mcRuler?.sign || '?'} ${mcRuler?.house || '?'}하우스)
토성(장기 생존력·버텨내는 힘): ${saturn.sign} ${saturn.house}하우스

[지금 시점의 창업 타이밍 신호]
${transitWindowStr(jupiterTransitWindow, '트랜짓 목성')} (2/8/10하우스 근접 시 재정 확장기)
${transitWindowStr(saturnTransitWindow, '트랜짓 토성')} (아직 다져야 할 시기인지 신호)
${aspectStr(currentLongitude('jupiter'), mars.longitude, '트랜짓 목성', '나탈 화성')}
${aspectStr(currentLongitude('saturn'), mars.longitude, '트랜짓 토성', '나탈 화성')}
목성 역행 여부: ${sky.jupiterRetro ? (jupiterRetroStr || '역행 중') + ' — 확장이 둔화되는 시기, 신중한 준비기로 해석' : '순행 중'}
목성 회귀 진행 중인가(~12년 주기): ${sky.jupiterReturnActive ? '예 — 확장·기회의 시기' : '아니오'}
${eclipseStr(eclipseSignal)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 실제 창업·부업 활동의 느낌으로 번역해라.
2. ${displayName}님의 관점에서 구체적으로 써라. 일반적인 상투어 금지.
3. "~할 수 있습니다" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 예언(예: "반드시 성공한다")은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 헤더(#) 사용 금지 — **볼드**만 사용.

[섹션 구성 — 반드시 아래 4개 마커를 정확히 그대로 사용해서 구분할 것]
마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:nature===
(타고난 사업가 기질 — 2/8/5하우스·화성·목성·태양·MC·토성이 보여주는 ${displayName}님만의 창업·부업 스타일)
분량: 4~5문단

===SECTION:timing===
(지금이 시작하기 좋은 시기인지 — 트랜짓 목성/토성, 목성 역행, 목성 회귀, 일식/월식 종합)
지금 시기의 강도는 이미 "${strengthFixed}"로 확정되어 있다. 이 글의 어조와 결론이 그 강도와 어긋나지 않게 써라(강함이면 긍정적으로, 약함이면 신중론으로, 보통이면 균형있게).
구체적으로 어떻게 준비하면 좋을지 실질적인 조언 포함
분량: 3~4문단

===SECTION:strength===
(아래 한 단어를 정확히 그대로, 다른 말 절대 덧붙이지 말고 출력: "${strengthFixed}")

===SECTION:suggestion===
(위에서 정해진 강도·흐름·시기 신호를 바탕으로 한 줄 제안. 직접적인 행동 지시("~하세요", "시작하세요", "기다리세요" 등 명령형)는 절대 쓰지 말고, 돌려서 말하는 부드러운 제안을 딱 한 문장으로 적어라.
예시 톤: "서두르기보다 신호가 강해지는 시점에 맞춰 움직여보는 것도 방법입니다." 같은 느낌.
한 문장만, 마크다운 금지, 그 문장 외 다른 설명 없이.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 nature·timing·strength·suggestion 4개 섹션을 마커와 함께 전부 작성해.
`.trim();

  return { prompt, monthlyStrength, conclusion };
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { type, houses, jupiter } = req.body;
    const VALID_TYPES = ['job-hunting', 'promotion', 'job-change', 'startup'];
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'type 값이 올바르지 않습니다. (job-hunting/promotion/job-change/startup)' });
    }

    let sky;
    try {
      sky = computeCareerSkySignals(houses, jupiter?.longitude);
    } catch (e) {
      console.warn('직업 천체 시그널 계산 실패:', e.message);
      sky = { mercuryRetro: false, marsRetro: false, jupiterRetro: false, uranusHouse: null, jupiterReturnActive: false };
    }

    const { prompt, monthlyStrength, conclusion } =
      type === 'job-hunting' ? buildJobHuntingPrompt(req.body, sky)
    : type === 'promotion'   ? buildPromotionPrompt(req.body, sky)
    : type === 'job-change'  ? buildJobChangePrompt(req.body, sky)
    : buildStartupPrompt(req.body, sky);

    // ═══════════════════════════════════════
    // Gemini API 호출 (3개 동시 요청 → 가장 먼저 성공하는 것 사용)
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
              maxOutputTokens: 4096,
            }
          })
        }
      ).then(async r => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        const json = await r.json();
        const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!reply) throw new Error('빈 응답');
        return reply;
      });
    };

    let reply, lastError;
    try {
      reply = await Promise.any([fireAttempt(), fireAttempt(), fireAttempt()]);
    } catch (aggErr) {
      lastError = aggErr;
    }
    controllers.forEach(c => c.abort());
    if (!reply) {
      console.error('Gemini API error (all parallel attempts failed):', lastError?.errors ? lastError.errors.map(e => e?.message || e).join(' | ') : (lastError?.message || lastError));
      return res.status(502).json({ error: '현재 접속자가 많아 응답이 지연되고 있습니다. 잠시만 기다리시거나, 버튼을 몇 번 더 시도해 주시면 정상적으로 이용하실 수 있습니다.' });
    }

    return res.status(200).json({ result: reply, monthlyStrength, conclusion });

  } catch (error) {
    console.error('handler error:', error);
    return res.status(500).json({ error: 'AI 운세를 불러오는 중 오류가 발생했습니다.' });
  }
}
