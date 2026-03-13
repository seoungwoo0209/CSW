/* =========================================================
   직관 능력 분석 엔진 (intuition_engine.js) v3.0
   [v3.0 변경 내역]
   1. blendedRaw: 0.85*max → 0.55*max + 0.45*avg (최고값 편향 완화)
   2. toScoreAuto(): 진폭 44 → 34 (쉽게 80~90대 가는 현상 억제)
   3. percentileLabel(): 구간형 문구 (상위 1% 남발 방지)
   4. 카테고리별 실측 분포(DIST) + 지표별 개별 백분위
   5. 카테고리 상한 캡 규칙: 통찰 높으면 나머지 자동 동반 상승 방지
   6. 재료 중복도 축소: 예지력은 수기운/인성/noise 제한적 사용만
   7. 타이밍 3분화: 포착 / 진입 / 회수·전환 분리 패널티
   ========================================================= */

console.log("🔥 intuition_engine.js v3.0 로드");

(function() {
  'use strict';

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pos   = x => Math.max(0, x);

  // =========================================================
  // [FIX 2] toScoreAuto - 진폭 축소 (44 → 34)
  // 이전엔 raw가 조금만 양수여도 80~90대로 올라갔음
  // =========================================================
  function toScoreAuto(raw, scale, tail = 1.0) {
    const s = Math.max(0.18, scale);
    const x = (raw / s) * tail;
    return clamp(47 + 34 * Math.tanh(x), 1, 99);
  }

  function grade(score) {
    if (score >= 85) return "최상";
    if (score >= 75) return "상위";
    if (score >= 65) return "중상";
    if (score >= 55) return "중위";
    return "하위";
  }

  // =========================================================
  // [FIX 4] 카테고리별 실측 분포 (샘플 명식 시뮬레이션 기반)
  // 각 대분류가 서로 다른 평균/표준편차를 가지도록 분리
  // =========================================================
  const DIST = {
    Insight:     { mean: 68.5, std: 8.5  },  // 인성/관성 명식이 유리 → 약간 높은 평균
    Timing:      { mean: 63.0, std: 8.0  },  // 실행력 명식 의존 → 낮은 평균
    Sensitivity: { mean: 65.0, std: 8.0  },  // 수/목 명식 유리
    Premonition: { mean: 60.5, std: 7.5  },  // 가장 희귀한 축 → 가장 낮은 평균
    // 세부지표용 (20개 개별 - 기본 분포)
    sub_default: { mean: 64.0, std: 9.0 }
  };

  function scoreToPercentile(score, dist) {
    const d = dist || DIST.sub_default;
    const z = (score - d.mean) / d.std;
    const t   = 1 / (1 + 0.3275911 * Math.abs(z));
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    const erf  = 1 - poly * Math.exp(-z * z);
    const cdf  = 0.5 * (1 + (z >= 0 ? erf : -erf));
    return clamp(Math.round(cdf * 100), 1, 99);
  }

  // =========================================================
  // [FIX 3] percentileLabel - 구간형 문구 (상위 1% 남발 방지)
  // 실제 표본 분포 구축 전까지 확정 수치 표현 사용 금지
  // =========================================================
  function percentileLabel(pct) {
    if (pct >= 97) return "최상위권";
    if (pct >= 92) return "상위권";
    if (pct >= 82) return "우수";
    if (pct >= 65) return "평균 이상";
    if (pct >= 35) return "평균권";
    return "보완 필요";
  }

  // =========================================================
  // 타입명 결정 - 가장 차별화된 대표축을 강조
  // =========================================================
  const TYPE_DEFS = {
    구조통찰형:   { desc: "조용히 패턴을 읽고 구조를 해석하는 타입" },
    파동예감형:   { desc: "흐름과 징후를 먼저 감지하는 타입" },
    감응공감형:   { desc: "분위기와 압력을 세밀하게 흡수하는 타입" },
    타이밍마스터: { desc: "진입과 회수의 박자를 본능적으로 아는 타입" },
    균형통합형:   { desc: "전 영역이 고르게 발달한 안정형" }
  };

  function determineType(categories) {
    const scores = {
      Insight:     categories.Insight.score,
      Timing:      categories.Timing.score,
      Sensitivity: categories.Sensitivity.score,
      Premonition: categories.Premonition.score
    };
    const mean   = Object.values(scores).reduce((a, b) => a + b, 0) / 4;
    const maxKey = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
    const spread = scores[maxKey] - mean;
    if (spread < 5) return "균형통합형";
    const map = { Insight: "구조통찰형", Timing: "타이밍마스터", Sensitivity: "감응공감형", Premonition: "파동예감형" };
    return map[maxKey] || "균형통합형";
  }

  function applyPatterns(base, patterns) {
    const fired  = patterns.filter(p => p.cond).sort((a, b) => Math.abs(b.add) - Math.abs(a.add)).slice(0, 2);
    const bonus  = fired.reduce((s, p) => s + p.add, 0);
    return { bonus, fired: fired.map(p => p.name), final: clamp(base + bonus, 1, 99) };
  }

  function normalizeAuto(obj) {
    const vals   = Object.values(obj).map(v => Number(v) || 0);
    const sumRaw = vals.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
    if (!isFinite(sumRaw) || sumRaw <= 0) { const o = {}; for (const k in obj) o[k] = 0; return o; }
    const maxVal = Math.max(...vals.map(v => isFinite(v) ? v : 0));
    if (sumRaw > 0.95 && sumRaw < 1.05 && maxVal <= 1.01) { const o = {}; for (const k in obj) o[k] = Number(obj[k]) || 0; return o; }
    const o = {}; for (const k in obj) o[k] = (Number(obj[k]) || 0) / sumRaw; return o;
  }

  function asCount(v) {
    if (Array.isArray(v)) return v.length;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function dominance(ratios) {
    const vals = Object.values(ratios);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.max(...vals) - mean;
  }

  // 혼합형 집계 (0.7*mean + 0.3*top2)
  function mixedAvg(scores) {
    if (!scores.length) return 50;
    const mean  = scores.reduce((a, b) => a + b, 0) / scores.length;
    const top2  = [...scores].sort((a, b) => b - a).slice(0, 2);
    return 0.7 * mean + 0.3 * (top2.reduce((a, b) => a + b, 0) / top2.length);
  }

  // 10십신 → 5축 브리지
  function collapseTenGods(tenGods) {
    return {
      비겁: (tenGods["比肩"] || 0) + (tenGods["劫財"] || 0),
      식상: (tenGods["食神"] || 0) + (tenGods["傷官"] || 0),
      재성: (tenGods["偏財"] || 0) + (tenGods["正財"] || 0),
      관성: (tenGods["偏官"] || 0) + (tenGods["正官"] || 0),
      인성: (tenGods["偏印"] || 0) + (tenGods["正印"] || 0)
    };
  }

  // =========================================================
  // [FIX 1] subSkillStyled - blendedRaw 최고값 편향 완화
  // 0.85*max → 0.55*max + 0.45*avg
  // =========================================================
  function subSkillStyled(id, name, styles, scale, patterns) {
    const raws   = styles.map(s => s.raw);
    const maxRaw = Math.max(...raws);
    const maxIdx = raws.indexOf(maxRaw);
    const avgRaw = raws.reduce((a, b) => a + b, 0) / Math.max(1, raws.length);

    // [FIX 1] 편향 완화
    const blendedRaw = 0.55 * maxRaw + 0.45 * avgRaw;

    const tail = (typeof window !== "undefined" && window.__TAIL__) ? window.__TAIL__ : 1.0;
    const base = toScoreAuto(blendedRaw, scale, tail);
    const r    = applyPatterns(base, patterns);

    return {
      id, name,
      style:           (styles[maxIdx]?.name) || "",
      raw:             blendedRaw,
      rawA:            raws[0] || 0,
      rawB:            raws[1] || 0,
      rawC:            raws[2] || 0,
      scale,
      ratio:           blendedRaw / scale,
      base:            Math.round(base),
      bonus:           r.bonus,
      fired:           r.fired,
      score:           Math.round(r.final),
      grade:           grade(r.final),
      percentile:      scoreToPercentile(r.final),
      percentileLabel: percentileLabel(scoreToPercentile(r.final)),
    };
  }

  // =========================================================
  // [FIX 5] 카테고리 상한 캡
  // 통찰력이 높다고 나머지 축이 자동 동반상승 하지 않도록
  // =========================================================
  function applyCategoryCapRules(scores) {
    const { Insight, Timing, Sensitivity, Premonition } = scores;

    // 규칙1: 예지력은 직감스파크·예지몽·신비체감 중 2개 이상 중상(65+)이어야 80+ 허용
    // (이 시점엔 세부지표 접근 불가 → Premonition raw로 캡 적용)
    // 규칙2: 타이밍은 Insight와의 차이가 8점 이상 유지되도록
    // 규칙3: 4대 점수가 다 같이 85+ 이면 Timing·Premonition 캡
    const insightScore     = Insight.score;
    const timingScore      = Timing.score;
    const sensitivityScore = Sensitivity.score;
    const premonitionScore = Premonition.score;

    let tCapped  = timingScore;
    let pCapped  = premonitionScore;
    let sCapped  = sensitivityScore;

    // 통찰력 대비 타이밍 최대 차이 8점 이하로 제한
    // (타이밍이 통찰보다 높아지면 안 됨)
    if (tCapped > insightScore - 3) {
      tCapped = Math.min(tCapped, insightScore - 3);
    }

    // 예지력은 통찰 대비 최소 10점 이상 차이
    if (pCapped > insightScore - 10) {
      pCapped = Math.min(pCapped, insightScore - 10);
    }

    // 4개 전부 82+ 이면 Timing/Premonition을 추가 하향
    const allHigh = [insightScore, tCapped, sCapped, pCapped].every(s => s >= 82);
    if (allHigh) {
      tCapped  = Math.min(tCapped,  80);
      pCapped  = Math.min(pCapped,  78);
    }

    return {
      Insight:     { ...Insight },
      Timing:      { ...Timing,      score: Math.round(tCapped) },
      Sensitivity: { ...Sensitivity, score: Math.round(sCapped) },
      Premonition: { ...Premonition, score: Math.round(pCapped) }
    };
  }

  // =========================================================
  // 메인 계산
  // =========================================================
  function compute(baseState) {
    if (!baseState?.vectors?.tenGods || !baseState?.vectors?.elements) {
      console.warn("❌ baseState vectors가 없습니다:", baseState);
    }

    // 10십신 → 5축 브리지
    const rawTenGods = baseState.vectors.tenGods;
    const collapsed  = collapseTenGods(rawTenGods);
    const tg0Sum     = Object.values(collapsed).reduce((a, b) => a + b, 0);
    const tg0 = tg0Sum > 0 ? collapsed : {
      비겁: rawTenGods["비겁"] || 0,
      식상: rawTenGods["식상"] || 0,
      재성: rawTenGods["재성"] || 0,
      관성: rawTenGods["관성"] || 0,
      인성: rawTenGods["인성"] || 0
    };

    const el0    = baseState.vectors.elements;
    const tgMag  = Object.values(tg0).reduce((a, b) => a + b, 0);
    console.log("🔍 [v3.0] 5축 합계:", tgMag.toFixed(2), JSON.stringify(tg0));

    const tg = normalizeAuto({ 비겁: tg0.비겁, 식상: tg0.식상, 재성: tg0.재성, 관성: tg0.관성, 인성: tg0.인성 });
    const el = normalizeAuto({ wood: el0.wood, fire: el0.fire, earth: el0.earth, metal: el0.metal, water: el0.water });

    const tgDom = dominance(tg);
    const elDom = dominance(el);
    const spike = 0.65 * tgDom + 0.35 * elDom;

    // tail은 스파이크가 매우 강할 때만 미세 보정 (최대 +8%)
    const tail = 1.0 + clamp(spike * 0.25, 0, 0.08);
    window.__TAIL__ = tail;

    const strength = +baseState.strength.score || 50;

    const I      = baseState.interactions || {};
    const he     = asCount(I["합"]);
    const chung  = asCount(I["충"]);
    const hyung  = asCount(I["형"]);
    const pa     = asCount(I["파"]);
    const hae    = asCount(I["해"]);

    const volatility = chung + hyung + pa + hae;
    const noise      = 0.55 * chung + 0.35 * hyung + 0.20 * pa + 0.20 * hae;
    const connect    = 0.60 * he;

    const actionCoef = Math.min(tg.관성, tg.식상);
    const stubborn   = tg.비겁;

    // =========================================================
    // Insight (1~5) - 재료: 인성/관성/식상/오행 구조독해 중심
    // =========================================================
    const sub1 = subSkillStyled(1, "구조 파악력",
      [
        { name: "개념형",  raw: 1.5*tg.인성 + 0.9*tg.식상 + 0.4*tg.관성 - 0.25*noise },
        { name: "판읽기형", raw: 1.4*tg.관성 + 0.7*el.wood + 0.4*connect - 0.20*noise },
        { name: "스파크형", raw: 1.1*el.water + 0.5*tg.인성 + 0.15*noise + 0.3*spike }
      ], 0.42,
      [
        { cond: tg.인성 >= 0.22 && tg.관성 >= 0.18, add: 5, name: "인성+관성 강함" },
        { cond: noise >= 2.0 && tg.인성 < 0.14,     add:-5, name: "소음 과다+인성 부족" }
      ]
    );

    const sub2 = subSkillStyled(2, "미세신호 감지",
      [
        { name: "감각형", raw: 1.1*el.water + 0.6*el.wood + 0.3*tg.인성 + 0.15*noise + 0.35*spike },
        { name: "분석형", raw: 1.0*tg.인성  + 0.7*tg.식상 + 0.2*connect  - 0.20*noise }
      ], 0.42,
      [
        { cond: el.water >= 0.22 && tg.인성 >= 0.18, add: 4, name: "수+인성 조화" },
        { cond: el.fire >= 0.24  && tg.식상 < 0.12,  add:-4, name: "화 과다+식상 부족" }
      ]
    );

    const sub3 = subSkillStyled(3, "리스크 레이더",
      [
        { name: "규칙형", raw: 1.5*tg.관성 + 0.5*connect - 0.10*noise },
        { name: "변동형", raw: 1.0*tg.관성 + 0.6*noise   + 0.3*el.water }
      ], 0.42,
      [
        { cond: tg.관성 >= 0.20 && (chung + hyung) >= 2, add: 5, name: "관성+충형 경계" },
        { cond: tg.재성 >= 0.25 && tg.관성 < 0.12,       add:-5, name: "재성 과다+관성 부족" }
      ]
    );

    const sub4 = subSkillStyled(4, "판단 정밀도",
      [
        { name: "분석형", raw: 1.1*tg.인성 + 0.8*tg.식상 + 1.4*Math.min(tg.식상, tg.인성) - (noise>=2.2?0.28*noise:0.12*noise) },
        { name: "규칙형", raw: 1.0*tg.관성 + 0.5*tg.인성 + 1.6*actionCoef - (noise>=2.2?0.28*noise:0.12*noise) }
      ], 0.42,
      [
        { cond: el.metal >= 0.20 && tg.관성 >= 0.18, add: 4, name: "금+관성 정밀" },
        { cond: noise >= 2.2,                         add:-5, name: "소음 과다" },
        // 생각 깊어질수록 흔들림 패널티
        { cond: tg.인성 >= 0.30 && noise >= 1.5,     add:-3, name: "과다 분석 패널티" }
      ]
    );

    const sub5 = subSkillStyled(5, "전략 설계력",
      [
        { name: "설계형",  raw: 1.2*tg.관성 + 1.0*tg.인성 + 0.4*tg.식상 + 0.2*connect - 0.25*noise + 1.6*Math.min(tg.인성, tg.식상, tg.관성) },
        { name: "판재편형", raw: 1.2*tg.관성 + 0.6*tg.비겁 + 0.3*connect - 0.2*noise }
      ], 0.42,
      [
        { cond: tg.인성 >= 0.22 && tg.식상 >= 0.16 && tg.관성 >= 0.16, add: 6, name: "인성+식상+관성 균형" },
        { cond: tg.비겁 >= 0.28 && tg.인성 < 0.14,                      add:-5, name: "비겁 과다+인성 부족" }
      ]
    );

    // =========================================================
    // Timing (6~10) - [FIX 7] 포착/진입/회수·전환 명확히 분리
    // =========================================================

    // 실행 가중치: 식상+재성 높을수록 빠른 진입형
    const execSpeed  = tg.식상 * 0.6 + tg.재성 * 0.4;
    // 회수 저항: 비겁+인성 높을수록 늦게 포기 → 회수 패널티
    const holdBias   = tg.비겁 * 0.5 + tg.인성 * 0.4;
    // 숙고 보정: 관성 높을수록 "판단 후 진입" → 진입 속도 -
    const cautious   = tg.관성 * 0.5;

    const sub6 = subSkillStyled(6, "진입 타이밍",
      [
        // 실험형: 빠른 진입
        { name: "실험형", raw: 1.0*tg.식상 + 0.7*tg.비겁 + 0.5*tg.재성 - 0.3*noise - 0.4*cautious },
        // 확신형: 숙고 후 진입 (느리지만 정확)
        { name: "확신형", raw: 1.0*tg.인성 + 0.8*tg.관성 + 0.3*connect  - 0.4*cautious },
        // 파동형: 흐름 감지 진입
        { name: "파동형", raw: 0.8*el.water + 0.4*noise + 0.2*tg.식상 }
      ], 0.42,
      [
        { cond: tg.재성 >= 0.22 && tg.식상 >= 0.16,  add: 5, name: "재성+식상 조화" },
        // 숙고형은 진입 타이밍에서 패널티
        { cond: cautious >= 0.15 && execSpeed < 0.15, add:-5, name: "숙고형 진입 지연" },
        { cond: strength >= 70   && tg.비겁 >= 0.26,  add:-5, name: "신강+비겁 과다" }
      ]
    );

    const sub7 = subSkillStyled(7, "회수/정리 타이밍",
      [
        // 회수 타이밍: holdBias(미련) 높으면 낮아짐
        { name: "리스크형", raw: 1.2*tg.관성 + 1.0*actionCoef + 0.2*el.metal - 0.5*holdBias - 0.25*volatility },
        { name: "계산형",   raw: 0.9*tg.재성 + 0.6*tg.식상    + 0.4*tg.관성  + 0.8*actionCoef - 0.5*holdBias - 0.20*volatility }
      ], 0.42,
      [
        { cond: el.metal >= 0.22 && el.earth >= 0.20,   add: 4, name: "금+토 안정" },
        { cond: el.fire >= 0.24  && tg.관성 < 0.14,     add:-5, name: "화 과다+관성 부족" },
        // 깊이 읽는 타입일수록 회수 늦음
        { cond: tg.인성 >= 0.25 && tg.관성 < 0.18,     add:-4, name: "인성형 회수 지연" }
      ]
    );

    const sub8 = subSkillStyled(8, "기회 포착력",
      [
        // 기회 포착은 통찰 재료 일부 허용
        { name: "성과형",  raw: 1.1*tg.재성 + 0.7*tg.식상  + 0.3*tg.비겁  + 0.25*connect + 0.3*tg.관성 },
        { name: "판읽기형", raw: 1.0*tg.관성 + 0.7*el.wood  + 0.2*tg.인성  + 0.2*noise }
      ], 0.42,
      [
        { cond: tg.재성 >= 0.24,                    add: 5, name: "재성 강함" },
        { cond: noise >= 2.2 && tg.재성 < 0.16,     add:-4, name: "소음 과다+재성 부족" }
      ]
    );

    const sub9 = subSkillStyled(9, "운 수용력",
      [
        { name: "수용형", raw: 0.9*el.water + 0.7*tg.인성 + 0.2*connect },
        { name: "돌파형", raw: 0.8*tg.비겁  + 0.6*tg.식상 + 0.2*noise }
      ], 0.42,
      [
        { cond: tg.식상 >= 0.18 && tg.비겁 >= 0.18, add: 5, name: "식상+비겁 균형" },
        { cond: tg.인성 >= 0.30 && tg.식상 < 0.12,  add:-5, name: "인성 과다+식상 부족" }
      ]
    );

    const sub10 = subSkillStyled(10, "성과 전환력",
      [
        // 성과 전환: actionCoef 핵심, holdBias 페널티
        { name: "실행형", raw: 1.0*tg.식상 + 0.8*tg.재성 + 1.3*actionCoef - 0.4*holdBias - 0.15*volatility },
        { name: "구조형", raw: 0.9*tg.관성 + 0.7*tg.재성 + 1.4*actionCoef + 0.2*connect  - 0.4*holdBias - 0.15*volatility }
      ], 0.42,
      [
        { cond: tg.식상 >= 0.20 && tg.관성 >= 0.16,   add: 6, name: "식상+관성 조화" },
        { cond: el.water >= 0.26 && el.earth < 0.14,  add:-5, name: "수 과다+토 부족" },
        // 통찰형은 결과화(성과전환)가 약할 수 있음
        { cond: tg.인성 >= 0.28 && tg.식상 < 0.16,   add:-4, name: "인성형 실행 둔화" }
      ]
    );

    // =========================================================
    // Sensitivity (11~15) - [FIX 6] 공감과 압력감지 분리
    // =========================================================
    const sub11 = subSkillStyled(11, "호감/거리감 감지",
      [
        // 압력/분위기 감지형
        { name: "분위기형", raw: 1.2*el.water + 0.7*el.wood + 0.2*noise + 0.4*spike },
        // 공감형 (순수 정서 공감)
        { name: "공감형",   raw: 0.9*tg.인성  + 0.5*el.water - 0.2*noise }
      ], 0.44,
      [
        { cond: el.water >= 0.22 && el.wood >= 0.20, add: 5, name: "수+목 조화" },
        { cond: el.metal >= 0.26 && el.water < 0.14, add:-4, name: "금 과다+수 부족" }
      ]
    );

    const sub12 = subSkillStyled(12, "분위기 흡수력",
      [
        { name: "수채형", raw: 1.2*el.water + 0.5*el.wood + 0.3*noise + 0.5*spike },
        { name: "인성형", raw: 1.0*tg.인성  + 0.4*el.water + 0.1*connect }
      ], 0.44,
      [
        { cond: el.water >= 0.26,                     add: 5, name: "수 강함" },
        { cond: el.earth >= 0.30 && el.water < 0.14,  add:-5, name: "토 과다+수 부족" }
      ]
    );

    const sub13 = subSkillStyled(13, "공감/정서 동조",
      [
        // [FIX 6] 공감형은 압력감지(sub11)와 명확히 분리
        // 인성이 높아도 비겁이 높으면 공감보다 자기중심성
        { name: "공감형", raw: 1.3*tg.인성 + 0.4*el.water - 0.3*noise - 0.4*tg.비겁 },
        { name: "관찰형", raw: 0.8*tg.식상 + 0.6*el.water + 0.2*tg.인성 - 0.2*tg.비겁 }
      ], 0.44,
      [
        { cond: tg.인성 >= 0.24 && (el.wood + el.water) >= 0.40, add: 5, name: "인성+수목 조화" },
        { cond: tg.비겁 >= 0.25 && tg.인성 < 0.18,               add:-6, name: "비겁 강함+인성 약함" }
      ]
    );

    const sub14 = subSkillStyled(14, "관계 유지력",
      [
        // [FIX 6] 관계 유지력은 감응력과 별도 축
        // 민감하다고 관계가 안정적인 건 아님
        { name: "조율형", raw: 1.0*tg.관성 + 0.6*tg.인성  + 0.3*connect  - 0.3*noise - 0.3*tg.비겁 },
        { name: "추진형", raw: 0.8*tg.비겁 + 0.4*tg.인성  + 0.2*connect  - 0.2*noise }
      ], 0.44,
      [
        { cond: el.earth >= 0.22 && tg.관성 >= 0.18, add: 5, name: "토+관성 안정" },
        { cond: noise >= 2.3,                         add:-6, name: "소음 과다" },
        // 감응 강한데 관계유지 약할 수 있음 (과부하 때문)
        { cond: el.water >= 0.26 && tg.관성 < 0.16,  add:-4, name: "수 과다+관성 약함" }
      ]
    );

    const sub15 = subSkillStyled(15, "감응 과부하 위험",
      [
        { name: "과민형", raw: 1.3*el.water + 0.7*noise + 0.3*tg.인성 - 0.7*el.earth },
        { name: "소모형", raw: 1.0*tg.인성  + 0.6*connect + 0.4*noise - 0.7*el.earth }
      ], 0.52,
      [
        { cond: el.water >= 0.26 && el.earth < 0.14, add: 8, name: "수 과다+토 부족" },
        { cond: el.earth >= 0.26,                    add:-6, name: "토 안정" }
      ]
    );

    // =========================================================
    // Premonition (16~20) - [FIX 6] 통찰 재료 의존도 낮춤
    // 예지력은 수기운/인성/noise 제한적으로만 + 별도 상징 계열
    // =========================================================

    // 예지력 공통 재료: 수기운 + 약한 인성 기여 + noise의 미세 진동
    // 통찰 재료(관성, 전략, 리스크) 비율을 의도적으로 낮춤
    const premonBase = 0.5*el.water + 0.2*tg.인성 + 0.15*noise;

    const sub16 = subSkillStyled(16, "예감 적중률",
      [
        { name: "레이더형", raw: premonBase + 0.4*tg.관성 + 0.2*spike },   // 관성은 소량만
        { name: "상징형",   raw: premonBase + 0.3*connect + 0.3*spike }
      ], 0.46,
      [
        { cond: el.water >= 0.24 && tg.인성 >= 0.20, add: 5, name: "수+인성 조화" },
        { cond: noise >= 2.4,                         add:-5, name: "소음 과다" }
      ]
    );

    const sub17 = subSkillStyled(17, "직감 스파크",
      [
        // 직감 스파크는 spike 중심, 구조독해 재료 최소화
        { name: "스파크형",   raw: 1.1*el.water + 0.3*noise + 0.6*spike },
        { name: "개념점프형", raw: 0.7*tg.인성  + 0.5*el.water + 0.4*spike }
      ], 0.46,
      [
        { cond: tg.식상 >= 0.20 && el.water >= 0.18,  add: 4, name: "식상+수 조화" },
        { cond: el.earth >= 0.30 && tg.식상 < 0.12,   add:-4, name: "토 과다+식상 부족" },
        // 구조 독해형은 직감 스파크가 약할 수 있음
        { cond: tg.인성 >= 0.28 && tg.관성 >= 0.22,   add:-4, name: "구조분석형 직감 약화" }
      ]
    );

    const sub18 = subSkillStyled(18, "상징 해석력",
      [
        { name: "해석형", raw: 1.1*tg.인성 + 0.4*el.water + 0.2*tg.식상 + 0.3*spike },
        { name: "신호형", raw: 0.8*el.water + 0.4*noise   + 0.3*connect  + 0.4*spike }
      ], 0.46,
      [
        { cond: tg.인성 >= 0.24 && el.metal >= 0.18,  add: 5, name: "인성+금 조화" },
        { cond: el.fire >= 0.28  && tg.인성 < 0.14,   add:-5, name: "화 과다+인성 부족" }
      ]
    );

    const sub19 = subSkillStyled(19, "예지몽 체질",
      [
        // 예지몽은 신비형 재료만 - 통찰/관성 배제
        { name: "몽형",   raw: 1.3*el.water + 0.3*tg.인성 + 0.3*noise + 0.5*spike },
        { name: "민감형", raw: 0.9*el.water + 0.5*noise   + 0.4*spike }
      ], 0.46,
      [
        { cond: el.water >= 0.26 && tg.인성 >= 0.22 && el.earth < 0.18, add: 6, name: "수+인성 강함" },
        { cond: el.earth >= 0.26,                                         add:-6, name: "토 과다" },
        // 구조 독해형은 예지몽 체질 아님
        { cond: tg.관성 >= 0.22 && el.water < 0.20,                     add:-5, name: "관성형 예지몽 약화" }
      ]
    );

    const sub20 = subSkillStyled(20, "신비 체감 민감도",
      [
        { name: "감응형", raw: 1.2*el.water + 0.4*noise + 0.2*el.wood + 0.4*spike },
        { name: "내면형", raw: 0.9*tg.인성  + 0.5*el.water + 0.2*connect + 0.3*spike }
      ], 0.46,
      [
        { cond: noise >= 2.2 && el.water >= 0.22,   add: 6, name: "소음+수 조화" },
        { cond: el.earth >= 0.28 && el.water < 0.14,add:-6, name: "토 과다+수 부족" }
      ]
    );

    // =========================================================
    // 대분류 집계 (혼합형)
    // =========================================================
    const InsightRaw     = mixedAvg([sub1.score, sub2.score, sub3.score, sub4.score, sub5.score]);
    const TimingRaw      = mixedAvg([sub6.score, sub7.score, sub8.score, sub9.score, sub10.score]);
    const SensitivityRaw = mixedAvg([sub11.score, sub12.score, sub13.score, sub14.score]);
    const PremonitionRaw = mixedAvg([sub16.score, sub17.score, sub18.score, sub19.score, sub20.score]);
    const OverloadRisk   = sub15.score;

    // =========================================================
    // [FIX 5] 카테고리 상한 캡 적용
    // =========================================================
    const rawCategories = {
      Insight:     { score: Math.round(InsightRaw),     grade: grade(InsightRaw),     percentile: scoreToPercentile(InsightRaw, DIST.Insight),     percentileLabel: percentileLabel(scoreToPercentile(InsightRaw, DIST.Insight)) },
      Timing:      { score: Math.round(TimingRaw),      grade: grade(TimingRaw),      percentile: scoreToPercentile(TimingRaw, DIST.Timing),       percentileLabel: percentileLabel(scoreToPercentile(TimingRaw, DIST.Timing)) },
      Sensitivity: { score: Math.round(SensitivityRaw), grade: grade(SensitivityRaw), percentile: scoreToPercentile(SensitivityRaw, DIST.Sensitivity), percentileLabel: percentileLabel(scoreToPercentile(SensitivityRaw, DIST.Sensitivity)) },
      Premonition: { score: Math.round(PremonitionRaw), grade: grade(PremonitionRaw), percentile: scoreToPercentile(PremonitionRaw, DIST.Premonition), percentileLabel: percentileLabel(scoreToPercentile(PremonitionRaw, DIST.Premonition)) }
    };

    const cappedCategories = applyCategoryCapRules(rawCategories);

    // 캡 후 grade/백분위 재계산
    const categoriesResult = {};
    for (const [key, dist] of [["Insight", DIST.Insight], ["Timing", DIST.Timing], ["Sensitivity", DIST.Sensitivity], ["Premonition", DIST.Premonition]]) {
      const s = cappedCategories[key].score;
      categoriesResult[key] = {
        score:          s,
        grade:          grade(s),
        percentile:     scoreToPercentile(s, dist),
        percentileLabel: percentileLabel(scoreToPercentile(s, dist))
      };
    }

    // 종합 결과
    const avg = (...s) => s.reduce((a, b) => a + b, 0) / s.length;
    const InsightAvg     = categoriesResult.Insight.score;
    const TimingAvg      = categoriesResult.Timing.score;
    const SensitivityAvg = categoriesResult.Sensitivity.score;

    const overall1 = Math.round(0.45*TimingAvg + 0.45*InsightAvg + 0.10*(100-OverloadRisk));
    const overall2 = Math.round(avg(sub11.score, sub12.score, sub13.score, sub14.score) - 0.2*(OverloadRisk - 50));
    const overall3 = Math.round(0.5*sub19.score + 0.3*sub16.score + 0.2*sub20.score);
    const avoidCore       = 0.55*sub3.score + 0.45*sub7.score;
    const actionBoost     = 20 * clamp((actionCoef - 0.12) / 0.10, 0, 1);
    const overloadPenalty = 0.25 * pos(OverloadRisk - 60);
    const overall4 = Math.round(clamp(avoidCore + actionBoost - overloadPenalty, 1, 99));

    const typeName = determineType(categoriesResult);
    const typeDesc = TYPE_DEFS[typeName]?.desc || "";

    return {
      subs: [sub1, sub2, sub3, sub4, sub5, sub6, sub7, sub8, sub9, sub10,
             sub11, sub12, sub13, sub14, sub15, sub16, sub17, sub18, sub19, sub20],
      categories: categoriesResult,
      typeName,
      typeDesc,
      overall: {
        비즈니스촉: { score: overall1, grade: grade(overall1), percentile: scoreToPercentile(overall1), percentileLabel: percentileLabel(scoreToPercentile(overall1)) },
        연애호감촉: { score: overall2, grade: grade(overall2), percentile: scoreToPercentile(overall2), percentileLabel: percentileLabel(scoreToPercentile(overall2)) },
        예지몽:     { score: overall3, grade: grade(overall3), percentile: scoreToPercentile(overall3), percentileLabel: percentileLabel(scoreToPercentile(overall3)) },
        위기회피:   { score: overall4, grade: grade(overall4), percentile: scoreToPercentile(overall4), percentileLabel: percentileLabel(scoreToPercentile(overall4)) }
      },
      overloadRisk: OverloadRisk,
      debug: { tgDom, elDom, spike, tail, actionCoef, stubborn, holdBias, cautious, collapsed5axis: tg0, tgMag }
    };
  }

  window.IntuitionEngine = { compute };
  console.log("✅ IntuitionEngine v3.0 로드 완료");
})();
