/* =========================================================
   api/gemini-today.js  v2.0
   오늘의 운세 전용 — 트랜짓 × 네이탈 에스펙트 + 역행 + VOC
   질문 모드 분기 포함
   ========================================================= */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { todayData, question, previousReading } = req.body;

    if (!todayData) {
      return res.status(400).json({ error: '오늘 운세 데이터가 없습니다.' });
    }

    const {
      natal, natalAngles, todayTransit,
      natalAspectsFull = [],
      todayAspectsFull = [], progTransitAspects = [], retrograde = {}, vocData = {},
      moonPhase = null, progression = null,
      todayDate, currentTime = '', meta
    } = todayData;

    const PLANET_LABELS = [
      ['sun',     '태양'],
      ['moon',    '달'],
      ['mercury', '수성'],
      ['venus',   '금성'],
      ['mars',    '화성'],
      ['jupiter', '목성'],
      ['saturn',  '토성'],
      ['uranus',  '천왕성'],
      ['neptune', '해왕성'],
      ['pluto',   '명왕성'],
    ];

    // ── 네이탈 행성 문자열
    const natalStr = PLANET_LABELS
      .filter(([k]) => natal[k])
      .map(([k, label]) => {
        const p = natal[k];
        return `네이탈 ${label}: ${p.sign} ${p.degree}°${p.minute}', ${p.house}하우스`;
      }).join('\n');

    // ── 오늘 트랜짓 행성 문자열
    const transitStr = PLANET_LABELS
      .filter(([k]) => todayTransit[k])
      .map(([k, label]) => {
        const p = todayTransit[k];
        return `오늘 ${label}: ${p.sign} ${p.degree}°${p.minute}', ${p.house}하우스`;
      }).join('\n');

    // ── 네이탈 에스펙트 문자열 (orb 4° 이내, 최대 15개)
    const natalAspectStr = natalAspectsFull
      .filter(a => a.orb <= 4)
      .slice(0, 15)
      .map(a => `${a.point1} ${a.symbol} ${a.point2} (${a.aspect}, 오브 ${a.orb}°)`)
      .join('\n') || '(네이탈 에스펙트 없음)';

    // ── 프로그레션→트랜짓 에스펙트 문자열
    const progTransitStr = progTransitAspects.length > 0
      ? progTransitAspects
          .slice()
          .sort((a, b) => a.orb - b.orb)
          .slice(0, 20)
          .map(a => `${a.point1} ${a.symbol} ${a.point2} (${a.aspect}, 오브 ${a.orb}°, ${a.applying ? '접근중' : '이탈중'})`)
          .join('\n')
      : '(프로그레션-트랜짓 에스펙트 없음)';

    // ── 에스펙트 전체 (orb 기준 정렬, 행성+ASC/MC+북노드/릴리스 전체)
    const aspectStr = todayAspectsFull
      .slice()
      .sort((a, b) => a.orb - b.orb)
      .map(a => `${a.point1} ${a.symbol} ${a.point2} (${a.aspect}, 오브 ${a.orb}°, ${a.applying ? '접근중' : '이탈중'})`)
      .join('\n') || '(주요 에스펙트 없음)';

    // ── 역행 행성 문자열
    const RETRO_KR = {
      mercury:'수성', venus:'금성', mars:'화성',
      jupiter:'목성', saturn:'토성', uranus:'천왕성', neptune:'해왕성', pluto:'명왕성'
    };
    const retroList = Object.entries(retrograde)
      .filter(([, isRetro]) => isRetro)
      .map(([k]) => RETRO_KR[k])
      .filter(Boolean);
    const retroStr = retroList.length > 0
      ? `현재 역행 중인 행성: ${retroList.join(', ')}`
      : '현재 역행 중인 행성 없음';

    // ── VOC 문자열
    const vocStr = vocData.desc || '오늘은 달의 VOC 구간 정보 없음';

    // ── 달의 위상 문자열
    const moonPhaseStr = moonPhase
      ? `${moonPhase.phaseIcon} ${moonPhase.phaseName} · 조도 ${moonPhase.illumination}% · ${moonPhase.energy}`
      : '(달 위상 정보 없음)';

    // ── 프로그레션 문자열
    const progStr = progression
      ? `프로그레션 태양: ${progression.sun.sign} ${progression.sun.degree}°${progression.sun.minute}', ${progression.sun.house}하우스 (현재 삶의 챕터와 자아 진화 방향)\n` +
        `프로그레션 달: ${progression.moon.sign} ${progression.moon.degree}°${progression.moon.minute}', ${progression.moon.house}하우스 (현재 감정·관심의 초점, 약 2~3개월 단위 흐름)\n` +
        `프로그레션 ASC: ${progression.asc.sign} ${progression.asc.degree}°${progression.asc.minute}' (현재 세상에 보이는 페르소나)`
      : '(프로그레션 정보 없음)';

    // ── 공통 데이터 블록
    const baseData =
