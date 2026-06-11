export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { name, gender, fourPillars } = req.body;

    // ── 필수 파라미터 유효성 검사
    if (!gender || !fourPillars) {
      return res.status(400).json({ error: '필수 파라미터(gender, fourPillars)가 누락되었습니다.' });
    }

    const requiredPillars = ['year', 'month', 'day', 'hour'];
    for (const key of requiredPillars) {
      if (!fourPillars[key]?.stem || !fourPillars[key]?.branch) {
        return res.status(400).json({ error: `fourPillars.${key} 데이터가 올바르지 않습니다.` });
      }
    }

    const displayName = name?.trim() || '(이름 없음)';

    const prompt = `너는 명리학 사주 전문가야. 아래 사주 정보를 바탕으로 재물운, 이직운, 연애운을 풀이해줘.

규칙:
- 재물운, 이직운, 연애운 순서로 각각 제목을 붙여서 작성해줘
- 각 운마다 현재 상황 분석 3줄 + 앞으로의 조언 3줄로 구성해줘
- 반드시 각 운의 내용을 완성된 문장으로 끝까지 마무리해줘
- 중간에 절대 끊지 말고 세 가지 운 모두 완성해줘
- 친절하고 희망적인 톤으로 작성해줘

이름: ${displayName}
성별: ${gender === 'M' ? '남성' : '여성'}
사주:
  연주: ${fourPillars.year.stem}${fourPillars.year.branch}
  월주: ${fourPillars.month.stem}${fourPillars.month.branch}
  일주: ${fourPillars.day.stem}${fourPillars.day.branch}
  시주: ${fourPillars.hour.stem}${fourPillars.hour.branch}`;

    // ── Gemini API 호출 (자동 재시도 최대 3회)
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
            temperature: 0.8,
            maxOutputTokens: 4096,
          }
        })
      }
        );
        if (response.ok) break;
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
      } catch(e) {
        lastError = e;
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
      }
    }
    if (!response) throw lastError || new Error('재시도 실패');

    // ── HTTP 레벨 에러 처리
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const message = errData?.error?.message || `Gemini API 오류 (status: ${response.status})`;
      console.error('Gemini API error:', message);
      return res.status(502).json({ error: '현재 접속자가 많아 응답이 지연되고 있습니다. 잠시만 기다리시거나, 버튼을 몇 번 더 시도해 주시면 정상적으로 이용하실 수 있습니다.' });
    }

    const data = await response.json();

    // ── 응답 구조 안전 접근
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
