/* =========================================================
   api/gemini-astro.js  v2.1
   수정 사항:
   - 파일 이중복사 제거 (235번 줄 이후 중복 코드 삭제)
   - isQuestion 분기 정상화 (전체 리딩 / 추가 질문 분기 교체)
   - 백틱 파싱 오류 수정
   ========================================================= */

import { applyCors } from './_cors.js';
import { logError } from './_errorLog.js';

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

    const { natal, angles, houses, natalAspectsFull = [], progression, meta, nodes, lunationCycle, profectionWealth } = astroData;
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

    // ── 진행월령(인생 전체 흐름) 문자열
    const lunationStr = lunationCycle?.stages?.length
      ? lunationCycle.stages.map(s => `${s.stageName} (${s.fromAge.toFixed(1)}세~${s.toAge.toFixed(1)}세)`).join('\n') +
        `\n→ 현재(${lunationCycle.currentAgeYears}세)는 "${lunationCycle.stages[lunationCycle.currentStageIndex]?.stageName}" 단계`
      : '(데이터 없음)';

    // ── 프로펙션 재물(2하우스) 문자열
    const DIGNITY_KR = {
      rulership: '자기 별자리(가장 강함)', exaltation: '승격(매우 좋음)',
      detriment: '디트리먼트(약화됨)', fall: '함몰(가장 약함)', peregrine: '중립'
    };
    const profectionStr = profectionWealth
      ? `재물(2하우스) 지배성: ${profectionWealth.rulerLabel} (위계: ${DIGNITY_KR[profectionWealth.dignity]})\n` +
        `재물운 활성화 나이: ${profectionWealth.activeAges.slice(0, 8).join(', ')}세 (12년마다 반복)\n` +
        `${profectionWealth.rulerLabel}의 주요각:\n` +
        (profectionWealth.rulerAspects.length
          ? profectionWealth.rulerAspects.map(a => `${a.point1} ${a.symbol} ${a.point2} (${a.aspect})`).join('\n')
          : '(주요각 없음)')
      : '(데이터 없음)';

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
      // 전체 리딩 모드 — 진행월령 + 프로펙션 재물 기반 인생 전체 흐름
      prompt = baseData + `

[리딩 지침 — 반드시 준수]
- 자기소개 문장 없이 바로 시작하세요.
- 결과 텍스트에 행성 이름(태양·달·목성 등), 사인 이름(양자리·전갈자리 등), 각도 숫자, 기호(☌△□☍⚹), 하우스 번호를 절대 쓰지 마세요.
- 대신 그 의미와 영향을 자연스러운 한국어 문장으로만 표현하세요.
  예시) X "목성이 10하우스에서 MC와 트라인" → O "사회적 성취와 커리어 확장의 에너지가 강하게 작동하는 시기"
  예시) X "프로그레션 달이 양자리 5하우스" → O "지금은 새로운 도전에 본능적으로 끌리고 창의적 표현 욕구가 강해지는 때"
- 완성된 문장으로 마무리하고 중간에 절대 끊지 마세요.

[출력 양식 — 반드시 아래 헤드라인으로 작성]

## 🌌 인생 전체 흐름

[진행월령 데이터 — 인생의 심리적 계절 흐름]
${lunationStr}

[프로펙션 재물(2하우스) 데이터]
${profectionStr}

위 두 데이터를 반드시 모두 반영해서, 이 사람의 인생 전체를 가로지르는 큰 흐름을 서사로 써주세요:
· 진행월령 8단계가 보여주는 인생의 시기별 성격 변화 — 지금이 어느 단계인지, 그 단계가 어떤 의미인지 구체적으로
· 위에 나온 재물운 활성화 나이들이 실제로 이 사람 인생에서 어떤 시기들인지(이미 지난 나이는 "그때 이런 흐름이 있었을 것"으로, 앞으로 올 나이는 "다가올 시기"로) 자연스럽게 짚어주기
· 재물 지배성의 위계(자기 별자리/승격이면 타고난 재물 그릇이 좋다는 뜻, 디트리먼트/함몰이면 애를 먹지만 노력으로 극복 가능, 중립이면 평범하게 안정적)와 그 행성의 주요각이 보여주는 재물운의 "질감"(꾸준한지, 들쑥날쑥한지, 마찰이 있는지)
· 타고난 강점과 반복되는 과제, 인생에서 중요한 성장 방향
이 섹션에서는 나이 숫자를 자연스럽게 언급해도 됩니다(다른 곳과 달리 시기를 짚어주는 게 핵심이므로).
행성 이름·사인 이름·각도 숫자·기호·하우스 번호는 여기서도 쓰지 말고 의미만 풀어서 설명하세요.
400자 이상 충분히 써주세요.

[절대 금지 사항]
- 행성 이름, 사인 이름, 각도 숫자, 기호, 하우스 번호 언급 금지(나이 숫자는 허용)
- "새로운 시작", "긍정적인 변화", "신중함이 필요" 같은 모호한 표현 금지
- 누구에게나 해당되는 일반적인 조언 금지
- 반드시 이 사람의 데이터에서 근거를 찾아 구체적으로 써야 함`;
    }

    // ── Gemini API 호출 (시간차 이중 요청 — 1번이 실패/5초경과 시 2번 발사, 먼저 성공하는 응답 채택)
    const controllers = [];
    const fireAttempt = (model = 'gemini-2.5-flash') => {
      const controller = new AbortController();
      controllers.push(controller);
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
        const finishReason = json?.candidates?.[0]?.finishReason;
        if (!reply) throw new Error(`빈 응답 (finishReason: ${finishReason || '알수없음'})`);
        if (finishReason === 'MAX_TOKENS') throw new Error('응답이 글자수 한도에 걸려 중간에 잘림 (MAX_TOKENS)');
        return reply;
      });
    };

    const attempt1 = fireAttempt();
    let secondAttempt = null;
    const fireSecond = () => { if (!secondAttempt) secondAttempt = fireAttempt(); return secondAttempt; };
    const earlyTrigger = new Promise(resolve => { attempt1.catch(() => setTimeout(resolve, 700)); });
    const timerTrigger = new Promise(resolve => setTimeout(resolve, 5000));
    const staggeredAttempt = Promise.race([earlyTrigger, timerTrigger]).then(fireSecond);

    // 1·2차가 둘 다 실패로 확정되면 3차를 한 번 더 쏜다(동시 3중 발사로 자체 과부하 유발 방지)
    let thirdAttempt = null;
    // 3차는 1·2차와 다른 모델로 쏴서, 같은 모델이 그 순간 과부하라도 다른 모델 쪽 여유가 있으면 살아난다.
    const fireThird = () => { if (!thirdAttempt) thirdAttempt = fireAttempt('gemini-2.5-flash-lite'); return thirdAttempt; };
    const bothFailedTrigger = Promise.allSettled([attempt1, staggeredAttempt]).then(results => {
      if (results.every(r => r.status === 'rejected')) return fireThird();
      throw new Error('다른 시도가 이미 성공함');
    });

    let reply, lastError;
    try {
      reply = await Promise.any([attempt1, staggeredAttempt, bothFailedTrigger]);
    } catch (aggErr) {
      lastError = aggErr;
    }
    controllers.forEach(c => c.abort());
    if (!reply) {
      const detail = lastError?.errors ? lastError.errors.map(e => e?.message || e).join(' | ') : (lastError?.message || lastError);
      console.error('Gemini API error (all parallel attempts failed):', detail);
      await logError('gemini-astro', detail);
      return res.status(502).json({ error: '현재 접속자가 많아 응답이 지연되고 있습니다. 잠시만 기다리시거나, 버튼을 몇 번 더 시도해 주시면 정상적으로 이용하실 수 있습니다.' });
    }

    return res.status(200).json({ result: reply, astroData });

  } catch (error) {
    console.error('gemini-astro error:', error);
    await logError('gemini-astro', error?.message || error);
    return res.status(500).json({ error: '점성술 분석 중 오류가 발생했습니다.' });
  }
}
