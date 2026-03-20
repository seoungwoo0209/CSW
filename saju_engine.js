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
   ⚠️ 2단계 리팩토링: MONTH_COMMAND_PROFILE 기반 월령 사령 점수로 교체
      통근 점수: ROOT_ROLE_WEIGHT × ROOT_POSITION_WEIGHT 조합
      천간 점수: STEM_POSITION_WEIGHT 위치 가중 반영
      함수 시그니처·반환 구조는 기존 호환 유지
   ========================================================= */
function calculateStrength(pillars) {
  // ── 안전장치: 필수 입력 누락 시 중립 fallback
  if (!pillars?.day?.stem || !pillars?.month?.branch) {
    return {
      score: 50,
      label: "중화",
      breakdown: { month: 0, season: 0, root: 0, stem: 0, controlDrain: 0 }
    };
  }

  const D           = window.SajuData;
  const dayStem     = pillars.day.stem;
  const dayElement  = D.WUXING_STEM[dayStem];
  const monthBranch = pillars.month.branch;

  // ── 관계 판별 헬퍼 (일간 오행 기준)
  function _rel(el) {
    if (!el || !dayElement) return "none";
    if (el === dayElement)                           return "same";
    if (D.WUXING_GENERATES[el]       === dayElement) return "gen_me";   // el이 일간을 생
    if (D.WUXING_GENERATES[dayElement] === el)       return "i_gen";    // 일간이 el을 생 (설기)
    if (D.WUXING_CONTROLS[el]        === dayElement) return "ctrl_me";  // el이 일간을 극
    if (D.WUXING_CONTROLS[dayElement] === el)        return "i_ctrl";   // 일간이 el을 극
    return "none";
  }

  // ─────────────────────────────────────────────
  // [1] 월령 사령 점수 (monthCommandScore)
  //     SEASON_MAP 단순 계절 점수 → MONTH_COMMAND_PROFILE로 교체
  //     辰未戌丑 사계토는 독립 프로파일로 자동 처리됨
  // ─────────────────────────────────────────────
  function monthCommandScore() {
    const profile = D.MONTH_COMMAND_PROFILE?.[monthBranch];
    if (!profile) {
      // MONTH_COMMAND_PROFILE 없을 경우 SEASON_MAP 기반 fallback
      const season = D.SEASON_MAP?.[monthBranch];
      const se = season ? D.SEASON_ELEMENT?.[season] : null;
      if (!se) return 0;
      const r = _rel(se);
      if (r === "same")     return 18;
      if (r === "gen_me")   return 10;
      if (r === "i_gen")    return -8;
      if (r === "ctrl_me")  return -14;
      if (r === "i_ctrl")   return -6;
      return 0;
    }

    let idx = 0;
    Object.entries(profile).forEach(([el, v]) => {
      if (!v) return;
      const r = _rel(el);
      if (r === "same")    idx += v * 1.00;
      else if (r === "gen_me")  idx += v * 0.60;
      else if (r === "i_gen")   idx -= v * 0.28;
      else if (r === "ctrl_me") idx -= v * 0.70;
      else if (r === "i_ctrl")  idx -= v * 0.22;
    });

    return Math.max(-18, Math.min(18, idx * 15));
  }

  // ─────────────────────────────────────────────
  // [2] 통근 점수 (rootScore)
  //     HIDDEN_STEMS_BRANCH + ROOT_ROLE_WEIGHT + ROOT_POSITION_WEIGHT 조합
  //     정기/중기/여기 역할 가중치를 직접 적용
  // ─────────────────────────────────────────────
  function rootScore() {
    // 위치 가중치: ROOT_POSITION_WEIGHT 우선, 없으면 내장 기본값
    const posW = D.ROOT_POSITION_WEIGHT || { year:0.85, month:1.70, day:1.35, hour:1.00 };
    // 역할 가중치: ROOT_ROLE_WEIGHT 우선, 없으면 내장 기본값
    const roleW = D.ROOT_ROLE_WEIGHT || { "정기":1.00, "중기":0.55, "여기":0.28 };

    const positions = [
      { key:"year",  branch: pillars.year.branch  },
      { key:"month", branch: pillars.month.branch },
      { key:"day",   branch: pillars.day.branch   },
      { key:"hour",  branch: pillars.hour.branch  }
    ];

    let total = 0;
    positions.forEach(({ key, branch }) => {
      if (!branch) return;
      const pw = posW[key] || 1.0;
      const hiddenList = D.HIDDEN_STEMS_BRANCH?.[branch];

      if (hiddenList && hiddenList.length > 0) {
        // HIDDEN_STEMS_BRANCH 기반: role 직접 참조
        hiddenList.forEach(({ stem, role }) => {
          const se = D.WUXING_STEM[stem];
          if (!se) return;
          const rw = roleW[role] || 0.28;
          const r  = _rel(se);
          let base = 0;
          if (r === "same")    base =  13;
          else if (r === "gen_me")  base =  9;
          else if (r === "i_gen")   base = -5;
          else if (r === "ctrl_me") base = -10;
          else if (r === "i_ctrl")  base = -4;
          total += base * rw * pw;
        });
      } else {
        // fallback: HIDDEN_STEMS_RATIO (ratio 기반)
        (D.HIDDEN_STEMS_RATIO?.[branch] || []).forEach(({ stem, ratio }) => {
          const se = D.WUXING_STEM[stem];
          if (!se) return;
          const r = _rel(se);
          let base = 0;
          if (r === "same")    base =  13;
          else if (r === "gen_me")  base =  9;
          else if (r === "i_gen")   base = -5;
          else if (r === "ctrl_me") base = -10;
          else if (r === "i_ctrl")  base = -4;
          total += base * ratio * pw;
        });
      }
    });

    return Math.max(-24, Math.min(24, total));
  }

  // ─────────────────────────────────────────────
  // [3] 천간 지원 점수 (stemScore)
  //     STEM_POSITION_WEIGHT 위치 가중치 반영
  //     월간(month) 가중치가 가장 높음
  // ─────────────────────────────────────────────
  function stemScore() {
    const posW = D.STEM_POSITION_WEIGHT || { year:0.85, month:1.25, hour:0.95 };
    const items = [
      { key:"year",  stem: pillars.year.stem  },
      { key:"month", stem: pillars.month.stem },
      { key:"hour",  stem: pillars.hour.stem  }
    ];
    let s = 0;
    items.forEach(({ key, stem }) => {
      if (!stem) return;
      const se = D.WUXING_STEM[stem];
      if (!se) return;
      const pw = posW[key] || 1.0;
      const r  = _rel(se);
      let base = 0;
      if (r === "same")    base =  4.0;
      else if (r === "gen_me")  base =  3.0;
      else if (r === "i_gen")   base = -2.0;
      else if (r === "ctrl_me") base = -3.0;
      else if (r === "i_ctrl")  base = -1.2;
      s += base * pw;
    });
    return Math.max(-12, Math.min(12, s));
  }

  // ── 최종 점수 조합
  const month        = monthCommandScore();
  const root         = rootScore();
  const stem         = stemScore();
  const controlDrain = 0;  // 3단계 이후 활성화 예정

  const rawTotal = 50 + month + root + stem + controlDrain;
  const total    = Math.max(0, Math.min(100, rawTotal));

  // 라벨 기준 완화: 72↑신강 / 42~71중화 / 41↓신약 (기존 68/45 → 72/42)
  const label = total >= 72 ? "신강" : total >= 42 ? "중화" : "신약";

  return {
    score: total,
    label,
    breakdown: {
      month,
      season: month,   // 하위호환: 기존 season 키 참조 코드 대응
      root,
      stem,
      controlDrain
    }
  };
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
/* =========================================================
   PART 2-pre: 십신 고전 점수 & 유용성 지수 (5단계 신규)
   ─────────────────────────────────────────────────────────
   computeTenGodClassicalScores : 10십신별 0~100 점수 객체
   getAxisUsefulnessIndex       : 5축별 -1.0~+1.0 해석 계수
   ─────────────────────────────────────────────────────────
   ⚠️ 이 두 함수는 "강도 재계산"이 아니라 "해석 계층"이다.
      month/root/exposed/structureCoeff를 다시 세지 않고
      이미 계산된 강도 위에서 "유용한가"를 판정한다.
   ========================================================= */

/* ─────────────────────────────────────────
   computeTenGodClassicalScores(state)
   반환: { 比肩:{ score, presence, structure, usefulness, notes }, ... }
───────────────────────────────────────── */
function computeTenGodClassicalScores(state) {
  const D    = window.SajuData;
  const { pillars, vectors, strength, geok, interactions } = state;
  const dayStem  = pillars.day.stem;
  const totalTG  = Object.values(vectors?.tenGods || {}).reduce((a,b)=>a+b,0) || 1;

  const ROOT_POS_W = D.ROOT_POSITION_WEIGHT || { year:0.85, month:1.70, day:1.35, hour:1.00 };
  const STEM_POS_W = D.STEM_POSITION_WEIGHT || { year:0.85, month:1.25, hour:0.95 };

  const TEN_GODS = ["比肩","劫財","食神","傷官","偏財","正財","偏官","正官","偏印","正印"];

  const result = {};

  TEN_GODS.forEach(tg => {
    const notes = [];

    // ── 존재량(presence): 원국 내 비중 + 투간 + 통근
    let presenceRaw = 0;
    [
      { stem: pillars.year.stem,  pos:"year"  },
      { stem: pillars.month.stem, pos:"month" },
      { stem: pillars.hour.stem,  pos:"hour"  },
    ].forEach(({ stem, pos }) => {
      if (getShishen(dayStem, stem) === tg)
        presenceRaw += STEM_POS_W[pos] || 1.0;
    });
    [
      { branch: pillars.year.branch,  pos:"year"  },
      { branch: pillars.month.branch, pos:"month" },
      { branch: pillars.day.branch,   pos:"day"   },
      { branch: pillars.hour.branch,  pos:"hour"  },
    ].forEach(({ branch, pos }) => {
      (D.HIDDEN_STEMS_RATIO?.[branch] || []).forEach(({ stem, ratio }) => {
        if (getShishen(dayStem, stem) === tg)
          presenceRaw += ratio * (ROOT_POS_W[pos] || 1.0);
      });
    });
    const presence = _clamp(presenceRaw / 4.5, 0, 1.0);  // 정규화 0~1

    // ── 구조(structure): 충/형/파/해로 인한 손상 정도
    let structureScore = 0;
    let monthRoot = false, dayRoot = false;
    [
      { branch: pillars.month.branch, isMonth:true  },
      { branch: pillars.day.branch,   isDay:true    },
    ].forEach(({ branch, isMonth, isDay }) => {
      const primary = (D.HIDDEN_STEMS_BRANCH?.[branch] || []).find(h => h.role === "정기");
      if (primary && getShishen(dayStem, primary.stem) === tg) {
        if (isMonth) monthRoot = true;
        if (isDay)   dayRoot   = true;
      }
    });
    (interactions?.충 || []).forEach(c => {
      const bs = c.branches || [];
      if (monthRoot && bs.includes(pillars.month.branch)) { structureScore -= c.critical ? 8 : 5; notes.push("월지근충"); }
      if (dayRoot   && bs.includes(pillars.day.branch))   { structureScore -= c.critical ? 5 : 3; notes.push("일지근충"); }
    });
    (interactions?.형 || []).forEach(c => {
      const bs = c.branches || [];
      if (monthRoot && bs.includes(pillars.month.branch)) { structureScore -= c.critical ? 5 : 3; }
      if (dayRoot   && bs.includes(pillars.day.branch))   { structureScore -= c.critical ? 3 : 2; }
    });
    (interactions?.파 || []).forEach(c => {
      const bs = c.branches || [];
      if (monthRoot && bs.includes(pillars.month.branch)) { structureScore -= c.critical ? 3 : 2; }
    });
    (interactions?.해 || []).forEach(c => {
      const bs = c.branches || [];
      if (monthRoot && bs.includes(pillars.month.branch)) { structureScore -= c.critical ? 2 : 1; }
    });
    const structureNorm = _clamp((structureScore + 16) / 32, 0, 1.0); // -16~0 → 0~0.5, 0→0.5

    // ── 유용성(usefulness): 신강/신약 + 格 기반 해석
    let usefulnessRaw = 0;
    const ss = strength?.score ?? 50;
    // 신강/신약 편향
    if (ss <= 44) {
      if (["正印","偏印"].includes(tg)) usefulnessRaw += 0.52;
      else if (["比肩","劫財"].includes(tg)) usefulnessRaw += 0.36;
      else if (tg === "正官") usefulnessRaw += 0.06;
      else if (tg === "偏官") usefulnessRaw -= 0.06;
      else if (["食神","傷官"].includes(tg)) usefulnessRaw -= 0.18;
      else if (["正財","偏財"].includes(tg)) usefulnessRaw -= 0.16;
    } else if (ss >= 68) {
      if (tg === "食神") usefulnessRaw += 0.48;
      else if (tg === "傷官") usefulnessRaw += 0.36;
      else if (["正財","偏財"].includes(tg)) usefulnessRaw += 0.40;
      else if (tg === "正官") usefulnessRaw += 0.16;
      else if (tg === "偏官") usefulnessRaw += 0.08;
      else if (["正印","偏印"].includes(tg)) usefulnessRaw -= 0.24;
      else if (["比肩","劫財"].includes(tg)) usefulnessRaw -= 0.40;
    } else {
      if (["正官","正印","食神","正財"].includes(tg)) usefulnessRaw += 0.16;
      else if (["偏官","偏印","偏財"].includes(tg))   usefulnessRaw += 0.06;
      else if (["劫財","傷官"].includes(tg))           usefulnessRaw -= 0.08;
    }
    // 格 편향 (가중치 절반 수준으로 축소 — 6.5 보정)
    const pref = D.GEOK_PREFERENCE?.[geok?.main] || D.GEOK_PREFERENCE?.["혼합격"] || {};
    if (pref.prefer?.includes(tg))  { usefulnessRaw += 0.22; notes.push("격prefer"); }
    if (pref.support?.includes(tg)) { usefulnessRaw += 0.10; notes.push("격support"); }
    if (pref.avoid?.includes(tg))   { usefulnessRaw -= 0.18; notes.push("격avoid"); }
    if (geok?.main === `${tg}격`)   { usefulnessRaw += 0.10; notes.push("격핵심"); }
    if (geok?.broken && pref.prefer?.includes(tg)) { usefulnessRaw -= 0.06; notes.push("격파손"); }
    // 고전 보정
    if (geok?.main === "偏官격" && tg === "食神") { usefulnessRaw += 0.16; notes.push("식신제살"); }
    if (geok?.main === "偏官격" && ["正印","偏印"].includes(tg)) { usefulnessRaw += 0.12; notes.push("살인상생"); }
    if (geok?.main === "正官격" && tg === "傷官") { usefulnessRaw -= 0.20; notes.push("상관견관"); }
    if (geok?.main === "食神격" && tg === "偏印") { usefulnessRaw -= 0.16; notes.push("도식"); }
    if (geok?.main === "正財격" && tg === "劫財") { usefulnessRaw -= 0.16; }
    if (geok?.main === "偏財격" && ["比肩","劫財"].includes(tg)) { usefulnessRaw -= 0.16; }

    const usefulness = _clamp(usefulnessRaw, -1.0, 1.0);

    // ── 최종 score (0~100)
    const score = _clamp(
      Math.round(50 + 28 * presence + 16 * (structureNorm - 0.5) * 2 + 22 * usefulness),
      0, 100
    );

    result[tg] = { score, presence: _round3(presence), structure: _round3(structureNorm), usefulness: _round3(usefulness), notes };
  });

  return result;
}

/* ─────────────────────────────────────────
   getAxisUsefulnessIndex(group, state, axisProfile, tenGodScores)
   반환: { index(-1.0~+1.0), adj(-0.22~+0.22), reasons[] }
   ─────────────────────────────────────────
   ⚠️ 강도 재계산 금지 — axisProfile의 기존 값을 "판정 근거"로만 참조
───────────────────────────────────────── */
function getAxisUsefulnessIndex(grp, state, axisProfile, tenGodScores) {
  const D = window.SajuData;
  const { strength, geok, interactions } = state;
  const reasons = [];

  const GROUP_MAP = {
    비겁: ["比肩","劫財"], 식상: ["食神","傷官"],
    재성: ["偏財","正財"], 관성: ["偏官","正官"], 인성: ["偏印","正印"],
  };
  const tgs = GROUP_MAP[grp];

  // ── A. strengthFit: 신강/신약에 따른 축 유불리
  const STRENGTH_FIT = {
    신약: { 비겁:+0.85, 인성:+1.00, 관성:-0.10, 식상:-0.55, 재성:-0.65 },
    중화: { 비겁:0.00,  인성:+0.10, 관성:+0.15, 식상:+0.20, 재성:+0.20 },
    신강: { 비겁:-0.75, 인성:-0.60, 관성:+0.40, 식상:+0.75, 재성:+0.80 },
  };
  const strengthLabel = strength?.label ?? "중화";
  const strengthFit   = STRENGTH_FIT[strengthLabel]?.[grp] ?? 0;
  if (strengthFit !== 0) reasons.push(`강약적합(${strengthLabel}):${strengthFit.toFixed(2)}`);

  // ── B. geokFit: 격 선호/회피 (가중치 절반 수준 — 6.5 보정)
  const pref   = D.GEOK_PREFERENCE?.[geok?.main] || D.GEOK_PREFERENCE?.["혼합격"] || {};
  let geokFit  = 0;
  tgs.forEach(tg => {
    if (pref.prefer?.includes(tg))  { geokFit += 0.14; reasons.push(`格prefer(${tg})`); }
    if (pref.support?.includes(tg)) { geokFit += 0.08; reasons.push(`格support(${tg})`); }
    if (pref.avoid?.includes(tg))   { geokFit -= 0.12; reasons.push(`格avoid(${tg})`); }
    if (geok?.main === `${tg}격`)   { geokFit += 0.06; reasons.push(`格핵심(${tg})`); }
  });
  if (geok?.broken) { geokFit -= 0.03; reasons.push("格파손"); }
  geokFit = _clamp(geokFit, -0.80, 0.80);

  // ── C. stabilityFit: 기존 baseProfile 값을 판정 근거로만 참조 (재계산 아님)
  let stabilityFit = 0;
  const rootNormVal    = axisProfile?.rootNorm    ?? 0;
  const exposedNormVal = axisProfile?.exposedNorm ?? 0;
  const criticalClash  = (interactions?.충 || []).filter(c => c.critical).length;

  if (rootNormVal >= 0.55)    { stabilityFit += 0.12; reasons.push("통근안정"); }
  if (exposedNormVal >= 0.45) { stabilityFit += 0.08; reasons.push("투간안정"); }
  if (criticalClash >= 2)     { stabilityFit -= 0.15; reasons.push("critical충多"); }
  if (exposedNormVal >= 0.45 && rootNormVal < 0.10) { stabilityFit -= 0.10; reasons.push("허투"); }

  // ── D. presencePenalty: 제거 (존재량 벌점 없앰 — 약한 축 과도 억압 방지)

  // ── 최종 index 합산 (가중 평균)
  const index = _clamp(
    0.50 * strengthFit +
    0.25 * geokFit     +
    0.25 * stabilityFit,
    -1.0, 1.0
  );
  const adj = _round3(index * 0.12);  // 6.5 보정: 0.22 → 0.12 (격 영향 완화)

  return { index: _round3(index), adj, reasons };
}


function classifyYongHeeGiHan(state) {
  const { strength, geok } = state;
  const D = window.SajuData;

  // 5단계: computeTenGodClassicalScores 기반으로 재구성
  const tenGodScores = computeTenGodClassicalScores(state);

  function uniq(arr) { return [...new Set((arr || []).filter(Boolean))]; }

  const TG_FAMILY = {
    "比肩":"비겁","劫財":"비겁","食神":"식상","傷官":"식상",
    "偏財":"재성","正財":"재성","偏官":"관성","正官":"관성","偏印":"인성","正印":"인성"
  };

  function getTenGodElement(tg) {
    for (const stem of Object.keys(D.WUXING_STEM || {})) {
      if (getShishen(state.pillars.day.stem, stem) === tg) return D.WUXING_STEM[stem];
    }
    return null;
  }

  // family 평균 계산 — coherence 22% 반영용
  const familyAvg = { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0 };
  const familyCnt = { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0 };

  Object.entries(tenGodScores).forEach(([tg, s]) => {
    const fam = TG_FAMILY[tg];
    if (fam) { familyAvg[fam] += s.score; familyCnt[fam] += 1; }
  });
  Object.keys(familyAvg).forEach(fam => {
    familyAvg[fam] = familyCnt[fam] ? familyAvg[fam] / familyCnt[fam] : 50;
  });

  // ranked 배열: family coherence 22% 블렌딩 후 정렬
  const ranked = Object.entries(tenGodScores)
    .map(([tg, s]) => {
      const family      = TG_FAMILY[tg];
      const famAvg      = familyAvg[family] ?? 50;
      const blendedScore = Math.round(0.78 * s.score + 0.22 * famAvg);
      return {
        tg,
        family,
        element:    getTenGodElement(tg),
        score:      blendedScore,
        rawScore:   s.score,
        familyAvg:  Math.round(famAvg),
        detail:     { presence: s.presence, structure: s.structure, usefulness: s.usefulness },
        profile:    s,
      };
    })
    .sort((a, b) => b.score - a.score);

  // ── 용/희/기/한 픽업 (기존 기준 유지)
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
    return [...list].reverse().filter(x => x.score <= maxScore && (x.score - bottom) <= bottomGap).slice(0, maxCount);
  }
  function pickNegative(list, maxScore, maxCount, excluded = []) {
    return [...list].reverse().filter(x => x.score <= maxScore && !excluded.includes(x.tg)).slice(0, maxCount);
  }

  const YHGH_TUNE = {
    yongMin:   74,
    heeMin:    61,
    giMax:     40,
    hanMax:    28,
    topGap:     5,
    bottomGap:  5
  };

  let yongItems = pickTopTier(ranked, YHGH_TUNE.yongMin, 2, YHGH_TUNE.topGap);
  if (!yongItems.length) yongItems = [ranked[0]];
  const yongNames = yongItems.map(x => x.tg);

  let heeItems = pickPositive(ranked, YHGH_TUNE.heeMin, 2, yongNames);
  if (!heeItems.length) heeItems = ranked.filter(x => !yongNames.includes(x.tg)).slice(0, 1);

  let hanItems = pickBottomTier(ranked, YHGH_TUNE.hanMax, 2, YHGH_TUNE.bottomGap);
  if (!hanItems.length) hanItems = [ranked[ranked.length - 1]];
  const hanNames = hanItems.map(x => x.tg);

  let giItems = pickNegative(ranked, YHGH_TUNE.giMax, 2, hanNames);
  if (!giItems.length) giItems = [...ranked].reverse().filter(x => !hanNames.includes(x.tg)).slice(0, 1);

  function pack(items) {
    return {
      tenGods:  items.map(x => x.tg),
      elements: uniq(items.map(x => x.element)),
      ranked:   items.map(x => ({ tg:x.tg, score:x.score, family:x.family, element:x.element }))
    };
  }

  console.log(
    "🎯 [용희기한 V3-3차]",
    ranked.map(x => `${x.tg}:${x.score}(raw=${x.rawScore},fam=${x.familyAvg})`).join(" ")
  );

  return {
    yong: pack(yongItems),
    hee:  pack(heeItems),
    gi:   pack(giItems),
    han:  pack(hanItems),
    ranked,
    tenGodScores,   // 5단계 신규
    _debug: {
      strengthScore: strength?.score,
      geokMain:      geok?.main,
      geokPurity:    geok?.purity,
      broken:        geok?.broken,
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
   헬퍼 0: 5축 대표 오행 계산 (일간 기준 동적 계산)
   비겁=일간 / 식상=일간이 生 / 재성=일간이 克
   관성=일간을 克 / 인성=일간을 生
───────────────────────────────────────── */
function _getAxisElement(grp, dayStem, D) {
  const dayEl = D.WUXING_STEM[dayStem];
  if (!dayEl) return null;
  if (grp === "비겁") return dayEl;
  if (grp === "식상") return D.WUXING_GENERATES[dayEl] || null;
  if (grp === "재성") return D.WUXING_CONTROLS[dayEl]  || null;
  if (grp === "관성") return Object.keys(D.WUXING_CONTROLS).find(e => D.WUXING_CONTROLS[e] === dayEl) || null;
  if (grp === "인성") return Object.keys(D.WUXING_GENERATES).find(e => D.WUXING_GENERATES[e] === dayEl) || null;
  return null;
}

/* ─────────────────────────────────────────
   헬퍼 1a: 축별 월령 사령 계수 (3단계 신규)
   MONTH_COMMAND_PROFILE 우선, 없으면 SEASON_MAP fallback
   반환 범위: 0.72 ~ 1.35
───────────────────────────────────────── */
function getAxisMonthCommandCoeff(grp, pillars, dayStem, D) {
  const axisEl      = _getAxisElement(grp, dayStem, D);
  if (!axisEl) return 1.0;

  const monthBranch = pillars.month.branch;
  const profile     = D.MONTH_COMMAND_PROFILE?.[monthBranch];

  let monthIndex = 0;

  if (profile) {
    // MONTH_COMMAND_PROFILE 기반
    Object.entries(profile).forEach(([el, v]) => {
      if (!v) return;
      if (el === axisEl)                               monthIndex += v * 1.00;
      else if (D.WUXING_GENERATES[el]    === axisEl)  monthIndex += v * 0.60;
      else if (D.WUXING_GENERATES[axisEl] === el)     monthIndex -= v * 0.28;
      else if (D.WUXING_CONTROLS[el]     === axisEl)  monthIndex -= v * 0.70;
      else if (D.WUXING_CONTROLS[axisEl]  === el)     monthIndex -= v * 0.22;
    });
  } else {
    // SEASON_MAP fallback (하위호환)
    const season   = D.SEASON_MAP?.[monthBranch];
    const seasonEl = season ? D.SEASON_ELEMENT?.[season] : null;
    if (seasonEl) {
      if (seasonEl === axisEl)                             monthIndex =  0.89;
      else if (D.WUXING_GENERATES[seasonEl] === axisEl)   monthIndex =  0.36;
      else if (D.WUXING_GENERATES[axisEl]   === seasonEl) monthIndex = -0.36;
      else if (D.WUXING_CONTROLS[seasonEl]  === axisEl)   monthIndex = -0.89;
      else if (D.WUXING_CONTROLS[axisEl]    === seasonEl) monthIndex = -0.54;
    }
  }

  return _clamp(1.0 + monthIndex * 0.28, 0.72, 1.35);
}

/* ─────────────────────────────────────────
   헬퍼 1b: 기존 getAxisMonthPower (하위호환용)
   내부에서 새 getAxisMonthCommandCoeff로 위임
───────────────────────────────────────── */
function getAxisMonthPower(grp, pillars, dayStem, D) {
  return _clamp(getAxisMonthCommandCoeff(grp, pillars, dayStem, D), 0.75, 1.25);
}

/* ─────────────────────────────────────────
   헬퍼 1c: 축별 통근 계수 (3단계 신규)
   HIDDEN_STEMS_BRANCH + ROOT_ROLE_WEIGHT + ROOT_POSITION_WEIGHT 조합
   반환: { raw, norm, coeff }
───────────────────────────────────────── */
function getAxisRootCoeff(grp, pillars, dayStem, D) {
  const posW  = D.ROOT_POSITION_WEIGHT || { year:0.85, month:1.70, day:1.35, hour:1.00 };
  const roleW = D.ROOT_ROLE_WEIGHT     || { "정기":1.00, "중기":0.55, "여기":0.28 };
  const GROUP_MAP = {
    비겁: ["比肩","劫財"], 식상: ["食神","傷官"],
    재성: ["偏財","正財"], 관성: ["偏官","正官"], 인성: ["偏印","正印"],
  };
  const tgs = GROUP_MAP[grp];

  const positions = [
    { key:"year",  branch: pillars.year.branch  },
    { key:"month", branch: pillars.month.branch },
    { key:"day",   branch: pillars.day.branch   },
    { key:"hour",  branch: pillars.hour.branch  },
  ];

  let raw = 0;
  positions.forEach(({ key, branch }) => {
    if (!branch) return;
    const pw         = posW[key] || 1.0;
    const hiddenList = D.HIDDEN_STEMS_BRANCH?.[branch];

    if (hiddenList && hiddenList.length > 0) {
      // HIDDEN_STEMS_BRANCH 기반: role 직접 참조
      hiddenList.forEach(({ stem, role }) => {
        const ss = getShishen(dayStem, stem);
        if (!tgs.includes(ss)) return;
        const rw = roleW[role] || 0.28;
        raw += rw * pw;
      });
    } else {
      // fallback: HIDDEN_STEMS_RATIO
      (D.HIDDEN_STEMS_RATIO?.[branch] || []).forEach(({ stem, ratio }) => {
        const ss = getShishen(dayStem, stem);
        if (!tgs.includes(ss)) return;
        raw += ratio * pw;
      });
    }
  });

  const norm  = _clamp(raw / 2.5, 0, 1.0);
  const coeff = _clamp(1.0 + norm * 0.42, 1.0, 1.42);
  return { raw, norm, coeff };
}

/* ─────────────────────────────────────────
   헬퍼 1d: 축별 투간(노출) 계수 (3단계 신규)
   연간/월간/시간 기준 — 월간 가중 가장 큼
   반환: { raw, norm, coeff }
───────────────────────────────────────── */
function getAxisExposedCoeff(grp, pillars, dayStem, D) {
  const posW = D.STEM_POSITION_WEIGHT || { year:0.85, month:1.25, hour:0.95 };
  const GROUP_MAP = {
    비겁: ["比肩","劫財"], 식상: ["食神","傷官"],
    재성: ["偏財","正財"], 관성: ["偏官","正官"], 인성: ["偏印","正印"],
  };
  const tgs = GROUP_MAP[grp];

  const items = [
    { key:"year",  stem: pillars.year.stem  },
    { key:"month", stem: pillars.month.stem },
    { key:"hour",  stem: pillars.hour.stem  },
  ];

  let raw = 0;
  items.forEach(({ key, stem }) => {
    if (!stem) return;
    const ss = getShishen(dayStem, stem);
    if (!tgs.includes(ss)) return;
    raw += posW[key] || 1.0;
  });

  const norm  = _clamp(raw / 2.5, 0, 1.0);
  const coeff = _clamp(1.0 + norm * 0.30, 1.0, 1.30);
  return { raw, norm, coeff };
}

/* ─────────────────────────────────────────
   헬퍼 1e: 5축 기초량 프로파일 (3단계 핵심 신규)
   computeResourceScores 내부 직접 계산을 이 함수로 위임
───────────────────────────────────────── */
function computeAxisBaseProfile(state) {
  const D       = window.SajuData;
  const pillars = state.pillars;
  const dayStem = pillars.day.stem;

  const GROUPS    = ["비겁","식상","재성","관성","인성"];
  const GROUP_MAP = {
    비겁: ["比肩","劫財"], 식상: ["食神","傷官"],
    재성: ["偏財","正財"], 관성: ["偏官","正官"], 인성: ["偏印","正印"],
  };

  // 위치별 가중치 (기존 computeResourceScores 값과 동일하게 유지)
  const STEM_W          = { year:0.85, month:1.25, hour:0.95 };
  const BRANCH_W        = { year:0.90, month:1.35, day:1.15, hour:1.00 };
  const ROOT_POS_W      = D.ROOT_POSITION_WEIGHT || { year:0.8, month:1.6, day:1.3, hour:1.0 };
  const MONTH_HIDDEN_BOOST = 1.15;

  const amountRaw = { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0 };
  const rootPower = { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0 };
  const stemPower = { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0 };

  // STEP 1a: 표면 천간 (연/월/시 — 일간 제외)
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

  // STEP 1b: 지장간 (HIDDEN_STEMS_RATIO 기반 — 기존 호환)
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

  // STEP 2: 축별 새 계수 계산 (3단계 핵심)
  const RESOURCE_TUNE = {
    amountSoftScale: 2.05,   // 1.9~2.2 범위 내 튜닝 — 상단 포화 완화
    amountBlend:     0.62,
    rootBlend:       0.23,
    expBlend:        0.15,
    absPowerScale:   6.0
  };

  const profile = {};
  GROUPS.forEach(grp => {
    const monthCmd = getAxisMonthCommandCoeff(grp, pillars, dayStem, D);
    const rootObj  = getAxisRootCoeff(grp, pillars, dayStem, D);
    const expObj   = getAxisExposedCoeff(grp, pillars, dayStem, D);

    // 선형 /3.2 급포화 → soft saturation (1 - exp) 으로 교체
    const amountNorm = _clamp(
      1 - Math.exp(-(amountRaw[grp] / RESOURCE_TUNE.amountSoftScale)),
      0, 1
    );

    const mixedNorm =
      RESOURCE_TUNE.amountBlend * amountNorm +
      RESOURCE_TUNE.rootBlend   * rootObj.norm +
      RESOURCE_TUNE.expBlend    * expObj.norm;

    const absoluteBasePower =
      RESOURCE_TUNE.absPowerScale * mixedNorm * monthCmd;

    profile[grp] = {
      amountRaw:         _round2(amountRaw[grp]),
      monthCommandCoeff: _round3(monthCmd),
      rootRaw:           _round2(rootObj.raw),
      rootNorm:          _round3(rootObj.norm),
      rootCoeff:         _round3(rootObj.coeff),
      exposedRaw:        _round2(stemPower[grp]),
      exposedNorm:       _round3(expObj.norm),
      exposedCoeff:      _round3(expObj.coeff),
      absoluteBasePower: _round2(absoluteBasePower),
      _tune: {
        amountNorm: _round3(amountNorm),
        rootNorm:   _round3(rootObj.norm),
        expNorm:    _round3(expObj.norm),
        mixedNorm:  _round3(mixedNorm),
      },
    };
  });

  return profile;
}

/* ─────────────────────────────────────────
   헬퍼 2: 구조 보전도 계수 (4단계 신규)
   getAxisStructureCoeff(group, state, baseProfile)
   ─────────────────────────────────────────
   반영 대상: 충/형/파/해/합/격 파손/격 일치 — "구조"만
   절대 포함하지 않을 것: monthCommandCoeff, rootCoeff, exposedCoeff,
                          getAxisCoeff(), strength.label, help/risk
   반환: { coeff(0.72~1.18), delta, critical, notes }
───────────────────────────────────────── */
function getAxisStructureCoeff(grp, state, baseProfile) {
  const D    = window.SajuData;
  const pillars     = state.pillars;
  const geok        = state.geok    || {};
  const interactions = state.interactions || {};
  const dayStem     = pillars.day.stem;

  const GROUP_MAP = {
    비겁: ["比肩","劫財"], 식상: ["食神","傷官"],
    재성: ["偏財","正財"], 관성: ["偏官","正官"], 인성: ["偏印","正印"],
  };
  const tgs = GROUP_MAP[grp];

  let delta = 0;
  let critical = false;
  const notes = [];

  // ── A. 이 축의 핵심 뿌리 지지 파악
  //       월지·일지를 우선, 지장간 정기에서 해당 축 십신이 나오는 지지를 찾는다
  const positions = [
    { key:"month", branch: pillars.month.branch, isMajor: true  },
    { key:"day",   branch: pillars.day.branch,   isMajor: true  },
    { key:"year",  branch: pillars.year.branch,  isMajor: false },
    { key:"hour",  branch: pillars.hour.branch,  isMajor: false },
  ];

  // 해당 축의 정기 뿌리가 있는 지지 목록
  const rootBranches = { month:false, day:false, year:false, hour:false };
  positions.forEach(({ key, branch }) => {
    const hidden = D.HIDDEN_STEMS_BRANCH?.[branch] || [];
    const primaryStem = hidden.find(h => h.role === "정기")?.stem;
    if (!primaryStem) return;
    const ss = getShishen(dayStem, primaryStem);
    if (tgs.includes(ss)) rootBranches[key] = true;
  });

  // ── B. 충(冲) 감점 — 핵심 뿌리 지지가 충을 맞는지 판단
  const clashes = interactions.충 || [];
  clashes.forEach(c => {
    const bs = c.branches || [];
    const monthBranch = pillars.month.branch;
    const dayBranch   = pillars.day.branch;

    const hitsMonth = bs.includes(monthBranch) && rootBranches.month;
    const hitsDay   = bs.includes(dayBranch)   && rootBranches.day;
    const hitsOther = bs.some(b =>
      (b === pillars.year.branch && rootBranches.year) ||
      (b === pillars.hour.branch && rootBranches.hour)
    );

    if (hitsMonth) {
      const penalty = c.critical ? -0.18 : -0.12;
      delta += penalty;
      critical = true;
      notes.push(`월지 핵심근 충(${bs.join("↔")}) ${penalty}`);
    } else if (hitsDay) {
      const penalty = c.critical ? -0.11 : -0.07;
      delta += penalty;
      if (c.critical) critical = true;
      notes.push(`일지 핵심근 충(${bs.join("↔")}) ${penalty}`);
    } else if (hitsOther) {
      delta -= 0.04;
      notes.push(`연/시지 근 충(${bs.join("↔")}) -0.04`);
    }
  });

  // ── C. 형(刑) 감점 — critical 형 위주
  const hyeongs = interactions.형 || [];
  hyeongs.forEach(c => {
    const bs = c.branches || [];
    const hitsRoot = bs.some(b =>
      (b === pillars.month.branch && rootBranches.month) ||
      (b === pillars.day.branch   && rootBranches.day)
    );
    if (hitsRoot) {
      const penalty = c.critical ? -0.08 : -0.05;
      delta += penalty;
      notes.push(`핵심근 형(${bs.join("↔")}) ${penalty}`);
    }
  });

  // ── D. 파(破) 감점
  const pas = interactions.파 || [];
  pas.forEach(c => {
    const bs = c.branches || [];
    const hitsRoot = bs.some(b =>
      (b === pillars.month.branch && rootBranches.month) ||
      (b === pillars.day.branch   && rootBranches.day)
    );
    if (hitsRoot) {
      const penalty = c.critical ? -0.05 : -0.03;
      delta += penalty;
      notes.push(`핵심근 파(${bs.join("↔")}) ${penalty}`);
    }
  });

  // ── E. 해(害) 감점
  const haes = interactions.해 || [];
  haes.forEach(c => {
    const bs = c.branches || [];
    const hitsRoot = bs.some(b =>
      (b === pillars.month.branch && rootBranches.month) ||
      (b === pillars.day.branch   && rootBranches.day)
    );
    if (hitsRoot) {
      const penalty = c.critical ? -0.03 : -0.02;
      delta += penalty;
      notes.push(`핵심근 해(${bs.join("↔")}) ${penalty}`);
    }
  });

  // ── F. 합(合) 가점 — 해당 축과 실제로 관련된 합만 반영
  const haps = interactions.합 || [];
  const stems = [pillars.year.stem, pillars.month.stem, pillars.hour.stem];
  haps.forEach(c => {
    // 천간오합: 해당 축 십신이 합에 참여하면 소폭 +
    if (c.type === "천간오합" && c.stems) {
      const involved = c.stems.some(s => {
        const ss = getShishen(dayStem, s);
        return tgs.includes(ss);
      });
      if (involved) {
        delta += 0.04;
        notes.push(`천간합 안정화(${c.stems.join("↔")}) +0.04`);
      }
    }
    // 육합: 해당 축 뿌리 지지가 합에 참여하면 소폭 +
    if (c.type === "육합" && c.branches) {
      const involved = c.branches.some(b =>
        (b === pillars.month.branch && rootBranches.month) ||
        (b === pillars.day.branch   && rootBranches.day)
      );
      if (involved) {
        delta += 0.06;
        notes.push(`육합 안정화(${c.branches.join("↔")}) +0.06`);
      }
    }
    // 삼합: 해당 축 오행과 일치하면 +
    if ((c.type === "삼합완성" || c.type === "삼합반합") && c.element) {
      const axisEl = _getAxisElement(grp, dayStem, D);
      if (axisEl === c.element) {
        const bonus = c.type === "삼합완성" ? 0.08 : 0.05;
        delta += bonus;
        notes.push(`삼합 오행 일치(${c.element}) +${bonus}`);
      }
    }
  });

  // ── G. 격(格) 연계
  const geokCore = (geok.main || "").replace("격","");
  if (tgs.includes(geokCore)) {
    const purity = geok.purity || 0;
    const bonus  = _clamp(purity * 0.12, 0, 0.12);
    if (bonus > 0) {
      delta += bonus;
      notes.push(`격 일치(${geokCore} 순도${_round2(purity)}) +${_round2(bonus)}`);
    }
    // 격 파손이고 이 축이 핵심격이면 추가 감점
    if (geok.broken) {
      delta -= 0.06;
      notes.push(`격 파손 핵심축 -0.06`);
    }
  } else if (geok.broken) {
    // 격 파손인데 이 축이 핵심격이 아니라도 미약하게 영향
    delta -= 0.02;
    notes.push(`격 파손(비핵심) -0.02`);
  }

  const coeff = _clamp(1 + delta, 0.72, 1.18);

  return { coeff, delta: _round3(delta), critical, notes };
}

/* ─────────────────────────────────────────
   헬퍼 2-legacy: getAxisStructureAdj (하위호환 래퍼)
   내부에서 getAxisStructureCoeff로 위임
   ※ 외부 직접 호출 시 기존 숫자 반환 형식 유지
───────────────────────────────────────── */
function getAxisStructureAdj(grp, geok, interactions, pillars, dayStem, D) {
  // getAxisStructureCoeff에 필요한 최소 state 객체 조립
  const minState = { pillars, geok: geok || {}, interactions: interactions || {} };
  const result   = getAxisStructureCoeff(grp, minState, null);
  return _clamp(result.delta, -0.15, 0.20);
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
   헬퍼 4: 그룹의 용희기한 역할 판정 (V5)
   ─────────────────────────────────────────
   5축 role은 두 십신의 단순 평균이 아니라
   "대표성(max) + 평균(avg)" 혼합으로 계산한다.

   V5 목표:
   - 인성: 희신 상단을 준용신급으로 더 선명하게 반영
   - 재성: 중립에 과하게 머무는 현상을 줄이고 약기신 쪽으로 더 명확히 이동
   - score 계산식과 십신 분류 로직은 유지하고
     group role 단계에서만 미세 bias를 적용한다

   판정 우선순위:
   1) 그룹 내부 십신의 roleAnchor + rankedScore
   2) usefulness / structure 보정
   3) 인성 상향 bias, 재성 하향 bias
   4) 승격 / 하향 규칙
   5) 최종 threshold 판정
