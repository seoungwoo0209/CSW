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

function calculateVectors(pillars) {
  const dayStem = pillars.day.stem;
  
  const elements = {
    wood: 0, fire: 0, earth: 0, metal: 0, water: 0
  };
  
  const tenGods = {
    "比肩": 0, "劫財": 0, "食神": 0, "傷官": 0,
    "偏財": 0, "正財": 0, "偏官": 0, "正官": 0,
    "偏印": 0, "正印": 0
  };
  
  // 천간 (년/월/시, 일간 제외)
  const stems = [
    pillars.year.stem,
    pillars.month.stem,
    pillars.hour.stem
  ];
  
  // 대운 천간 추가 (있으면)
  if (pillars.daeun && pillars.daeun.stem) {
    stems.push(pillars.daeun.stem);
  }
  
  stems.forEach(stem => {
    const element = window.SajuData.WUXING_STEM[stem];
    if (element) elements[element] += 1.0;
    
    const shishen = getShishen(dayStem, stem);
    if (shishen) tenGods[shishen] += 1.0;
  });
  
  // 지지 (지장간 가중치 포함)
  const branches = [
    pillars.year.branch,
    pillars.month.branch,
    pillars.day.branch,
    pillars.hour.branch
  ];
  
  // 대운 지지 추가 (있으면)
  if (pillars.daeun && pillars.daeun.branch) {
    branches.push(pillars.daeun.branch);
  }
  
  branches.forEach(branch => {
    const hiddenStems = window.SajuData.HIDDEN_STEMS_RATIO[branch];
    if (!hiddenStems) return;
    
    hiddenStems.forEach(({ stem, ratio }) => {
      const element = window.SajuData.WUXING_STEM[stem];
      if (element) elements[element] += ratio;
      
      const shishen = getShishen(dayStem, stem);
      if (shishen) tenGods[shishen] += ratio;
    });
  });
  
  return { elements, tenGods };
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

function determineGeok(pillars, vectors) {
  const monthBranch = pillars.month.branch;
  const dayStem = pillars.day.stem;
  
  const hiddenStems = window.SajuData.HIDDEN_STEMS_RATIO[monthBranch];
  if (!hiddenStems || hiddenStems.length === 0) {
    return {
      main: "혼합격",
      sub: null,
      purity: 0.3,
      broken: false,
      notes: ["월지 정보 없음"]
    };
  }
  
  const mainHidden = hiddenStems[0];
  const monthMainStem = mainHidden.stem;
  const monthShishen = getShishen(dayStem, monthMainStem);
  
  if (!monthShishen) {
    return {
      main: "혼합격",
      sub: null,
      purity: 0.3,
      broken: false,
      notes: ["십신 판정 실패"]
    };
  }
  
  const geokName = monthShishen + "격";
  let purity = 0.5;
  const notes = [];
  
  notes.push(`월지 ${monthBranch} 주기운: ${monthMainStem}`);
  notes.push(`월령 십신: ${monthShishen}`);
  
  // 투간 체크
  const allStems = [
    pillars.year.stem,
    pillars.month.stem,
    pillars.hour.stem
  ];
  
  const hasTransparent = allStems.some(stem => {
    const ss = getShishen(dayStem, stem);
    return ss === monthShishen;
  });
  
  if (hasTransparent) {
    purity += 0.2;
    notes.push("투간 있음 (+0.2)");
  }
  
  // 십신 개수로 순도 보정
  const count = vectors.tenGods[monthShishen] || 0;
  if (count >= 2.0) {
    purity += 0.15;
    notes.push(`${monthShishen} 충분 (+0.15)`);
  } else if (count < 1.0) {
    purity -= 0.1;
    notes.push(`${monthShishen} 부족 (-0.1)`);
  }
  
  // 파격 판정 (월지 충)
  let broken = false;
  const branches = [
    pillars.year.branch,
    pillars.day.branch,
    pillars.hour.branch
  ];
  
  for (const clashPair of window.SajuData.EARTHLY_CLASHES) {
    if (clashPair.includes(monthBranch)) {
      const opposit = clashPair.find(b => b !== monthBranch);
      if (branches.includes(opposit)) {
        broken = true;
        purity -= 0.25;
        notes.push(`월지 충(${monthBranch}↔${opposit}) 파격!`);
        break;
      }
    }
  }
  
  purity = Math.max(0.1, Math.min(1.0, purity));
  
  return {
    main: geokName,
    sub: null,
    purity,
    broken,
    notes
  };
}

/* =========================================================
   PART 5: 용/희/기/한 분류
   ========================================================= */

function classifyYongHeeGiHan(state) {
  const { vectors, strength, geok } = state;
  const dayStem = state.pillars.day.stem;
  const dayElement = window.SajuData.WUXING_STEM[dayStem];
  
  const geokPref = window.SajuData.GEOK_PREFERENCE[geok.main] || window.SajuData.GEOK_PREFERENCE["혼합격"];
  const preferList = geokPref.prefer || [];
  const avoidList = geokPref.avoid || [];
  
  let strengthPrefer = [];
  let strengthAvoid = [];
  
  if (strength.score <= 35) {
    strengthPrefer.push("比肩", "劫財");
    const inseongElement = Object.keys(window.SajuData.WUXING_GENERATES).find(
      e => window.SajuData.WUXING_GENERATES[e] === dayElement
    );
    if (inseongElement) {
      Object.keys(window.SajuData.WUXING_STEM).forEach(stem => {
        if (window.SajuData.WUXING_STEM[stem] === inseongElement) {
          const ss = getShishen(dayStem, stem);
          if (ss && !strengthPrefer.includes(ss)) strengthPrefer.push(ss);
        }
      });
    }
    strengthAvoid.push("食神", "傷官", "偏財", "正財", "偏官", "正官");
  } else if (strength.score >= 66) {
    strengthPrefer.push("食神", "傷官", "偏財", "正財", "偏官", "正官");
    strengthAvoid.push("比肩", "劫財", "偏印", "正印");
  } else {
    strengthPrefer = [...preferList];
  }
  
  const allTenGods = [
    "比肩", "劫財", "食神", "傷官", "偏財", "正財", "偏官", "正官", "偏印", "正印"
  ];
  
  const scores = {};
  
  allTenGods.forEach(tg => {
    let score = 0;
    
    if (preferList.includes(tg)) score += 10;
    if (geokPref.support && geokPref.support.includes(tg)) score += 5;
    if (avoidList.includes(tg)) score -= 10;
    
    if (strengthPrefer.includes(tg)) score += 8;
    if (strengthAvoid.includes(tg)) score -= 8;
    
    const count = vectors.tenGods[tg] || 0;
    if (count > 2.5) score -= 5;
    if (count < 0.5) score += 3;
    
    scores[tg] = score;
  });
  
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  
  const yong = { tenGods: [sorted[0][0]], elements: [] };
  const hee = { tenGods: [sorted[1][0], sorted[2][0]], elements: [] };
  const gi = { tenGods: [], elements: [] };
  const han = { tenGods: [], elements: [] };
  
  sorted.forEach(([tg, score]) => {
    if (score < -5 && !gi.tenGods.includes(tg)) {
      gi.tenGods.push(tg);
    } else if (!yong.tenGods.includes(tg) && !hee.tenGods.includes(tg) && !gi.tenGods.includes(tg)) {
      han.tenGods.push(tg);
    }
  });
  
  // 오행 매핑
  [yong, hee, gi].forEach(godGroup => {
    godGroup.tenGods.forEach(tg => {
      Object.keys(window.SajuData.WUXING_STEM).forEach(stem => {
        const ss = getShishen(dayStem, stem);
        if (ss === tg) {
          const elem = window.SajuData.WUXING_STEM[stem];
          if (!godGroup.elements.includes(elem)) godGroup.elements.push(elem);
        }
      });
    });
  });
  
  return { yong, hee, gi, han };
}

/* =========================================================
   PART 6: 합충형파해 판정
   ========================================================= */

function detectInteractions(pillars) {
  const interactions = {
    합: [],
    충: [],
    형: [],
    파: [],   // [FIX] 파 추가
    해: [],   // [FIX] 해 추가
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

  // [FIX] 파(破) 판정
  const PA_PAIRS = [["子","酉"],["午","卯"],["寅","亥"],["巳","申"],["辰","丑"],["戌","未"]];
  for (const [a, b] of PA_PAIRS) {
    if (branches.includes(a) && branches.includes(b)) {
      interactions.파.push({ branches: [a, b] });
    }
  }

  // [FIX] 해(害) 판정
  const HAE_PAIRS = [["子","未"],["丑","午"],["寅","巳"],["卯","辰"],["申","亥"],["酉","戌"]];
  for (const [a, b] of HAE_PAIRS) {
    if (branches.includes(a) && branches.includes(b)) {
      interactions.해.push({ branches: [a, b] });
    }
  }

  // [FIX] 형(刑) 판정
  const EARTHLY_PUNISHMENTS_LOCAL = window.SajuData?.EARTHLY_PUNISHMENTS || [["寅","巳","申"],["丑","未","戌"],["子","卯"]];
  for (const group of EARTHLY_PUNISHMENTS_LOCAL) {
    const matchCount = branches.filter(b => group.includes(b)).length;
    if (matchCount >= 2) {
      interactions.형.push({ branches: group.filter(b => branches.includes(b)) });
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
