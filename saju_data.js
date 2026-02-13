/* =========================================================
   사주 엔진 데이터 (saju_data.js)
   - 60갑자, 지장간, 오행 관계
   - 격별 선호 축
   - 프로파일 가중치 (연애/재물/종합)
   ========================================================= */

console.log("🔥 saju_data.js 로드");

// ⚠️ 중요: saju_core.js의 데이터를 window.SajuData로 통합
(function() {
  window.SajuData = window.SajuData || {};
  
  // 기본 상수들 (saju_core에서 가져오기)
  if (typeof WUXING_STEM !== 'undefined') {
    window.SajuData.WUXING_STEM = WUXING_STEM;
    window.SajuData.WUXING_BRANCH = WUXING_BRANCH;
    window.SajuData.WUXING_GENERATES = WUXING_GENERATES;
    window.SajuData.WUXING_CONTROLS = WUXING_CONTROLS;
  }
  
  // 십신 한글명
  if (typeof SHISHEN_NAMES !== 'undefined') {
    window.SajuData.TEN_GODS_KR = SHISHEN_NAMES;
  }
  
  // 충 테이블
  if (typeof CHUNG_PAIRS !== 'undefined') {
    window.SajuData.EARTHLY_CLASHES = CHUNG_PAIRS;
  }
  
  // 🔥 FIX: 지장간은 saju_core의 HIDDEN_STEMS_BRANCH를 그대로 변환
  // ratio 재정의하지 않고, core의 role 기반으로만 변환
  if (typeof HIDDEN_STEMS_BRANCH !== 'undefined') {
    window.SajuData.HIDDEN_STEMS_RATIO = {};
    
    // 역할에 따른 비율 (표준)
    const roleToRatio = { 
      "여기": 0.6,   // 주기운
      "중기": 0.25,  // 중간기운
      "정기": 0.15   // 잔여기운
    };
    
    Object.keys(HIDDEN_STEMS_BRANCH).forEach(branch => {
      const stems = HIDDEN_STEMS_BRANCH[branch];
      
      // 지장간 개수에 따른 비율 조정
      if (stems.length === 1) {
        // 단일 지장간 (子, 卯, 酉)
        window.SajuData.HIDDEN_STEMS_RATIO[branch] = [{
          stem: stems[0].stem,
          ratio: 1.0
        }];
      } else if (stems.length === 2) {
        // 2개 지장간 (午, 亥)
        window.SajuData.HIDDEN_STEMS_RATIO[branch] = stems.map(item => ({
          stem: item.stem,
          ratio: item.role === "여기" ? 0.7 : 0.3
        }));
      } else {
        // 3개 지장간 (나머지)
        window.SajuData.HIDDEN_STEMS_RATIO[branch] = stems.map(item => ({
          stem: item.stem,
          ratio: roleToRatio[item.role] || 0.33
        }));
      }
    });
  }
})();

/* ---------------------------
   1) 60갑자 테이블
----------------------------*/
const GANJI_60 = [
  "甲子","乙丑","丙寅","丁卯","戊辰","己巳","庚午","辛未","壬申","癸酉",
  "甲戌","乙亥","丙子","丁丑","戊寅","己卯","庚辰","辛巳","壬午","癸未",
  "甲申","乙酉","丙戌","丁亥","戊子","己丑","庚寅","辛卯","壬辰","癸巳",
  "甲午","乙未","丙申","丁酉","戊戌","己亥","庚子","辛丑","壬寅","癸卯",
  "甲辰","乙巳","丙午","丁未","戊申","己酉","庚戌","辛亥","壬子","癸丑",
  "甲寅","乙卯","丙辰","丁巳","戊午","己未","庚申","辛酉","壬戌","癸亥"
];

function getGanjiIndex(ganji) {
  const idx = GANJI_60.indexOf(ganji);
  if (idx < 0) throw new Error(`Invalid ganji: ${ganji}`);
  return idx;
}

function getGanjiByIndex(idx) {
  return GANJI_60[(idx + 600) % 60];
}

/* ---------------------------
   2) 계절 매핑 (🔥 FIX: window.SajuData에 명시 등록)
----------------------------*/
const SEASON_MAP = {
  "寅": "spring", "卯": "spring", "辰": "spring",
  "巳": "summer", "午": "summer", "未": "summer",
  "申": "autumn", "酉": "autumn", "戌": "autumn",
  "亥": "winter", "子": "winter", "丑": "winter"
};

const SEASON_ELEMENT = {
  spring: "wood",
  summer: "fire",
  autumn: "metal",
  winter: "water"
};

// 🔥 FIX: 즉시 window.SajuData에 등록
window.SajuData = window.SajuData || {};
window.SajuData.SEASON_MAP = SEASON_MAP;
window.SajuData.SEASON_ELEMENT = SEASON_ELEMENT;

/* ---------------------------
   3) 십신 (Ten Gods)
----------------------------*/
const TEN_GODS = [
  "比肩", "劫財",
  "食神", "傷官",
  "偏財", "正財",
  "偏官", "正官",
  "偏印", "正印"
];