`[오늘의 운세 분석 데이터]
이름: ${meta.name || '(이름 없음)'}
성별: ${meta.gender === 'M' ? '남성' : '여성'}
출생: ${meta.birthDate} ${meta.birthTime}
오늘 날짜: ${todayDate}
현재 시각 (KST): ${currentTime || '알 수 없음'}

어센던트(ASC): ${natalAngles?.asc?.sign || ''} ${natalAngles?.asc?.degree || ''}°
MC(천정): ${natalAngles?.mc?.sign || ''} ${natalAngles?.mc?.degree || ''}°

[네이탈 행성 위치]
${natalStr}

[오늘 하늘의 행성 위치]
${transitStr}

[역행 행성 현황]
${retroStr}

[세컨더리 프로그레션 (현재 삶의 배경 흐름)]
${progStr}

[달의 위상]
${moonPhaseStr}

[달의 보이드 오브 코스(VOC)]
${vocStr}

[프로그레션 → 오늘 트랜짓 에스펙트 (삶의 현재 챕터 × 오늘 하늘)]
${progTransitStr}

[네이탈 에스펙트 (이 사람의 출생 차트 고유 패턴, orb 4° 이내)]
${natalAspectStr}

[오늘 에스펙트 (트랜짓→네이탈, orb 기준 정렬)]
${aspectStr}`;

    // ── 프롬프트 분기
    const isQuestion = !!question;
    let prompt;

    if (isQuestion) {
      // 추가 질문 모드
      prompt = baseData + `

[이전 운세 요약]
${previousReading || ''}

[추가 질문]
${question}

[답변 지침 — 반드시 준수]
- 오늘 데이터 전체와 이전 운세를 바탕으로 질문에 직접 답하세요.
- 행성 이름, 사인 이름, 각도 숫자, 기호, 하우스 번호를 절대 쓰지 마세요.
- 점성술 의미를 자연스러운 한국어 삶의 언어로만 표현하세요.
- 일반적인 조언 금지 — 이 사람의 오늘 데이터에서 근거를 찾아 구체적으로 답하세요.
- 150~250자 사이로 핵심만 답하세요.
- 자기소개 없이 바로 답변하세요.
- 친근하고 따뜻한 톤으로 작성하세요.`;

    } else {
      // 전체 운세 모드
      prompt = baseData + `

[오늘 운세 작성 지침 — 반드시 준수]
- 자기소개 없이 바로 시작하세요.
- 행성 이름, 사인 이름, 각도 숫자, 기호(☌△□☍⚹), 하우스 번호를 결과 텍스트에 절대 쓰지 마세요.
- 모든 점성술 의미를 자연스러운 한국어 삶의 언어로만 표현하세요.
- 반드시 이 사람의 네이탈 차트와 오늘 에스펙트에서 근거를 찾아 구체적으로 쓰세요.
- 네이탈 에스펙트는 이 사람의 타고난 패턴입니다. 오늘 에스펙트가 이 패턴을 건드릴 때(같은 행성, 같은 배치) 특히 강하게 발현된다고 해석하세요.
- 오브 3° 이내 에스펙트는 각 항목에서 반드시 삶의 언어로 근거로 언급하세요.
- 역행 중인 행성이 있다면 해당 영역(수성=소통/계약, 금성=관계/소비, 화성=행동력)에서 오늘 주의사항을 구체적으로 쓰세요.
- 프로그레션 태양의 사인·하우스로 현재 삶의 큰 흐름을, 프로그레션 달의 사인·하우스로 현재 감정적 초점을 "오늘의 전체 에너지" 섹션에 한두 문장으로 자연스럽게 녹여 쓰세요.
- 프로그레션→트랜짓 에스펙트 중 orb 2° 이내 항목이 있다면 "이 사람의 삶의 흐름이 오늘 하늘과 맞닿는 순간"으로 삶의 언어로 표현해 "오늘의 전체 에너지" 섹션에 녹여 쓰세요 (점성술 용어 사용 금지).
- 달의 위상(신월~그믐)에 따른 에너지 방향성(확장기/절정/수확/성찰)을 "오늘의 전체 에너지" 섹션에 한 문장으로 자연스럽게 녹여 쓰세요.
- VOC 구간이 있다면 해당 시간대에 중요한 결정/계약/시작을 피하라고 시간대와 함께 반드시 명시하세요.
- 현재 시각(KST)을 기준으로, 이미 지나간 시간대의 에너지는 "오늘 오전에 이미..." 같은 과거형으로, 앞으로 남은 시간대는 미래형으로 구분해 쓰세요. 현재 시각 이후 에너지에 더 집중해 주세요.
- 에스펙트 "접근중"은 앞으로 강해진다고, "이탈중"은 이미 피크를 지났다고 현재 시각에 맞춰 해석하세요.
- 누구에게나 해당되는 일반적인 조언 금지.
- 완성된 문장으로 끝까지 마무리하세요.

[출력 양식 — 아래 5개 항목을 순서대로 빠짐없이 완성하세요]

## 오늘의 전체 에너지
이 사람의 네이탈 차트 특성과 오늘 에스펙트가 어떻게 맞물리는지, 오늘 하루의 전반적인 흐름과 분위기를 4~5문장으로 충분히 써주세요.

## 💰 재물 · 직업
오늘 재물과 직업 운의 흐름을 구체적으로 써주세요.
어떤 기회가 있는지, 어떤 점을 조심해야 하는지, 어떤 행동이 유리한지를 포함해 4~5문장으로 써주세요.

## 💕 관계 · 감정
오늘 인간관계와 감정 흐름을 구체적으로 써주세요.
연인, 가족, 동료 관계에서 오늘 어떤 에너지가 작동하는지, 감정 상태는 어떠한지 4~5문장으로 써주세요.

## 🏃 행동 · 에너지
오늘 신체 에너지와 행동력을 구체적으로 써주세요.
오늘 추진력이 강한지 약한지, 어떤 시간대에 에너지가 집중되는지, 건강 면에서 주의할 점은 무엇인지 4~5문장으로 써주세요.

## 🌙 오늘의 조언
오늘 하루를 어떻게 보내면 가장 좋을지, 이 사람의 차트에서 나온 근거를 바탕으로 구체적이고 실용적인 조언을 3~4문장으로 마무리하세요. 절대 중간에 끊지 마세요.`;
    }

    // ── Gemini API 호출 (최대 3회 재시도)
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
                thinkingConfig: { thinkingBudget: 0 },
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
      console.error('Gemini API error:', errData?.error?.message);
      return res.status(502).json({ error: '현재 접속자가 많습니다. 잠시 후 다시 시도해주세요.' });
    }

    const data  = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      console.error('Gemini 응답 파싱 실패:', JSON.stringify(data));
      return res.status(502).json({ error: '응답을 가져오지 못했습니다. 다시 시도해주세요.' });
    }

    return res.status(200).json({ result: reply });

  } catch (error) {
    console.error('gemini-today error:', error);
    return res.status(500).json({ error: '오늘 운세 분석 중 오류가 발생했습니다.' });
  }
}
