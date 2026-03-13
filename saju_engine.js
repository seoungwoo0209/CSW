/* =========================================================
   사주 엔진 (saju_engine.js) v2.0
   - A모드(자동): 기본 help/risk 계산
   - B모드(프리셋): 가중치로 점수 기울이기
   - 격(格) 판정, 용희기한, 신강약 계산
   ========================================================= */

console.log("🔥 saju_engine.js v2.0 로드");

/* =========================================================
   PART 0: 프리셋 정의 (B모드)
   ========================================================= */

const PROFILE_PRESETS = {
  overall: {
    label: "종합(자동 중심)",
    blendAlpha: 0.0,  // 프리셋 미사용
    weights: null
  },
  
  money: {
    label: "재물형",
    blendAlpha: 0.35,
    weights: {
      tenGod: {
        help: {
          "정재": 1.25, "편재": 1.25, "식신": 1.05, "상관": 1.05,
          "정관": 0.95, "편관": 0.95, "정인": 0.75, "편인": 0.75,
          "비견": 0.85, "겁재": 0.85
        },
        risk: {
          "정재": 1.05, "편재": 1.10, "식신": 1.10, "상관": 1.20,
          "정관": 1.05, "편관": 1.15, "정인": 0.85, "편인": 0.95,
          "비견": 1.05, "겁재": 1.15
        }
      },
      element: {
        help: { "목": 0.95, "화": 1.00, "토": 1.00, "금": 1.10, "수": 1.10 },
        risk: { "목": 0.95, "화": 1.00, "토": 1.00, "금": 1.10, "수": 1.10 }
      }
    }
  },
  
  leadership: {
    label: "직장/리더십형",
    blendAlpha: 0.35,
    weights: {
      tenGod: {
        help: {
          "정관": 1.25, "편관": 1.15, "정인": 1.00, "편인": 0.95,
          "식신": 0.95, "상관": 0.90, "정재": 0.90, "편재": 0.90,
          "비견": 1.05, "겁재": 1.05
        },
        risk: {
          "정관": 1.05, "편관": 1.15, "정인": 0.90, "편인": 1.00,
          "식신": 1.05, "상관": 1.20, "정재": 1.00, "편재": 1.05,
          "비견": 1.10, "겁재": 1.20
        }
      }
    }
  },
  
  stable: {
    label: "안정형",
    blendAlpha: 0.45,
    weights: {
      tenGod: {
        help: {
          "정인": 1.20, "편인": 1.05, "정관": 1.10, "편관": 1.00,
          "정재": 1.00, "편재": 0.95, "식신": 0.95, "상관": 0.80,
          "비견": 0.95, "겁재": 0.85
        },
        risk: {
          "상관": 1.35, "겁재": 1.30, "편재": 1.15, "편관": 1.15,
          "정재": 1.05, "정관": 1.05, "편인": 1.05, "정인": 0.95,
          "식신": 1.05, "비견": 1.05
        }
      }
    }
  }
};

/* =========================================================
   PART 1: 십신 판정
   ========================================================= */

/**
 * 일간 기준 대상 천간의 십신 판정
 */
function getShishen(dayStem, targetStem) {
  const dayElement = window.SajuData.WUXING_STEM[dayStem];
  const targetElement = window.SajuData.WUXING_STEM[targetStem];
  
  if (!dayElement || !targetElement) return null;
  
  const yangStems = ["甲", "丙", "戊", "庚", "壬"];
  const dayYang = yangStems.includes(dayStem);
  const targetYang = yangStems.includes(targetStem);
  const samePolarity = (dayYang === targetYang);
  
  if (dayElement === targetElement) {
    return samePolarity ? "比肩" : "劫財";
  }
  
  if (window.SajuData.WUXING_GENERATES[dayElement] === targetElement) {
    return samePolarity ? "食神" : "傷官";
  }
  
  if (window.SajuData.WUXING_CONTROLS[dayElement] === targetElement) {
    return samePolarity ? "偏財" : "正財";
  }
  
  if (window.SajuData.WUXING_CONTROLS[targetElement] === dayElement) {
    return samePolarity ? "偏官" : "正官";
  }
  
  if (window.SajuData.WUXING_GENERATES[targetElement] === dayElement) {
    return samePolarity ? "偏印" : "正印";
  }
  
  return null;
}

