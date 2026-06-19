/* =========================================================
   api/gemini-events.js  v1.0
   연간 이벤트 JSON (A단계 엔진 출력) → Gemini 연간 리포트 (B단계)
   ─────────────────────────────────────────────────────────
   규칙: AI는 engineData의 fact 값을 바탕으로만 글을 쓴다.
         사실 판단·추측·퍼센트 수치 금지.
   ========================================================= */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { engineData, meta } = req.body;
    if (!engineData) {
      return res.status(400).json({ error: '엔진 데이터가 없습니다.' });
    }

    const { year, profection, events = [] } = engineData;
    const name      = meta?.name || '';
    const birthDate = meta?.birthDate || '';
    const gender    = meta?.gender === 'M' ? '남성' : '여성';
    const age       = profection?.age ?? '?';

    /* ── 이벤트 텍스트 직렬화 ─────────────────────────────── */
    function fmtEvent(e, idx) {
      const tierLabel = e.tier === 1 ? 'Tier1(핵심)' : 'Tier2(참고)';
      const hStr      = e.house ? `${e.house}하우스` : '하우스 정보 없음';
      const orbStr    = e.orb   != null ? `오브 ${e.orb}°` : '—';
      const vKR = {
        supportive:   '기회·상승',
        challenging:  '긴장·도전',
        double_edged: '양면 에너지',
        neutral:      '중립',
      }[e.valence] || e.valence;
      return (
        `[${idx + 1}] ${e.when}  ${e.technique}  [${tierLabel}]\n` +
        `  행성: ${e.bodies.join(', ')}  위치: ${hStr}  ${orbStr}\n` +
        `  밸런스: ${vKR}  중요도: ${e.importance === 'major' ? '★ 주요' : '일반'}\n` +
        `  FACT: ${e.fact}`
      );
    }

    const commonEvents = events.filter(e => e.layer === 'common');
    const majorImpacts = events.filter(e => e.layer === 'impact' && e.importance === 'major');
    const minorImpacts = events.filter(e => e.layer === 'impact' && e.importance === 'minor');

    const commonText = commonEvents.length > 0
      ? commonEvents.map(fmtEvent).join('\n\n')
      : '(공통 이벤트 없음)';

    const majorText = majorImpacts.length > 0
      ? majorImpacts.map(fmtEvent).join('\n\n')
      : '(주요 임팩트 이벤트 없음)';

    const minorText = minorImpacts.length > 0
      ? minorImpacts.map((e, i) => fmtEvent(e, i)).join('\n\n')
      : '';

    /* ── 프롬프트 ─────────────────────────────────────────── */
    const prompt =
`[연간 점성술 리포트 — A단계 엔진 계산 데이터]
이름: ${name}
성별: ${gender}
생년월일: ${birthDate}
대상 연도: ${year}년 (만 ${age}세)

━━━ 프로펙션(연행) ━━━
연행 하우스: ${profection.house}하우스 (테마: ${profection.theme})
연행 로드(Lord of Year): ${profection.lord}
※ 이 해의 핵심 주제 하우스와 지배 행성

━━━ 공통 이벤트 (연간 배경 에너지) ━━━
${commonText}

━━━ 주요 임팩트 이벤트 (★) ━━━
${majorText}

${minorText ? `━━━ 참고 임팩트 이벤트 ━━━\n${minorText}\n` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[리포트 작성 필수 규칙]
1. 위 FACT 데이터에 없는 내용을 창작하거나 추측하지 마세요.
2. 행성 이름·사인 이름·각도 숫자·기호(☌△□☍⚹)·하우스 번호를 결과 텍스트에 쓰지 마세요.
3. 모든 점성술 의미를 자연스러운 한국어 삶의 언어로만 표현하세요.
4. valence가 'double_edged'인 이벤트는 기회와 위험 양면을 모두 서술하세요.
5. 퍼센트 수치(예: "70% 확률") 또는 근거 없는 숫자 사용 금지.
6. ★ 주요 이벤트를 더 강조해 서술하고, 일반 이벤트는 간략히 언급하세요.
7. 완성된 문장으로 마무리하세요. 중간에 끊지 마세요.
8. 자기소개 없이 바로 시작하세요.

[출력 양식 — 아래 6개 섹션을 순서대로 완성]

## 올해의 큰 흐름
이 해 전체의 핵심 테마와 삶의 챕터를 3~4문장으로. 프로펙션 하우스·공통 이벤트에 근거해서.

## 올해의 무드 — ${profection.house}하우스
연행 하우스 ${profection.house}번의 테마(${profection.theme})가 삶에 어떻게 나타나는지, 연행 로드인 ${profection.lord}의 역할은 무엇인지 3~4문장으로.

## 핵심 사건과 시기
★ 주요 임팩트 이벤트를 중심으로 "언제 무슨 흐름이 오는지"를 시기(when)와 연결해 구체적으로. 5~7문장.

## 영역별 흐름

### 직업·사회
직업·사회적 위치에 관련된 이벤트들을 종합해 3~4문장.

### 재물·자원
재물·경제 흐름에 관련된 이벤트들을 종합해 3~4문장.

### 관계·감정
인간관계·감정 흐름에 관련된 이벤트들을 종합해 3~4문장.

## 주목할 포인트
올해 특히 주의하거나 기회로 활용할 수 있는 2~3가지 포인트를 구체적으로.

## 마무리
이 해를 어떻게 살아가면 좋을지, 위 데이터에 근거한 실용적인 조언으로 2~3문장 마무리.

## 이벤트 개별 해석
★ 주요 이벤트 각각에 대해 아래 E번호 순서대로 2~3문장씩 개별 서술.
시기(when)를 자연스럽게 녹이고, 삶의 언어로 구체적으로. 행성·기호·각도 숫자 표기 금지.
${events.filter(e => e.importance === 'major').slice(0, 6).map((e, i) =>
  `\n### E${i + 1}\n(${e.when} · ${e.fact} — 이 이벤트의 삶에서의 의미와 대응 방법 2~3문장)`
).join('')}`;

    /* ── Gemini API 호출 (최대 3회 재시도) ──────────────────── */
    let response, lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature:      0.70,
                maxOutputTokens:  8192,
                thinkingConfig:   { thinkingBudget: 0 },
              },
            }),
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
    console.error('gemini-events error:', error);
    return res.status(500).json({ error: '연간 리포트 생성 중 오류가 발생했습니다.' });
  }
}
