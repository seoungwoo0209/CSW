/* =========================================================
   사주 데이터 레이어 (saju_data.js) — 유일한 데이터 소스
   ⚠️ 이 파일만 window.SajuData를 초기화한다
   ⚠️ index.html inline script / 다른 파일에서 중복 정의 금지
   ========================================================= */

console.log("🔥 saju_data.js 로드 시작");

window.SajuData = {};

/* ---------------------------
   1) 천간 / 지지
----------------------------*/
window.SajuData.STEMS   = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
window.SajuData.BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];

/* ---------------------------
   2) 오행
----------------------------*/
window.SajuData.WUXING_STEM = {
  "甲":"wood","乙":"wood","丙":"fire","丁":"fire","戊":"earth",
  "己":"earth","庚":"metal","辛":"metal","壬":"water","癸":"water"
};
window.SajuData.WUXING_BRANCH = {
  "子":"water","丑":"earth","寅":"wood","卯":"wood","辰":"earth",
  "巳":"fire","午":"fire","未":"earth","申":"metal","酉":"metal","戌":"earth","亥":"water"
};
window.SajuData.WUXING_LABEL = { wood:"목", fire:"화", earth:"토", metal:"금", water:"수" };

window.SajuData.WUXING_GENERATES = { wood:"fire", fire:"earth", earth:"metal", metal:"water", water:"wood" };
window.SajuData.WUXING_CONTROLS  = { wood:"earth", fire:"metal", earth:"water", metal:"wood", water:"fire" };

/* ---------------------------
   3) 음양
----------------------------*/
window.SajuData.YINYANG_STEM = {
  "甲":"yang","乙":"yin","丙":"yang","丁":"yin","戊":"yang",
  "己":"yin","庚":"yang","辛":"yin","壬":"yang","癸":"yin"
};

/* ---------------------------
   4) 십신 이름
----------------------------*/
window.SajuData.TEN_GODS_KR = {
  "比肩":"비견","劫財":"겁재","食神":"식신","傷官":"상관",
  "偏財":"편재","正財":"정재","偏官":"편관","正官":"정관",
  "偏印":"편인","正印":"정인"
};

/* ---------------------------
   5) 지장간 (role 포함)
----------------------------*/
window.SajuData.HIDDEN_STEMS_BRANCH = {
  "子":[{stem:"癸",role:"정기"}],
  "丑":[{stem:"己",role:"정기"},{stem:"癸",role:"중기"},{stem:"辛",role:"여기"}],
  "寅":[{stem:"甲",role:"정기"},{stem:"丙",role:"중기"},{stem:"戊",role:"여기"}],
  "卯":[{stem:"乙",role:"정기"}],
  "辰":[{stem:"戊",role:"정기"},{stem:"乙",role:"중기"},{stem:"癸",role:"여기"}],
  "巳":[{stem:"丙",role:"정기"},{stem:"庚",role:"중기"},{stem:"戊",role:"여기"}],
  "午":[{stem:"丁",role:"정기"},{stem:"己",role:"중기"}],
  "未":[{stem:"己",role:"정기"},{stem:"丁",role:"중기"},{stem:"乙",role:"여기"}],
  "申":[{stem:"庚",role:"정기"},{stem:"壬",role:"중기"},{stem:"戊",role:"여기"}],
  "酉":[{stem:"辛",role:"정기"}],
  "戌":[{stem:"戊",role:"정기"},{stem:"辛",role:"중기"},{stem:"丁",role:"여기"}],
  "亥":[{stem:"壬",role:"정기"},{stem:"甲",role:"중기"}]
};

/* ---------------------------
   6) 지장간 비율 (role → ratio 변환)
----------------------------*/
(function buildHiddenRatio() {
  const roleToRatio = { "정기":0.60, "중기":0.25, "여기":0.15 };
  const result = {};
  Object.keys(window.SajuData.HIDDEN_STEMS_BRANCH).forEach(branch => {
    const stems = window.SajuData.HIDDEN_STEMS_BRANCH[branch];
    if (stems.length === 1) {
      result[branch] = [{ stem: stems[0].stem, ratio: 1.0 }];
    } else if (stems.length === 2) {
      result[branch] = stems.map(item => ({
        stem: item.stem,
        ratio: item.role === "정기" ? 0.70 : 0.30
      }));
    } else {
      result[branch] = stems.map(item => ({
        stem: item.stem,
        ratio: roleToRatio[item.role] || 0.33
      }));
    }
  });
  window.SajuData.HIDDEN_STEMS_RATIO = result;
})();

