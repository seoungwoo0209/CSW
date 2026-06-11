/* =========================================================
   api/gemini-astro.js
   사전 계산된 astroData → Gemini 해석만 수행
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

    const { angles, interpretation, meta } = astroData;
    const I = interpretation || {};

    const prompt = `[시스템 역할 정의]
당신은 20년 경력의 전문 서양 점성술사입니다. 아래 데이터는 이미 계산된 결과입니다. 새로 계산하지 말고, 제공된 수치만 근거로 해석하세요.

[핵심 리딩 원칙]
1. 코어 자아: 태양과 달을 중심으로 본질을 먼저 설명하세요.
2. 전체 흐름: 12하우스와 차트 지배행성을 서사적으로 연결하세요. 하우스별 나열은 피하세요.
3. 어센던트(ASC): Chart Ruler와 함께 활용하세요.
4. 세컨더리 프로그레션: 프로그레션 행성·ASC·에스펙트로 현재 인생 테마를 짚으세요.
5. 역할 소개 멘트나 "Swiss Ephemeris" 같은 시스템 문구는 출력하지 마세요.
6. 에스펙트는 제공된 목록만 사용하세요. 결과에 각도·오차 수치는 적지 마세요.

[제공 데이터 — 계산 완료]

이름: ${meta.name || '(이름 없음)'}
성별: ${meta.gender === 'M' ? '남성' : '여성'}
출생: ${meta.birthDate} ${meta.birthTime}

어센던트(ASC): ${angles.asc.sign} ${angles.asc.degree}°${angles.asc.minute}'
MC(천정): ${angles.mc.sign} ${angles.mc.degree}°${angles.mc.minute}'

차트 지배행성:
${I.chartRuler || '(없음)'}

네이탈 행성:
${I.natalPlanets || '(없음)'}

하우스 커스프:
${I.houseCusps || '(없음)'}

네이탈 에스펙트:
${I.aspectsNatal || '(없음)'}

${I.progressionMeta || ''}

세컨더리 프로그레션 행성:
${I.progressionPlanets || '(없음)'}

프로그레션 각도:
${I.progressionAngles || '(없음)'}

프로그레션 하우스 커스프:
${I.progressionHouses || '(없음)'}

프로그레션 내부 에스펙트:
${I.aspectsProgression || '(없음)'}

프로그레션 ↔ 네이탈 에스펙트:
${I.aspectsProgToNatal || '(없음)'}

[출력 양식]
반드시 다음 3개 헤드라인으로 완성된 문장을 작성하세요. 중간에 끊지 마세요.

## ✨ 빛나는 코어: 태양과 달이 그리는 나의 본질과 내면 세계

## 🌍 인생의 무대와 스토리: 12하우스와 지배행성이 엮어내는 운명의 흐름

## ⏰ 운명의 시간표: 프로그레션 차트로 보는 현재의 위치와 다가올 변화`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 8192,
          }
        })
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const message = errData?.error?.message || `Gemini API 오류 (status: ${response.status})`;
      return res.status(502).json({ error: message });
    }

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return res.status(502).json({ error: 'AI 응답을 파싱하는 데 실패했습니다.' });
    }

    return res.status(200).json({ result: reply });

  } catch (error) {
    console.error('gemini-astro error:', error);
    return res.status(500).json({ error: '점성술 분석 중 오류가 발생했습니다.' });
  }
}
