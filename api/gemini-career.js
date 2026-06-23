/* =========================================================
   api/gemini-career.js  v1.0
   직업 — 취업·합격운 / 직장·승진운 / 이직·스카웃운 / 창업·부업운
   4종류를 type 분기로 처리 (연애와 동일 패턴, 새 계산 함수 없음)
   ========================================================= */

import Ephemeris from 'ephemeris';

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

/* =========================================================
   1) 취업·합격운
   ========================================================= */
function buildJobHuntingPrompt(body, sky) {
  const {
    name, gender, ascSign, ascRuler, mcSign, mcRuler, progMcSign,
    house6Sign, house6Occupants, house6Ruler, house10Sign, house10Occupants,
    mercury, mars, jupiterSign, saturn, transitNow, eclipseSignal
  } = body;

  const displayName = name?.trim() || '당신';
  const genderKr = gender === 'M' ? '남성' : '여성';

  const house6Str = `${house6Sign}${house6Occupants?.length ? ` (${house6Occupants.join(', ')} 위치)` : ''}, 지배행성 ${house6Ruler?.label || '?'}(${house6Ruler?.sign || '?'})`;
  const house10Str = `${house10Sign}(MC)${house10Occupants?.length ? ` (${house10Occupants.join(', ')} 위치)` : ''}`;

  const transitJupiterHouse = transitNow?.planets?.jupiter?.house;
  const transitSaturnHouse  = transitNow?.planets?.saturn?.house;

  return `
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
트랜짓 목성이 닿은 하우스: ${transitJupiterHouse ? transitJupiterHouse + '하우스' : '정보 없음'} (채용 행운기 여부)
트랜짓 토성이 닿은 하우스: ${transitSaturnHouse ? transitSaturnHouse + '하우스' : '정보 없음'} (결과가 시험받는 시기 여부)
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

[섹션 구성 — 반드시 아래 2개 마커를 정확히 그대로 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라. 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:nature===
(타고난 취업 기질 — 6하우스·10하우스·수성·화성·토성이 보여주는 ${displayName}님만의 취업 활동 스타일과 강점)
분량: 4~5문단, 각 문단 3~4문장

===SECTION:timing===
(지금이 합격·면접에 유리한 시기인지 — 트랜짓 목성/토성, 수성 역행, 프로그레션 MC, 일식/월식 종합)
구체적으로 어떻게 준비/행동하면 좋을지 실질적인 조언 포함
분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 nature와 timing 두 섹션을 마커와 함께 전부 작성해.
`.trim();
}

/* =========================================================
   2) 직장·승진운
   ========================================================= */
function buildPromotionPrompt(body, sky) {
  const {
    name, gender, mcSign, mcRuler, house10Occupants,
    saturn, sun, mars, venus, house11Sign, house11Occupants, house12Sign,
    transitNow, eclipseSignal
  } = body;

  const displayName = name?.trim() || '당신';
  const genderKr = gender === 'M' ? '남성' : '여성';

  const house10Str = `${mcSign}(MC)${house10Occupants?.length ? ` (${house10Occupants.join(', ')} 위치)` : ''}, 지배행성 ${mcRuler?.label || '?'}(${mcRuler?.sign || '?'} ${mcRuler?.house || '?'}하우스)`;
  const house11Str = `${house11Sign}${house11Occupants?.length ? ` (${house11Occupants.join(', ')} 위치)` : ''}`;

  const transitSaturnHouse  = transitNow?.planets?.saturn?.house;
  const transitJupiterHouse = transitNow?.planets?.jupiter?.house;

  return `
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

[지금 시점의 승진·협상 타이밍 신호]
트랜짓 토성이 닿은 하우스: ${transitSaturnHouse ? transitSaturnHouse + '하우스' : '정보 없음'} (전통적 "승진 시험" 시그널 — MC/10하우스 근접 시 강함)
트랜짓 목성이 닿은 하우스: ${transitJupiterHouse ? transitJupiterHouse + '하우스' : '정보 없음'} (확장·인정기 여부)
화성 역행 여부: ${sky.marsRetro ? '역행 중 — 협상·assertive한 행동을 서두르면 역효과 가능' : '순행 중'}
${eclipseStr(eclipseSignal)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 실제 직장 생활의 느낌으로 번역해라.
2. ${displayName}님의 관점에서 구체적으로 써라. 일반적인 상투어 금지.
3. "~할 수 있습니다" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 예언은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 헤더(#) 사용 금지 — **볼드**만 사용.

[섹션 구성 — 반드시 아래 2개 마커를 정확히 그대로 사용해서 구분할 것]
마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:nature===
(타고난 직장 스타일과 인간관계 — 10하우스·토성·태양·화성·금성·11/12하우스가 보여주는 ${displayName}님만의 직장 내 위치와 처세)
분량: 4~5문단

===SECTION:timing===
(지금이 승진·연봉협상에 유리한 시기인지 — 트랜짓 토성/목성, 화성 역행, 일식/월식 종합)
구체적인 협상 타이밍·행동 조언 포함
분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 nature와 timing 두 섹션을 마커와 함께 전부 작성해.
`.trim();
}

