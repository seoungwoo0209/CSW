/* =========================================================
   api/gemini-astro.js  v2.1
   수정 사항:
   - 파일 이중복사 제거 (235번 줄 이후 중복 코드 삭제)
   - isQuestion 분기 정상화 (전체 리딩 / 추가 질문 분기 교체)
   - 백틱 파싱 오류 수정
   ========================================================= */

import { applyCors } from './_cors.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { astroData, question, previousReading } = req.body;

    if (!astroData) {
      return res.status(400).json({ error: '천문 데이터가 없습니다.' });
    }

    const { natal, angles, houses, natalAspectsFull = [], progression, meta, transits = [], transitsYear, nodes } = astroData;
    const reportYear = transitsYear || new Date().getFullYear();
    const progPlanets = progression?.planets || {};
    const progAngles  = progression?.angles  || {};
    const progMeta    = progression?.meta    || {};
    const progAspects = progression?.aspectsFull || [];

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

    // ── 에스펙트 문자열 (AI 입력용)
    const natalAspectStr = natalAspectsFull.length
      ? natalAspectsFull.map(a => `${a.point1} ${a.symbol} ${a.point2} (${a.aspect}, orb ${a.orb}°)`).join('\n')
      : '(주요 에스펙트 없음)';

    const progAspectStr = progAspects.length
      ? progAspects.map(a => `${a.point1} ${a.symbol} ${a.point2} (${a.aspect}, orb ${a.orb}°)`).join('\n')
      : '(주요 프로그레션 에스펙트 없음)';

    // ── 올해 트랜짓 문자열
    const PLANET_KR_MAP = {
      sun:'태양', mercury:'수성', venus:'금성',
      mars:'화성', jupiter:'목성', saturn:'토성'
    };
    const transitStr = transits.length
      ? transits.map(m => {
          const planets = Object.entries(m.planets)
            .map(([k, v]) => `${PLANET_KR_MAP[k]}(${v.sign}·${v.house}하우스)`)
            .join(', ');
          return `${m.month}: ${planets}`;
        }).join('\n')
      : '(트랜짓 데이터 없음)';

    // ── 노드 문자열
    const nodesStr = nodes
      ? `북노드(☊): ${nodes.north.sign} ${nodes.north.degree}°${nodes.north.minute}'\n` +
        `릴리스(☋): ${nodes.south.sign} ${nodes.south.degree}°${nodes.south.minute}'`
      : '';

    // ── 공통 분석 데이터 블록
    const baseData =
