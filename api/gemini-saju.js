export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const {
      name, gender, fourPillars,
      geok, strength, gods, interactions,
      resourceResult, personalityCard, shinsal,
      daeunTimeline, currentDecadeIdx
    } = req.body;

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
    // 표시용 상수 (메타포 도입부 등에 필요한 최소한만 유지)
    // ═══════════════════════════════════════
    const WUXING_STEM = {
      '甲':'목','乙':'목','丙':'화','丁':'화','戊':'토',
      '己':'토','庚':'금','辛':'금','壬':'수','癸':'수'
    };
    const WUXING_BRANCH = {
      '子':'수','丑':'토','寅':'목','卯':'목','辰':'토',
      '巳':'화','午':'화','未':'토','申':'금','酉':'금','戌':'토','亥':'수'
    };
    const WUXING_NAME = { 목:'나무(木)', 화:'불(火)', 토:'흙(土)', 금:'쇠(金)', 수:'물(水)',
      wood:'나무(木)', fire:'불(火)', earth:'흙(土)', metal:'쇠(金)', water:'물(水)' };
    const STEM_NAME = {
      '甲':'갑목(큰 나무)','乙':'을목(풀·덩굴)','丙':'병화(태양)','丁':'정화(촛불·등불)',
      '戊':'무토(큰 산)','己':'기토(논밭의 흙)','庚':'경금(원석·도끼)','辛':'신금(보석·칼날)',
      '壬':'임수(큰 강·바다)','癸':'계수(빗물·샘물)'
    };
    const BRANCH_ANIMAL = {
      '子':'쥐','丑':'소','寅':'호랑이','卯':'토끼','辰':'용','巳':'뱀',
      '午':'말','未':'양','申':'원숭이','酉':'닭','戌':'개','亥':'돼지'
    };
    const TEN_GODS_KR = {
      '比肩':'비견','劫財':'겁재','食神':'식신','傷官':'상관',
      '偏財':'편재','正財':'정재','偏官':'편관','正官':'정관','偏印':'편인','正印':'정인'
    };
    const tgDisp = tg => tg ? `${tg}(${TEN_GODS_KR[tg] || ''})` : '';

    // 오행 카운트 (표면 8글자) — 메타포 도입부·강약 보조 설명용
    const elCount = { 목:0, 화:0, 토:0, 금:0, 수:0 };
    for (const p of [year, month, day, hour]) {
      if (WUXING_STEM[p.stem])     elCount[WUXING_STEM[p.stem]]++;
      if (WUXING_BRANCH[p.branch]) elCount[WUXING_BRANCH[p.branch]]++;
    }
    const elTotal  = Object.values(elCount).reduce((a,b) => a+b, 0) || 1;
    const elSorted = Object.entries(elCount).sort((a,b) => b[1]-a[1]);
    const excessEl = elSorted.filter(([,v]) => v/elTotal > 0.35).map(([k]) => k);
    const lackEl   = elSorted.filter(([,v]) => v/elTotal < 0.06).map(([k]) => k);
    const excessDesc = excessEl.length ? excessEl.map(e => WUXING_NAME[e]).join('·') + ' 과다' : '오행 편중 없음';
    const lackDesc   = lackEl.length   ? lackEl.map(e => WUXING_NAME[e]).join('·') + ' 결핍'   : '결핍 없음';

    const ilju     = dayStem + dayBranch;
    const stemDesc = STEM_NAME[dayStem] || dayStem;

    // ═══════════════════════════════════════
    // 실제 엔진 결과 포맷팅 (격국·강약·용희기한·합충형파해·자원점수·12신살·대운)
    // ═══════════════════════════════════════

    // 격국
    const geokName  = geok?.main || '혼합격';
    const geokNote  = geok?.broken ? '단, 월지가 충을 맞아 파격된 상태'
                     : geok?.recovery ? '월지가 충을 맞았으나 합으로 다시 회복된 구조'
                     : '';
    const geokPurityPct = geok?.purity != null ? Math.round(geok.purity * 100) : null;

    // 신강/신약
    const strengthLabel = strength?.label || '중화';
    const strengthScore = strength?.score != null ? Math.round(strength.score) : 50;

    // 용신·희신·기신·한신
    function formatGodGroup(g) {
      if (!g || !g.tenGods?.length) return '미상';
      const els = (g.elements || []).map(e => WUXING_NAME[e] || e).join('·');
      return `${g.tenGods.map(tgDisp).join(', ')}${els ? ` (오행: ${els})` : ''}`;
    }
    const yongStr = formatGodGroup(gods?.yong);
    const heeStr  = formatGodGroup(gods?.hee);
    const giStr   = formatGodGroup(gods?.gi);
    const hanStr  = formatGodGroup(gods?.han);

    // 합충형파해
    function formatInteractions(inter) {
      if (!inter) return '뚜렷한 합충형파해 없음';
      const parts = [];
      (inter.합 || []).forEach(h => {
        if (h.stems)    parts.push(`천간합 ${h.stems.join('-')}`);
        else if (h.branches) parts.push(`${h.type} ${h.branches.join('-')}${h.element ? `(${WUXING_NAME[h.element] || h.element}국)` : ''}`);
      });
      (inter.충 || []).forEach(c => parts.push(`충 ${c.branches.join('-')}${c.critical ? ' [월/일지 핵심]' : ''}`));
      (inter.형 || []).forEach(h => parts.push(`형 ${h.branches.join('-')}${h.critical ? ' [월/일지 핵심]' : ''}`));
      (inter.파 || []).forEach(p => parts.push(`파 ${p.branches.join('-')}${p.critical ? ' [월/일지 핵심]' : ''}`));
      (inter.해 || []).forEach(h => parts.push(`해 ${h.branches.join('-')}${h.critical ? ' [월/일지 핵심]' : ''}`));
      return parts.length ? parts.join(', ') : '뚜렷한 합충형파해 없음';
    }
    const interStr = formatInteractions(interactions);

    // 5축 자원 점수 + 유형 카드
    let resourceStr = '';
    if (resourceResult?.axes?.length) {
      resourceStr = resourceResult.axes.map(a => `${a.key} ${a.score}`).join(', ')
        + ` → 강점 ${resourceResult.strongest?.key}(${resourceResult.strongest?.score}), 보완 필요 ${resourceResult.weakest?.key}(${resourceResult.weakest?.score})`;
    }
    const typeName = personalityCard?.typeName || '';
    const typeDesc = personalityCard?.typeDesc || '';

    // 12신살 (일지 기준만 — 정보 과잉 방지)
    let shinsalStr = '미상';
    if (shinsal) {
      const order = ['year','month','day','hour'];
      shinsalStr = order
        .map(k => shinsal[k]?.byDay ? `${shinsal[k].label}(${shinsal[k].branch}) ${shinsal[k].byDay}` : null)
        .filter(Boolean).join(', ') || '뚜렷한 신살 없음';
    }

    // 대운 (이전 · 현재 · 다음 3개 구간만)
    let daeunStr = '대운 정보 없음';
    if (daeunTimeline?.decades?.length) {
      const idx  = (typeof currentDecadeIdx === 'number') ? currentDecadeIdx : -1;
      const cur  = idx >= 0 ? daeunTimeline.decades[idx] : null;
      const prev = idx > 0 ? daeunTimeline.decades[idx - 1] : null;
      const next = idx >= 0 && idx + 1 < daeunTimeline.decades.length ? daeunTimeline.decades[idx + 1] : null;
      const lines = [];
      lines.push(`대운 진행 방향: ${daeunTimeline.direction} / 첫 대운 시작: 만 ${daeunTimeline.daeunStart.age}세`);
      if (cur) {
        lines.push(`현재 대운: ${cur.startAge}~${cur.endAge}세, 간지 ${cur.ganji} (${cur.stem}${cur.branch})`);
      } else {
        lines.push(`현재는 첫 대운(만 ${daeunTimeline.daeunStart.age}세) 시작 전 — 부모·가정 환경의 영향이 큰 유년기`);
      }
      if (prev) lines.push(`이전 대운: ${prev.startAge}~${prev.endAge}세, 간지 ${prev.ganji}`);
      if (next) lines.push(`다음 대운: ${next.startAge}세부터, 간지 ${next.ganji}로 전환`);
      daeunStr = lines.join('\n');
    }

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

