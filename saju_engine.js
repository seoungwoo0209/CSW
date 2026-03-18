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
      if (["正印","偏印"].includes(tg)) score += 26;
      if (["比肩","劫財"].includes(tg)) score += 18;
      if (tg === "正官") score += 4;
      if (tg === "偏官") score -= 6;
      if (["食神","傷官"].includes(tg)) score -= 16;
      if (["正財","偏財"].includes(tg)) score -= 14;
    } else if (s >= 66) {
      if (tg === "食神") score += 24;
      if (tg === "傷官") score += 18;
      if (["正財","偏財"].includes(tg)) score += 20;
      if (tg === "正官") score += 8;
      if (tg === "偏官") score += 4;
      if (["正印","偏印"].includes(tg)) score -= 12;
      if (["比肩","劫財"].includes(tg)) score -= 20;
    } else {
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
  computeResourceScores,
  PROFILE_PRESETS
};

console.log("✅ saju_engine.js 로드 완료");