───────────────────────────────────────── */
function getGroupRole(grp, gods, GROUP_MAP, usefulnessIndex, structureCoeff) {
  const tgs = GROUP_MAP[grp] || [];

  function getTgRole(tg) {
    if ((gods.yong?.tenGods || []).includes(tg)) return "용신";
    if ((gods.hee?.tenGods  || []).includes(tg)) return "희신";
    if ((gods.gi?.tenGods   || []).includes(tg)) return "기신";
    if ((gods.han?.tenGods  || []).includes(tg)) return "한신";
    return "중립";
  }

  const ROLE_ANCHOR = {
    "용신": 78,
    "희신": 62,
    "중립": 50,
    "기신": 38,
    "한신": 22,
  };

  const rankedMap = {};
  (gods.ranked || []).forEach(item => { rankedMap[item.tg] = item.score; });

  const tgInfos = tgs.map(tg => {
    const role        = getTgRole(tg);
    const roleAnchor  = ROLE_ANCHOR[role] ?? 50;
    const rankedScore = rankedMap[tg] ?? 50;
    const tgScore     = 0.60 * roleAnchor + 0.40 * rankedScore;
    return { tg, role, roleAnchor, rankedScore, tgScore };
  });

  if (!tgInfos.length) return "중립";

  const scores   = tgInfos.map(x => x.tgScore);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // 대표성형 유지
  const groupBase = 0.65 * maxScore + 0.35 * avgScore;

  const ui = usefulnessIndex ?? 0;
  const sc = structureCoeff  ?? 1.0;

  const hasYong = tgInfos.some(x => x.role === "용신");
  const hasHee  = tgInfos.some(x => x.role === "희신");
  const hasGi   = tgInfos.some(x => x.role === "기신");
  const hasHan  = tgInfos.some(x => x.role === "한신");

  // 5차 핵심: 그룹별 미세 bias
  // 인성은 희신 상단 → 준용신급으로 끌어올리고
  // 재성은 중립 탈출 → 약기신 쪽으로 더 쉽게 내려보낸다
  let roleBias = 0;

  if (grp === "인성") {
    if (ui >= 0.10) roleBias += 2.4;
    if (sc >= 1.00) roleBias += 1.2;
    if (hasHee)     roleBias += 1.4;
    if (hasYong)    roleBias += 1.0;
  }

  if (grp === "재성") {
    if (ui <= -0.04) roleBias -= 2.6;
    if (ui <= -0.10) roleBias -= 1.2;
    if (sc <= 0.98)  roleBias -= 0.8;
    if (hasGi)       roleBias -= 1.2;
    if (hasHan)      roleBias -= 1.0;
    if (!hasYong && !hasHee) roleBias -= 0.8;
  }

  const roleScore = groupBase + 11 * ui + 14 * (sc - 1.0) + roleBias;

  // ─────────────────────────────────────
  // 인성 승격 규칙 (준용신급 체감 확보)
  // 현재 UI에는 "준용신" 라벨이 없으므로
  // 조건이 충분하면 용신으로 승격시켜 표시한다
  // ─────────────────────────────────────
  if (grp === "인성") {
    if ((hasHee || hasYong) && ui >= 0.10 && sc >= 1.00 && groupBase >= 57) {
      if (roleScore >= 61) return "용신";
      return "희신";
    }
    if ((hasHee || hasYong) && ui >= 0.04 && groupBase >= 54) {
      return "희신";
    }
  }

  // ─────────────────────────────────────
  // 재성 하향 규칙 (중립 방치 방지)
  // 현재 로직은 재성이 43~53에 걸리면 중립이 많았으므로
  // 음의 ui + 기신/한신 흔적이 있으면 약기신으로 내려보낸다
  // ─────────────────────────────────────
  if (grp === "재성") {
    if ((hasGi || hasHan) && ui <= -0.04 && roleScore <= 46) {
      return "기신";
    }
    if (!hasYong && !hasHee && ui < 0 && roleScore <= 45) {
      return "기신";
    }
    if (hasHan && ui <= -0.10 && minScore <= 42) {
      return "기신";
    }
  }

  // 기존 일반 승격 / 하향 규칙은 유지하되 약간 보수적으로 통과
  if (hasYong && ui > 0.08 && groupBase >= 60 && sc >= 0.98) {
    if (roleScore >= 63) return "용신";
    return "희신";
  }

  if (hasHee && ui >= 0.00 && groupBase >= 54) {
    if (roleScore >= 54) return "희신";
  }

  if (hasHan && ui < -0.08 && minScore <= 34) {
    if (roleScore <= 31) return "한신";
    return "기신";
  }

  if (hasGi && ui < -0.02 && minScore <= 42) {
    if (roleScore <= 42) return "기신";
  }

  console.log(
    `🧭 [groupRole V5] ${grp} max=${maxScore.toFixed(1)} avg=${avgScore.toFixed(1)} base=${groupBase.toFixed(1)} ui=${ui.toFixed(2)} sc=${sc.toFixed(2)} bias=${roleBias.toFixed(2)} y=${hasYong} h=${hasHee} g=${hasGi} hn=${hasHan} => ${roleScore.toFixed(1)}`
  );

  // 최종 일반 판정선
  if (roleScore >= 64) return "용신";
  if (roleScore >= 54) return "희신";
  if (roleScore <= 31) return "한신";
  if (roleScore <= 42) return "기신";
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
   헬퍼 6: computeHanVolatility
   ─────────────────────────────────────────
   한신 = "조건부 작용성 축" 판정을 위한 변동성 지수.
   ambiguity(방향성 애매함) 단독으로는 가산하지 않는다.
   반드시 structural trigger 와 함께 있을 때만 한신 근거가 된다.
   반환: 0.0 ~ 1.0
───────────────────────────────────────── */
function computeHanVolatility(axisProfile, state) {
  const geok         = state.geok        || {};
  const interactions = state.interactions || {};
  const ui           = axisProfile.usefulnessIndex ?? 0;   // 이미 계산된 값 참조
  const rootNorm     = axisProfile.rootNorm   ?? 0;
  const exposedNorm  = axisProfile.exposedNorm ?? 0;
  const structureCoeff = axisProfile.structureCoeff ?? 1.0;

  // ── A. structuralVolatility: 구조 불안정 트리거 합산
  let structuralVolatility = 0;

  // 허투(rootNorm 낮고 exposedNorm 높음) — 뿌리 없이 떠 있는 상태
  if (exposedNorm >= 0.35 && rootNorm < 0.15) {
    structuralVolatility += 0.38;  // 강한 가산
  } else if (exposedNorm >= 0.25 && rootNorm < 0.20) {
    structuralVolatility += 0.20;  // 중간 가산
  }

  // critical 충
  const criticalClashes = (interactions.충 || []).filter(c => c.critical);
  structuralVolatility += criticalClashes.length * 0.18;

  // critical 형
  const criticalHyeong = (interactions.형 || []).filter(c => c.critical);
  structuralVolatility += criticalHyeong.length * 0.10;

  // 파격
  if (geok.broken) structuralVolatility += 0.20;

  // structureCoeff 편차 (1.0에서 많이 벗어날수록 불안정)
  structuralVolatility += Math.abs(structureCoeff - 1.0) * 0.30;

  // recovery: broken/critical 이 동반될 때만 약가산 (단독 가산 금지)
  if (geok.recovery && (geok.broken || criticalClashes.length >= 1)) {
    structuralVolatility += 0.08;
  }

  structuralVolatility = _clamp(structuralVolatility, 0, 1.0);

  // ── B. directionalAmbiguityBonus
  //    ambiguity 자체는 structuralVolatility가 일정 이상일 때만 보너스
  const ambiguous = Math.abs(ui) <= 0.16;
  const directionalAmbiguityBonus =
    (ambiguous && structuralVolatility >= 0.25)
      ? 0.15 * (1 - Math.abs(ui) / 0.16)  // ui가 0에 가까울수록 최대 0.15
      : 0;

  return _clamp(structuralVolatility + directionalAmbiguityBonus, 0, 1.0);
}

/* ─────────────────────────────────────────
   헬퍼 7: resolveRole
   ─────────────────────────────────────────
   score + ui + hrGap + volatility 를 종합해
   축의 방향성 기반 역할을 판정한다.

   핵심 원칙:
   - 45~46 점수대 무조건 중립 구멍 제거
   - 한신 = "방향성 애매 + 구조 트리거 존재" 일 때만
   - 기신 = 방향성이 명확히 음수
   - 중립 = 방향성도 약하고 조건부 작용성도 약한 경우만
───────────────────────────────────────── */
function resolveRole(score, ui, hrGap, volatility) {
  // 방향성 판정 기준
  const positiveDir = (ui >= 0.06)  || (hrGap >= 0.10);
  const negativeDir = (ui <= -0.06) || (hrGap <= -0.10);
  const ambiguousDir = Math.abs(ui) <= 0.16 && Math.abs(hrGap) <= 0.10;

  // ── 상단 구간
  if (score >= 66) return "용신";

  if (score >= 57) {
    // 부정 방향이 강하면 희신 강제 배정은 보수 처리 → 중립
    if (negativeDir && ui <= -0.12) return "중립";
    return "희신";
  }

  // ── 중간 구간 (45 ~ 56): 중립 남발 금지 구간
  if (score >= 45) {
    if (positiveDir)  return "희신";
    if (negativeDir)  return "기신";
    // 방향성 애매 + volatility 임계치 이상 → 한신
    if (ambiguousDir && volatility >= 0.30) return "한신";
    // 그 외 중립 (진짜 균형 상태)
    return "중립";
  }

  // ── 하단 구간 (44 이하): 자동 한신/기신 금지
  if (negativeDir)  return "기신";
  if (ambiguousDir && volatility >= 0.40) return "한신";
  return "중립";
}

/* ─────────────────────────────────────────
   헬퍼 8: mergeAxisRole
   ─────────────────────────────────────────
   groupRoleFull (그룹 레벨 판정) 과
   resolvedRole (score+방향성 판정) 을 합산.

   핵심 원칙:
   - groupRoleFull의 음성 앵커(기신/한신)를 보존한다
   - resolveRole은 보조 오버라이드로만 사용
   - 용신/희신 상단은 groupRoleFull 우선
   - 기신/한신은 양쪽 중 더 강한 신호를 선택
───────────────────────────────────────── */
function mergeAxisRole(groupRoleFull, resolvedRole, ui, hrGap, volatility) {
  const RANK = { "용신": 4, "희신": 3, "중립": 2, "한신": 1, "기신": 0 };
  const ambiguousDir = Math.abs(ui) <= 0.16 && Math.abs(hrGap) <= 0.10;
  const negativeDir  = (ui <= -0.06) || (hrGap <= -0.10);

  // [1] groupRoleFull이 용신/희신 → 기본 유지
  //     (단, resolvedRole이 기신이면 강등 가능)
  if (groupRoleFull === "용신") {
    if (resolvedRole === "기신" && negativeDir && ui <= -0.15) return "희신";
    return "용신";
  }
  if (groupRoleFull === "희신") {
    if (resolvedRole === "기신" && negativeDir && ui <= -0.15) return "기신";
    return "희신";
  }

  // [2] groupRoleFull이 기신/한신 → 음성 앵커 보존
  if (groupRoleFull === "기신") {
    // resolvedRole이 중립이면 groupRoleFull(기신) 유지
    if (resolvedRole === "중립") return "기신";
    // resolvedRole이 한신이면:
    //   "방향성 애매 + volatility 높음" 일 때만 한신 승격
    //   그렇지 않으면 기신 유지
    if (resolvedRole === "한신") {
      return (ambiguousDir && volatility >= 0.35) ? "한신" : "기신";
    }
    // resolvedRole도 기신이면 기신
    if (resolvedRole === "기신") return "기신";
    // resolvedRole이 희신/용신이면: 신호 충돌 → 중립으로 타협
    return "중립";
  }

  if (groupRoleFull === "한신") {
    // resolvedRole이 중립이면 한신 유지
    if (resolvedRole === "중립") return "한신";
    // resolvedRole이 기신이면: 방향성 명확히 음수면 기신 하향
    if (resolvedRole === "기신") {
      return negativeDir ? "기신" : "한신";
    }
    // resolvedRole도 한신이면 한신
    if (resolvedRole === "한신") return "한신";
    // resolvedRole이 희신이면: ambiguous 하면 한신 유지, 명확 양수면 중립
    if (resolvedRole === "희신") {
      return (!negativeDir && ui >= 0.06) ? "중립" : "한신";
    }
    return "한신";
  }

  // [3] groupRoleFull이 중립
  if (groupRoleFull === "중립") {
    // resolvedRole이 기신/한신이면 resolvedRole 채택 (음성 정보 반영)
    if (resolvedRole === "기신" || resolvedRole === "한신") return resolvedRole;
    // resolvedRole이 희신/용신이면 채택
    if (resolvedRole === "희신" || resolvedRole === "용신") return resolvedRole;
    return "중립";
  }

  // fallback
  return resolvedRole || groupRoleFull || "중립";
}

/* ─────────────────────────────────────────
   메인: computeResourceScores (V2 + 3단계 기초량 분리)
───────────────────────────────────────── */
function computeResourceScores(state) {
  const D       = window.SajuData;
  const pillars = state.pillars;
  const dayStem = pillars.day.stem;
  const gods    = state.gods;
  const vectors = state.vectors;
  const strength    = state.strength;
  const geok        = state.geok;
  const interactions = state.interactions;

  const GROUPS    = ["비겁","식상","재성","관성","인성"];
  const GROUP_MAP = {
    비겁: ["比肩","劫財"], 식상: ["食神","傷官"],
    재성: ["偏財","正財"], 관성: ["偏官","正官"], 인성: ["偏印","正印"],
  };

  // ── 3단계: 기초량
  const baseProfile = computeAxisBaseProfile(state);

  // ── 하위호환: 기존 필드명으로 재매핑
  const amountRaw = {};
  const rootPower = {};
  const stemPower = {};
  GROUPS.forEach(g => {
    amountRaw[g] = baseProfile[g].amountRaw;
    rootPower[g] = baseProfile[g].rootRaw;
    stemPower[g] = baseProfile[g].exposedRaw;
  });

  // ── STEP 2: 축별 보정 — 4단계 구조 + 5단계 usefulness
  const monthPower        = {};
  const structureAdj      = {};
  const structureCoeff_   = {};
  const structureCritical = {};
  const structureNotes_   = {};
  const rootNorm          = {};
  const stemNorm          = {};
  const effectiveRaw      = {};
  const usefulnessIdx     = {};
  const usefulnessAdj_    = {};
  const usefulnessReasons_ = {};

  const tenGodScores = computeTenGodClassicalScores(state);

  GROUPS.forEach(g => {
    monthPower[g] = baseProfile[g].monthCommandCoeff;
    rootNorm[g]   = Math.min(rootPower[g] / 2.2, 1.0);
    stemNorm[g]   = Math.min(stemPower[g] / 2.0, 1.0);

    const structObj        = getAxisStructureCoeff(g, state, baseProfile);
    structureAdj[g]        = structObj.delta;
    structureCoeff_[g]     = structObj.coeff;
    structureCritical[g]   = structObj.critical;
    structureNotes_[g]     = structObj.notes;

    const usefulObj          = getAxisUsefulnessIndex(g, state, baseProfile[g], tenGodScores);
    usefulnessIdx[g]         = usefulObj.index;
    usefulnessAdj_[g]        = usefulObj.adj;
    usefulnessReasons_[g]    = usefulObj.reasons;

    // effectiveRaw: 5단계 공식 유지
    effectiveRaw[g] =
      baseProfile[g].amountRaw
      * monthPower[g]
      * (1 + usefulObj.adj)
      * (1 + structureAdj[g]);
  });

  // 재성 식상 연결 보너스 제거 (6.5 보정 — 하드코딩으로 인한 체감 왜곡 제거)

  // ── STEP 3: 6단계 — absolutePower 기반 최종 점수 공식 (20~220 유지)
  // ─────────────────────────────────────────────────────────────────
  // absolutePower = baseProfile 값들 + structureCoeff + usefulnessAdj 곱셈 합성
  // shareRatio    = absolutePower 기반 상대 비중 (기존 effectiveRaw 기반에서 교체)
  // 최종 score    = powerBand + spreadBand + utilityBand + structureBand → 20~220
  // ─────────────────────────────────────────────────────────────────

  /* ── absolutePower 계산 헬퍼 (private)
     baseProfile.absoluteBasePower는
     computeAxisBaseProfile()에서 이미
     [amountNorm + rootNorm + exposedNorm] 혼합값에 monthCmd를 반영해
     계산된 기초 작동량이다.
     여기서는 structure/usefulness만 후단 보정하고,
     month/root/exposed를 다시 재계산하지 않는다. */
  function _computeAbsolutePower(g) {
    const ap = baseProfile[g];
    const sc = structureCoeff_[g];     // 4단계: 구조 보전도 계수 (0.72~1.18)
    const ua = usefulnessAdj_[g];      // 5단계: 유용성 보정값 (-0.22~+0.22)

    const base = ap.absoluteBasePower ?? 0;

    return _clamp(base * sc * (1 + ua), 0, 999);
  }

  // 5축 absolutePower 계산
  const absolutePower_ = {};
  GROUPS.forEach(g => { absolutePower_[g] = _computeAbsolutePower(g); });

  const totalAbsPow = GROUPS.reduce((s,g) => s + absolutePower_[g], 0) || 1;

  // shareRatio: absolutePower 기반으로 재계산
  const absShareRatio_ = {};
  GROUPS.forEach(g => { absShareRatio_[g] = absolutePower_[g] / totalAbsPow; });

  const helpRisk = computeHelpRisk(state);

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
    const absPow    = absolutePower_[g];
    const shareRat  = absShareRatio_[g];

    // ── presenceFloorBand: 약한 축 vs 거의 없는 축 분리 (바닥 올리기)
    const presenceCore =
      0.60 * _clamp(amountRaw[g] / 1.20, 0, 1) +
      0.25 * _clamp(rootPower[g] / 1.00, 0, 1) +
      0.15 * _clamp(stemPower[g] / 0.80, 0, 1);
    const nearAbsent =
      amountRaw[g] < 0.22 &&
      rootPower[g] < 0.18 &&
      stemPower[g] < 0.12;
    const presenceFloorBand =
      nearAbsent ? 0 : 12 + 18 * Math.pow(presenceCore, 0.72);

    // ── powerBand: 절대 작동량
    const powerBand = 85 * Math.tanh(absPow / 5.8);

    // ── spreadBand: 상위축 보너스만 (벌점 없음)
    const spreadBand = Math.max(0, 6 * Math.tanh((shareRat - 0.20) / 0.11));

    // ── utilityBand: 양수/음수 비대칭 — 불리축 음수 완화
    const ui = usefulnessIdx[g];
    const utilityBand = ui >= 0 ? 20 * ui : 7 * ui;

    // ── structureBand: 구조 보전도
    const structureBand = 14 * (structureCoeff_[g] - 1.0);

    const score = _clamp(
      Math.round(
        35 +
        presenceFloorBand +
        powerBand +
        spreadBand +
        utilityBand +
        structureBand
      ),
      25, 210
    );

    // ── ROLE 판정 (4단계 merge 구조) — score 계산과 완전 분리
    // [1] help/risk 먼저 선언 (TDZ 버그 수정)
    const { help, risk } = getGroupHelpRisk(g, helpRisk, GROUP_MAP);
    const hrGap = help - risk;

    // [2] groupRoleFull: getGroupRole() — 십신 기반 그룹 앵커
    const groupRoleFull = getGroupRole(g, gods, GROUP_MAP, ui, structureCoeff_[g]);

    // [3] volatility: 구조 트리거 기반 조건부 작용성 지수
    //     axisProfile에 필요한 값 주입 (computeHanVolatility 참조용)
    const axisProfileForVolatility = {
      usefulnessIndex: ui,
      rootNorm:        rootNorm[g],
      exposedNorm:     stemNorm[g],
      structureCoeff:  structureCoeff_[g],
    };
    const volatility = computeHanVolatility(axisProfileForVolatility, state);

    // [4] resolvedRole: score + 방향성 기반 보조 판정
    const resolvedRole = resolveRole(score, ui, hrGap, volatility);

    // [5] 최종 merge: groupRoleFull 음성 앵커 보존
    const role = mergeAxisRole(groupRoleFull, resolvedRole, ui, hrGap, volatility);

    console.log(
      `🎭 [role V6] ${g} score=${score} ui=${ui.toFixed(2)} hrGap=${hrGap.toFixed(2)} ` +
      `vol=${volatility.toFixed(2)} group=${groupRoleFull} resolved=${resolvedRole} => ${role}`
    );

    return {
      key:          g,
      score,
      status:       getStatus(score),
      role,
      desc:         DESCS[g],
      // 하위호환 필드 (기존 UI 참조용 — 전부 유지)
      amountRaw:    _round2(amountRaw[g]),
      shareRatio:   _round3(shareRat),       // absolutePower 기반으로 교체
      rootPower:    _round2(rootPower[g]),
      stemPower:    _round2(stemPower[g]),
      monthPower:   _round2(monthPower[g]),
      structureAdj: _round2(structureAdj[g]),
      effectiveRaw: _round2(effectiveRaw[g]),  // 내부 참조용 유지
      help:         _round2(help),
      risk:         _round2(risk),
      // 4단계 필드
      structureCoeff: _round3(structureCoeff_[g]),
      critical:       structureCritical[g],
      // 5단계 필드
      usefulnessIndex: _round3(usefulnessIdx[g]),
      usefulnessAdj:   _round3(usefulnessAdj_[g]),
      // 6단계 + 보정 필드
      absolutePower:      _round2(absPow),
      presenceFloorBand:  _round2(presenceFloorBand),
      powerBand:          _round2(powerBand),
      spreadBand:         _round2(spreadBand),
      utilityBand:        _round2(utilityBand),
      structureBand:      _round2(structureBand),
      // role debug (검증용 — score 불변)
      roleDebug: {
        groupRoleFull,
        resolvedRole,
        finalRole:          role,
        roleSource:         groupRoleFull === role ? "group"
                          : resolvedRole  === role ? "resolved" : "merged",
        ui:                 _round3(ui),
        hrGap:              _round3(hrGap),
        volatility:         _round3(volatility),
        positiveDirection:  (ui >= 0.06)  || (hrGap >= 0.10),
        negativeDirection:  (ui <= -0.06) || (hrGap <= -0.10),
        ambiguousDirection: Math.abs(ui) <= 0.16 && Math.abs(hrGap) <= 0.10,
      },
      _base: {
        ...baseProfile[g],
        structureNotes:    structureNotes_[g],
        usefulnessReasons: usefulnessReasons_[g],
      },
    };
  });

  const sorted    = [...axes].sort((a, b) => b.score - a.score);
  const strongest = sorted[0];
  const weakest   = sorted[sorted.length - 1];

  const summary = `${strongest.key}(${strongest.score}) 중심 · ${weakest.key}(${weakest.score}) 보완 필요`;

  console.log("🎯 [V6] 5축 자원 점수:",
    axes.map(a => `${a.key}:${a.score}(${a.role}|${a.roleDebug.groupRoleFull}→${a.roleDebug.resolvedRole}) abs=${a.absolutePower} ui=${a.usefulnessIndex}`).join(" ")
  );

  return {
    axes, strongest, weakest, summary,
    debug: {
      totalAmountRaw:    _round2(GROUPS.reduce((s,g)=>s+amountRaw[g],0)),
      totalEffectiveRaw: _round2(GROUPS.reduce((s,g)=>s+effectiveRaw[g],0)),
      totalAbsolutePow:  _round2(totalAbsPow),
      baseProfile,
    }
  };
}



