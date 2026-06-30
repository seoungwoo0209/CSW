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

    const {
      natal, angles, houses, natalAspectsFull = [], progression, meta, nodes,
      lunationCycle, profectionWealth, lotFortune, lotSpirit, zrFortune, zrSpirit
    } = astroData;
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
      rulership: '본진(가장 강함)', exaltation: '강함',
      detriment: '변칙(약화됨)', fall: '약함(가장 약함)', peregrine: '중립'
    };
    const profectionStr = profectionWealth
      ? `재물(2하우스) 지배성: ${profectionWealth.rulerLabel} (위계: ${DIGNITY_KR[profectionWealth.dignity]})\n` +
        `재물운 활성화 나이: ${profectionWealth.activeAges.slice(0, 8).join(', ')}세 (12년마다 반복)\n` +
        `${profectionWealth.rulerLabel}의 주요각:\n` +
        (profectionWealth.rulerAspects.length
          ? profectionWealth.rulerAspects.map(a => `${a.point1} ${a.symbol} ${a.point2} (${a.aspect})`).join('\n')
          : '(주요각 없음)')
      : '(데이터 없음)';

    // ── ZR(조디악 릴리징) 문자열 — 포르투나/스피릿 공용
    // 하우스 의미·지배성의 본질적 위계(별자리 기반)+우연적 위계(하우스 위치·역행·컴버스천·섹트)까지
    // 텍스트로 풀어서 AI에게 제공한다. app.js의 동일 헬퍼와 같은 계산 로직(독립 정의, 기존 패턴).
    const ZR_SIGNS_KR = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                          '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
    const ZR_MARKER_KR = { preLB: '전환 예고', culm: '절정', lb: '결속풀림(큰 전환점)' };
    const ZR_HOUSE_MEANING = ['자아·몸','재물·자원','소통·형제','가정·뿌리','창조·연애','일상·건강',
                               '관계·결혼','변형·공유재산','확장·철학','성취·사회적지위','공동체·결실','마무리·내면'];
    const ZR_SIGN_RULERS = { 0:'mars',1:'venus',2:'mercury',3:'moon',4:'sun',5:'mercury',
      6:'venus',7:'mars',8:'jupiter',9:'saturn',10:'saturn',11:'jupiter' };
    const ZR_PLANET_KR = { sun:'태양',moon:'달',mercury:'수성',venus:'금성',mars:'화성',jupiter:'목성',saturn:'토성' };
    const ZR_ESSENTIAL_DIGNITIES = {
      sun:{rulership:[4],exaltation:[0],detriment:[10],fall:[6]}, moon:{rulership:[3],exaltation:[1],detriment:[9],fall:[7]},
      mercury:{rulership:[2,5],exaltation:[5],detriment:[8,11],fall:[11]}, venus:{rulership:[1,6],exaltation:[11],detriment:[0,7],fall:[5]},
      mars:{rulership:[0,7],exaltation:[9],detriment:[1,6],fall:[3]}, jupiter:{rulership:[8,11],exaltation:[3],detriment:[2,5],fall:[9]},
      saturn:{rulership:[9,10],exaltation:[6],detriment:[3,4],fall:[0]},
    };
    function zrEssentialDignity(planetKey, signIndex) {
      const d = ZR_ESSENTIAL_DIGNITIES[planetKey]; if (!d) return 'peregrine';
      if (d.rulership.includes(signIndex)) return 'rulership';
      if (d.exaltation.includes(signIndex)) return 'exaltation';
      if (d.detriment.includes(signIndex)) return 'detriment';
      if (d.fall.includes(signIndex)) return 'fall';
      return 'peregrine';
    }
    const ZR_DIGNITY_KR = { rulership:'본진(가장 강함)', exaltation:'강함',
      detriment:'변칙(약화됨)', fall:'약함(가장 약함)', peregrine:'중립' };
    const ZR_SECT_DAY = ['sun','jupiter','saturn'], ZR_SECT_NIGHT = ['moon','venus','mars'];
    const ZR_HOUSE_TIER_KR = { angular:'앵글(강함)', succedent:'보통', cadent:'약함' };
    const ZR_COMBUSTION_KR = { none:'', cazimi:'카지미(매우 강함)', combust:'컴버스천(약화)', underbeams:'빔 아래(약간 약화)' };
    const ZR_SECT_KR = { infavor:'섹트상 유리', contrary:'섹트상 불리', neutral:'섹트 중립' };
    const ascSignIndexForZR = angles?.asc?.signIndex ?? 0;
    const isDayChartForZR = (natal?.sun?.house ?? 0) >= 7 && (natal?.sun?.house ?? 0) <= 12;
    const sunLongitudeForZR = natal?.sun?.longitude ?? 0;
    function zrAccidentalDignity(planetKey, planetNatal) {
      const house = ((planetNatal.signIndex - ascSignIndexForZR + 12) % 12) + 1;
      const houseTier = [1,4,7,10].includes(house) ? 'angular' : ([2,5,8,11].includes(house) ? 'succedent' : 'cadent');
      let diff = Math.abs(planetNatal.longitude - sunLongitudeForZR); if (diff > 180) diff = 360 - diff;
      let combustion = 'none';
      if (planetKey !== 'sun') {
        if (diff <= 0.3) combustion = 'cazimi'; else if (diff <= 8) combustion = 'combust'; else if (diff <= 17) combustion = 'underbeams';
      }
      let sect = 'neutral';
      if (ZR_SECT_DAY.includes(planetKey)) sect = isDayChartForZR ? 'infavor' : 'contrary';
      else if (ZR_SECT_NIGHT.includes(planetKey)) sect = isDayChartForZR ? 'contrary' : 'infavor';
      return { house, houseTier, combustion, sect, retrograde: !!planetNatal.retrograde };
    }
    function zrAccidentalStr(acc) {
      const parts = [`${acc.house}H(${ZR_HOUSE_TIER_KR[acc.houseTier]})`, ZR_SECT_KR[acc.sect]];
      if (acc.retrograde) parts.push('역행');
      if (acc.combustion !== 'none') parts.push(ZR_COMBUSTION_KR[acc.combustion]);
      return parts.join(' · ');
    }
    function zrPeriodInfo(signIndex) {
      const house = ((signIndex - ascSignIndexForZR + 12) % 12) + 1;
      const rulerKey = ZR_SIGN_RULERS[signIndex];
      const rulerNatal = natal?.[rulerKey] || { signIndex: 0, longitude: 0, retrograde: false };
      const dignity = zrEssentialDignity(rulerKey, rulerNatal.signIndex);
      const accidental = zrAccidentalDignity(rulerKey, rulerNatal);
      const rulerLabel = ZR_PLANET_KR[rulerKey];
      const rulerAspects = (natalAspectsFull || []).filter(a => a.point1 === rulerLabel || a.point2 === rulerLabel);
      return { house, houseMeaning: ZR_HOUSE_MEANING[house - 1], rulerKey, rulerLabel, dignity, accidental, rulerAspects };
    }
    function zrAspectStr(info) {
      if (!info.rulerAspects.length) return '주요각 없음';
      return info.rulerAspects.slice(0, 4)
        .map(a => `${a.point1 === info.rulerLabel ? a.point2 : a.point1}${a.symbol}${a.aspect}(${a.orb}°)`).join(' · ');
    }
    function buildZRStr(zr, lotInfo, label) {
      if (!zr || !zr.l1Periods?.length) return '(데이터 없음)';
      const nowAge = lunationCycle?.currentAgeYears ?? 0;
      const l1 = zr.l1Periods[zr.currentL1Index];
      const l2 = l1?.l2?.[zr.currentL2Index];
      const l1Info = zrPeriodInfo(l1.signIndex);
      const l2Info = l2 ? zrPeriodInfo(l2.signIndex) : null;
      const allMarkers = zr.l1Periods.flatMap(p => (p.l2 || []).filter(s => s.marker));
      const pastMarkers = allMarkers.filter(s => s.toAge <= nowAge).slice(-2);
      const futureMarkers = allMarkers.filter(s => s.toAge > nowAge).slice(0, 4);
      const markerLines = [...pastMarkers, ...futureMarkers].map(s => {
        const info = zrPeriodInfo(s.signIndex);
        const tag = s.toAge <= nowAge ? '이미 지남' : '다가올 시기';
        return `  - ${ZR_MARKER_KR[s.marker]}(${tag}): ${ZR_SIGNS_KR[s.signIndex]} 시기(만 ${s.fromAge.toFixed(1)}세부터), ` +
          `${info.house}H(${info.houseMeaning}), 지배성 ${info.rulerLabel}(${ZR_DIGNITY_KR[info.dignity]}), 우연적위계: ${zrAccidentalStr(info.accidental)}`;
      });
      return `${label} 시작 별자리: ${lotInfo.sign}\n` +
        `현재 대시기: ${ZR_SIGNS_KR[l1.signIndex]} (만 ${l1.fromAge.toFixed(1)}~${l1.toAge.toFixed(1)}세), ${l1Info.house}H(${l1Info.houseMeaning}), ` +
        `지배성 ${l1Info.rulerLabel}(본질적위계: ${ZR_DIGNITY_KR[l1Info.dignity]}, 우연적위계: ${zrAccidentalStr(l1Info.accidental)}), 주요각: ${zrAspectStr(l1Info)}\n` +
        `현재 소시기: ${l2 ? ZR_SIGNS_KR[l2.signIndex] : '?'}${l2?.marker ? ` (${ZR_MARKER_KR[l2.marker]})` : ''}` +
        (l2Info ? `, ${l2Info.house}H(${l2Info.houseMeaning}), 지배성 ${l2Info.rulerLabel}(본질적위계: ${ZR_DIGNITY_KR[l2Info.dignity]}, 우연적위계: ${zrAccidentalStr(l2Info.accidental)}), 주요각: ${zrAspectStr(l2Info)}` : '') +
        `\n가까운 주요 전환점(지난 것 일부 + 다가올 것):\n${markerLines.join('\n') || '  없음'}`;
    }
    const zrFortuneStr = buildZRStr(zrFortune, lotFortune, '포르투나(재물·몸)');
    const zrSpiritStr  = buildZRStr(zrSpirit, lotSpirit, '스피릿(행위·직업)');

    // ── 포르투나×스피릿 교차신호: 두 랏이 5년 내에 같은 하우스를 가리키는 구간
    function buildZRCrossStr() {
      if (!zrFortune?.l1Periods?.length || !zrSpirit?.l1Periods?.length) return '(데이터 없음)';
      const nowAge = lunationCycle?.currentAgeYears ?? 0;
      function collectNearTerm(zr, yearsAhead) {
        const out = [];
        zr.l1Periods.forEach(l1 => (l1.l2 || []).forEach(s => {
          if (s.toAge >= nowAge && s.fromAge <= nowAge + yearsAhead) out.push(s);
        }));
        return out;
      }
      const fortuneNear = collectNearTerm(zrFortune, 5);
      const spiritNear = collectNearTerm(zrSpirit, 5);
      const lines = [];
      fortuneNear.forEach(f => {
        const fInfo = zrPeriodInfo(f.signIndex);
        spiritNear.forEach(s => {
          const sInfo = zrPeriodInfo(s.signIndex);
          if (fInfo.house !== sInfo.house) return;
          const gap = Math.max(f.fromAge, s.fromAge) - Math.min(f.toAge, s.toAge);
          if (gap < 2) {
            lines.push(`포르투나 ${ZR_SIGNS_KR[f.signIndex]}(만 ${f.fromAge.toFixed(1)}~${f.toAge.toFixed(1)}세)와 스피릿 ${ZR_SIGNS_KR[s.signIndex]}` +
              `(만 ${s.fromAge.toFixed(1)}~${s.toAge.toFixed(1)}세)가 같은 ${fInfo.house}H(${fInfo.houseMeaning})를 가리킴`);
          }
        });
      });
      return lines.length ? lines.join('\n') : '(5년 내 교차 없음)';
    }
    const zrCrossStr = buildZRCrossStr();

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

