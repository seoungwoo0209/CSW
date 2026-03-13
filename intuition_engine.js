/* =========================================================
   직관 능력 분석 엔진 (intuition_engine.js) v4.0
   ─────────────────────────────────────────────────────────
   핵심 설계 원칙:
   1. 순서: 원국 판독 → 구조 해석 → 능력 프로파일 → 점수화
   2. 통찰력 = 구조독해형 별도 축 (감응/예지/타이밍과 재료 분리)
   3. baseVectors(원국만) 우선 사용 — 대운 섞지 않음
   4. 후처리 캡 없음 — 재료 설계가 분산을 만들어야 함
   5. 명식마다 강점의 종류가 다르게 나오도록 재료 비율 분리
   ─────────────────────────────────────────────────────────
   통찰력 재료: 인성·관성·목·금·격순도·월령적합도 (구조독해)
   감응력 재료: 수·목·관성·압력감지 (분위기·거리감)
   예지력 재료: 수·인성·변동성 (징후·상징·선감지) — 통찰 재료 최소화
   타이밍 재료: 식상·재성·행동계수 (포착·진입·회수)
   ========================================================= */

console.log("🔥 intuition_engine.js v4.0 로드");

(function() {
  'use strict';

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pos   = x => Math.max(0, x);

  // ── 점수 변환: 진폭 36 (34~38 범위, raw가 충분히 커야 80대 진입)
  function toScoreAuto(raw, scale, tail = 1.0) {
    const s = Math.max(0.20, scale);
    const x = (raw / s) * clamp(tail, 0.9, 1.12);
    return clamp(47 + 36 * Math.tanh(x), 1, 99);
  }

  function grade(s) {
    if (s >= 85) return "최상";
    if (s >= 75) return "상위";
    if (s >= 65) return "중상";
    if (s >= 55) return "중위";
    return "하위";
  }

  // ── 카테고리별 실측 분포 (원국 기반 시뮬레이션)
  // 각 축의 평균/표준편차를 다르게 설정 → 같은 raw라도 다른 백분위
  const DIST = {
    Insight:     { mean: 65.0, std: 9.5  }, // 인성/관성/목 명식이 유리 → 평균 중간
    Timing:      { mean: 61.0, std: 9.0  }, // 식상/재성 명식 의존 → 낮은 평균
    Sensitivity: { mean: 63.0, std: 9.0  }, // 수/목 명식 유리
    Premonition: { mean: 58.0, std: 8.5  }, // 가장 희귀 → 가장 낮은 평균
    sub:         { mean: 62.0, std: 10.0 }
  };

  function scoreToPercentile(score, dist) {
    const d = dist || DIST.sub;
    const z = (score - d.mean) / d.std;
    const t = 1 / (1 + 0.3275911 * Math.abs(z));
    const p = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    const erf = 1 - p * Math.exp(-z * z);
    const cdf = 0.5 * (1 + (z >= 0 ? erf : -erf));
    return clamp(Math.round(cdf * 100), 1, 99);
  }

  // 구간형 라벨 (실측 분포 기반 확정 전까지 수치 표현 자제)
  function percentileLabel(pct) {
    if (pct >= 95) return "최상위권";
    if (pct >= 88) return "상위권";
    if (pct >= 75) return "우수";
    if (pct >= 55) return "평균 이상";
    if (pct >= 35) return "평균권";
    return "보완 필요";
  }

  // ── 10십신 → 5축 브리지
  function collapseTenGods(tg) {
    return {
      비겁: (tg["比肩"]||0) + (tg["劫財"]||0),
      식상: (tg["食神"]||0) + (tg["傷官"]||0),
      재성: (tg["偏財"]||0) + (tg["正財"]||0),
      관성: (tg["偏官"]||0) + (tg["正官"]||0),
      인성: (tg["偏印"]||0) + (tg["正印"]||0)
    };
  }

  // 정규화
  function norm(obj) {
    const vals = Object.values(obj).map(v => isFinite(+v) ? +v : 0);
    const sum  = vals.reduce((a, b) => a + b, 0);
    if (sum <= 0) { const r = {}; for (const k in obj) r[k]=0; return r; }
    // 이미 비율이면 그대로
    if (sum > 0.9 && sum < 1.1 && Math.max(...vals) <= 1.01) {
      const r = {}; for (const k in obj) r[k]=+obj[k]||0; return r;
    }
    const r = {}; for (const k in obj) r[k] = (+obj[k]||0) / sum;
    return r;
  }

  // 지배도 (최대 - 평균)
  function dom(ratios) {
    const v = Object.values(ratios);
    return Math.max(...v) - v.reduce((a,b)=>a+b,0)/v.length;
  }

  // 혼합 집계 (0.65*mean + 0.35*top2mean)
  function mixedAvg(scores) {
    if (!scores.length) return 50;
    const mean = scores.reduce((a,b)=>a+b,0)/scores.length;
    const top2 = [...scores].sort((a,b)=>b-a).slice(0,2);
    return 0.65*mean + 0.35*(top2.reduce((a,b)=>a+b,0)/top2.length);
  }

  function asN(v) { return Array.isArray(v)?v.length:isFinite(+v)?+v:0; }

  // ── 스타일 혼합 raw → 점수
  // [FIX] 0.55*max + 0.45*avg (최고값 편향 완화)
  function subScore(id, name, styles, scale, patterns) {
    const raws   = styles.map(s => s.raw);
    const maxRaw = Math.max(...raws);
    const avgRaw = raws.reduce((a,b)=>a+b,0) / Math.max(1, raws.length);
    const blended = 0.55 * maxRaw + 0.45 * avgRaw;

    const tail   = window.__INTUITION_TAIL__ || 1.0;
    let base     = toScoreAuto(blended, scale, tail);

    // 패턴 보너스 (최대 2개만)
    const fired = (patterns||[]).filter(p=>p.cond).sort((a,b)=>Math.abs(b.add)-Math.abs(a.add)).slice(0,2);
    const bonus = fired.reduce((s,p)=>s+p.add, 0);
    const final = clamp(base + bonus, 1, 99);
    const maxIdx = raws.indexOf(maxRaw);

    return {
      id, name,
      style:  styles[maxIdx]?.name || "",
      score:  Math.round(final),
      base:   Math.round(base),
      bonus,
      fired:  fired.map(p=>p.name),
      grade:  grade(final),
      percentile:      scoreToPercentile(final, DIST.sub),
      percentileLabel: percentileLabel(scoreToPercentile(final, DIST.sub))
    };
  }

  // ── 타입명
  const TYPE_MAP = {
    Insight:     { name:"구조통찰형",   desc:"조용히 패턴을 읽고 구조를 해석하는 타입" },
    Timing:      { name:"타이밍마스터", desc:"진입과 회수의 박자를 본능적으로 아는 타입" },
    Sensitivity: { name:"감응공감형",   desc:"분위기와 압력을 세밀하게 흡수하는 타입" },
    Premonition: { name:"파동예감형",   desc:"흐름과 징후를 먼저 감지하는 타입" }
  };

  function determineType(cats) {
    const s = { Insight:cats.Insight.score, Timing:cats.Timing.score,
                Sensitivity:cats.Sensitivity.score, Premonition:cats.Premonition.score };
    const mean   = Object.values(s).reduce((a,b)=>a+b,0)/4;
    const maxKey = Object.keys(s).reduce((a,b)=>s[a]>s[b]?a:b);
    if (s[maxKey] - mean < 5) return { name:"균형통합형", desc:"전 영역이 고르게 발달한 안정형" };
    return TYPE_MAP[maxKey] || { name:"균형통합형", desc:"" };
  }

  // =========================================================
  // 메인 계산
  // =========================================================
  function compute(baseState) {
    // ── 원국 벡터 우선 (대운 섞지 않음)
    const baseV    = baseState.vectors?.baseVectors || baseState.vectors;
    const rawTG    = baseV.tenGods;
    const collapsed = collapseTenGods(rawTG);
    const tgSum    = Object.values(collapsed).reduce((a,b)=>a+b,0);
    const tg0 = tgSum > 0 ? collapsed : {
      비겁: rawTG["비겁"]||0, 식상: rawTG["식상"]||0,
      재성: rawTG["재성"]||0, 관성: rawTG["관성"]||0, 인성: rawTG["인성"]||0
    };

    const el0   = baseV.elements;
    const tg    = norm(tg0);
    const el    = norm({ wood:el0.wood, fire:el0.fire, earth:el0.earth, metal:el0.metal, water:el0.water });
    const tgDom = dom(tg);
    const elDom = dom(el);
    const spike = 0.60 * tgDom + 0.40 * elDom;

    // tail: spike 강할 때만 미세 상향 (최대 +10%)
    const tail = 1.0 + clamp(spike * 0.28, 0, 0.10);
    window.__INTUITION_TAIL__ = tail;

    const str    = +(baseState.strength?.score) || 50;
    const I      = baseState.interactions || {};
    const he     = asN(I["합"]);
    const chung  = asN(I["충"]);
    const hyung  = asN(I["형"]);
    const pa     = asN(I["파"]);
    const hae    = asN(I["해"]);

    // 소음 = 구조를 흐리는 신호
    const noise   = 0.55*chung + 0.30*hyung + 0.20*pa + 0.20*hae;
    // 연결 = 합이 만드는 에너지
    const connect = 0.60*he;

    // 격 정보 (통찰력 순도 계수)
    const geokPurity = baseState.geok?.purity || 0.5;
    const geokBroken = baseState.geok?.broken ? 1 : 0;

    // 행동 계수: 식상과 관성의 교점 → 타이밍 실행력
    const actionCoef = Math.min(tg.관성, tg.식상);
    // 회수 저항: 비겁+인성 높을수록 포기 늦음
    const holdBias   = tg.비겁 * 0.5 + tg.인성 * 0.4;
    // 숙고 계수: 관성 높을수록 "판단 후 진입"
    const cautious   = tg.관성 * 0.5;
    // 실행 속도: 식상+재성
    const execSpeed  = tg.식상 * 0.6 + tg.재성 * 0.4;

    console.log(`🔍 [v4.0] 5축: 비${tg.비겁.toFixed(2)} 식${tg.식상.toFixed(2)} 재${tg.재성.toFixed(2)} 관${tg.관성.toFixed(2)} 인${tg.인성.toFixed(2)}`);
    console.log(`🔍 [v4.0] 오행: 목${el.wood.toFixed(2)} 화${el.fire.toFixed(2)} 토${el.earth.toFixed(2)} 금${el.metal.toFixed(2)} 수${el.water.toFixed(2)}`);
    console.log(`🔍 [v4.0] spike=${spike.toFixed(3)} tail=${tail.toFixed(3)} 格순도=${geokPurity.toFixed(2)}`);

    // =========================================================
    // Insight — 통찰력 (구조독해형)
    // 핵심 재료: 인성(해석)·관성(리스크)·목(패턴)·금(판단선)·格순도
    // ── 감응/예지와 재료가 겹쳐도 가중치가 달라야 함
    // =========================================================

    // 1) 구조 파악력
    // 인성+관성+목 중심. 格 순도가 높을수록 강화
    const sub1 = subScore(1, "구조 파악력", [
      { name:"개념형",  raw: 1.6*tg.인성 + 1.1*tg.관성 + 0.7*el.wood + 0.5*geokPurity - 0.25*noise },
      { name:"판읽기형", raw: 1.4*tg.관성 + 0.8*el.wood + 0.5*tg.인성 + 0.4*connect - 0.20*noise },
      { name:"구조형",  raw: 1.2*tg.인성 + 0.9*el.wood + 0.6*el.metal + 0.3*geokPurity }
    ], 0.52, [
      { cond: tg.인성>=0.22 && tg.관성>=0.18 && el.wood>=0.20, add:+6, name:"인성+관성+목 삼각" },
      { cond: geokPurity>=0.75,                                 add:+4, name:"格 순도 높음" },
      { cond: geokBroken===1,                                   add:-5, name:"格 파격" },
      { cond: noise>=2.5 && tg.인성<0.15,                      add:-6, name:"소음 과다+인성 부족" }
    ]);

    // 2) 미세신호 감지
    // 수+인성+관성. 과도 소음은 패널티 (혼란)
    const sub2 = subScore(2, "미세신호 감지", [
      { name:"감각형", raw: 1.2*el.water + 0.8*tg.인성 + 0.5*tg.관성 + 0.3*noise*0.4 + 0.3*spike },
      { name:"분석형", raw: 1.1*tg.인성  + 0.7*tg.관성 + 0.6*el.wood - 0.2*noise }
    ], 0.48, [
      { cond: el.water>=0.22 && tg.인성>=0.18,  add:+5, name:"수+인성 조화" },
      { cond: noise>=2.5,                        add:-5, name:"소음 과다(혼란)" },
      { cond: tg.비겁>=0.28 && tg.인성<0.14,   add:-5, name:"비겁 강함+인성 부족" }
    ]);

    // 3) 리스크 레이더
    // 관성+금+수 중심. 충/형/파/해 민감도 = 경계 강화
    const sub3 = subScore(3, "리스크 레이더", [
      { name:"경계형", raw: 1.5*tg.관성 + 0.8*el.metal + 0.6*el.water + 0.4*(chung+pa+hae)*0.3 - 0.15*noise },
      { name:"변동형", raw: 1.2*tg.관성 + 0.7*el.water + 0.5*noise*0.5 + 0.4*spike }
    ], 0.50, [
      { cond: tg.관성>=0.20 && el.metal>=0.18,    add:+5, name:"관성+금 경계" },
      { cond: (chung+hyung+pa+hae)>=3,            add:+4, name:"합충형파해 복합(민감도↑)" },
      { cond: tg.재성>=0.28 && tg.관성<0.12,     add:-6, name:"재성 과다+관성 부족" }
    ]);

    // 4) 판단 정밀도
    // 인성(해석)+금(절단)+식상(정리). 잡음 과다·인성 과다는 패널티
    const sub4 = subScore(4, "판단 정밀도", [
      { name:"분석형", raw: 1.2*tg.인성 + 1.0*el.metal + 0.7*tg.식상 - 0.30*noise - 0.25*pos(tg.인성-0.30) },
      { name:"절단형", raw: 1.3*el.metal + 0.8*tg.관성 + 0.6*tg.인성 - 0.25*noise }
    ], 0.50, [
      { cond: el.metal>=0.20 && tg.인성>=0.18 && tg.식상>=0.14, add:+6, name:"금+인성+식상 정밀 삼각" },
      { cond: noise>=2.5,                                         add:-5, name:"소음 과다" },
      { cond: tg.인성>=0.32,                                      add:-4, name:"인성 과다(분석 마비)" }
    ]);

    // 5) 전략 설계력
    // 인성+관성+식상+토. 이 세 가지가 고르게 있어야 설계력이 나옴
    const sub5 = subScore(5, "전략 설계력", [
      { name:"설계형",  raw: 1.3*tg.인성 + 1.1*tg.관성 + 0.8*tg.식상 + 0.4*el.earth + 0.3*connect - 0.2*noise
                           + 1.5*Math.min(tg.인성, tg.관성, tg.식상) },
      { name:"판재편형", raw: 1.2*tg.관성 + 0.7*tg.재성 + 0.5*el.earth + 0.4*connect - 0.2*noise }
    ], 0.52, [
      { cond: tg.인성>=0.20 && tg.관성>=0.16 && tg.식상>=0.14, add:+7, name:"인성+관성+식상 균형" },
      { cond: geokPurity>=0.70,                                  add:+3, name:"格 순도 뒷받침" },
      { cond: tg.비겁>=0.30 && tg.인성<0.14,                   add:-5, name:"비겁 과다+인성 부족" }
    ]);

    // =========================================================
    // Timing — 기회 타이밍 (포착·진입·회수 3분화)
    // 핵심 재료: 식상·재성·행동계수
    // 통찰 재료(인성·관성)는 숙고 패널티로만 작용
    // =========================================================

    // 6) 진입 타이밍 — 즉각 실행형 vs 숙고 후 진입형
    const sub6 = subScore(6, "진입 타이밍", [
      { name:"실험형", raw: 1.1*tg.식상 + 0.8*tg.재성 + 0.5*tg.비겁 - 0.4*cautious - 0.25*noise },
      { name:"확신형", raw: 0.9*tg.관성 + 0.7*tg.인성 + 0.4*connect  - 0.5*cautious },
      { name:"파동형", raw: 0.8*el.water + 0.5*tg.식상 + 0.3*noise*0.3 }
    ], 0.46, [
      { cond: tg.재성>=0.22 && tg.식상>=0.16,   add:+5, name:"재성+식상 조화" },
      { cond: cautious>=0.14 && execSpeed<0.16, add:-5, name:"숙고형 진입 지연" },
      { cond: str>=70 && tg.비겁>=0.26,         add:-4, name:"신강+비겁 과다" }
    ]);

    // 7) 회수·정리 타이밍 — 집착(holdBias) 높으면 낮아짐
    const sub7 = subScore(7, "회수/정리 타이밍", [
      { name:"리스크형", raw: 1.2*tg.관성 + 0.9*actionCoef + 0.3*el.metal - 0.55*holdBias - 0.25*(chung+hyung+pa+hae)*0.2 },
      { name:"계산형",  raw: 0.9*tg.재성 + 0.7*tg.식상   + 0.4*actionCoef - 0.55*holdBias - 0.20*(chung+pa)*0.2 }
    ], 0.46, [
      { cond: el.metal>=0.22 && el.earth>=0.20, add:+4, name:"금+토 안정" },
      { cond: tg.인성>=0.26 && tg.관성<0.16,  add:-5, name:"인성형 회수 지연" },
      { cond: el.fire>=0.26 && tg.관성<0.14,  add:-4, name:"화 과다+관성 약함" }
    ]);

    // 8) 기회 포착력
    const sub8 = subScore(8, "기회 포착력", [
      { name:"성과형",   raw: 1.1*tg.재성 + 0.8*tg.식상 + 0.3*tg.비겁 + 0.25*connect },
      { name:"판읽기형", raw: 0.9*tg.관성 + 0.7*el.wood + 0.4*tg.재성 + 0.2*noise*0.2 }
    ], 0.46, [
      { cond: tg.재성>=0.24,                  add:+5, name:"재성 강함" },
      { cond: noise>=2.5 && tg.재성<0.16,    add:-4, name:"소음 과다+재성 부족" }
    ]);

    // 9) 운 수용력
    const sub9 = subScore(9, "운 수용력", [
      { name:"수용형", raw: 0.9*el.water + 0.7*tg.인성 + 0.3*connect },
      { name:"돌파형", raw: 0.9*tg.비겁  + 0.6*tg.식상 + 0.3*noise*0.2 }
    ], 0.44, [
      { cond: tg.식상>=0.18 && tg.비겁>=0.18, add:+5, name:"식상+비겁 균형" },
      { cond: tg.인성>=0.30 && tg.식상<0.12,  add:-5, name:"인성 과다+식상 부족" }
    ]);

    // 10) 성과 전환력 — actionCoef 핵심, holdBias 패널티
    const sub10 = subScore(10, "성과 전환력", [
      { name:"실행형", raw: 1.0*tg.식상 + 0.9*tg.재성 + 1.4*actionCoef - 0.45*holdBias - 0.20*noise*0.3 },
      { name:"구조형", raw: 0.9*tg.관성 + 0.7*tg.재성 + 1.3*actionCoef + 0.2*connect  - 0.45*holdBias }
    ], 0.46, [
      { cond: tg.식상>=0.20 && tg.관성>=0.16,   add:+6, name:"식상+관성 조화" },
      { cond: tg.인성>=0.28 && tg.식상<0.16,   add:-5, name:"인성형 실행 둔화" },
      { cond: el.water>=0.28 && el.earth<0.14, add:-4, name:"수 과다+토 부족" }
    ]);

    // =========================================================
    // Sensitivity — 감응력 (압력·분위기 감지형)
    // 핵심 재료: 수·목·관성
    // 공감(정서동조)과 압력감지를 분리
    // =========================================================

    // 11) 호감/거리감 감지 — 압력·분위기 감지형
    const sub11 = subScore(11, "호감/거리감 감지", [
      { name:"분위기형", raw: 1.2*el.water + 0.8*el.wood + 0.4*tg.관성 + 0.3*spike },
      { name:"공감형",   raw: 0.9*tg.인성  + 0.6*el.water + 0.3*connect - 0.2*noise }
    ], 0.48, [
      { cond: el.water>=0.22 && el.wood>=0.18, add:+5, name:"수+목 조화" },
      { cond: el.metal>=0.28 && el.water<0.14,add:-4, name:"금 과다+수 부족" }
    ]);

    // 12) 분위기 흡수력
    const sub12 = subScore(12, "분위기 흡수력", [
      { name:"수채형", raw: 1.3*el.water + 0.6*el.wood + 0.4*noise*0.4 + 0.4*spike },
      { name:"인성형", raw: 1.0*tg.인성  + 0.5*el.water + 0.2*connect }
    ], 0.48, [
      { cond: el.water>=0.25,                  add:+5, name:"수 강함" },
      { cond: el.earth>=0.30 && el.water<0.14,add:-5, name:"토 과다+수 부족" }
    ]);

    // 13) 공감/정서 동조 — 공감형(인성)과 압력감지형 분리
    const sub13 = subScore(13, "공감/정서 동조", [
      { name:"공감형", raw: 1.3*tg.인성 + 0.5*el.water - 0.3*noise - 0.4*tg.비겁 },
      { name:"관찰형", raw: 0.9*tg.식상 + 0.6*el.water + 0.2*tg.인성 - 0.25*tg.비겁 }
    ], 0.46, [
      { cond: tg.인성>=0.22 && (el.wood+el.water)>=0.38, add:+5, name:"인성+수목 조화" },
      { cond: tg.비겁>=0.26 && tg.인성<0.18,             add:-6, name:"비겁 강함+인성 약함" }
    ]);

    // 14) 관계 유지력 — 감응 ≠ 관계 안정
    const sub14 = subScore(14, "관계 유지력", [
      { name:"조율형", raw: 1.0*tg.관성 + 0.7*tg.인성 + 0.4*connect - 0.3*noise - 0.3*tg.비겁 },
      { name:"추진형", raw: 0.8*tg.비겁 + 0.5*tg.인성 + 0.3*connect - 0.2*noise }
    ], 0.46, [
      { cond: el.earth>=0.22 && tg.관성>=0.18, add:+5, name:"토+관성 안정" },
      { cond: noise>=2.5,                       add:-6, name:"소음 과다" },
      { cond: el.water>=0.28 && tg.관성<0.16, add:-4, name:"수 과다+관성 약함" }
    ]);

    // 15) 감응 과부하 위험 (높을수록 위험)
    const sub15 = subScore(15, "감응 과부하 위험", [
      { name:"과민형", raw: 1.3*el.water + 0.8*noise + 0.3*tg.인성 - 0.7*el.earth },
      { name:"소모형", raw: 1.0*tg.인성  + 0.7*connect + 0.5*noise - 0.7*el.earth }
    ], 0.55, [
      { cond: el.water>=0.25 && el.earth<0.14, add:+8, name:"수 과다+토 부족" },
      { cond: el.earth>=0.28,                  add:-7, name:"토 안정" }
    ]);

    // =========================================================
    // Premonition — 예지력 (징후·상징·선감지)
    // [핵심] 통찰 재료(인성·관성) 최소화 → 수·변동성·상징 중심
    // =========================================================

    // 예지력 공통 기저: 수기운 + 변동성(spike) + 아주 약한 인성만
    // 통찰에서 쓰는 관성·전략 재료는 의도적으로 배제
    const prBase = 0.55*el.water + 0.20*spike + 0.12*tg.인성 + 0.08*(chung+pa+hae)*0.15;

    // 16) 예감 적중률
    const sub16 = subScore(16, "예감 적중률", [
      { name:"레이더형", raw: prBase + 0.3*tg.관성 + 0.2*connect },  // 관성 소량만
      { name:"상징형",   raw: prBase + 0.4*spike   + 0.2*connect }
    ], 0.48, [
      { cond: el.water>=0.24 && tg.인성>=0.18,  add:+5, name:"수+인성 조화" },
      { cond: noise>=2.5,                        add:-5, name:"소음 과다" }
    ]);

    // 17) 직감 스파크 — spike 중심, 구조독해 재료 배제
    const sub17 = subScore(17, "직감 스파크", [
      { name:"스파크형",   raw: 1.1*el.water + 0.5*noise*0.3 + 0.7*spike },
      { name:"개념점프형", raw: 0.7*tg.인성  + 0.6*el.water  + 0.5*spike }
    ], 0.46, [
      { cond: tg.식상>=0.18 && el.water>=0.18,      add:+4, name:"식상+수 조화" },
      // 구조분석형(인성+관성 높음)은 직감 스파크가 약함 — 이것이 통찰과 예지의 결 차이
      { cond: tg.인성>=0.26 && tg.관성>=0.20,       add:-5, name:"구조분석형 직감 약화" },
      { cond: el.earth>=0.30 && tg.식상<0.12,       add:-4, name:"토 과다+식상 부족" }
    ]);

    // 18) 상징 해석력
    const sub18 = subScore(18, "상징 해석력", [
      { name:"해석형", raw: 1.0*tg.인성 + 0.5*el.water + 0.3*spike + 0.2*tg.식상 },
      { name:"신호형", raw: 0.9*el.water + 0.5*noise*0.3 + 0.4*spike + 0.2*connect }
    ], 0.46, [
      { cond: tg.인성>=0.22 && el.metal>=0.16, add:+4, name:"인성+금 조화" },
      { cond: el.fire>=0.28 && tg.인성<0.14,  add:-5, name:"화 과다+인성 부족" }
    ]);

    // 19) 예지몽 체질 — 신비형 재료만, 관성·전략 배제
    const sub19 = subScore(19, "예지몽 체질", [
      { name:"몽형",   raw: 1.3*el.water + 0.4*tg.인성 + 0.4*noise*0.3 + 0.5*spike },
      { name:"민감형", raw: 1.0*el.water + 0.5*noise*0.3 + 0.5*spike }
    ], 0.46, [
      { cond: el.water>=0.26 && tg.인성>=0.20 && el.earth<0.18, add:+6, name:"수+인성 강함" },
      { cond: el.earth>=0.26,                                    add:-6, name:"토 과다" },
      // 구조독해형은 예지몽 체질 아님 (관성+금이 강하면)
      { cond: tg.관성>=0.22 && el.metal>=0.18 && el.water<0.20, add:-6, name:"관성+금형 예지몽 약화" }
    ]);

    // 20) 신비 체감 민감도
    const sub20 = subScore(20, "신비 체감 민감도", [
      { name:"감응형", raw: 1.2*el.water + 0.5*noise*0.3 + 0.3*el.wood + 0.4*spike },
      { name:"내면형", raw: 0.9*tg.인성  + 0.6*el.water  + 0.3*connect + 0.3*spike }
    ], 0.46, [
      { cond: noise>=2.0 && el.water>=0.20,    add:+5, name:"소음+수 민감" },
      { cond: el.earth>=0.28 && el.water<0.14,add:-6, name:"토 과다+수 부족" }
    ]);

    // =========================================================
    // 대분류 집계
    // =========================================================
    const InsightRaw     = mixedAvg([sub1.score, sub2.score, sub3.score, sub4.score, sub5.score]);
    const TimingRaw      = mixedAvg([sub6.score, sub7.score, sub8.score, sub9.score, sub10.score]);
    const SensitivityRaw = mixedAvg([sub11.score, sub12.score, sub13.score, sub14.score]);
    const PremonitionRaw = mixedAvg([sub16.score, sub17.score, sub18.score, sub19.score, sub20.score]);
    const OverloadRisk   = sub15.score;

    // 후처리 캡 없음 — 재료 설계가 분산을 만들어야 함
    const cats = {};
    for (const [key, raw, dist] of [
      ["Insight",     InsightRaw,     DIST.Insight],
      ["Timing",      TimingRaw,      DIST.Timing],
      ["Sensitivity", SensitivityRaw, DIST.Sensitivity],
      ["Premonition", PremonitionRaw, DIST.Premonition]
    ]) {
      const s = Math.round(raw);
      cats[key] = { score:s, grade:grade(s),
                    percentile:scoreToPercentile(s,dist),
                    percentileLabel:percentileLabel(scoreToPercentile(s,dist)) };
    }

    // 종합 결과
    const avg = (...a) => a.reduce((x,y)=>x+y,0)/a.length;
    const o1 = Math.round(0.45*cats.Timing.score + 0.45*cats.Insight.score + 0.10*(100-OverloadRisk));
    const o2 = Math.round(avg(sub11.score,sub12.score,sub13.score,sub14.score) - 0.2*pos(OverloadRisk-50));
    const o3 = Math.round(0.5*sub19.score + 0.3*sub16.score + 0.2*sub20.score);
    const avoid = 0.55*sub3.score + 0.45*sub7.score;
    const aBoost = 20*clamp((actionCoef-0.12)/0.10, 0, 1);
    const oPen  = 0.25*pos(OverloadRisk-60);
    const o4 = Math.round(clamp(avoid + aBoost - oPen, 1, 99));

    const typeObj = determineType(cats);

    return {
      subs: [sub1,sub2,sub3,sub4,sub5,sub6,sub7,sub8,sub9,sub10,
             sub11,sub12,sub13,sub14,sub15,sub16,sub17,sub18,sub19,sub20],
      categories: cats,
      typeName: typeObj.name,
      typeDesc: typeObj.desc,
      overall: {
        비즈니스촉: { score:o1, grade:grade(o1), percentile:scoreToPercentile(o1), percentileLabel:percentileLabel(scoreToPercentile(o1)) },
        연애호감촉: { score:o2, grade:grade(o2), percentile:scoreToPercentile(o2), percentileLabel:percentileLabel(scoreToPercentile(o2)) },
        예지몽:     { score:o3, grade:grade(o3), percentile:scoreToPercentile(o3), percentileLabel:percentileLabel(scoreToPercentile(o3)) },
        위기회피:   { score:o4, grade:grade(o4), percentile:scoreToPercentile(o4), percentileLabel:percentileLabel(scoreToPercentile(o4)) }
      },
      overloadRisk: OverloadRisk,
      debug: { tgDom, elDom, spike, tail, geokPurity, actionCoef, holdBias, cautious, tg, el }
    };
  }

  window.IntuitionEngine = { compute };
  console.log("✅ IntuitionEngine v4.0 로드 완료");
})();
