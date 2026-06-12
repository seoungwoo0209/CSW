export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { name, gender, fourPillars } = req.body;

    if (!gender || !fourPillars) {
      return res.status(400).json({ error: '필수 파라미터(gender, fourPillars)가 누락되었습니다.' });
    }
    const requiredPillars = ['year', 'month', 'day', 'hour'];
    for (const key of requiredPillars) {
      if (!fourPillars[key]?.stem || !fourPillars[key]?.branch) {
        return res.status(400).json({ error: `fourPillars.${key} 데이터가 올바르지 않습니다.` });
      }
    }

    const displayName = name?.trim() || '당신';
    const genderKr    = gender === 'M' ? '남성' : '여성';
    const { year, month, day, hour } = fourPillars;
    const dayStem   = day.stem;
    const dayBranch = day.branch;

    // ═══════════════════════════════════════
    // 사주 분석 데이터 계산
    // ═══════════════════════════════════════

    const WUXING_STEM = {
      '甲':'목','乙':'목','丙':'화','丁':'화','戊':'토',
      '己':'토','庚':'금','辛':'금','壬':'수','癸':'수'
    };
    const WUXING_BRANCH = {
      '子':'수','丑':'토','寅':'목','卯':'목','辰':'토',
      '巳':'화','午':'화','未':'토','申':'금','酉':'금','戌':'토','亥':'수'
    };
    const YINYANG_STEM = {
      '甲':'양','乙':'음','丙':'양','丁':'음','戊':'양',
      '己':'음','庚':'양','辛':'음','壬':'양','癸':'음'
    };
    const WUXING_GENERATES = { 목:'화', 화:'토', 토:'금', 금:'수', 수:'목' };
    const WUXING_CONTROLS  = { 목:'토', 화:'금', 토:'수', 금:'목', 수:'화' };

    const WUXING_NAME = { 목:'나무(木)', 화:'불(火)', 토:'흙(土)', 금:'쇠(金)', 수:'물(水)' };
    const STEM_NAME   = {
      '甲':'갑목(큰 나무)','乙':'을목(풀·덩굴)','丙':'병화(태양)','丁':'정화(촛불·등불)',
      '戊':'무토(큰 산)','己':'기토(논밭의 흙)','庚':'경금(원석·도끼)','辛':'신금(보석·칼날)',
      '壬':'임수(큰 강·바다)','癸':'계수(빗물·샘물)'
    };
    const BRANCH_ANIMAL = {
      '子':'쥐','丑':'소','寅':'호랑이','卯':'토끼','辰':'용','巳':'뱀',
      '午':'말','未':'양','申':'원숭이','酉':'닭','戌':'개','亥':'돼지'
    };

    function getShishen(ds, ts) {
      const de = WUXING_STEM[ds], te = WUXING_STEM[ts];
      if (!de || !te) return null;
      const same = (YINYANG_STEM[ds] === YINYANG_STEM[ts]);
      if (de === te)                            return same ? '비견' : '겁재';
      if (WUXING_GENERATES[de] === te)         return same ? '식신' : '상관';
      if (WUXING_CONTROLS[de]  === te)         return same ? '편재' : '정재';
      if (WUXING_CONTROLS[te]  === de)         return same ? '편관' : '정관';
      if (WUXING_GENERATES[te] === de)         return same ? '편인' : '정인';
      return null;
    }

    // 오행 카운트 (표면 8글자)
    const elCount = { 목:0, 화:0, 토:0, 금:0, 수:0 };
    for (const p of [year, month, day, hour]) {
      if (WUXING_STEM[p.stem])     elCount[WUXING_STEM[p.stem]]++;
      if (WUXING_BRANCH[p.branch]) elCount[WUXING_BRANCH[p.branch]]++;
    }
    const elTotal  = Object.values(elCount).reduce((a,b) => a+b, 0) || 1;
    const elSorted = Object.entries(elCount).sort((a,b) => b[1]-a[1]);
    const topEl    = elSorted[0];
    const excessEl = elSorted.filter(([,v]) => v/elTotal > 0.35).map(([k]) => k);
    const lackEl   = elSorted.filter(([,v]) => v/elTotal < 0.06).map(([k]) => k);

    // 지장간 정기
    const HIDDEN_MAIN = {
      '子':'癸','丑':'己','寅':'甲','卯':'乙','辰':'戊',
      '巳':'丙','午':'丁','未':'己','申':'庚','酉':'辛','戌':'戊','亥':'壬'
    };

    // 십신 카운트 (천간 3개 + 지지 정기 4개)
    const ssCount = {
      비견:0, 겁재:0, 식신:0, 상관:0,
      편재:0, 정재:0, 편관:0, 정관:0, 편인:0, 정인:0
    };
    for (const p of [year, month, hour]) {
      const ss = getShishen(dayStem, p.stem);
      if (ss) ssCount[ss]++;
    }
    for (const p of [year, month, day, hour]) {
      const hs = HIDDEN_MAIN[p.branch];
      if (hs) { const ss = getShishen(dayStem, hs); if (ss) ssCount[ss]++; }
    }

    const bigeop    = ssCount['비견'] + ssCount['겁재'];
    const siksang   = ssCount['식신'] + ssCount['상관'];
    const jaeseong  = ssCount['편재'] + ssCount['정재'];
    const gwanseong = ssCount['편관'] + ssCount['정관'];
    const inseong   = ssCount['편인'] + ssCount['정인'];

    // 신강/신약
    const selfPow  = bigeop + inseong;
    const otherPow = gwanseong + jaeseong + siksang;
    const strengthLabel = selfPow > otherPow + 1 ? '신강'
                        : otherPow > selfPow + 1 ? '신약' : '중화';

    // 格
    const monthMainStem = HIDDEN_MAIN[month.branch];
    const monthMainSS   = monthMainStem ? getShishen(dayStem, monthMainStem) : null;
    const geokName      = monthMainSS ? monthMainSS + '격' : '혼합격';

    // 일주 설명
    const ilju      = dayStem + dayBranch;
    const dayElName = WUXING_NAME[WUXING_STEM[dayStem]] || '';
    const stemDesc  = STEM_NAME[dayStem] || dayStem;

    // 일지 십신 (배우자궁)
    const dayBranchSS = HIDDEN_MAIN[dayBranch]
      ? getShishen(dayStem, HIDDEN_MAIN[dayBranch]) : null;

    // 가장 강한 십신 2개
    const ssRanked = Object.entries(ssCount)
      .sort((a,b) => b[1]-a[1])
      .filter(([,v]) => v > 0)
      .slice(0,2)
      .map(([k,v]) => `${k}(${v}개)`);

    // 오행 과·결핍 문장
    const excessDesc = excessEl.length
      ? excessEl.map(e => WUXING_NAME[e]).join('·') + ' 과다'
      : '오행 편중 없음';
    const lackDesc = lackEl.length
      ? lackEl.map(e => WUXING_NAME[e]).join('·') + ' 결핍'
      : '결핍 없음';

    // ═══════════════════════════════════════
    // 프롬프트
    // ═══════════════════════════════════════
    const prompt = `
너는 20년 경력의 명리학 사주 해석 전문가야.
아래 사주 데이터를 바탕으로 ${displayName}님만을 위한 심층 사주 리포트를 작성해.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[사주 원국]
이름: ${displayName} / 성별: ${genderKr}
사주팔자: 연주 ${year.stem}${year.branch} · 월주 ${month.stem}${month.branch} · 일주 ${ilju} · 시주 ${hour.stem}${hour.branch}
일간: ${stemDesc}
일주: ${ilju} (${BRANCH_ANIMAL[dayBranch]}띠 지지)

[분석 수치]
오행 분포: 목${elCount['목']} 화${elCount['화']} 토${elCount['토']} 금${elCount['금']} 수${elCount['수']} → ${excessDesc} / ${lackDesc}
십신 분포: 비겁${bigeop} 식상${siksang} 재성${jaeseong} 관성${gwanseong} 인성${inseong}
지배 십신: ${ssRanked.join(', ') || '없음'}
신강/신약: ${strengthLabel} (자아계열 ${selfPow} vs 극설계열 ${otherPow})
格(격): ${geokName}
일지 십신(배우자궁): ${dayBranchSS || '미상'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]

1. **메타포로 시작해라**
   일간의 오행을 자연물에 빗대어 도입부를 열어라.
   예) 기토(己土) → "논밭의 흙", 임수(壬水) → "거대한 강물",
       갑목(甲木) → "하늘을 향해 자라는 거목"
   그 오행에 다른 십신들이 쏟아질 때 어떤 일이 벌어지는지 자연현상으로 풀어라.

2. **질문 → 반전 구조를 써라**
   "이런 구조를 가진 사람은 두 가지 유형 중 하나입니다.
    대부분은 A입니다.
    ${displayName}님은 B입니다."
   이 패턴을 최소 2번 이상 사용해라.

3. **수치를 감정 언어로 번역해라**
   "비겁이 ${bigeop}개" → "어떤 압박에도 휘어지지 않는 독립심"
   "재성이 ${jaeseong}개" → 재물과의 관계를 구체적으로 묘사
   숫자를 그냥 나열하지 말고 반드시 삶의 언어로 변환해라.

4. **이중 구조를 폭로해라**
   겉으로 보이는 모습과 실제 내면이 어떻게 다른지 구체적으로 대비시켜라.
   "사람들은 당신을 ~라고 보지만, 실제로는 ~"

5. **독자를 특별하게 만들어라**
   이 조합이 얼마나 드문지, 이 구조를 가진 사람이 어떤 잠재력을 품는지
   희소성과 특이성을 강조해라.

[섹션 구성 — 5개 전부 완성할 것]

**[1] ${stemDesc}이 빚어낸 ${displayName}님의 본질**
- ${ilju} 일주의 오행 메타포로 시작
- ${strengthLabel} 구조가 성격에 어떻게 작동하는지
- 겉으로 보이는 모습 vs 내면의 실제 기질 대비
- 분량: 4~5문단, 각 문단 3~4문장

**[2] 타고난 재능의 지형도**
- 오행 ${excessDesc}이 만드는 강점 영역
- ${geokName}이 부여하는 특수 재능
- 이 재능이 어떤 상황에서 폭발적으로 발휘되는지
- 분량: 3~4문단

**[3] 재물과 ${displayName}님의 관계**
- 재성 ${jaeseong}개 구조로 시작 → 돈이 어떤 방식으로 들어오고 나가는지
- 질문→반전 구조로 재물 유형 정의
- 돈을 잃는 패턴과 지켜야 할 원칙
- 분량: 3~4문단

**[4] 일과 사회에서 ${displayName}님이 빛나는 방식**
- 관성 ${gwanseong}개 + ${geokName} 조합으로 직업 방향
- 조직 vs 독립 중 어느 쪽이 맞는지 단호하게 판단
- 성공하는 구체적 방식과 반드시 피해야 할 함정
- 분량: 3~4문단

**[5] 관계와 사랑 — ${displayName}님이 사람을 대하는 방식**
- 일지 십신 ${dayBranchSS || '구조'}이 배우자궁에 앉은 의미
- 비겁 ${bigeop}개 구조가 관계에서 만드는 패턴
- 반복되는 관계 패턴과 진짜 인연을 만나는 조건
- 분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[금지 사항]
- "~할 수 있습니다", "~일 수도 있어요" 같은 모호한 표현 금지
- 단순 수치 나열 금지 (반드시 삶의 언어로 번역)
- 섹션 중간에 끊기 금지
- 일반적인 운세 상투어 금지 ("좋은 기운이 들어옵니다" 등)
- 마크다운 헤더(#) 사용 금지 — **볼드**만 사용

지금 바로 [1]부터 [5]까지 전부 작성해.
`.trim();

    // ═══════════════════════════════════════
    // Gemini API 호출 (최대 3회 재시도)
    // ═══════════════════════════════════════
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
                temperature: 0.9,
                maxOutputTokens: 8192,
              }
            })
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
      const message = errData?.error?.message || `Gemini API 오류 (status: ${response.status})`;
      console.error('Gemini API error:', message);
      return res.status(502).json({ error: '현재 접속자가 많아 응답이 지연되고 있습니다. 잠시만 기다리시거나, 버튼을 몇 번 더 시도해 주시면 정상적으로 이용하실 수 있습니다.' });
    }

    const data  = await response.json();
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