/* =========================================================
   대운 완전 재계산 — buildFlowState (GPT 설계 v2)
   ─────────────────────────────────────────────────────────
   기존 buildExtendedStateWithExtraPillar() 대체
   입력: basePillars, flowPillars = [{ stem, branch, label }]
   출력: { pillars, vectors, strength, geok, gods, helpRisk, interactions, flowMeta }

   원칙:
     · vectors: 원국 + flowPillars 전부 합산
     · strength: 월령은 원국 월지 고정, 통근·투간은 flow 포함
     · geok: 원국 월지 주체, 투출/순도/파격/회복은 flow 포함
     · interactions: payload 기반 이벤트 (source/target/impactClass)
     · gods/helpRisk: 위 상태로 완전 재판정
   ========================================================= */

/* ── 공통 상수 ───────────────────────────────────────────── */
const ROLE_VALUE  = { "용신": 2, "희신": 1, "중립": 0, "기신": -1, "한신": -2 };
const POS_WEIGHT  = { year: 0.80, month: 1.70, day: 1.35, hour: 1.00, flow: 0.95 };
const TYPE_WEIGHT = { "충": 1.00, "형": 0.72, "파": 0.48, "해": 0.36, "합": 0.55 };
const PERF_TG_SET = new Set(["食神","傷官","偏財","正財","偏官","正官"]);
const SUPP_TG_SET = new Set(["正印","偏印","比肩","劫財","正官"]);

