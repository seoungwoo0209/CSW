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
  const D          = window.SajuData;
  const { vectors, strength, geok } = state;
  const dayStem    = state.pillars.day.stem;
  const dayElement = D.WUXING_STEM[dayStem];
  const GEN  = D.WUXING_GENERATES;
  const CTRL = D.WUXING_CONTROLS;
  const ELEMS = ["wood","fire","earth","metal","water"];

  const inseongEl   = ELEMS.find(e => GEN[e]  === dayElement);
  const sikSangEl   = GEN[dayElement];
  const jaeSeongEl  = CTRL[dayElement];
  const gwanSeongEl = ELEMS.find(e => CTRL[e] === dayElement);
  const biGeopEl    = dayElement;

  const ss       = strength.score;
  const geokCore = (geok.main || "").replace("격","");

  let yongEl, heeEl, giEl, hanEl;

  if (ss <= 35) {
    yongEl = inseongEl; heeEl = biGeopEl;
    giEl   = jaeSeongEl; hanEl = gwanSeongEl;
  } else if (ss >= 66) {
    yongEl = sikSangEl;  heeEl = jaeSeongEl;
    giEl   = inseongEl;  hanEl = biGeopEl;
    if (geokCore.includes("官")) { yongEl = gwanSeongEl; heeEl = sikSangEl; }
  } else {
    const pref     = D.GEOK_PREFERENCE?.[geok.main] || D.GEOK_PREFERENCE?.["혼합격"] || {};
    const prefElems = [];
    (pref.prefer || []).forEach(tg => {
      Object.keys(D.WUXING_STEM).forEach(stem => {
        if (getShishen(dayStem, stem) === tg) {
          const e = D.WUXING_STEM[stem];
          if (e && !prefElems.includes(e)) prefElems.push(e);
        }
      });
    });
    yongEl = prefElems[0] || (ss >= 51 ? sikSangEl   : inseongEl);
    heeEl  = prefElems[1] || (ss >= 51 ? jaeSeongEl  : biGeopEl);
    giEl   = ELEMS.find(e => CTRL[e]  === yongEl) || biGeopEl;
    hanEl  = ELEMS.find(e => CTRL[yongEl] === e)  || inseongEl;
  }

  function elemToSS(elem) {
    if (!elem) return [];
    const res = [];
    Object.keys(D.WUXING_STEM).forEach(stem => {
      if (D.WUXING_STEM[stem] === elem) {
        const ss2 = getShishen(dayStem, stem);
        if (ss2 && !res.includes(ss2)) res.push(ss2);
      }
    });
    return res;
  }

  return {
    yong: { tenGods: elemToSS(yongEl),  elements: yongEl  ? [yongEl]  : [] },
    hee:  { tenGods: elemToSS(heeEl),   elements: heeEl   ? [heeEl]   : [] },
    gi:   { tenGods: elemToSS(giEl),    elements: giEl    ? [giEl]    : [] },
    han:  { tenGods: elemToSS(hanEl),   elements: hanEl   ? [hanEl]   : [] },
    _debug: { ss, yongEl, heeEl, giEl, hanEl }
  };
}

/* =========================================================
   PART 5: 합충형 감지
   ========================================================= */
function detectInteractions(pillars) {
  const D       = window.SajuData;
  const interactions = { 합:[], 충:[], 형:[], criticalHits:[] };
  const stems   = [pillars.year.stem, pillars.month.stem, pillars.day.stem, pillars.hour.stem];
  const branches = [pillars.year.branch, pillars.month.branch, pillars.day.branch, pillars.hour.branch];

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
      const critical = [pillars.month.branch, pillars.day.branch].includes(a)
                    || [pillars.month.branch, pillars.day.branch].includes(b);
      interactions.충.push({ branches:[a,b], critical });
      if (critical) interactions.criticalHits.push(`월/일지 충: ${a}↔${b}`);
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
      if (["食神","傷官","偏財","正財"].includes(tg)) { risk *= 1.2; }
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
  return Math.max(0, Math.min(15, score));
}

function scoreInteractions(interactions) {
  let score = interactions.합.length * 1.5;
  interactions.충.forEach(c => { score -= c.critical ? 8 : 4; });
  score -= interactions.형.length * 2.5;
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
  const gods         = classifyYongHeeGiHan({ pillars, vectors, strength, geok });
  const interactions = detectInteractions(pillars);
  return { pillars, vectors, strength, geok, gods, interactions };
}

/* =========================================================
   Export
   ========================================================= */
window.SajuEngine = {
  calculateVectors,
  calculateStrength,
  determineGeok,
  scoreGeokIntegrity,
  classifyYongHeeGiHan,
  detectInteractions,
  computeHelpRisk,
  computeTotalScore,
  buildState,
  PROFILE_PRESETS
};

console.log("✅ saju_engine.js 로드 완료");
