/* =========================================================
   직관 능력 분석 엔진 (intuition_engine.js) v5.0
   ─────────────────────────────────────────────────────────
   구조: 기존 4축(통찰/타이밍/감응/예지) → 통찰력 단일축
   세부: 6개 지표
     1. 구조 독해력  (22%)
     2. 패턴 해석력  (16%)
     3. 핵심 추출력  (14%)
     4. 리스크 식별력 (18%)
     5. 전략 구상력  (16%)
     6. 통찰 응집력  (14%)

   핵심 원칙:
   - 주재료: 인성·관성·목·금·格순도·구조안정성
   - 보조재료: 수(소량), 합충형파해 민감도(소량)
   - 금지재료: spike 직접가산, noise 직접보너스,
               el.water 중심 통찰, 감응/예감 재료
   - 구조독해형 명식(인성+관성+목 삼각) → 자연스럽게 90+
   ========================================================= */

console.log("🔥 intuition_engine.js v5.0 로드");

(function () {
  'use strict';

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pos   = x => Math.max(0, x);

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

  // raw → 0~100 변환. 진폭 38.
  function toScore(raw, scale) {
    const s = Math.max(0.18, scale);
    return clamp(50 + 38 * Math.tanh(raw / s), 1, 99);
  }

  // val > threshold 초과분 × strength
  function overPen(val, threshold, strength) {
    return pos(val - threshold) * strength;
  }

  // val > threshold 이고 paired < pairThreshold 일 때만 감점
  function overPenWeak(val, threshold, paired, pairThreshold, strength) {
    if (val > threshold && paired < pairThreshold) {
      return pos(val - threshold) * strength;
    }
    return 0;
  }

  // lo~hi 범위일 때 add 가산
  function mildBonus(val, lo, hi, add) {
    return (val >= lo && val <= hi) ? add : 0;
  }

  // 구조 분산 + 감응형 편향 패널티
  function dispersionPen(tg_인성, tg_관성, el_wood, el_water) {
    let pen = 0;
    if (tg_인성 >= 0.26 && tg_관성 < 0.13 && el_wood < 0.15) pen += 0.08;
    if (el_water >= 0.26 && el_wood < 0.14 && tg_관성 < 0.13) pen += 0.10;
    return pen;
  }

  function insightType(subs6) {
    const [s, p, e, r, st, c] = subs6;
    const coreAvg = (s + r + st) / 3;
    if (coreAvg >= 85) return { name: "구조독해형",   desc: "구조를 읽고 리스크를 먼저 보는 전략형 통찰" };
    if (s >= 80 && p >= 80) return { name: "해석분석형", desc: "패턴과 의미를 깊이 해석하는 통찰" };
    if (r >= 80 && st >= 78) return { name: "리스크전략형", desc: "위험 식별과 전략 설계가 강한 통찰" };
    if (p >= 80 && c >= 78)  return { name: "패턴응집형", desc: "흐름을 읽고 하나의 결론으로 묶는 통찰" };
    return { name: "균형통찰형", desc: "전 영역이 고르게 발달한 통찰" };
  }

  function makeComment(subs6) {
    const labels = ["구조 독해력","패턴 해석력","핵심 추출력",
                    "리스크 식별력","전략 구상력","통찰 응집력"];
    const sorted = subs6.map((s, i) => ({ name: labels[i], score: s }))
                        .sort((a, b) => b.score - a.score);
    return {
      strength: `강점: ${sorted[0].name}, ${sorted[1].name}`,
      weakness: `보완: ${sorted[sorted.length-1].name} (${sorted[sorted.length-1].score}점)`,
    };
  }

  // ─────────────────────────────────────────────────────
  // 메인 계산
  // ─────────────────────────────────────────────────────
  function compute(baseState) {
    if (!baseState?.vectors?.tenGods || !baseState?.vectors?.elements) {
      console.warn("❌ baseState vectors 없음");
    }

    // 원국 벡터 우선
    const baseV = baseState.vectors?.baseVectors || baseState.vectors;
    const tg0   = baseV.tenGods;
    const el0   = baseV.elements;

    // 5축 정규화
    const tgSum = ["비겁","식상","재성","관성","인성"]
      .reduce((s, k) => s + (Number(tg0[k])||0), 0) || 1;
    const tg = {
      비겁: (Number(tg0["비겁"])||0) / tgSum,
      식상: (Number(tg0["식상"])||0) / tgSum,
      재성: (Number(tg0["재성"])||0) / tgSum,
      관성: (Number(tg0["관성"])||0) / tgSum,
      인성: (Number(tg0["인성"])||0) / tgSum,
    };

    const elSum = ["wood","fire","earth","metal","water"]
      .reduce((s, k) => s + (Number(el0[k])||0), 0) || 1;
    const el = {
      wood:  (Number(el0.wood )||0) / elSum,
      fire:  (Number(el0.fire )||0) / elSum,
      earth: (Number(el0.earth)||0) / elSum,
      metal: (Number(el0.metal)||0) / elSum,
      water: (Number(el0.water)||0) / elSum,
    };

    const I    = baseState.interactions || {};
    const he   = Array.isArray(I["합"])   ? I["합"].length   : (Number(I["합"])||0);
    const chung= Array.isArray(I["충"])   ? I["충"].length   : (Number(I["충"])||0);
    const hyung= Array.isArray(I["형"])   ? I["형"].length   : (Number(I["형"])||0);
    const pa   = Array.isArray(I["파"])   ? I["파"].length   : (Number(I["파"])||0);
    const hae  = Array.isArray(I["해"])   ? I["해"].length   : (Number(I["해"])||0);

    // ── 파생 지표 ──────────────────────────────────────

    const geokPurity = (baseState.geok && typeof baseState.geok.purity === 'number')
      ? clamp(baseState.geok.purity, 0, 1) : 0.50;
    const geokBroken = baseState.geok?.broken ? 1 : 0;

    const monthFit = clamp(geokPurity * 0.7 + (1 - geokBroken) * 0.3, 0, 1);

    const rootScore = clamp(
      0.30 * Math.min(tg.인성 / 0.25, 1) +
      0.30 * Math.min(tg.관성 / 0.20, 1) +
      0.20 * Math.min(el.wood  / 0.20, 1) +
      0.20 * Math.min(el.metal / 0.18, 1),
    0, 1);

    const stemSupport = clamp(
      0.40 * Math.min(tg.인성 / 0.22, 1) +
      0.40 * Math.min(tg.관성 / 0.18, 1) +
      0.20 * geokPurity,
    0, 1);

    const rawNoise =
      0.35 * chung +
      0.25 * hyung +
      0.20 * pa    +
      0.15 * hae   +
      pos(tg.인성  - 0.32) * 2.0 +
      pos(el.water - 0.28) * 1.5 +
      pos(tg.비겁  - 0.30) * 1.5 +
      (geokBroken ? 0.30 : 0);
    const noiseIndex = clamp(rawNoise / 3.0, 0, 1);

    const stabilityIndex = clamp(
      0.30 * geokPurity +
      0.25 * rootScore  +
      0.25 * monthFit   +
      0.20 * (1 - noiseIndex),
    0, 1);

    // 삼각 결합: 셋 중 하나만 높으면 낮음
    const insightTriangle = clamp(
      Math.min(tg.인성, tg.관성, el.wood) * 3.5,
    0, 1);

    const synergyIC = tg.인성 * tg.관성;

    console.log(`🔍 [v5.0] 5축: 비${tg.비겁.toFixed(2)} 식${tg.식상.toFixed(2)} 재${tg.재성.toFixed(2)} 관${tg.관성.toFixed(2)} 인${tg.인성.toFixed(2)}`);
    console.log(`🔍 [v5.0] 오행: 목${el.wood.toFixed(2)} 화${el.fire.toFixed(2)} 토${el.earth.toFixed(2)} 금${el.metal.toFixed(2)} 수${el.water.toFixed(2)}`);
    console.log(`🔍 [v5.0] 파생: 格순도=${geokPurity.toFixed(2)} 통근=${rootScore.toFixed(2)} 잡음=${noiseIndex.toFixed(2)} 안정=${stabilityIndex.toFixed(2)} 삼각=${insightTriangle.toFixed(2)}`);

    // ── 1. 구조 독해력 ────────────────────────────────
    const raw_structure =
      1.70 * el.wood       +
      1.25 * tg.인성       +
      1.20 * tg.관성       +
      1.20 * geokPurity    +
      0.80 * monthFit      +
      1.10 * insightTriangle -
      0.80 * noiseIndex    -
      overPen(tg.비겁, 0.34, 0.40) -
      (geokPurity < 0.45 ? 0.10 : 0) -
      (geokBroken ? 0.08 : 0);

    const s_structure = toScore(raw_structure, 0.58);

    // ── 2. 패턴 해석력 ────────────────────────────────
    const raw_pattern =
      1.80 * tg.인성       +
      1.15 * el.wood       +
      1.30 * insightTriangle +
      0.80 * rootScore     +
      0.60 * stemSupport   +
      mildBonus(tg.식상, 0.14, 0.27, 0.06) -
      overPenWeak(tg.식상, 0.28, tg.인성, 0.22, 0.50) -
      overPen(tg.재성, 0.30, 0.35) -
      0.35 * noiseIndex;

    const s_pattern = toScore(raw_pattern, 0.55);

    // ── 3. 핵심 추출력 ────────────────────────────────
    const raw_extract =
      1.70 * el.metal      +
      1.15 * tg.인성       +
      0.55 * tg.식상       +
      0.55 * tg.관성       +
      0.70 * stabilityIndex -
      overPen(tg.인성,  0.34, 0.45) -
      overPen(el.water, 0.30, 0.40) -
      0.70 * noiseIndex;

    const s_extract = toScore(raw_extract, 0.54);

    // ── 4. 리스크 식별력 ─────────────────────────────
    const raw_risk =
      1.85 * tg.관성       +
      1.15 * el.metal      +
      0.40 * el.water      +  // 수: 조짐 보조(소량만)
      0.50 * monthFit      +
      0.50 * stabilityIndex -
      overPen(tg.재성, 0.31, 0.40) -
      overPen(tg.식상, 0.31, 0.35) -
      0.25 * noiseIndex;

    const s_risk = toScore(raw_risk, 0.56);

    // ── 5. 전략 구상력 ────────────────────────────────
    const raw_strategy =
      1.50 * tg.인성       +
      1.45 * tg.관성       +
      0.85 * el.earth      +
      0.45 * tg.식상       +
      0.35 * tg.재성       +
      2.40 * synergyIC     +  // 인성×관성 시너지 (핵심)
      0.40 * Math.min(tg.비겁, 0.22) -  // 비겁 적정: 주체성 보조
      overPen(tg.식상, 0.33, 0.35) -
      overPenWeak(tg.비겁, 0.32, tg.인성, 0.22, 0.45) -
      0.35 * noiseIndex;

    const s_strategy = toScore(raw_strategy, 0.58);

    // ── 6. 통찰 응집력 ────────────────────────────────
    const raw_cohesion =
      1.40 * geokPurity    +
      1.10 * stabilityIndex +
      0.80 * monthFit      +
      1.50 * synergyIC     +  // 인성×관성 시너지
      1.20 * insightTriangle -
      1.00 * noiseIndex    -
      dispersionPen(tg.인성, tg.관성, el.wood, el.water);

    const s_cohesion = toScore(raw_cohesion, 0.54);

    // ── 총점 합성 ─────────────────────────────────────
    let insightTotal =
      0.22 * s_structure +
      0.16 * s_pattern   +
      0.14 * s_extract   +
      0.18 * s_risk      +
      0.16 * s_strategy  +
      0.14 * s_cohesion;

    // 보너스
    if (s_structure >= 85 && s_risk >= 85 && s_strategy >= 85) insightTotal += 2.5;
    if (s_cohesion  >= 85 && s_pattern  >= 85)                 insightTotal += 1.5;
    // 감점
    const coreBelow80 = [s_structure, s_risk, s_strategy].filter(x => x < 80).length;
    if (coreBelow80 >= 2) insightTotal -= 2.0;
    // 90+ 상한
    const ninetyConditions = [
      s_structure >= 88, s_risk >= 86, s_strategy >= 85,
      s_cohesion  >= 84, s_pattern >= 82, s_extract >= 78,
    ].filter(Boolean).length;
    if (insightTotal >= 90 && ninetyConditions < 3) insightTotal = Math.min(insightTotal, 89);

    insightTotal = Math.round(clamp(insightTotal, 1, 99));

    const sub1 = Math.round(s_structure);
    const sub2 = Math.round(s_pattern);
    const sub3 = Math.round(s_extract);
    const sub4 = Math.round(s_risk);
    const sub5 = Math.round(s_strategy);
    const sub6 = Math.round(s_cohesion);
    const subs6arr = [sub1, sub2, sub3, sub4, sub5, sub6];

    const typeObj = insightType(subs6arr);
    const comment = makeComment(subs6arr);

    console.log(`📊 [v5.0] 6지표: 구조${sub1} 패턴${sub2} 추출${sub3} 리스크${sub4} 전략${sub5} 응집${sub6}`);
    console.log(`🎯 [v5.0] 통찰력 총점: ${insightTotal} | 타입: ${typeObj.name}`);

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

      // 하위호환 브리지 (saju_ui가 categories를 읽는 경우)
      categories: {
        Insight: { score:insightTotal, grade:grade(insightTotal), percent:gradeLabel(insightTotal) }
      },
      subs: [],
      overloadRisk: 0,

      debug: {
        geokPurity, monthFit, rootScore, stemSupport,
        noiseIndex, stabilityIndex, insightTriangle, synergyIC,
        raw: {
          structure: raw_structure.toFixed(3), pattern: raw_pattern.toFixed(3),
          extract:   raw_extract.toFixed(3),   risk:    raw_risk.toFixed(3),
          strategy:  raw_strategy.toFixed(3),  cohesion: raw_cohesion.toFixed(3)
        },
        ninetyConditions
      }
    };
  }

  window.IntuitionEngine = { compute };
  console.log("✅ IntuitionEngine v5.0 로드 완료");
})();
