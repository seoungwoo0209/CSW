/* =========================================================
   직관 능력 분석 엔진 (intuition_engine.js) v6.0
   ─────────────────────────────────────────────────────────
   6층 계층 계산:
     L1. 표면 노출층  — 천간에 무엇이 드러났는가
     L2. 내부 구동층  — 지장간에 무엇이 숨어 있는가
     L3. 월령/계절층  — 월지가 어떤 기운을 실어주는가
     L4. 십신 관계층  — 십신이 어떤 구조를 이루는가
     L5. 구조 안정층  — 격/통근/투간/root/purity
     L6. 교란/자극층  — 형/충/파/해: 민감도인지 잡음인지

   6지표 (가중치):
     구조 독해력 22% / 패턴 해석력 16% / 핵심 추출력 14%
     리스크 식별력 18% / 전략 구상력 16% / 통찰 응집력 14%

   절대 원칙:
     - 표면(천간/지지) + 내부(지장간) 분리
     - 십신 기여도 함수로 계산
     - water 직접 주재료화 금지
     - spike/noise 직접 보너스 금지
   ========================================================= */

console.log("🔥 intuition_engine.js v6.0 로드");

(function () {
  'use strict';

  // ── 기초 유틸
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const pos   = x => Math.max(0, x);
  const safeN = x => (isNaN(x) || !isFinite(x)) ? 0 : x;

  // ── 십신 한자 → 한글 그룹 매핑
  const TG_GROUP = {
    "比肩":"비겁","劫財":"비겁",
    "食神":"식상","傷官":"식상",
    "偏財":"재성","正財":"재성",
    "偏官":"관성","正官":"관성",
    "偏印":"편인","正印":"인성",
  };
  // 편인은 별도 처리 (인성과 유사하나 과다 시 부작용 큼)
  const TG_GROUP_FINE = {
    "比肩":"비겁","劫財":"비겁",
    "食神":"식상","傷官":"식상",
    "偏財":"재성","正財":"재성",
    "偏官":"관성","正官":"관성",
    "偏印":"편인","正印":"정인",
  };

  // ── 천간 오행 테이블 (saju_core와 동일)
  const WUXING_STEM = {
    "甲":"wood","乙":"wood","丙":"fire","丁":"fire","戊":"earth",
    "己":"earth","庚":"metal","辛":"metal","壬":"water","癸":"water"
  };

  // ── 지장간 데이터 (role: 정기=본기, 중기, 여기)
  const HIDDEN_STEMS = {
    "子":[{s:"壬",r:"여기"},{s:"癸",r:"정기"}],
    "丑":[{s:"癸",r:"여기"},{s:"辛",r:"중기"},{s:"己",r:"정기"}],
    "寅":[{s:"戊",r:"여기"},{s:"丙",r:"중기"},{s:"甲",r:"정기"}],
    "卯":[{s:"甲",r:"여기"},{s:"乙",r:"정기"}],
    "辰":[{s:"乙",r:"여기"},{s:"癸",r:"중기"},{s:"戊",r:"정기"}],
    "巳":[{s:"戊",r:"여기"},{s:"庚",r:"중기"},{s:"丙",r:"정기"}],
    "午":[{s:"丙",r:"여기"},{s:"己",r:"중기"},{s:"丁",r:"정기"}],
    "未":[{s:"丁",r:"여기"},{s:"乙",r:"중기"},{s:"己",r:"정기"}],
    "申":[{s:"戊",r:"여기"},{s:"壬",r:"중기"},{s:"庚",r:"정기"}],
    "酉":[{s:"庚",r:"여기"},{s:"辛",r:"정기"}],
    "戌":[{s:"辛",r:"여기"},{s:"丁",r:"중기"},{s:"戊",r:"정기"}],
    "亥":[{s:"戊",r:"여기"},{s:"甲",r:"중기"},{s:"壬",r:"정기"}],
  };

  // 역할 → 기본 비율 (정기=주기운=0.60)
  const ROLE_BASE = { "정기":0.60, "중기":0.25, "여기":0.15 };
  // 월지 보정 계수
  const MONTH_BOOST = { "정기":1.20, "중기":1.08, "여기":1.03 };

  // 천간 위치 가중치 (일간 제외)
  const STEM_W = { year:0.85, month:1.20, hour:0.95, daeun:0.60 };

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

  // ── raw → 0~100 (tanh 스케일, 진폭 46)
  // scale은 각 지표 특성에 맞게 역산 보정
  function toScore(raw, scale) {
    return clamp(50 + 46 * Math.tanh(safeN(raw) / Math.max(0.15, scale)), 2, 98);
  }

  // ── 패널티 헬퍼
  function overPen(val, thr, str)                     { return pos(val - thr) * str; }
  function overPenWeak(val, thr, pair, pairThr, str)  {
    return (val > thr && pair < pairThr) ? pos(val - thr) * str : 0;
  }
  function mildBonus(val, lo, hi, add)                { return (val >= lo && val <= hi) ? add : 0; }

  // ════════════════════════════════════════════════════════
  // ── L1~L4: 표면/내부/월령 분리 계산 + 십신 contribution
  // ════════════════════════════════════════════════════════
  function buildContributions(pillars, dayStem, getShishenFn) {
    // 결과 구조
    const contrib = {
      // 십신 그룹별 기여 (표면/숨김 분리)
      surface: { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0, 편인:0 },
      hidden:  { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0, 편인:0 },
      // 오행 기여 (표면/숨김 분리)
      surfaceEl: { wood:0, fire:0, earth:0, metal:0, water:0 },
      hiddenEl:  { wood:0, fire:0, earth:0, metal:0, water:0 },
      // 월지 지장간 기여 (별도 추적)
      monthHidden: { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0, 편인:0 },
      monthEl:     { wood:0, fire:0, earth:0, metal:0, water:0 },
      // 통찰 재료별 root 확인 (지지에 뿌리 있는지)
      roots: { 인성:0, 관성:0, 목:0, 금:0, 편인:0 },
      // 투간 확인 (천간에 드러난 핵심 재료)
      stemOut: { 인성:false, 관성:false, 목:false, 금:false },
    };

    if (!pillars || !dayStem || !getShishenFn) return contrib;

    const monthBranch = pillars.month?.branch;

    // ── L1: 표면 천간 (연/월/시 + 대운)
    const stemSlots = [
      { stem: pillars.year?.stem,  pos: "year"  },
      { stem: pillars.month?.stem, pos: "month" },
      { stem: pillars.hour?.stem,  pos: "hour"  },
      { stem: pillars.daeun?.stem, pos: "daeun" },
    ];
    stemSlots.forEach(({ stem, pos: p }) => {
      if (!stem) return;
      const w    = STEM_W[p] || 0.85;
      const el   = WUXING_STEM[stem];
      const shen = getShishenFn(dayStem, stem);
      const grp  = TG_GROUP_FINE[shen];
      if (el) contrib.surfaceEl[el] = (contrib.surfaceEl[el]||0) + w;
      if (grp) contrib.surface[grp] = (contrib.surface[grp]||0) + w;
      // 투간 확인
      if (grp === "인성" || grp === "편인") contrib.stemOut.인성 = true;
      if (grp === "관성")                   contrib.stemOut.관성 = true;
      if (el  === "wood")                   contrib.stemOut.목   = true;
      if (el  === "metal")                  contrib.stemOut.금   = true;
    });

    // ── L2+L3: 지장간 (4지지 + 대운지지)
    const branchSlots = [
      { branch: pillars.year?.branch,  isMonth: false },
      { branch: pillars.month?.branch, isMonth: true  },
      { branch: pillars.day?.branch,   isMonth: false },
      { branch: pillars.hour?.branch,  isMonth: false },
      { branch: pillars.daeun?.branch, isMonth: false },
    ];
    branchSlots.forEach(({ branch, isMonth }) => {
      if (!branch) return;
      const stems = HIDDEN_STEMS[branch];
      if (!stems) return;
      stems.forEach(({ s: stem, r: role }) => {
        const base  = ROLE_BASE[role] ?? 0.15;
        const boost = isMonth ? (MONTH_BOOST[role] ?? 1.0) : 1.0;
        const w     = base * boost;
        const el    = WUXING_STEM[stem];
        const shen  = getShishenFn(dayStem, stem);
        const grp   = TG_GROUP_FINE[shen];
        if (el) contrib.hiddenEl[el] = (contrib.hiddenEl[el]||0) + w;
        if (grp) contrib.hidden[grp] = (contrib.hidden[grp]||0) + w;
        // 월지 별도 추적 (L3)
        if (isMonth) {
          if (el)  contrib.monthEl[el]       = (contrib.monthEl[el]||0) + w;
          if (grp) contrib.monthHidden[grp]  = (contrib.monthHidden[grp]||0) + w;
        }
        // root 확인 (지장간에 뿌리 = 통찰 재료의 안정성)
        if (grp === "인성" || grp === "편인") contrib.roots.인성 += w;
        if (grp === "관성")                   contrib.roots.관성 += w;
        if (el  === "wood")                   contrib.roots.목   += w;
        if (el  === "metal")                  contrib.roots.금   += w;
      });
    });

    return contrib;
  }

  // ════════════════════════════════════════════════════════
  // ── L4: 십신 기여도 함수 (통찰력 관점)
  // ════════════════════════════════════════════════════════
  // 각 함수는 0~1 스케일의 "통찰 기여 강도"를 반환

  // 인성 기여: 해석·의미화·흡수·개념화 (편인 포함하되 약하게)
  function insightContrib_인성(c) {
    const total = (c.surface.인성 + c.hidden.인성) * 1.0
                + (c.surface.편인 + c.hidden.편인) * 0.55;
    const monthBoost = c.monthHidden.인성 * 0.4 + c.monthHidden.편인 * 0.2;
    const raw = total + monthBoost;
    const pen = overPen(raw, 1.4, 0.35);   // 과다: 생각 과잉·정리 지연
    return clamp(safeN(raw - pen) / 1.8, 0, 1);
  }

  // 관성 기여: 긴장감지·리스크인식·질서읽기·경계
  function insightContrib_관성(c) {
    const total = (c.surface.관성 + c.hidden.관성) * 1.0;
    const monthBoost = c.monthHidden.관성 * 0.45;
    const raw = total + monthBoost;
    return clamp(safeN(raw) / 1.5, 0, 1);
  }

  // 식상 기여: 정리·출력·결론화 (과다 시 분산)
  function insightContrib_식상(c) {
    const total = (c.surface.식상 + c.hidden.식상) * 1.0;
    const raw   = total;
    const pen   = overPen(raw, 1.2, 0.4);  // 과다: 산만
    return clamp(safeN(raw - pen) / 1.4, 0, 1);
  }

  // 비겁 기여: 주체성·판단유지 (적정=보조, 과다=독선)
  function insightContrib_비겁(c) {
    const total = (c.surface.비겁 + c.hidden.비겁) * 1.0;
    return clamp(Math.min(safeN(total), 0.22 * 4) / (0.22 * 4), 0, 1);
    // 0.22×4=0.88 이하까지만 선형 보조 (그 이상은 flat)
  }

  // 재성 기여: 현실연결·외부가치 (과다=기회 중심 얕은 통찰)
  function insightContrib_재성(c) {
    const total = (c.surface.재성 + c.hidden.재성) * 1.0;
    const raw   = total;
    const pen   = overPen(raw, 1.3, 0.5);
    return clamp(safeN(raw - pen) / 1.4, 0, 1);
  }

  // ── 오행 기여 (표면+내부 합산, 정규화)
  function elTotal(c, el) {
    return safeN((c.surfaceEl[el]||0) + (c.hiddenEl[el]||0));
  }

  // ════════════════════════════════════════════════════════
  // ── L5: 구조 안정 파생지표
  // ════════════════════════════════════════════════════════
  function buildStabilityLayer(baseState, c) {
    const geok      = baseState.geok || {};
    const geokPurity = typeof geok.purity === 'number' ? clamp(geok.purity, 0, 1) : 0.50;
    const geokBroken = geok.broken ? 1 : 0;

    // monthFit: 월지 지장간에 통찰 재료(인성/관성/목/금)가 얼마나 있는가
    const mh = c.monthHidden;
    const me = c.monthEl;
    const monthFit = clamp(
      (mh.인성 + mh.편인) * 0.35
      + mh.관성           * 0.35
      + (me.wood||0)      * 0.20
      + (me.metal||0)     * 0.20
      + geokPurity        * 0.30,
    0, 1);

    // rootScore: 핵심 십신이 지장간에 뿌리를 두는가
    const rootScore = clamp(
      Math.min(c.roots.인성 / 0.8, 1) * 0.30
      + Math.min(c.roots.관성 / 0.6, 1) * 0.30
      + Math.min(c.roots.목   / 0.5, 1) * 0.20
      + Math.min(c.roots.금   / 0.4, 1) * 0.20,
    0, 1);

    // stemSupport: 핵심 재료가 천간에 투출되어 있는가
    const stemSupport = clamp(
      (c.stemOut.인성 ? 0.35 : 0)
      + (c.stemOut.관성 ? 0.35 : 0)
      + (c.stemOut.목   ? 0.15 : 0)
      + (c.stemOut.금   ? 0.15 : 0),
    0, 1);

    return { geokPurity, geokBroken, monthFit, rootScore, stemSupport };
  }

  // ════════════════════════════════════════════════════════
  // ── L6: 교란/자극층
  // ════════════════════════════════════════════════════════
  function buildInteractionLayer(baseState) {
    const I    = baseState.interactions || {};
    const arrN = v => Array.isArray(v) ? v.length : (Number(v)||0);
    const chung = arrN(I["충"]);
    const hyung = arrN(I["형"]);
    const pa    = arrN(I["파"]);
    const hae   = arrN(I["해"]);
    const he    = arrN(I["합"]);
    const total = chung + hyung + pa + hae;

    // coreBreak: 월지나 일지를 직접 충/파하면 추가 패널티
    const coreBreak = (baseState.geok?.broken ? 0.20 : 0);

    // 적정 수준 (1~2개, 구조 안정 조건 충족 시) → 리스크 감지 보조
    const sensitivityBonus = (total <= 2) ? 0.06 : 0;

    // 과다 → noise
    const rawNoise = total * 0.12 + coreBreak;
    const noiseIndex = clamp(rawNoise, 0, 0.50);

    return { chung, hyung, pa, hae, he, total, sensitivityBonus, noiseIndex };
  }

  // ════════════════════════════════════════════════════════
  // ── insightTriangle: 인성+관성+목 삼각 결합
  // 셋 중 하나만 높아도 크게 오르지 않음
  // ════════════════════════════════════════════════════════
  function calcInsightTriangle(c_인성, c_관성, elWood) {
    // min으로 세 값의 동시 충족을 강제
    const raw = Math.min(c_인성, c_관성, clamp(elWood / 1.0, 0, 1));
    return clamp(raw * 1.6, 0, 1);  // 1.6배 증폭 후 상한 1
  }

  // ════════════════════════════════════════════════════════
  // ── 분산 패널티 (인성만 강하고 관성/목/금이 약한 경우)
  // ════════════════════════════════════════════════════════
  function calcDispersionPen(c_인성, c_관성, elWood, elWater) {
    let pen = 0;
    if (c_인성 >= 0.6 && c_관성 < 0.25 && elWood < 0.20) pen += 0.08;
    if (elWater >= 0.35 && elWood < 0.18 && c_관성 < 0.20) pen += 0.10;
    return pen;
  }

  // ════════════════════════════════════════════════════════
  // ── noiseIndex 전체 합산 (L5 + L6)
  // ════════════════════════════════════════════════════════
  function calcNoiseIndex(c, IL, stab) {
    const { noiseIndex: iNoise } = IL;
    // 인성 과다, 수 과다, 비겁 과다도 noise에 기여
    const hiddenWater = (c.hiddenEl.water||0) + (c.surfaceEl.water||0);
    const hiddenBiGup = (c.hidden.비겁||0) + (c.surface.비겁||0);
    const extraNoise  =
      overPen((c.hidden.인성 + c.surface.인성 + c.hidden.편인 + c.surface.편인), 1.5, 0.12)
      + overPen(hiddenWater, 1.2, 0.10)
      + overPen(hiddenBiGup, 1.0, 0.10)
      + (stab.geokBroken ? 0.08 : 0);
    return clamp(iNoise + extraNoise, 0, 0.55);
  }

  // ════════════════════════════════════════════════════════
  // ── stabilityIndex 종합
  // ════════════════════════════════════════════════════════
  function calcStabilityIndex(stab, noiseIndex) {
    return clamp(
      stab.geokPurity * 0.30
      + stab.rootScore  * 0.25
      + stab.monthFit   * 0.25
      + (1 - noiseIndex) * 0.20,
    0, 1);
  }

  // ════════════════════════════════════════════════════════
  // 메인 compute
  // ════════════════════════════════════════════════════════
  function compute(baseState) {
    // ── getShishen 함수 확보
    const getShishenFn = (typeof getShishen === 'function') ? getShishen
        : (window.SajuEngine?.getShishen) ? window.SajuEngine.getShishen
        : null;

    if (!getShishenFn) {
      console.error("❌ getShishen 함수 없음 — 십신 판정 불가");
      return _fallback(baseState);
    }

    const pillars = baseState.pillars;
    const dayStem = pillars?.day?.stem;
    if (!dayStem) {
      console.error("❌ dayStem 없음");
      return _fallback(baseState);
    }

    // ── 6층 계산 ─────────────────────────────────────────
    const c   = buildContributions(pillars, dayStem, getShishenFn);  // L1~L4
    const stab = buildStabilityLayer(baseState, c);                   // L5
    const IL   = buildInteractionLayer(baseState);                    // L6

    // ── 십신 기여도 (0~1)
    const ci_인성 = insightContrib_인성(c);
    const ci_관성 = insightContrib_관성(c);
    const ci_식상 = insightContrib_식상(c);
    const ci_비겁 = insightContrib_비겁(c);
    const ci_재성 = insightContrib_재성(c);

    // ── 오행 합산 (표면+숨김)
    const elWood  = elTotal(c, "wood");
    const elFire  = elTotal(c, "fire");
    const elEarth = elTotal(c, "earth");
    const elMetal = elTotal(c, "metal");
    const elWater = elTotal(c, "water");

    // ── 복합 파생
    const insightTriangle = calcInsightTriangle(ci_인성, ci_관성, elWood);
    const noiseIndex      = calcNoiseIndex(c, IL, stab);
    const stabilityIndex  = calcStabilityIndex(stab, noiseIndex);
    const synergyIC       = ci_인성 * ci_관성;

    const { geokPurity, geokBroken, monthFit, rootScore, stemSupport } = stab;

    // 로그
    console.log(`🔍 [v6.0] 십신기여: 인${ci_인성.toFixed(2)} 관${ci_관성.toFixed(2)} 식${ci_식상.toFixed(2)} 비${ci_비겁.toFixed(2)} 재${ci_재성.toFixed(2)}`);
    console.log(`🔍 [v6.0] 오행합산: 목${elWood.toFixed(2)} 화${elFire.toFixed(2)} 토${elEarth.toFixed(2)} 금${elMetal.toFixed(2)} 수${elWater.toFixed(2)}`);
    console.log(`🔍 [v6.0] 파생: 格순도=${geokPurity.toFixed(2)} 월령=${monthFit.toFixed(2)} 통근=${rootScore.toFixed(2)} 투간=${stemSupport.toFixed(2)} 잡음=${noiseIndex.toFixed(2)} 안정=${stabilityIndex.toFixed(2)} 삼각=${insightTriangle.toFixed(2)}`);

    // ══════════════════════════════════════════════════════
    // 6지표 계산 — 완전 배타적 재료 분리
    // 각 지표는 전용 재료만 사용. 공통 재료 반복 투입 금지.
    //   1. 구조독해력: 목 + 관성 + geokPurity (ONLY)
    //   2. 패턴해석력: 인성 + rootScore + stemSupport (ONLY)
    //   3. 핵심추출력: 금 + 식상 (ONLY)
    //   4. 리스크식별: 관성 단독 (ONLY)
    //   5. 전략구상력: 인성×관성 시너지 + 토 (ONLY)
    //   6. 통찰응집력: stabilityIndex + monthFit (ONLY)
    // ══════════════════════════════════════════════════════

    // 1. 구조 독해력 (22%)
    // 전용: 목(골격) + 관성(긴장) + geokPurity(格 순도)
    const raw_structure =
      3.00 * elWood
      + 2.50 * ci_관성
      + 2.00 * geokPurity
      - 1.50 * noiseIndex
      - overPen(ci_비겁, 0.70, 1.00)
      - (geokBroken ? 0.20 : 0);

    const s_structure = toScore(raw_structure, 3.02);

    // 2. 패턴 해석력 (16%)
    // 전용: 인성 + rootScore + stemSupport
    const raw_pattern =
      3.50 * ci_인성
      + 2.00 * rootScore
      + 1.50 * stemSupport
      + mildBonus(ci_식상, 0.15, 0.55, 0.12)
      - overPen(ci_재성, 0.65, 1.00)
      - 0.50 * noiseIndex;

    const s_pattern = toScore(raw_pattern, 4.63);

    // 3. 핵심 추출력 (14%)
    // 전용: 금 + 식상
    const raw_extract =
      4.00 * elMetal
      + 2.50 * ci_식상
      - overPen(ci_인성, 0.80, 1.50)
      - overPen(elWater, 1.20, 1.00)
      - 1.00 * noiseIndex;

    const s_extract = toScore(raw_extract, 2.05);

    // 4. 리스크 식별력 (18%)
    // 전용: 관성 단독 (금은 추출과 겹쳐 배제)
    const raw_risk =
      5.00 * ci_관성
      + IL.sensitivityBonus * 3.0
      - overPen(ci_재성, 0.65, 1.00)
      - overPen(ci_식상, 0.65, 0.80)
      - 0.30 * noiseIndex;

    const s_risk = toScore(raw_risk, 2.14);

    // 5. 전략 구상력 (16%)
    // 전용: 인성×관성 시너지 + 토 (인성·관성 단독 가산 배제)
    const raw_strategy =
      6.00 * synergyIC
      + 2.50 * elEarth
      + 0.40 * Math.min(ci_비겁, 0.55)
      - overPen(ci_식상, 0.70, 0.80)
      - overPenWeak(ci_비겁, 0.75, ci_인성, 0.40, 0.50)
      - 0.40 * noiseIndex;

    const s_strategy = toScore(raw_strategy, 2.85);

    // 6. 통찰 응집력 (14%)
    // 전용: stabilityIndex + monthFit (geokPurity는 1번에서 사용)
    const raw_cohesion =
      4.00 * stabilityIndex
      + 3.00 * monthFit
      - 2.00 * noiseIndex
      - calcDispersionPen(ci_인성, ci_관성, elWood, elWater) * 3.0;

    const s_cohesion = toScore(raw_cohesion, 3.93);

    // ── 총점 합성 ─────────────────────────────────────────
    let insightTotal =
      0.22 * s_structure
      + 0.16 * s_pattern
      + 0.14 * s_extract
      + 0.18 * s_risk
      + 0.16 * s_strategy
      + 0.14 * s_cohesion;

    // ⚠️ 보너스 비활성화 (분산 확보 전까지)
    // if (s_structure >= 85 && s_risk >= 85 && s_strategy >= 85) insightTotal += 2.5;
    // if (s_cohesion >= 85 && s_pattern >= 85) insightTotal += 1.5;

    // 감점: 핵심 3축 중 2개 이상 80 미만
    const coreBelow = [s_structure, s_risk, s_strategy].filter(x => x < 80).length;
    if (coreBelow >= 2) insightTotal -= 2.0;

    // 90+ 상한: 6개 조건 중 4개 이상 충족 시만 (v6.0: 3→4로 강화)
    const ninetyConditions = [
      s_structure >= 88,
      s_pattern   >= 82,
      s_extract   >= 78,
      s_risk      >= 86,
      s_strategy  >= 82,
      s_cohesion  >= 86,
    ].filter(Boolean).length;
    if (insightTotal >= 90 && ninetyConditions < 4) insightTotal = Math.min(insightTotal, 89);

    insightTotal = Math.round(clamp(insightTotal, 1, 99));

    const sub1 = Math.round(s_structure);
    const sub2 = Math.round(s_pattern);
    const sub3 = Math.round(s_extract);
    const sub4 = Math.round(s_risk);
    const sub5 = Math.round(s_strategy);
    const sub6 = Math.round(s_cohesion);

    console.log(`📊 [v6.0] 6지표: 구조${sub1} 패턴${sub2} 추출${sub3} 리스크${sub4} 전략${sub5} 응집${sub6}`);
    console.log(`🎯 [v6.0] 통찰력 총점: ${insightTotal} | 90+조건: ${ninetyConditions}/6`);

    const typeObj = _insightType([sub1,sub2,sub3,sub4,sub5,sub6]);
    const comment = _makeComment([sub1,sub2,sub3,sub4,sub5,sub6]);

    return {
      insightTotal,
      typeName:  typeObj.name,
      typeDesc:  typeObj.desc,
      comment,

      subs6: [
        { id:1, name:"구조 독해력",   score:sub1, grade:grade(sub1), gradeLabel:gradeLabel(sub1) },
        { id:2, name:"패턴 해석력",   score:sub2, grade:grade(sub2), gradeLabel:gradeLabel(sub2) },
        { id:3, name:"핵심 추출력",   score:sub3, grade:grade(sub3), gradeLabel:gradeLabel(sub3) },
        { id:4, name:"리스크 식별력", score:sub4, grade:grade(sub4), gradeLabel:gradeLabel(sub4) },
        { id:5, name:"전략 구상력",   score:sub5, grade:grade(sub5), gradeLabel:gradeLabel(sub5) },
        { id:6, name:"통찰 응집력",   score:sub6, grade:grade(sub6), gradeLabel:gradeLabel(sub6) },
      ],

      // 하위 호환
      categories: {
        Insight: { score:insightTotal, grade:grade(insightTotal), percent:gradeLabel(insightTotal) }
      },
      subs: [],
      overloadRisk: 0,

      debug: {
        contrib: {
          surface: c.surface, hidden: c.hidden,
          surfaceEl: c.surfaceEl, hiddenEl: c.hiddenEl,
          monthHidden: c.monthHidden, roots: c.roots, stemOut: c.stemOut,
        },
        ci: { 인성:ci_인성.toFixed(3), 관성:ci_관성.toFixed(3),
              식상:ci_식상.toFixed(3), 비겁:ci_비겁.toFixed(3), 재성:ci_재성.toFixed(3) },
        geokPurity, monthFit, rootScore, stemSupport,
        noiseIndex, stabilityIndex, insightTriangle, synergyIC,
        IL: { chung:IL.chung, hyung:IL.hyung, total:IL.total, sensitivityBonus:IL.sensitivityBonus },
        raw: {
          structure: raw_structure.toFixed(3), pattern: raw_pattern.toFixed(3),
          extract:   raw_extract.toFixed(3),   risk:    raw_risk.toFixed(3),
          strategy:  raw_strategy.toFixed(3),  cohesion: raw_cohesion.toFixed(3),
        },
        ninetyConditions,
      }
    };
  }

  // ── 통찰 타입 판정
  function _insightType(subs) {
    const [s, p, e, r, st, c] = subs;
    const coreAvg = (s + r + st) / 3;
    if (coreAvg >= 85) return { name:"구조독해형",   desc:"구조를 읽고 리스크를 먼저 보는 전략형 통찰" };
    if (s >= 80 && p >= 80) return { name:"해석분석형", desc:"패턴과 의미를 깊이 해석하는 통찰" };
    if (r >= 80 && st >= 78) return { name:"리스크전략형", desc:"위험 식별과 전략 설계가 강한 통찰" };
    if (p >= 80 && c >= 78)  return { name:"패턴응집형", desc:"흐름을 읽고 하나의 결론으로 묶는 통찰" };
    return { name:"균형통찰형", desc:"전 영역이 고르게 발달한 통찰" };
  }

  function _makeComment(subs) {
    const labels = ["구조 독해력","패턴 해석력","핵심 추출력",
                    "리스크 식별력","전략 구상력","통찰 응집력"];
    const sorted = subs.map((s,i) => ({ name:labels[i], score:s }))
                       .sort((a,b) => b.score - a.score);
    return {
      strength: `강점: ${sorted[0].name}, ${sorted[1].name}`,
      weakness: `보완: ${sorted[sorted.length-1].name} (${sorted[sorted.length-1].score}점)`,
    };
  }

  // ── fallback (getShishen 없을 때)
  function _fallback(baseState) {
    const bv  = baseState.vectors?.baseVectors || baseState.vectors || {};
    const tg0 = bv.tenGods || {};
    const el0 = bv.elements || {};
    const tgSum = Object.values(tg0).reduce((s,v)=>s+(+v||0), 0) || 1;
    const elSum = Object.values(el0).reduce((s,v)=>s+(+v||0), 0) || 1;
    const tg  = { 인성:(+tg0["正印"]||0)+(+tg0["偏印"]||0),
                  관성:(+tg0["正官"]||0)+(+tg0["偏官"]||0),
                  식상:(+tg0["食神"]||0)+(+tg0["傷官"]||0) };
    Object.keys(tg).forEach(k => tg[k] /= tgSum);
    const el = { wood:(+el0.wood||0)/elSum, metal:(+el0.metal||0)/elSum };
    const raw = 1.5*tg.인성 + 1.4*tg.관성 + 1.5*el.wood + 1.3*el.metal;
    const s   = Math.round(toScore(raw, 0.55));
    return {
      insightTotal: s, typeName:"균형통찰형", typeDesc:"",
      comment: { strength:"(fallback)", weakness:"" },
      subs6: [], categories: { Insight: { score:s, grade:grade(s), percent:gradeLabel(s) } },
      subs: [], overloadRisk:0,
    };
  }

  window.IntuitionEngine = { compute };
  console.log("✅ IntuitionEngine v6.0 로드 완료");
})();