/* =========================================================
   PART 2: 오행/십신 벡터 계산
   ========================================================= */

/* =========================================================
   PART 2: 오행/십신 벡터 계산 [FIX v3 — 원국/대운 분리]
   - baseVectors: 원국 전용 → 능력 분석의 기본축
   - flowVectors: 원국+대운 → 운 분석용
   "사람 자체의 구조" ≠ "현재 운의 자극"
   ========================================================= */

function _buildVectors(dayStem, stemList, branchList) {
  const elements = { wood:0, fire:0, earth:0, metal:0, water:0 };
  const tenGods  = {
    "比肩":0,"劫財":0,"食神":0,"傷官":0,
    "偏財":0,"正財":0,"偏官":0,"正官":0,"偏印":0,"正印":0
  };
  stemList.forEach(stem => {
    const el = window.SajuData.WUXING_STEM[stem];
    if (el) elements[el] += 1.0;
    const ss = getShishen(dayStem, stem);
    if (ss) tenGods[ss] += 1.0;
  });
  branchList.forEach(branch => {
    const hs = window.SajuData.HIDDEN_STEMS_RATIO[branch];
    if (!hs) return;
    hs.forEach(({ stem, ratio }) => {
      const el = window.SajuData.WUXING_STEM[stem];
      if (el) elements[el] += ratio;
      const ss = getShishen(dayStem, stem);
      if (ss) tenGods[ss] += ratio;
    });
  });
  return { elements, tenGods };
}

function calculateVectors(pillars) {
  const dayStem = pillars.day.stem;

  // ── 원국 재료 (일간 제외)
  const baseStemList   = [pillars.year.stem, pillars.month.stem, pillars.hour.stem];
  const baseBranchList = [pillars.year.branch, pillars.month.branch, pillars.day.branch, pillars.hour.branch];

  const baseVectors = _buildVectors(dayStem, baseStemList, baseBranchList);

  // ── 대운 포함 재료 (운 분석용)
  const flowStemList   = [...baseStemList];
  const flowBranchList = [...baseBranchList];
  if (pillars.daeun?.stem)   flowStemList.push(pillars.daeun.stem);
  if (pillars.daeun?.branch) flowBranchList.push(pillars.daeun.branch);
  const flowVectors = _buildVectors(dayStem, flowStemList, flowBranchList);

  // 하위호환: 기존 코드가 vectors.elements / vectors.tenGods를 직접 읽으므로
  // 기본값은 원국 기준(baseVectors)으로 반환
  return {
    elements:    baseVectors.elements,
    tenGods:     baseVectors.tenGods,
    baseVectors,
    flowVectors
  };
}

/* =========================================================
   PART 3: 신강/신약 계산
   ========================================================= */

function calculateSeasonScore(monthBranch, dayElement) {
  if (!window.SajuData || !window.SajuData.SEASON_MAP) {
    console.warn("⚠️ SEASON_MAP이 정의되지 않음");
    return 0;
  }
  
  const season = window.SajuData.SEASON_MAP[monthBranch];
  if (!season) {
    console.warn(`⚠️ 월지 "${monthBranch}"에 해당하는 계절이 없음`);
    return 0;
  }
  
  const seasonElement = window.SajuData.SEASON_ELEMENT[season];
  if (!seasonElement) {
    console.warn(`⚠️ 계절 "${season}"에 해당하는 오행이 없음`);
    return 0;
  }
  
  if (seasonElement === dayElement) return 18;
  if (window.SajuData.WUXING_GENERATES[seasonElement] === dayElement) return 10;
  if (window.SajuData.WUXING_GENERATES[dayElement] === seasonElement) return -8;
  if (window.SajuData.WUXING_CONTROLS[seasonElement] === dayElement) return -14;
  if (window.SajuData.WUXING_CONTROLS[dayElement] === seasonElement) return -6;
  
  return 0;
}

