import Ephemeris from 'ephemeris';

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

function buildLovePrompt(body) {
  const {
    name, gender, venus, mars, moon, saturn,
    house5Sign, house7Sign, house5Occupants, house7Occupants,
    house7Ruler, satVenusAspect, satRulerAspect,
    transitNow, progMoonHouse, progMoonSign
  } = body;

  const displayName = name?.trim() || '당신';
  const genderKr     = gender === 'M' ? '남성' : '여성';

  const house5Str = `${house5Sign}자리${house5Occupants?.length ? ` (${house5Occupants.join(', ')} 위치)` : ''}`;
  const house7Str = `${house7Sign}자리${house7Occupants?.length ? ` (${house7Occupants.join(', ')} 위치)` : ''}`;

  let transitStr = '트랜짓 정보 없음';
  if (transitNow) {
    transitStr = `이번 달 트랜짓 — 금성: ${transitNow.planets.venus.sign}, 화성: ${transitNow.planets.mars.sign}`;
  }
  const progMoonStr = progMoonSign ? `프로그레션 달: ${progMoonSign} ${progMoonHouse}하우스` : '프로그레션 정보 없음';

  const house7RulerStr = house7Ruler
    ? `7하우스(${house7Sign}) 지배행성: ${house7Ruler.label} — ${house7Ruler.sign} ${house7Ruler.house}하우스`
    : '7하우스 지배행성 정보 없음';
  const satVenusStr = satVenusAspect
    ? `토성-금성: ${satVenusAspect.aspect} (orb ${satVenusAspect.orb}°)`
    : '토성-금성 간 뚜렷한 어스펙트 없음';
  const satRulerStr = satRulerAspect
    ? `토성-7하우스 지배행성: ${satRulerAspect.aspect} (orb ${satRulerAspect.orb}°)`
    : '';

  return `
너는 20년 경력의 서양 점성술 전문가야.
아래 차트 데이터를 바탕으로 ${displayName}님만을 위한 연애운 리포트를 작성해.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기본 정보]
이름: ${displayName} / 성별: ${genderKr}

[타고난 연애 기질 — 나탈 차트]
금성(Venus): ${venus.sign} ${venus.house}하우스 — 끌림의 방식·사랑을 표현하고 받는 방식
화성(Mars): ${mars.sign} ${mars.house}하우스 — 욕망·연애에서의 추진력
달(Moon): ${moon.sign} ${moon.house}하우스 — 정서적으로 원하는 것
5하우스(연애·설렘): ${house5Str}
7하우스(진지한 파트너십): ${house7Str}

[결혼·지속적 관계 — 토성·7하우스 지배행성]
토성(Saturn): ${saturn.sign} ${saturn.house}하우스 — 책임감·관계를 얼마나 오래 지속시키는가
${house7RulerStr}
${satVenusStr}
${satRulerStr}

[올해의 흐름]
${transitStr}
${progMoonStr}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 삶의 언어로 번역해라.
   예) "금성이 7하우스" → "가벼운 만남보다 처음부터 진지한 관계를 추구하는 끌림의 방식"
2. ${displayName}님만의 특징처럼 구체적으로 써라. 일반적인 운세 상투어("좋은 인연이 옵니다" 등) 금지.
3. "~할 수 있습니다", "~일 수도 있어요" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 길흉 예언(예: "올해 반드시 결혼한다")은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 헤더(#) 사용 금지 — **볼드**만 사용.

[섹션 구성 — 반드시 아래 3개 마커를 정확히 그대로 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라: ===SECTION:nature===
마커 자체는 사용자에게 보이지 않는 구분선이므로, 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

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
(올해의 연애 흐름 — 트랜짓·프로그레션이 보여주는 타이밍)
- 지금이 연애에 유리한 시기인지, 어떤 변화가 다가오는지
- 구체적으로 어떻게 행동하면 좋을지 실질적인 조언
- 분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 nature, marriage, timing 세 섹션을 마커와 함께 전부 작성해.
`.trim();
}