/* ---------------------------
   7) 계절 매핑
----------------------------*/
window.SajuData.SEASON_MAP = {
  "寅":"spring","卯":"spring","辰":"spring",
  "巳":"summer","午":"summer","未":"summer",
  "申":"autumn","酉":"autumn","戌":"autumn",
  "亥":"winter","子":"winter","丑":"winter"
};
window.SajuData.SEASON_ELEMENT = {
  spring:"wood", summer:"fire", autumn:"metal", winter:"water"
};

/* ---------------------------
   8) 합/충/형/파/해
----------------------------*/
window.SajuData.HEAVENLY_COMBINATIONS = [
  ["甲","己"],["乙","庚"],["丙","辛"],["丁","壬"],["戊","癸"]
];
window.SajuData.EARTHLY_SIX_COMBINATIONS = [
  ["子","丑"],["寅","亥"],["卯","戌"],["辰","酉"],["巳","申"],["午","未"]
];
window.SajuData.EARTHLY_THREE_COMBINATIONS = [
  { name:"申子辰 수국", branches:["申","子","辰"], element:"water" },
  { name:"亥卯未 목국", branches:["亥","卯","未"], element:"wood"  },
  { name:"寅午戌 화국", branches:["寅","午","戌"], element:"fire"  },
  { name:"巳酉丑 금국", branches:["巳","酉","丑"], element:"metal" }
];
window.SajuData.EARTHLY_CLASHES = [
  ["子","午"],["丑","未"],["寅","申"],["卯","酉"],["辰","戌"],["巳","亥"]
];
window.SajuData.EARTHLY_PUNISHMENTS = [
  ["寅","巳","申"], ["丑","未","戌"], ["子","卯"]
];

/* ---------------------------
   9) 60갑자
----------------------------*/
window.SajuData.GANJI_60 = (() => {
  const S = window.SajuData.STEMS;
  const B = window.SajuData.BRANCHES;
  const list = [];
  for (let i = 0; i < 60; i++) list.push(S[i % 10] + B[i % 12]);
  return list;
})();

/* ---------------------------
   10) 격별 선호 축
----------------------------*/
window.SajuData.GEOK_PREFERENCE = {
  "食神격":  { prefer:["食神"],   support:["正財","偏財"],         avoid:["偏印","劫財"] },
  "傷官격":  { prefer:["傷官"],   support:["偏財","正財"],         avoid:["正官"] },
  "正財격":  { prefer:["正財"],   support:["食神","傷官","正官"],  avoid:["劫財"] },
  "偏財격":  { prefer:["偏財"],   support:["食神","傷官"],         avoid:["劫財","比肩"] },
  "正官격":  { prefer:["正官"],   support:["正印","偏印","正財"],  avoid:["傷官"] },
  "偏官격":  { prefer:["偏官"],   support:["食神","正印"],         avoid:["傷官"] },
  "正印격":  { prefer:["正印"],   support:["比肩","正官"],         avoid:["偏財"] },
  "偏印격":  { prefer:["偏印"],   support:["劫財","偏官"],         avoid:["食神"] },
  "比肩격":  { prefer:["比肩"],   support:["食神","傷官","偏官"],  avoid:["正財","偏財"] },
  "劫財격":  { prefer:["劫財"],   support:["傷官","偏官"],         avoid:["正財"] },
  "혼합격":  { prefer:[],         support:[],                      avoid:[] }
};

/* ---------------------------
   11) 프로파일 가중치 (overall / love / money)
----------------------------*/
window.SajuData.PROFILES = {
  overall: {
    tenGods: {
      "比肩":5,"劫財":4,"食神":6,"傷官":5,
      "偏財":6,"正財":6,"偏官":5,"正官":6,"偏印":5,"正印":6
    },
    interactions: { "합":2, "충":-3, "형":-2, "파":-2, "해":-1 }
  },
  love: {
    tenGods: {
      "正財":10,"偏財":8,"正官":10,"偏官":8,"食神":7,"傷官":6,
      "比肩":-2,"劫財":-5,"正印":2,"偏印":1
    },
    interactions: { "합":3, "충":-4, "형":-3, "파":-3, "해":-2 }
  },
  money: {
    tenGods: {
      "食神":9,"傷官":10,"正財":9,"偏財":10,"正官":6,"偏官":4,
      "正印":3,"偏印":2,"比肩":-5,"劫財":-10
    },
    interactions: { "합":2, "충":-4, "형":-3, "파":-2, "해":-1 }
  }
};

