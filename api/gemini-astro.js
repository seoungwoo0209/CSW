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

위 두 가지 데이터를 모두 활용해서 다음 순서로 작성하세요:

1. 2026년 전체 흐름 요약 (3~4문장)
2. 월별 운세 (1월~12월, 각 달마다 2~3문장):
   - 그달의 행성 흐름이 이 사람에게 주는 에너지와 영향
   - 재물·관계·직업·건강 중 특히 주의하거나 활용할 점
   - 기회가 되는 달과 조심할 달을 명확히 구분해서 써주세요

[주의]
- 행성 이름, 사인 이름, 각도 숫자, 하우스 번호를 절대 쓰지 마세요
- 모든 내용을 자연스러운 한국어 문장으로만 표현하세요
- 각 달마다 구체적이고 실용적인 내용을 써주세요`;
    }

    // 자동 재시도 (최대 3회, 1.5초 간격)
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
            temperature: 0.75,
            maxOutputTokens: 8192,
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
