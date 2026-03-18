/* =========================================================
   사주 엔진 (saju_engine.js) — 분석 계산 전담
   ⚠️ getShishen 정의 없음 → saju_core.js 전역 함수 사용
   ⚠️ DOM 조작 없음
   계층: buildState → strength / geok / yongheegihan / score
   ========================================================= */

console.log("🔥 saju_engine.js 로드 시작");

/* =========================================================
   PART 0: B모드 프리셋
   ========================================================= */
const PROFILE_PRESETS = {
  overall:    { label:"종합",      blendAlpha:0.0,  weights:null },
  love:       { label:"연애",      blendAlpha:0.35, weights:{
    tenGod: {
      help: { "정재":1.25,"편재":1.15,"정관":1.25,"편관":1.10,"식신":1.00,"상관":0.95,
              "비견":0.85,"겁재":0.75,"정인":1.05,"편인":0.95 },
      risk: { "정재":1.05,"편재":1.10,"정관":1.05,"편관":1.10,"식신":1.00,"상관":1.10,
              "비견":1.10,"겁재":1.25,"정인":0.90,"편인":1.00 }
    }
  }},
  money:      { label:"재물",      blendAlpha:0.35, weights:{
    tenGod: {
      help: { "정재":1.25,"편재":1.25,"식신":1.05,"상관":1.05,
              "정관":0.95,"편관":0.95,"정인":0.75,"편인":0.75,"비견":0.85,"겁재":0.85 },
      risk: { "정재":1.05,"편재":1.10,"식신":1.10,"상관":1.20,
              "정관":1.05,"편관":1.15,"정인":0.85,"편인":0.95,"비견":1.05,"겁재":1.15 }
    }
  }}
};

/* =========================================================
   PART 1: 벡터 계산 (원국 / 대운 분리)
   ========================================================= */
function _buildVectors(dayStem, stemList, branchList) {
  const D  = window.SajuData;
  const elements = { wood:0, fire:0, earth:0, metal:0, water:0 };
  const tenGods  = {
    "比肩":0,"劫財":0,"食神":0,"傷官":0,
    "偏財":0,"正財":0,"偏官":0,"正官":0,"偏印":0,"正印":0
  };
  stemList.forEach(stem => {
    if (!stem) return;
    const el = D.WUXING_STEM[stem];
    if (el) elements[el] += 1.0;
    const ss = getShishen(dayStem, stem);
    if (ss) tenGods[ss] += 1.0;
  });
  branchList.forEach(branch => {
    if (!branch) return;
    (D.HIDDEN_STEMS_RATIO[branch] || []).forEach(({ stem, ratio }) => {
      const el = D.WUXING_STEM[stem];
      if (el) elements[el] += ratio;
      const ss = getShishen(dayStem, stem);
      if (ss) tenGods[ss] += ratio;
    });
  });
  return { elements, tenGods };
}

function calculateVectors(pillars) {
  const dayStem      = pillars.day.stem;
  const baseStemList = [pillars.year.stem, pillars.month.stem, pillars.hour.stem];
  const baseBranchList = [
    pillars.year.branch, pillars.month.branch,
    pillars.day.branch,  pillars.hour.branch
  ];
  const baseVectors = _buildVectors(dayStem, baseStemList, baseBranchList);

  const flowStemList   = [...baseStemList];
  const flowBranchList = [...baseBranchList];
  if (pillars.daeun?.stem)   flowStemList.push(pillars.daeun.stem);
  if (pillars.daeun?.branch) flowBranchList.push(pillars.daeun.branch);
  const flowVectors = _buildVectors(dayStem, flowStemList, flowBranchList);

  return {
    elements:    baseVectors.elements,
    tenGods:     baseVectors.tenGods,
    baseVectors,
    flowVectors
  };
}

/* =========================================================
   PART 2: 신강/신약
   ========================================================= */
function calculateStrength(pillars) {
  const D          = window.SajuData;
  const dayStem    = pillars.day.stem;
  const dayElement = D.WUXING_STEM[dayStem];
  const monthBranch = pillars.month.branch;

  // 월령 점수
  function seasonScore() {
    const season = D.SEASON_MAP[monthBranch];
    if (!season) return 0;
    const se = D.SEASON_ELEMENT[season];
    if (se === dayElement) return 18;
    if (D.WUXING_GENERATES[se]  === dayElement) return 10;
    if (D.WUXING_GENERATES[dayElement] === se)  return -8;
    if (D.WUXING_CONTROLS[se]   === dayElement) return -14;
    if (D.WUXING_CONTROLS[dayElement] === se)   return -6;
    return 0;
  }

  // 통근 점수
  function rootScore() {
    const weights = [
      { branch: pillars.year.branch,  w: 0.8 },
      { branch: pillars.month.branch, w: 1.6 },
      { branch: pillars.day.branch,   w: 1.3 },
      { branch: pillars.hour.branch,  w: 1.0 }
    ];
    let total = 0;
    weights.forEach(({ branch, w }) => {
      (D.HIDDEN_STEMS_RATIO[branch] || []).forEach(({ stem, ratio }) => {
        const se = D.WUXING_STEM[stem];
        if (!se) return;
        if (se === dayElement)                           total += ratio * 14 * w;
        else if (D.WUXING_GENERATES[se] === dayElement) total += ratio * 10 * w;
        else if (D.WUXING_GENERATES[dayElement] === se) total -= ratio *  6 * w;
        else if (D.WUXING_CONTROLS[se] === dayElement)  total -= ratio *  9 * w;
        else if (D.WUXING_CONTROLS[dayElement] === se)  total -= ratio *  5 * w;
      });
    });
    return total;
  }

  // 천간 지원 점수
  function stemScore() {
    let s = 0;
    [pillars.year.stem, pillars.month.stem, pillars.hour.stem].forEach(stem => {
      const se = D.WUXING_STEM[stem];
      if (se === dayElement)                           s += 4;
      else if (D.WUXING_GENERATES[se] === dayElement) s += 3;
      else if (D.WUXING_GENERATES[dayElement] === se) s -= 2;
      else if (D.WUXING_CONTROLS[se] === dayElement)  s -= 3;
      else if (D.WUXING_CONTROLS[dayElement] === se)  s -= 1;
    });
    return s;
  }

  const ss = seasonScore(), rs = rootScore(), sts = stemScore();
  const total = 50 + ss + rs + sts;
  const label = total >= 66 ? "신강" : total >= 36 ? "중화" : "신약";

  return { score: total, label, breakdown: { season: ss, root: rs, stem: sts } };
}

/* =========================================================
   PART 3: 격(格) 판정 — 판정과 순도 점수화 분리
   ========================================================= */

/**
 * 格 판정 (구조 분석)
 * 반환: { main, sub, purity, broken, recovery, notes }
 */
function determineGeok(pillars, vectors) {
  const D           = window.SajuData;
  const monthBranch = pillars.month.branch;
  const dayStem     = pillars.day.stem;
  const notes       = [];

  const hiddenStems = D.HIDDEN_STEMS_RATIO[monthBranch];
  if (!hiddenStems || hiddenStems.length === 0) {
    return { main:"혼합격", sub:null, purity:0.3, broken:false, recovery:false, notes:["월지 정보 없음"] };
  }

  const sorted     = [...hiddenStems].sort((a, b) => b.ratio - a.ratio);
  const primarySS  = getShishen(dayStem, sorted[0].stem);
  const secondarySS = sorted[1] ? getShishen(dayStem, sorted[1].stem) : null;

  if (!primarySS) {
    return { main:"혼합격", sub:null, purity:0.3, broken:false, recovery:false, notes:["십신 판정 실패"] };
  }

  const geokName = primarySS + "격";
  let purity = 0.40;
  notes.push(`월지 ${monthBranch} 정기 → ${geokName}`);

  // 투출 검증
  const mSS = getShishen(dayStem, pillars.month.stem);
  const ySS = getShishen(dayStem, pillars.year.stem);
  const hSS = getShishen(dayStem, pillars.hour.stem);
  if (mSS === primarySS)            { purity += 0.25; notes.push("월간 투출 (+0.25)"); }
  else if (ySS === primarySS || hSS === primarySS)
                                    { purity += 0.12; notes.push("연/시간 투출 (+0.12)"); }

  // 원국 지지율
  const tgCount = vectors.tenGods[primarySS] || 0;
  const primEl  = D.WUXING_STEM[sorted[0].stem];
  const elCount = primEl ? (vectors.elements[primEl] || 0) : 0;
  const elTotal = Object.values(vectors.elements).reduce((a, b) => a + b, 0) || 1;
  const elRatio = elCount / elTotal;
  if (tgCount >= 2.0 || elRatio >= 0.30)      { purity += 0.18; notes.push("원국 지지 강 (+0.18)"); }
  else if (tgCount >= 1.0 || elRatio >= 0.18) { purity += 0.08; notes.push("원국 지지 보통 (+0.08)"); }
  else                                         { purity -= 0.10; notes.push("원국 지지 부족 (-0.10)"); }

  // 파격 판정
  let broken = false, recovery = false, clashOpp = null;
  const otherBranches = [pillars.year.branch, pillars.day.branch, pillars.hour.branch];
  const allBranches   = [pillars.year.branch, pillars.month.branch, pillars.day.branch, pillars.hour.branch];

  for (const pair of D.EARTHLY_CLASHES) {
    if (pair.includes(monthBranch)) {
      const opp = pair.find(b => b !== monthBranch);
      if (otherBranches.includes(opp)) {
        broken = true; clashOpp = opp;
        purity -= 0.20; notes.push(`월지 충(${monthBranch}↔${opp}) 파격 (-0.20)`);
        break;
      }
    }
  }

  if (broken && clashOpp) {
    if (D.EARTHLY_SIX_COMBINATIONS.some(p =>
      p.includes(clashOpp) && allBranches.some(b => b !== clashOpp && p.includes(b))
    )) {
      recovery = true; broken = false;
      purity += 0.12; notes.push("합에 의한 파격 회복 (+0.12)");
    }
  }

  const sub = (!(mSS === primarySS) && secondarySS && secondarySS !== primarySS)
    ? secondarySS + "격(부)" : null;

  return { main: geokName, sub, purity: Math.max(0.1, Math.min(1.0, purity)), broken, recovery, notes };
}

/**
 * 格 순도 점수화 (0~10) — 격 판정과 분리
 */
function scoreGeokIntegrity(geok) {
  let s = geok.purity * 8;
  if (geok.broken) s -= 4;
  return Math.max(0, Math.min(10, s));
}

/* =========================================================
   PART 4: 용희기한 분류
   ========================================================= */