/* =========================================================
   3) 이직·스카웃운
   ========================================================= */
function buildJobChangePrompt(body, sky) {
  const {
    name, gender, mcSign, progMcSign, uranus, northNodeSign, northNodeHouse,
    house9Sign, transitNow, eclipseSignal
  } = body;

  const displayName = name?.trim() || '당신';
  const genderKr = gender === 'M' ? '남성' : '여성';
  const mcChanged = progMcSign && progMcSign !== mcSign;

  return `
너는 20년 경력의 서양 점성술 전문가야.
아래 차트 데이터를 바탕으로 ${displayName}님(${genderKr})의 "이직·스카웃운" 리포트를 작성해.
(커리어 점프·헤드헌팅 제안·오퍼 수락 여부의 타이밍에 초점 — 단순 직장운이 아니라 "지금 떠나도 되는가"에 집중해.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[타고난 이직 패턴]
천왕성(돌발적 변화·혁신 욕구): ${uranus.sign} ${uranus.house}하우스
북노드(인생 방향·운명적 경로): ${northNodeSign} ${northNodeHouse}하우스
9하우스(확장·도약형 이동): ${house9Sign}
나탈 MC: ${mcSign}

[지금 시점의 이직 타이밍 신호]
트랜짓 천왕성이 닿은 나탈 하우스: ${sky.uranusHouse ? sky.uranusHouse + '하우스' : '정보 없음'} (MC·태양·10하우스 근접 시 급작스런 제안/변화 가능성 강함)
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

[섹션 구성 — 반드시 아래 2개 마커를 정확히 그대로 사용해서 구분할 것]
마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:nature===
(타고난 이직 패턴 — 천왕성·북노드·9하우스가 보여주는 ${displayName}님만의 커리어 점프 스타일)
분량: 4~5문단

===SECTION:timing===
(지금이 이직·스카웃 제안을 받아들이기 좋은 시기인지 — 트랜짓 천왕성, 프로그레션 MC 전환, 목성 회귀, 일식/월식 종합)
오퍼를 받았을 때 어떻게 판단하면 좋을지 실질적인 조언 포함
분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 nature와 timing 두 섹션을 마커와 함께 전부 작성해.
`.trim();
}

/* =========================================================
   4) 창업·부업운
   ========================================================= */