function calculateRootScore(pillars, dayElement) {
  if (!window.SajuData || !window.SajuData.HIDDEN_STEMS_RATIO) {
    console.warn("⚠️ HIDDEN_STEMS_RATIO가 정의되지 않음");
    return 0;
  }
  
  const branches = [
    { branch: pillars.year.branch, weight: 0.8 },
    { branch: pillars.month.branch, weight: 1.6 },
    { branch: pillars.day.branch, weight: 1.3 },
    { branch: pillars.hour.branch, weight: 1.0 }
  ];
  
  let totalScore = 0;
  
  branches.forEach(({ branch, weight }) => {
    const hiddenStems = window.SajuData.HIDDEN_STEMS_RATIO[branch];
    if (!hiddenStems) return;
    
    hiddenStems.forEach(({ stem, ratio }) => {
      const stemElement = window.SajuData.WUXING_STEM[stem];
      if (!stemElement) return;
      
      if (stemElement === dayElement) {
        totalScore += ratio * 14 * weight;
      } else if (window.SajuData.WUXING_GENERATES[stemElement] === dayElement) {
        totalScore += ratio * 10 * weight;
      } else if (window.SajuData.WUXING_GENERATES[dayElement] === stemElement) {
        totalScore -= ratio * 6 * weight;
      } else if (window.SajuData.WUXING_CONTROLS[stemElement] === dayElement) {
        totalScore -= ratio * 9 * weight;
      } else if (window.SajuData.WUXING_CONTROLS[dayElement] === stemElement) {
        totalScore -= ratio * 5 * weight;
      }
    });
  });
  
  return totalScore;
}

function calculateStemAssistScore(pillars, dayElement) {
  const stems = [
    pillars.year.stem,
    pillars.month.stem,
    pillars.hour.stem
  ];
  
  let score = 0;
  
  stems.forEach(stem => {
    const stemElement = window.SajuData.WUXING_STEM[stem];
    
    if (stemElement === dayElement) score += 4;
    else if (window.SajuData.WUXING_GENERATES[stemElement] === dayElement) score += 3;
    else if (window.SajuData.WUXING_GENERATES[dayElement] === stemElement) score -= 2;
    else if (window.SajuData.WUXING_CONTROLS[stemElement] === dayElement) score -= 3;
    else if (window.SajuData.WUXING_CONTROLS[dayElement] === stemElement) score -= 1;
  });
  
  return score;
}

function calculateStrength(pillars) {
  const dayStem = pillars.day.stem;
  const dayElement = window.SajuData.WUXING_STEM[dayStem];
  const monthBranch = pillars.month.branch;
  
  const seasonScore = calculateSeasonScore(monthBranch, dayElement);
  const rootScore = calculateRootScore(pillars, dayElement);
  const stemAssistScore = calculateStemAssistScore(pillars, dayElement);
  
  const total = 50 + seasonScore + rootScore + stemAssistScore;
  
  let label;
  if (total >= 66) label = "신강";
  else if (total >= 36) label = "중화";
  else label = "신약";
  
  return {
    score: total,
    label,
    breakdown: {
      season: seasonScore,
      root: rootScore,
      stem: stemAssistScore
    }
  };
}

/* =========================================================
   PART 4: 격(格) 판정
   ========================================================= */

/* =========================================================
   determineGeok v3 — 4단계 格 판정
   1) 월령 주도축(정기 중심)  2) 투출 검증
   3) 원국 지지율             4) 파격/회복
   ========================================================= */
