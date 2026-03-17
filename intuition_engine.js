/* =========================================================
   직관(직장 통찰력) 분석 엔진 (intuition_engine.js) v3.1
   ─────────────────────────────────────────────────────────
   ⚠️ WUXING_STEM / HIDDEN_STEMS 자체 중복 정의 없음
      → window.SajuData 참조
   ⚠️ getShishen 자체 정의 없음
      → saju_core.js 전역 함수 사용
   ⚠️ 입력: baseState (vectors, strength, geok, interactions)
   ⚠️ 능력분석은 원국 고정 (대운 영향 없음)

   v3.1 변경 (최소 수정 — 천장 완화):
     · scoreFromZ 상단 구간 소폭 완화
     · 하드캡 → soft penalty 교체 (순위 유지)
     · insightTriangle 소량 가산점 반영
     · pairBonus 트리거 완화, weakPenalty 완화
     · 90+ 차단 조건 완화

   3지표 (직장 통찰력):
     문제 포착력 (40%) / 위험 감지력 (22%) / 본질 해석력 (38%)
   ========================================================= */

console.log("🔥 intuition_engine.js v3.1 로드 시작");

(function () {
  'use strict';

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const pos   = x => Math.max(0, x);

  // ── 등급 산출
  function grade(s) {
    if (s >= 90) return "S";
    if (s >= 80) return "A";
    if (s >= 70) return "B";
    if (s >= 60) return "C";
    return "D";
  }
  function gradeLabel(s) {
    if (s >= 90) return "최상위";
    if (s >= 80) return "상위";
    if (s >= 70) return "중상";
    if (s >= 60) return "중위";
    return "하위";
  }

  // ── z-score 기반 점수 변환
  const DIST = {
    org:     { mean:1.584, std:0.492 },
    risk:    { mean:0.913, std:0.331 },
    context: { mean:1.649, std:0.460 },
  };

  function scoreFromZ(raw, dist) {
    const z = (raw - dist.mean) / Math.max(dist.std, 0.01);
    // z <= 1 구간: 기존 그대로 유지 (순위 보존)
    if (z <= -2.0) return 45;
    if (z <= -1.0) return 50 + 8   * (z + 2.0);
    if (z <=  0.0) return 58 + 12  * (z + 1.0);
    if (z <=  1.0) return 70 + 12  * z;
    // z > 1 구간만 상단 완화 (기존 82→90 → 82→92로 확장)
    if (z <=  2.0) return 82 + 10  * (z - 1.0);
    if (z <=  2.7) return 92 + (4 / 0.7) * (z - 2.0);
    if (z <=  3.2) return 96 + (2 / 0.5) * (z - 2.7);
    return 97 + Math.min(1, z - 3.2);
  }

  function overPen(val, thr, str) { return pos(val - thr) * str; }
  function mildBonus(val, lo, hi, add) { return (val >= lo && val <= hi) ? add : 0; }

  // ── 천간 위치 가중치 (일간 제외)
  const STEM_W  = { year:0.85, month:1.20, hour:0.95 };
  const ROLE_BASE  = { "정기":0.60, "중기":0.25, "여기":0.15 };
  const MONTH_BOOST = { "정기":1.20, "중기":1.08, "여기":1.03 };

  // ── 십신 → 그룹 매핑
  const TG_GROUP = {
    "比肩":"비겁","劫財":"비겁",
    "食神":"식상","傷官":"식상",
    "偏財":"재성","正財":"재성",
    "偏官":"관성","正官":"관성",
    "偏印":"편인","正印":"인성",
  };

  /* ════════════════════════════════════════════════
     buildContributions: 표면/내부 분리 기여도 계산
     원국 고정 (daeun 포함 안 함)
  ════════════════════════════════════════════════ */
  function buildContributions(pillars, dayStem) {
    const D = window.SajuData;
    const contrib = {
      surface:     { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0, 편인:0 },
      hidden:      { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0, 편인:0 },
      surfaceEl:   { wood:0, fire:0, earth:0, metal:0, water:0 },
      hiddenEl:    { wood:0, fire:0, earth:0, metal:0, water:0 },
      monthHidden: { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0, 편인:0 },
      monthEl:     { wood:0, fire:0, earth:0, metal:0, water:0 },
      roots:       { 인성:0, 관성:0, 목:0, 금:0, 편인:0 },
      stemOut:     { 인성:false, 관성:false, 목:false, 금:false },
    };

    if (!pillars || !dayStem) return contrib;

    // L1: 표면 천간 (연/월/시) — 원국만
    [
      { stem: pillars.year?.stem,  pos: "year"  },
      { stem: pillars.month?.stem, pos: "month" },
      { stem: pillars.hour?.stem,  pos: "hour"  },
    ].forEach(({ stem, pos: p }) => {
      if (!stem) return;
      const w   = STEM_W[p] || 0.85;
      const el  = D.WUXING_STEM[stem];
      const ss  = getShishen(dayStem, stem);
      const grp = TG_GROUP[ss];
      if (el)  contrib.surfaceEl[el] = (contrib.surfaceEl[el] || 0) + w;
      if (grp) contrib.surface[grp]  = (contrib.surface[grp]  || 0) + w;
      if (grp === "인성" || grp === "편인") contrib.stemOut.인성 = true;
      if (grp === "관성")                   contrib.stemOut.관성 = true;
      if (el  === "wood")                   contrib.stemOut.목   = true;
      if (el  === "metal")                  contrib.stemOut.금   = true;
    });

    // L2+L3: 지장간 (4지지) — 원국만
    [
      { branch: pillars.year?.branch,  isMonth: false },
      { branch: pillars.month?.branch, isMonth: true  },
      { branch: pillars.day?.branch,   isMonth: false },
      { branch: pillars.hour?.branch,  isMonth: false },
    ].forEach(({ branch, isMonth }) => {
      if (!branch) return;
      (D.HIDDEN_STEMS_BRANCH[branch] || []).forEach(({ stem, role }) => {
        const base  = ROLE_BASE[role]  ?? 0.15;
        const boost = isMonth ? (MONTH_BOOST[role] ?? 1.0) : 1.0;
        const w     = base * boost;
        const el    = D.WUXING_STEM[stem];
        const ss    = getShishen(dayStem, stem);
        const grp   = TG_GROUP[ss];
        if (el)  contrib.hiddenEl[el] = (contrib.hiddenEl[el] || 0) + w;
        if (grp) contrib.hidden[grp]  = (contrib.hidden[grp]  || 0) + w;
        if (isMonth) {
          if (el)  contrib.monthEl[el]       = (contrib.monthEl[el]       || 0) + w;
          if (grp) contrib.monthHidden[grp]  = (contrib.monthHidden[grp]  || 0) + w;
        }
        if (grp === "인성" || grp === "편인") contrib.roots.인성 += w;
        if (grp === "관성")                   contrib.roots.관성 += w;
        if (el  === "wood")                   contrib.roots.목   += w;
        if (el  === "metal")                  contrib.roots.금   += w;
        if (grp === "편인")                   contrib.roots.편인 += w;
      });
    });

    return contrib;
  }

  /* ════════════════════════════════
     안정성 지표 (L5: 구조 안정층)
  ════════════════════════════════ */
  function buildStability(baseState, dayStem) {
    const D      = window.SajuData;
    const geok   = baseState.geok   || {};
    const str    = baseState.strength || { score:50 };
    const pillars = baseState.pillars;

    const geokPurity = geok.purity ?? 0.5;
    const geokBroken = geok.broken ?? false;

    // 월령 적합도 (일간 vs 월지 계절)
    const season    = D.SEASON_MAP?.[pillars.month?.branch] || "spring";
    const seasonEl  = D.SEASON_ELEMENT?.[season] || "wood";
    const dayEl     = D.WUXING_STEM[dayStem];
    let monthFit = 0;
    if (seasonEl === dayEl) monthFit = 1.0;
    else if (D.WUXING_GENERATES[seasonEl] === dayEl) monthFit = 0.6;
    else if (D.WUXING_CONTROLS[seasonEl]  === dayEl) monthFit = -0.4;
    else monthFit = 0.1;

    // 통근 점수 (일간이 지장간에 뿌리가 있는가)
    let rootScore = 0;
    [pillars.year, pillars.month, pillars.day, pillars.hour].forEach((p, i) => {
      const w = [0.8, 1.6, 1.3, 1.0][i];
      (D.HIDDEN_STEMS_RATIO[p?.branch] || []).forEach(({ stem, ratio }) => {
        const se = D.WUXING_STEM[stem];
        if (se === dayEl) rootScore += ratio * w * 0.5;
      });
    });
    rootScore = Math.min(rootScore, 2.0);

    // 투간 지원도
    let stemSupport = 0;
    [pillars.year?.stem, pillars.month?.stem, pillars.hour?.stem].forEach(stem => {
      if (!stem) return;
      const se = D.WUXING_STEM[stem];
      if (se === dayEl) stemSupport += 0.4;
      else if (D.WUXING_GENERATES[se] === dayEl) stemSupport += 0.25;
    });
    stemSupport = Math.min(stemSupport, 1.5);

    return { geokPurity, geokBroken, monthFit, rootScore, stemSupport };
  }

  /* ════════════════════════════════
     교란 지표 (L6: 형/충)
  ════════════════════════════════ */
  function buildInterferenceLevel(baseState) {
    const interactions = baseState.interactions || { 충:[], 형:[] };
    const chung = interactions.충.reduce((s, c) => s + (c.critical ? 1.5 : 0.8), 0);
    const hyung = (interactions.형?.length || 0) * 0.6;
    return { chung, hyung, total: chung + hyung };
  }

  /* ════════════════════════════════
     복합 파생 지표
  ════════════════════════════════ */
  function calcInsightTriangle(ci_인성, ci_관성, elWood) {
    return (ci_인성 * 0.5 + ci_관성 * 0.4 + elWood * 0.1);
  }

  function calcNoiseIndex(c, IL, stab) {
    const rawNoise = IL.total * 0.5
      + pos(c.surface.비겁 - 0.35) * 0.8
      + pos(c.hidden.비겁  - 0.40) * 0.5;
    return Math.min(rawNoise, 2.0);
  }

  function calcStabilityIndex(stab, noiseIndex) {
    return Math.max(0,
      stab.geokPurity * 0.4
      + Math.max(0, stab.monthFit) * 0.3
      + stab.rootScore * 0.15
      + stab.stemSupport * 0.1
      - noiseIndex * 0.1
    );
  }

  /* ════════════════════════════════
     십신 기여도 합산 (표면+숨김)
  ════════════════════════════════ */
  function ci(c, grp) {
    const total = Object.values(c.surface).reduce((s,v)=>s+v,0)
                + Object.values(c.hidden).reduce((s,v)=>s+v,0);
    if (total === 0) return 0;
    return ((c.surface[grp]||0) + (c.hidden[grp]||0)) / total;
  }

  function elTotal(c, el) {
    const total = Object.values(c.surfaceEl).reduce((s,v)=>s+v,0)
                + Object.values(c.hiddenEl).reduce((s,v)=>s+v,0);
    if (total === 0) return 0;
    return ((c.surfaceEl[el]||0) + (c.hiddenEl[el]||0)) / total;
  }

  /* ════════════════════════════════
     타입 / 코멘트
  ════════════════════════════════ */
  function workInsightType(org, risk, ctx) {
    if (org >= 88 && risk >= 86)
      return { name:"문제-위험형", desc:"문제를 먼저 포착하고 위험을 먼저 잡는 직장형 통찰" };
    if (org >= 86 && org > risk && org > ctx)
      return { name:"문제포착형", desc:"판의 구조와 문제를 남보다 먼저 읽어내는 통찰" };
    if (risk >= 86 && risk > org && risk >= ctx)
      return { name:"위험감지형", desc:"일이 터지기 전에 위험 지점을 먼저 감지하는 통찰" };
    if (ctx >= 84 && ctx > org && ctx > risk)
      return { name:"본질해석형", desc:"표면보다 본질과 맥락을 꿰뚫어 보는 통찰" };
    return { name:"균형형", desc:"문제 포착·위험 감지·본질 해석이 고르게 발달한 유형" };
  }

  function workInsightComment(org, risk, ctx) {
    const items = [
      { name:"문제 포착력", score:org  },
      { name:"위험 감지력", score:risk },
      { name:"본질 해석력", score:ctx  },
    ].sort((a,b) => b.score - a.score);
    return {
      strength: `강점: ${items[0].name}, ${items[1].name}`,
      weakness: `보완: ${items[2].name} (${items[2].score}점)`,
    };
  }

  /* ════════════════════════════════
     메인 계산 함수
  ════════════════════════════════ */
  function compute(baseState) {
    if (!baseState || !baseState.pillars) {
      console.warn("⚠️ IntuitionEngine: baseState 없음");
      return _fallback();
    }

    const dayStem = baseState.pillars.day?.stem;
    if (!dayStem) return _fallback();

    const c    = buildContributions(baseState.pillars, dayStem);
    const stab = buildStability(baseState, dayStem);
    const IL   = buildInterferenceLevel(baseState);

    const ci_인성 = ci(c, "인성");
    const ci_편인 = ci(c, "편인");
    const ci_관성 = ci(c, "관성");
    const ci_식상 = ci(c, "식상");
    const ci_비겁 = ci(c, "비겁");
    const ci_재성 = ci(c, "재성");

    const elWood  = elTotal(c, "wood");
    const elFire  = elTotal(c, "fire");
    const elEarth = elTotal(c, "earth");
    const elMetal = elTotal(c, "metal");
    const elWater = elTotal(c, "water");

    const insightTriangle = calcInsightTriangle(ci_인성, ci_관성, elWood);
    const noiseIndex      = calcNoiseIndex(c, IL, stab);
    const stabilityIndex  = calcStabilityIndex(stab, noiseIndex);

    const { geokPurity, monthFit, rootScore, stemSupport } = stab;

    console.log(`🔍 [IE v3] 십신: 인${ci_인성.toFixed(2)} 관${ci_관성.toFixed(2)} 식${ci_식상.toFixed(2)} 비${ci_비겁.toFixed(2)} 재${ci_재성.toFixed(2)}`);
    console.log(`🔍 [IE v3] 오행: 목${elWood.toFixed(2)} 화${elFire.toFixed(2)} 토${elEarth.toFixed(2)} 금${elMetal.toFixed(2)} 수${elWater.toFixed(2)}`);
    console.log(`🔍 [IE v3] 안정: 格순도=${geokPurity.toFixed(2)} 월령=${monthFit.toFixed(2)} 통근=${rootScore.toFixed(2)} 투간=${stemSupport.toFixed(2)} 잡음=${noiseIndex.toFixed(2)}`);

    // ── 1. 문제 포착력 (40%)
    const raw_structureError =
      1.95 * elWood
      + 1.35 * ci_관성
      + 0.85 * elEarth
      + 1.00 * geokPurity
      + 0.20 * elMetal
      - 0.45 * noiseIndex;

    let s_struct = scoreFromZ(raw_structureError, DIST.org);
    // 하드캡 제거 → soft penalty (순위 영향 최소, 천장만 완화)
    if (elWood < 0.14)       s_struct -= pos(0.14 - elWood) * 40;   // 부족분 비례 감점
    else if (elWood < 0.18)  s_struct -= pos(0.18 - elWood) * 20;
    if (ci_관성 < 0.18)      s_struct -= pos(0.18 - ci_관성) * 25;
    s_struct = clamp(s_struct, 45, 98);

    // ── 2. 위험 감지력 (22%) — raw 식/캡 기존 그대로 유지
    const raw_riskPre =
      1.75 * ci_관성
      + 0.75 * elWood
      + 0.45 * elEarth
      + 0.25 * elMetal
      + 0.20 * stabilityIndex
      - 0.18 * overPen(ci_재성, 0.31, 1.0)
      - 0.20 * overPen(ci_식상, 0.31, 1.0)
      - 0.20 * noiseIndex;

    let s_risk = scoreFromZ(raw_riskPre, DIST.risk);
    // 기존 하드캡 유지 (위험 감지력은 보수적 기준 유지)
    if (ci_관성 < 0.22)   s_risk = Math.min(s_risk, 82);
    if (elWood  < 0.15)   s_risk = Math.min(s_risk, 86);
    if (elMetal < 0.10)   s_risk = Math.min(s_risk, 90);
    s_risk = clamp(s_risk, 45, 98);

    // ── 3. 본질 해석력 (38%)
    const raw_essence =
      1.55 * elEarth
      + 1.05 * elWood
      + 0.70 * ci_인성
      + 0.65 * rootScore
      + 0.55 * stemSupport
      + mildBonus(ci_식상, 0.14, 0.26, 0.18)
      - 0.35 * overPen(ci_재성, 0.30, 1.0)
      - 0.35 * noiseIndex;

    let s_essence = scoreFromZ(raw_essence, DIST.context);
    // 하드캡 제거 → soft penalty
    if (elEarth   < 0.18)  s_essence -= pos(0.18 - elEarth)   * 22;
    if (elWood    < 0.14)  s_essence -= pos(0.14 - elWood)     * 30;
    if (rootScore < 0.28)  s_essence -= pos(0.28 - rootScore)  * 12;
    s_essence = clamp(s_essence, 45, 98);

    // ── 총점 합성 (가중치 변경: 40/22/38)
    const baseTotal = 0.40 * s_struct + 0.22 * s_risk + 0.38 * s_essence;

    // insightTriangle 소량 가산 (최대 +1.5, 순위 역전 방지)
    const triBonus  = Math.min(insightTriangle * 1.8, 1.5);

    // pairBonus: 트리거 84→82로 완화
    const pairCore  = (s_struct + s_risk) / 2;
    const pairBonus = Math.max(0, pairCore - 82) * 0.32;

    // weakPenalty: 2.0→1.2로 완화
    const weakPenalty = [s_struct, s_risk].filter(v => v < 78).length >= 2 ? 1.2 : 0;

    let insightTotal = baseTotal + triBonus + pairBonus - weakPenalty;
    insightTotal = clamp(insightTotal, 45, 97);

    // 90+ 차단 완화: 기존 n90<2 → n90<1 (1개 이상이면 90+ 허용)
    const n90 = [s_struct >= 88, s_risk >= 86, s_essence >= 84].filter(Boolean).length;
    if (insightTotal >= 90 && n90 < 1) insightTotal = Math.min(insightTotal, 89);

    insightTotal = Math.round(clamp(insightTotal, 45, 97));

    const sub1 = Math.round(s_struct);
    const sub2 = Math.round(s_risk);
    const sub3 = Math.round(s_essence);

    console.log(`📊 [IE v3.1] 문제포착${sub1} 위험감지${sub2} 본질해석${sub3} → 총점${insightTotal} (tri+${triBonus.toFixed(1)} pair+${pairBonus.toFixed(1)} weak-${weakPenalty})`);

    const typeObj = workInsightType(sub1, sub2, sub3);
    const comment = workInsightComment(sub1, sub2, sub3);

    return {
      insightTotal,
      typeName: typeObj.name,
      typeDesc: typeObj.desc,
      comment,
      subs6: [
        { id:1, name:"문제 포착력", score:sub1, grade:grade(sub1), gradeLabel:gradeLabel(sub1) },
        { id:2, name:"위험 감지력", score:sub2, grade:grade(sub2), gradeLabel:gradeLabel(sub2) },
        { id:3, name:"본질 해석력", score:sub3, grade:grade(sub3), gradeLabel:gradeLabel(sub3) },
      ],
      categories: {
        Insight: { score:insightTotal, grade:grade(insightTotal), percent:gradeLabel(insightTotal) }
      },
      overloadRisk: 0,
      debug: {
        ci: { 인성:ci_인성.toFixed(3), 관성:ci_관성.toFixed(3), 식상:ci_식상.toFixed(3) },
        el: { wood:elWood.toFixed(3), earth:elEarth.toFixed(3), metal:elMetal.toFixed(3) },
        geokPurity, monthFit, rootScore, stemSupport,
        noiseIndex, stabilityIndex,
        raw: {
          structureError: raw_structureError.toFixed(3),
          riskPre:        raw_riskPre.toFixed(3),
          essence:        raw_essence.toFixed(3),
        },
        triBonus: triBonus.toFixed(3),
        n90Conditions: n90,
      }
    };
  }

  function _fallback() {
    return {
      insightTotal:50, typeName:"균형형", typeDesc:"",
      comment: { strength:"(데이터 없음)", weakness:"" },
      subs6:[], categories:{ Insight:{ score:50, grade:"C", percent:"중위" } },
      overloadRisk:0,
    };
  }

  window.IntuitionEngine = { compute };
  console.log("✅ IntuitionEngine v3.1 로드 완료");
})();
