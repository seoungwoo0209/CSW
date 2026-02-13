/* =========================================================
   직관 능력 분석 엔진 (intuition_engine.js)
   - 20개 중분류 지표 (2~3개 스타일로 세분화)
   - 스타일 라벨 UI 표시
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
    if (score >= 82) return "최상";
    if (score >= 72) return "상위";
    if (score >= 62) return "중상";
    if (score >= 52) return "중위";
    return "하위";
  }

  function percentBand(score) {
    if (score >= 82) return "최상위";
    if (score >= 72) return "상위권";
    if (score >= 62) return "평균 이상";
    if (score >= 52) return "평균권";
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

  // ===== 안전한 카운트 변환 =====
  function asCount(v) {
    if (Array.isArray(v)) return v.length;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  // ===== 스파이크 지수 계산 =====
  function dominance(ratios) {
    const vals = Object.values(ratios);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.max(...vals) - mean;
  }

  function entropy(ratios) {
    const vals = Object.values(ratios).map(x => Math.max(1e-9, x));
    const H = -vals.reduce((s, p) => s + p * Math.log(p), 0);
    return H;
  }

  // ===== 자동 스케일 점수 변환 =====
  function toScoreAuto(raw, std) {
    const scale = Math.max(0.18, std * 1.6);
    return clamp(50 + 42 * Math.tanh(raw / scale), 1, 99);
  }

  // ===== 강점 보존 집계 =====
  function strongAvg(scores) {
    const s = [...scores].sort((a, b) => b - a);
    const top2 = (s[0] + s[1]) / 2;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    return 0.6 * top2 + 0.4 * mean;
  }

  // ===== 스타일 기반 중분류 계산 =====
  function subSkillStyled(id, name, styles, scale, patterns) {
    const raws = styles.map(s => s.raw);
    const maxRaw = Math.max(...raws);
    const maxIdx = raws.indexOf(maxRaw);
    const avgRaw = raws.reduce((a,b)=>a+b,0) / Math.max(1, raws.length);
    const blendedRaw = 0.7 * maxRaw + 0.3 * avgRaw;

    const base = toScore(blendedRaw, scale);
    const r = applyPatterns(base, patterns);

    return {
      id,
      name,
      style: (styles[maxIdx] && styles[maxIdx].name) ? styles[maxIdx].name : "",
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
    if (!baseState?.vectors?.tenGods || !baseState?.vectors?.elements) {
      console.warn("❌ baseState vectors가 없습니다:", baseState);
    }
    
    const tg0 = baseState.vectors.tenGods;
    const el0 = baseState.vectors.elements;

    // 비율 (정규화)
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

    // 절대량 (총량)
    const tgMag = Object.values(tg0).reduce((a, b) => a + (Number(b) || 0), 0);
    const elMag = Object.values(el0).reduce((a, b) => a + (Number(b) || 0), 0);

    // 스파이크 지수
    const tgDom = dominance(tg);
    const elDom = dominance(el);
    const spike = 0.6 * tgDom + 0.4 * elDom;

    const strength = +baseState.strength.score || 50;

    const I = baseState.interactions || {};
    const he = asCount(I["합"]);
    const chung = asCount(I["충"]);
    const hyung = asCount(I["형"]);
    const pa = asCount(I["파"]);
    const hae = asCount(I["해"]);

    const noise = 0.50 * chung + 0.35 * hyung + 0.20 * pa + 0.20 * hae;
    const connect = 0.60 * he;

    // ===== Insight (1~5) =====
    const sub1 = subSkillStyled(
      1, "구조 파악력",
      [
        { name: "개념형", raw: 1.4*tg.인성 + 0.8*tg.식상 + 0.3*tg.관성 - 0.3*noise },
        { name: "판읽기형", raw: 1.3*tg.관성 + 0.6*el.wood + 0.3*connect - 0.2*noise },
        { name: "스파크형", raw: 1.0*el.water + 0.5*tg.인성 + 0.2*noise + 0.4*spike }
      ],
      0.45,
      [
        { cond: tg.인성 >= 0.22 && tg.관성 >= 0.18, add: 6, name: "인성+관성 강함" },
        { cond: noise >= 2.0 && tg.인성 < 0.14, add: -6, name: "소음 과다+인성 부족" }
      ]
    );

    const sub2 = subSkillStyled(
      2, "미세신호 감지",
      [
        { name: "감각형", raw: 1.2*el.water + 0.6*el.wood + 0.3*tg.인성 + 0.2*noise + 0.5*spike },
        { name: "분석형", raw: 1.1*tg.인성 + 0.7*tg.식상 + 0.2*connect - 0.2*noise }
      ],
      0.45,
      [
        { cond: el.water >= 0.22 && tg.인성 >= 0.18, add: 5, name: "수+인성 조화" },
        { cond: el.fire >= 0.24 && tg.식상 < 0.12, add: -4, name: "화 과다+식상 부족" }
      ]
    );

    const sub3 = subSkillStyled(
      3, "리스크 레이더",
      [
        { name: "규칙형", raw: 1.4*tg.관성 + 0.4*connect - 0.1*noise },
        { name: "변동형", raw: 0.9*tg.관성 + 0.6*noise + 0.3*el.water }
      ],
      0.45,
      [
        { cond: tg.관성 >= 0.20 && (chung + hyung) >= 2, add: 6, name: "관성+충형 경계" },
        { cond: tg.재성 >= 0.25 && tg.관성 < 0.12, add: -6, name: "재성 과다+관성 부족" }
      ]
    );

    const sub4 = subSkillStyled(
      4, "판단 정밀도",
      [
        { name: "분석형", raw: 1.3*tg.인성 + 0.9*tg.식상 - 0.2*noise + 1.0*Math.min(tg.인성, tg.식상) },
        { name: "규칙형", raw: 1.1*tg.관성 + 0.4*tg.인성 - 0.2*noise }
      ],
      0.45,
      [
        { cond: el.metal >= 0.20 && tg.관성 >= 0.18, add: 5, name: "금+관성 정밀" },
        { cond: noise >= 2.2, add: -5, name: "소음 과다" }
      ]
    );

    const sub5 = subSkillStyled(
      5, "전략 설계력",
      [
        { name: "설계형", raw: 1.2*tg.관성 + 1.0*tg.인성 + 0.4*tg.식상 + 0.2*connect - 0.3*noise + 1.8*Math.min(tg.인성, tg.식상, tg.관성) },
        { name: "판재편형", raw: 1.3*tg.관성 + 0.6*tg.비겁 + 0.3*connect - 0.2*noise }
      ],
      0.45,
      [
        { cond: tg.인성 >= 0.22 && tg.식상 >= 0.16 && tg.관성 >= 0.16, add: 7, name: "인성+식상+관성 균형" },
        { cond: tg.비겁 >= 0.28 && tg.인성 < 0.14, add: -6, name: "비겁 과다+인성 부족" }
      ]
    );

    // ===== Timing (6~10) =====
    const sub6 = subSkillStyled(
      6, "진입 타이밍",
      [
        { name: "실험형", raw: 1.0*tg.식상 + 0.8*tg.비겁 + 0.4*tg.재성 - 0.2*noise },
        { name: "확신형", raw: 1.1*tg.인성 + 0.7*tg.관성 + 0.2*connect - 0.3*noise },
        { name: "파동형", raw: 0.9*el.water + 0.5*noise + 0.2*tg.식상 }
      ],
      0.50,
      [
        { cond: tg.재성 >= 0.22 && tg.식상 >= 0.16, add: 6, name: "재성+식상 조화" },
        { cond: strength >= 70 && tg.비겁 >= 0.26, add: -6, name: "신강+비겁 과다" }
      ]
    );

    const sub7 = subSkillStyled(
      7, "회수/정리 타이밍",
      [
        { name: "리스크형", raw: 1.3*tg.관성 + 0.4*noise + 0.2*el.metal },
        { name: "계산형", raw: 0.9*tg.재성 + 0.7*tg.식상 + 0.2*tg.관성 - 0.2*noise }
      ],
      0.50,
      [
        { cond: el.metal >= 0.22 && el.earth >= 0.20, add: 5, name: "금+토 안정" },
        { cond: el.fire >= 0.24 && tg.관성 < 0.14, add: -5, name: "화 과다+관성 부족" }
      ]
    );

    const sub8 = subSkillStyled(
      8, "기회 포착력",
      [
        { name: "성과형", raw: 1.1*tg.재성 + 0.7*tg.식상 + 0.3*tg.비겁 + 0.2*connect },
        { name: "판읽기형", raw: 1.0*tg.관성 + 0.6*el.wood + 0.2*noise }
      ],
      0.50,
      [
        { cond: tg.재성 >= 0.26, add: 6, name: "재성 강함" },
        { cond: noise >= 2.2 && tg.재성 < 0.16, add: -4, name: "소음 과다+재성 부족" }
      ]
    );

    const sub9 = subSkillStyled(
      9, "운 수용력",
      [
        { name: "수용형", raw: 1.0*el.water + 0.8*tg.인성 + 0.2*connect },
        { name: "돌파형", raw: 0.9*tg.비겁 + 0.6*tg.식상 + 0.2*noise }
      ],
      0.50,
      [
        { cond: tg.식상 >= 0.18 && tg.비겁 >= 0.18, add: 6, name: "식상+비겁 균형" },
        { cond: tg.인성 >= 0.30 && tg.식상 < 0.12, add: -6, name: "인성 과다+식상 부족" }
      ]
    );

    const sub10 = subSkillStyled(
      10, "성과 전환",
      [
        { name: "실행형", raw: 1.1*tg.식상 + 0.9*tg.재성 + 0.4*tg.비겁 - 0.2*noise },
        { name: "구조형", raw: 1.0*tg.관성 + 0.8*tg.재성 + 0.2*connect - 0.2*noise }
      ],
      0.50,
      [
        { cond: tg.식상 >= 0.20 && tg.관성 >= 0.16, add: 7, name: "식상+관성 조화" },
        { cond: el.water >= 0.26 && el.earth < 0.14, add: -5, name: "수 과다+토 부족" }
      ]
    );

    // ===== Sensitivity (11~15) =====
    const sub11 = subSkillStyled(
      11, "호감/거리감 감지",
      [
        { name: "분위기형", raw: 1.1*el.water + 0.7*el.wood + 0.2*noise + 0.5*spike },
        { name: "공감형", raw: 1.0*tg.인성 + 0.5*el.water - 0.2*noise }
      ],
      0.45,
      [
        { cond: el.water >= 0.22 && el.wood >= 0.20, add: 6, name: "수+목 조화" },
        { cond: el.metal >= 0.26 && el.water < 0.14, add: -4, name: "금 과다+수 부족" }
      ]
    );

    const sub12 = subSkillStyled(
      12, "분위기 흡수력",
      [
        { name: "수채형", raw: 1.2*el.water + 0.5*el.wood + 0.3*noise + 0.6*spike },
        { name: "인성형", raw: 1.1*tg.인성 + 0.4*el.water + 0.1*connect }
      ],
      0.45,
      [
        { cond: el.water >= 0.26, add: 6, name: "수 강함" },
        { cond: el.earth >= 0.30 && el.water < 0.14, add: -5, name: "토 과다+수 부족" }
      ]
    );

    const sub13 = subSkillStyled(
      13, "공감/정서 동조",
      [
        { name: "공감형", raw: 1.3*tg.인성 + 0.4*el.water - 0.2*noise },
        { name: "관찰형", raw: 0.8*tg.식상 + 0.7*el.water + 0.2*tg.인성 }
      ],
      0.45,
      [
        { cond: tg.인성 >= 0.24 && (el.wood + el.water) >= 0.40, add: 6, name: "인성+수목 조화" },
        { cond: tg.비겁 >= 0.30 && tg.인성 < 0.14, add: -6, name: "비겁 과다+인성 부족" }
      ]
    );

    const sub14 = subSkillStyled(
      14, "관계 유지력",
      [
        { name: "조율형", raw: 1.0*tg.관성 + 0.7*tg.인성 + 0.2*connect - 0.2*noise },
        { name: "추진형", raw: 0.9*tg.비겁 + 0.4*tg.인성 + 0.2*connect }
      ],
      0.45,
      [
        { cond: el.earth >= 0.22 && tg.관성 >= 0.18, add: 6, name: "토+관성 안정" },
        { cond: noise >= 2.3, add: -6, name: "소음 과다" }
      ]
    );

    const sub15 = subSkillStyled(
      15, "감응 과부하 위험",
      [
        { name: "과민형", raw: 1.2*el.water + 0.7*noise + 0.3*tg.인성 - 0.6*el.earth },
        { name: "소모형", raw: 0.9*tg.인성 + 0.6*connect + 0.4*noise - 0.6*el.earth }
      ],
      0.55,
      [
        { cond: el.water >= 0.26 && el.earth < 0.14, add: 8, name: "수 과다+토 부족" },
        { cond: el.earth >= 0.26, add: -6, name: "토 안정" }
      ]
    );

    // ===== Premonition (16~20) =====
    const sub16 = subSkillStyled(
      16, "예감 적중률",
      [
        { name: "레이더형", raw: 1.2*tg.관성 + 0.5*el.water + 0.4*noise + 0.3*spike },
        { name: "상징형", raw: 1.1*tg.인성 + 0.6*el.water + 0.2*connect + 0.4*spike }
      ],
      0.50,
      [
        { cond: el.water >= 0.24 && tg.인성 >= 0.20, add: 7, name: "수+인성 조화" },
        { cond: noise >= 2.4, add: -6, name: "소음 과다" }
      ]
    );

    const sub17 = subSkillStyled(
      17, "직감 스파크",
      [
        { name: "스파크형", raw: 1.3*el.water + 0.4*noise + 0.2*tg.식상 + 0.7*spike },
        { name: "개념점프형", raw: 1.0*tg.인성 + 0.6*el.water + 0.2*tg.식상 + 0.4*spike }
      ],
      0.50,
      [
        { cond: tg.식상 >= 0.20 && el.water >= 0.18, add: 6, name: "식상+수 조화" },
        { cond: el.earth >= 0.30 && tg.식상 < 0.12, add: -4, name: "토 과다+식상 부족" }
      ]
    );

    const sub18 = subSkillStyled(
      18, "상징 해석력",
      [
        { name: "해석형", raw: 1.4*tg.인성 + 0.5*el.water + 0.2*tg.식상 + 0.3*spike },
        { name: "신호형", raw: 0.9*el.water + 0.5*noise + 0.3*connect + 0.5*spike }
      ],
      0.50,
      [
        { cond: tg.인성 >= 0.24 && el.metal >= 0.18, add: 6, name: "인성+금 조화" },
        { cond: el.fire >= 0.28 && tg.인성 < 0.14, add: -5, name: "화 과다+인성 부족" }
      ]
    );

    const sub19 = subSkillStyled(
      19, "예지몽 체질",
      [
        { name: "몽형", raw: 1.4*el.water + 0.5*tg.인성 + 0.3*noise + 0.6*spike },
        { name: "민감형", raw: 1.0*el.water + 0.6*noise + 0.4*spike }
      ],
      0.50,
      [
        { cond: el.water >= 0.26 && tg.인성 >= 0.22 && el.earth < 0.18, add: 8, name: "수+인성 강함" },
        { cond: el.earth >= 0.26, add: -6, name: "토 과다" }
      ]
    );

    const sub20 = subSkillStyled(
      20, "신비 체감 민감도",
      [
        { name: "감응형", raw: 1.3*el.water + 0.5*noise + 0.2*el.wood + 0.5*spike },
        { name: "내면형", raw: 1.1*tg.인성 + 0.6*el.water + 0.2*connect + 0.3*spike }
      ],
      0.50,
      [
        { cond: noise >= 2.2 && el.water >= 0.22, add: 7, name: "소음+수 조화" },
        { cond: el.earth >= 0.28 && el.water < 0.14, add: -6, name: "토 과다+수 부족" }
      ]
    );

    // ===== 대분류 평균 (강점 보존) =====
    const InsightAvg = strongAvg([sub1.score, sub2.score, sub3.score, sub4.score, sub5.score]);
    const TimingAvg = strongAvg([sub6.score, sub7.score, sub8.score, sub9.score, sub10.score]);
    const SensitivityAvg = strongAvg([sub11.score, sub12.score, sub13.score, sub14.score]);
    const PremonitionAvg = strongAvg([sub16.score, sub17.score, sub18.score, sub19.score, sub20.score]);
    const OverloadRisk = sub15.score;

    // ===== 종합 결과 4개 (GPT 공식) =====
    const avg = (...scores) => scores.reduce((a, b) => a + b, 0) / scores.length;
    
    const overall1 = Math.round(0.45 * TimingAvg + 0.45 * InsightAvg + 0.10 * (100 - OverloadRisk));
    const overall2 = Math.round(avg(sub11.score, sub12.score, sub13.score, sub14.score) - 0.2 * (OverloadRisk - 50));
    const overall3 = Math.round(0.5 * sub19.score + 0.3 * sub16.score + 0.2 * sub20.score);
    const overall4 = Math.round(0.45 * sub3.score + 0.35 * sub7.score + 0.20 * (100 - OverloadRisk));

    return {
      subs: [
        sub1, sub2, sub3, sub4, sub5,
        sub6, sub7, sub8, sub9, sub10,
        sub11, sub12, sub13, sub14, sub15,
        sub16, sub17, sub18, sub19, sub20
      ],

      categories: {
        Insight: { score: Math.round(InsightAvg), grade: grade(InsightAvg), percent: percentBand(InsightAvg) },
        Timing: { score: Math.round(TimingAvg), grade: grade(TimingAvg), percent: percentBand(TimingAvg) },
        Sensitivity: { score: Math.round(SensitivityAvg), grade: grade(SensitivityAvg), percent: percentBand(SensitivityAvg) },
        Premonition: { score: Math.round(PremonitionAvg), grade: grade(PremonitionAvg), percent: percentBand(PremonitionAvg) }
      },

      overall: {
        비즈니스촉: { score: overall1, grade: grade(overall1), percent: percentBand(overall1) },
        연애호감촉: { score: overall2, grade: grade(overall2), percent: percentBand(overall2) },
        예지몽: { score: overall3, grade: grade(overall3), percent: percentBand(overall3) },
        위기회피: { score: overall4, grade: grade(overall4), percent: percentBand(overall4) }
      },

      overloadRisk: OverloadRisk
    };
  }

  window.IntuitionEngine = { compute };
  console.log("✅ IntuitionEngine 로드 완료");
})();