function buildReunionPrompt(body) {
  const {
    name, gender, venus, mars, moon, saturn,
    house7Sign, house7Occupants, house7Ruler,
    satVenusAspect, satRulerAspect,
    transitNow, progMoonHouse, progMoonSign,
    venusRetro
  } = body;

  const displayName = name?.trim() || '당신';
  const genderKr     = gender === 'M' ? '남성' : '여성';

  const house7Str = `${house7Sign}자리${house7Occupants?.length ? ` (${house7Occupants.join(', ')} 위치)` : ''}`;

  const house7RulerStr = house7Ruler
    ? `7하우스(${house7Sign}) 지배행성: ${house7Ruler.label} — ${house7Ruler.sign} ${house7Ruler.house}하우스`
    : '7하우스 지배행성 정보 없음';
  const satVenusStr = satVenusAspect
    ? `토성-금성: ${satVenusAspect.aspect} (orb ${satVenusAspect.orb}°)`
    : '토성-금성 간 뚜렷한 어스펙트 없음';
  const satRulerStr = satRulerAspect
    ? `토성-7하우스 지배행성: ${satRulerAspect.aspect} (orb ${satRulerAspect.orb}°)`
    : '';

  const transitSaturnHouse = transitNow?.planets?.saturn?.house ?? null;
  const saturnIn78 = transitSaturnHouse === 7 || transitSaturnHouse === 8;

  let transitStr = '트랜짓 정보 없음';
  if (transitNow) {
    transitStr = `이번 달 트랜짓 — 금성: ${transitNow.planets.venus.sign}, 토성: ${transitNow.planets.saturn.sign} (${transitSaturnHouse}하우스)`;
  }
  const progMoonStr = progMoonSign ? `프로그레션 달: ${progMoonSign} ${progMoonHouse}하우스` : '프로그레션 정보 없음';

  return `
너는 20년 경력의 서양 점성술 전문가야.
아래 차트 데이터를 바탕으로 ${displayName}님만을 위한 재회운 리포트를 작성해.
("재회운"은 과거 연인과 다시 만날 가능성/타이밍을 보는 것으로, 일반적인 연애운과는 다른 영역이야.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기본 정보]
이름: ${displayName} / 성별: ${genderKr}

[재회와 관련된 본인의 패턴 — 나탈 차트]
금성(Venus): ${venus.sign} ${venus.house}하우스 — 과거 인연에 대한 애착 방식
화성(Mars): ${mars.sign} ${mars.house}하우스
달(Moon): ${moon.sign} ${moon.house}하우스 — 미련·정서적 애착의 패턴
토성(Saturn): ${saturn.sign} ${saturn.house}하우스 — 관계를 다시 시험하고 재정비하려는 성향
7하우스(진지한 파트너십): ${house7Str}
${house7RulerStr}
${satVenusStr}
${satRulerStr}

[지금 시점의 재회 타이밍 신호]
금성 역행 여부: ${venusRetro ? '역행 중 (전통적으로 과거 인연이 다시 떠오르는 시기로 해석됨)' : '순행 중'}
트랜짓 토성이 7/8하우스를 지나는 중인가: ${saturnIn78 ? `예 (${transitSaturnHouse}하우스 — 관계의 재시험/재정비 시기)` : '아니오'}
${transitStr}
${progMoonStr}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 삶의 언어로 번역해라.
2. ${displayName}님만의 특징처럼 구체적으로 써라. 일반적인 운세 상투어 금지.
3. "~할 수 있습니다" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 예언(예: "반드시 재회한다", "이 사람과 다시 만난다")은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 헤더(#) 사용 금지 — **볼드**만 사용.

[섹션 구성 — 반드시 아래 2개 마커를 정확히 그대로 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라: ===SECTION:pattern===
마커 자체는 사용자에게 보이지 않는 구분선이므로, 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:pattern===
(재회와 관련된 ${displayName}님의 패턴 — 금성·화성·달·토성·7하우스가 보여주는 과거 인연에 대한 애착과 미련의 방식)
- 헤어진 인연을 어떻게 정리하는 편인지, 다시 떠올리는 패턴이 있는지
- 분량: 4~5문단, 각 문단 3~4문장

===SECTION:timing===
(지금이 재회에 유리한 시기인지 — 금성 역행·토성 트랜짓·프로그레션이 보여주는 타이밍)
- 지금 흐름이 재회에 유리한지, 불리한지, 어떤 신호를 주목해야 하는지
- 구체적으로 어떻게 행동하면 좋을지 실질적인 조언
- 분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 pattern과 timing 두 섹션을 마커와 함께 전부 작성해.
`.trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { type, venus, mars, moon, saturn } = req.body;
    const isReunion = type === 'reunion';

    if (!venus || !mars || !moon || (isReunion && !saturn)) {
      return res.status(400).json({ error: '필수 파라미터(venus, mars, moon)가 누락되었습니다.' });
    }

    let venusRetro = false;
    if (isReunion) {
      try { venusRetro = isVenusRetrogradeNow(); } catch (e) { console.warn('금성 역행 계산 실패:', e.message); }
    }

    const prompt = isReunion
      ? buildReunionPrompt({ ...req.body, venusRetro })
      : buildLovePrompt(req.body);

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

    const responseBody = { result: reply };
    if (isReunion) responseBody.venusRetrograde = venusRetro;
    return res.status(200).json(responseBody);

  } catch (error) {
    console.error('handler error:', error);
    return res.status(500).json({ error: 'AI 운세를 불러오는 중 오류가 발생했습니다.' });
  }
}
