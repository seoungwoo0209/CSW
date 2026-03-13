/* =========================================================
   직관 능력 분석 엔진 (intuition_engine.js) v2.0
   [패치 내역]
   1. collapseTenGods() 브리지 함수 추가 (10십신→5축 변환)
   2. toScoreAuto() 중복 선언 제거 → 단일 함수(tail 지원)
   3. 대분류 집계: strongAvg(top3) → 혼합형(0.7*mean + 0.3*top2)
   4. 점수 표시: 점수 + 백분위 + 타입명 구조
   5. 백분위 기준분포 추가
   ========================================================= */

console.log("🔥 intuition_engine.js v2.0 로드");

(function() {
  'use strict';

  // ===== 공통 유틸 =====
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pos = x => Math.max(0, x);

  // ===== [FIX 2] toScoreAuto() 단일 함수 (tail 지원, 중복 제거) =====
  function toScoreAuto(raw, scale, tail = 1.0) {
    const s = Math.max(0.16, scale);
    const x = (raw / s) * tail;
    return clamp(50 + 44 * Math.tanh(x), 1, 99);
  }

  function grade(score) {
    if (score >= 82) return "최상";
    if (score >= 72) return "상위";
    if (score >= 62) return "중상";
    if (score >= 52) return "중위";
    return "하위";
  }

  // ===== [FIX 4] 백분위 계산 - 기준분포 기반 =====
  // 샘플 명식 시뮬레이션 기반 근사 분포 (mean≈63, std≈10)
  const SCORE_MEAN = 63;
  const SCORE_STD = 10;

  function scoreToPercentile(score) {
    const z = (score - SCORE_MEAN) / SCORE_STD;
    const t = 1 / (1 + 0.3275911 * Math.abs(z));
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    const erf = 1 - poly * Math.exp(-z * z);
    const cdf = 0.5 * (1 + (z >= 0 ? erf : -erf));
    const pct = Math.round(cdf * 100);
    return clamp(pct, 1, 99);
  }

  function percentileLabel(pct) {
    if (pct >= 90) return `상위 ${100 - pct}%`;
    if (pct >= 75) return `상위 ${100 - pct}%`;
    if (pct >= 50) return `상위 ${100 - pct}%`;
    if (pct >= 25) return `하위 ${pct}%`;
    return `하위 ${pct}%`;
  }

  // ===== [FIX 4] 타입명 분류 =====
  const TYPE_DEFS = {
    구조통찰형:   { desc: "조용히 패턴을 읽고 맞히는 타입" },
    파동예감형:   { desc: "흐름과 신호를 먼저 감지하는 타입" },
    감응공감형:   { desc: "감정과 분위기를 세밀하게 흡수하는 타입" },
    타이밍마스터: { desc: "진입과 회수의 박자를 본능적으로 아는 타입" },
    균형통합형:   { desc: "전 영역이 고르게 발달한 안정형" }
  };

  function determineType(categories) {
    const scores = {
      Insight: categories.Insight.score,
      Timing: categories.Timing.score,
      Sensitivity: categories.Sensitivity.score,
      Premonition: categories.Premonition.score
    };
    const maxKey = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
    const maxVal = scores[maxKey];
    const mean = Object.values(scores).reduce((a, b) => a + b, 0) / 4;
    const spread = maxVal - mean;

    if (spread < 5) return "균형통합형";

    const map = { Insight: "구조통찰형", Timing: "타이밍마스터", Sensitivity: "감응공감형", Premonition: "파동예감형" };
    return map[maxKey] || "균형통합형";
  }

  function applyPatterns(base, patterns) {
    const fired = patterns.filter(p => p.cond).sort((a, b) => Math.abs(b.add) - Math.abs(a.add)).slice(0, 2);
    const bonus = fired.reduce((s, p) => s + p.add, 0);
    return {
      bonus,
      fired: fired.map(p => p.name),
      final: clamp(base + bonus, 1, 99)
    };
  }

  function normalizeAuto(obj) {
    const vals = Object.values(obj).map(v => (typeof v === "number" ? v : Number(v)));
    const sumRaw = vals.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);

    if (!isFinite(sumRaw) || sumRaw <= 0) {
      const out = {};
      for (const k in obj) out[k] = 0;
      return out;
    }

    const maxVal = Math.max(...vals.map(v => (isFinite(v) ? v : 0)));

    if (sumRaw > 0.95 && sumRaw < 1.05 && maxVal <= 1.01) {
      const out = {};
      for (const k in obj) out[k] = Number(obj[k]) || 0;
      return out;
    }

    const out = {};
    for (const k in obj) out[k] = (Number(obj[k]) || 0) / sumRaw;
    return out;
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

  // ===== [FIX 3] 혼합형 집계 (0.7*mean + 0.3*top2평균) =====
  function mixedAvg(scores) {
    const n = scores.length;
    if (n === 0) return 50;
    const mean = scores.reduce((a, b) => a + b, 0) / n;
    const sorted = [...scores].sort((a, b) => b - a);
    const top2 = sorted.slice(0, 2);
    const top2mean = top2.reduce((a, b) => a + b, 0) / top2.length;
    return 0.7 * mean + 0.3 * top2mean;
  }

  // ===== [FIX 1] 10십신 → 5축 브리지 =====
  function collapseTenGods(tenGods) {
    return {
      비겁: (tenGods["比肩"] || 0) + (tenGods["劫財"] || 0),
      식상: (tenGods["食神"] || 0) + (tenGods["傷官"] || 0),
      재성: (tenGods["偏財"] || 0) + (tenGods["正財"] || 0),
      관성: (tenGods["偏官"] || 0) + (tenGods["正官"] || 0),
      인성: (tenGods["偏印"] || 0) + (tenGods["正印"] || 0)
    };
  }

  function subSkillStyled(id, name, styles, scale, patterns) {
    const raws = styles.map(s => s.raw);
    const maxRaw = Math.max(...raws);
    const maxIdx = raws.indexOf(maxRaw);
    const avgRaw = raws.reduce((a, b) => a + b, 0) / Math.max(1, raws.length);
    const blendedRaw = 0.85 * maxRaw + 0.15 * avgRaw;

    const tail = (typeof window !== "undefined" && window.__TAIL__) ? window.__TAIL__ : 1.0;
    // [FIX 2] tail이 실제로 toScoreAuto에 전달됨
    const base = toScoreAuto(blendedRaw, scale, tail);
    const r = applyPatterns(base, patterns);

    return {
      id,
      name,
      style: (styles[maxIdx] && styles[maxIdx].name) ? styles[maxIdx].name : "",
      raw: blendedRaw,
      rawA: raws[0] || 0,
      rawB: raws[1] || 0,
      rawC: raws[2] || 0,
      scale,
      ratio: blendedRaw / scale,
      base: Math.round(base),
      bonus: r.bonus,
      fired: r.fired,
      score: Math.round(r.final),
      grade: grade(r.final),
      percentile: scoreToPercentile(r.final),
      percentileLabel: percentileLabel(scoreToPercentile(r.final)),
    };
  }

  // ===== 메인 계산 함수 =====
  function compute(baseState) {
    if (!baseState?.vectors?.tenGods || !baseState?.vectors?.elements) {
      console.warn("❌ baseState vectors가 없습니다:", baseState);
    }

    // [FIX 1] 10십신 → 5축 브리지 적용
    const rawTenGods = baseState.vectors.tenGods;
    const collapsed = collapseTenGods(rawTenGods);

    // 5축 합이 0이면 원본에 이미 한글 키가 있는 경우 폴백
    const tg0Sum = Object.values(collapsed).reduce((a, b) => a + b, 0);
    const tg0 = tg0Sum > 0 ? collapsed : {
      비겁: (rawTenGods["비겁"] || 0),
      식상: (rawTenGods["식상"] || 0),
      재성: (rawTenGods["재성"] || 0),
      관성: (rawTenGods["관성"] || 0),
      인성: (rawTenGods["인성"] || 0)
    };

    const el0 = baseState.vectors.elements;

    const tgMag = Object.values(tg0).reduce((a, b) => a + b, 0);
    console.log("🔍 [IntuitionEngine] 5축 합계:", tgMag.toFixed(2), "| 입력:", JSON.stringify(tg0));

    const tg = normalizeAuto({ 비겁: tg0.비겁, 식상: tg0.식상, 재성: tg0.재성, 관성: tg0.관성, 인성: tg0.인성 });
    const el = normalizeAuto({ wood: el0.wood, fire: el0.fire, earth: el0.earth, metal: el0.metal, water: el0.water });

    const tgDom = dominance(tg);
    const elDom = dominance(el);
    const spike = 0.65 * tgDom + 0.35 * elDom;

    const tail = 1.0 + clamp(spike * 0.35, 0, 0.15);
    window.__TAIL__ = tail;

    const strength = +baseState.strength.score || 50;

    const I = baseState.interactions || {};
    const he     = asCount(I["합"]);
    const chung  = asCount(I["충"]);
    const hyung  = asCount(I["형"]);
    const pa     = asCount(I["파"]);  // detectInteractions 확장 후 실제로 옴
    const hae    = asCount(I["해"]);  // detectInteractions 확장 후 실제로 옴

    const volatility = chung + hyung + pa + hae;
    const noise = 0.55 * chung + 0.35 * hyung + 0.20 * pa + 0.20 * hae;
    const connect = 0.60 * he;

    const actionCoef = Math.min(tg.관성, tg.식상);
    const stubborn = tg.비겁;

    // ===== Insight (1~5) =====
    const sub1 = subSkillStyled(1, "구조 파악력",
      [
        { name: "개념형",  raw: 1.4*tg.인성 + 0.8*tg.식상 + 0.3*tg.관성 - 0.3*noise },
        { name: "판읽기형", raw: 1.3*tg.관성 + 0.6*el.wood + 0.3*connect - 0.2*noise },
        { name: "스파크형", raw: 1.0*el.water + 0.5*tg.인성 + 0.2*noise + 0.4*spike }
      ], 0.40,
      [
        { cond: tg.인성 >= 0.22 && tg.관성 >= 0.18, add: 6,  name: "인성+관성 강함" },
        { cond: noise >= 2.0 && tg.인성 < 0.14,     add: -6, name: "소음 과다+인성 부족" }
      ]
    );

    const sub2 = subSkillStyled(2, "미세신호 감지",
      [
        { name: "감각형", raw: 1.2*el.water + 0.6*el.wood + 0.3*tg.인성 + 0.2*noise + 0.5*spike },
        { name: "분석형", raw: 1.1*tg.인성 + 0.7*tg.식상 + 0.2*connect - 0.2*noise }
      ], 0.40,
      [
        { cond: el.water >= 0.22 && tg.인성 >= 0.18, add: 5,  name: "수+인성 조화" },
        { cond: el.fire >= 0.24 && tg.식상 < 0.12,   add: -4, name: "화 과다+식상 부족" }
      ]
    );

    const sub3 = subSkillStyled(3, "리스크 레이더",
      [
        { name: "규칙형", raw: 1.4*tg.관성 + 0.4*connect - 0.1*noise },
        { name: "변동형", raw: 0.9*tg.관성 + 0.6*noise + 0.3*el.water }
      ], 0.40,
      [
        { cond: tg.관성 >= 0.20 && (chung + hyung) >= 2, add: 6,  name: "관성+충형 경계" },
        { cond: tg.재성 >= 0.25 && tg.관성 < 0.12,       add: -6, name: "재성 과다+관성 부족" }
      ]
    );

    const sub4 = subSkillStyled(4, "판단 정밀도",
      [
        { name: "분석형", raw: 1.2*tg.인성 + 0.8*tg.식상 + 1.6*Math.min(tg.식상, tg.인성) - (noise>=2.2?0.25*noise:0.10*noise) },
        { name: "규칙형", raw: 1.1*tg.관성 + 0.5*tg.인성 + 1.8*actionCoef - (noise>=2.2?0.25*noise:0.10*noise) }
      ], 0.40,
      [
        { cond: el.metal >= 0.20 && tg.관성 >= 0.18, add: 5,  name: "금+관성 정밀" },
        { cond: noise >= 2.2,                         add: -5, name: "소음 과다" }
      ]
    );

    const sub5 = subSkillStyled(5, "전략 설계력",
      [
        { name: "설계형",  raw: 1.2*tg.관성 + 1.0*tg.인성 + 0.4*tg.식상 + 0.2*connect - 0.3*noise + 1.8*Math.min(tg.인성, tg.식상, tg.관성) },
        { name: "판재편형", raw: 1.3*tg.관성 + 0.6*tg.비겁 + 0.3*connect - 0.2*noise }
      ], 0.40,
      [
        { cond: tg.인성 >= 0.22 && tg.식상 >= 0.16 && tg.관성 >= 0.16, add: 7,  name: "인성+식상+관성 균형" },
        { cond: tg.비겁 >= 0.28 && tg.인성 < 0.14,                      add: -6, name: "비겁 과다+인성 부족" }
      ]
    );

    // ===== Timing (6~10) =====
    const sub6 = subSkillStyled(6, "진입 타이밍",
      [
        { name: "실험형", raw: 1.0*tg.식상 + 0.8*tg.비겁 + 0.4*tg.재성 - 0.2*noise },
        { name: "확신형", raw: 1.1*tg.인성 + 0.7*tg.관성 + 0.2*connect - 0.3*noise },
        { name: "파동형", raw: 0.9*el.water + 0.5*noise + 0.2*tg.식상 }
      ], 0.40,
      [
        { cond: tg.재성 >= 0.22 && tg.식상 >= 0.16, add: 6,  name: "재성+식상 조화" },
        { cond: strength >= 70 && tg.비겁 >= 0.26,  add: -6, name: "신강+비겁 과다" }
      ]
    );

    const sub7 = subSkillStyled(7, "회수/정리 타이밍",
      [
        { name: "리스크형", raw: 1.2*tg.관성 + 1.2*actionCoef + 0.2*el.metal - 0.35*stubborn - 0.18*volatility },
        { name: "계산형",   raw: 0.9*tg.재성 + 0.6*tg.식상 + 0.4*tg.관성 + 1.0*actionCoef - 0.30*stubborn - 0.12*volatility }
      ], 0.40,
      [
        { cond: el.metal >= 0.22 && el.earth >= 0.20, add: 5,  name: "금+토 안정" },
        { cond: el.fire >= 0.24 && tg.관성 < 0.14,   add: -5, name: "화 과다+관성 부족" }
      ]
    );

    const sub8 = subSkillStyled(8, "기회 포착력",
      [
        { name: "성과형",  raw: 1.1*tg.재성 + 0.7*tg.식상 + 0.3*tg.비겁 + 0.2*connect },
        { name: "판읽기형", raw: 1.0*tg.관성 + 0.6*el.wood + 0.2*noise }
      ], 0.40,
      [
        { cond: tg.재성 >= 0.26,                      add: 6,  name: "재성 강함" },
        { cond: noise >= 2.2 && tg.재성 < 0.16,       add: -4, name: "소음 과다+재성 부족" }
      ]
    );

    const sub9 = subSkillStyled(9, "운 수용력",
      [
        { name: "수용형", raw: 1.0*el.water + 0.8*tg.인성 + 0.2*connect },
        { name: "돌파형", raw: 0.9*tg.비겁 + 0.6*tg.식상 + 0.2*noise }
      ], 0.40,
      [
        { cond: tg.식상 >= 0.18 && tg.비겁 >= 0.18, add: 6,  name: "식상+비겁 균형" },
        { cond: tg.인성 >= 0.30 && tg.식상 < 0.12,  add: -6, name: "인성 과다+식상 부족" }
      ]
    );

    const sub10 = subSkillStyled(10, "성과 전환",
      [
        { name: "실행형", raw: 1.1*tg.식상 + 0.8*tg.재성 + 1.4*actionCoef - 0.25*stubborn - 0.10*volatility },
        { name: "구조형", raw: 1.0*tg.관성 + 0.7*tg.재성 + 1.5*actionCoef + 0.2*connect - 0.20*stubborn - 0.10*volatility }
      ], 0.40,
      [
        { cond: tg.식상 >= 0.20 && tg.관성 >= 0.16,  add: 7,  name: "식상+관성 조화" },
        { cond: el.water >= 0.26 && el.earth < 0.14, add: -5, name: "수 과다+토 부족" }
      ]
    );

    // ===== Sensitivity (11~15) =====
    const sub11 = subSkillStyled(11, "호감/거리감 감지",
      [
        { name: "분위기형", raw: 1.1*el.water + 0.7*el.wood + 0.2*noise + 0.5*spike },
        { name: "공감형",   raw: 1.0*tg.인성 + 0.5*el.water - 0.2*noise }
      ], 0.45,
      [
        { cond: el.water >= 0.22 && el.wood >= 0.20, add: 6,  name: "수+목 조화" },
        { cond: el.metal >= 0.26 && el.water < 0.14, add: -4, name: "금 과다+수 부족" }
      ]
    );

    const sub12 = subSkillStyled(12, "분위기 흡수력",
      [
        { name: "수채형", raw: 1.2*el.water + 0.5*el.wood + 0.3*noise + 0.6*spike },
        { name: "인성형", raw: 1.1*tg.인성 + 0.4*el.water + 0.1*connect }
      ], 0.45,
      [
        { cond: el.water >= 0.26,                       add: 6,  name: "수 강함" },
        { cond: el.earth >= 0.30 && el.water < 0.14,   add: -5, name: "토 과다+수 부족" }
      ]
    );

    const sub13 = subSkillStyled(13, "공감/정서 동조",
      [
        { name: "공감형", raw: 1.3*tg.인성 + 0.4*el.water - 0.2*noise },
        { name: "관찰형", raw: 0.8*tg.식상 + 0.7*el.water + 0.2*tg.인성 }
      ], 0.45,
      [
        { cond: tg.인성 >= 0.24 && (el.wood + el.water) >= 0.40, add: 6,  name: "인성+수목 조화" },
        { cond: tg.비겁 >= 0.30 && tg.인성 < 0.14,               add: -6, name: "비겁 과다+인성 부족" }
      ]
    );

    const sub14 = subSkillStyled(14, "관계 유지력",
      [
        { name: "조율형", raw: 1.0*tg.관성 + 0.7*tg.인성 + 0.2*connect - 0.2*noise },
        { name: "추진형", raw: 0.9*tg.비겁 + 0.4*tg.인성 + 0.2*connect }
      ], 0.45,
      [
        { cond: el.earth >= 0.22 && tg.관성 >= 0.18, add: 6,  name: "토+관성 안정" },
        { cond: noise >= 2.3,                         add: -6, name: "소음 과다" }
      ]
    );

    const sub15 = subSkillStyled(15, "감응 과부하 위험",
      [
        { name: "과민형", raw: 1.2*el.water + 0.7*noise + 0.3*tg.인성 - 0.6*el.earth },
        { name: "소모형", raw: 0.9*tg.인성 + 0.6*connect + 0.4*noise - 0.6*el.earth }
      ], 0.55,
      [
        { cond: el.water >= 0.26 && el.earth < 0.14, add: 8,  name: "수 과다+토 부족" },
        { cond: el.earth >= 0.26,                    add: -6, name: "토 안정" }
      ]
    );

    // ===== Premonition (16~20) =====
    const sub16 = subSkillStyled(16, "예감 적중률",
      [
        { name: "레이더형", raw: 1.2*tg.관성 + 0.5*el.water + 0.4*noise + 0.3*spike },
        { name: "상징형",   raw: 1.1*tg.인성 + 0.6*el.water + 0.2*connect + 0.4*spike }
      ], 0.45,
      [
        { cond: el.water >= 0.24 && tg.인성 >= 0.20, add: 7,  name: "수+인성 조화" },
        { cond: noise >= 2.4,                         add: -6, name: "소음 과다" }
      ]
    );

    const sub17 = subSkillStyled(17, "직감 스파크",
      [
        { name: "스파크형",   raw: 1.3*el.water + 0.4*noise + 0.2*tg.식상 + 0.7*spike },
        { name: "개념점프형", raw: 1.0*tg.인성 + 0.6*el.water + 0.2*tg.식상 + 0.4*spike }
      ], 0.45,
      [
        { cond: tg.식상 >= 0.20 && el.water >= 0.18,   add: 6,  name: "식상+수 조화" },
        { cond: el.earth >= 0.30 && tg.식상 < 0.12,    add: -4, name: "토 과다+식상 부족" }
      ]
    );

    const sub18 = subSkillStyled(18, "상징 해석력",
      [
        { name: "해석형", raw: 1.4*tg.인성 + 0.5*el.water + 0.2*tg.식상 + 0.3*spike },
        { name: "신호형", raw: 0.9*el.water + 0.5*noise + 0.3*connect + 0.5*spike }
      ], 0.45,
      [
        { cond: tg.인성 >= 0.24 && el.metal >= 0.18,  add: 6,  name: "인성+금 조화" },
        { cond: el.fire >= 0.28 && tg.인성 < 0.14,   add: -5, name: "화 과다+인성 부족" }
      ]
    );

    const sub19 = subSkillStyled(19, "예지몽 체질",
      [
        { name: "몽형",   raw: 1.4*el.water + 0.5*tg.인성 + 0.3*noise + 0.6*spike },
        { name: "민감형", raw: 1.0*el.water + 0.6*noise + 0.4*spike }
      ], 0.45,
      [
        { cond: el.water >= 0.26 && tg.인성 >= 0.22 && el.earth < 0.18, add: 8,  name: "수+인성 강함" },
        { cond: el.earth >= 0.26,                                         add: -6, name: "토 과다" }
      ]
    );

    const sub20 = subSkillStyled(20, "신비 체감 민감도",
      [
        { name: "감응형", raw: 1.3*el.water + 0.5*noise + 0.2*el.wood + 0.5*spike },
        { name: "내면형", raw: 1.1*tg.인성 + 0.6*el.water + 0.2*connect + 0.3*spike }
      ], 0.45,
      [
        { cond: noise >= 2.2 && el.water >= 0.22,        add: 7,  name: "소음+수 조화" },
        { cond: el.earth >= 0.28 && el.water < 0.14,    add: -6, name: "토 과다+수 부족" }
      ]
    );

    // ===== [FIX 3] 대분류: 혼합형 집계 =====
    const InsightAvg     = mixedAvg([sub1.score, sub2.score, sub3.score, sub4.score, sub5.score]);
    const TimingAvg      = mixedAvg([sub6.score, sub7.score, sub8.score, sub9.score, sub10.score]);
    const SensitivityAvg = mixedAvg([sub11.score, sub12.score, sub13.score, sub14.score]);
    const PremonitionAvg = mixedAvg([sub16.score, sub17.score, sub18.score, sub19.score, sub20.score]);
    const OverloadRisk   = sub15.score;

    // ===== 종합 =====
    const avg = (...s) => s.reduce((a, b) => a + b, 0) / s.length;
    const overall1 = Math.round(0.45 * TimingAvg + 0.45 * InsightAvg + 0.10 * (100 - OverloadRisk));
    const overall2 = Math.round(avg(sub11.score, sub12.score, sub13.score, sub14.score) - 0.2 * (OverloadRisk - 50));
    const overall3 = Math.round(0.5 * sub19.score + 0.3 * sub16.score + 0.2 * sub20.score);
    const avoidCore = 0.55 * sub3.score + 0.45 * sub7.score;
    const actionBoost = 20 * clamp((actionCoef - 0.12) / 0.10, 0, 1);
    const overloadPenalty = 0.25 * pos(OverloadRisk - 60);
    const overall4 = Math.round(clamp(avoidCore + actionBoost - overloadPenalty, 1, 99));

    // ===== [FIX 4] 카테고리에 백분위+타입 추가 =====
    const categoriesResult = {
      Insight:     { score: Math.round(InsightAvg),     grade: grade(InsightAvg),     percentile: scoreToPercentile(InsightAvg),     percentileLabel: percentileLabel(scoreToPercentile(InsightAvg)) },
      Timing:      { score: Math.round(TimingAvg),      grade: grade(TimingAvg),      percentile: scoreToPercentile(TimingAvg),      percentileLabel: percentileLabel(scoreToPercentile(TimingAvg)) },
      Sensitivity: { score: Math.round(SensitivityAvg), grade: grade(SensitivityAvg), percentile: scoreToPercentile(SensitivityAvg), percentileLabel: percentileLabel(scoreToPercentile(SensitivityAvg)) },
      Premonition: { score: Math.round(PremonitionAvg), grade: grade(PremonitionAvg), percentile: scoreToPercentile(PremonitionAvg), percentileLabel: percentileLabel(scoreToPercentile(PremonitionAvg)) }
    };

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
      debug: { tgDom, elDom, spike, tail, actionCoef, stubborn, collapsed5axis: tg0, tgMag }
    };
  }

  window.IntuitionEngine = { compute };
  console.log("✅ IntuitionEngine v2.0 로드 완료");
})();