/* ---------------------------
   12) 월령 사령 프로파일 (MONTH_COMMAND_PROFILE)
   ─────────────────────────────────────────────
   각 월지(月支)가 실제로 지배하는 오행 비중.
   근거: HIDDEN_STEMS_BRANCH의 정기(0.60)/중기(0.25)/여기(0.15) 비율을
         오행 단위로 합산한 값.

   엔진(saju_engine.js)에서 이 값을 소비하는 방식:
     profile[el] * 관계계수 를 합산 → monthCommandScore / getAxisMonthCommandCoeff
   v 값이 클수록 해당 오행의 월령 지배력이 강함 (합계 ≈ 1.0)

   단일 오행 지지 (子·卯·酉):
     정기 단독 → 해당 오행 1.00, 나머지 0

   이중 오행 지지 (午·亥):
     정기 0.70, 중기 0.30 비율 반영

   삼중 오행 지지 (寅·辰·巳·未·申·戌·丑):
     정기 0.60, 중기 0.25, 여기 0.15 비율 반영

   사계토 (辰·未·戌·丑) 핵심 특징:
     earth가 정기이나 나머지 오행이 혼재 → 단순 계절 판단과 결과가 크게 달라짐
     예) 辰月 甲木: 봄이지만 earth 0.60 지배 → 신강약 판단이 유리하지 않음
----------------------------*/
window.SajuData.MONTH_COMMAND_PROFILE = {
  // ── 겨울 (亥·子·丑)
  "亥": { water:0.70, wood:0.30, fire:0,    metal:0,    earth:0    },
  "子": { water:1.00, wood:0,    fire:0,    metal:0,    earth:0    },
  "丑": { earth:0.60, water:0.25, metal:0.15, wood:0,   fire:0     },

  // ── 봄 (寅·卯·辰)
  "寅": { wood:0.60,  fire:0.25,  earth:0.15, metal:0,  water:0    },
  "卯": { wood:1.00,  fire:0,     earth:0,    metal:0,  water:0    },
  "辰": { earth:0.60, wood:0.25,  water:0.15, fire:0,   metal:0    },

  // ── 여름 (巳·午·未)
  "巳": { fire:0.60,  metal:0.25, earth:0.15, wood:0,   water:0    },
  "午": { fire:0.70,  earth:0.30, wood:0,     metal:0,  water:0    },
  "未": { earth:0.60, fire:0.25,  wood:0.15,  metal:0,  water:0    },

  // ── 가을 (申·酉·戌)
  "申": { metal:0.60, water:0.25, earth:0.15, wood:0,   fire:0     },
  "酉": { metal:1.00, water:0,    earth:0,    wood:0,   fire:0     },
  "戌": { earth:0.60, metal:0.25, fire:0.15,  wood:0,   water:0    }
};

/* ---------------------------
   13) 위치 가중치 — 통근(ROOT) / 투간(STEM)
   ─────────────────────────────────────────────
   ROOT_POSITION_WEIGHT: 지지 통근 판단 시 위치별 가중치
     월지(month)가 가장 강함 — 월령 사령의 핵심
     일지(day)는 일간과 인접 → 차순위
     연지(year)/시지(hour)는 상대적으로 약함

   ROOT_ROLE_WEIGHT: 지장간 역할별 통근 강도
     정기(main): 완전 통근 (1.00)
     중기(mid):  부분 통근 (0.55)
     여기(sub):  미약 통근 (0.28)

   STEM_POSITION_WEIGHT: 천간 투출 위치별 가중치
     월간(month)이 격(格) 성립의 핵심 → 가장 강함
     시간(hour)은 일간과 인접 → 차순위
     연간(year)은 원거리 → 약함
----------------------------*/
window.SajuData.ROOT_POSITION_WEIGHT = {
  year:  0.85,
  month: 1.70,
  day:   1.35,
  hour:  1.00
};

window.SajuData.ROOT_ROLE_WEIGHT = {
  "정기": 1.00,
  "중기": 0.55,
  "여기": 0.28
};

window.SajuData.STEM_POSITION_WEIGHT = {
  year:  0.85,
  month: 1.25,
  hour:  0.95
};

console.log("✅ SajuData 초기화 완료");
console.log("📊 HIDDEN_STEMS_RATIO 샘플(子):", window.SajuData.HIDDEN_STEMS_RATIO["子"]);
console.log("📊 MONTH_COMMAND_PROFILE 샘플(辰):", window.SajuData.MONTH_COMMAND_PROFILE["辰"]);
console.log("📊 ROOT_POSITION_WEIGHT:", window.SajuData.ROOT_POSITION_WEIGHT);
