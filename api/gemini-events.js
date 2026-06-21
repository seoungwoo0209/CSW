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

    const isSolarReturn = e => e.technique === 'Solar Return' || e.technique === 'Solar Return aspects to natal';

    const srEvents      = events.filter(e => e.layer === 'common' && isSolarReturn(e));
    const commonEvents  = events.filter(e => e.layer === 'common' && !isSolarReturn(e));
    const majorImpacts  = events.filter(e => e.layer === 'impact' && e.importance === 'major');
    const minorImpacts  = events.filter(e => e.layer === 'impact' && e.importance === 'minor');

    const srText = srEvents.length > 0
      ? srEvents.map(fmtEvent).join('\n\n')
      : '(솔라리턴 데이터 없음)';

    const commonText = commonEvents.length > 0
      ? commonEvents.map(fmtEvent).join('\n\n')
      : '(공통 이벤트 없음)';

    const majorText = majorImpacts.length > 0
      ? majorImpacts.map(fmtEvent).join('\n\n')
      : '(주요 임팩트 이벤트 없음)';

    const minorText = minorImpacts.length > 0
      ? minorImpacts.map((e, i) => fmtEvent(e, i)).join('\n\n')
      : '';

    // 선별(중요도, 기존 기준)과 화면 표시 순서(날짜순)를 분리한다.
    // app.js가 만드는 카드 순서와 동일한 선별+정렬을 써야 "이벤트 개별 해석"의
    // E번호가 화면의 개별 이벤트 카드와 어긋나지 않는다.
    const majorEventsOrdered = events
      .filter(e => e.importance === 'major')
      .slice(0, 6)
      .sort((a, b) => (a.when || '').localeCompare(b.when || ''));

    /* ── 출력 토큰 한도: 이벤트 수에 비례해 동적으로(끝이 잘리지 않게) ──
       기본값(8192)은 현재 수준을 보장하고, 주요 이벤트·전체 이벤트가
       평소보다 많은 케이스에서만 한도를 끌어올린다. */
    const totalEventCount = commonEvents.length + majorImpacts.length + minorImpacts.length + srEvents.length;
    const dynamicMaxTokens = Math.min(
      16384,
      8192 + Math.max(0, majorImpacts.length - 3) * 800 + Math.max(0, totalEventCount - 8) * 100
    );

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

━━━ 올해 솔라리턴 ━━━
${srText}
※ 솔라리턴은 그 해 전체의 분위기/에너지가 집중되는 영역을 보여주는 1년 단위 회귀점. 아래 공통·임팩트 이벤트와 자연스럽게 엮어서 서술할 것.

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
9. 각 섹션은 자기 "임무"의 측면만 다루세요. 앞 섹션에서 이미 서술한 사건·표현을 다른 섹션에서 그대로 반복하지 마세요 — 같은 사건이라도 섹션마다 총평/디테일/전략 중 자기 몫만 다루세요.
10. 사건이 적거나 약한 해는 절대 부풀리지 말고 "안정·다지기의 해"로 정직하게 서술하세요. 없는 사건을 만들어내지 마세요. 대신 주요 이벤트가 적을수록 영역별 흐름·주목할 포인트·마무리를 더 충실하고 깊이 있게 작성해 분량을 보완하세요.
11. 시기(특정 월)는 "이벤트 개별 해석"에서만 다룹니다. 올해의 큰 흐름·영역별 흐름·주목할 포인트·마무리에서는 특정 월("8월", "12월" 등)을 절대 다시 언급하지 마세요. 큰 흐름에서 쓰는 "상/하반기" 같은 큰 시기 덩어리는 예외로 허용합니다.

[출력 양식 — 아래 4개 섹션을 순서대로 완성. 각 섹션의 "이 장의 임무/다뤄도 됨/다루면 안 됨"을 반드시 지키세요]

