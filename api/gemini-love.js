import Ephemeris from 'ephemeris';

function norm360(a) { return ((a % 360) + 360) % 360; }

// 오늘 트랜짓 금성이 역행 중인지 — 오늘과 내일의 황경을 비교 (위치 무관, 지구중심 기준이라 출생지 불필요)
function isVenusRetrogradeNow() {
  const today    = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const lonToday    = norm360(Ephemeris.getAllPlanets(today, 0, 0, 0).observed.venus.apparentLongitudeDd);
  const lonTomorrow = norm360(Ephemeris.getAllPlanets(tomorrow, 0, 0, 0).observed.venus.apparentLongitudeDd);
  let diff = lonTomorrow - lonToday;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff < 0;
}

function buildLovePrompt(body) {
  const {
    name, gender, venus, mars, moon, saturn,
    house5Sign, house7Sign, house5Occupants, house7Occupants,
    house7Ruler, satVenusAspect, satRulerAspect,
    transitNow, progMoonHouse, progMoonSign,
    ascSign, ascRuler, house5Ruler, house8Sign, house8Occupants,
    progVenusSign, progVenusHouse, northNodeSign, northNodeHouse,
    jupiterVenusAspect, eclipseSignal, venusRetro
  } = body;

  const displayName = name?.trim() || '당신';
  const genderKr     = gender === 'M' ? '남성' : '여성';

  const house5Str = `${house5Sign}${house5Occupants?.length ? ` (${house5Occupants.join(', ')} 위치)` : ''}`;
  const house7Str = `${house7Sign}${house7Occupants?.length ? ` (${house7Occupants.join(', ')} 위치)` : ''}`;
  const house8Str = `${house8Sign}${house8Occupants?.length ? ` (${house8Occupants.join(', ')} 위치)` : ''}`;

  let transitStr = '트랜짓 정보 없음';
  if (transitNow) {
    transitStr = `이번 달 트랜짓 — 금성: ${transitNow.planets.venus.sign}, 화성: ${transitNow.planets.mars.sign}`;
  }
  const progMoonStr = progMoonSign ? `프로그레션 달: ${progMoonSign} ${progMoonHouse}하우스` : '프로그레션 정보 없음';
  const progVenusStr = progVenusSign ? `프로그레션 금성: ${progVenusSign} ${progVenusHouse}하우스 (지금 어떤 사랑에 끌리는지의 변화)` : '프로그레션 금성 정보 없음';

  const house7RulerStr = house7Ruler
    ? `7하우스(${house7Sign}) 지배행성: ${house7Ruler.label} — ${house7Ruler.sign} ${house7Ruler.house}하우스`
    : '7하우스 지배행성 정보 없음';
  const house5RulerStr = house5Ruler
    ? `5하우스(${house5Sign}) 지배행성: ${house5Ruler.label} — ${house5Ruler.sign} ${house5Ruler.house}하우스`
    : '5하우스 지배행성 정보 없음';
  const ascRulerStr = ascRuler
    ? `차트 지배행성(ASC ${ascSign}): ${ascRuler.label} — ${ascRuler.sign} ${ascRuler.house}하우스 (연애를 대하는 전체적인 태도)`
    : '차트 지배행성 정보 없음';
  const satVenusStr = satVenusAspect
    ? `토성-금성: ${satVenusAspect.aspect} (orb ${satVenusAspect.orb}°)`
    : '토성-금성 간 뚜렷한 어스펙트 없음';
  const satRulerStr = satRulerAspect
    ? `토성-7하우스 지배행성: ${satRulerAspect.aspect} (orb ${satRulerAspect.orb}°)`
    : '';
  const jupVenusStr = jupiterVenusAspect
    ? `목성-금성: ${jupiterVenusAspect.aspect} (orb ${jupiterVenusAspect.orb}°) — 전통적으로 "사랑의 행운" 지표`
    : '목성-금성 간 뚜렷한 어스펙트 없음';
  const nodeStr = northNodeSign ? `북노드: ${northNodeSign} ${northNodeHouse}하우스 — 어떤 관계로 성장해가야 하는지의 방향` : '';
  const venusRetroStr = `금성 역행 여부: ${venusRetro ? '역행 중 (전통적으로 옛 인연이나 과거의 사랑 방식이 다시 떠오르는 시기)' : '순행 중'}`;
  const eclipseStr = eclipseSignal
    ? (() => {
        const d = new Date(eclipseSignal.dateLocal);
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${eclipseSignal.type}이 ${eclipseSignal.conjunctPoint}에 근접 — 관계의 중요한 전환점으로 해석 가능`;
      })()
    : '올해 연애 관련 일식/월식 시그널 없음';

  return `
너는 20년 경력의 서양 점성술 전문가야.
아래 차트 데이터를 바탕으로 ${displayName}님만을 위한 연애운 리포트를 작성해.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기본 정보]
이름: ${displayName} / 성별: ${genderKr}

[타고난 연애 기질 — 나탈 차트]
금성(Venus): ${venus.sign} ${venus.house}하우스 — 끌림의 방식·사랑을 표현하고 받는 방식
화성(Mars): ${mars.sign} ${mars.house}하우스 — 욕망·연애에서의 추진력
달(Moon): ${moon.sign} ${moon.house}하우스 — 정서적으로 원하는 것
5하우스(연애·설렘): ${house5Str}
7하우스(진지한 파트너십): ${house7Str}
8하우스(깊은 정서적·성적 유대): ${house8Str}
${house5RulerStr}
${ascRulerStr}
${jupVenusStr}
${nodeStr}

[결혼·지속적 관계 — 토성·7하우스 지배행성]
토성(Saturn): ${saturn.sign} ${saturn.house}하우스 — 책임감·관계를 얼마나 오래 지속시키는가
${house7RulerStr}
${satVenusStr}
${satRulerStr}

[올해의 흐름]
${transitStr}
${progMoonStr}
${progVenusStr}
${venusRetroStr}
${eclipseStr}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 삶의 언어로 번역해라.
   예) "금성이 7하우스" → "가벼운 만남보다 처음부터 진지한 관계를 추구하는 끌림의 방식"
2. ${displayName}님만의 특징처럼 구체적으로 써라. 일반적인 운세 상투어("좋은 인연이 옵니다" 등) 금지.
3. "~할 수 있습니다", "~일 수도 있어요" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 길흉 예언(예: "올해 반드시 결혼한다")은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 헤더(#) 사용 금지 — **볼드**만 사용.

[섹션 구성 — 반드시 아래 3개 마커를 정확히 그대로 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라: ===SECTION:nature===
마커 자체는 사용자에게 보이지 않는 구분선이므로, 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:nature===
(타고난 연애 기질 — 금성·화성·달·5/7하우스가 만드는 ${displayName}님의 연애 패턴)
- 어떤 사람에게 끌리는지, 사랑을 표현하는 방식, 진지한 관계 vs 가벼운 만남 중 무엇을 추구하는지
- 분량: 4~5문단, 각 문단 3~4문장

===SECTION:marriage===
(결혼·지속적 관계 — 토성과 7하우스 지배행성이 보여주는 결혼 성향)
- 연애와 결혼은 다르다는 점을 살려서, ${displayName}님이 관계를 얼마나 오래/진지하게 지속시키는 성향인지
- 토성-금성, 토성-7하우스지배행성 어스펙트가 있다면 그게 결혼/헌신에 어떤 의미인지 (없다면 토성과 7하우스 지배행성의 별자리·하우스만으로 해석)
- 단정적인 결혼 시기 예언("올해 결혼한다" 등)은 금지, 결혼에 대한 태도와 패턴 위주로
- 분량: 3~4문단

===SECTION:timing===
(올해의 연애 흐름 — 트랜짓·프로그레션이 보여주는 타이밍)
- 지금이 연애에 유리한 시기인지, 어떤 변화가 다가오는지
- 구체적으로 어떻게 행동하면 좋을지 실질적인 조언
- 분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 nature, marriage, timing 세 섹션을 마커와 함께 전부 작성해.
`.trim();
}

function buildReunionPrompt(body) {
  const {
    name, gender, venus, mars, moon, saturn,
    house7Sign, house7Occupants, house7Ruler,
    satVenusAspect, satRulerAspect,
    transitNow, progMoonHouse, progMoonSign,
    venusRetro,
    ascSign, ascRuler, house8Sign, house8Occupants,
    progVenusSign, progVenusHouse, northNodeSign, northNodeHouse,
    jupiterVenusAspect, eclipseSignal
  } = body;

  const displayName = name?.trim() || '당신';
  const genderKr     = gender === 'M' ? '남성' : '여성';

  const house7Str = `${house7Sign}${house7Occupants?.length ? ` (${house7Occupants.join(', ')} 위치)` : ''}`;
  const house8Str = `${house8Sign}${house8Occupants?.length ? ` (${house8Occupants.join(', ')} 위치)` : ''}`;

  const house7RulerStr = house7Ruler
    ? `7하우스(${house7Sign}) 지배행성: ${house7Ruler.label} — ${house7Ruler.sign} ${house7Ruler.house}하우스`
    : '7하우스 지배행성 정보 없음';
  const ascRulerStr = ascRuler
    ? `차트 지배행성(ASC ${ascSign}): ${ascRuler.label} — ${ascRuler.sign} ${ascRuler.house}하우스`
    : '차트 지배행성 정보 없음';
  const satVenusStr = satVenusAspect
    ? `토성-금성: ${satVenusAspect.aspect} (orb ${satVenusAspect.orb}°)`
    : '토성-금성 간 뚜렷한 어스펙트 없음';
  const satRulerStr = satRulerAspect
    ? `토성-7하우스 지배행성: ${satRulerAspect.aspect} (orb ${satRulerAspect.orb}°)`
    : '';
  const jupVenusStr = jupiterVenusAspect
    ? `목성-금성: ${jupiterVenusAspect.aspect} (orb ${jupiterVenusAspect.orb}°)`
    : '목성-금성 간 뚜렷한 어스펙트 없음';
  const nodeStr = northNodeSign
    ? `북노드: ${northNodeSign} ${northNodeHouse}하우스 — 전통적으로 "운명적·카르마적 재회"를 가리키는 핵심 지표`
    : '';

  const transitSaturnHouse = transitNow?.planets?.saturn?.house ?? null;
  const saturnIn78 = transitSaturnHouse === 7 || transitSaturnHouse === 8;

  let transitStr = '트랜짓 정보 없음';
  if (transitNow) {
    transitStr = `이번 달 트랜짓 — 금성: ${transitNow.planets.venus.sign}, 토성: ${transitNow.planets.saturn.sign} (${transitSaturnHouse}하우스)`;
  }
  const progMoonStr = progMoonSign ? `프로그레션 달: ${progMoonSign} ${progMoonHouse}하우스` : '프로그레션 정보 없음';
  const progVenusStr = progVenusSign ? `프로그레션 금성: ${progVenusSign} ${progVenusHouse}하우스` : '프로그레션 금성 정보 없음';
  const eclipseStr = eclipseSignal
    ? (() => {
        const d = new Date(eclipseSignal.dateLocal);
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${eclipseSignal.type}이 ${eclipseSignal.conjunctPoint}에 근접 — 관계의 중요한 전환점으로 해석 가능`;
      })()
    : '올해 연애 관련 일식/월식 시그널 없음';

  return `
너는 20년 경력의 서양 점성술 전문가야.
아래 차트 데이터를 바탕으로 ${displayName}님만을 위한 재회운 리포트를 작성해.
("재회운"은 과거 연인과 다시 만날 가능성/타이밍을 보는 것으로, 일반적인 연애운과는 다른 영역이야.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기본 정보]
이름: ${displayName} / 성별: ${genderKr}

[재회와 관련된 본인의 패턴 — 나탈 차트]
금성(Venus): ${venus.sign} ${venus.house}하우스 — 과거 인연에 대한 애착 방식
화성(Mars): ${mars.sign} ${mars.house}하우스
달(Moon): ${moon.sign} ${moon.house}하우스 — 미련·정서적 애착의 패턴
토성(Saturn): ${saturn.sign} ${saturn.house}하우스 — 관계를 다시 시험하고 재정비하려는 성향
7하우스(진지한 파트너십): ${house7Str}
8하우스(깊은 정서적·성적 유대, 미련의 뿌리): ${house8Str}
${house7RulerStr}
${ascRulerStr}
${satVenusStr}
${satRulerStr}
${jupVenusStr}
${nodeStr}

[지금 시점의 재회 타이밍 신호]
금성 역행 여부: ${venusRetro ? '역행 중 (전통적으로 과거 인연이 다시 떠오르는 시기로 해석됨)' : '순행 중'}
트랜짓 토성이 7/8하우스를 지나는 중인가: ${saturnIn78 ? `예 (${transitSaturnHouse}하우스 — 관계의 재시험/재정비 시기)` : '아니오'}
${transitStr}
${progMoonStr}
${progVenusStr}
${eclipseStr}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 삶의 언어로 번역해라.
2. ${displayName}님만의 특징처럼 구체적으로 써라. 일반적인 운세 상투어 금지.
3. "~할 수 있습니다" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 예언(예: "반드시 재회한다", "이 사람과 다시 만난다")은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 헤더(#) 사용 금지 — **볼드**만 사용.

[섹션 구성 — 반드시 아래 2개 마커를 정확히 그대로 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라: ===SECTION:pattern===
마커 자체는 사용자에게 보이지 않는 구분선이므로, 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:pattern===
(재회와 관련된 ${displayName}님의 패턴 — 금성·화성·달·토성·7하우스가 보여주는 과거 인연에 대한 애착과 미련의 방식)
- 헤어진 인연을 어떻게 정리하는 편인지, 다시 떠올리는 패턴이 있는지
- 분량: 4~5문단, 각 문단 3~4문장

===SECTION:timing===
(지금이 재회에 유리한 시기인지 — 금성 역행·토성 트랜짓·프로그레션이 보여주는 타이밍)
- 지금 흐름이 재회에 유리한지, 불리한지, 어떤 신호를 주목해야 하는지
- 구체적으로 어떻게 행동하면 좋을지 실질적인 조언
- 분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 pattern과 timing 두 섹션을 마커와 함께 전부 작성해.
`.trim();
}

