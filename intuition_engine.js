/* =========================================================
   직관 능력 분석 엔진 (intuition_engine.js)
   - 20개 중분류 지표
   - 4개 대분류 평균
   - 4개 종합 결과
   ========================================================= */

console.log("🔥 intuition_engine.js 로드");

(function() {
  'use strict';

  // ===== 공통 유틸 =====
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pos = x => Math.max(0, x);
  const tanh = x => Math.tanh(x);

  function toScore(raw, scale) {
    return clamp(50 + 38 * tanh(raw / scale), 1, 99);
  }

  function grade(score) {
    if (score >= 95) return "S";
    if (score >= 85) return "A";
    if (score >= 70) return "B";
    if (score >= 55) return "C";
    return "D";
  }

  function percentBand(score) {
    if (score >= 95) return "상위 1%";
    if (score >= 90) return "상위 3%";
    if (score >= 85) return "상위 8%";
    if (score >= 80) return "상위 15%";
    if (score >= 70) return "상위 30%";
    if (score >= 55) return "평균권";
    return "하위권";
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

  // ===== 자동 정규화 =====
  function normalizeAuto(obj) {
    const vals = Object.values(obj).map(v => (typeof v === "number" ? v : Number(v)));
    const sumRaw = vals.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);

    // ✅ 전부 0/undefined면 "0으로 채운 객체" 반환 (NaN 방지)
    if (!isFinite(sumRaw) || sumRaw <= 0) {
      const out = {};
      for (const k in obj) out[k] = 0;
      return out;
    }

    const maxVal = Math.max(...vals.map(v => (isFinite(v) ? v : 0)));

    // ✅ 이미 비율(합≈1)일 때만 그대로 사용 (단, 값들이 0~1 범위일 때)
    if (sumRaw > 0.95 && sumRaw < 1.05 && maxVal <= 1.01) {
      const out = {};
      for (const k in obj) out[k] = Number(obj[k]) || 0;
      return out;
    }

    // ✅ 그 외는 정규화
    const out = {};
    for (const k in obj) out[k] = (Number(obj[k]) || 0) / sumRaw;
    return out;
  }

  // ===== 중분류 계산 헬퍼 =====
  function subSkill(id, name, raw, scale, patterns) {
    const base = toScore(raw, scale);
    const r = applyPatterns(base, patterns);
    return {
      id,
      name,
      base: Math.round(base),
      bonus: r.bonus,
      fired: r.fired,
      score: Math.round(r.final),
      grade: grade(r.final),
      percent: percentBand(r.final),
    };
  }

  // ===== 메인 계산 함수 =====
  function compute(baseState) {
    // 안전장치: baseState 검증
    if (!baseState?.vectors?.tenGods || !baseState?.vectors?.elements) {
      console.warn("❌ baseState vectors가 없습니다:", baseState);
    }
    
    // baseState 읽기
    const tg0 = baseState.vectors.tenGods;
    const el0 = baseState.vectors.elements;

    const tg = normalizeAuto({
      비겁: tg0["비겁"],
      식상: tg0["식상"],
      재성: tg0["재성"],
      관성: tg0["관성"],
      인성: tg0["인성"]
    });

    const el = normalizeAuto({
      wood: el0.wood,
      fire: el0.fire,
      earth: el0.earth,
      metal: el0.metal,
      water: el0.water
    });

    const strength = +baseState.strength.score || 50;

    const I = baseState.interactions || {};
    const he = +I["합"] || 0;
    const chung = +I["충"] || 0;
    const hyung = +I["형"] || 0;
    const pa = +I["파"] || 0;
    const hae = +I["해"] || 0;

    const noise = 0.50 * chung + 0.35 * hyung + 0.20 * pa + 0.20 * hae;
    const connect = 0.60 * he;

    // ===== Insight (1~5) =====
    const sub1 = subSkill(
      1, "구조 파악력",
      1.2 * tg.인성 + 0.9 * tg.식상 + 0.7 * tg.관성 + 0.10 * connect - 0.18 * noise,
      0.45,
      [
        { cond: tg.인성 >= 0.22 && tg.관성 >= 0.18, add: 6, name: "인성+관성 강함" },
        { cond: noise >= 2.0 && tg.인성 < 0.14, add: -6, name: "소음 과다+인성 부족" }
      ]
    );

    const sub2 = subSkill(
      2, "미세신호 감지",
      1.0 * el.water + 0.8 * tg.인성 + 0.6 * tg.식상 + 0.05 * connect - 0.15 * noise,
      0.45,
      [
        { cond: el.water >= 0.22 && tg.인성 >= 0.18, add: 5, name: "수+인성 조화" },
        { cond: el.fire >= 0.24 && tg.식상 < 0.12, add: -4, name: "화 과다+식상 부족" }
      ]
    );

    const sub3 = subSkill(
      3, "리스크 레이더",
      1.0 * tg.관성 + 0.7 * el.earth + 0.6 * el.metal + 0.4 * tg.인성 - 0.10 * connect - 0.10 * noise,
      0.45,
      [
        { cond: tg.관성 >= 0.20 && (chung + hyung) >= 2, add: 6, name: "관성+충형 경계" },
        { cond: tg.재성 >= 0.25 && tg.관성 < 0.12, add: -6, name: "재성 과다+관성 부족" }
      ]
    );

    const sub4 = subSkill(
      4, "판단 정밀도",
      0.9 * el.metal + 0.8 * tg.관성 + 0.6 * tg.인성 + 0.3 * el.earth - 0.12 * noise,
      0.45,
      [
        { cond: el.metal >= 0.20 && tg.관성 >= 0.18, add: 5, name: "금+관성 정밀" },
        { cond: noise >= 2.2, add: -5, name: "소음 과다" }
      ]
    );

    const sub5 = subSkill(
      5, "전략 설계력",
      1.1 * tg.관성 + 0.9 * tg.인성 + 0.5 * tg.식상 + 0.20 * el.earth + 0.08 * connect - 0.18 * noise,
      0.45,
      [
        { cond: tg.인성 >= 0.22 && tg.식상 >= 0.16 && tg.관성 >= 0.16, add: 7, name: "인성+식상+관성 균형" },
        { cond: tg.비겁 >= 0.28 && tg.인성 < 0.14, add: -6, name: "비겁 과다+인성 부족" }
      ]
    );

    // ===== Timing (6~10) =====
    const sub6 = subSkill(
      6, "진입 타이밍",
      1.1 * tg.재성 + 0.8 * tg.식상 + 0.6 * el.water + 0.10 * connect - 0.15 * noise - 0.35 * pos(tg.비겁 - 0.20) * (strength >= 66 ? 1 : 0),
      0.50,
      [
        { cond: tg.재성 >= 0.22 && tg.식상 >= 0.16, add: 6, name: "재성+식상 조화" },
        { cond: strength >= 70 && tg.비겁 >= 0.26, add: -6, name: "신강+비겁 과다" }
      ]
    );

    const sub7 = subSkill(
      7, "회수/정리 타이밍",
      1.0 * el.metal + 0.8 * tg.관성 + 0.6 * el.earth + 0.3 * tg.인성 - 0.10 * connect,
      0.50,
      [
        { cond: el.metal >= 0.22 && el.earth >= 0.20, add: 5, name: "금+토 안정" },
        { cond: el.fire >= 0.24 && tg.관성 < 0.14, add: -5, name: "화 과다+관성 부족" }
      ]
    );

    const sub8 = subSkill(
      8, "기회 포착력",
      1.2 * tg.재성 + 0.7 * tg.식상 + 0.4 * el.wood + 0.4 * el.water + 0.05 * connect - 0.10 * noise,
      0.50,
      [
        { cond: tg.재성 >= 0.26, add: 6, name: "재성 강함" },
        { cond: noise >= 2.2 && tg.재성 < 0.16, add: -4, name: "소음 과다+재성 부족" }
      ]
    );

    const sub9 = subSkill(
      9, "운 수용력",
      0.9 * tg.재성 + 0.7 * tg.비겁 + 0.7 * tg.식상 + 0.3 * el.fire - 0.20 * noise - 0.30 * pos(tg.인성 - 0.28),
      0.50,
      [
        { cond: tg.식상 >= 0.18 && tg.비겁 >= 0.18, add: 6, name: "식상+비겁 균형" },
        { cond: tg.인성 >= 0.30 && tg.식상 < 0.12, add: -6, name: "인성 과다+식상 부족" }
      ]
    );

    const sub10 = subSkill(
      10, "성과 전환",
      1.0 * tg.식상 + 0.9 * tg.관성 + 0.6 * tg.재성 + 0.3 * el.earth - 0.18 * noise,
      0.50,
      [
        { cond: tg.식상 >= 0.20 && tg.관성 >= 0.16, add: 7, name: "식상+관성 조화" },
        { cond: el.water >= 0.26 && el.earth < 0.14, add: -5, name: "수 과다+토 부족" }
      ]
    );

    // ===== Sensitivity (11~15) =====
    const sub11 = subSkill(
      11, "호감/거리감 감지",
      1.0 * el.water + 0.8 * el.wood + 0.6 * tg.인성 + 0.10 * connect - 0.10 * noise,
      0.45,
      [
        { cond: el.water >= 0.22 && el.wood >= 0.20, add: 6, name: "수+목 조화" },
        { cond: el.metal >= 0.26 && el.water < 0.14, add: -4, name: "금 과다+수 부족" }
      ]
    );

    const sub12 = subSkill(
      12, "분위기 흡수력",
      1.2 * el.water + 0.7 * tg.인성 + 0.4 * el.wood - 0.05 * connect - 0.10 * noise,
      0.45,
      [
        { cond: el.water >= 0.26, add: 6, name: "수 강함" },
        { cond: el.earth >= 0.30 && el.water < 0.14, add: -5, name: "토 과다+수 부족" }
      ]
    );

    const sub13 = subSkill(
      13, "공감/정서 동조",
      1.0 * tg.인성 + 0.6 * el.wood + 0.6 * el.water - 0.10 * noise,
      0.45,
      [
        { cond: tg.인성 >= 0.24 && (el.wood + el.water) >= 0.40, add: 6, name: "인성+수목 조화" },
        { cond: tg.비겁 >= 0.30 && tg.인성 < 0.14, add: -6, name: "비겁 과다+인성 부족" }
      ]
    );

    const sub14 = subSkill(
      14, "관계 유지력",
      0.9 * el.earth + 0.7 * tg.관성 + 0.6 * tg.인성 + 0.10 * connect - 0.18 * noise,
      0.45,
      [
        { cond: el.earth >= 0.22 && tg.관성 >= 0.18, add: 6, name: "토+관성 안정" },
        { cond: noise >= 2.3, add: -6, name: "소음 과다" }
      ]
    );

    const sub15 = subSkill(
      15, "감응 과부하 위험",
      1.2 * el.water + 0.8 * tg.인성 + 0.6 * noise - 0.6 * el.earth,
      0.55,
      [
        { cond: el.water >= 0.26 && el.earth < 0.14, add: 8, name: "수 과다+토 부족" },
        { cond: el.earth >= 0.26, add: -6, name: "토 안정" }
      ]
    );

    // ===== Premonition (16~20) =====
    const sub16 = subSkill(
      16, "예감 적중률",
      1.1 * el.water + 0.8 * tg.인성 + 0.4 * connect - 0.12 * noise,
      0.50,
      [
        { cond: el.water >= 0.24 && tg.인성 >= 0.20, add: 7, name: "수+인성 조화" },
        { cond: noise >= 2.4, add: -6, name: "소음 과다" }
      ]
    );

    const sub17 = subSkill(
      17, "직감 스파크",
      0.9 * tg.식상 + 0.8 * el.water + 0.4 * el.fire - 0.10 * noise,
      0.50,
      [
        { cond: tg.식상 >= 0.20 && el.water >= 0.18, add: 6, name: "식상+수 조화" },
        { cond: el.earth >= 0.30 && tg.식상 < 0.12, add: -4, name: "토 과다+식상 부족" }
      ]
    );

    const sub18 = subSkill(
      18, "상징 해석력",
      1.0 * tg.인성 + 0.6 * el.wood + 0.6 * el.water + 0.2 * el.metal - 0.12 * noise,
      0.50,
      [
        { cond: tg.인성 >= 0.24 && el.metal >= 0.18, add: 6, name: "인성+금 조화" },
        { cond: el.fire >= 0.28 && tg.인성 < 0.14, add: -5, name: "화 과다+인성 부족" }
      ]
    );

    const sub19 = subSkill(
      19, "예지몽 체질",
      1.2 * el.water + 0.9 * tg.인성 + 0.25 * noise - 0.35 * el.metal - 0.35 * el.earth,
      0.50,
      [
        { cond: el.water >= 0.26 && tg.인성 >= 0.22 && el.earth < 0.18, add: 8, name: "수+인성 강함" },
        { cond: el.earth >= 0.26, add: -6, name: "토 과다" }
      ]
    );

    const sub20 = subSkill(
      20, "신비 체감 민감도",
      1.0 * el.water + 0.8 * tg.인성 + 0.5 * noise + 0.2 * connect - 0.5 * el.earth,
      0.50,
      [
        { cond: noise >= 2.2 && el.water >= 0.22, add: 7, name: "소음+수 조화" },
        { cond: el.earth >= 0.28 && el.water < 0.14, add: -6, name: "토 과다+수 부족" }
      ]
    );

    // ===== 대분류 평균 =====
    const avg = (...scores) => scores.reduce((a, b) => a + b, 0) / scores.length;

    const InsightAvg = avg(sub1.score, sub2.score, sub3.score, sub4.score, sub5.score);
    const TimingAvg = avg(sub6.score, sub7.score, sub8.score, sub9.score, sub10.score);
    const SensitivityAvg = avg(sub11.score, sub12.score, sub13.score, sub14.score);
    const PremonitionAvg = avg(sub16.score, sub17.score, sub18.score, sub19.score, sub20.score);
    const OverloadRisk = sub15.score;

    // ===== 종합 결과 4개 =====
    const overall1 = Math.round(0.45 * TimingAvg + 0.35 * InsightAvg + 0.20 * (100 - OverloadRisk));
    const overall2 = Math.round(0.55 * sub11.score + 0.25 * sub12.score + 0.20 * sub13.score);
    const overall3 = Math.round(0.55 * sub19.score + 0.25 * sub16.score + 0.20 * sub20.score);
    const overall4 = Math.round(0.50 * sub3.score + 0.20 * sub7.score + 0.30 * (100 - OverloadRisk));

    return {
      // 중분류 20개
      subs: [
        sub1, sub2, sub3, sub4, sub5,
        sub6, sub7, sub8, sub9, sub10,
        sub11, sub12, sub13, sub14, sub15,
        sub16, sub17, sub18, sub19, sub20
      ],

      // 대분류 평균
      categories: {
        Insight: { score: Math.round(InsightAvg), grade: grade(InsightAvg), percent: percentBand(InsightAvg) },
        Timing: { score: Math.round(TimingAvg), grade: grade(TimingAvg), percent: percentBand(TimingAvg) },
        Sensitivity: { score: Math.round(SensitivityAvg), grade: grade(SensitivityAvg), percent: percentBand(SensitivityAvg) },
        Premonition: { score: Math.round(PremonitionAvg), grade: grade(PremonitionAvg), percent: percentBand(PremonitionAvg) }
      },

      // 종합 결과
      overall: {
        비즈니스촉: { score: overall1, grade: grade(overall1), percent: percentBand(overall1) },
        연애호감촉: { score: overall2, grade: grade(overall2), percent: percentBand(overall2) },
        예지몽: { score: overall3, grade: grade(overall3), percent: percentBand(overall3) },
        위기회피: { score: overall4, grade: grade(overall4), percent: percentBand(overall4) }
      },

      // 과부하 위험
      overloadRisk: OverloadRisk
    };
  }

  // ===== 전역 등록 =====
  window.IntuitionEngine = { compute };
  console.log("✅ IntuitionEngine 로드 완료");
})();