function determineGeok(pillars, vectors) {
  const monthBranch = pillars.month.branch;
  const dayStem     = pillars.day.stem;
  const notes       = [];

  const hiddenStems = window.SajuData.HIDDEN_STEMS_RATIO[monthBranch];
  if (!hiddenStems || hiddenStems.length === 0) {
    return { main:"혼합격", sub:null, purity:0.3, broken:false, recovery:false, notes:["월지 정보 없음"] };
  }

  // ── STEP 1: 월령 주도축 (정기 중심 → ratio 높은 순)
  const sorted = [...hiddenStems].sort((a, b) => b.ratio - a.ratio);
  const primaryStem  = sorted[0].stem;
  const primarySS    = getShishen(dayStem, primaryStem);
  const secondarySS  = sorted[1] ? getShishen(dayStem, sorted[1].stem) : null;

  if (!primarySS) {
    return { main:"혼합격", sub:null, purity:0.3, broken:false, recovery:false, notes:["십신 판정 실패"] };
  }

  const geokName = primarySS + "격";
  let purity = 0.40;
  notes.push(`월지 ${monthBranch} 정기: ${primaryStem} → ${geokName}`);

  // ── STEP 2: 투출 검증
  const monthStemSS = getShishen(dayStem, pillars.month.stem);
  const yearStemSS  = getShishen(dayStem, pillars.year.stem);
  const hourStemSS  = getShishen(dayStem, pillars.hour.stem);

  if (monthStemSS === primarySS) {
    purity += 0.25; notes.push("월간 투출 (+0.25)");
  } else if (yearStemSS === primarySS || hourStemSS === primarySS) {
    purity += 0.12; notes.push("연간/시간 투출 (+0.12)");
  }

  // ── STEP 3: 원국 지지율
  const tgCount = vectors.tenGods[primarySS] || 0;
  const primElem = window.SajuData.WUXING_STEM[primaryStem];
  const elCount  = primElem ? (vectors.elements[primElem] || 0) : 0;
  const elTotal  = Object.values(vectors.elements).reduce((a,b)=>a+b,0) || 1;
  const elRatio  = elCount / elTotal;

  if (tgCount >= 2.0 || elRatio >= 0.30) {
    purity += 0.18; notes.push(`원국 지지 강(십신${tgCount.toFixed(1)}/오행${(elRatio*100).toFixed(0)}%) (+0.18)`);
  } else if (tgCount >= 1.0 || elRatio >= 0.18) {
    purity += 0.08; notes.push("원국 지지 보통 (+0.08)");
  } else {
    purity -= 0.10; notes.push("원국 지지 부족 (-0.10)");
  }

  // ── STEP 4: 파격/회복
  let broken = false, recovery = false, clashOpp = null;
  const otherBranches = [pillars.year.branch, pillars.day.branch, pillars.hour.branch];
  const allBranches   = [pillars.year.branch, pillars.month.branch, pillars.day.branch, pillars.hour.branch];

  for (const pair of window.SajuData.EARTHLY_CLASHES) {
    if (pair.includes(monthBranch)) {
      const opp = pair.find(b => b !== monthBranch);
      if (otherBranches.includes(opp)) {
        broken = true; clashOpp = opp;
        purity -= 0.20; notes.push(`월지 충(${monthBranch}↔${opp}) 파격 (-0.20)`);
        break;
      }
    }
  }

  // 합에 의한 파격 회복
  if (broken && clashOpp) {
    const HAP = [["子","丑"],["寅","亥"],["卯","戌"],["辰","酉"],["巳","申"],["午","未"]];
    if (HAP.some(p => p.includes(clashOpp) && allBranches.some(b => b!==clashOpp && p.includes(b)))) {
      recovery = true; broken = false;
      purity += 0.12; notes.push("합에 의한 충 중화 → 파격 회복 (+0.12)");
    }
  }

  // 부격
  let sub = null;
  if (!(monthStemSS === primarySS) && secondarySS && secondarySS !== primarySS) {
    sub = secondarySS + "격(부)";
  }

  return { main:geokName, sub, purity:Math.max(0.1,Math.min(1.0,purity)), broken, recovery, notes };
}

/* =========================================================
   classifyYongHeeGiHan v3 — 오행 중심형
   [FIX] 중간 강도 구간 버그 제거 (strengthPrefer=[.preferList] 삭제)
   순서: 신강약+격 → 용/희/기/한 오행 결정 → 십신 환산
   ========================================================= */
