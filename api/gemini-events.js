/* =========================================================
   api/gemini-events.js  v1.0
   연간 이벤트 JSON (A단계 엔진 출력) → Gemini 연간 리포트 (B단계)
   ─────────────────────────────────────────────────────────
   규칙: AI는 engineData의 fact 값을 바탕으로만 글을 쓴다.
         사실 판단·추측·퍼센트 수치 금지.
   ========================================================= */

import { applyCors } from './_cors.js';

/* ─── 하우스 테마 → 구체적 현실 시나리오 어휘 팔레트 ───
   annual-events.js의 HOUSE_THEME(추상 라벨, 예: "철학·여행")을 AI가 그대로
   베끼면 "해외, 교육, 철학 영역의 기회" 식으로 막연해진다. "이벤트 개별
   해석"에서 이 팔레트를 참고해 더 구체적·현실적인 단어로 바꿔 쓰게 한다. */
const HOUSE_VOCAB = {
  1:  '외모·이미지 변화, 새로운 자기소개, 자기관리·운동 루틴의 시작',
  2:  '연봉·소득 변화, 큰 지출이나 구매, 투자 결정, 소비 습관 재정비',
  3:  '단거리 이동, 어학·SNS·콘텐츠 활동, 형제자매나 동료와의 소통, 작은 계약·서류',
  4:  '이사, 부동산 계약·매매, 인테리어, 부모님과의 관계·건강, 독립·분가',
  5:  '연애의 시작, 취미·창작 활동, 자녀 관련 이슈, 발표·전시·무대',
  6:  '이직, 부서 이동, 프로젝트 재조정, 업무량·동료 관계 변화, 건강관리 루틴',
  7:  '결혼·동거·계약 관계, 비즈니스 파트너십, 갈등 조정, 법적 계약(소송 포함)',
  8:  '큰돈의 유입·유출(대출·상속·투자), 깊은 정서적 변화, 관계의 종결과 재구성',
  9:  '유학·이민·어학연수, 해외 출장이나 협업, 자격증·전문교육, 출판·강연, 가치관의 변화',
  10: '승진, 사회적 평판·타이틀 변화, 커리어 방향 전환, 대외 활동의 확장',
  11: '새로운 모임·네트워크, 장기 목표 재설정, 온라인 커뮤니티 활동',
  12: '휴식·재충전, 혼자만의 시간, 심리적 정리, 드러나지 않는 준비 기간',
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { engineData, meta } = req.body;
    if (!engineData) {
      return res.status(400).json({ error: '엔진 데이터가 없습니다.' });
    }

    const { year, profection, events = [], background } = engineData;
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
    const isRetrograde  = e => e.technique?.includes('retrograde');

    const srEvents      = events.filter(e => e.layer === 'common' && isSolarReturn(e));
    const retroEvents   = events.filter(e => e.layer === 'common' && isRetrograde(e));
    const commonEvents  = events.filter(e => e.layer === 'common' && !isSolarReturn(e) && !isRetrograde(e));
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

    const retroText = retroEvents.length > 0
      ? retroEvents.map(e => `${e.retroStart} ~ ${e.retroEnd}  ${e.bodies[0]} 역행`).join('\n')
      : '(역행 구간 데이터 없음)';

    const natalHighlights = background?.natalHighlights || [];
    const progHighlights  = background?.progHighlights  || [];
    const progNow         = background?.progNow || [];
    const backgroundText  = (natalHighlights.length || progHighlights.length || progNow.length)
      ? `[타고난 결 — 네이탈 차트 자체의 패턴]\n${natalHighlights.join('\n') || '(없음)'}\n\n`
        + `[지금 진행 중인 변화 — 프로그레션이 네이탈과 맺는 관계]\n${progHighlights.join('\n') || '(없음)'}\n\n`
        + `[지금 이 순간 — 프로그레션 행성들의 현재 위치(사인·하우스). "(최근 몇 년 내 사인 진입)" 표시가 있으면 그 챕터가 막 시작됐다는 뜻]\n${progNow.join('\n') || '(없음)'}`
      : '(배경 에스펙트 데이터 없음)';

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
━━━ 역행 구간 (그 해 새 일보다 점검·재검토가 잘 맞는 시기) ━━━
${retroText}

━━━ 배경 — 이 사람 자체에 대한 늘 참인 정보 (사건이 아니라 성격·기질) ━━━
${backgroundText}
※ 위 배경 데이터는 "이벤트 개별 해석"이 아니라 "당신이라는 사람" 섹션 전용 재료입니다.
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

[출력 양식 — 아래 5개 섹션을 순서대로 완성. 각 섹션의 "이 장의 임무/다뤄도 됨/다루면 안 됨"을 반드시 지키세요]

## 올해의 큰 흐름
이 장의 첫 줄: 점성술을 전혀 모르는 사람도 바로 이해할 본문 첫 줄에, **쉬운 말로 된 한 줄 결론**을 단독 문장으로 쓰세요. 전문용어·행성·사인 이름 없이, 올해를 한 마디로 규정하는 강렬한 문장이어야 합니다(예: "30년에 한 번, 삶의 무게중심이 옮겨가는 해입니다." 같은 톤. 이 예시 문장 자체를 그대로 쓰지 말고 그 해의 실제 데이터에 맞게 새로 쓰세요).
이 장의 임무: 그 한 줄 결론 다음 문장부터, 올해를 한 챕터로 규정합니다 — "무슨 해인가(사건·주제)"와 "그 해를 사는 태도·정서(무드)"를 함께 4~5문장으로 담으세요. **솔라리턴(그 해 ASC 분위기 + 태양이 놓인 네이탈 하우스 영역)을 주인공으로** 삼으세요. 연행 하우스 ${profection.house}번(테마: ${profection.theme})과 연행 로드 ${profection.lord}의 역할도 자연스럽게 엮으세요. 점성술 용어(프로그레션·솔라리턴·하우스 등)를 써야 한다면 본문 마지막에 "※"로 시작하는 한 줄 각주로만 따로 두세요.
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

## 당신이라는 사람
이 장의 임무: 위 "배경" 데이터(타고난 결 + 지금 진행 중인 변화 + 지금 이 순간)만 근거로, 이 사람의 타고난 기질과 지금 서 있는 인생의 단계를 4~5문장으로 서술하세요. 세 부분을 구분해서 다루세요:
1. "타고난 결"(네이탈 패턴) — 평소 성향, 늘 가지고 있던 양면성·기질.
2. "지금 진행 중인 변화"(프로그레션-네이탈 에스펙트) — 최근 몇 년간 서서히 바뀌고 있는 동기·태도.
3. "지금 이 순간"(프로그레션 행성들의 현재 위치) — 지금 이 사람의 정체성·감정·소통·관계·추진력의 무게가 어디에 쏠려 있는지. "(최근 몇 년 내 사인 진입)" 표시가 있는 항목은 "이제 막 새로운 챕터가 시작됐다"는 뉘앙스로 비중 있게 다루고, 표시가 없는 항목은 "이미 자리 잡은 흐름"으로 가볍게만 언급하세요.
역행 구간 데이터가 있다면, 마지막에 1~2문장으로 "이 구간엔 새로 시작하기보다 점검·재검토가 잘 맞는다"는 식으로 자연스럽게 풀어 쓰세요(역행이라는 단어 자체를 쓰지 말고, 무슨 시기인지 행동 관점에서 설명).
다뤄도 됨: 타고난 기질·성향, 최근 진행 중인 내적 변화, 지금 서 있는 단계, 점검이 잘 맞는 시기에 대한 안내.
다루면 안 됨: "배경" 데이터에 없는 내용 창작, 올해의 사건·시기 재언급(그건 다른 섹션의 역할입니다), 행성·사인·각도 숫자·기호·하우스 번호 표기(예: "양자리", "10하우스" 같은 표기 대신 "정체성의 영역", "사회적 위치" 같은 삶의 언어로 바꿔 쓰세요).
배경 데이터가 빈약하면("없음"이면) 이 섹션은 짧게 한두 문장으로 갈무리하고 억지로 채우지 마세요.

## 주목할 포인트
이 장의 임무: 행동 전략 2~3개를 제시하세요. "그래서 무엇을 잡고 무엇을 조심하라" — 기회 활용법·리스크 관리. 주요 이벤트가 적은 해일수록 이 섹션을 더 충실하게 작성하세요.
각 전략은 "신중하게 결정하세요", "현실적인 판단이 필요합니다"처럼 추상적인 조언으로 끝내지 말고, 바로 따라 할 수 있는 구체적 행동 규칙으로 쓰세요(시기·월은 언급하지 않되 "어떻게"는 구체적으로).
  (X) 중요한 결정은 신중하게 내리세요.
  (O) 중요한 결정은 그 자리에서 답하지 말고, 하루를 묵힌 뒤 다시 판단하세요.
  (X) 소통 방식에 변화가 필요합니다.
  (O) 오해가 쌓일 때는 메시지보다 직접 만나서 짧게라도 말로 확인하세요.
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
마지막 문장은 반드시 그 시기와 엮인 구체적 행동 팁 하나로 마무리하세요. "신중하게 결정하라", "조심하세요"처럼 추상적인 조언이 아니라, 그 자리에서 바로 따라 할 수 있는 구체적 행동 규칙으로 쓰세요.
  (X) 이 시기엔 감정에 치우치지 않도록 주의하세요.
  (O) 이 시기에 중요한 대화나 계약을 해야 한다면, 그 자리에서 결정하지 말고 최소 하루의 유예 기간을 두고 다시 판단해보세요.
다루면 안 됨: 다른 사건과의 종합·총평(그건 "영역별 흐름"의 역할입니다).
어휘: FACT 속 하우스 테마 단어(예: "철학·여행", "가정·뿌리")를 그대로 베끼면 막연해집니다. 아래 [어휘 팔레트]를 참고해 그 테마를 더 구체적이고 현실적인 시나리오 단어로 바꿔 쓰세요. 팔레트의 단어를 그대로 복사하지 말고, 이 사람의 다른 FACT(나이·해당 시기 등)에 맞게 어울리는 것만 골라 자연스럽게 녹이세요.
반복 방지: 여러 이벤트가 같은 영역(카테고리)을 공유하면(특히 "family"), 매번 같은 단어(가족·내면 등)로 옮기지 마세요. 그때그때 다른 측면 — 관계(가까운 사람과의 의견차), 공간·문서(이사·계약·인테리어), 신체·정서회복(혼자만의 시간, 컨디션 관리), 재정(지출·계약) 등 — 으로 갈래를 나눠서, 같은 영역이라도 다른 사건처럼 느껴지게 쓰세요.

[어휘 팔레트 — 이번 이벤트들에 해당하는 하우스만]
${[...new Set(majorEventsOrdered.map(e => e.house).filter(h => h != null))]
  .map(h => `${h}하우스: ${HOUSE_VOCAB[h] || ''}`).join('\n')}

${majorEventsOrdered.map((e, i) =>
  `\n### E${i + 1}\n(${e.when} · [하우스 ${e.house ?? '—'} / 영역 ${e.category || 'general'}] ${e.fact} — 이 이벤트의 삶에서의 의미와 대응 방법 2~3문장)`
).join('')}`;

    /* ── Gemini API 호출 (시간차 이중 요청 — 1번이 실패/5초경과 시 2번 발사, 먼저 성공하는 응답 채택) ──── */
    const controllers = [];
    const fireAttempt = () => {
      const controller = new AbortController();
      controllers.push(controller);
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature:      0.70,
              maxOutputTokens:  dynamicMaxTokens,
              thinkingConfig:   { thinkingBudget: 0 },
            },
          }),
        }
      ).then(async r => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        const json = await r.json();
        const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!reply) throw new Error(`빈 응답 (finishReason: ${json?.candidates?.[0]?.finishReason || '알수없음'})`);
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
    const fireThird = () => { if (!thirdAttempt) thirdAttempt = fireAttempt(); return thirdAttempt; };
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
      console.error('Gemini API error (all parallel attempts failed):', lastError?.errors ? lastError.errors.map(e => e?.message || e).join(' | ') : (lastError?.message || lastError));
      return res.status(502).json({ error: '현재 접속자가 많습니다. 잠시 후 다시 시도해주세요.' });
    }

    return res.status(200).json({ result: reply });

  } catch (error) {
    console.error('gemini-events error:', error);
    return res.status(500).json({ error: '연간 리포트 생성 중 오류가 발생했습니다.' });
  }
}