/* ── 유틸 (_clamp는 PART 10에서 이미 정의, _round2/_round3 신규) ── */
function _round2(x) { return Math.round(x * 100) / 100; }
function _round3(x) { return Math.round(x * 1000) / 1000; }

function _getRoleName(tg, gods) {
  if ((gods.yong?.tenGods || []).includes(tg)) return "용신";
  if ((gods.hee?.tenGods  || []).includes(tg)) return "희신";
  if ((gods.gi?.tenGods   || []).includes(tg)) return "기신";
  if ((gods.han?.tenGods  || []).includes(tg)) return "한신";
  return "중립";
}

function _getRankedMap(gods) {
  const m = {};
  (gods.ranked || []).forEach(x => { m[x.tg] = x.score; });
  return m;
}

function _getHelpRiskGap(tg, helpRisk) {
  const h = helpRisk?.tenGod?.help?.[tg] ?? 0.5;
  const r = helpRisk?.tenGod?.risk?.[tg] ?? 0.5;
  return h - r;
}

/* ─────────────────────────────────────────────────────────
   지지 payload 품질 계산
   evaluateBranchPayload(branch, pos, state)
   → { branch, pos, quality, perfMass, suppMass, rootWeight }
   ───────────────────────────────────────────────────────── */
function evaluateBranchPayload(branch, pos, state) {
  const D = window.SajuData;
  const dayStem = state.pillars.day.stem;
  const rankedMap = _getRankedMap(state.gods);
  const hs = D.HIDDEN_STEMS_RATIO[branch] || [];

  let qSum = 0;
  let ratioSum = 0;
  let perfMass = 0;
  let suppMass = 0;

  hs.forEach(({ stem, ratio }) => {
    const tg = getShishen(dayStem, stem);
    if (!tg) return;

    const role    = _getRoleName(tg, state.gods);
    const roleVal = ROLE_VALUE[role] ?? 0;
    const ranked  = rankedMap[tg] ?? 50;
    const gap     = _getHelpRiskGap(tg, state.helpRisk);

    const stemQuality =
      (ranked - 50) * 0.55 +
      roleVal * 12 +
      gap * 10;

    qSum     += ratio * stemQuality;
    ratioSum += ratio;

    if (PERF_TG_SET.has(tg)) perfMass += ratio;
    if (SUPP_TG_SET.has(tg)) suppMass += ratio;
  });

  const quality = ratioSum > 0 ? qSum / ratioSum : 0;
  return {
    branch,
    pos,
    quality,
    perfMass,
    suppMass,
    rootWeight: POS_WEIGHT[pos] ?? 1.0
  };
}

