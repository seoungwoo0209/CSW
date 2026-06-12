/* =========================================================
   api/gemini-today.js  v1.0
   오늘의 운세 전용 — 오늘 트랜짓 × 네이탈 에스펙트 기반
   짧고 빠른 응답 (월별 12달 없음)
   ========================================================= */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { todayData } = req.body;

    if (!todayData) {
      return res.status(400).json({ error: '오늘 운세 데이터가 없습니다.' });
    }

    const { natal, natalAngles, todayTransit, todayAspects = [], todayDate, meta } = todayData;

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

    // 네이탈 행성
    const natalStr = PLANET_LABELS
      .filter(([k]) => natal[k])
      .map(([k, label]) => {
        const p = natal[k];
        return `네이탈 ${label}: ${p.sign} ${p.degree}°${p.minute}', ${p.house}하우스`;
      }).join('\n');

    // 오늘 트랜짓 행성
    const transitStr = PLANET_LABELS
      .filter(([k]) => todayTransit[k])
      .map(([k, label]) => {
        const p = todayTransit[k];
        return `오늘 ${label}: ${p.sign} ${p.degree}°${p.minute}', ${p.house}하우스`;
      }).join('\n');

    // 오늘 트랜짓 → 네이탈 에스펙트 (강한 것만 — orb 4° 이내)
    const keyAspects = todayAspects
      .filter(a => a.orb <= 4)
      .sort((a, b) => a.orb - b.orb)
      .slice(0, 10)
      .map(a => `${a.transitPlanet} ${a.symbol} ${a.natalPlanet} (${a.aspect}, 오브 ${a.orb}°, ${a.applying ? '접근중' : '이탈중'})`)
      .join('\n');

    const prompt =
`[오늘의 운세 분석 데이터]
이름: ${meta.name || '(이름 없음)'}
성별: ${meta.gender === 'M' ? '남성' : '여성'}
출생: ${meta.birthDate} ${meta.birthTime}
오늘 날짜: ${todayDate}

어센던트(ASC): ${natalAngles?.asc?.sign || ''} ${natalAngles?.asc?.degree || ''}°
MC(천정): ${natalAngles?.mc?.sign || ''} ${natalAngles?.mc?.degree || ''}°

[네이탈 행성 위치]
${natalStr}

[오늘 하늘의 행성 위치]
${transitStr}

[오늘 핵심 에스펙트 (트랜짓→네이탈)]
${keyAspects || '(주요 에스펙트 없음)'}

[오늘 운세 작성 지침 — 반드시 준수]
- 자기소개 없이 바로 시작하세요.
- 행성 이름, 사인 이름, 각도 숫자, 기호(☌△□☍⚹), 하우스 번호를 결과 텍스트에 절대 쓰지 마세요.
- 모든 점성술 의미를 자연스러운 한국어 삶의 언어로만 표현하세요.
- 반드시 이 사람의 네이탈 차트와 오늘 에스펙트에서 근거를 찾아 구체적으로 쓰세요.
- 누구에게나 해당되는 일반적인 조언은 금지합니다.
- 완성된 문장으로 끝까지 마무리하세요.

[출력 양식 — 아래 5개 항목을 순서대로 작성]

## 오늘의 전체 에너지
(오늘 하늘 에너지와 이 사람의 차트가 만나는 지점을 2~3문장으로 핵심만)

## 💰 재물 · 직업
(오늘 재물과 일에 관한 구체적인 흐름 — 2~3문장)

## 💕 관계 · 감정
(오늘 인간관계와 감정 흐름 — 2~3문장)

## 🏃 행동 · 에너지
(오늘 신체 에너지와 행동력 — 2~3문장)

## 🌙 오늘의 조언
(오늘 하루를 어떻게 보내면 좋을지 — 한 문장으로 핵심만)`;

    // Gemini API 호출 (최대 3회 재시도)
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
                maxOutputTokens: 2048,   // 오늘 운세는 짧게
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
