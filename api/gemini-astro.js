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

    const { natal, angles, houses, natalAspects = [], progression, meta } = astroData;
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

    const prompt = `[분석 데이터]
이름: ${meta.name || '(이름 없음)'}
성별: ${meta.gender === 'M' ? '남성' : '여성'}
출생: ${meta.birthDate} ${meta.birthTime}
하우스 시스템: ${meta.houseSystem || 'Equal House'}

어센던트(ASC): ${angles.asc.sign} ${angles.asc.degree}°${angles.asc.minute}'
MC(천정): ${angles.mc.sign} ${angles.mc.degree}°${angles.mc.minute}'

네이탈 행성 위치:
${planetStr}

하우스 커스프:
${houseCusps}

네이탈 주요 에스펙트 (분석 인풋용 — 결과에 수치/기호 그대로 쓰지 말 것):
${natalAspectStr}

[세컨더리 프로그레션] (기준일: ${progMeta.progDate || '현재'}, 나이 약 ${progMeta.ageYears || '?'}세)
${progPlanetStr}
${progAnglesStr}

프로그레션↔네이탈 주요 에스펙트 (분석 인풋용 — 결과에 수치/기호 그대로 쓰지 말 것):
${progAspectStr}

[리딩 지침]
- 출력 맨 앞에 "저는 점성술사입니다" 같은 자기소개 문장을 넣지 마세요.
- 에스펙트·하우스 데이터는 해석의 근거로만 쓰고, 결과 텍스트에 각도 숫자나 기호(☌△□☍⚹)를 직접 쓰지 마세요.
- 전문 용어(예: 트라인, 스퀘어, 컨정션)는 한국어 풀이로 바꾸거나 괄호 보충 설명으로 처리하세요.
- 하우스별 나열 대신, 인생의 흐름을 하나의 서사로 연결하세요.
- 어센던트가 Chart Ruler를 결정함을 토대로 전체 구조를 잡으세요.
- 프로그레션 데이터로 현재 인생의 핵심 테마와 앞으로 1~2년 흐름을 짚으세요.
- 완성된 문장으로 마무리하고, 중간에 절대 끊지 마세요.

[출력 양식 — 반드시 아래 3개 헤드라인 순서로 작성]

## ✨ 빛나는 코어: 태양과 달이 그리는 나의 본질과 내면 세계

## 🌍 인생의 무대와 스토리: 하우스와 지배행성이 엮어내는 운명의 흐름

## ⏰ 운명의 시간표: 프로그레션 차트로 보는 현재의 위치와 다가올 변화`;

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