/* ─────────────────────────────────────────────────────────
   충돌 분류
   ───────────────────────────────────────────────────────── */
function _classifyImpact(sourceQ, targetQ) {
  if (sourceQ >= 8  && targetQ <= -8) return "cure";
  if (sourceQ <= -8 && targetQ >= 8)  return "destructive";
  if (sourceQ >= 8  && targetQ >= 8)  return "restructure";
  if (sourceQ <= -8 && targetQ <= -8) return "mixed";
  return "neutral";
}

/* ─────────────────────────────────────────────────────────
   이벤트 1개의 3축 delta 계산
   ───────────────────────────────────────────────────────── */
function _calcInteractionDelta(kind, critical, sourcePayload, targetPayload) {
  const typeW     = TYPE_WEIGHT[kind] ?? 0.5;
  const intensity = typeW * (critical ? 1.25 : 1.00) * (targetPayload.rootWeight || 1.0);

  const sourceQ    = sourcePayload.quality;
  const targetQ    = targetPayload.quality;
  const impactClass = _classifyImpact(sourceQ, targetQ);

  let perf = 0, supp = 0, fric = 0;

  if (impactClass === "cure") {
    perf += 7.5  * intensity;
    supp += 5.5  * intensity;
    fric += 2.8  * intensity;   // 충 자체의 흔들림은 남김
  } else if (impactClass === "destructive") {
    perf -= 10.0 * intensity;
    supp -= 8.0  * intensity;
    fric += 10.5 * intensity;
  } else if (impactClass === "restructure") {
    perf += 2.5  * intensity;
    supp -= 1.5  * intensity;
    fric += 6.0  * intensity;
  } else if (impactClass === "mixed") {
    perf += 1.0  * intensity;
    supp += 1.0  * intensity;
    fric += 5.0  * intensity;
  } else {
    fric += 4.0  * intensity;
  }

  // 성과/안정 축 직접 개입 추가 보정
  perf += (sourcePayload.perfMass - targetPayload.perfMass) * 2.0 * intensity;
  supp += (sourcePayload.suppMass - targetPayload.suppMass) * 1.8 * intensity;

  return { impactClass, perf, supp, fric };
}