function classifyYongHeeGiHan(state) {
  const { vectors, strength, geok } = state;
  const dayStem    = state.pillars.day.stem;
  const dayElement = window.SajuData.WUXING_STEM[dayStem];
  const ELEMS = ["wood","fire","earth","metal","water"];

  const GEN  = window.SajuData.WUXING_GENERATES  || { wood:"fire",fire:"earth",earth:"metal",metal:"water",water:"wood" };
  const CTRL = window.SajuData.WUXING_CONTROLS   || { wood:"earth",fire:"metal",earth:"water",metal:"wood",water:"fire" };

  const inseongElem   = ELEMS.find(e => GEN[e]   === dayElement);  // 인성 오행
  const sikSangElem   = GEN[dayElement];                           // 식상 오행
  const jaeSeongElem  = CTRL[dayElement];                          // 재성 오행
  const gwanSeongElem = ELEMS.find(e => CTRL[e]  === dayElement);  // 관성 오행
  const biGeopElem    = dayElement;                                 // 비겁 오행

  const ss        = strength.score;
  const geokCore  = (geok.main || "").replace("격","");

  let yongElem, heeElem, giElem, hanElem;

  if (ss <= 35) {
    // 신약: 인성·비겁 우선
    yongElem = inseongElem;
    heeElem  = biGeopElem;
    giElem   = jaeSeongElem;
    hanElem  = gwanSeongElem;
  } else if (ss >= 66) {
    // 신강: 설기·재관 우선
    yongElem = sikSangElem;
    heeElem  = jaeSeongElem;
    giElem   = inseongElem;
    hanElem  = biGeopElem;
    if (geokCore.includes("官")) { yongElem = gwanSeongElem; heeElem = sikSangElem; }
  } else {
    // 중간 강도: 格 방향 우선 [FIX — 버그 코드 제거, 오행 로직으로 대체]
    const geokPref = window.SajuData.GEOK_PREFERENCE?.[geok.main] ||
                     window.SajuData.GEOK_PREFERENCE?.["혼합격"] || {};
    const prefElems = [];
    (geokPref.prefer || []).forEach(tg => {
      Object.keys(window.SajuData.WUXING_STEM || {}).forEach(stem => {
        if (getShishen(dayStem, stem) === tg) {
          const e = window.SajuData.WUXING_STEM[stem];
          if (e && !prefElems.includes(e)) prefElems.push(e);
        }
      });
    });
    yongElem = prefElems[0] || (ss >= 51 ? sikSangElem : inseongElem);
    heeElem  = prefElems[1] || (ss >= 51 ? jaeSeongElem : biGeopElem);
    giElem   = ELEMS.find(e => CTRL[e] === yongElem) || biGeopElem;
    hanElem  = ELEMS.find(e => CTRL[yongElem] === e) || inseongElem;
  }

  // 오행 → 십신 환산
  function elemToSS(elem) {
    if (!elem) return [];
    const res = [];
    Object.keys(window.SajuData.WUXING_STEM || {}).forEach(stem => {
      if (window.SajuData.WUXING_STEM[stem] === elem) {
        const ss2 = getShishen(dayStem, stem);
        if (ss2 && !res.includes(ss2)) res.push(ss2);
      }
    });
    return res;
  }

  return {
    yong: { tenGods: elemToSS(yongElem), elements: yongElem ? [yongElem] : [] },
    hee:  { tenGods: elemToSS(heeElem),  elements: heeElem  ? [heeElem]  : [] },
    gi:   { tenGods: elemToSS(giElem),   elements: giElem   ? [giElem]   : [] },
    han:  { tenGods: elemToSS(hanElem),  elements: hanElem  ? [hanElem]  : [] },
    _debug: { ss:strength.score, yongElem, heeElem, giElem, hanElem }
  };
}

/* =========================================================
   PART 6: 합충형파해 판정
   ========================================================= */