[격국·강약]
格(격): ${geokName}${geokPurityPct != null ? ` (순도 ${geokPurityPct}%)` : ''}${geokNote ? ` — ${geokNote}` : ''}
신강/신약: ${strengthLabel} (${strengthScore}점/100)
오행 분포: 목${elCount['목']} 화${elCount['화']} 토${elCount['토']} 금${elCount['금']} 수${elCount['수']} → ${excessDesc} / ${lackDesc}

[용신·희신·기신·한신]
용신(가장 필요한 기운): ${yongStr}
희신(용신을 돕는 기운): ${heeStr}
기신(피해야 할 기운): ${giStr}
한신(중립적인 기운): ${hanStr}

[합충형파해]
${interStr}

[5축 자원 점수]
${resourceStr || '미상'}
${typeName ? `타고난 유형: ${typeName}${typeDesc ? ` — ${typeDesc}` : ''}` : ''}

[12신살(일지 기준)]
${shinsalStr}

[대운 흐름]
${daeunStr}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]

1. **메타포로 시작해라**
   일간의 오행을 자연물에 빗대어 도입부를 열어라.
   예) 기토(己土) → "논밭의 흙", 임수(壬水) → "거대한 강물",
       갑목(甲木) → "하늘을 향해 자라는 거목"
   그 오행에 다른 기운들이 쏟아질 때 어떤 일이 벌어지는지 자연현상으로 풀어라.

2. **질문 → 반전 구조를 써라**
   "이런 구조를 가진 사람은 두 가지 유형 중 하나입니다.
    대부분은 A입니다.
    ${displayName}님은 B입니다."
   이 패턴을 최소 2번 이상 사용해라.