/* ─────────────────────────────────────────────────────────
   payload 기반 상호작용 이벤트 생성
   detectInteractionsPayload(basePillars, flowPillars, state)
   · state: gods/helpRisk 이미 계산된 임시 state
   ───────────────────────────────────────────────────────── */
function detectInteractionsPayload(basePillars, flowPillars, state) {
  const D = window.SajuData;

  // 위치 레이블 맵
  const posMap = {
    year:  { label:"원국", pos:"year"  },
    month: { label:"원국", pos:"month" },
    day:   { label:"원국", pos:"day"   },
    hour:  { label:"원국", pos:"hour"  },
  };

  // 원국 지지 목록
  const natalSlots = [
    { branch: basePillars.year.branch,  label:"원국", pos:"year"  },
    { branch: basePillars.month.branch, label:"원국", pos:"month" },
    { branch: basePillars.day.branch,   label:"원국", pos:"day"   },
    { branch: basePillars.hour.branch,  label:"원국", pos:"hour"  },
  ];

  // flow 지지 목록 (대운/세운 등)
  const flowSlots = flowPillars.map(fp => ({
    branch: fp.branch,
    label:  fp.label || "대운",
    pos:    "flow"
  }));

  const allSlots     = [...natalSlots, ...flowSlots];
  const allBranches  = allSlots.map(s => s.branch);
  const KEY          = [basePillars.month.branch, basePillars.day.branch];

  function isCritical(bs) { return bs.some(b => KEY.includes(b)); }

  const events      = [];    // payload 이벤트 전체
  const legacyHap   = [];    // 합 (기존 형식 호환)
  const legacyChung = [];
  const legacyHyeong= [];
  const legacyPa    = [];
  const legacyHae   = [];
  const criticalHits= [];

  // 천간 합 (payload 없음, 단순 기록)
  const stems = [
    basePillars.year.stem, basePillars.month.stem,
    basePillars.day.stem,  basePillars.hour.stem,
    ...flowPillars.map(fp => fp.stem)
  ];
  for (const [a, b] of D.HEAVENLY_COMBINATIONS) {
    if (stems.includes(a) && stems.includes(b))
      legacyHap.push({ type:"천간오합", stems:[a,b] });
  }

  // 지지 육합
  for (const [a, b] of D.EARTHLY_SIX_COMBINATIONS) {
    if (allBranches.includes(a) && allBranches.includes(b)) {
      legacyHap.push({ type:"육합", branches:[a,b] });
    }
  }

  // 지지 삼합
  for (const g of D.EARTHLY_THREE_COMBINATIONS) {
    const cnt = allBranches.filter(b => g.branches.includes(b)).length;
    if (cnt >= 2) {
      legacyHap.push({
        type: cnt === 3 ? "삼합완성" : "삼합반합",
        branches: g.branches, element: g.element
      });
    }
  }

  // 합 모두 events에도 추가 (충완화에 활용)
  legacyHap.forEach(h => events.push({ kind:"합", ...h }));

  /* ── 충 ─────────────────────────────────────────────── */
  for (const [a, b] of D.EARTHLY_CLASHES) {
    if (!allBranches.includes(a) || !allBranches.includes(b)) continue;

    // flow가 때리는 경우 우선 판정
    const flowHitsNatal = flowSlots.some(fs => fs.branch === a || fs.branch === b);
    const srcSlot  = flowHitsNatal
      ? (flowSlots.find(fs => fs.branch === a || fs.branch === b))
      : (natalSlots.find(s => s.branch === a || s.branch === b));
    const tgtBranch = srcSlot.branch === a ? b : a;
    const tgtSlot  = allSlots.find(s => s.branch === tgtBranch && s !== srcSlot);
    if (!tgtSlot) continue;

    const critical = isCritical([srcSlot.branch, tgtSlot.branch]);
    const sourcePayload = evaluateBranchPayload(srcSlot.branch, srcSlot.pos, state);
    const targetPayload = evaluateBranchPayload(tgtSlot.branch, tgtSlot.pos, state);

    const ev = {
      kind:    "충",
      source:  { label: srcSlot.label, pos: srcSlot.pos, branch: srcSlot.branch },
      target:  { label: tgtSlot.label, pos: tgtSlot.pos, branch: tgtSlot.branch },
      critical,
      sourcePayload,
      targetPayload,
      branches: [srcSlot.branch, tgtSlot.branch],
      impactClass: null, perfDelta: 0, suppDelta: 0, fricDelta: 0
    };
    events.push(ev);
    legacyChung.push({ type:"충", branches: ev.branches, critical });
    if (critical) criticalHits.push(`충: ${srcSlot.branch}↔${tgtSlot.branch}`);
  }

  /* ── 형 ─────────────────────────────────────────────── */
  const SAMHYEONG = [["寅","巳","申"], ["丑","戌","未"]];
  for (const grp of SAMHYEONG) {
    const hits = grp.filter(b => allBranches.includes(b));
    if (hits.length >= 2) {
      const critical = isCritical(hits);
      const ev = {
        kind: "형", type:"삼형", branches: hits, critical,
        source: { pos:"flow" }, target: { pos:"month" },
        sourcePayload: evaluateBranchPayload(hits[0], "flow", state),
        targetPayload: evaluateBranchPayload(hits[1], "month", state),
        impactClass: null, perfDelta: 0, suppDelta: 0, fricDelta: 0
      };
      events.push(ev);
      legacyHyeong.push({ type:"삼형", branches:hits, critical });
      if (critical) criticalHits.push(`삼형: ${hits.join("↔")}`);
    }
  }
  if (allBranches.includes("子") && allBranches.includes("卯")) {
    const critical = isCritical(["子","卯"]);
    const ev = {
      kind:"형", type:"상형", branches:["子","卯"], critical,
      source:{ pos:"flow" }, target:{ pos:"day" },
      sourcePayload: evaluateBranchPayload("子","flow",state),
      targetPayload: evaluateBranchPayload("卯","day",state),
      impactClass:null, perfDelta:0, suppDelta:0, fricDelta:0
    };
    events.push(ev);
    legacyHyeong.push({ type:"상형", branches:["子","卯"], critical });
    if (critical) criticalHits.push(`상형: 子↔卯`);
  }
  for (const jb of ["辰","午","酉","亥"]) {
    if (allBranches.filter(x => x === jb).length >= 2) {
      const critical = isCritical([jb, jb]);
      const ev = {
        kind:"형", type:"자형", branches:[jb,jb], critical,
        source:{ pos:"flow" }, target:{ pos:"day" },
        sourcePayload: evaluateBranchPayload(jb,"flow",state),
        targetPayload: evaluateBranchPayload(jb,"day",state),
        impactClass:null, perfDelta:0, suppDelta:0, fricDelta:0
      };
      events.push(ev);
      legacyHyeong.push({ type:"자형", branches:[jb,jb], critical });
      if (critical) criticalHits.push(`자형: ${jb}${jb}`);
    }
  }

  /* ── 파 ─────────────────────────────────────────────── */
  const PA_PAIRS = [["子","酉"],["卯","午"],["辰","丑"],["未","戌"],["寅","亥"],["巳","申"]];
  for (const [a,b] of PA_PAIRS) {
    if (allBranches.includes(a) && allBranches.includes(b)) {
      const critical = isCritical([a,b]);
      const srcSlot  = allSlots.find(s => s.branch === a);
      const tgtSlot  = allSlots.find(s => s.branch === b);
      const ev = {
        kind:"파", type:"파", branches:[a,b], critical,
        source:{ pos: srcSlot?.pos || "flow" }, target:{ pos: tgtSlot?.pos || "day" },
        sourcePayload: evaluateBranchPayload(a, srcSlot?.pos||"flow", state),
        targetPayload: evaluateBranchPayload(b, tgtSlot?.pos||"day",  state),
        impactClass:null, perfDelta:0, suppDelta:0, fricDelta:0
      };
      events.push(ev);
      legacyPa.push({ type:"파", branches:[a,b], critical });
      if (critical) criticalHits.push(`파: ${a}↔${b}`);
    }
  }

  /* ── 해 ─────────────────────────────────────────────── */
  const HAE_PAIRS = [["子","未"],["丑","午"],["寅","巳"],["卯","辰"],["申","亥"],["酉","戌"]];
  for (const [a,b] of HAE_PAIRS) {
    if (allBranches.includes(a) && allBranches.includes(b)) {
      const critical = isCritical([a,b]);
      const srcSlot  = allSlots.find(s => s.branch === a);
      const tgtSlot  = allSlots.find(s => s.branch === b);
      const ev = {
        kind:"해", type:"해", branches:[a,b], critical,
        source:{ pos: srcSlot?.pos || "flow" }, target:{ pos: tgtSlot?.pos || "day" },
        sourcePayload: evaluateBranchPayload(a, srcSlot?.pos||"flow", state),
        targetPayload: evaluateBranchPayload(b, tgtSlot?.pos||"day",  state),
        impactClass:null, perfDelta:0, suppDelta:0, fricDelta:0
      };
      events.push(ev);
      legacyHae.push({ type:"해", branches:[a,b], critical });
      if (critical) criticalHits.push(`해: ${a}↔${b}`);
    }
  }

  return {
    events,                  // payload 이벤트 전체 (3축 delta 계산 전)
    합: legacyHap,
    충: legacyChung,
    형: legacyHyeong,
    파: legacyPa,
    해: legacyHae,
    criticalHits
  };
}

