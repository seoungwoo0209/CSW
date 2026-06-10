/* =========================================================
   api/gemini-astro.js
   Swiss Ephemeris 데이터 + 에스펙트 데이터 → Gemini 점성술 해석
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

    // ── 데이터 구조에서 aspects(에스펙트)까지 안전하게 추출
    const { natal, angles, houses, progression, aspects, meta } = astroData;

    // ── 하우스 커스프 문자열 생성
    const houseCusps = houses.map(h =>
      `${h.house}하우스 커스프: ${h.sign} ${h.degree}°${h.minute}'`
    ).join('\n');

    // ── 행성 위치 문자열 생성
    const planetStr = [
      `태양(Sun): ${natal.sun.sign} ${natal.sun.degree}°${natal.sun.minute}', ${natal.sun.house}하우스`,
      `달(Moon): ${natal.moon.sign} ${natal.moon.degree}°${natal.moon.minute}', ${natal.moon.house}하우스`,
      `수성(Mercury): ${natal.mercury.sign} ${natal.mercury.degree}°${natal.mercury.minute}', ${natal.mercury.house}하우스`,
      `금성(Venus): ${natal.venus.sign} ${natal.venus.degree}°${natal.venus.minute}', ${natal.venus.house}하우스`,
      `화성(Mars): ${natal.mars.sign} ${natal.mars.degree}°${natal.mars.minute}', ${natal.mars.house}하우스`,
      `목성(Jupiter): ${natal.jupiter.sign} ${natal.jupiter.degree}°${natal.jupiter.minute}', ${natal.jupiter.house}하우스`,
      `토성(Saturn): ${natal.saturn.sign} ${natal.saturn.degree}°${natal.saturn.minute}', ${natal.saturn.house}하우스`,
      `천왕성(Uranus): ${natal.uranus.sign} ${natal.uranus.degree}°${natal.uranus.minute}', ${natal.uranus.house}하우스`,
      `해왕성(Neptune): ${natal.neptune.sign} ${natal.neptune.degree}°${natal.neptune.minute}', ${natal.neptune.house}하우스`,
      `명왕성(Pluto): ${natal.pluto.sign} ${natal.pluto.degree}°${natal.pluto.minute}', ${natal.pluto.house}하우스`,
    ].join('\n');

    // ── ⚡ [에스펙트 치트키]: 스위스 사이트 데이터 구조가 어떻든 간에 통째로 텍스트로 구워서 넘김
    const aspectRawStr = aspects 
      ? JSON.stringify(aspects, null, 2) 
      : '제공된 주요 에스펙트 정보 없음';

    // ── ⚡ 뼈대는 지키고 낭비는 줄인 프롬프트 커스텀
    const prompt = `[시스템 역할 정의]
당신은 전문 서양 점성술사이자 운명 학자입니다. 제공되는 Swiss Ephemeris 데이터를 정밀하게 분석하여, 단편적인 해석을 넘어선 깊이 있고 유기적인 인생의 흐름을 통찰해 주세요.

[핵심 리딩 원칙]
1. 코어 자아: 태양(의식/자아실현)과 달(무의식/내면/감정)을 중심으로 본질적인 코어를 가장 먼저 깊게 설명하세요.
2. 전체 흐름: 플라시두스(Placidus) 1~12 하우스 구조로 인생의 흐름을 서사적으로 연결하세요.
3. 어센던트(ASC): 전체 하우스 구조의 기준점이자 Chart Ruler를 결정하는 핵심 지표로 활용하세요.
4. 세컨더리 프로그레션: 현재 프로그레션 태양과 달의 위치로 현재 인생의 메인 테마를 짚어주세요.
5. 행성 간 에스펙트: [Raw 에스펙트 데이터]에 기록된 각도 관계(Conjunction, Opposition, Trine, Square 등)를 완벽히 인지하고, 이것이 개인의 성향, 내면적 갈등, 잠재적 재능에 미치는 영향을 리딩 전반에 유기적으로 반영하세요.

[출력 및 작성 규칙 - 필수 엄수]
1. "안녕하세요, 추승우 님", "20년 경력의 전문가로서..." 같은 자기소개, 환영 인사, 서론, 결론부의 상투적인 미사여구는 '절대' 출력하지 마세요. 가차 없이 본론만 적어야 합니다.
2. 리딩 결과물은 어떠한 사전 텍스트나 공백 없이, 바로 아래 지정된 [출력 양식]의 첫 번째 ## 헤드라인으로 즉시 시작해야 합니다.
3. 본문 문장 내에 "00도 00분" 같은 세부 도수 숫자는 직접 언급하지 말고 의미와 기운 중심으로 풀어쓰세요. (숫자 텍스트 생성으로 인한 토큰 낭비 방지)

[제공 데이터 - Swiss Ephemeris 결과]
이름: ${meta.name || '(이름 없음)'}
성별: ${meta.gender === 'M' ? '남성' : '여성'}
출생: ${meta.birthDate} ${meta.birthTime}

어센던트(ASC): ${angles.asc.sign} ${angles.asc.degree}°${angles.asc.minute}'
MC(천정): ${angles.mc.sign} ${angles.mc.degree}°${angles.mc.minute}'

네이탈 행성 위치:
${planetStr}

하우스 커스프:
${houseCusps}

[Raw 에스펙트 데이터]:
${aspectRawStr}

현재 세컨더리 프로그레션:
프로그레션 태양: ${progression.sun.sign} ${progression.sun.degree}°${progression.sun.minute}'
프로그레션 달: ${progression.moon.sign} ${progression.moon.degree}°${progression.moon.minute}'

[출력 양식]
반드시 다음 3개의 헤드라인을 사용하여 완성된 문장으로 작성하세요. 중간에 절대 끊지 마세요.

## ✨ 빛나는 코어: 태양과 달이 그리는 나의 본질과 내면 세계

## 🌍 인생의 무대와 스토리: 12하우스와 지배행성이 엮어내는 운명의 흐름

## ⏰ 운명의 시간표: 프로그레션 차트로 보는 현재의 위치와 다가올 변화`;

    // ── 기존과 동일한 단일 JSON 반환 구조 (generateContent)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 4000, // 에스펙트와 12하우스 서사가 다 들어가므로 넉넉하게 지정
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

    // 프론트엔드가 기대하는 원래 포맷 그대로 리턴
    return res.status(200).json({ result: reply, astroData });

  } catch (error) {
    console.error('gemini-astro error:', error);
    return res.status(500).json({ error: '점성술 분석 중 오류가 발생했습니다.' });
  }
}