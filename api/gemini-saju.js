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

    const prompt = `너는 명리학 사주 전문가야. 아래 사주 정보를 바탕으로 재물운, 이직운, 연애운을 각각 구분해서 친절하고 자세하게 풀이해줘. 각 운은 현재 상황 분석과 앞으로의 조언을 포함해줘.

이름: ${displayName}
성별: ${gender === 'M' ? '남성' : '여성'}
사주:
  연주: ${fourPillars.year.stem}${fourPillars.year.branch}
  월주: ${fourPillars.month.stem}${fourPillars.month.branch}
  일주: ${fourPillars.day.stem}${fourPillars.day.branch}
  시주: ${fourPillars.hour.stem}${fourPillars.hour.branch}`;

    // ── Gemini API 호출
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    // ── HTTP 레벨 에러 처리
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const message = errData?.error?.message || `Gemini API 오류 (status: ${response.status})`;
      console.error('Gemini API error:', message);
      return res.status(502).json({ error: message });
    }

    const data = await response.json();

    // ── 응답 구조 안전 접근
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      console.error('Gemini 응답 파싱 실패:', JSON.stringify(data));
      return res.status(502).json({ error: 'AI 응답을 파싱하는 데 실패했습니다.' });
    }

    return res.status(200).json({ result: reply });

  } catch (error) {
    console.error('handler error:', error);
    return res.status(500).json({ error: 'AI 운세를 불러오는 중 오류가 발생했습니다.' });
  }
}