function buildCompatibilityPrompt(body) {
  const {
    myName, myGender, partnerName, partnerGender,
    myPlanets, partnerPlanets, partnerTimeUnknown,
    topAspects, houseOverlay, composite
  } = body;

  const myLabel      = myName?.trim() || '나';
  const partnerLabel = partnerName?.trim() || '상대방';
  const myGenderKr      = myGender === 'M' ? '남성' : '여성';
  const partnerGenderKr = partnerGender === 'M' ? '남성' : '여성';

  const aspectsStr = (topAspects || []).length
    ? topAspects.map(a => `${a.point1} ${a.symbol} ${a.point2} (${a.aspect}, orb ${a.orb}°)`).join('\n')
    : '뚜렷한 어스펙트 없음';

  const overlayStr = houseOverlay
    ? `${partnerLabel}의 태양이 ${myLabel}의 ${houseOverlay.partnerPlanetsInMyHouses.sun}하우스, 달이 ${houseOverlay.partnerPlanetsInMyHouses.moon}하우스, 금성이 ${houseOverlay.partnerPlanetsInMyHouses.venus}하우스에 위치\n`
      + `${myLabel}의 태양이 ${partnerLabel}의 ${houseOverlay.myPlanetsInPartnerHouses.sun}하우스, 달이 ${houseOverlay.myPlanetsInPartnerHouses.moon}하우스, 금성이 ${houseOverlay.myPlanetsInPartnerHouses.venus}하우스에 위치`
    : '하우스 오버레이 정보 없음';

  const timeNote = partnerTimeUnknown ? `\n(주의: ${partnerLabel}의 출생시각이 불명확해 정오로 가정함 — 하우스 오버레이는 참고용일 뿐 정밀하지 않음)` : '';

  return `
너는 20년 경력의 서양 점성술 전문가야.
아래 두 사람의 차트 데이터를 바탕으로 ${myLabel}님과 ${partnerLabel}님의 궁합(시너지) 리포트를 작성해.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기본 정보]
${myLabel}: ${myGenderKr} / ${partnerLabel}: ${partnerGenderKr}

[각자의 핵심 행성]
${myLabel} — 태양: ${myPlanets.sun.sign}, 달: ${myPlanets.moon.sign}, 금성: ${myPlanets.venus.sign}, 화성: ${myPlanets.mars.sign}
${partnerLabel} — 태양: ${partnerPlanets.sun.sign}, 달: ${partnerPlanets.moon.sign}, 금성: ${partnerPlanets.venus.sign}, 화성: ${partnerPlanets.mars.sign}

[시너지 어스펙트 — 두 사람 차트 간 가장 강한 연결 (orb 작을수록 강함)]
${aspectsStr}

[하우스 오버레이]
${overlayStr}${timeNote}

[컴포지트 차트 — 관계 자체의 성격]
컴포지트 태양: ${composite.sun.sign} / 컴포지트 달: ${composite.moon.sign} / 컴포지트 ASC: ${composite.asc.sign}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 관계의 실제 느낌으로 번역해라.
   예) "금성-화성 트라인" → "서로의 끌림이 자연스럽게 맞아떨어지는 케미"
2. ${myLabel}님과 ${partnerLabel}님 두 사람 모두의 관점에서 구체적으로 써라. 일반적인 궁합 상투어("운명적인 만남" 등) 금지.
3. "~할 수 있습니다" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 좋은 점만 나열하지 말고, 마찰이 생길 수 있는 지점도 솔직하게 짚어라.
5. 마크다운 헤더(#) 사용 금지 — **볼드**만 사용.

[섹션 구성 — 반드시 아래 2개 마커를 정확히 그대로 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라: ===SECTION:chemistry===
마커 자체는 사용자에게 보이지 않는 구분선이므로, 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:chemistry===
(끌림과 케미 — 두 사람의 핵심 행성과 시너지 어스펙트가 보여주는 매력의 지점)
- 서로 어디에 끌리는지, 어떤 마찰 지점이 있을 수 있는지
- 분량: 4~5문단, 각 문단 3~4문장

===SECTION:dynamics===
(관계의 결 — 컴포지트 차트가 보여주는 이 관계 자체의 성격)
- 이 관계가 어떤 목적/성격을 가지는지, 오래 갈 수 있는 구조인지
- 분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 chemistry와 dynamics 두 섹션을 마커와 함께 전부 작성해.
`.trim();
}