[ZR(조디악 릴리징) 포르투나 — 재물·몸 타이밍]
${zrFortuneStr}

[ZR(조디악 릴리징) 스피릿 — 행위·직업 타이밍]
${zrSpiritStr}

[ZR 포르투나×스피릿 교차신호 — 5년 내 같은 하우스로 겹치는 구간]
${zrCrossStr}

위 다섯 가지 데이터를 모두 종합해서, 이 사람의 인생 전체를 가로지르는 큰 흐름을 하나의 서사로 써주세요:
· 진행월령 8단계가 보여주는 인생의 시기별 성격 변화 — 지금이 어느 단계인지, 그 단계가 어떤 의미인지 구체적으로
· ZR의 "절정"·"결속풀림" 마커가 가장 구체적인 전환 시점이니 이를 중심으로 짚어주고(포르투나=재물·몸, 스피릿=행위·직업 양쪽 다 확인해서, 같은 시기에 겹치면 "외부 기회와 본인 행동력이 동시에 정점"이라는 식으로, 안 겹치면 각자 의미를 따로), 프로펙션 재물 활성화 나이와 진행월령 단계는 그 흐름을 보강하는 맥락으로 쓰세요
· ZR 각 시기의 지배성에는 본질적 위계(자기별자리/승격/디트리먼트/함몰/중립)와 우연적 위계(하우스 위치·역행·컴버스천·섹트) 두 가지가 같이 나와요. 본질적 위계가 더 근본적인 성격이고 우연적 위계는 그 위에 얹히는 부가적 컨디션이니, 둘이 다르게 나오면(예: 본질적으론 중립인데 우연적으론 강함) "타고난 그릇은 평범하지만 지금 처한 상황은 유리하다"처럼 우선순위를 두고 종합해서 설명하세요
· 포르투나×스피릿 교차신호가 있으면(5년 내 교차 없음이 아니라면), 두 독립적인 계산이 같은 결론을 가리키는 더 강한 신호로 특별히 짚어주세요
· 위에 나온 재물운 활성화 나이들이 실제로 이 사람 인생에서 어떤 시기들인지(이미 지난 나이는 "그때 이런 흐름이 있었을 것"으로, 앞으로 올 나이는 "다가올 시기"로) 자연스럽게 짚어주기
· 재물 지배성의 위계(자기 별자리/승격이면 타고난 재물 그릇이 좋다는 뜻, 디트리먼트/함몰이면 애를 먹지만 노력으로 극복 가능, 중립이면 평범하게 안정적)와 그 행성의 주요각이 보여주는 재물운의 "질감"(꾸준한지, 들쑥날쑥한지, 마찰이 있는지)
· 타고난 강점과 반복되는 과제, 인생에서 중요한 성장 방향
이 섹션에서는 나이 숫자를 자연스럽게 언급해도 됩니다(다른 곳과 달리 시기를 짚어주는 게 핵심이므로).
행성 이름·사인 이름·각도 숫자·기호·하우스 번호는 여기서도 쓰지 말고 의미만 풀어서 설명하세요.
500자 이상 충분히 써주세요.

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
