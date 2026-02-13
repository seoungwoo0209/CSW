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
    const sub1 = subSkillStyled(
      1, "구조 파악력",
      [
        { name: "개념형", raw: 1.55 * tg.인성 + 0.95 * tg.식상 - 0.10 * noise },
        { name: "판읽기형", raw: 1.35 * tg.관성 + 0.70 * el.earth + 0.12 * connect - 0.16 * noise },
        { name: "직감형", raw: 1.05 * el.water + 0.70 * tg.인성 + 0.05 * connect - 0.20 * noise }
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
        { name: "감각형", raw: 1.15 * el.water + 0.80 * tg.인성 + 0.05 * connect - 0.14 * noise },
        { name: "관찰·표현형", raw: 1.10 * tg.식상 + 0.85 * tg.인성 - 0.10 * noise },
        { name: "교류형", raw: 0.95 * el.wood + 0.75 * el.water + 0.40 * tg.관성 - 0.12 * noise }
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
        { name: "구조·리스크형", raw: 1.45 * tg.관성 + 0.75 * el.metal + 0.10 * connect - 0.15 * noise },
        { name: "감지형", raw: 1.10 * el.water + 1.05 * tg.관성 + 0.05 * connect - 0.18 * noise },
        { name: "신중형", raw: 1.05 * el.earth + 1.10 * tg.관성 + 0.30 * tg.인성 - 0.12 * noise }
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
        { name: "정밀·분석형", raw: 1.25 * tg.식상 + 0.95 * tg.인성 - 0.10 * noise },
        { name: "규칙·판단형", raw: 1.20 * tg.관성 + 0.70 * el.earth + 0.06 * connect - 0.12 * noise },
        { name: "통합형", raw: 1.00 * tg.인성 + 0.85 * tg.관성 + 0.65 * tg.식상 + 0.03 * connect - 0.10 * noise }
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
        { name: "설계·개념형", raw: 1.20 * tg.인성 + 0.85 * tg.관성 + 0.55 * tg.식상 + 0.06 * connect - 0.10 * noise },
        { name: "판짜기형", raw: 1.30 * tg.관성 + 0.85 * el.wood + 0.10 * connect - 0.14 * noise },
        { name: "자원배치형", raw: 1.15 * tg.재성 + 0.95 * tg.관성 + 0.45 * tg.식상 - 0.10 * noise }
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
        { name: "실험·돌파형", raw: 1.25 * tg.식상 + 1.05 * tg.비겁 + 0.05 * connect - 0.14 * noise },
        { name: "기회·보상형", raw: 1.20 * tg.재성 + 0.75 * tg.식상 + 0.10 * connect - 0.10 * noise },
        { name: "신중·확신형", raw: 1.10 * tg.관성 + 0.75 * tg.인성 + 0.05 * connect - 0.16 * noise }
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
        { name: "규칙·정리형", raw: 1.55 * tg.관성 + 0.75 * el.metal + 0.06 * connect - 0.14 * noise },
        { name: "수익·회수형", raw: 1.20 * tg.재성 + 0.85 * el.metal + 0.45 * tg.식상 - 0.10 * noise },
        { name: "촉·회피형", raw: 1.05 * el.water + 1.10 * tg.관성 - 0.18 * noise }
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
        { name: "돈·리워드형", raw: 1.35 * tg.재성 + 0.75 * tg.식상 + 0.06 * connect - 0.10 * noise },
        { name: "네트워크형", raw: 1.10 * tg.비겁 + 0.85 * el.wood + 0.10 * connect - 0.12 * noise },
        { name: "패턴형", raw: 1.05 * tg.인성 + 0.95 * tg.재성 - 0.10 * noise }
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
        { name: "흐름·수용형", raw: 1.25 * el.wood + 0.90 * el.water + 0.12 * connect - 0.12 * noise },
        { name: "추진·승차형", raw: 1.15 * tg.비겁 + 0.75 * tg.식상 + 0.05 * connect - 0.14 * noise },
        { name: "신념·정렬형", raw: 1.15 * tg.인성 + 0.75 * el.fire + 0.05 * connect - 0.10 * noise }
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
        { name: "실행·전환형", raw: 1.20 * tg.관성 + 1.00 * tg.재성 + 0.05 * connect - 0.12 * noise },
        { name: "제작·성과형", raw: 1.25 * tg.식상 + 0.95 * tg.재성 + 0.05 * connect - 0.10 * noise },
        { name: "시스템형", raw: 1.10 * tg.인성 + 1.00 * tg.관성 + 0.05 * connect - 0.12 * noise }
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
        { name: "분위기·거리형", raw: 1.25 * el.water + 1.05 * el.wood + 0.05 * connect - 0.10 * noise },
        { name: "공감·배려형", raw: 1.20 * tg.인성 + 0.85 * el.water + 0.08 * connect - 0.12 * noise },
        { name: "관계·레이더형", raw: 1.05 * tg.관성 + 0.85 * el.wood + 0.04 * connect - 0.12 * noise }
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
        { name: "흡수형", raw: 1.35 * el.water + 0.65 * tg.인성 + 0.05 * connect - 0.12 * noise },
        { name: "동조형", raw: 1.15 * tg.인성 + 0.85 * el.wood + 0.05 * connect - 0.10 * noise },
        { name: "공간·기류형", raw: 1.10 * el.water + 0.75 * el.wood + 0.10 * connect - 0.14 * noise }
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
        { name: "정서 공감형", raw: 1.45 * tg.인성 + 0.65 * el.water + 0.05 * connect - 0.12 * noise },
        { name: "따뜻함·치유형", raw: 1.15 * el.fire + 1.05 * tg.인성 + 0.05 * connect - 0.10 * noise },
        { name: "미러링형", raw: 1.10 * el.water + 0.80 * el.wood + 0.40 * tg.인성 - 0.12 * noise }
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
        { name: "책임·유지형", raw: 1.25 * tg.관성 + 0.90 * tg.인성 + 0.05 * connect - 0.14 * noise },
        { name: "유대·연결형", raw: 1.15 * tg.비겁 + 0.80 * el.wood + 0.12 * connect - 0.12 * noise },
        { name: "이해·조율형", raw: 1.25 * tg.인성 + 0.60 * tg.식상 + 0.05 * connect - 0.10 * noise }
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
        { name: "수·인성 과민", raw: 1.25 * el.water + 0.85 * tg.인성 + 0.60 * noise - 0.60 * el.earth },
        { name: "변동성 과민", raw: 1.10 * el.water + 0.95 * noise - 0.70 * el.earth - 0.25 * el.metal }
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
        { name: "상징·패턴형", raw: 1.30 * el.water + 1.00 * tg.인성 + 0.10 * connect - 0.14 * noise },
        { name: "레이다형", raw: 1.25 * tg.관성 + 0.85 * el.water + 0.05 * connect - 0.16 * noise },
        { name: "스파크형", raw: 1.05 * el.water + 0.55 * noise + 0.20 * connect - 0.18 * noise }
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
        { name: "창발·제작형", raw: 1.25 * tg.식상 + 0.70 * el.fire + 0.05 * connect - 0.12 * noise },
        { name: "수감응 스파크", raw: 1.05 * el.water + 1.05 * tg.식상 - 0.14 * noise },
        { name: "몽환형", raw: 1.15 * el.water + 0.45 * noise - 0.55 * el.earth - 0.20 * el.metal }
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
        { name: "해석·개념형", raw: 1.35 * tg.인성 + 0.55 * el.metal + 0.05 * connect - 0.12 * noise },
        { name: "자연·연상형", raw: 1.10 * el.wood + 1.00 * el.water + 0.05 * connect - 0.14 * noise },
        { name: "규칙·맥락형", raw: 1.05 * tg.관성 + 0.85 * tg.인성 + 0.05 * connect - 0.12 * noise }
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
        { name: "예지몽형", raw: 1.45 * el.water + 0.95 * tg.인성 + 0.30 * noise - 0.35 * el.metal - 0.35 * el.earth },
        { name: "상징몽형", raw: 1.25 * tg.인성 + 0.95 * el.water + 0.20 * noise - 0.30 * el.earth - 0.30 * el.metal },
        { name: "정화몽형", raw: 1.20 * el.water + 0.60 * tg.인성 + 0.15 * connect - 0.45 * el.earth }
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
        { name: "신비감각형", raw: 1.20 * el.water + 0.90 * tg.인성 + 0.55 * noise + 0.20 * connect - 0.50 * el.earth },
        { name: "변동·촉형", raw: 1.10 * el.water + 0.95 * noise + 0.10 * connect - 0.55 * el.earth },
        { name: "상징·몰입형", raw: 1.25 * tg.인성 + 0.85 * el.water + 0.15 * connect - 0.50 * el.earth }
      ],
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