function detectInteractions(pillars) {
  const interactions = {
    합: [],
    충: [],
    형: [],
    criticalHits: []
  };
  
  const stems = [
    pillars.year.stem,
    pillars.month.stem,
    pillars.day.stem,
    pillars.hour.stem
  ];
  
  const branches = [
    pillars.year.branch,
    pillars.month.branch,
    pillars.day.branch,
    pillars.hour.branch
  ];
  
  const HEAVENLY_COMBINATIONS = window.SajuData?.HEAVENLY_COMBINATIONS || [
    ["甲", "己"], ["乙", "庚"], ["丙", "辛"], ["丁", "壬"], ["戊", "癸"]
  ];
  
  const EARTHLY_SIX_COMBINATIONS = window.SajuData?.EARTHLY_SIX_COMBINATIONS || [
    ["子", "丑"], ["寅", "亥"], ["卯", "戌"], ["辰", "酉"], ["巳", "申"], ["午", "未"]
  ];
  
  const EARTHLY_THREE_COMBINATIONS = window.SajuData?.EARTHLY_THREE_COMBINATIONS || [
    { name: "申子辰", branches: ["申", "子", "辰"], element: "water" },
    { name: "亥卯未", branches: ["亥", "卯", "未"], element: "wood" },
    { name: "寅午戌", branches: ["寅", "午", "戌"], element: "fire" },
    { name: "巳酉丑", branches: ["巳", "酉", "丑"], element: "metal" }
  ];
  
  const EARTHLY_CLASHES = window.SajuData?.EARTHLY_CLASHES || [
    ["子", "午"], ["丑", "未"], ["寅", "申"], ["卯", "酉"], ["辰", "戌"], ["巳", "亥"]
  ];
  
  // 천간오합
  for (const [a, b] of HEAVENLY_COMBINATIONS) {
    if (stems.includes(a) && stems.includes(b)) {
      interactions.합.push({ type: "천간오합", stems: [a, b] });
    }
  }
  
  // 지지 육합
  for (const [a, b] of EARTHLY_SIX_COMBINATIONS) {
    if (branches.includes(a) && branches.includes(b)) {
      interactions.합.push({ type: "육합", branches: [a, b] });
    }
  }
  
  // 지지 삼합
  for (const group of EARTHLY_THREE_COMBINATIONS) {
    const matchCount = branches.filter(b => group.branches.includes(b)).length;
    if (matchCount >= 2) {
      interactions.합.push({
        type: matchCount === 3 ? "삼합완성" : "삼합반합",
        branches: group.branches,
        element: group.element
      });
    }
  }
  
  // 지지 충
  for (const [a, b] of EARTHLY_CLASHES) {
    if (branches.includes(a) && branches.includes(b)) {
      const critical = (pillars.month.branch === a || pillars.month.branch === b) ||
                      (pillars.day.branch === a || pillars.day.branch === b);
      interactions.충.push({ branches: [a, b], critical });
      if (critical) {
        interactions.criticalHits.push(`월지/일지 충: ${a}↔${b}`);
      }
    }
  }
  
  return interactions;
}

/* =========================================================
   PART 7: A모드 - help/risk 계산
   ========================================================= */

/**
 * 십신/오행별 help/risk 계산
 * help: 적정 범위 내 = 도움
 * risk: 범위 벗어남 or 충돌 = 리스크
 */
function computeHelpRisk(state) {
  const { vectors, strength, geok, interactions } = state;
  const total = Object.values(vectors.tenGods).reduce((a, b) => a + b, 0);
  
  const helpRisk = {
    tenGod: {
      help: {},
      risk: {}
    },
    element: {
      help: {},
      risk: {}
    }
  };
  
  // 적정 범위 정의
  const optimalRange = { min: 0.12, max: 0.28 };
  const safeRange = { min: 0.05, max: 0.40 };
  
  // 십신별 help/risk
  Object.keys(vectors.tenGods).forEach(tg => {
    const count = vectors.tenGods[tg] || 0;
    const ratio = total > 0 ? count / total : 0;
    
    // help: 적정 범위 근접도
    let help = 0;
    if (ratio >= optimalRange.min && ratio <= optimalRange.max) {
      help = 1.0;
    } else if (ratio < optimalRange.min) {
      const dist = optimalRange.min - ratio;
      help = Math.max(0, 1 - dist / optimalRange.min);
    } else {
      const dist = ratio - optimalRange.max;
      help = Math.max(0, 1 - dist / (1.0 - optimalRange.max));
    }
    
    // risk: 안전 범위 벗어남
    let risk = 0;
    if (ratio < safeRange.min) {
      risk = (safeRange.min - ratio) / safeRange.min;
    } else if (ratio > safeRange.max) {
      risk = (ratio - safeRange.max) / (1.0 - safeRange.max);
    }
    
    // 격/용희기한 기반 조정
    const geokPref = window.SajuData.GEOK_PREFERENCE[geok.main];
    if (geokPref) {
      if (geokPref.prefer && geokPref.prefer.includes(tg)) {
        help *= 1.3;
        risk *= 0.7;
      }
      if (geokPref.avoid && geokPref.avoid.includes(tg)) {
        help *= 0.6;
        risk *= 1.5;
      }
    }
    
    // 신강약 기반 조정
    if (strength.score <= 35) {
      // 신약: 비겁/인성 도움
      if (["比肩", "劫財", "正印", "偏印"].includes(tg)) {
        help *= 1.2;
        risk *= 0.8;
      }
      if (["食神", "傷官", "偏財", "正財"].includes(tg)) {
        risk *= 1.2;
      }
    } else if (strength.score >= 66) {
      // 신강: 식상/재성 도움
      if (["食神", "傷官", "偏財", "正財", "偏官", "正官"].includes(tg)) {
        help *= 1.2;
        risk *= 0.8;
      }
      if (["比肩", "劫財"].includes(tg)) {
        risk *= 1.3;
      }
    }
    
    helpRisk.tenGod.help[tg] = Math.min(1.0, help);
    helpRisk.tenGod.risk[tg] = Math.min(1.0, risk);
  });
  
  // 오행별 help/risk (단순 버전)
  const elementTotal = Object.values(vectors.elements).reduce((a, b) => a + b, 0);
  Object.keys(vectors.elements).forEach(elem => {
    const count = vectors.elements[elem] || 0;
    const ratio = elementTotal > 0 ? count / elementTotal : 0;
    
    let help = 0;
    if (ratio >= 0.15 && ratio <= 0.30) {
      help = 1.0;
    } else {
      const dist = Math.abs(ratio - 0.20);
      help = Math.max(0, 1 - dist / 0.30);
    }
    
    let risk = 0;
    if (ratio < 0.05 || ratio > 0.45) {
      risk = 0.5;
    }
    
    helpRisk.element.help[elem] = help;
    helpRisk.element.risk[elem] = risk;
  });
  
  return helpRisk;
}