3. **수치를 감정 언어로 번역해라**
   격국·용신·합충형파해·자원 점수를 그냥 나열하지 말고, 반드시 삶의 언어로 변환해라.
   예) "용신이 정인" → "스스로를 다그치기보다 누군가의 신뢰와 인정 속에서 진짜 힘이 나오는 구조"
   예) "재성이 약함" → 재물과의 관계를 구체적으로 묘사

4. **이중 구조를 폭로해라**
   겉으로 보이는 모습과 실제 내면이 어떻게 다른지 구체적으로 대비시켜라.
   "사람들은 당신을 ~라고 보지만, 실제로는 ~"

5. **독자를 특별하게 만들어라**
   이 조합이 얼마나 드문지, 이 구조를 가진 사람이 어떤 잠재력을 품는지
   희소성과 특이성을 강조해라.

6. **대운 섹션은 그래프나 수치 나열이 아니라 서술로 풀어라**
   "지금 OO세~OO세 구간을 지나고 있다"는 사실을 먼저 알려준 뒤,
   그 대운 간지가 원국과 만나 어떤 흐름을 만드는지, 다음 대운으로 넘어가면
   무엇이 달라지는지를 이야기처럼 설명해라. 단정적인 길흉 예언("이 시기에 망한다" 등)은 금지하고,
   "어떤 결을 타게 되는지"를 설명하는 톤을 유지해라.

[섹션 구성 — 반드시 아래 5개 마커를 정확히 그대로(앞뒤 공백·줄바꿈 외 다른 글자 추가 없이) 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라: ===SECTION:essence===
마커 자체는 사용자에게 보이지 않는 구분선이므로, 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:essence===
(${stemDesc}이 빚어낸 ${displayName}님의 본질)
- ${ilju} 일주의 오행 메타포로 시작
- ${geokName} · ${strengthLabel} 구조, 12신살이 성격에 어떻게 작동하는지
- 겉으로 보이는 모습 vs 내면의 실제 기질 대비
- 분량: 4~5문단, 각 문단 3~4문장

===SECTION:talent===
(타고난 재능의 지형도 — 5축 자원 점수가 보여주는 강점)
- 오행 ${excessDesc}과 용신·희신이 만드는 강점 영역
- ${geokName}이 부여하는 특수 재능
- 이 재능이 어떤 상황에서 폭발적으로 발휘되는지
- 분량: 3~4문단

===SECTION:resource===
(5축 자원 균형이 삶의 영역별로 어떻게 나타나는지 — 재물·일과 사회·관계 3가지를 각각 한 문단 이상으로)
- 재성 관련 점수로 시작 → 돈이 어떤 방식으로 들어오고 나가는지, 기신이 가리키는 돈을 잃는 패턴
- 관성 관련 점수 + ${geokName} 조합 → 조직 vs 독립 중 어느 쪽이 맞는지, 성공 방식과 피해야 할 함정
- 비겁 관련 점수 + 합충형파해 정보 → 관계에서 반복되는 패턴과 진짜 인연을 만나는 조건
- 분량: 5~6문단 (재물 2문단, 일과 사회 2문단, 관계 2문단 정도로 배분)

===SECTION:yongsin===
(용신·희신·기신·한신이 ${displayName}님에게 의미하는 것)
- 질문→반전 구조로 시작
- 용신·희신이 어떤 상황에서 진짜 힘을 주는지, 기신이 가리키는 위험 신호
- 분량: 3~4문단

===SECTION:daeun===
(인생의 흐름 — 지금 ${displayName}님은 어느 시기를 지나고 있나)
- [대운 흐름] 데이터를 바탕으로 현재 대운이 원국과 어떻게 맞물리는지 설명
- 다음 대운으로 넘어가면 무엇이 달라지는지
- 이 시기를 어떻게 활용하면 좋을지 실질적인 조언
- 분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[금지 사항]
- "~할 수 있습니다", "~일 수도 있어요" 같은 모호한 표현 금지
- 단순 수치·한자 용어 나열 금지 (반드시 삶의 언어로 번역)
- 섹션 중간에 끊기 금지
- 일반적인 운세 상투어 금지 ("좋은 기운이 들어옵니다" 등)
- 마크다운 헤더(#) 사용 금지 — **볼드**만 사용
- ===SECTION:xxx=== 마커 형식을 임의로 바꾸거나 누락하지 말 것
- 대운 섹션에서 단정적인 길흉 예언("이 시기에 사고난다", "이 시기에 부자된다") 금지

지금 바로 essence부터 daeun까지 5개 섹션을 마커와 함께 전부 작성해.
`.trim();

    // ═══════════════════════════════════════
    // Gemini API 호출 (최대 4회 재시도, 점진적 대기)
    // ═══════════════════════════════════════
    let response, lastError;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
        if (attempt < 4) await new Promise(r => setTimeout(r, attempt * 2000));
      } catch (e) {
        lastError = e;
        if (attempt < 4) await new Promise(r => setTimeout(r, attempt * 2000));
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