function buildStartupPrompt(body, sky) {
  const {
    name, gender, house2Sign, house2Occupants, house2Ruler,
    house8Sign, house8Occupants, house8Ruler,
    mars, jupiterSign, sun, house5Sign, transitNow, eclipseSignal
  } = body;

  const displayName = name?.trim() || '당신';
  const genderKr = gender === 'M' ? '남성' : '여성';

  const house2Str = `${house2Sign}${house2Occupants?.length ? ` (${house2Occupants.join(', ')} 위치)` : ''}, 지배행성 ${house2Ruler?.label || '?'}(${house2Ruler?.sign || '?'})`;
  const house8Str = `${house8Sign}${house8Occupants?.length ? ` (${house8Occupants.join(', ')} 위치)` : ''}, 지배행성 ${house8Ruler?.label || '?'}(${house8Ruler?.sign || '?'})`;

  const transitJupiterHouse = transitNow?.planets?.jupiter?.house;
  const transitSaturnHouse  = transitNow?.planets?.saturn?.house;

  return `
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

[지금 시점의 창업 타이밍 신호]
트랜짓 목성이 닿은 하우스: ${transitJupiterHouse ? transitJupiterHouse + '하우스' : '정보 없음'} (2/8/10하우스 근접 시 재정 확장기)
트랜짓 토성이 닿은 하우스: ${transitSaturnHouse ? transitSaturnHouse + '하우스' : '정보 없음'} (아직 다져야 할 시기인지 신호)
목성 역행 여부: ${sky.jupiterRetro ? '역행 중 — 확장이 둔화되는 시기, 신중한 준비기로 해석' : '순행 중'}
목성 회귀 진행 중인가(~12년 주기): ${sky.jupiterReturnActive ? '예 — 확장·기회의 시기' : '아니오'}
${eclipseStr(eclipseSignal)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 실제 창업·부업 활동의 느낌으로 번역해라.
2. ${displayName}님의 관점에서 구체적으로 써라. 일반적인 상투어 금지.
3. "~할 수 있습니다" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 예언(예: "반드시 성공한다")은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 헤더(#) 사용 금지 — **볼드**만 사용.

[섹션 구성 — 반드시 아래 2개 마커를 정확히 그대로 사용해서 구분할 것]
마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:nature===
(타고난 사업가 기질 — 2/8/5하우스·화성·목성·태양이 보여주는 ${displayName}님만의 창업·부업 스타일)
분량: 4~5문단

===SECTION:timing===
(지금이 시작하기 좋은 시기인지 — 트랜짓 목성/토성, 목성 역행, 목성 회귀, 일식/월식 종합)
구체적으로 어떻게 준비하면 좋을지 실질적인 조언 포함
분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 nature와 timing 두 섹션을 마커와 함께 전부 작성해.
`.trim();
}

export default async function handler(req, res) {
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

    const prompt = type === 'job-hunting' ? buildJobHuntingPrompt(req.body, sky)
                 : type === 'promotion'   ? buildPromotionPrompt(req.body, sky)
                 : type === 'job-change'  ? buildJobChangePrompt(req.body, sky)
                 : buildStartupPrompt(req.body, sky);

    // ═══════════════════════════════════════
    // Gemini API 호출 (최대 3회 재시도)
    // ═══════════════════════════════════════
    let response, lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.9,
                maxOutputTokens: 4096,
              }
            })
          }
        );
        if (response.ok) break;
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        lastError = e;
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
      }
    }
    if (!response) throw lastError || new Error('재시도 실패');

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const message = errData?.error?.message || `Gemini API 오류 (status: ${response.status})`;
      console.error('Gemini API error:', message);
      return res.status(502).json({ error: '현재 접속자가 많아 응답이 지연되고 있습니다. 잠시만 기다리시거나, 버튼을 몇 번 더 시도해 주시면 정상적으로 이용하실 수 있습니다.' });
    }

    const data  = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      console.error('Gemini 응답 파싱 실패:', JSON.stringify(data));
      return res.status(502).json({ error: '현재 접속자가 많아 응답이 지연되고 있습니다. 잠시만 기다리시거나, 버튼을 몇 번 더 시도해 주시면 정상적으로 이용하실 수 있습니다.' });
    }

    return res.status(200).json({ result: reply });

  } catch (error) {
    console.error('handler error:', error);
    return res.status(500).json({ error: 'AI 운세를 불러오는 중 오류가 발생했습니다.' });
  }
}