/* =========================================================
   PART 8: B모드 - 프리셋 점수
   ========================================================= */

/**
 * 프리셋 가중치로 help/risk 재평가
 */
function scorePreset(helpRisk, presetWeights) {
  if (!presetWeights) return 0;
  
  let delta = 0;
  
  // 십신
  if (presetWeights.tenGod) {
    Object.keys(helpRisk.tenGod.help).forEach(tg => {
      const krName = window.SajuData.TEN_GODS_KR[tg] || tg;
      const help = helpRisk.tenGod.help[tg];
      const risk = helpRisk.tenGod.risk[tg];
      
      const wHelp = presetWeights.tenGod.help[krName] || 1.0;
      const wRisk = presetWeights.tenGod.risk[krName] || 1.0;
      
      delta += wHelp * help * 8;
      delta -= wRisk * risk * 6;
    });
  }
  
  // 오행
  if (presetWeights.element) {
    Object.keys(helpRisk.element.help).forEach(elem => {
      const krName = {
        wood: "목", fire: "화", earth: "토", metal: "금", water: "수"
      }[elem];
      const help = helpRisk.element.help[elem];
      const risk = helpRisk.element.risk[elem];
      
      const wHelp = presetWeights.element.help[krName] || 1.0;
      const wRisk = presetWeights.element.risk[krName] || 1.0;
      
      delta += wHelp * help * 3;
      delta -= wRisk * risk * 2;
    });
  }
  
  // 최대 영향도 제한
  return Math.max(-12, Math.min(12, delta));
}

/* =========================================================
   PART 9: 점수 엔진 (수정됨)
   ========================================================= */

/**
 * 오행 균형 점수 (0~15) <- 줄임
 */
function scoreBalance(vectors) {
  const total = Object.values(vectors.elements).reduce((a, b) => a + b, 0);
  if (total === 0) return 8;
  
  let deviation = 0;
  Object.values(vectors.elements).forEach(count => {
    const ratio = count / total;
    deviation += Math.abs(ratio - 0.2);
  });
  
  const maxDeviation = 1.2;
  const normalized = Math.max(0, 1 - deviation / maxDeviation);
  
  return normalized * 15;
}

/**
 * 신강약 적정 점수 (0~8) <- 줄임
 */
function scoreStrength(strength) {
  const s = strength.score;
  
  if (s >= 45 && s <= 60) {
    return 8;
  } else if (s < 45) {
    return Math.max(0, 8 - (45 - s) * 0.25);
  } else {
    return Math.max(0, 8 - (s - 60) * 0.18);
  }
}

/**
 * 격 유지 점수 (0~10) <- 줄임
 */
function scoreGeokIntegrity(geok, vectors) {
  let score = geok.purity * 8;
  
  if (geok.broken) score -= 4;
  
  return Math.max(0, Math.min(10, score));
}

/**
 * 용희기한 점수 (0~15) <- 줄임
 */