## 올해의 큰 흐름
이 장의 임무: 올해를 한 챕터로 규정합니다 — "무슨 해인가(사건·주제)"와 "그 해를 사는 태도·정서(무드)"를 함께 5~6문장으로 담으세요. **솔라리턴(그 해 ASC 분위기 + 태양이 놓인 나탈 하우스 영역)을 주인공으로** 삼으세요. 연행 하우스 ${profection.house}번(테마: ${profection.theme})과 연행 로드 ${profection.lord}의 역할도 자연스럽게 엮으세요.
다뤄도 됨: 올해의 전체 테마, 전반적 분위기·태도, 큰 시기 덩어리(상/하반기 수준).
다루면 안 됨: 개별 사건의 디테일, 정확한 월/날짜(뒤의 "이벤트 개별 해석"이 전담합니다).
약한 해 처리: 솔라리턴·트랜짓이 약하면 부풀리지 말고 "안정·다지기·내실의 해"로 정직하게 해석하세요. 다른 데이터를 억지로 끌어와 채우지 마세요.

## 영역별 흐름

### 직업·사회
### 재물·자원
### 관계·감정
이 장의 임무: 위 세 영역 각각의 한 해 전체 색깔(총평)을 3~4문장씩 쓰세요. 모든 사용자에게 항상 나오는 필수 섹션입니다. 주요 이벤트가 적은 해일수록 이 섹션을 더 충실하고 길게 작성하세요.
시기 처리: 정확한 월/날짜 언급을 절대 금지합니다(그건 "이벤트 개별 해석"의 역할입니다). 아주 큰 덩어리(상/하반기) 수준의 표현만 예외로 허용합니다. 예: "재물은 상반기에 기회가 모이고 하반기엔 정비." 같은 표현은 되지만 "8월", "12월"처럼 특정 월을 쓰면 안 됩니다.
다루면 안 됨: 개별 사건 나열, 특정 월 언급.

## 주목할 포인트
이 장의 임무: 행동 전략 2~3개를 제시하세요. "그래서 무엇을 잡고 무엇을 조심하라" — 기회 활용법·리스크 관리. 주요 이벤트가 적은 해일수록 이 섹션을 더 충실하게 작성하세요.
다뤄도 됨: 구체적 행동 지침, 대응법.
다루면 안 됨: 앞에서 다룬 사건·시기의 재나열(전략만 남기고 사건 설명·특정 월은 빼세요).

## 마무리
이 장의 임무: 시적인 1~2문장 + 행동 지침(✓ 형식)으로 마침표를 찍는 역할만 합니다. 주요 이벤트가 적은 해일수록 행동 지침을 더 충실하게 작성하세요.
다루면 안 됨: 앞 내용 요약(절대 금지), 특정 월 언급(✓ 항목은 "연중 상시"처럼 시기에 매이지 않는 표현으로만 쓰세요).
반드시 아래 형식으로만 작성 (다른 형식 불가):

"이 해의 핵심을 담은 강렬하고 시적인 1~2문장. 삶의 주인공으로서의 자세를 담아 명언처럼."

✓ [전략1]: 한 문장 행동 조언
✓ [전략2]: 한 문장 행동 조언
✓ 연중 상시: 한 문장 행동 조언

각 줄은 "무엇을 하라"는 행동에 집중하세요. 특정 월·행성·기호 금지.

## 이벤트 개별 해석
이 장의 임무: 사건 하나하나를 깊게 설명하는 유일한 곳입니다(디테일·정확한 시기 전담). ★ 주요 이벤트 각각에 대해 아래 E번호 순서대로 2~3문장씩 개별 서술하세요. **정확한 월/시기를 책임지는 섹션은 이곳뿐입니다.**
시기(when)를 자연스럽게 녹이고, 삶의 언어로 구체적으로. 행성·기호·각도 숫자 표기 금지.
다루면 안 됨: 다른 사건과의 종합·총평(그건 "영역별 흐름"의 역할입니다).
${majorEventsOrdered.map((e, i) =>
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
                maxOutputTokens:  dynamicMaxTokens,
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
