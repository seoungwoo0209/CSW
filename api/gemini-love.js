export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const {
      name, gender, venus, mars, moon,
      house5Sign, house7Sign, house5Occupants, house7Occupants,
      transitNow, progMoonHouse, progMoonSign
    } = req.body;

    if (!venus || !mars || !moon) {
      return res.status(400).json({ error: '필수 파라미터(venus, mars, moon)가 누락되었습니다.' });
    }

    const displayName = name?.trim() || '당신';
    const genderKr     = gender === 'M' ? '남성' : '여성';

    const house5Str = `${house5Sign}자리${house5Occupants?.length ? ` (${house5Occupants.join(', ')} 위치)` : ''}`;
    const house7Str = `${house7Sign}자리${house7Occupants?.length ? ` (${house7Occupants.join(', ')} 위치)` : ''}`;

    let transitStr = '트랜짓 정보 없음';
    if (transitNow) {
      transitStr = `이번 달 트랜짓 — 금성: ${transitNow.planets.venus.sign}, 화성: ${transitNow.planets.mars.sign}`;
    }
    const progMoonStr = progMoonSign ? `프로그레션 달: ${progMoonSign} ${progMoonHouse}하우스` : '프로그레션 정보 없음';

    const prompt = `
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

[섹션 구성 — 반드시 아래 2개 마커를 정확히 그대로 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라: ===SECTION:nature===
마커 자체는 사용자에게 보이지 않는 구분선이므로, 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:nature===
(타고난 연애 기질 — 금성·화성·달·5/7하우스가 만드는 ${displayName}님의 연애 패턴)
- 어떤 사람에게 끌리는지, 사랑을 표현하는 방식, 진지한 관계 vs 가벼운 만남 중 무엇을 추구하는지
- 분량: 4~5문단, 각 문단 3~4문장

===SECTION:timing===
(올해의 연애 흐름 — 트랜짓·프로그레션이 보여주는 타이밍)
- 지금이 연애에 유리한 시기인지, 어떤 변화가 다가오는지
- 구체적으로 어떻게 행동하면 좋을지 실질적인 조언
- 분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 nature와 timing 두 섹션을 마커와 함께 전부 작성해.
`.trim();

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