function scoreYongHeeGiHan(gods, vectors) {
  let score = 0;
  
  gods.yong.tenGods.forEach(tg => {
    const count = vectors.tenGods[tg] || 0;
    score += Math.min(count * 3.5, 7);
  });
  
  gods.hee.tenGods.forEach(tg => {
    const count = vectors.tenGods[tg] || 0;
    score += Math.min(count * 1.5, 3);
  });
  
  gods.gi.tenGods.forEach(tg => {
    const count = vectors.tenGods[tg] || 0;
    if (count > 1.5) score -= count * 1.5;
  });
  
  return Math.max(0, Math.min(15, score));
}

/**
 * 합충 점수 (-12~+10) <- 줄임
 */
function scoreInteractions(interactions, gods) {
  let score = 0;
  
  score += interactions.합.length * 1.5;
  
  interactions.충.forEach(c => {
    score -= c.critical ? 8 : 4;
  });
  
  score -= interactions.형.length * 2.5;
  
  return Math.max(-12, Math.min(10, score));
}

/**
 * 프로파일 점수 (0~15) <- 줄임
 */
function scoreProfile(vectors, interactions, profileName) {
  const profile = window.SajuData.PROFILES[profileName] || window.SajuData.PROFILES.overall;
  let score = 0;
  
  Object.entries(profile.tenGods).forEach(([tg, weight]) => {
    const count = vectors.tenGods[tg] || 0;
    score += count * weight * 0.4;
  });
  
  score += interactions.합.length * (profile.interactions.합 || 0) * 0.8;
  score += interactions.충.length * (profile.interactions.충 || 0) * 0.8;
  
  return Math.max(0, Math.min(15, score));
}

/**
 * 총점 계산 (B모드 blend 적용)
 */
function computeTotalScore(state, profileName = "overall") {
  // 기본 점수(A모드)
  const balanceScore = scoreBalance(state.vectors);
  const strengthScore = scoreStrength(state.strength);
  const geokScore = scoreGeokIntegrity(state.geok, state.vectors);
  const yhghScore = scoreYongHeeGiHan(state.gods, state.vectors);
  const interactionScore = scoreInteractions(state.interactions, state.gods);
  const profileScore = scoreProfile(state.vectors, state.interactions, profileName);
  
  const baseA = 50 + balanceScore + strengthScore + geokScore + yhghScore + interactionScore + profileScore;
  
  // help/risk 계산
  const helpRisk = computeHelpRisk(state);
  
  // 프리셋 적용
  const preset = PROFILE_PRESETS[profileName] || PROFILE_PRESETS.overall;
  const blendAlpha = preset.blendAlpha || 0;
  const presetDelta = scorePreset(helpRisk, preset.weights);
  
  // 최종 점수
  const final = baseA + (blendAlpha * presetDelta);
  const clamped = Math.max(0, Math.min(100, Math.round(final)));
  
  console.log(`💯 점수 계산: baseA=${baseA.toFixed(1)}, preset=${presetDelta.toFixed(1)}, blend=${blendAlpha}, final=${clamped}`);
  
  return {
    total: clamped,
    breakdown: {
      balance: Math.round(balanceScore),
      strength: Math.round(strengthScore),
      geok: Math.round(geokScore),
      yhgh: Math.round(yhghScore),
      interaction: Math.round(interactionScore),
      profile: Math.round(profileScore)
    },
    helpRisk,
    presetDelta: blendAlpha > 0 ? presetDelta : undefined
  };
}

/* =========================================================
   PART 10: 상태 빌드
   ========================================================= */

function buildState(pillars) {
  const vectors = calculateVectors(pillars);
  const strength = calculateStrength(pillars);
  const geok = determineGeok(pillars, vectors);
  const gods = classifyYongHeeGiHan({ pillars, vectors, strength, geok });
  const interactions = detectInteractions(pillars);
  
  return {
    pillars,
    vectors,
    strength,
    geok,
    gods,
    interactions
  };
}

/* =========================================================
   Export
   ========================================================= */
window.SajuEngine = {
  getShishen,
  calculateVectors,
  calculateStrength,
  determineGeok,
  classifyYongHeeGiHan,
  detectInteractions,
  computeHelpRisk,
  scorePreset,
  computeTotalScore,
  buildState,
  PROFILE_PRESETS
};

console.log("✅ SajuEngine v2.0 로드 완료");
console.log("🎯 프리셋:", Object.keys(PROFILE_PRESETS));