/* ---------------------------
   4) 격(格)별 선호 축
----------------------------*/
const GEOK_PREFERENCE = {
  "식신격": {
    prefer: ["食神"],
    support: ["正財", "偏財"],
    avoid: ["偏印", "劫財"],
    description: "식신이 살아야 생산/표현이 원활"
  },
  "상관격": {
    prefer: ["傷官"],
    support: ["偏財", "正財"],
    avoid: ["正官"],
    description: "상관이 주도, 정관과 충돌 주의"
  },
  "정재격": {
    prefer: ["正財"],
    support: ["食神", "傷官", "正官"],
    avoid: ["劫財"],
    description: "재성 중심, 비겁 경쟁 주의"
  },
  "편재격": {
    prefer: ["偏財"],
    support: ["食神", "傷官"],
    avoid: ["劫財", "比肩"],
    description: "편재 활용, 비겁 분산 주의"
  },
  "정관격": {
    prefer: ["正官"],
    support: ["正印", "偏印", "正財"],
    avoid: ["傷官"],
    description: "정관 중심, 상관 파괴 주의"
  },
  "편관격": {
    prefer: ["偏官"],
    support: ["食神", "正印"],
    avoid: ["傷官"],
    description: "편관(칠살) 제어 필요"
  },
  "정인격": {
    prefer: ["正印"],
    support: ["比肩", "正官"],
    avoid: ["偏財"],
    description: "인성 중심, 재성 파괴 주의"
  },
  "편인격": {
    prefer: ["偏印"],
    support: ["劫財", "偏官"],
    avoid: ["食神"],
    description: "편인 활용, 식신 탈취 주의"
  },
  "비견격": {
    prefer: ["比肩"],
    support: ["食神", "傷官", "偏官"],
    avoid: ["正財", "偏財"],
    description: "비겁 경쟁, 재성 분산 주의"
  },
  "겁재격": {
    prefer: ["劫財"],
    support: ["傷官", "偏官"],
    avoid: ["正財"],
    description: "겁재 강함, 정재 파손 주의"
  },
  "혼합격": {
    prefer: [],
    support: [],
    avoid: [],
    description: "명확한 격이 없음, 종합 판단 필요"
  }
};

/* ---------------------------
   5) 프로파일 가중치
----------------------------*/

// 연애 프로파일
const PROFILE_LOVE = {
  tenGods: {
    "正財": 10,  // 남자: 배우자
    "偏財": 8,
    "正官": 10,  // 여자: 배우자
    "偏官": 8,
    "食神": 7,   // 표현/매력
    "傷官": 6,
    "比肩": -2,  // 경쟁
    "劫財": -5,
    "正印": 2,   // 안정
    "偏印": 1
  },
  interactions: {
    "합": 3,
    "충": -4,
    "형": -3,
    "파": -3,
    "해": -2
  }
};

// 재물 프로파일
const PROFILE_MONEY = {
  tenGods: {
    "食神": 9,   // 생산
    "傷官": 10,  // 확장
    "正財": 9,   // 안정 수입
    "偏財": 10,  // 기회/투자
    "正官": 6,   // 제도권 보호
    "偏官": 4,
    "正印": 3,
    "偏印": 2,
    "比肩": -5,  // 경쟁/분산
    "劫財": -10  // 손재
  },
  interactions: {
    "합": 2,
    "충": -4,
    "형": -3,
    "파": -2,
    "해": -1
  }
};

// 종합 프로파일
const PROFILE_OVERALL = {
  tenGods: {
    "比肩": 5,
    "劫財": 4,
    "食神": 6,
    "傷官": 5,
    "偏財": 6,
    "正財": 6,
    "偏官": 5,
    "正官": 6,
    "偏印": 5,
    "正印": 6
  },
  interactions: {
    "합": 2,
    "충": -3,
    "형": -2,
    "파": -2,
    "해": -1
  }
};

const PROFILES = {
  love: PROFILE_LOVE,
  money: PROFILE_MONEY,
  overall: PROFILE_OVERALL
};

/* ---------------------------
   6) 합충형파해 테이블
----------------------------*/

// 천간오합
const HEAVENLY_COMBINATIONS = [
  ["甲", "己"],
  ["乙", "庚"],
  ["丙", "辛"],
  ["丁", "壬"],
  ["戊", "癸"]
];

// 지지 육합
const EARTHLY_SIX_COMBINATIONS = [
  ["子", "丑"],
  ["寅", "亥"],
  ["卯", "戌"],
  ["辰", "酉"],
  ["巳", "申"],
  ["午", "未"]
];

// 지지 삼합
const EARTHLY_THREE_COMBINATIONS = [
  { name: "申子辰 수국", branches: ["申", "子", "辰"], element: "water" },
  { name: "亥卯未 목국", branches: ["亥", "卯", "未"], element: "wood" },
  { name: "寅午戌 화국", branches: ["寅", "午", "戌"], element: "fire" },
  { name: "巳酉丑 금국", branches: ["巳", "酉", "丑"], element: "metal" }
];

// 지지 형
const EARTHLY_PUNISHMENTS = [
  ["寅", "巳", "申"],  // 무은지형
  ["丑", "未", "戌"],  // 지세지형
  ["子", "卯"]         // 무례지형
];

/* ---------------------------
   7) Export (전역 변수로 추가 등록)
----------------------------*/

// 기존 window.SajuData에 추가
Object.assign(window.SajuData, {
  GANJI_60,
  getGanjiIndex,
  getGanjiByIndex,
  TEN_GODS,
  GEOK_PREFERENCE,
  PROFILES,
  HEAVENLY_COMBINATIONS,
  EARTHLY_SIX_COMBINATIONS,
  EARTHLY_THREE_COMBINATIONS,
  EARTHLY_PUNISHMENTS
});

console.log("✅ SajuData 로드 완료");
console.log("📊 HIDDEN_STEMS_RATIO 샘플:", window.SajuData.HIDDEN_STEMS_RATIO["子"]);
console.log("📊 SEASON_MAP 확인:", window.SajuData.SEASON_MAP);