`[분석 데이터]
이름: ${meta.name || '(이름 없음)'}
성별: ${meta.gender === 'M' ? '남성' : '여성'}
출생: ${meta.birthDate} ${meta.birthTime}
하우스 시스템: ${meta.houseSystem || 'Placidus'}

어센던트(ASC): ${angles.asc.sign} ${angles.asc.degree}°${angles.asc.minute}'
MC(천정): ${angles.mc.sign} ${angles.mc.degree}°${angles.mc.minute}'
${nodesStr ? `\n달의 교점:\n${nodesStr}` : ''}

네이탈 행성 위치:
${planetStr}

하우스 커스프:
${houseCusps}

네이탈 주요 에스펙트 (행성+ASC/MC+북노드/릴리스 전체):
${natalAspectStr}

[세컨더리 프로그레션] (기준일: ${progMeta.progDate || '현재'}, 나이 약 ${progMeta.ageYears || '?'}세)
${progPlanetStr}
${progAnglesStr}

프로그레션↔네이탈 주요 에스펙트:
${progAspectStr}`;

    // ── 프롬프트 분기: 추가 질문 vs 전체 리딩
    const isQuestion = !!question;
    let prompt;

    if (isQuestion) {
      // 추가 질문 모드 — 짧고 직접적인 답변
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
      // 전체 리딩 모드 — 인생 흐름 + 올해 월별 운세
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
· 북노드(인생의 카르마 방향)와 릴리스(반복되는 전생 패턴)가 삶의 테마에 미치는 영향
300자 이상 충분히 써주세요.

## 📅 ${reportYear}년 운세

[프로그레션 데이터 — 내면 성장 흐름]
${progPlanetStr}
${progAnglesStr}
프로그레션↔네이탈 에스펙트: ${progAspectStr}

[${reportYear}년 실제 행성 위치 — 외부 환경 흐름]
${transitStr}

위 두 가지 데이터를 모두 활용해서 다음 순서로 반드시 작성하세요.
절대 일반적이거나 누구에게나 해당되는 내용을 쓰지 마세요.
반드시 이 사람의 나탈 차트와 프로그레션 데이터에서 근거를 찾아 구체적으로 써야 합니다.

**${reportYear}년 전체 흐름 요약** (4~5문장)
- 이 사람의 나탈 차트 특성과 올해 에너지가 어떻게 맞물리는지
- 올해 가장 중요한 테마 2가지를 명확히 제시
- 특히 좋은 시기와 조심할 시기를 언급

**월별 상세 운세** (1월~12월, 각 달마다 반드시 아래 형식으로)

### 1월
- 이달의 핵심 에너지: (구체적으로)
- 재물/직업: (구체적으로)
- 관계: (구체적으로)
- 이달의 조언: (한 문장)

### 2월
- 이달의 핵심 에너지: (구체적으로)
- 재물/직업: (구체적으로)
- 관계: (구체적으로)
- 이달의 조언: (한 문장)

### 3월
- 이달의 핵심 에너지: (구체적으로)
- 재물/직업: (구체적으로)
- 관계: (구체적으로)
- 이달의 조언: (한 문장)

### 4월
- 이달의 핵심 에너지: (구체적으로)
- 재물/직업: (구체적으로)
- 관계: (구체적으로)
- 이달의 조언: (한 문장)

### 5월
- 이달의 핵심 에너지: (구체적으로)
- 재물/직업: (구체적으로)
- 관계: (구체적으로)
- 이달의 조언: (한 문장)

### 6월
- 이달의 핵심 에너지: (구체적으로)
- 재물/직업: (구체적으로)
- 관계: (구체적으로)
- 이달의 조언: (한 문장)

### 7월
- 이달의 핵심 에너지: (구체적으로)
- 재물/직업: (구체적으로)
- 관계: (구체적으로)
- 이달의 조언: (한 문장)

### 8월
- 이달의 핵심 에너지: (구체적으로)
- 재물/직업: (구체적으로)
- 관계: (구체적으로)
- 이달의 조언: (한 문장)

### 9월
- 이달의 핵심 에너지: (구체적으로)
- 재물/직업: (구체적으로)
- 관계: (구체적으로)
- 이달의 조언: (한 문장)

### 10월
- 이달의 핵심 에너지: (구체적으로)
- 재물/직업: (구체적으로)
- 관계: (구체적으로)
- 이달의 조언: (한 문장)

### 11월
- 이달의 핵심 에너지: (구체적으로)
- 재물/직업: (구체적으로)
- 관계: (구체적으로)
- 이달의 조언: (한 문장)

### 12월
- 이달의 핵심 에너지: (구체적으로)
- 재물/직업: (구체적으로)
- 관계: (구체적으로)
- 이달의 조언: (한 문장)

[절대 금지 사항]
- 행성 이름, 사인 이름, 각도 숫자, 하우스 번호 언급 금지
- "새로운 시작", "긍정적인 변화", "신중함이 필요" 같은 모호한 표현 금지
- 누구에게나 해당되는 일반적인 조언 금지
- 반드시 이 사람의 데이터에서 근거를 찾아 구체적으로 써야 함`;
    }

    // ── Gemini API 호출 (시간차 이중 요청 — 1번이 실패/5초경과 시 2번 발사, 먼저 성공하는 응답 채택)
    const controllers = [];
    const fireAttempt = () => {
      const controller = new AbortController();
      controllers.push(controller);
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.75,
              maxOutputTokens: 16384,
              thinkingConfig: { thinkingBudget: 0 },
            }
          })
        }
      ).then(async r => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        const json = await r.json();
        const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!reply) throw new Error('빈 응답');
        return reply;
      });
    };

    const attempt1 = fireAttempt();
    let secondAttempt = null;
    const fireSecond = () => { if (!secondAttempt) secondAttempt = fireAttempt(); return secondAttempt; };
    const earlyTrigger = new Promise(resolve => { attempt1.catch(() => setTimeout(resolve, 700)); });
    const timerTrigger = new Promise(resolve => setTimeout(resolve, 5000));
    const staggeredAttempt = Promise.race([earlyTrigger, timerTrigger]).then(fireSecond);

    let reply, lastError;
    try {
      reply = await Promise.any([attempt1, staggeredAttempt]);
    } catch (aggErr) {
      lastError = aggErr;
    }
    controllers.forEach(c => c.abort());
    if (!reply) {
      console.error('Gemini API error (all parallel attempts failed):', lastError?.errors ? lastError.errors.map(e => e?.message || e).join(' | ') : (lastError?.message || lastError));
      return res.status(502).json({ error: '현재 접속자가 많아 응답이 지연되고 있습니다. 잠시만 기다리시거나, 버튼을 몇 번 더 시도해 주시면 정상적으로 이용하실 수 있습니다.' });
    }

    return res.status(200).json({ result: reply, astroData });

  } catch (error) {
    console.error('gemini-astro error:', error);
    return res.status(500).json({ error: '점성술 분석 중 오류가 발생했습니다.' });
  }
}