/* ─────────────────────────────────────────────────────────
   이벤트 전체 3축 delta 합산
   scoreDynamicInteractions(interactions)
   ───────────────────────────────────────────────────────── */
function scoreDynamicInteractions(interactions) {
  let perf = 0, supp = 0, fric = 0;

  (interactions.events || []).forEach(ev => {
    if (ev.kind === "합") return; // 합은 별도 처리
    if (!ev.sourcePayload || !ev.targetPayload) return;

    const d = _calcInteractionDelta(
      ev.kind,
      ev.critical,
      ev.sourcePayload,
      ev.targetPayload
    );
    ev.impactClass = d.impactClass;
    ev.perfDelta   = d.perf;
    ev.suppDelta   = d.supp;
    ev.fricDelta   = d.fric;

    perf += d.perf;
    supp += d.supp;
    fric += d.fric;
  });

  return { perf, supp, fric };
}

/* ─────────────────────────────────────────────────────────
   buildFlowState(basePillars, flowPillars=[])
   GPT 설계의 buildFlowState — 기존 buildExtendedStateWithExtraPillar 대체
   ───────────────────────────────────────────────────────── */
function buildFlowState(basePillars, flowPillars = []) {
  const D       = window.SajuData;
  const dayStem = basePillars.day.stem;
  const dayEl   = D.WUXING_STEM[dayStem];

  /* 1. vectors: 원국 + flowPillars 전부 합산 */
  const baseVec  = calculateVectors(basePillars);
  const elements = { ...baseVec.elements };
  const tenGods  = { ...baseVec.tenGods };

  flowPillars.forEach(fp => {
    // 천간
    const eEl = D.WUXING_STEM[fp.stem];
    if (eEl) elements[eEl] = (elements[eEl] || 0) + 1.0;
    const eSS = getShishen(dayStem, fp.stem);
    if (eSS) tenGods[eSS] = (tenGods[eSS] || 0) + 1.0;
    // 지장간 (HIDDEN_STEMS_RATIO 기반)
    (D.HIDDEN_STEMS_RATIO[fp.branch] || []).forEach(({ stem, ratio }) => {
      const el = D.WUXING_STEM[stem];
      if (el) elements[el] = (elements[el] || 0) + ratio;
      const ss = getShishen(dayStem, stem);
      if (ss) tenGods[ss] = (tenGods[ss] || 0) + ratio;
    });
  });

  const vectors = { ...baseVec, elements, tenGods,
    baseVectors: baseVec.baseVectors, flowVectors: baseVec.flowVectors };

  /* 2. strength: 월령은 원국 월지 고정, 통근/투간은 flow 포함 */
  function calcFlowStrength() {
    const monthBranch = basePillars.month.branch;

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

    function rootScore() {
      const slots = [
        { branch: basePillars.year.branch,  w: 0.8  },
        { branch: basePillars.month.branch, w: 1.6  },
        { branch: basePillars.day.branch,   w: 1.3  },
        { branch: basePillars.hour.branch,  w: 1.0  },
        ...flowPillars.map(fp => ({ branch: fp.branch, w: 0.85 }))
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

    function stemScore() {
      let s = 0;
      const stemList = [
        basePillars.year.stem, basePillars.month.stem, basePillars.hour.stem,
        ...flowPillars.map(fp => fp.stem)
      ];
      stemList.forEach(stem => {
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

    const ss = seasonScore(), rs = rootScore(), sts = stemScore();
    const total = 50 + ss + rs + sts;
    const label = total >= 66 ? "신강" : total >= 36 ? "중화" : "신약";
    return { score: total, label, breakdown: { season: ss, root: rs, stem: sts } };
  }

  const strength = calcFlowStrength();

  /* 3. geok: 원국 월지 주체, 투출/순도/파격/회복은 flow 포함 */
  const geok = determineGeok(basePillars, vectors);

  // flow 천간 투출 보정
  const monthHiddenPrimary = (D.HIDDEN_STEMS_RATIO[basePillars.month.branch] || [])[0];
  if (monthHiddenPrimary) {
    const mPrimSS = getShishen(dayStem, monthHiddenPrimary.stem);
    flowPillars.forEach(fp => {
      const fpSS = getShishen(dayStem, fp.stem);
      if (mPrimSS && fpSS === mPrimSS) {
        geok.purity = Math.min(1.0, geok.purity + 0.08);
      }
    });

    // flow 지지 vs 월지 충 처리 (재편형/파괴형 구분)
    flowPillars.forEach(fp => {
      for (const [a, b] of D.EARTHLY_CLASHES) {
        if ((a === basePillars.month.branch && b === fp.branch) ||
            (b === basePillars.month.branch && a === fp.branch)) {

          const fpSS       = getShishen(dayStem, fp.stem);
          const fpIsPerfAxis = fpSS && PERF_TG_SET.has(fpSS);

          let otherPerfRoot = 0;
          [basePillars.year.branch, basePillars.day.branch,
           basePillars.hour.branch, fp.branch].forEach(br => {
            (D.HIDDEN_STEMS_RATIO[br] || []).forEach(({ stem, ratio }) => {
              if (PERF_TG_SET.has(getShishen(dayStem, stem)) && ratio >= 0.25) otherPerfRoot++;
            });
          });

          const totalTGv = Object.values(vectors.tenGods).reduce((a, bv) => a + bv, 0) || 1;
          let suppAmount = 0;
          Object.keys(vectors.tenGods).forEach(tg => {
            if (SUPP_TG_SET.has(tg)) suppAmount += (vectors.tenGods[tg] || 0);
          });
          const suppRatioEst = suppAmount / totalTGv;

          let restructureSignals = 0;
          if (fpIsPerfAxis)       restructureSignals++;
          if (otherPerfRoot >= 2) restructureSignals++;
          if (suppRatioEst >= 0.22) restructureSignals++;
          if (geok.recovery)      restructureSignals++;

          if (restructureSignals >= 3) {
            geok.purity = Math.max(0.1, geok.purity - 0.07);
            geok.broken = true;
          } else if (restructureSignals >= 2) {
            geok.purity = Math.max(0.1, geok.purity - 0.11);
            geok.broken = true;
          } else {
            geok.purity = Math.max(0.1, geok.purity - 0.15);
            geok.broken = true;
          }
          break;
        }
      }
    });
  }

  /* 4. 임시 state로 gods/helpRisk 먼저 산출 (payload 계산에 필요) */
  const mergedPillars = {
    ...basePillars,
    ...(flowPillars[0] ? { daeun: { stem: flowPillars[0].stem, branch: flowPillars[0].branch } } : {})
  };

  const tempState = { pillars: mergedPillars, vectors, strength, geok, interactions: { 합:[], 충:[], 형:[], 파:[], 해:[], criticalHits:[], events:[] } };
  const gods    = classifyYongHeeGiHan(tempState);
  const helpRisk = computeHelpRisk({ ...tempState, gods });

  /* 5. interactions: payload 기반 이벤트 생성 */
  const stateForPayload = { pillars: mergedPillars, vectors, strength, geok, gods, helpRisk };
  const interactions = detectInteractionsPayload(basePillars, flowPillars, stateForPayload);

  /* 6. dynamicImpact: 이벤트 3축 delta 합산 */
  const dynamicImpact = scoreDynamicInteractions(interactions);

  /* 7. flowMeta */
  const flowMeta = {
    flowPillars,
    dynamicImpact
  };

  const finalState = {
    pillars: mergedPillars,
    vectors,
    strength,
    geok,
    gods,
    helpRisk,
    interactions,
    dynamicImpact,
    flowMeta
  };

  // viability는 score 함수 내에서 계산 (상태 공유)
  finalState.viability = evaluatePerformanceViabilityNew(finalState, null);

  return finalState;
}

/* ── 하위 호환: buildExtendedStateWithExtraPillar → buildFlowState로 위임 */
function buildExtendedStateWithExtraPillar(basePillars, extraPillar) {
  return buildFlowState(basePillars, [extraPillar]);
}

/* ── 하위 호환: detectInteractionsExtended → 빈 결과 (interactions 이미 포함) */
function detectInteractionsExtended(basePillars, extraPillar) {
  // buildFlowState 내부에서 detectInteractionsPayload로 대체됨
  // 직접 호출 시 기존 형식 반환 (호환성)
  const D = window.SajuData;
  const interactions = { 합:[], 충:[], 형:[], 파:[], 해:[], criticalHits:[] };
  const branches = [basePillars.year.branch, basePillars.month.branch,
                    basePillars.day.branch,  basePillars.hour.branch,
                    extraPillar.branch];
  const KEY = [basePillars.month.branch, basePillars.day.branch];
  function isCritical(bs) { return bs.some(b => KEY.includes(b)); }
  for (const [a,b] of D.EARTHLY_CLASHES) {
    if (branches.includes(a) && branches.includes(b)) {
      const critical = isCritical([a,b]);
      interactions.충.push({ type:"충", branches:[a,b], critical });
      if (critical) interactions.criticalHits.push(`충: ${a}↔${b}`);
    }
  }
  return interactions;
}

/* =========================================================
   성과축 실행 가능성 평가 (GPT v2 — payload 통합)
   evaluatePerformanceViabilityNew(state, baseState)
   ========================================================= */
function evaluatePerformanceViabilityNew(state, baseState) {
  const D       = window.SajuData;
  const { vectors, gods, geok, strength, interactions, pillars } = state;
  const dayStem = pillars.day?.stem;
  const totalTG = Object.values(vectors.tenGods).reduce((a,b) => a+b, 0) || 1;

  // A. 성과축 절대량
  let perfAmount = 0;
  PERF_TG_SET.forEach(tg => { perfAmount += (vectors.tenGods[tg] || 0); });
  const perfRatio = perfAmount / totalTG;
  const absScore  = Math.min(perfRatio / 0.45, 1.0) * 30;

  // B. 성과축 변화량
  let perfAxisDelta = 0, deltaScore = 0;
  if (baseState) {
    const baseTotalTG = Object.values(baseState.vectors.tenGods).reduce((a,b) => a+b, 0) || 1;
    let perfBase = 0;
    PERF_TG_SET.forEach(tg => { perfBase += (baseState.vectors.tenGods[tg] || 0); });
    perfAxisDelta = (perfAmount / totalTG) - (perfBase / baseTotalTG);
    deltaScore    = _clamp(perfAxisDelta * 60, -8, 16);
  }

  // C. 투출
  let exposedCount = 0;
  const stemSlots = [
    pillars.year?.stem, pillars.month?.stem, pillars.hour?.stem,
    pillars.daeun?.stem
  ].filter(Boolean);
  stemSlots.forEach(stem => {
    if (PERF_TG_SET.has(getShishen(dayStem, stem))) exposedCount++;
  });
  const exposedScore = Math.min(exposedCount * 8, 20);

  // D. 통근
  let rootedCount = 0;
  const branchSlots = [
    pillars.year?.branch, pillars.month?.branch,
    pillars.day?.branch,  pillars.hour?.branch, pillars.daeun?.branch
  ].filter(Boolean);
  branchSlots.forEach(br => {
    (D.HIDDEN_STEMS_RATIO[br] || []).forEach(({ stem, ratio }) => {
      if (PERF_TG_SET.has(getShishen(dayStem, stem)) && ratio >= 0.25) rootedCount++;
    });
  });
  const rootedScore = Math.min(rootedCount * 6, 18);

  // E. support carrier
  let supportCarrier = 0;
  ["正印","偏印","比肩","正官"].forEach(tg => { supportCarrier += (vectors.tenGods[tg] || 0); });
  const suppRatio = supportCarrier / totalTG;
  const suppScore = suppRatio >= 0.20 && suppRatio <= 0.45 ? 14
    : suppRatio > 0 ? _clamp(suppRatio / 0.20, 0, 1) * 10 : 0;

  // F. 구조 손상 (payload 기반)
  let structuralPenalty = 0;
  if (geok.broken && !geok.recovery) structuralPenalty += 8;
  (interactions.충 || []).forEach(c => {
    if (!c.critical) return;
    const directHit = (c.branches || []).some(br => {
      return (D.HIDDEN_STEMS_RATIO[br] || []).some(({ stem }) =>
        PERF_TG_SET.has(getShishen(dayStem, stem)));
    });
    structuralPenalty += directHit ? 6 : 2;
  });
  structuralPenalty = Math.min(structuralPenalty, 22);

  const raw = absScore + deltaScore + exposedScore + rootedScore + suppScore - structuralPenalty;
  const viabilityScore = Math.round(_clamp(raw + 20, 0, 100));

  return {
    score: viabilityScore,          // ← state.viability.score로 접근
    viabilityScore,
    perfAxisDelta,
    exposedCount,
    rootedCount,
    supportCarrier: suppRatio,
    structuralPenalty,
    isViable: viabilityScore >= 55,
    _parts: { absScore, deltaScore, exposedScore, rootedScore, suppScore, structuralPenalty }
  };
}

// 하위 호환 (기존 함수명 유지)
function evaluatePerformanceViability(state, baseState) {
  return evaluatePerformanceViabilityNew(state, baseState);
}

/* =========================================================
   [A] 성과 점수 — scoreFlowPerformance (GPT 설계)
   ========================================================= */
function scoreFlowPerformance(state, baseState) {
  const totalTG = Object.values(state.vectors.tenGods).reduce((a,b)=>a+b,0) || 1;
  let perfAmount = 0;
  PERF_TG_SET.forEach(tg => { perfAmount += (state.vectors.tenGods[tg] || 0); });
  const perfRatio = perfAmount / totalTG;

  // 절대량
  const absScore =
    perfRatio >= 0.24 && perfRatio <= 0.60 ? 30 :
    perfRatio < 0.24 ? 30 * (perfRatio / 0.24) :
    30 * Math.max(0, 1 - (perfRatio - 0.60) / 0.34);

  // viability
  const viability = state.viability || evaluatePerformanceViabilityNew(state, baseState);
  const viabilityScore = viability.score ?? viability.viabilityScore ?? 50;
  const viabilityBonus = _clamp((viabilityScore - 50) * 0.36, -8, 18);

  // 格 상태
  const geokBonus =
    state.geok.recovery ? 8 :
    state.geok.broken   ? Math.max(-6, (state.geok.purity - 0.5) * 8) :
                          state.geok.purity * 16;

  // dynamicImpact (이미 계산)
  const dynamic = state.dynamicImpact || { perf:0, supp:0, fric:0 };

  // 신약 명식 회복 전환 (핵심)
  let recoveryConversion = 0;
  if (baseState) {
    const baseSS = baseState.strength.score;
    const nowSS  = state.strength.score;
    if (baseSS < 40 && nowSS > baseSS && viabilityScore >= 60) {
      recoveryConversion = _clamp(
        (nowSS - baseSS) * 0.45 + Math.max(0, dynamic.supp) * 0.30,
        0, 8
      );
    }
  }

  // 변화량 delta
  let deltaBonus = 0;
  if (baseState) {
    const baseTotal = Object.values(baseState.vectors.tenGods).reduce((a,b)=>a+b,0) || 1;
    let basePerf = 0;
    PERF_TG_SET.forEach(tg => { basePerf += (baseState.vectors.tenGods[tg] || 0); });
    const perfDelta = perfRatio - (basePerf / baseTotal);
    deltaBonus = _clamp(perfDelta * 26, -6, 12);
  }

  const raw =
    absScore +
    viabilityBonus +
    geokBonus +
    deltaBonus +
    dynamic.perf +
    recoveryConversion;

  // debug
  state._perfDebug = {
    perfRatio: _round3(perfRatio),
    absScore: _round2(absScore),
    viabilityBonus: _round2(viabilityBonus),
    geokBonus: _round2(geokBonus),
    deltaBonus: _round2(deltaBonus),
    dynamicPerf: _round2(dynamic.perf),
    recoveryConversion: _round2(recoveryConversion),
    perfDelta: perfRatio,
    purityDelta: state.geok.purity - (baseState?.geok?.purity ?? state.geok.purity)
  };

  return Math.round(_clamp(raw, 0, 100));
}

/* =========================================================
   [B] 마찰 점수 — scoreFlowFriction (GPT 설계)
   ========================================================= */
function scoreFlowFriction(state) {
  const dynamic = state.dynamicImpact || { perf:0, supp:0, fric:0 };

  // 극단 신강/신약
  const ss = state.strength.score;
  const extreme =
    ss < 26 ? (26 - ss) * 0.55 :
    ss > 78 ? (ss - 78) * 0.40 : 0;

  // 格 파괴 부담
  const geokBurden =
    state.geok.broken && !state.geok.recovery
      ? 8 + Math.max(0, (0.65 - state.geok.purity) * 10)
      : 0;

  // 기신/한신 활성
  let giHanBurden = 0;
  [...(state.gods.gi?.tenGods || []), ...(state.gods.han?.tenGods || [])].forEach(tg => {
    const v = state.vectors.tenGods[tg] || 0;
    if (v > 0.8) giHanBurden += Math.min(v * 2.5, 8);
  });

  const raw = Math.max(0, dynamic.fric) + extreme + geokBurden + giHanBurden;

  state._fricDebug = {
    dynamicFric: _round2(dynamic.fric),
    extreme: _round2(extreme),
    geokBurden: _round2(geokBurden),
    giHanBurden: _round2(giHanBurden),
    // 호환용
    productiveCount: 0,
    isProductive: false,
    strengthDelta: 0,
    purityDelta2: 0,
    perfAxisDelta: 0,
    viabilityScore: state.viability?.score ?? 50,
    suppRatio: "0.000",
    geokFriction: geokBurden
  };

  return Math.round(_clamp(raw, 0, 100));
}

/* =========================================================
   [C] 기반 점수 — scoreFlowSupport (GPT 설계)
   ========================================================= */
function scoreFlowSupport(state, baseState) {
  const ss = state.strength.score;

  // strength 절대량 (중화 구간 최적)
  const strengthBase =
    ss >= 40 && ss <= 62 ? 30 :
    ss >= 30 ? 30 - Math.abs(ss - 51) * 0.40 :
               30 - (30 - ss) * 0.60;

  // 중화 접근 보너스
  let closenessBonus = 0;
  if (baseState) {
    const before = Math.abs(baseState.strength.score - 51);
    const now    = Math.abs(ss - 51);
    closenessBonus = _clamp((before - now) * 0.8, -4, 10);
  }

  // 안정축 carrier
  const totalTG = Object.values(state.vectors.tenGods).reduce((a,b)=>a+b,0) || 1;
  let suppAmount = 0;
  ["正印","偏印","比肩","劫財","正官"].forEach(tg => {
    suppAmount += (state.vectors.tenGods[tg] || 0);
  });
  const suppRatio = suppAmount / totalTG;
  const carrier =
    suppRatio >= 0.16 && suppRatio <= 0.42 ? 20 :
    suppRatio < 0.16 ? 20 * (suppRatio / 0.16) :
    20 * Math.max(0, 1 - (suppRatio - 0.42) / 0.28);

  // 회복 보너스
  const recoverBonus = state.geok.recovery ? 8 : 0;

  // dynamicImpact
  const dynamic = state.dynamicImpact || { perf:0, supp:0, fric:0 };

  const raw =
    strengthBase +
    closenessBonus +
    carrier +
    recoverBonus +
    dynamic.supp +
    Math.min((state.interactions?.합?.length || 0) * 2, 8);

  state._suppDebug = {
    strengthDelta: ss - (baseState?.strength?.score ?? ss),
    closenessGain: closenessBonus,
    stableShiftBonus: 0
  };

  return Math.round(_clamp(raw, 0, 100));
}

/* ── 하위 호환: 기존 scoreDaeunPerformance/Friction/Support → 새 함수로 위임 */
function scoreDaeunPerformance(mergedState, baseState) {
  return scoreFlowPerformance(mergedState, baseState);
}
function scoreDaeunFriction(mergedState, baseState) {
  return scoreFlowFriction(mergedState);
}
function scoreDaeunSupport(mergedState, baseStrengthScore, baseState) {
  return scoreFlowSupport(mergedState, baseState);
}

/* =========================================================
   정규화 계층 (기존 유지 — 스케일 정상화)
   ========================================================= */
function _piecewiseLinear(raw, anchors) {
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

function normalizeDaeunPerformance(raw) {
  const anchors = [
    [  0, 10], [ 25, 22], [ 40, 40], [ 50, 50],
    [ 65, 68], [ 80, 85], [ 92, 95], [100, 98]
  ];
  return Math.round(_clamp(_piecewiseLinear(raw, anchors), 0, 100));
}

function normalizeDaeunSupport(raw) {
  const anchors = [
    [  0, 10], [ 25, 22], [ 40, 40], [ 50, 50],
    [ 65, 70], [ 80, 88], [ 92, 95], [100, 98]
  ];
  return Math.round(_clamp(_piecewiseLinear(raw, anchors), 0, 100));
}

function normalizeDaeunFriction(raw) {
  const anchors = [
    [  0, 12], [ 10, 24], [ 20, 38], [ 30, 50],
    [ 45, 63], [ 60, 79], [ 75, 90], [100, 98]
  ];
  return Math.round(_clamp(_piecewiseLinear(raw, anchors), 0, 100));
}

/* =========================================================
   종합 점수 조합 (GPT 설계 — 신약 회복형 반영)
   overall = 50 + 0.51*(p-50) + 0.25*(s-50) - 0.19*(f-50)
   ========================================================= */
function computeDaeunOverall(performanceScore, frictionScore, supportScore, profileName = "overall") {
  let p_w = 0.51, s_w = 0.25, f_w = 0.19;
  if (profileName === "money") { p_w = 0.55; s_w = 0.19; f_w = 0.19; }
  if (profileName === "love")  { p_w = 0.40; s_w = 0.31; f_w = 0.23; }
  const raw = 50
    + p_w * (performanceScore - 50)
    + s_w * (supportScore     - 50)
    - f_w * (frictionScore    - 50);
  return Math.round(_clamp(raw, 0, 100));
}

/* =========================================================
   대운 3축 통합 계산 진입점
   ========================================================= */
function computeDaeunScore(mergedState, baseStrengthScore, baseState, profileName = "overall") {
  // viability가 없으면 계산
  if (!mergedState.viability) {
    mergedState.viability = evaluatePerformanceViabilityNew(mergedState, baseState);
  }

  const rawPerformance = scoreFlowPerformance(mergedState, baseState);
  const rawFriction    = scoreFlowFriction(mergedState);
  const rawSupport     = scoreFlowSupport(mergedState, baseState);

  const performance = normalizeDaeunPerformance(rawPerformance);
  const friction    = normalizeDaeunFriction(rawFriction);
  const support     = normalizeDaeunSupport(rawSupport);

  const overall = computeDaeunOverall(performance, friction, support, profileName);

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
    `perfDelta=${pd.perfDelta?.toFixed?.(3)}`,
    `purityDelta=${pd.purityDelta?.toFixed?.(3)}`,
    `strengthDelta=${sd.strengthDelta}`,
    `closenessGain=${sd.closenessGain?.toFixed?.(1)}`,
    `profile=${profileName}`
  );

  // 대운 이벤트 요약 로그
  const events = mergedState.interactions?.events || [];
  const clashEvents = events.filter(ev => ev.kind === "충" && ev.impactClass);
  if (clashEvents.length > 0) {
    console.debug("  💥 [충 이벤트]",
      clashEvents.map(ev =>
        `${ev.source?.branch||"?"}→${ev.target?.branch||"?"} [${ev.impactClass}] perf:${ev.perfDelta?.toFixed(1)} supp:${ev.suppDelta?.toFixed(1)} fric:${ev.fricDelta?.toFixed(1)}`
      ).join(" / ")
    );
  }

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
  buildExtendedStateWithExtraPillar,  // → buildFlowState로 위임 (하위 호환)
  buildFlowState,                      // ★ GPT v2 메인 state 빌더
  computeResourceScores,
  // 3단계 신규: 기초량 계산 전용 계층
  computeAxisBaseProfile,
  getAxisMonthCommandCoeff,
  getAxisRootCoeff,
  getAxisExposedCoeff,
  // 4단계 신규: 구조 보전도 계층
  getAxisStructureCoeff,
  // 5단계 신규: 유용성 지수 계층
  computeTenGodClassicalScores,
  getAxisUsefulnessIndex,
  // payload 기반 상호작용 (GPT v2)
  evaluateBranchPayload,
  detectInteractionsPayload,
  scoreDynamicInteractions,
  // 실행 가능성 헬퍼
  evaluatePerformanceViability,
  evaluatePerformanceViabilityNew,
  // 3축 점수 (GPT v2)
  scoreFlowPerformance,
  scoreFlowFriction,
  scoreFlowSupport,
  // 하위 호환 이름
  scoreDaeunPerformance,
  scoreDaeunFriction,
  scoreDaeunSupport,
  // normalize 계층
  normalizeDaeunPerformance,
  normalizeDaeunSupport,
  normalizeDaeunFriction,
  // 종합
  computeDaeunOverall,
  computeDaeunScore,
  PROFILE_PRESETS
};

console.log("✅ saju_engine.js 로드 완료");
