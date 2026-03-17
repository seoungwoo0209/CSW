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

console.log("🔥 intuition_engine.js WorkInsight v2.0 로드");

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
    "偏印":"편인","正印":"인성",  // 正印은 인성으로 직접 집계
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

  // ── 기준 분포: mean/std — 직장 통찰력 v1.0
  // 6개 대표 명식 실측 기반, 구조독해형 핵심2축 z≈2.5
  // DIST: v2.0 — 목/토/관성 중심 raw 공식 6명식 역산
  // structureError/riskPre: 구조독해형 z=2.5 기준 std 역산
  // essence: 실측 분포 (균형형 z≈0)
  const DIST = {
    org:     { mean: 1.584, std: 0.492 },   // structureError (문제 포착력)
    risk:    { mean: 0.913, std: 0.331 },   // riskPre (위험 감지력)
    context: { mean: 1.649, std: 0.460 },   // essence (본질 해석력)
  };

  // ── z-score 기반 점수 변환 (GPT v8 명세)
  // 평균권 58~70, 상위 70~82, 최상위만 90+, 95+는 희귀
  function scoreFromZ(raw, dist) {
    const z = (raw - dist.mean) / Math.max(dist.std, 0.01);
    if (z <= -2.0) return 45;
    if (z <= -1.0) return 50 + 8   * (z + 2.0);  // -2~-1: 50→58 (연속)
    if (z <=  0.0) return 58 + 12  * (z + 1.0);  // -1~0: 58→70
    if (z <=  1.0) return 70 + 12  * z;           // 0~1: 70→82
    if (z <=  2.0) return 82 + 8   * (z - 1.0);  // 1~2: 82→90
    if (z <=  2.7) return 90 + (4/0.7) * (z - 2.0);  // 2~2.7: 90→94
    if (z <=  3.2) return 94 + (2/0.5) * (z - 2.7);  // 2.7~3.2: 94→96
    return 96 + Math.min(1, (z - 3.2));           // 3.2+: 96→97
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
    const geok       = baseState.geok || {};
    const geokPurity = typeof geok.purity === 'number' ? clamp(geok.purity, 0, 1) : 0.50;
    const geokBroken = geok.broken ? 1 : 0;

    const mh = c.monthHidden;
    const me = c.monthEl;

    // ── monthFit: 목/관성/토응집/인성보조 기준 (명세 3-1)
    // 금/수 제외
    const mWood    = (me.wood||0);
    const mGwan    = (mh.관성||0);
    const mEarth   = (me.earth||0);  // 토 응집 월지 지원
    const mInsight = (mh.인성||0) + (mh.편인||0);
    const monthFit = clamp(
      mWood    * 0.38   // 목 구조 지원 (주)
      + mGwan  * 0.30   // 관성 지원 (주)
      + mEarth * 0.22   // 토 응집 지원
      + mInsight * 0.10 // 인성 보조
    , 0, 1);

    // ── rootScore: 목/관성/토응집/인성 root 기준 (명세 3-2)
    // 토응집 root proxy: hiddenEl.earth — 지장간에 토 오행이 뿌리 있는 정도
    const earthRoot = clamp((c.hiddenEl.earth || 0) / 1.0, 0, 1);
    const rootScore = clamp(
      Math.min(c.roots.목    / 0.5, 1) * 0.30   // 목 통근
      + Math.min(c.roots.관성 / 0.6, 1) * 0.28  // 관성 통근
      + earthRoot                        * 0.25  // 토응집 통근 (hiddenEl.earth)
      + Math.min(c.roots.인성 / 0.8, 1) * 0.17, // 인성 통근
    0, 1);

    // ── stemSupport: 목/관성/토응집/인성 투간 기준 (명세 3-3)
    // 토응집 투간 proxy: 표면 토 오행이 천간에 드러난 정도 (0~1 정규화)
    const earthExposed = clamp((c.surfaceEl.earth || 0) / 1.5, 0, 1);
    const stemSupport = clamp(
      (c.stemOut.목    ? 0.34 : 0)   // 목 투간
      + (c.stemOut.관성 ? 0.28 : 0)  // 관성 투간
      + earthExposed    * 0.22        // 토응집 투간 (surfaceEl.earth 기반)
      + (c.stemOut.인성 ? 0.16 : 0), // 인성 보조
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
  // noiseIndex: 명세 3-5 — 형/충/파/해는 보너스 아닌 noise 처리
  function calcNoiseIndex(c, IL, stab) {
    const { noiseIndex: iNoise } = IL;   // 형충파해 과다 기반 (buildInteractionLayer)
    const totalWater = (c.hiddenEl.water||0) + (c.surfaceEl.water||0);
    const totalBiGup = (c.hidden.비겁||0) + (c.surface.비겁||0);
    const totalInsight = (c.hidden.인성||0) + (c.surface.인성||0)
                       + (c.hidden.편인||0) + (c.surface.편인||0);
    // 명세 3-5: 각 항 계수
    // 0.30 * overInteractions: iNoise(형충파해 * 0.12/개)를 스케일 보정
    const interactionNoise = IL.total * 0.04;  // overInteractions 재계산 (0.30 * 총개수 비례)
    const extraNoise =
      interactionNoise                                // 형/충/파/해 과다 (0.30 비중)
      + 0.18 * overPen(totalInsight, 1.5, 1.0)       // 인성 과다 (임계 0.34 → raw 1.5)
      + 0.16 * overPen(totalBiGup,   1.0, 1.0)       // 비겁 과다 (임계 0.32 → raw 1.0)
      + 0.16 * overPen(totalWater,   1.2, 1.0)       // 수 과다 (임계 0.30 → raw 1.2)
      + (stab.geokBroken ? 0.20 : 0);                // 핵심 구조 파괴
    // 형/충/파/해는 직접 보너스 없음 — noise 처리만
    return clamp(extraNoise, 0, 0.55);
  }

  // ════════════════════════════════════════════════════════
  // ── stabilityIndex 종합
  // ════════════════════════════════════════════════════════
  // stabilityIndex: 명세 3-4 — 토는 각 raw에서 직접 반영되므로 여기선 구조 안정도만
  function calcStabilityIndex(stab, noiseIndex) {
    return clamp(
      stab.geokPurity    * 0.35
      + stab.monthFit    * 0.25
      + stab.rootScore   * 0.20
      + stab.stemSupport * 0.20
      - noiseIndex       * 0.35,
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
    console.log(`🔍 [WI v1.0] 십신기여: 인${ci_인성.toFixed(2)} 관${ci_관성.toFixed(2)} 식${ci_식상.toFixed(2)} 비${ci_비겁.toFixed(2)} 재${ci_재성.toFixed(2)}`);
    console.log(`🔍 [WI v1.0] 오행합산: 목${elWood.toFixed(2)} 화${elFire.toFixed(2)} 토${elEarth.toFixed(2)} 금${elMetal.toFixed(2)} 수${elWater.toFixed(2)}`);
    console.log(`🔍 [WI v1.0] 파생: 格순도=${geokPurity.toFixed(2)} 월령=${monthFit.toFixed(2)} 통근=${rootScore.toFixed(2)} 투간=${stemSupport.toFixed(2)} 잡음=${noiseIndex.toFixed(2)} 안정=${stabilityIndex.toFixed(2)} 삼각=${insightTriangle.toFixed(2)}`);

    // ══════════════════════════════════════════════════════
    // 직장 통찰력 3지표 — v2.0 (목/토/관성 중심 재설계)
    // 내부명: structureError / riskPre / essence
    // 표시명: 문제 포착력 / 위험 감지력 / 본질 해석력
    // ══════════════════════════════════════════════════════

    // ── 1. 문제 포착력 (structureError, 42%)
    // 목+관성+토응집+格순도 중심. 인성단독/수/금중심 금지.
    const raw_structureError =
      1.95 * elWood               // 목: 구조 골격 (주축)
      + 1.35 * ci_관성            // 관성: 어긋남/긴장 감지 (주축)
      + 0.85 * elEarth            // 토: 구조를 붙잡는 응집력
      + 1.00 * geokPurity         // 格순도: 일관된 구조 독해
      + 0.20 * elMetal            // 금: 아주 약하게만
      - 0.45 * noiseIndex;

    let s_structureError = scoreFromZ(raw_structureError, DIST.org);
    if (elWood < 0.14)      s_structureError = Math.min(s_structureError, 78);
    else if (elWood < 0.18) s_structureError = Math.min(s_structureError, 84);
    if (ci_관성 < 0.18)     s_structureError = Math.min(s_structureError, 86);

    // ── 2. 위험 감지력 (riskPre, 34%)
    // 관성+목+토응집+금약보조+stabilityIndex. 수/형충직접보너스 금지.
    const raw_riskPre =
      1.75 * ci_관성              // 관성: 위험 구조 감지 (주축)
      + 0.75 * elWood             // 목: 위험이 구조 어디에 걸렸는지
      + 0.45 * elEarth            // 토: 위험 징후를 흘리지 않고 붙잡음
      + 0.25 * elMetal            // 금: 약보조
      + 0.20 * stabilityIndex     // 구조 안정도 보조
      - 0.18 * overPen(ci_재성, 0.31, 1.0)
      - 0.20 * overPen(ci_식상, 0.31, 1.0)
      - 0.20 * noiseIndex;

    let s_riskPre = scoreFromZ(raw_riskPre, DIST.risk);
    if (ci_관성 < 0.22)     s_riskPre = Math.min(s_riskPre, 82);
    if (elWood  < 0.15)     s_riskPre = Math.min(s_riskPre, 86);
    if (elMetal < 0.10)     s_riskPre = Math.min(s_riskPre, 90);

    // ── 3. 본질 해석력 (essence, 24%)
    // 토응집+목흐름+인성보조+root/stem. 인성단독/금주재료/수가산 금지.
    const raw_essence =
      1.55 * elEarth              // 토: 응집·저장·축적 (주축)
      + 1.05 * elWood             // 목: 흐름과 연결성
      + 0.70 * ci_인성            // 인성: 해석 보조 (주재료 아님)
      + 0.65 * rootScore          // 통근 안정도
      + 0.55 * stemSupport        // 투간 지원도
      + mildBonus(ci_식상, 0.14, 0.26, 0.18)
      - 0.35 * overPen(ci_재성, 0.30, 1.0)
      - 0.35 * noiseIndex;

    let s_essence = scoreFromZ(raw_essence, DIST.context);
    if (elEarth  < 0.18)    s_essence = Math.min(s_essence, 84);
    if (elWood   < 0.14)    s_essence = Math.min(s_essence, 86);
    if (rootScore < 0.28)   s_essence = Math.min(s_essence, 88);

    // ── 직장 통찰력 총점 합성 (명세 5) ──────────────────
    const baseWorkInsight =
      0.42 * s_structureError
      + 0.34 * s_riskPre
      + 0.24 * s_essence;

    // 문제포착 + 위험감지 동시 강세 보너스
    const pairCore  = (s_structureError + s_riskPre) / 2;
    const pairBonus = Math.max(0, pairCore - 84) * 0.32;

    // 핵심 2축 둘 다 78 미만 → 감점
    const weakCount   = [s_structureError, s_riskPre].filter(v => v < 78).length;
    const weakPenalty = weakCount >= 2 ? 2.0 : 0;

    let insightTotal = baseWorkInsight + pairBonus - weakPenalty;
    insightTotal = Math.max(45, Math.min(97, insightTotal));

    // 90+ 허용: 3개 중 2개 이상 충족
    const ninetyConditions = [
      s_structureError >= 90,
      s_riskPre        >= 88,
      s_essence        >= 84,
    ].filter(Boolean).length;
    if (insightTotal >= 90 && ninetyConditions < 2) insightTotal = Math.min(insightTotal, 89);

    insightTotal = Math.round(clamp(insightTotal, 45, 97));

    const sub1 = Math.round(s_structureError);  // 문제 포착력
    const sub2 = Math.round(s_riskPre);          // 위험 감지력
    const sub3 = Math.round(s_essence);          // 본질 해석력

    // ── 파이프라인 디버그: 명식별 고유값 확인용
    console.log(`📊 [WI v2.0] pillars: 일간=${dayStem} 월지=${pillars.month?.branch}`);
    console.log(`📊 [WI v2.0] raw: SE=${raw_structureError.toFixed(3)} RP=${raw_riskPre.toFixed(3)} ES=${raw_essence.toFixed(3)}`);
    console.log(`📊 [WI v2.0] subs: 문제포착=${sub1} 위험감지=${sub2} 본질해석=${sub3} 총점=${insightTotal}`);

    const typeObj = _workInsightType(sub1, sub2, sub3);
    const comment = _workInsightComment(sub1, sub2, sub3);

    return {
      insightTotal,
      typeName:  typeObj.name,
      typeDesc:  typeObj.desc,
      comment,

      subs6: [
        { id:1, name:"문제 포착력", score:sub1, grade:grade(sub1), gradeLabel:gradeLabel(sub1) },
        { id:2, name:"위험 감지력", score:sub2, grade:grade(sub2), gradeLabel:gradeLabel(sub2) },
        { id:3, name:"본질 해석력", score:sub3, grade:grade(sub3), gradeLabel:gradeLabel(sub3) },
      ],

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
        el: { wood:elWood.toFixed(3), metal:elMetal.toFixed(3), earth:elEarth.toFixed(3) },
        geokPurity, monthFit, rootScore, stemSupport,
        noiseIndex, stabilityIndex, synergyIC,
        IL: { chung:IL.chung, hyung:IL.hyung, total:IL.total },
        raw: {
          structureError: raw_structureError.toFixed(3),
          riskPre:        raw_riskPre.toFixed(3),
          essence:        raw_essence.toFixed(3),
        },
        ninetyConditions,
      }
    };
  }

  // ── 직장 통찰 타입 판정
  function _workInsightType(org, risk, ctx) {
    // 문제-위험형: 두 핵심축 모두 매우 높음
    if (org >= 88 && risk >= 86)
      return { name:"문제-위험형", desc:"문제를 먼저 포착하고 위험을 먼저 잡는 직장형 통찰" };
    // 구조독해형: 조직 파악 최고, 리스크 중상
    if (org >= 86 && org > risk && org > ctx)
      return { name:"문제포착형", desc:"판의 구조와 문제를 남보다 먼저 읽어내는 통찰" };
    // 리스크판독형: 리스크 최고, 조직 중상
    if (risk >= 86 && risk > org && risk >= ctx)
      return { name:"위험감지형", desc:"일이 터지기 전에 위험 지점을 먼저 감지하는 통찰" };
    // 맥락해석형: 맥락 최고
    if (ctx >= 84 && ctx > org && ctx > risk)
      return { name:"본질해석형", desc:"표면보다 본질과 맥락을 꿰뚫어 보는 통찰" };
    return { name:"균형형", desc:"문제 포착·위험 감지·본질 해석이 고르게 발달한 유형" };
  }

  function _workInsightComment(org, risk, ctx) {
    const items = [
      { name:"문제 포착력", score:org  },
      { name:"위험 감지력", score:risk },
      { name:"본질 해석력",     score:ctx  },
    ];
    const sorted = [...items].sort((a,b)=>b.score-a.score);
    return {
      strength: `강점: ${sorted[0].name}, ${sorted[1].name}`,
      weakness: `보완: ${sorted[2].name} (${sorted[2].score}점)`,
    };
  }

  // ── fallback (getShishen 없을 때 또는 dayStem 없을 때)
  function _fallback(baseState) {
    const bv   = baseState.vectors?.baseVectors || baseState.vectors || {};
    const tg0  = bv.tenGods  || {};
    const el0  = bv.elements || {};
    const tgSum = Object.values(tg0).reduce((s,v)=>s+(+v||0), 0) || 1;
    const elSum = Object.values(el0).reduce((s,v)=>s+(+v||0), 0) || 1;

    // 정규화된 십신/오행 비율
    const tg = {
      인성: ((+tg0["正印"]||0) + (+tg0["偏印"]||0)) / tgSum,
      관성: ((+tg0["正官"]||0) + (+tg0["偏官"]||0)) / tgSum,
    };
    const el = {
      wood:  (+el0.wood  || 0) / elSum,
      earth: (+el0.earth || 0) / elSum,
      metal: (+el0.metal || 0) / elSum,
    };

    // 3지표 rough 추정 (toScore 없이 직접 z-score 근사)
    const r_se = 1.95*el.wood + 1.35*tg.관성 + 0.85*el.earth;
    const r_rp = 1.75*tg.관성 + 0.75*el.wood + 0.45*el.earth;
    const r_es = 1.55*el.earth + 1.05*el.wood + 0.70*tg.인성;

    // 간이 점수화 (tanh 없이 선형 clamp)
    const toFallbackScore = (r, center, span) =>
      Math.round(clamp(58 + (r - center) / span * 32, 45, 95));

    const s1 = toFallbackScore(r_se, 1.58, 0.49);
    const s2 = toFallbackScore(r_rp, 0.91, 0.33);
    const s3 = toFallbackScore(r_es, 1.65, 0.46);
    const tot = Math.round(0.42*s1 + 0.34*s2 + 0.24*s3);

    console.warn("⚠️ [WI fallback] getShishen 없음 — 간이 추정값 사용");
    return {
      insightTotal: tot,
      typeName:  "분석 중",
      typeDesc:  "상세 분석을 위해 사주 데이터를 확인하세요",
      comment: { strength: "데이터 로딩 중", weakness: "" },
      subs6: [
        { id:1, name:"문제 포착력", score:s1, grade:grade(s1), gradeLabel:gradeLabel(s1) },
        { id:2, name:"위험 감지력", score:s2, grade:grade(s2), gradeLabel:gradeLabel(s2) },
        { id:3, name:"본질 해석력", score:s3, grade:grade(s3), gradeLabel:gradeLabel(s3) },
      ],
      categories: { Insight: { score:tot, grade:grade(tot), percent:gradeLabel(tot) } },
      subs: [], overloadRisk: 0,
    };
  }

  window.IntuitionEngine = { compute };
  console.log("✅ IntuitionEngine WorkInsight v2.0 로드 완료");
})();
