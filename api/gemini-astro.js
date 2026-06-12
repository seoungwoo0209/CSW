/* =========================================================
   api/gemini-astro.js  v2.0
   변경 사항:
   - progression: 태양·달 → 전 행성 + prog ASC/MC 프롬프트 반영
   - natalAspects + aspectsToNatal 실제 계산값 주입 (AI 추측 제거)
   - 프롬프트 규칙 6번 자기모순 해소: 에스펙트 계산값은 인풋으로만 사용
   - [시스템 역할 정의] 멘트 출력 방지 규칙 명확화
   ========================================================= */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { astroData } = req.body;

    if (!astroData) {
      return res.status(400).json({ error: '천문 데이터가 없습니다.' });
    }

    const { natal, angles, houses, natalAspects = [], progression, meta, transits2026 = [] } = astroData;
    const progPlanets = progression?.planets || {};
    const progAngles  = progression?.angles  || {};
    const progMeta    = progression?.meta    || {};
    const progAspects = progression?.aspectsToNatal || [];

    // ── 행성 위치 문자열
    const PLANET_LABELS = [
      ['sun',     '태양(Sun)'],
      ['moon',    '달(Moon)'],
      ['mercury', '수성(Mercury)'],
      ['venus',   '금성(Venus)'],
      ['mars',    '화성(Mars)'],
      ['jupiter', '목성(Jupiter)'],
      ['saturn',  '토성(Saturn)'],
      ['uranus',  '천왕성(Uranus)'],
      ['neptune', '해왕성(Neptune)'],
      ['pluto',   '명왕성(Pluto)'],
    ];

    const planetStr = PLANET_LABELS
      .filter(([k]) => natal[k])
      .map(([k, label]) => {
        const p = natal[k];
        return `${label}: ${p.sign} ${p.degree}°${p.minute}', ${p.house}하우스`;
      }).join('\n');

    // ── 프로그레션 전 행성 문자열
    const progPlanetStr = PLANET_LABELS
      .filter(([k]) => progPlanets[k])
      .map(([k, label]) => {
        const p = progPlanets[k];
        return `프로그레션 ${label}: ${p.sign} ${p.degree}°${p.minute}', ${p.house}하우스`;
      }).join('\n');

    const progAnglesStr = progAngles.asc
      ? `프로그레션 ASC: ${progAngles.asc.sign} ${progAngles.asc.degree}°${progAngles.asc.minute}'\n` +
        `프로그레션 MC: ${progAngles.mc.sign} ${progAngles.mc.degree}°${progAngles.mc.minute}'`
      : '';

    // ── 하우스 커스프 문자열
    const houseCusps = (houses || []).map(h =>
      `${h.house}하우스: ${h.sign} ${h.degree}°${h.minute}'`
    ).join('\n');

    // ── 에스펙트 문자열 (AI 입력용 — 출력에서는 수치 제외하도록 지시)
    const natalAspectStr = natalAspects.length
      ? natalAspects.map(a => `${a.planet1} ${a.symbol} ${a.planet2} (${a.aspect})`).join('\n')
      : '(주요 에스펙트 없음)';

    const progAspectStr = progAspects.length
      ? progAspects.map(a => `${a.progPlanet} ${a.symbol} ${a.natalPlanet} (${a.aspect})`).join('\n')
      : '(주요 프로그레션 에스펙트 없음)';

    // 질문 모드 여부
    const { question, previousReading } = req.body || {};
    const isQuestion = !!question;

    const baseData = `[분석 데이터]
이름: ${meta.name || '(이름 없음)'}
성별: ${meta.gender === 'M' ? '남성' : '여성'}
출생: ${meta.birthDate} ${meta.birthTime}
하우스 시스템: ${meta.houseSystem || 'Placidus'}

어센던트(ASC): ${angles.asc.sign} ${angles.asc.degree}°${angles.asc.minute}'
MC(천정): ${angles.mc.sign} ${angles.mc.degree}°${angles.mc.minute}'

네이탈 행성 위치:
${planetStr}

하우스 커스프:
${houseCusps}

네이탈 주요 에스펙트:
${natalAspectStr}

[세컨더리 프로그레션] (기준일: ${progMeta.progDate || '현재'}, 나이 약 ${progMeta.ageYears || '?'}세)
${progPlanetStr}
${progAnglesStr}

프로그레션↔네이탈 주요 에스펙트:
${progAspectStr}`;

    // 2026년 월별 트랜짓 문자열 생성
    const PLANET_KR_MAP = {
      sun:'태양', mercury:'수성', venus:'금성',
      mars:'화성', jupiter:'목성', saturn:'토성'
    };
    const transitStr = transits2026.length
      ? transits2026.map(m => {
          const planets = Object.entries(m.planets)
            .map(([k,v]) => `${PLANET_KR_MAP[k]}(${v.sign}·${v.house}하우스)`)
            .join(', ');
          return `${m.month}: ${planets}`;
        }).join('\n')
      : '(트랜짓 데이터 없음)';

    let prompt;
    if (isQuestion) {
      prompt = `# Role
너는 복잡한 점성술 데이터를 인간의 심리와 현실적 삶의 언어로 완벽하게 번역하는 천재 점성술 상담가이자 라이프 코치이다. 고유한 천체 데이터를 바탕으로, 사용자가 마치 나를 완벽하게 아는 전문가에게 깊은 위로와 날카로운 통찰을 얻는 듯한 경험을 제공해야 한다.

# [필수 제약 조건 - 위반 시 출력 실패]

1. 전문 용어 절대 언급 금지
- 행성명 절대 금지: 태양, 달, 수성, 금성, 화성, 목성, 토성, 천왕성, 해왕성, 명왕성
- 사인명 절대 금지: 양자리, 황소자리, 쌍둥이자리, 게자리, 사자자리, 처녀자리, 천칭자리, 전갈자리, 사수자리, 염소자리, 물병자리, 물고기자리
- 하우스 관련 절대 금지: 1하우스~12하우스, ASC, MC, 상승점, 천정
- 에스펙트 관련 절대 금지: 컨정션, 트라인, 스퀘어, 어포지션, 섹스타일, 합, 충, 0도, 90도, 180도, 오브

2. 용어 치환 가이드
- 행성/하우스 의미 → 삶의 언어로 번역 (예: "커리어와 사회적 성취의 에너지", "감정적 안식처", "현실적 장벽과 과제")
- 길한 에스펙트 → "조화로운 흐름", "자연스러운 기회", "순풍"
- 흉한 에스펙트 → "내면의 긴장", "마주해야 할 과제", "성장을 위한 마찰"

3. 스타일
- 자연스러운 한국어 문장만 사용
- 뻔하고 일반적인 조언 절대 금지
- 이 사람만의 고유한 성향을 날카롭고 구체적으로 짚어낼 것
- 완성된 문장으로 마무리하고 중간에 끊지 말 것

# Input Data
${baseData}

[프로그레션 데이터 — 내면 성장 흐름]
${progPlanetStr}
${progAnglesStr}
프로그레션↔네이탈 에스펙트: ${progAspectStr}

[2026년 실제 행성 위치 — 외부 환경 흐름]
${transitStr}

# Output Format

## 1. 인생 전체 흐름
(네이탈 차트, 하우스, 에스펙트를 종합하여 이 사람이 평생 마주할 성향, 내면의 모순, 잠재력, 인생의 지향점을 한 편의 에세이처럼 서술하라. 최소 3문단 이상.)

## 2. 2026년 전체 흐름 요약
(프로그레션과 트랜짓을 분석하여 2026년의 거시적 테마와 전환점을 요약하라.)

## 3. 2026년 월별 운세
(1월~12월, 매월 반드시 아래 4가지 항목 포함)

### [1월]
* **핵심 에너지:**
* **재물과 직업:**
* **관계와 감정:**
* **나를 위한 조언:**

### [2월]
* **핵심 에너지:**
* **재물과 직업:**
* **관계와 감정:**
* **나를 위한 조언:**

### [3월]
* **핵심 에너지:**
* **재물과 직업:**
* **관계와 감정:**
* **나를 위한 조언:**

### [4월]
* **핵심 에너지:**
* **재물과 직업:**
* **관계와 감정:**
* **나를 위한 조언:**

### [5월]
* **핵심 에너지:**
* **재물과 직업:**
* **관계와 감정:**
* **나를 위한 조언:**

### [6월]
* **핵심 에너지:**
* **재물과 직업:**
* **관계와 감정:**
* **나를 위한 조언:**

### [7월]
* **핵심 에너지:**
* **재물과 직업:**
* **관계와 감정:**
* **나를 위한 조언:**

### [8월]
* **핵심 에너지:**
* **재물과 직업:**
* **관계와 감정:**
* **나를 위한 조언:**

### [9월]
* **핵심 에너지:**
* **재물과 직업:**
* **관계와 감정:**
* **나를 위한 조언:**

### [10월]
* **핵심 에너지:**
* **재물과 직업:**
* **관계와 감정:**
* **나를 위한 조언:**

### [11월]
* **핵심 에너지:**
* **재물과 직업:**
* **관계와 감정:**
* **나를 위한 조언:**

### [12월]
* **핵심 에너지:**
* **재물과 직업:**
* **관계와 감정:**
* **나를 위한 조언:**`;================================
   api/gemini-astro.js  v2.0
   변경 사항:
   - progression: 태양·달 → 전 행성 + prog ASC/MC 프롬프트 반영
   - natalAspects + aspectsToNatal 실제 계산값 주입 (AI 추측 제거)
   - 프롬프트 규칙 6번 자기모순 해소: 에스펙트 계산값은 인풋으로만 사용
   - [시스템 역할 정의] 멘트 출력 방지 규칙 명확화
   ========================================================= */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { astroData } = req.body;

    if (!astroData) {
      return res.status(400).json({ error: '천문 데이터가 없습니다.' });
    }

    const { natal, angles, houses, natalAspects = [], progression, meta, transits2026 = [] } = astroData;
    const progPlanets = progression?.planets || {};
    const progAngles  = progression?.angles  || {};
    const progMeta    = progression?.meta    || {};
    const progAspects = progression?.aspectsToNatal || [];

    // ── 행성 위치 문자열
    const PLANET_LABELS = [
      ['sun',     '태양(Sun)'],
      ['moon',    '달(Moon)'],
      ['mercury', '수성(Mercury)'],
      ['venus',   '금성(Venus)'],
      ['mars',    '화성(Mars)'],
      ['jupiter', '목성(Jupiter)'],
      ['saturn',  '토성(Saturn)'],
      ['uranus',  '천왕성(Uranus)'],
      ['neptune', '해왕성(Neptune)'],
      ['pluto',   '명왕성(Pluto)'],
    ];

    const planetStr = PLANET_LABELS
      .filter(([k]) => natal[k])
      .map(([k, label]) => {
        const p = natal[k];
        return `${label}: ${p.sign} ${p.degree}°${p.minute}', ${p.house}하우스`;
      }).join('\n');

    // ── 프로그레션 전 행성 문자열
    const progPlanetStr = PLANET_LABELS
      .filter(([k]) => progPlanets[k])
      .map(([k, label]) => {
        const p = progPlanets[k];
        return `프로그레션 ${label}: ${p.sign} ${p.degree}°${p.minute}', ${p.house}하우스`;
      }).join('\n');

    const progAnglesStr = progAngles.asc
      ? `프로그레션 ASC: ${progAngles.asc.sign} ${progAngles.asc.degree}°${progAngles.asc.minute}'\n` +
        `프로그레션 MC: ${progAngles.mc.sign} ${progAngles.mc.degree}°${progAngles.mc.minute}'`
      : '';

    // ── 하우스 커스프 문자열
    const houseCusps = (houses || []).map(h =>
      `${h.house}하우스: ${h.sign} ${h.degree}°${h.minute}'`
    ).join('\n');

    // ── 에스펙트 문자열 (AI 입력용 — 출력에서는 수치 제외하도록 지시)
    const natalAspectStr = natalAspects.length
      ? natalAspects.map(a => `${a.planet1} ${a.symbol} ${a.planet2} (${a.aspect})`).join('\n')
      : '(주요 에스펙트 없음)';

    const progAspectStr = progAspects.length
      ? progAspects.map(a => `${a.progPlanet} ${a.symbol} ${a.natalPlanet} (${a.aspect})`).join('\n')
      : '(주요 프로그레션 에스펙트 없음)';

    // 질문 모드 여부
    const { question, previousReading } = req.body || {};
    const isQuestion = !!question;

    const baseData = `[분석 데이터]
이름: ${meta.name || '(이름 없음)'}
성별: ${meta.gender === 'M' ? '남성' : '여성'}
출생: ${meta.birthDate} ${meta.birthTime}
하우스 시스템: ${meta.houseSystem || 'Placidus'}

어센던트(ASC): ${angles.asc.sign} ${angles.asc.degree}°${angles.asc.minute}'
MC(천정): ${angles.mc.sign} ${angles.mc.degree}°${angles.mc.minute}'

네이탈 행성 위치:
${planetStr}

하우스 커스프:
${houseCusps}

네이탈 주요 에스펙트:
${natalAspectStr}

[세컨더리 프로그레션] (기준일: ${progMeta.progDate || '현재'}, 나이 약 ${progMeta.ageYears || '?'}세)
${progPlanetStr}
${progAnglesStr}

프로그레션↔네이탈 주요 에스펙트:
${progAspectStr}`;

    // 2026년 월별 트랜짓 문자열 생성
    const PLANET_KR_MAP = {
      sun:'태양', mercury:'수성', venus:'금성',
      mars:'화성', jupiter:'목성', saturn:'토성'
    };
    const transitStr = transits2026.length
      ? transits2026.map(m => {
          const planets = Object.entries(m.planets)
            .map(([k,v]) => `${PLANET_KR_MAP[k]}(${v.sign}·${v.house}하우스)`)
            .join(', ');
          return `${m.month}: ${planets}`;
        }).join('\n')
      : '(트랜짓 데이터 없음)';

    let prompt;
    if (isQuestion) {
      prompt = baseData + `

[이전 리딩 요약]
${previousReading || ''}

[추가 질문]
${question}

[답변 지침 — 반드시 준수]
- 위 점성술 데이터 전체(네이탈·프로그레션·에스펙트)와 이전 리딩을 모두 바탕으로 답하세요.
- 질문에 직접적으로 답하세요. 질문이 "언제가 가장 좋냐"면 구체적인 시기를 말하고, "어떻게 해야 하냐"면 구체적인 행동을 말하세요.
- 일반적인 조언이나 뭉뚱그린 답변은 하지 마세요. 이 사람의 데이터에서 근거를 찾아 구체적으로 답하세요.
- 행성 이름, 사인 이름, 각도 숫자, 기호, 하우스 번호를 절대 쓰지 마세요.
- 점성술 데이터의 의미를 자연스러운 한국어 문장으로만 표현하세요.
- 150~250자 사이로 핵심만 답하세요.
- 자기소개나 서두 없이 바로 답변하세요.
- 친근하고 따뜻한 톤으로 작성하세요.`;
    } else {
      prompt = baseData + `

[리딩 지침 — 반드시 준수]
- 자기소개 문장 없이 바로 시작하세요.
- 결과 텍스트에 행성 이름(태양·달·목성 등), 사인 이름(양자리·전갈자리 등), 각도 숫자, 기호(☌△□☍⚹), 하우스 번호를 절대 쓰지 마세요.
- 대신 그 의미와 영향을 자연스러운 한국어 문장으로만 표현하세요.
  예시) X "목성이 10하우스에서 MC와 트라인" → O "사회적 성취와 커리어 확장의 에너지가 강하게 작동하는 시기"
  예시) X "프로그레션 달이 양자리 5하우스" → O "지금은 새로운 도전에 본능적으로 끌리고 창의적 표현 욕구가 강해지는 때"
- 완성된 문장으로 마무리하고 중간에 절대 끊지 마세요.

[출력 양식 — 반드시 아래 2개 헤드라인 순서로 작성]

## 🌌 인생 전체 흐름
다음 요소를 모두 반영해서 이 사람의 인생 큰 그림을 서사로 써주세요:
· ASC(어센던트) 사인과 지배행성이 만드는 삶의 방식과 외적 태도
· 태양과 달의 사인·하우스 배치로 보는 핵심 정체성과 내면 욕구
· 주요 하우스(1·4·7·10하우스)에 있는 행성들의 의미
· 네이탈 에스펙트 중 가장 강한 것들이 만드는 인생의 테마
· 타고난 강점, 반복되는 과제, 인생에서 중요한 관계·직업·성장 방향
300자 이상 충분히 써주세요.

## 📅 2026년 운세

[프로그레션 데이터 — 내면 성장 흐름]
${progPlanetStr}
${progAnglesStr}
프로그레션↔네이탈 에스펙트: ${progAspectStr}

[2026년 실제 행성 위치 — 외부 환경 흐름]
${transitStr}

위 두 가지 데이터를 모두 활용해서 다음 순서로 반드시 작성하세요.
절대 일반적이거나 누구에게나 해당되는 내용을 쓰지 마세요.
반드시 이 사람의 나탈 차트와 프로그레션 데이터에서 근거를 찾아 구체적으로 써야 합니다.

**2026년 전체 흐름 요약** (4~5문장)
- 이 사람의 나탈 차트 특성과 올해 에너지가 어떻게 맞물리는지
- 올해 가장 중요한 테마 2가지를 명확히 제시
- 특히 좋은 시기와 조심할 시기를 언급

**월별 상세 운세** (1월~12월, 각 달마다 반드시 아래 형식으로)

### 1월
- 이달의 핵심 에너지: (구체적으로)
- 재물/직업: (구체적으로)
- 관계: (구체적으로)
- 이달의 조언: (한 문장)

(2월~12월도 동일한 형식으로)

[절대 금지 사항]
- 행성 이름, 사인 이름, 각도 숫자, 하우스 번호 언급 금지
- "새로운 시작", "긍정적인 변화", "신중함이 필요" 같은 모호한 표현 금지
- 누구에게나 해당되는 일반적인 조언 금지
- 반드시 이 사람의 데이터에서 근거를 찾아 구체적으로 써야 함`;
    }

    // 자동 재시도 (최대 3회, 1.5초 간격)
    let response, lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.75,
            maxOutputTokens: 16384,
          }
        })
      }
        );
        if (response.ok) break; // 성공하면 루프 탈출
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
      } catch(e) {
        lastError = e;
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
      }
    }
    if (!response) throw lastError || new Error('재시도 실패');

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const message = errData?.error?.message || `Gemini API 오류 (status: ${response.status})`;
      return res.status(502).json({ error: '현재 접속자가 많아 응답이 지연되고 있습니다. 잠시만 기다리시거나, 버튼을 몇 번 더 시도해 주시면 정상적으로 이용하실 수 있습니다.' });
    }

    const data  = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return res.status(502).json({ error: '현재 접속자가 많아 응답이 지연되고 있습니다. 잠시만 기다리시거나, 버튼을 몇 번 더 시도해 주시면 정상적으로 이용하실 수 있습니다.' });
    }

    return res.status(200).json({ result: reply, astroData });

  } catch (error) {
    console.error('gemini-astro error:', error);
    return res.status(500).json({ error: '점성술 분석 중 오류가 발생했습니다.' });
  }
}