function classifyYongHeeGiHan(state) {
  const D = window.SajuData;
  const { pillars, vectors, strength, geok, interactions } = state;
  const dayStem = pillars.day.stem;

  const TEN_GODS = ["比肩","劫財","食神","傷官","偏財","正財","偏官","正官","偏印","正印"];

  const TG_FAMILY = {
    "比肩":"비겁", "劫財":"비겁",
    "食神":"식상", "傷官":"식상",
    "偏財":"재성", "正財":"재성",
    "偏官":"관성", "正官":"관성",
    "偏印":"인성", "正印":"인성"
  };

  const ROOT_POS_W = { year: 0.8, month: 1.6, day: 1.3, hour: 1.0 };
  const STEM_POS_W = { year: 0.8, month: 1.2, hour: 0.9 };

  const totalTG = Object.values(vectors.tenGods || {}).reduce((a, b) => a + b, 0) || 1;
  const helpRisk = computeHelpRisk({ pillars, vectors, strength, geok });

  function uniq(arr) {
    return [...new Set((arr || []).filter(Boolean))];
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function getTenGodElement(tg) {
    for (const stem of Object.keys(D.WUXING_STEM || {})) {
      if (getShishen(dayStem, stem) === tg) return D.WUXING_STEM[stem];
    }
    return null;
  }

  function getTenGodProfile(tg) {
    let exposed = 0;
    let root = 0;
    let monthLead = 0;
    let monthRoot = false;
    let dayRoot = false;

    const stemSlots = [
      { stem: pillars.year.stem,  pos: "year"  },
      { stem: pillars.month.stem, pos: "month" },
      { stem: pillars.hour.stem,  pos: "hour"  }
    ];

    stemSlots.forEach(({ stem, pos }) => {
      if (getShishen(dayStem, stem) === tg) {
        exposed += STEM_POS_W[pos] || 0;
      }
    });

    const branchSlots = [
      { branch: pillars.year.branch,  pos: "year"  },
      { branch: pillars.month.branch, pos: "month" },
      { branch: pillars.day.branch,   pos: "day"   },
      { branch: pillars.hour.branch,  pos: "hour"  }
    ];

    branchSlots.forEach(({ branch, pos }) => {
      const hs = D.HIDDEN_STEMS_RATIO?.[branch] || [];
      hs.forEach(({ stem, ratio }) => {
        if (getShishen(dayStem, stem) === tg) {
          root += ratio * (ROOT_POS_W[pos] || 1);
          if (pos === "month") {
            monthLead += ratio;
            monthRoot = true;
          }
          if (pos === "day") {
            dayRoot = true;
          }
        }
      });
    });

    const ratio = (vectors.tenGods?.[tg] || 0) / totalTG;

    return {
      tg,
      family: TG_FAMILY[tg],
      element: getTenGodElement(tg),
      exposed,
      root,
      ratio,
      monthLead,
      monthRoot,
      dayRoot
    };
  }

  function scoreStrengthBias(tg) {
    const s = strength.score;
    let score = 0;

    if (s <= 35) {
      // 신약: 인성/비겁 우선 기질은 유지하되,
      // 성과축 패널티는 "기질 편향" 수준으로만 — 실전 발현 가능성은 performance 단계에서 따로 판단
      if (["正印","偏印"].includes(tg)) score += 26;
      if (["比肩","劫財"].includes(tg)) score += 18;
      if (tg === "正官") score += 3;
      if (tg === "偏官") score -= 3;      // -6 → -3
      if (["食神","傷官"].includes(tg)) score -= 9;   // -16 → -9
      if (["正財","偏財"].includes(tg)) score -= 8;   // -14 → -8
    } else if (s >= 66) {
      if (tg === "食神") score += 24;
      if (tg === "傷官") score += 18;
      if (["正財","偏財"].includes(tg)) score += 20;
      if (tg === "正官") score += 8;
      if (tg === "偏官") score += 4;
      if (["正印","偏印"].includes(tg)) score -= 12;
      if (["比肩","劫財"].includes(tg)) score -= 20;
    } else {
      // 중화 구간: 정관/정인/식신/정재 약한 우선
      if (["正官","正印","食神","正財"].includes(tg)) score += 8;
      if (["偏官","偏印","偏財"].includes(tg)) score += 3;
      if (["劫財","傷官"].includes(tg)) score -= 4;
    }

    return score;
  }

  function scoreGeokBias(tg) {
    let score = 0;
    const pref = D.GEOK_PREFERENCE?.[geok.main] || D.GEOK_PREFERENCE?.["혼합격"] || {};

    if (pref.prefer?.includes(tg))  score += 22;
    if (pref.support?.includes(tg)) score += 10;
    if (pref.avoid?.includes(tg))   score -= 18;

    if (geok.main === `${tg}격`) score += 10;

    if (geok.purity >= 0.75 && pref.prefer?.includes(tg)) score += 4;
    if (geok.broken && pref.prefer?.includes(tg)) score -= 8;

    // 고전 보정
    if (geok.main === "偏官격" && tg === "食神") score += 8;       // 식신제살
    if (geok.main === "偏官격" && ["正印","偏印"].includes(tg)) score += 6; // 살인상생
    if (geok.main === "正官격" && tg === "傷官") score -= 10;      // 상관견관
    if (geok.main === "食神격" && tg === "偏印") score -= 8;       // 도식 경향
    if (geok.main === "正財격" && tg === "劫財") score -= 8;
    if (geok.main === "偏財격" && ["比肩","劫財"].includes(tg)) score -= 8;

    return score;
  }

  function scoreAvailability(tg, profile) {
    let score = 0;

    const help = helpRisk.tenGod?.help?.[tg] ?? 0.5;
    const risk = helpRisk.tenGod?.risk?.[tg] ?? 0.5;

    score += (help - risk) * 10;

    if      (profile.ratio >= 0.08 && profile.ratio <= 0.24) score += 8;
    else if (profile.ratio >= 0.05 && profile.ratio < 0.08)  score += 3;
    else if (profile.ratio > 0.24  && profile.ratio <= 0.34) score -= 2;
    else if (profile.ratio > 0.34)                           score -= 8;
    else if (profile.ratio < 0.03)                           score -= 4;

    score += Math.min(profile.exposed * 4, 8);
    score += Math.min(profile.root    * 3.5, 8);

    if      (profile.monthLead >= 0.60) score += 6;
    else if (profile.monthLead >= 0.25) score += 3;

    if (profile.exposed > 0 && profile.root === 0) score -= 3;

    return score;
  }

  function scoreStructure(tg, profile) {
    let score = 0;

    // 충: 월지·일지 뿌리가 충에 걸리면 강한 감점
    const clashes = interactions?.충 || [];
    clashes.forEach(c => {
      const bs = c.branches || [];
      if (profile.monthRoot && bs.includes(pillars.month.branch)) {
        score -= c.critical ? 8 : 5;
      }
      if (profile.dayRoot && bs.includes(pillars.day.branch)) {
        score -= c.critical ? 5 : 3;
      }
    });

    // 형: 충보다 약하게 감점
    const hyeong = interactions?.형 || [];
    hyeong.forEach(c => {
      const bs = c.branches || [];
      if (profile.monthRoot && bs.includes(pillars.month.branch)) {
        score -= c.critical ? 5 : 3;
      }
      if (profile.dayRoot && bs.includes(pillars.day.branch)) {
        score -= c.critical ? 3 : 2;
      }
    });

    // 파: 형보다 약하게 감점
    const pa = interactions?.파 || [];
    pa.forEach(c => {
      const bs = c.branches || [];
      if (profile.monthRoot && bs.includes(pillars.month.branch)) {
        score -= c.critical ? 3 : 2;
      }
      if (profile.dayRoot && bs.includes(pillars.day.branch)) {
        score -= c.critical ? 2 : 1;
      }
    });

    // 해: 가장 약한 감점
    const hae = interactions?.해 || [];
    hae.forEach(c => {
      const bs = c.branches || [];
      if (profile.monthRoot && bs.includes(pillars.month.branch)) {
        score -= c.critical ? 2 : 1;
      }
      if (profile.dayRoot && bs.includes(pillars.day.branch)) {
        score -= c.critical ? 1 : 0.5;
      }
    });

    // 합이 2개 이상이고 통근이 있으면 소폭 회복
    if ((interactions?.합 || []).length >= 2 && profile.root > 0.8) {
      score += 2;
    }

    return score;
  }

  // ── 십신 10개 각각 채점 후 정렬
  const ranked = TEN_GODS.map(tg => {
    const profile      = getTenGodProfile(tg);
    const base         = 50;
    const strengthBias = scoreStrengthBias(tg);
    const geokBias     = scoreGeokBias(tg);
    const availability = scoreAvailability(tg, profile);
    const structure    = scoreStructure(tg, profile);

    const finalScore = clamp(
      Math.round(base + strengthBias + geokBias + availability + structure),
      0, 100
    );

    return {
      tg,
      family:  profile.family,
      element: profile.element,
      score:   finalScore,
      detail:  { strengthBias, geokBias, availability, structure },
      profile
    };
  }).sort((a, b) => b.score - a.score);

  // ── 용/희/기/한 픽업 함수
  function pickTopTier(list, minScore, maxCount, topGap = 6) {
    if (!list.length) return [];
    const top = list[0].score;
    return list.filter(x => x.score >= minScore && (top - x.score) <= topGap).slice(0, maxCount);
  }

  function pickPositive(list, minScore, maxCount, excluded = []) {
    return list.filter(x => x.score >= minScore && !excluded.includes(x.tg)).slice(0, maxCount);
  }

  function pickBottomTier(list, maxScore, maxCount, bottomGap = 6) {
    if (!list.length) return [];
    const bottom = list[list.length - 1].score;
    return [...list]
      .reverse()
      .filter(x => x.score <= maxScore && (x.score - bottom) <= bottomGap)
      .slice(0, maxCount);
  }

  function pickNegative(list, maxScore, maxCount, excluded = []) {
    return [...list]
      .reverse()
      .filter(x => x.score <= maxScore && !excluded.includes(x.tg))
      .slice(0, maxCount);
  }

  // 용신: 상위 점수 1~2개 (72점 이상, 상위 7점 이내)
  let yongItems = pickTopTier(ranked, 72, 2, 7);
  if (!yongItems.length) yongItems = [ranked[0]];
  const yongNames = yongItems.map(x => x.tg);

  // 희신: 용신 제외 60점 이상
  let heeItems = pickPositive(ranked, 60, 2, yongNames);
  if (!heeItems.length) {
    heeItems = ranked.filter(x => !yongNames.includes(x.tg)).slice(0, 1);
  }

  // 한신: 하위 점수 1~2개 (30점 이하, 하위 7점 이내)
  let hanItems = pickBottomTier(ranked, 30, 2, 7);
  if (!hanItems.length) hanItems = [ranked[ranked.length - 1]];
  const hanNames = hanItems.map(x => x.tg);

  // 기신: 한신 제외 42점 이하
  let giItems = pickNegative(ranked, 42, 2, hanNames);
  if (!giItems.length) {
    giItems = [...ranked].reverse().filter(x => !hanNames.includes(x.tg)).slice(0, 1);
  }

  function pack(items) {
    const tenGods = items.map(x => x.tg);
    return {
      tenGods,
      elements: uniq(items.map(x => x.element)),
      ranked: items.map(x => ({
        tg:      x.tg,
        score:   x.score,
        family:  x.family,
        element: x.element
      }))
    };
  }

  console.log("🎯 [용희기한 V2] ranked:", ranked.map(x => `${x.tg}:${x.score}`).join(" "));

  return {
    yong: pack(yongItems),
    hee:  pack(heeItems),
    gi:   pack(giItems),
    han:  pack(hanItems),
    ranked,
    _debug: {
      strengthScore: strength.score,
      geokMain:      geok.main,
      geokPurity:    geok.purity,
      broken:        geok.broken
    }
  };
}

/* =========================================================
   PART 5: 합충형 감지
   ========================================================= */
function detectInteractions(pillars) {
  const D        = window.SajuData;
  const interactions = { 합:[], 충:[], 형:[], 파:[], 해:[], criticalHits:[] };
  const stems    = [pillars.year.stem, pillars.month.stem, pillars.day.stem, pillars.hour.stem];
  const branches = [pillars.year.branch, pillars.month.branch, pillars.day.branch, pillars.hour.branch];
  const KEY      = [pillars.month.branch, pillars.day.branch]; // critical 판단 기준

  function isCritical(bs) {
    return bs.some(b => KEY.includes(b));
  }

  // 천간오합
  for (const [a,b] of D.HEAVENLY_COMBINATIONS) {
    if (stems.includes(a) && stems.includes(b))
      interactions.합.push({ type:"천간오합", stems:[a,b] });
  }
  // 지지 육합
  for (const [a,b] of D.EARTHLY_SIX_COMBINATIONS) {
    if (branches.includes(a) && branches.includes(b))
      interactions.합.push({ type:"육합", branches:[a,b] });
  }
  // 지지 삼합
  for (const g of D.EARTHLY_THREE_COMBINATIONS) {
    const cnt = branches.filter(b => g.branches.includes(b)).length;
    if (cnt >= 2) interactions.합.push({
      type: cnt === 3 ? "삼합완성" : "삼합반합",
      branches: g.branches, element: g.element
    });
  }
  // 지지 충
  for (const [a,b] of D.EARTHLY_CLASHES) {
    if (branches.includes(a) && branches.includes(b)) {
      const critical = isCritical([a,b]);
      interactions.충.push({ type:"충", branches:[a,b], critical });
      if (critical) interactions.criticalHits.push(`월/일지 충: ${a}↔${b}`);
    }
  }

  // 지지 형(刑)
  // 삼형: 寅巳申, 丑戌未
  const SAMHYEONG = [["寅","巳","申"], ["丑","戌","未"]];
  for (const grp of SAMHYEONG) {
    const hits = grp.filter(b => branches.includes(b));
    if (hits.length >= 2) {
      const critical = isCritical(hits);
      interactions.형.push({ type:"삼형", branches:hits, critical });
      if (critical) interactions.criticalHits.push(`월/일지 삼형: ${hits.join("↔")}`);
    }
  }
  // 상형: 子卯
  for (const [a,b] of [["子","卯"]]) {
    if (branches.includes(a) && branches.includes(b)) {
      const critical = isCritical([a,b]);
      interactions.형.push({ type:"상형", branches:[a,b], critical });
      if (critical) interactions.criticalHits.push(`월/일지 상형: ${a}↔${b}`);
    }
  }
  // 자형(自刑): 辰辰 午午 酉酉 亥亥
  for (const b of ["辰","午","酉","亥"]) {
    if (branches.filter(x => x === b).length >= 2) {
      const critical = isCritical([b, b]);
      interactions.형.push({ type:"자형", branches:[b, b], critical });
      if (critical) interactions.criticalHits.push(`월/일지 자형: ${b}${b}`);
    }
  }

  // 지지 파(破)
  const PA = [["子","酉"],["卯","午"],["辰","丑"],["未","戌"],["寅","亥"],["巳","申"]];
  for (const [a,b] of PA) {
    if (branches.includes(a) && branches.includes(b)) {
      const critical = isCritical([a,b]);
      interactions.파.push({ type:"파", branches:[a,b], critical });
      if (critical) interactions.criticalHits.push(`월/일지 파: ${a}↔${b}`);
    }
  }

  // 지지 해(害)
  const HAE = [["子","未"],["丑","午"],["寅","巳"],["卯","辰"],["申","亥"],["酉","戌"]];
  for (const [a,b] of HAE) {
    if (branches.includes(a) && branches.includes(b)) {
      const critical = isCritical([a,b]);
      interactions.해.push({ type:"해", branches:[a,b], critical });
      if (critical) interactions.criticalHits.push(`월/일지 해: ${a}↔${b}`);
    }
  }

  return interactions;
}

/* =========================================================
   PART 6: help/risk 계산
   ========================================================= */
function computeHelpRisk(state) {
  const D = window.SajuData;
  const { vectors, strength, geok } = state;
  const total = Object.values(vectors.tenGods).reduce((a, b) => a + b, 0);
  const OPT   = { min:0.12, max:0.28 };
  const SAFE  = { min:0.05, max:0.40 };

  const helpRisk = {
    tenGod:  { help:{}, risk:{} },
    element: { help:{}, risk:{} }
  };

  Object.keys(vectors.tenGods).forEach(tg => {
    const ratio = total > 0 ? (vectors.tenGods[tg] || 0) / total : 0;
    let help = ratio >= OPT.min && ratio <= OPT.max ? 1.0
             : ratio < OPT.min ? Math.max(0, 1 - (OPT.min - ratio) / OPT.min)
             : Math.max(0, 1 - (ratio - OPT.max) / (1 - OPT.max));
    let risk = ratio < SAFE.min ? (SAFE.min - ratio) / SAFE.min
             : ratio > SAFE.max ? (ratio - SAFE.max) / (1 - SAFE.max) : 0;

    const pref = D.GEOK_PREFERENCE[geok.main];
    if (pref) {
      if (pref.prefer?.includes(tg)) { help *= 1.3; risk *= 0.7; }
      if (pref.avoid?.includes(tg))  { help *= 0.6; risk *= 1.5; }
    }
    if (strength.score <= 35) {
      if (["比肩","劫財","正印","偏印"].includes(tg)) { help *= 1.2; risk *= 0.8; }
      // 성과축 risk 가중: "신약이니 무조건"이 아니라
      // 아래 구조적 불안정 조건 2개 이상일 때만 risk 증폭
      if (["食神","傷官","偏財","正財"].includes(tg)) {
        let structuralInstability = 0;
        if (state.geok?.broken && !state.geok?.recovery) structuralInstability++;
        if ((state.interactions?.criticalHits?.length || 0) >= 2)  structuralInstability++;
        // ratio 낮고 exposed 없으면 뿌리 없는 부유 상태
        const tgRatio = total > 0 ? (vectors.tenGods[tg] || 0) / total : 0;
        if (tgRatio < 0.04) structuralInstability++;
        if (structuralInstability >= 2) { risk *= 1.2; }
        // 조건 미충족 → risk 가중 없음 (실전 발현 가능성을 performance에서 판단)
      }
    } else if (strength.score >= 66) {
      if (["食神","傷官","偏財","正財","偏官","正官"].includes(tg)) { help *= 1.2; risk *= 0.8; }
      if (["比肩","劫財"].includes(tg)) { risk *= 1.3; }
    }

    helpRisk.tenGod.help[tg] = Math.min(1.0, help);
    helpRisk.tenGod.risk[tg] = Math.min(1.0, risk);
  });

  const elTotal = Object.values(vectors.elements).reduce((a, b) => a + b, 0);
  Object.keys(vectors.elements).forEach(elem => {
    const ratio = elTotal > 0 ? (vectors.elements[elem] || 0) / elTotal : 0;
    const help  = ratio >= 0.15 && ratio <= 0.30 ? 1.0
                : Math.max(0, 1 - Math.abs(ratio - 0.20) / 0.30);
    const risk  = ratio < 0.05 || ratio > 0.45 ? 0.5 : 0;
    helpRisk.element.help[elem] = help;
    helpRisk.element.risk[elem] = risk;
  });

  return helpRisk;
}

/* =========================================================
   PART 7: 점수 함수들
   ========================================================= */
function scoreBalance(vectors) {
  const total = Object.values(vectors.elements).reduce((a, b) => a + b, 0);
  if (total === 0) return 8;
  let dev = 0;
  Object.values(vectors.elements).forEach(c => { dev += Math.abs(c / total - 0.2); });
  return Math.max(0, 1 - dev / 1.2) * 15;
}

function scoreStrength(strength) {
  const s = strength.score;
  if (s >= 45 && s <= 60) return 8;
  if (s < 45) return Math.max(0, 8 - (45 - s) * 0.25);
  return Math.max(0, 8 - (s - 60) * 0.18);
}

function scoreYongHeeGiHan(gods, vectors) {
  let score = 0;
  gods.yong.tenGods.forEach(tg => { score += Math.min((vectors.tenGods[tg] || 0) * 3.5, 7); });
  gods.hee.tenGods.forEach(tg  => { score += Math.min((vectors.tenGods[tg] || 0) * 1.5, 3); });
  gods.gi.tenGods.forEach(tg   => { const c = vectors.tenGods[tg] || 0; if (c > 1.5) score -= c * 1.5; });
  gods.han.tenGods.forEach(tg  => { const c = vectors.tenGods[tg] || 0; if (c > 1.0) score -= Math.min(c * 1.8, 4.5); });
  return Math.max(0, Math.min(15, score));
}

function scoreInteractions(interactions) {
  let score = interactions.합.length * 1.5;
  interactions.충.forEach(c => { score -= c.critical ? 8   : 4;   });
  interactions.형.forEach(c => { score -= c.critical ? 3   : 2;   });
  interactions.파.forEach(c => { score -= c.critical ? 2   : 1.2; });
  interactions.해.forEach(c => { score -= c.critical ? 1.5 : 1;   });
  return Math.max(-12, Math.min(10, score));
}

function scoreProfile(vectors, interactions, profileName) {
  const profile = window.SajuData.PROFILES[profileName] || window.SajuData.PROFILES.overall;
  let score = 0;
  Object.entries(profile.tenGods).forEach(([tg, w]) => {
    score += (vectors.tenGods[tg] || 0) * w * 0.4;
  });
  score += interactions.합.length * (profile.interactions?.합 || 0) * 0.8;
  score += interactions.충.length * (profile.interactions?.충 || 0) * 0.8;
  return Math.max(0, Math.min(15, score));
}

function scorePreset(helpRisk, presetWeights) {
  if (!presetWeights) return 0;
  const D = window.SajuData;
  let delta = 0;
  if (presetWeights.tenGod) {
    Object.keys(helpRisk.tenGod.help).forEach(tg => {
      const kr   = D.TEN_GODS_KR[tg] || tg;
      const wH   = presetWeights.tenGod.help[kr] || 1.0;
      const wR   = presetWeights.tenGod.risk[kr] || 1.0;
      delta += wH * helpRisk.tenGod.help[tg] * 8;
      delta -= wR * helpRisk.tenGod.risk[tg] * 6;
    });
  }
  return Math.max(-12, Math.min(12, delta));
}

/* =========================================================
   PART 8: 총점 계산
   ========================================================= */
function computeTotalScore(state, profileName = "overall") {
  const balanceScore     = scoreBalance(state.vectors);
  const strengthScore    = scoreStrength(state.strength);
  const geokScore        = scoreGeokIntegrity(state.geok);
  const yhghScore        = scoreYongHeeGiHan(state.gods, state.vectors);
  const interactionScore = scoreInteractions(state.interactions);
  const profileScore     = scoreProfile(state.vectors, state.interactions, profileName);

  const baseA    = 50 + balanceScore + strengthScore + geokScore + yhghScore + interactionScore + profileScore;
  const helpRisk = computeHelpRisk(state);
  const preset   = PROFILE_PRESETS[profileName] || PROFILE_PRESETS.overall;
  const presetDelta = scorePreset(helpRisk, preset.weights);
  const final    = Math.max(0, Math.min(100, Math.round(baseA + preset.blendAlpha * presetDelta)));

  console.log(`💯 [${profileName}] 총점: ${final} (base=${baseA.toFixed(1)}, preset=${presetDelta.toFixed(1)})`);

  return {
    total: final,
    breakdown: {
      balance:     Math.round(balanceScore),
      strength:    Math.round(strengthScore),
      geok:        Math.round(geokScore),
      yhgh:        Math.round(yhghScore),
      interaction: Math.round(interactionScore),
      profile:     Math.round(profileScore)
    },
    helpRisk,
    presetDelta: preset.blendAlpha > 0 ? presetDelta : undefined
  };
}

/* =========================================================
   PART 9: 상태 빌드 (메인 진입점)
   ========================================================= */
function buildState(pillars) {
  const vectors      = calculateVectors(pillars);
  const strength     = calculateStrength(pillars);
  const geok         = determineGeok(pillars, vectors);
  const interactions = detectInteractions(pillars);
  const gods         = classifyYongHeeGiHan({ pillars, vectors, strength, geok, interactions });
  return { pillars, vectors, strength, geok, gods, interactions };
}

/* =========================================================
   PART 10: 5축 자원 점수 계산 V2
   ─────────────────────────────────────────────────────────
   3층 구조:
     amountRaw   = 원국에 실제로 깔려 있는가 (위치·비율 가중)
     effectiveRaw = 월령·통근·투간·구조상 실제로 살아 있는가
     score       = 강도 + 역할 가치 + 실전 효율 합산
   ─────────────────────────────────────────────────────────
   핵심 변경:
     · HIDDEN_STEMS_BRANCH+ROLE_W → HIDDEN_STEMS_RATIO 통일
     · ratio 기반 단일 점수 → amountRaw/effectiveRaw/shareRatio 3층 분리
     · 통근·투간·월령 실제 반영
     · 용신/희신/기신/한신 + help/risk 점수 보정 연결
   ========================================================= */

// ── 유틸
function _clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function _round2(x)  { return Math.round(x * 100) / 100; }
function _round3(x)  { return Math.round(x * 1000) / 1000; }

/* ─────────────────────────────────────────
   헬퍼 1: 축별 월령 적합도 보정 (0.75~1.25)
   월지 계절이 해당 축의 오행을 생조하면 +, 억제하면 -
───────────────────────────────────────── */
function getAxisMonthPower(grp, pillars, dayStem, D) {
  const GROUP_ELEMENT = {
    비겁: D.WUXING_STEM[dayStem],
    식상: D.WUXING_GENERATES[D.WUXING_STEM[dayStem]],
    재성: D.WUXING_CONTROLS[D.WUXING_STEM[dayStem]],
    관성: (() => {
      const de = D.WUXING_STEM[dayStem];
      return Object.keys(D.WUXING_CONTROLS).find(e => D.WUXING_CONTROLS[e] === de);
    })(),
    인성: D.WUXING_GENERATES[
      Object.keys(D.WUXING_GENERATES).find(e => D.WUXING_GENERATES[e] === D.WUXING_STEM[dayStem])
    ] ? Object.keys(D.WUXING_GENERATES).find(e => D.WUXING_GENERATES[e] === D.WUXING_STEM[dayStem])
      : null,
  };

  // 인성 원소: 일간을 生하는 오행
  const dayEl = D.WUXING_STEM[dayStem];
  const inseongEl = Object.keys(D.WUXING_GENERATES).find(e => D.WUXING_GENERATES[e] === dayEl);
  if (grp === "인성") GROUP_ELEMENT["인성"] = inseongEl;

  const axisEl = GROUP_ELEMENT[grp];
  if (!axisEl) return 1.0;

  const season   = D.SEASON_MAP[pillars.month.branch];
  const seasonEl = D.SEASON_ELEMENT[season];
  if (!seasonEl) return 1.0;

  if (seasonEl === axisEl)                              return 1.25;
  if (D.WUXING_GENERATES[seasonEl] === axisEl)         return 1.10;
  if (D.WUXING_GENERATES[axisEl]   === seasonEl)       return 0.90;
  if (D.WUXING_CONTROLS[seasonEl]  === axisEl)         return 0.75;
  if (D.WUXING_CONTROLS[axisEl]    === seasonEl)       return 0.85;
  return 1.0;
}

/* ─────────────────────────────────────────
   헬퍼 2: 구조 보정 (格·합충·투출)
   -0.15 ~ +0.20 범위
───────────────────────────────────────── */
function getAxisStructureAdj(grp, geok, interactions, pillars, dayStem, D) {
  let adj = 0;
  const GROUP_MAP = {
    비겁: ["比肩","劫財"], 식상: ["食神","傷官"],
    재성: ["偏財","正財"], 관성: ["偏官","正官"], 인성: ["偏印","正印"],
  };
  const tgs = GROUP_MAP[grp];

  // 格 연계: 格의 핵심 십신과 일치하면 +
  const geokCore = (geok.main || "").replace("격","");
  const geokTG   = geokCore; // e.g. "食神"
  if (tgs.includes(geokTG)) {
    adj += geok.purity * 0.20;
  }
  if (geok.broken) adj -= 0.08;

  // 합 보정: 해당 축 십신이 천간합에 참여하면 소폭 +
  const stems = [pillars.year.stem, pillars.month.stem, pillars.hour.stem];
  stems.forEach(stem => {
    const ss = getShishen(dayStem, stem);
    if (tgs.includes(ss)) {
      const inHap = D.HEAVENLY_COMBINATIONS.some(pair =>
        pair.includes(stem) && stems.some(s => s !== stem && pair.includes(s))
      );
      if (inHap) adj += 0.06;
    }
  });

  // 월지 충: 월지 지장간이 주로 이 축이면 충 시 감점
  const monthHidden = D.HIDDEN_STEMS_RATIO[pillars.month.branch] || [];
  const monthPrimary = monthHidden[0];
  if (monthPrimary) {
    const mSS = getShishen(dayStem, monthPrimary.stem);
    if (tgs.includes(mSS)) {
      const clashHit = interactions.충.some(c => c.critical);
      if (clashHit) adj -= 0.12;
    }
  }

  return _clamp(adj, -0.15, 0.20);
}

/* ─────────────────────────────────────────
   헬퍼 3: 신강/약에 따른 축별 계수
───────────────────────────────────────── */
function getAxisCoeff(grp, strength) {
  const ss = strength.score;
  // 신약(≤35): 비겁·인성에 통근/투간 보너스 크게
  // 신강(≥66): 식상·재성·관성에 보너스
  const COEFFS = {
    신약: { 비겁:{root:0.55,stem:0.35}, 식상:{root:0.20,stem:0.15},
            재성:{root:0.15,stem:0.10}, 관성:{root:0.25,stem:0.18},
            인성:{root:0.50,stem:0.32} },
    중화: { 비겁:{root:0.30,stem:0.20}, 식상:{root:0.30,stem:0.22},
            재성:{root:0.30,stem:0.22}, 관성:{root:0.30,stem:0.20},
            인성:{root:0.30,stem:0.20} },
    신강: { 비겁:{root:0.12,stem:0.10}, 식상:{root:0.40,stem:0.30},
            재성:{root:0.38,stem:0.28}, 관성:{root:0.35,stem:0.25},
            인성:{root:0.12,stem:0.10} },
  };
  const tier = ss <= 35 ? "신약" : ss >= 66 ? "신강" : "중화";
  return COEFFS[tier][grp] || { root:0.25, stem:0.18 };
}

/* ─────────────────────────────────────────
   헬퍼 4: 그룹의 용희기한 역할 판정 (V2)
   ─────────────────────────────────────────
   기존 first-match 방식 제거.
   그룹 내 십신별 rankedScore + roleAdj를 vectors 비중으로 가중 평균 후 최종 역할 반환.
   예) 正官=용신(score 80) / 偏官=한신(score 25) → 관성 전체가 무조건 용신이 되지 않음.
───────────────────────────────────────── */
function getGroupRole(grp, gods, vectors, GROUP_MAP) {
  const tgs = GROUP_MAP[grp];

  // 각 십신별 역할 매핑
  function getTgRole(tg) {
    if ((gods.yong?.tenGods || []).includes(tg)) return "용신";
    if ((gods.hee?.tenGods  || []).includes(tg)) return "희신";
    if ((gods.gi?.tenGods   || []).includes(tg)) return "기신";
    if ((gods.han?.tenGods  || []).includes(tg)) return "한신";
    return "중립";
  }

  // roleAdj: 역할별 보정값
  const ROLE_ADJ = { 용신:20, 희신:8, 중립:0, 기신:-8, 한신:-20 };

  // ranked에서 해당 tg의 score 조회
  const rankedMap = {};
  (gods.ranked || []).forEach(item => { rankedMap[item.tg] = item.score; });

  let weightedSum = 0;
  let totalWeight = 0;

  tgs.forEach(tg => {
    const rankedScore = rankedMap[tg] ?? 50;       // ranked에 없으면 중립 기준 50
    const role        = getTgRole(tg);
    const roleAdj     = ROLE_ADJ[role] ?? 0;
    const weight      = (vectors?.tenGods?.[tg] || 0) > 0
                        ? (vectors.tenGods[tg])
                        : 0.25;                     // 원국에 없는 십신은 약한 기본값으로 개입 최소화

    weightedSum += (rankedScore + roleAdj) * weight;
    totalWeight += weight;
  });

  const groupScore = totalWeight > 0 ? weightedSum / totalWeight : 50;

  if (groupScore >= 68) return "용신";
  if (groupScore >= 56) return "희신";
  if (groupScore <= 32) return "한신";
  if (groupScore <= 44) return "기신";
  return "중립";
}

/* ─────────────────────────────────────────
   헬퍼 5: 그룹별 help/risk 추출
───────────────────────────────────────── */
function getGroupHelpRisk(grp, helpRisk, GROUP_MAP) {
  const tgs = GROUP_MAP[grp];
  let help = 0, risk = 0, cnt = 0;
  tgs.forEach(tg => {
    if (helpRisk.tenGod.help[tg] !== undefined) {
      help += helpRisk.tenGod.help[tg];
      risk += helpRisk.tenGod.risk[tg];
      cnt++;
    }
  });
  if (cnt === 0) return { help:0, risk:0 };
  return { help: help / cnt, risk: risk / cnt };
}

/* ─────────────────────────────────────────
   메인: computeResourceScores (V2)
───────────────────────────────────────── */
function computeResourceScores(state) {
  const D       = window.SajuData;
  const pillars = state.pillars;
  const dayStem = pillars.day.stem;
  const gods    = state.gods;
  const vectors = state.vectors;
  const strength  = state.strength;
  const geok      = state.geok;
  const interactions = state.interactions;

  const GROUPS = ["비겁","식상","재성","관성","인성"];
  const GROUP_MAP = {
    비겁: ["比肩","劫財"], 식상: ["食神","傷官"],
    재성: ["偏財","正財"], 관성: ["偏官","正官"], 인성: ["偏印","正印"],
  };

  // ── 위치별 가중치 (V2)
  const STEM_W   = { year:0.85, month:1.25, hour:0.95 };
  const BRANCH_W = { year:0.90, month:1.35, day:1.15, hour:1.00 };
  const ROOT_POS_W = { year:0.8, month:1.6, day:1.3, hour:1.0 };
  const MONTH_HIDDEN_BOOST = 1.15;

  const amountRaw = { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0 };
  const rootPower = { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0 };
  const stemPower = { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0 };

  // ── STEP 1a: 표면 천간 (연/월/시 — 일간 제외)
  [
    { stem: pillars.year.stem,  pos:"year"  },
    { stem: pillars.month.stem, pos:"month" },
    { stem: pillars.hour.stem,  pos:"hour"  },
  ].forEach(({ stem, pos }) => {
    if (!stem) return;
    const ss  = getShishen(dayStem, stem);
    const grp = GROUPS.find(g => GROUP_MAP[g].includes(ss));
    if (!grp) return;
    amountRaw[grp] += STEM_W[pos];
    stemPower[grp] += STEM_W[pos];
  });

  // ── STEP 1b: 지장간 (HIDDEN_STEMS_RATIO 기반 — V2 핵심 변경)
  [
    { branch: pillars.year.branch,  pos:"year",  isMonth:false },
    { branch: pillars.month.branch, pos:"month", isMonth:true  },
    { branch: pillars.day.branch,   pos:"day",   isMonth:false },
    { branch: pillars.hour.branch,  pos:"hour",  isMonth:false },
  ].forEach(({ branch, pos, isMonth }) => {
    (D.HIDDEN_STEMS_RATIO[branch] || []).forEach(({ stem, ratio }) => {
      const ss  = getShishen(dayStem, stem);
      const grp = GROUPS.find(g => GROUP_MAP[g].includes(ss));
      if (!grp) return;
      const base = ratio * BRANCH_W[pos];
      amountRaw[grp] += isMonth ? base * MONTH_HIDDEN_BOOST : base;
      rootPower[grp] += ratio * ROOT_POS_W[pos];
    });
  });

  // ── STEP 2: 축별 보정 계산
  const monthPower  = {};
  const structureAdj = {};
  const rootNorm    = {};
  const stemNorm    = {};
  const effectiveRaw = {};

  GROUPS.forEach(g => {
    monthPower[g]   = getAxisMonthPower(g, pillars, dayStem, D);
    rootNorm[g]     = Math.min(rootPower[g] / 2.2, 1.0);
    stemNorm[g]     = Math.min(stemPower[g] / 2.0, 1.0);
    structureAdj[g] = getAxisStructureAdj(g, geok, interactions, pillars, dayStem, D);

    const coeff = getAxisCoeff(g, strength);
    effectiveRaw[g] =
      amountRaw[g]
      * monthPower[g]
      * (1 + coeff.root * rootNorm[g])
      * (1 + coeff.stem * stemNorm[g])
      * (1 + structureAdj[g]);
  });

  // 재성은 식상 연결 보너스 (식상이 재성을 生함)
  effectiveRaw["재성"] *= (1 + Math.min(0.12, effectiveRaw["식상"] * 0.06));

  // ── STEP 3: 점수화
  const totalEff = GROUPS.reduce((s,g) => s + effectiveRaw[g], 0) || 1;
  const maxEff   = Math.max(...GROUPS.map(g => effectiveRaw[g]), 0.01);

  const helpRisk = computeHelpRisk(state);

  // ── 상태 라벨
  function getStatus(score) {
    if (score >= 160) return "매우 강함";
    if (score >= 130) return "강한 편";
    if (score >= 100) return "보통";
    if (score >=  70) return "약한 편";
    return "매우 약함";
  }

  const DESCS = {
    비겁: "자기축 · 독립성 · 버티는 힘",
    식상: "표현력 · 생산성 · 발산력",
    재성: "현실감 · 자원 활용 · 결과화",
    관성: "규율 · 책임 · 구조 감각",
    인성: "이해력 · 흡수력 · 보호 자원",
  };

  const axes = GROUPS.map(g => {
    const shareRatio = effectiveRaw[g] / totalEff;
    const amountNorm = effectiveRaw[g] / maxEff;

    // 절대 강도 성분 (55~130)
    const amountScore = 55 + amountNorm * 75;
    // 상대 비중 성분 (-25~+25)
    const shareScore  = 40 + Math.tanh((shareRatio - 0.20) * 4.0) * 25;

    // 용희기한 보정
    const role    = getGroupRole(g, gods, vectors, GROUP_MAP);
    const roleAdj = { 용신:10, 희신:6, 중립:0, 기신:-8, 한신:-12 }[role] ?? 0;

    // help/risk 보정
    const { help, risk } = getGroupHelpRisk(g, helpRisk, GROUP_MAP);
    const effAdj = (help - risk) * 12;

    const score = _clamp(Math.round(amountScore + shareScore + roleAdj + effAdj), 20, 220);

    return {
      key:          g,
      score,
      status:       getStatus(score),
      role,
      desc:         DESCS[g],
      // 디버그용 상세값
      amountRaw:    _round2(amountRaw[g]),
      shareRatio:   _round3(shareRatio),
      rootPower:    _round2(rootPower[g]),
      stemPower:    _round2(stemPower[g]),
      monthPower:   _round2(monthPower[g]),
      structureAdj: _round2(structureAdj[g]),
      effectiveRaw: _round2(effectiveRaw[g]),
      help:         _round2(help),
      risk:         _round2(risk),
    };
  });

  const sorted    = [...axes].sort((a, b) => b.score - a.score);
  const strongest = sorted[0];
  const weakest   = sorted[sorted.length - 1];

  const summary = `${strongest.key}(${strongest.score}) 중심 · ${weakest.key}(${weakest.score}) 보완 필요`;

  console.log("🎯 [V2] 5축 자원 점수:",
    axes.map(a => `${a.key}:${a.score}(${a.role}) eff=${a.effectiveRaw}`).join(" ")
  );

  return {
    axes, strongest, weakest, summary,
    debug: {
      totalAmountRaw:    _round2(GROUPS.reduce((s,g)=>s+amountRaw[g],0)),
      totalEffectiveRaw: _round2(totalEff),
    }
  };
}



/* =========================================================
   Export
   ========================================================= */
/* =========================================================
   대운 완전 재계산용 확장 state 빌더
   ─────────────────────────────────────────────────────────
   basePillars  : 원국 4주 (year/month/day/hour)
   extraPillar  : { stem, branch, label:"대운" }
   반환         : 대운 포함 완전 재계산 state
     - vectors    : 원국 + 대운 천간·지장간 합산
     - strength   : 월령 기준은 원국 월지, 통근·투간은 대운 포함 재계산
     - geok       : 격 주체는 원국 월지, purity·broken은 대운 포함 재판정
     - interactions: 원국 4지 + 대운 지지 기준 합충형파해 전체 재검출
     - gods       : 위 4개 재계산 결과로 용희기한 재판정
   ========================================================= */
function buildExtendedStateWithExtraPillar(basePillars, extraPillar) {
  const D       = window.SajuData;
  const dayStem = basePillars.day.stem;
  const dayEl   = D.WUXING_STEM[dayStem];

  /* ── 1. vectors: 원국 벡터 + 대운 천간·지장간 추가 반영 */
  const baseVec  = calculateVectors(basePillars);
  const elements = { ...baseVec.elements };
  const tenGods  = { ...baseVec.tenGods };

  // 대운 천간
  const eEl = D.WUXING_STEM[extraPillar.stem];
  if (eEl) elements[eEl] = (elements[eEl] || 0) + 1.0;
  const eSS = getShishen(dayStem, extraPillar.stem);
  if (eSS) tenGods[eSS] = (tenGods[eSS] || 0) + 1.0;

  // 대운 지장간 (HIDDEN_STEMS_RATIO 기반)
  (D.HIDDEN_STEMS_RATIO[extraPillar.branch] || []).forEach(({ stem, ratio }) => {
    const el = D.WUXING_STEM[stem];
    if (el) elements[el] = (elements[el] || 0) + ratio;
    const ss = getShishen(dayStem, stem);
    if (ss) tenGods[ss] = (tenGods[ss] || 0) + ratio;
  });

  const vectors = { ...baseVec, elements, tenGods,
    baseVectors: baseVec.baseVectors, flowVectors: baseVec.flowVectors };

  /* ── 2. strength: 월령 기준 원국 월지, 통근·투간은 대운 포함 재계산 */
  function calcExtendedStrength() {
    const monthBranch = basePillars.month.branch;

    // 월령 점수 — 원국 월지 기준 (변경 없음)
    function seasonScore() {
      const season = D.SEASON_MAP[monthBranch];
      if (!season) return 0;
      const se = D.SEASON_ELEMENT[season];
      if (se === dayEl)                              return 18;
      if (D.WUXING_GENERATES[se]    === dayEl)      return 10;
      if (D.WUXING_GENERATES[dayEl] === se)         return -8;
      if (D.WUXING_CONTROLS[se]     === dayEl)      return -14;
      if (D.WUXING_CONTROLS[dayEl]  === se)         return -6;
      return 0;
    }

    // 통근 점수 — 원국 4지 + 대운 지지 포함
    function rootScore() {
      const slots = [
        { branch: basePillars.year.branch,  w: 0.8  },
        { branch: basePillars.month.branch, w: 1.6  },
        { branch: basePillars.day.branch,   w: 1.3  },
        { branch: basePillars.hour.branch,  w: 1.0  },
        { branch: extraPillar.branch,       w: 0.85 }, // 대운 지지 (약간 낮은 가중)
      ];
      let total = 0;
      slots.forEach(({ branch, w }) => {
        (D.HIDDEN_STEMS_RATIO[branch] || []).forEach(({ stem, ratio }) => {
          const se = D.WUXING_STEM[stem];
          if (!se) return;
          if (se === dayEl)                              total += ratio * 14 * w;
          else if (D.WUXING_GENERATES[se]    === dayEl) total += ratio * 10 * w;
          else if (D.WUXING_GENERATES[dayEl] === se)    total -= ratio *  6 * w;
          else if (D.WUXING_CONTROLS[se]     === dayEl) total -= ratio *  9 * w;
          else if (D.WUXING_CONTROLS[dayEl]  === se)    total -= ratio *  5 * w;
        });
      });
      return total;
    }

    // 투간 점수 — 원국 연/월/시 천간 + 대운 천간 포함
    function stemScore() {
      let s = 0;
      [basePillars.year.stem, basePillars.month.stem, basePillars.hour.stem,
       extraPillar.stem].forEach(stem => {
        const se = D.WUXING_STEM[stem];
        if (!se) return;
        if (se === dayEl)                              s += 4;
        else if (D.WUXING_GENERATES[se]    === dayEl) s += 3;
        else if (D.WUXING_GENERATES[dayEl] === se)    s -= 2;
        else if (D.WUXING_CONTROLS[se]     === dayEl) s -= 3;
        else if (D.WUXING_CONTROLS[dayEl]  === se)    s -= 1;
      });
      return s;
    }

    const ss  = seasonScore();
    const rs  = rootScore();
    const sts = stemScore();
    const total = 50 + ss + rs + sts;
    const label = total >= 66 ? "신강" : total >= 36 ? "중화" : "신약";
    return { score: total, label, breakdown: { season: ss, root: rs, stem: sts } };
  }

  const strength = calcExtendedStrength();

  /* ── 3. geok: 격 주체는 원국 월지, purity·broken은 대운 포함 재판정 */
  // determineGeok()에 mergedPillars(대운 기둥 포함) 전달 → 투출/충 판단에 대운 반영
  const mergedPillars = {
    ...basePillars,
    daeun: { stem: extraPillar.stem, branch: extraPillar.branch }
  };
  const geok = determineGeok(basePillars, vectors);
  // 대운 천간이 격의 투출에 영향: extraPillar.stem이 月지 정기의 십신과 일치하면 purity 소폭 +
  const monthHiddenPrimary = (D.HIDDEN_STEMS_RATIO[basePillars.month.branch] || [])[0];
  if (monthHiddenPrimary) {
    const mPrimSS = getShishen(dayStem, monthHiddenPrimary.stem);
    const daeunSS = getShishen(dayStem, extraPillar.stem);
    if (mPrimSS && daeunSS === mPrimSS) {
      geok.purity = Math.min(1.0, geok.purity + 0.08); // 대운 천간 투출 보정
    }
    // 대운 지지와 월지 충 여부 → purity 감점
    for (const [a, b] of D.EARTHLY_CLASHES) {
      if ((a === basePillars.month.branch && b === extraPillar.branch) ||
          (b === basePillars.month.branch && a === extraPillar.branch)) {
        geok.purity  = Math.max(0.1, geok.purity - 0.15);
        geok.broken  = true;
      }
    }
  }

  /* ── 4. interactions: 원국 4지 + 대운 지지 기준 전체 재검출 */
  const interactions = detectInteractionsExtended(basePillars, extraPillar);

  /* ── 5. gods: 위 4개 기준으로 용희기한 완전 재판정 */
  const gods = classifyYongHeeGiHan({
    pillars: mergedPillars, vectors, strength, geok, interactions
  });

  return { pillars: mergedPillars, vectors, strength, geok, gods, interactions };
}

/* ─────────────────────────────────────────
   원국 4주 + 대운 1기둥 기준 합충형파해 전체 재검출
   (detectInteractions의 확장판 — 대운 천간/지지 포함)
───────────────────────────────────────── */
function detectInteractionsExtended(basePillars, extraPillar) {
  const D = window.SajuData;
  const interactions = { 합:[], 충:[], 형:[], 파:[], 해:[], criticalHits:[] };

  const stems    = [basePillars.year.stem, basePillars.month.stem,
                    basePillars.day.stem,  basePillars.hour.stem,
                    extraPillar.stem];
  const branches = [basePillars.year.branch, basePillars.month.branch,
                    basePillars.day.branch,  basePillars.hour.branch,
                    extraPillar.branch];
  const KEY = [basePillars.month.branch, basePillars.day.branch];

  function isCritical(bs) { return bs.some(b => KEY.includes(b)); }

  // 천간오합 (대운 천간 포함)
  for (const [a, b] of D.HEAVENLY_COMBINATIONS) {
    if (stems.includes(a) && stems.includes(b))
      interactions.합.push({ type:"천간오합", stems:[a,b] });
  }
  // 지지 육합
  for (const [a, b] of D.EARTHLY_SIX_COMBINATIONS) {
    if (branches.includes(a) && branches.includes(b))
      interactions.합.push({ type:"육합", branches:[a,b] });
  }
  // 지지 삼합
  for (const g of D.EARTHLY_THREE_COMBINATIONS) {
    const cnt = branches.filter(b => g.branches.includes(b)).length;
    if (cnt >= 2) interactions.합.push({
      type: cnt === 3 ? "삼합완성" : "삼합반합",
      branches: g.branches, element: g.element
    });
  }
  // 지지 충
  for (const [a, b] of D.EARTHLY_CLASHES) {
    if (branches.includes(a) && branches.includes(b)) {
      const critical = isCritical([a,b]);
      interactions.충.push({ type:"충", branches:[a,b], critical });
      if (critical) interactions.criticalHits.push(`충: ${a}↔${b}`);
    }
  }
  // 형 (삼형 / 상형 / 자형)
  for (const grp of [["寅","巳","申"],["丑","戌","未"]]) {
    const hits = grp.filter(b => branches.includes(b));
    if (hits.length >= 2) {
      const critical = isCritical(hits);
      interactions.형.push({ type:"삼형", branches:hits, critical });
      if (critical) interactions.criticalHits.push(`삼형: ${hits.join("↔")}`);
    }
  }
  for (const [a, b] of [["子","卯"]]) {
    if (branches.includes(a) && branches.includes(b)) {
      const critical = isCritical([a,b]);
      interactions.형.push({ type:"상형", branches:[a,b], critical });
      if (critical) interactions.criticalHits.push(`상형: ${a}↔${b}`);
    }
  }
  for (const jb of ["辰","午","酉","亥"]) {
    if (branches.filter(x => x === jb).length >= 2) {
      const critical = isCritical([jb,jb]);
      interactions.형.push({ type:"자형", branches:[jb,jb], critical });
      if (critical) interactions.criticalHits.push(`자형: ${jb}${jb}`);
    }
  }
  // 파
  for (const [a, b] of [["子","酉"],["卯","午"],["辰","丑"],["未","戌"],["寅","亥"],["巳","申"]]) {
    if (branches.includes(a) && branches.includes(b)) {
      const critical = isCritical([a,b]);
      interactions.파.push({ type:"파", branches:[a,b], critical });
      if (critical) interactions.criticalHits.push(`파: ${a}↔${b}`);
    }
  }
  // 해
  for (const [a, b] of [["子","未"],["丑","午"],["寅","巳"],["卯","辰"],["申","亥"],["酉","戌"]]) {
    if (branches.includes(a) && branches.includes(b)) {
      const critical = isCritical([a,b]);
      interactions.해.push({ type:"해", branches:[a,b], critical });
      if (critical) interactions.criticalHits.push(`해: ${a}↔${b}`);
    }
  }

  return interactions;
}

/* =========================================================
   대운 3축 평가 엔진 (범용형)
   ─────────────────────────────────────────────────────────
   performanceScore : 성과·실행력·결과화 가능성  (0~100)
   frictionScore    : 마찰·소모·구조 교란       (0~100, 높을수록 나쁨)
   supportScore     : 버티는 힘·회복력·기반 안정 (0~100)
   overallScore     : 3축 조합 최종 점수          (0~100)

   ⚠️ 특정 나이/간지/명식/사용자 예외 처리 없음
   ⚠️ 모든 점수는 mergedState(대운 완전 재계산) 기반으로만 산출
   ========================================================= */

/* ─────────────────────────────────────────
   성과축 실행 가능성 평가 헬퍼
   evaluatePerformanceViability(mergedState, baseState)
   ─────────────────────────────────────────
   목적: "신약이어도 성과가 실제로 발현되는가"를
         투출·통근·보조축·구조 손상을 종합해 0~100으로 수치화
   ⚠️ 특정 일주/간지/명식 분기 없음 — 구조 변화량만 판단
───────────────────────────────────────── */
function evaluatePerformanceViability(mergedState, baseState) {
  const D        = window.SajuData;
  const { vectors, gods, geok, strength, interactions, pillars } = mergedState;
  const dayStem  = pillars.day?.stem;
  const totalTG  = Object.values(vectors.tenGods).reduce((a,b) => a+b, 0) || 1;

  const PERF_TG  = ["食神","傷官","偏財","正財","偏官","正官"];
  const SUPP_TG  = ["正印","偏印","比肩","正官"]; // 성과축을 받쳐주는 안정축

  // A. 성과축 절대량
  let perfAmount = 0;
  PERF_TG.forEach(tg => { perfAmount += (vectors.tenGods[tg] || 0); });
  const perfRatio = perfAmount / totalTG;
  const absScore  = Math.min(perfRatio / 0.45, 1.0) * 30; // 최대 30점

  // B. 성과축 변화량 (baseState 있을 때)
  let perfAxisDelta = 0, deltaScore = 0;
  if (baseState) {
    const baseTotalTG = Object.values(baseState.vectors.tenGods).reduce((a,b) => a+b, 0) || 1;
    let perfBase = 0;
    PERF_TG.forEach(tg => { perfBase += (baseState.vectors.tenGods[tg] || 0); });
    perfAxisDelta = (perfAmount / totalTG) - (perfBase / baseTotalTG);
    deltaScore    = _clamp(perfAxisDelta * 60, -8, 16);
  }

  // C. 투출 (성과축 천간이 드러나 있는가) — 연/월/시간 체크
  let exposedCount = 0;
  const stemSlots = [pillars.year?.stem, pillars.month?.stem, pillars.hour?.stem,
                     pillars.daeun?.stem].filter(Boolean);
  stemSlots.forEach(stem => {
    if (PERF_TG.includes(getShishen(dayStem, stem))) exposedCount++;
  });
  const exposedScore = Math.min(exposedCount * 8, 20); // 최대 20점

  // D. 통근 (성과축이 지장간에 뿌리를 가지는가)
  let rootedCount = 0;
  const branchSlots = [pillars.year?.branch, pillars.month?.branch,
                       pillars.day?.branch,  pillars.hour?.branch,
                       pillars.daeun?.branch].filter(Boolean);
  branchSlots.forEach(br => {
    const hs = D.HIDDEN_STEMS_RATIO[br] || [];
    hs.forEach(({ stem, ratio }) => {
      if (PERF_TG.includes(getShishen(dayStem, stem)) && ratio >= 0.25) rootedCount++;
    });
  });
  const rootedScore = Math.min(rootedCount * 6, 18); // 최대 18점

  // E. support carrier — 인성/비겁/정관이 성과축을 받쳐주는가
  let supportCarrier = 0;
  SUPP_TG.forEach(tg => { supportCarrier += (vectors.tenGods[tg] || 0); });
  const suppRatio   = supportCarrier / totalTG;
  // 0.20~0.45 사이에서 support carrier 가장 효과적
  const suppScore   = suppRatio >= 0.20 && suppRatio <= 0.45
    ? 14
    : suppRatio > 0 ? _clamp(suppRatio / 0.20, 0, 1) * 10 : 0;

  // F. 구조 손상 (structuralPenalty)
  // "성과축 뿌리 직접 타격 + broken + recovery 없음"일 때만 강하게
  let structuralPenalty = 0;
  if (geok.broken && !geok.recovery) structuralPenalty += 8;
  interactions.충.forEach(c => {
    if (!c.critical) return;
    // 충으로 인한 성과축 뿌리 직접 타격 여부
    const directHit = (c.branches || []).some(br => {
      const hs = D.HIDDEN_STEMS_RATIO[br] || [];
      return hs.some(({ stem }) => PERF_TG.includes(getShishen(dayStem, stem)));
    });
    if (directHit) structuralPenalty += 6;
    else           structuralPenalty += 2; // critical이지만 성과축 직접 타격 아님
  });
  structuralPenalty = Math.min(structuralPenalty, 22);

  // 종합 viabilityScore (0~100)
  const raw = absScore + deltaScore + exposedScore + rootedScore + suppScore - structuralPenalty;
  const viabilityScore = Math.round(_clamp(raw + 20, 0, 100)); // +20: 기본 베이스

  const isViable = viabilityScore >= 55;

  return {
    viabilityScore,
    perfAxisDelta,
    exposedCount,
    rootedCount,
    supportCarrier: suppRatio,
    structuralPenalty,
    isViable,
    // 내부 점수 (debug용)
    _parts: { absScore, deltaScore, exposedScore, rootedScore, suppScore, structuralPenalty }
  };
}

/* ─────────────────────────────────────────
   [A] 성과 점수 (performanceScore)
   "결과가 나는가"
   절대량 + 변화량 + 실행가능성(viability) + 구조상태
   ⚠️ godsBonus 의존도 축소 (18/8 → 10/4)
   ⚠️ viabilityBonus 독립 계층 추가
   ⚠️ strengthPenalty 조건부 완화
   ⚠️ 특정 사용자/나이/간지 예외 없음
───────────────────────────────────────── */
function scoreDaeunPerformance(mergedState, baseState) {
  const D       = window.SajuData;
  const { vectors, gods, geok, strength } = mergedState;
  const totalTG = Object.values(vectors.tenGods).reduce((a,b) => a+b, 0) || 1;

  // ── [A] 성과축 절대량
  const PERF_TG = ["食神","傷官","偏財","正財","偏官","正官"];
  let perfAmount = 0;
  PERF_TG.forEach(tg => { perfAmount += (vectors.tenGods[tg] || 0); });
  const perfRatio = perfAmount / totalTG;
  const perfA = perfRatio >= 0.25 && perfRatio <= 0.55
    ? 30
    : perfRatio < 0.25
      ? 30 * (perfRatio / 0.25)
      : 30 * (1 - (perfRatio - 0.55) / 0.45);

  // ── [B] 용/희 성과축 보너스 (godsBonus 비중 축소: 18/8 → 10/4)
  const PERF_FAMILY = ["식상","재성","관성"];
  const _toFam = tg => {
    if (["食神","傷官"].includes(tg)) return "식상";
    if (["偏財","正財"].includes(tg)) return "재성";
    if (["偏官","正官"].includes(tg)) return "관성";
    return null;
  };
  const yongFam = (gods.yong?.ranked || []).map(r => _toFam(r.tg)).filter(Boolean);
  const heeFam  = (gods.hee?.ranked  || []).map(r => _toFam(r.tg)).filter(Boolean);

  let yongHeeBonusLite = 0;
  if (yongFam.some(f => PERF_FAMILY.includes(f))) yongHeeBonusLite += 10; // 18 → 10
  if (heeFam.some(f => PERF_FAMILY.includes(f)))  yongHeeBonusLite += 4;  //  8 →  4

  const giTGs  = gods.gi?.tenGods  || [];
  const hanTGs = gods.han?.tenGods || [];
  let godsNeg = 0;
  [...giTGs, ...hanTGs].forEach(tg => {
    if (PERF_TG.includes(tg)) godsNeg += Math.min((vectors.tenGods[tg] || 0) * 2.0, 6);
  });
  yongHeeBonusLite = Math.max(0, yongHeeBonusLite - godsNeg);

  // ── [C] 格 동적 상태 보너스 (purity/recovery/broken 변화)
  const geokBase    = geok.purity * 18;
  const geokAdj     = geok.broken && !geok.recovery ? -7 : geok.recovery ? 5 : 0;
  const geokDynamicBonus = Math.max(0, geokBase + geokAdj);

  // ── [D] 실행 가능성 (viability) — 독립 계층
  const viab = evaluatePerformanceViability(mergedState, baseState);
  const viabilityBonus = _clamp((viab.viabilityScore - 50) * 0.35, -10, 20);

  // ── [E] 변화량 (delta) — baseState 있을 때
  let perfDelta         = 0;
  let perfDeltaBonus    = 0;
  let purityDelta       = 0;
  let purityDeltaBonus  = 0;
  let recoveryTransBonus = 0;

  if (baseState) {
    const baseVectors = baseState.vectors;
    const baseTotalTG = Object.values(baseVectors.tenGods).reduce((a,b) => a+b, 0) || 1;
    let perfNow = 0, perfBase = 0;
    PERF_TG.forEach(tg => {
      perfNow  += (vectors.tenGods[tg]    || 0);
      perfBase += (baseVectors.tenGods[tg] || 0);
    });
    perfDelta      = (perfNow / totalTG) - (perfBase / baseTotalTG);
    perfDeltaBonus = _clamp(perfDelta * 35, -6, 14); // 이전 40 → 35 (viability가 흡수)

    purityDelta      = geok.purity - (baseState.geok?.purity ?? geok.purity);
    purityDeltaBonus = _clamp(purityDelta * 24, -6, 10);

    const wasRecovery = baseState.geok?.recovery ?? false;
    const wasBroken   = baseState.geok?.broken   ?? false;
    if (!wasRecovery && geok.recovery) recoveryTransBonus += 6;
    if (wasBroken    && !geok.broken)  recoveryTransBonus += 4;
  }

  // ── [F] strengthPenalty — viability 충분하면 조건부 완화
  const ss = strength.score;
  let strengthPenalty = 0;
  if (ss < 28) {
    // viabilityScore >= 65: 발현 조건 충분 → 패널티 소폭
    // viabilityScore < 65: 구조도 약함 → 패널티 유지
    strengthPenalty = viab.viabilityScore >= 65 ? 2 : 6;
  } else if (ss < 36) {
    strengthPenalty = viab.viabilityScore >= 60 ? 0 : 3;
  }

  // ── [G] destructivePenalty — 성과축 뿌리 직접 타격 + recovery 없음 + purity 하락 삼중 조건
  let destructivePenalty = 0;
  const purityDrop = baseState
    ? Math.max(0, (baseState.geok?.purity ?? geok.purity) - geok.purity)
    : 0;
  if (viab.structuralPenalty >= 14 && geok.broken && !geok.recovery && purityDrop > 0.05) {
    destructivePenalty = _clamp(viab.structuralPenalty * 0.6, 0, 14);
  }

  const raw = perfA
    + yongHeeBonusLite
    + geokDynamicBonus
    + viabilityBonus
    + perfDeltaBonus
    + purityDeltaBonus
    + recoveryTransBonus
    - strengthPenalty
    - destructivePenalty;

  // debug
  mergedState._perfDebug = {
    perfDelta, purityDelta,
    perfDeltaBonus, purityDeltaBonus, recoveryTransBonus,
    viabilityScore:   viab.viabilityScore,
    exposedCount:     viab.exposedCount,
    rootedCount:      viab.rootedCount,
    supportCarrier:   viab.supportCarrier.toFixed(3),
    structuralPenalty: viab.structuralPenalty,
    strengthPenalty,
    yongHeeBonusLite,
    destructivePenalty,
    isViable: viab.isViable,
  };

  return Math.round(_clamp(raw, 0, 100));
}

/* ─────────────────────────────────────────
   [B] 마찰 점수 (frictionScore)
   "소모·충돌·불안정" — 높을수록 마찰 큼 (0~100)
   ⚠️ productive restructuring 판정 범위 확대
   ⚠️ baseState 추가: 구조 개선 여부로 destructive/productive 분리
   ⚠️ 특정 사용자/나이/간지 예외 없음
───────────────────────────────────────── */
function scoreDaeunFriction(mergedState, baseState) {
  const { vectors, gods, geok, strength, interactions } = mergedState;
  const totalTG = Object.values(vectors.tenGods).reduce((a,b) => a+b, 0) || 1;

  const yongTGs = gods.yong?.tenGods || [];
  const heeTGs  = gods.hee?.tenGods  || [];
  const giTGs   = gods.gi?.tenGods   || [];
  const hanTGs  = gods.han?.tenGods  || [];

  // ── productive restructuring 판정 (2개 이상이면 productive)
  // 특정 간지/명식 예외 없이 구조 변화 지표만 봄
  let productiveCount = 0;
  let strengthDelta = 0, purityDelta2 = 0, perfAxisDelta = 0;

  if (baseState) {
    strengthDelta = strength.score - (baseState.strength?.score ?? strength.score);
    purityDelta2  = geok.purity    - (baseState.geok?.purity   ?? geok.purity);

    // 조건 1: geok.recovery 신규 획득
    if (geok.recovery && !(baseState.geok?.recovery)) productiveCount++;
    // 조건 2: purity 의미 있게 상승
    if (purityDelta2 > 0.08) productiveCount++;
    // 조건 3: strength가 중화(51) 방향으로 개선
    const baseDistToMid = Math.abs((baseState.strength?.score ?? 50) - 51);
    const nowDistToMid  = Math.abs(strength.score - 51);
    if (strengthDelta > 0 && nowDistToMid < baseDistToMid) productiveCount++;
    // 조건 4: 성과축 총량 증가
    const PERF_TG_F = ["食神","傷官","偏財","正財","偏官","正官"];
    const baseVectors = baseState.vectors;
    const baseTotalTG = Object.values(baseVectors.tenGods).reduce((a,b) => a+b, 0) || 1;
    let perfNow2 = 0, perfBase2 = 0;
    PERF_TG_F.forEach(tg => {
      perfNow2  += (vectors.tenGods[tg]    || 0);
      perfBase2 += (baseVectors.tenGods[tg] || 0);
    });
    perfAxisDelta = (perfNow2 / totalTG) - (perfBase2 / baseTotalTG);
    if (perfAxisDelta > 0.04) productiveCount++;
    // 조건 5: 성과축 십신이 용/희로 신규 편입
    const PERF_TG_SET = new Set(["食神","傷官","偏財","正財","偏官","正官"]);
    const nowPerfInYongHee = [...yongTGs, ...heeTGs].some(t => PERF_TG_SET.has(t));
    const basePerfInYongHee = [
      ...(baseState.gods?.yong?.tenGods || []),
      ...(baseState.gods?.hee?.tenGods  || [])
    ].some(t => PERF_TG_SET.has(t));
    if (nowPerfInYongHee && !basePerfInYongHee) productiveCount++;
    // 조건 6: geok.recovery 있거나 purity 상승으로 broken 해소
    if (geok.recovery || (!geok.broken && baseState.geok?.broken)) productiveCount++;
  } else {
    // baseState 없을 때: 기존 단순 판정
    if (geok.recovery || (yongTGs.length > 0 && (vectors.tenGods[yongTGs[0]] || 0) > 1.2)) {
      productiveCount = 2; // threshold 충족 간주
    }
  }

  const isProductive = productiveCount >= 2;

  // ── 충 평가
  let frictionRaw = 0;
  interactions.충.forEach(c => {
    const base = c.critical ? 12 : 6;
    // destructive: 용신/희신 뿌리가 직접 타격 받는 경우만 강하게
    const yongHeeHit = [...yongTGs, ...heeTGs].some(tg => {
      // 해당 십신의 지장간이 충에 걸린 지지에 있는지 확인
      const branches = c.branches || [];
      return branches.some(br => {
        const hs = window.SajuData.HIDDEN_STEMS_RATIO[br] || [];
        return hs.some(({ stem }) => getShishen(mergedState.pillars.day?.stem, stem) === tg);
      });
    });
    if (isProductive) {
      frictionRaw += base * 0.25; // productive: 크게 완화
    } else if (!yongHeeHit) {
      frictionRaw += base * 0.70; // 용희 타격 없으면 중간
    } else {
      frictionRaw += base;        // 용희 뿌리 직접 타격만 full
    }
  });

  // 형 평가
  interactions.형.forEach(c => {
    const base = c.critical ? 6 : 3.5;
    frictionRaw += isProductive ? base * 0.55 : base;
  });

  // 파/해 (강도 낮음)
  interactions.파.forEach(c => {
    frictionRaw += isProductive ? (c.critical ? 1.2 : 0.7) : (c.critical ? 3 : 1.8);
  });
  interactions.해.forEach(c => {
    frictionRaw += isProductive ? (c.critical ? 0.8 : 0.5) : (c.critical ? 2 : 1.2);
  });

  // 합 완화 (productive면 완화 상한 소폭 상향)
  const hapRelief = isProductive
    ? Math.min(interactions.합.length * 3.0, 10)
    : interactions.합.length * 2.5;
  frictionRaw -= hapRelief;

  // B. 기신/한신 활성 가산
  let giHanFriction = 0;
  [...giTGs, ...hanTGs].forEach(tg => {
    const v = vectors.tenGods[tg] || 0;
    if (v > 0.8) giHanFriction += Math.min(v * 3, 10);
  });

  // C. 극단 신강/신약 → friction 상승
  const ss = strength.score;
  const extremePenalty = ss <= 25 ? (25 - ss) * 0.5
                       : ss >= 78 ? (ss - 78) * 0.4
                       : 0;

  // D. 格 파괴 (broken + recover 없음)
  const geokFriction = geok.broken && !geok.recovery ? 10 : 0;

  const raw = Math.max(0, frictionRaw) + giHanFriction + extremePenalty + geokFriction;

  // debug용
  mergedState._fricDebug = { productiveCount, isProductive, strengthDelta, purityDelta2, perfAxisDelta };

  return Math.round(_clamp(raw, 0, 100));
}

/* ─────────────────────────────────────────
   [C] 기반 점수 (supportScore)
   "버티는 힘·회복력·안정감" (0~100)
   ⚠️ strengthDelta 민감도 상향 (0.3 → 0.6)
   ⚠️ 중화 접근 보너스 추가
   ⚠️ 안정축 용희 신규 편입 보너스 추가
   ⚠️ 특정 사용자/나이/간지 예외 없음
───────────────────────────────────────── */
function scoreDaeunSupport(mergedState, baseStrengthScore, baseState) {
  const D       = window.SajuData;
  const { vectors, gods, geok, strength, interactions } = mergedState;
  const totalTG = Object.values(vectors.tenGods).reduce((a,b) => a+b, 0) || 1;

  // A. strength 절대량 (중화 구간 최적)
  const ss = strength.score;
  const strengthBase =
    ss >= 40 && ss <= 62 ? 30
    : ss >= 30 ? 30 - Math.abs(ss - 51) * 0.4
    : 30 - (30 - ss) * 0.6;

  // B. strengthDelta — 민감도 상향 (0.3 → 0.6), 범위 확장 (-10, 16)
  const strengthDelta = ss - (baseStrengthScore || ss);
  const deltaBonus = _clamp(strengthDelta * 0.6, -10, 16);

  // C. 중화 접근 보너스 (baseState 있을 때만)
  let closenessBonus = 0;
  let stableShiftBonus = 0;
  let closenessGain = 0;

  if (baseState) {
    const baseDistToMid = Math.abs((baseState.strength?.score ?? ss) - 51);
    const nowDistToMid  = Math.abs(ss - 51);
    closenessGain  = baseDistToMid - nowDistToMid;
    closenessBonus = _clamp(closenessGain * 0.8, -4, 10);

    // D. 안정축 용/희 신규 편입 보너스
    const STABLE_TG_SET = new Set(["正印","偏印","比肩","正官"]);
    const nowStableInYongHee = [
      ...(gods.yong?.tenGods || []),
      ...(gods.hee?.tenGods  || [])
    ].filter(t => STABLE_TG_SET.has(t));
    const baseStableInYongHee = [
      ...(baseState.gods?.yong?.tenGods || []),
      ...(baseState.gods?.hee?.tenGods  || [])
    ].filter(t => STABLE_TG_SET.has(t));
    const newlyAdded = nowStableInYongHee.filter(t => !baseStableInYongHee.includes(t));
    stableShiftBonus = _clamp(newlyAdded.length * 4, 0, 8);
  }

  // E. 인성/비겁 절대량 (적정 비율 구간)
  const SUPPORT_TG = ["正印","偏印","比肩","劫財"];
  let supportAmount = 0;
  SUPPORT_TG.forEach(tg => { supportAmount += (vectors.tenGods[tg] || 0); });
  const supportRatio = supportAmount / totalTG;
  const supportA = supportRatio >= 0.15 && supportRatio <= 0.40
    ? 20
    : supportRatio < 0.15
      ? 20 * (supportRatio / 0.15)
      : 20 * Math.max(0, 1 - (supportRatio - 0.40) / 0.30);

  // F. 용/희신 중 안정축 절대량
  const STABLE_TG = ["正印","偏印","比肩","正官"];
  const yongTGs = gods.yong?.tenGods || [];
  const heeTGs  = gods.hee?.tenGods  || [];
  let stableBonus = 0;
  [...yongTGs, ...heeTGs].forEach(tg => {
    if (STABLE_TG.includes(tg)) stableBonus += 7;
  });
  stableBonus = Math.min(stableBonus, 18);

  // G. 회복 신호 (합/격회복)
  const recoverBonus = geok.recovery ? 8 : 0;
  const hapBonus     = Math.min(interactions.합.length * 2, 8);

  const raw = strengthBase + deltaBonus + closenessBonus
            + supportA + stableBonus + stableShiftBonus
            + recoverBonus + hapBonus;

  // debug용
  mergedState._suppDebug = { strengthDelta, deltaBonus, closenessGain, closenessBonus, stableShiftBonus };

  return Math.round(_clamp(raw, 0, 100));
}

/* ─────────────────────────────────────────
   [D] 정규화 계층
   ─────────────────────────────────────────
   목적: raw 점수의 분포 중심(neutral)을 표시 50에 맞추는 범용 스케일 정상화.
   특정 사용자·나이·간지·명식 예외 처리 없음.
   각 함수의 기준점은 raw 산식의 이론적 중립 구간을 기준으로 설계.

   piecewise linear 보간 공통 헬퍼
───────────────────────────────────────── */
function _piecewiseLinear(raw, anchors) {
  // anchors: [[rawVal, displayVal], ...] 오름차순
  if (raw <= anchors[0][0]) return anchors[0][1];
  if (raw >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [r0, d0] = anchors[i];
    const [r1, d1] = anchors[i + 1];
    if (raw >= r0 && raw <= r1) {
      const t = (raw - r0) / (r1 - r0);
      return d0 + t * (d1 - d0);
    }
  }
  return anchors[anchors.length - 1][1];
}

/* ─────────────────────────────────────────
   [D-1] performance 정규화
   rawPerformance 내부 산식 구조:
     · perfA 최대 30 (perfRatio 최적 구간)
     · godsBonus 최대 26
     · geokScore 최대 ~24
     · strengthPenalty 소폭 감산
   → neutral 구간: raw 45~55, 하한 10~15, 상한 85~95
   → raw 50 → display 50 중심으로 정규화
───────────────────────────────────────── */
function normalizeDaeunPerformance(raw) {
  const anchors = [
    [  0, 10],
    [ 25, 22],
    [ 40, 40],
    [ 50, 50],
    [ 65, 68],
    [ 80, 85],
    [ 92, 95],
    [100, 98],
  ];
  return Math.round(_clamp(_piecewiseLinear(raw, anchors), 0, 100));
}

/* ─────────────────────────────────────────
   [D-2] support 정규화
   rawSupport 내부 산식 구조:
     · strengthBase 최대 30 (중화 구간)
     · supportA 최대 20
     · stableBonus 최대 18
     · recoverBonus/hapBonus 최대 16
   → neutral 구간: raw 45~60, 하한 15~20, 상한 80~90
   → raw 50 → display 50 중심
───────────────────────────────────────── */
function normalizeDaeunSupport(raw) {
  const anchors = [
    [  0, 10],
    [ 25, 22],
    [ 40, 40],
    [ 50, 50],
    [ 65, 70],
    [ 80, 88],
    [ 92, 95],
    [100, 98],
  ];
  return Math.round(_clamp(_piecewiseLinear(raw, anchors), 0, 100));
}

/* ─────────────────────────────────────────
   [D-3] friction 정규화
   rawFriction 내부 산식 구조:
     · 충 없고 합 있으면 raw 0~10 (마찰 없음)
     · 충 1~2개 + 기신 적당 → raw 20~35 (보통 마찰)
     · 충 많고 기신 강 → raw 45~65 (높은 마찰)
     · 극단 신약 + 격파괴 → raw 70+ (매우 높은 마찰)
   → raw 30 = 중간 마찰 → display 50
   → 마찰 낮으면 display 낮게(좋음), 높으면 display 높게(나쁨)
───────────────────────────────────────── */
function normalizeDaeunFriction(raw) {
  const anchors = [
    [  0,  8],
    [ 10, 20],
    [ 20, 35],
    [ 30, 50],
    [ 45, 62],
    [ 60, 78],
    [ 75, 90],
    [100, 98],
  ];
  return Math.round(_clamp(_piecewiseLinear(raw, anchors), 0, 100));
}

/* ─────────────────────────────────────────
   [D-4] 대운 종합 점수 조합 (편차 합산 방식 + profileName)
   ─────────────────────────────────────────
   공식 기본(overall):
     overall = 50 + 0.45*(p-50) + 0.30*(s-50) - 0.22*(f-50)

   money:  성과 가중 상향, 기반 하향
     overall = 50 + 0.55*(p-50) + 0.20*(s-50) - 0.20*(f-50)

   love:   기반 가중 상향, 성과 하향
     overall = 50 + 0.38*(p-50) + 0.34*(s-50) - 0.24*(f-50)

   원칙: neutral(모든 축 50) → overall = 50 보장 (편차 합산)
   특정 사용자/나이/간지 예외 없음 — profile은 전체 공통 기능
───────────────────────────────────────── */
function computeDaeunOverall(performanceScore, frictionScore, supportScore, profileName = "overall") {
  let p_w = 0.45, s_w = 0.30, f_w = 0.22;
  if (profileName === "money") { p_w = 0.55; s_w = 0.20; f_w = 0.20; }
  if (profileName === "love")  { p_w = 0.38; s_w = 0.34; f_w = 0.24; }
  const raw = 50
    + p_w * (performanceScore - 50)
    + s_w * (supportScore     - 50)
    - f_w * (frictionScore    - 50);
  return Math.round(_clamp(raw, 0, 100));
}

/* ─────────────────────────────────────────
   [E] 대운 3축 통합 계산 진입점
   흐름: raw → normalized → overall
   시그니처: (mergedState, baseStrengthScore, baseState, profileName)
───────────────────────────────────────── */
function computeDaeunScore(mergedState, baseStrengthScore, baseState, profileName = "overall") {
  // ① raw 계산 (baseState로 delta 반영)
  const rawPerformance = scoreDaeunPerformance(mergedState, baseState);
  const rawFriction    = scoreDaeunFriction(mergedState, baseState);
  const rawSupport     = scoreDaeunSupport(mergedState, baseStrengthScore, baseState);

  // ② 정규화 (neutral 50 기준 스케일 정상화)
  const performance = normalizeDaeunPerformance(rawPerformance);
  const friction    = normalizeDaeunFriction(rawFriction);
  const support     = normalizeDaeunSupport(rawSupport);

  // ③ 종합 점수 (편차 합산 + profile 가중치)
  const overall = computeDaeunOverall(performance, friction, support, profileName);

  // ④ debug 로그 (raw vs normalized, delta, profile 모두 출력)
  const pd = mergedState._perfDebug || {};
  const sd = mergedState._suppDebug || {};
  const fd = mergedState._fricDebug || {};
  console.debug("  🔢 [대운 raw→norm]",
    `rawPerf=${rawPerformance}→${performance}`,
    `rawSupp=${rawSupport}→${support}`,
    `rawFric=${rawFriction}→${friction}`,
    `overall=${overall} [${profileName}]`
  );
  console.debug("  📐 [delta]",
    `perfDelta=${pd.perfDelta?.toFixed(3)}`,
    `purityDelta=${pd.purityDelta?.toFixed(3)}`,
    `strengthDelta=${sd.strengthDelta}`,
    `closenessGain=${sd.closenessGain?.toFixed(1)}`,
    `productive=${fd.productiveCount}/${fd.isProductive}`,
    `profile=${profileName}`
  );

  return {
    overall, performance, friction, support,
    _raw: { rawPerformance, rawSupport, rawFriction },
    _debug: {
      perfDelta:      pd.perfDelta,
      purityDelta:    pd.purityDelta,
      strengthDelta:  sd.strengthDelta,
      closenessGain:  sd.closenessGain,
      productiveCount: fd.productiveCount,
      isProductive:   fd.isProductive,
      profileName,
    }
  };
}

window.SajuEngine = {
  calculateVectors,
  calculateStrength,
  determineGeok,
  scoreGeokIntegrity,
  classifyYongHeeGiHan,
  detectInteractions,
  detectInteractionsExtended,
  computeHelpRisk,
  computeTotalScore,
  buildState,
  buildExtendedStateWithExtraPillar,
  computeResourceScores,
  // 실행 가능성 헬퍼 (신약 성과 발현 판단)
  evaluatePerformanceViability,
  // raw 계산 (baseState delta 반영, 개인 예외 없음)
  scoreDaeunPerformance,   // (mergedState, baseState)
  scoreDaeunFriction,      // (mergedState, baseState)
  scoreDaeunSupport,       // (mergedState, baseStrengthScore, baseState)
  // normalize 계층 (스케일 정상화)
  normalizeDaeunPerformance,
  normalizeDaeunSupport,
  normalizeDaeunFriction,
  // 종합 (편차 합산 + profile 가중치)
  computeDaeunOverall,     // (p, f, s, profileName)
  computeDaeunScore,       // (mergedState, baseStrengthScore, baseState, profileName)
  PROFILE_PRESETS
};

console.log("✅ saju_engine.js 로드 완료");