function buildReunionKnownPrompt(body) {
  const {
    myName, myGender, partnerName, partnerGender,
    myPlanets, partnerPlanets, partnerTimeUnknown,
    topAspects, houseOverlay, composite,
    transitSaturnHouse, venusRetro
  } = body;

  const myLabel      = myName?.trim() || '나';
  const partnerLabel = partnerName?.trim() || '상대방';
  const myGenderKr      = myGender === 'M' ? '남성' : '여성';
  const partnerGenderKr = partnerGender === 'M' ? '남성' : '여성';

  const aspectsStr = (topAspects || []).length
    ? topAspects.map(a => `${a.point1} ${a.symbol} ${a.point2} (${a.aspect}, orb ${a.orb}°)`).join('\n')
    : '뚜렷한 어스펙트 없음';

  const overlayStr = houseOverlay
    ? `${partnerLabel}의 태양이 ${myLabel}의 ${houseOverlay.partnerPlanetsInMyHouses.sun}하우스, 금성이 ${houseOverlay.partnerPlanetsInMyHouses.venus}하우스에 위치\n`
      + `${myLabel}의 태양이 ${partnerLabel}의 ${houseOverlay.myPlanetsInPartnerHouses.sun}하우스, 금성이 ${houseOverlay.myPlanetsInPartnerHouses.venus}하우스에 위치`
    : '하우스 오버레이 정보 없음';

  const timeNote = partnerTimeUnknown ? `\n(주의: ${partnerLabel}의 출생시각이 불명확해 정오로 가정함)` : '';
  const saturnIn78 = transitSaturnHouse === 7 || transitSaturnHouse === 8;

  return `
너는 20년 경력의 서양 점성술 전문가야.
아래 두 사람의 차트 데이터를 바탕으로 ${myLabel}님과 ${partnerLabel}님의 재회운 리포트를 작성해.
("재회운"은 과거 연인과 다시 만날 가능성/타이밍을 보는 것으로, 단순 궁합과는 다르게 "재회"라는 맥락에 초점을 맞춰야 해.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기본 정보]
${myLabel}: ${myGenderKr} / ${partnerLabel}: ${partnerGenderKr}

[각자의 핵심 행성]
${myLabel} — 태양: ${myPlanets.sun.sign}, 달: ${myPlanets.moon.sign}, 금성: ${myPlanets.venus.sign}, 화성: ${myPlanets.mars.sign}
${partnerLabel} — 태양: ${partnerPlanets.sun.sign}, 달: ${partnerPlanets.moon.sign}, 금성: ${partnerPlanets.venus.sign}, 화성: ${partnerPlanets.mars.sign}

[시너지 어스펙트 — 두 사람 차트 간 가장 강한 연결]
${aspectsStr}

[하우스 오버레이]
${overlayStr}${timeNote}

[컴포지트 차트 — 관계 자체의 성격]
컴포지트 태양: ${composite.sun.sign} / 컴포지트 달: ${composite.moon.sign} / 컴포지트 ASC: ${composite.asc.sign}

[지금 시점의 재회 타이밍 신호]
금성 역행 여부: ${venusRetro ? '역행 중 (전통적으로 과거 인연이 다시 떠오르는 시기로 해석됨)' : '순행 중'}
${myLabel}의 트랜짓 토성이 7/8하우스를 지나는 중인가: ${saturnIn78 ? `예 (${transitSaturnHouse}하우스 — 관계의 재시험/재정비 시기)` : '아니오'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[글쓰기 스타일 — 반드시 따를 것]
1. 점성술 용어를 그냥 나열하지 말고 반드시 관계의 실제 느낌으로 번역해라.
2. ${myLabel}님과 ${partnerLabel}님 두 사람 모두의 관점에서 구체적으로 써라. 일반적인 상투어 금지.
3. "~할 수 있습니다" 같은 모호한 표현 대신 단정적이고 생생한 문장을 써라.
4. 단정적인 예언(예: "반드시 재회한다")은 금지하되, 흐름과 타이밍은 명확하게 짚어라.
5. 마크다운 헤더(#) 사용 금지 — **볼드**만 사용.

[섹션 구성 — 반드시 아래 2개 마커를 정확히 그대로 사용해서 구분할 것]
각 마커는 단독 줄에 정확히 이 형태로 적어라: ===SECTION:bond===
마커 자체는 사용자에게 보이지 않는 구분선이므로, 마커 앞뒤로 다른 설명을 절대 덧붙이지 마라.

===SECTION:bond===
(관계 패턴 — 시너지 어스펙트와 컴포지트 차트가 보여주는 두 사람의 관계 자체의 성격, 재회와 관련된 맥락에서)
- 두 사람이 왜 끌렸는지, 헤어졌다면 어떤 마찰 지점이 있었을지, 관계의 본질적 성격
- 분량: 4~5문단, 각 문단 3~4문장

===SECTION:timing===
(지금이 재회에 유리한 시기인지 — 금성 역행·토성 트랜짓이 보여주는 타이밍)
- 지금 흐름이 재회에 유리한지, 불리한지, 어떤 신호를 주목해야 하는지
- 구체적으로 어떻게 행동하면 좋을지 실질적인 조언
- 분량: 3~4문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━
지금 바로 bond와 timing 두 섹션을 마커와 함께 전부 작성해.
`.trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { type, venus, mars, moon, saturn, myPlanets, partnerPlanets } = req.body;
    const isReunion       = type === 'reunion';
    const isCompatibility = type === 'compatibility';
    const isReunionKnown  = type === 'reunion-known';

    if (isCompatibility || isReunionKnown) {
      if (!myPlanets || !partnerPlanets) {
        return res.status(400).json({ error: '필수 파라미터(myPlanets, partnerPlanets)가 누락되었습니다.' });
      }
    } else if (!venus || !mars || !moon || (isReunion && !saturn)) {
      return res.status(400).json({ error: '필수 파라미터(venus, mars, moon)가 누락되었습니다.' });
    }

    let venusRetro = false;
    if (!isCompatibility) {
      try { venusRetro = isVenusRetrogradeNow(); } catch (e) { console.warn('금성 역행 계산 실패:', e.message); }
    }

    const prompt = isReunionKnown
      ? buildReunionKnownPrompt({ ...req.body, venusRetro })
      : isCompatibility
        ? buildCompatibilityPrompt(req.body)
        : isReunion
          ? buildReunionPrompt({ ...req.body, venusRetro })
          : buildLovePrompt({ ...req.body, venusRetro });

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
                maxOutputTokens: 4096,
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
      return res.status(502).json({ error: '현재 접속자가 많아 응답이 지연되고 있습니다. 잠시만 기다리시거나, 버튼을 몇 번 더 시도해 주시면 정상적으로 이용하실 수 있습니다.', _debugStatus: response.status, _debugMessage: message });
    }

    const data  = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      console.error('Gemini 응답 파싱 실패:', JSON.stringify(data));
      return res.status(502).json({ error: '현재 접속자가 많아 응답이 지연되고 있습니다. 잠시만 기다리시거나, 버튼을 몇 번 더 시도해 주시면 정상적으로 이용하실 수 있습니다.' });
    }

    const responseBody = { result: reply };
    if (!isCompatibility) responseBody.venusRetrograde = venusRetro;
    return res.status(200).json(responseBody);

  } catch (error) {
    console.error('handler error:', error);
    return res.status(500).json({ error: 'AI 운세를 불러오는 중 오류가 발생했습니다.', _debugMessage: error?.message, _debugName: error?.name });
  }
}
