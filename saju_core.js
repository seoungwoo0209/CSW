/* =========================================================
   사주 계산 엔진 (saju_core.js) — 순수 계산만
   ⚠️ DOM 조작 / runAll / bindUI / DOMContentLoaded 없음
   ⚠️ window.SajuData는 saju_data.js에서 이미 초기화됨
   ⚠️ getShishen 이 파일에서 단 1개 정의 → 전역 공용
   ========================================================= */

console.log("🔥 saju_core.js 로드 시작");

/* ---------------------------
   로컬 단축 참조 (SajuData 의존)
----------------------------*/
function _D() { return window.SajuData; }  // 데이터 참조 헬퍼

/* =========================================================
   1) 십신 계산 — 전역 공용 함수 (단 1개)
   saju_engine.js / intuition_engine.js 모두 이 함수 사용
   ========================================================= */
function getShishen(dayStem, targetStem) {
  const D = _D();
  const dayEl    = D.WUXING_STEM[dayStem];
  const targetEl = D.WUXING_STEM[targetStem];
  if (!dayEl || !targetEl) return null;

  const dayYang    = D.YINYANG_STEM[dayStem]    === "yang";
  const targetYang = D.YINYANG_STEM[targetStem] === "yang";
  const same = (dayYang === targetYang);

  if (dayEl === targetEl)                          return same ? "比肩" : "劫財";
  if (D.WUXING_GENERATES[dayEl] === targetEl)     return same ? "食神" : "傷官";
  if (D.WUXING_CONTROLS[dayEl]  === targetEl)     return same ? "偏財" : "正財";
  if (D.WUXING_CONTROLS[targetEl] === dayEl)      return same ? "偏官" : "正官";
  if (D.WUXING_GENERATES[targetEl] === dayEl)     return same ? "偏印" : "正印";
  return null;
}

function getShishenDisplay(shishen) {
  if (!shishen) return "";
  if (shishen === "日干") return "일간";
  const kr = _D().TEN_GODS_KR[shishen] || "";
  return `${shishen}(${kr})`;
}

/* =========================================================
   2) 유틸리티
   ========================================================= */
function utcDateToKSTParts(utcDate) {
  const kst = new Date(utcDate.getTime() + 9 * 3600000);
  return {
    y: kst.getUTCFullYear(), m: kst.getUTCMonth() + 1, d: kst.getUTCDate(),
    hour: kst.getUTCHours(), minute: kst.getUTCMinutes()
  };
}

function kstToUtcDate(y, m, d, hour = 0, minute = 0) {
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - 9 * 3600000);
}

function julianDayNumber(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy
    + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

/* =========================================================
   3) 절기 계산
   ========================================================= */
const JIEQI       = ["LICHUN","JINGZHE","QINGMING","LIXIA","MANGZHONG","XIAOSHU",
                     "LIQIU","BAILU","HANLU","LIDONG","DAXUE","XIAOHAN"];
const JIEQI_BRANCH = ["寅","卯","辰","巳","午","未","申","酉","戌","亥","子","丑"];
const JIEQI_BASE_DAY = [35,64,95,126,157,188,220,251,281,311,341,5];
const JIEQI_BASE_MIN = [120,330,615,890,1100,1305,210,440,680,910,1130,200];

const JIEQI_SAMPLE = (() => {
  const baseYear = 2020, years = 11;
  const make = amp => Array.from({ length: years }, (_, i) => Math.round(Math.sin((i + 1) * 0.9) * amp));
  const deltas = {};
  for (const k of JIEQI) deltas[k] = make(6);
  return { baseYear, years, deltas };
})();

function getJieqiDateTimeKST(year, jieqiName) {
  const idx = JIEQI.indexOf(jieqiName);
  if (idx < 0) return { dt: null, approx: true };
  let baseMin = JIEQI_BASE_MIN[idx];
  const offset = year - JIEQI_SAMPLE.baseYear;
  const inRange = offset >= 0 && offset < JIEQI_SAMPLE.years;
  if (inRange) baseMin += JIEQI_SAMPLE.deltas[jieqiName][offset];
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dt = new Date(jan1.getTime() + (JIEQI_BASE_DAY[idx] - 1) * 86400000 + baseMin * 60000);
  return { dt, approx: !inRange };
}

/* =========================================================
   4) 년주 / 월주 / 일주 / 시주 계산
   ========================================================= */
function yearGanji(utcDate) {
  const D = _D();
  const kst = utcDateToKSTParts(utcDate);
  const lichun = getJieqiDateTimeKST(kst.y, "LICHUN");
  let y = kst.y;
  if (lichun.dt && utcDate < lichun.dt) y -= 1;
  return { year: y, stem: D.STEMS[(y - 4) % 10], branch: D.BRANCHES[(y - 4) % 12] };
}

function monthGanji(utcDate) {
  const D = _D();
  const kst = utcDateToKSTParts(utcDate);
  let matchIdx = -1;
  for (let i = 0; i < JIEQI.length; i++) {
    const jq = getJieqiDateTimeKST(kst.y, JIEQI[i]);
    if (jq.dt && utcDate >= jq.dt) matchIdx = i; else break;
  }
  if (matchIdx === -1) {
    const xiaohan = getJieqiDateTimeKST(kst.y - 1, "XIAOHAN");
    if (xiaohan.dt && utcDate >= xiaohan.dt) matchIdx = 11;
    else matchIdx = 11;
  }
  const monthBranch = JIEQI_BRANCH[matchIdx];
  const yg = yearGanji(utcDate);
  const yinStemMap = {
    "甲":"丙","己":"丙","乙":"戊","庚":"戊","丙":"庚",
    "辛":"庚","丁":"壬","壬":"壬","戊":"甲","癸":"甲"
  };
  const yinStem   = yinStemMap[yg.stem];
  const mIdx      = JIEQI_BRANCH.indexOf(monthBranch);
  const stemIdx   = (D.STEMS.indexOf(yinStem) + mIdx) % 10;
  return { stem: D.STEMS[stemIdx], branch: monthBranch };
}

function dayGanjiFromYMD(y, m, d) {
  const D = _D();
  const jdn = julianDayNumber(y, m, d);
  return {
    stem:   D.STEMS[(jdn + 49) % 10],
    branch: D.BRANCHES[(jdn + 1) % 12]
  };
}

function hourBranchFromTime(hour) {
  const D = _D();
  const adj = hour === 23 ? -1 : hour;
  return D.BRANCHES[Math.floor((adj + 1) / 2) % 12];
}

function hourGanjiFromDayStem(dayStem, hourBranch) {
  const D = _D();
  const dsIdx   = D.STEMS.indexOf(dayStem);
  const hbIdx   = D.BRANCHES.indexOf(hourBranch);
  const stemIdx = ((dsIdx % 5) * 2 + hbIdx) % 10;
  return { stem: D.STEMS[stemIdx], branch: hourBranch };
}

/* =========================================================
   5) 사주팔자 계산 (메인 진입점)
   ========================================================= */
function getFourPillars(input) {
  const { birthDate, birthTime } = input;
  const [yyyy, mm, dd] = birthDate.split('-').map(Number);
  const [hh, mi]       = birthTime.split(':').map(Number);
  const birthUtc = kstToUtcDate(yyyy, mm, dd, hh, mi);

  const yg  = yearGanji(birthUtc);
  const mg  = monthGanji(birthUtc);
  const kst = utcDateToKSTParts(birthUtc);
  const dg  = dayGanjiFromYMD(kst.y, kst.m, kst.d);
  const hb  = hourBranchFromTime(kst.hour);
  const hg  = hourGanjiFromDayStem(dg.stem, hb);

  const fourPillars = {
    year:  { stem: yg.stem,  branch: yg.branch  },
    month: { stem: mg.stem,  branch: mg.branch  },
    day:   { stem: dg.stem,  branch: dg.branch  },
    hour:  { stem: hg.stem,  branch: hg.branch  }
  };

  let approx = false;
  for (const jq of JIEQI) {
    if (getJieqiDateTimeKST(kst.y, jq).approx) { approx = true; break; }
  }

  return { fourPillars, birthUtc, approx };
}

/* =========================================================
   6) 오행 / 음양 계산
   ========================================================= */
function getWuxingCounts(fourPillars, includeHidden) {
  const D = _D();
  const surface = { wood:0, fire:0, earth:0, metal:0, water:0 };
  for (const p of [fourPillars.year, fourPillars.month, fourPillars.day, fourPillars.hour]) {
    if (D.WUXING_STEM[p.stem])   surface[D.WUXING_STEM[p.stem]]++;
    if (D.WUXING_BRANCH[p.branch]) surface[D.WUXING_BRANCH[p.branch]]++;
  }
  if (!includeHidden) return surface;

  const withHidden = { ...surface };
  for (const p of [fourPillars.year, fourPillars.month, fourPillars.day, fourPillars.hour]) {
    for (const item of (D.HIDDEN_STEMS_BRANCH[p.branch] || [])) {
      const wx = D.WUXING_STEM[item.stem];
      if (wx) withHidden[wx]++;
    }
  }
  return { surface, withHidden };
}

function getYinYangCounts(fourPillars, includeHidden) {
  const D = _D();
  const surface = { yang:0, yin:0 };
  for (const p of [fourPillars.year, fourPillars.month, fourPillars.day, fourPillars.hour]) {
    const yy = D.YINYANG_STEM[p.stem];
    if (yy) surface[yy]++;
  }
  if (!includeHidden) return surface;
  const withHidden = { ...surface };
  for (const p of [fourPillars.year, fourPillars.month, fourPillars.day, fourPillars.hour]) {
    for (const item of (D.HIDDEN_STEMS_BRANCH[p.branch] || [])) {
      const yy = D.YINYANG_STEM[item.stem];
      if (yy) withHidden[yy]++;
    }
  }
  return { surface, withHidden };
}

function full5Summary(counts) {
  const D = _D();
  return ["wood","fire","earth","metal","water"]
    .map(wx => D.WUXING_LABEL[wx] + counts[wx]).join(" ");
}

/* =========================================================
   7) 십신 계산 헬퍼
   ========================================================= */
function getFourPillarsShishen(fourPillars) {
  const ds = fourPillars.day.stem;
  return {
    year:  { stem: fourPillars.year.stem,  shishen: getShishen(ds, fourPillars.year.stem)  },
    month: { stem: fourPillars.month.stem, shishen: getShishen(ds, fourPillars.month.stem) },
    day:   { stem: fourPillars.day.stem,   shishen: "日干" },
    hour:  { stem: fourPillars.hour.stem,  shishen: getShishen(ds, fourPillars.hour.stem)  }
  };
}

function getHiddenStemsShishen(fourPillars) {
  const D  = _D();
  const ds = fourPillars.day.stem;
  return [
    { label:"년지", branch: fourPillars.year.branch  },
    { label:"월지", branch: fourPillars.month.branch },
    { label:"일지", branch: fourPillars.day.branch   },
    { label:"시지", branch: fourPillars.hour.branch  }
  ].map(p => {
    const hs = D.HIDDEN_STEMS_BRANCH[p.branch];
    if (!hs) return null;
    return {
      label: p.label, branch: p.branch,
      stems: hs.map(item => ({
        stem: item.stem, role: item.role,
        shishen: getShishen(ds, item.stem)
      }))
    };
  }).filter(Boolean);
}

/* =========================================================
   8) 대운 계산
   ========================================================= */
function getDaewoonDirection(yearStem, gender) {
  const D    = _D();
  const yang = D.YINYANG_STEM[yearStem] === "yang";
  return (yang && gender === "M") || (!yang && gender === "F");
}

function getNearestJieqi(birthUtc, forward, birthYear) {
  const all = [];
  for (const y of [birthYear - 1, birthYear, birthYear + 1]) {
    for (const jqName of JIEQI) {
      const jq = getJieqiDateTimeKST(y, jqName);
      if (jq.dt) all.push({ dt: jq.dt, name: jqName, year: y });
    }
  }
  all.sort((a, b) => a.dt - b.dt);
  if (forward) {
    for (const jq of all) if (jq.dt > birthUtc) return jq;
  } else {
    for (let i = all.length - 1; i >= 0; i--) if (all[i].dt < birthUtc) return all[i];
  }
  throw new Error("No suitable jieqi found");
}

function diffDays(a, b) {
  return (a.getTime() - b.getTime()) / 86400000;
}

function addYearsMonthsDays(birthUtc, addYears, addMonths, addDaysFloat) {
  const kst = utcDateToKSTParts(birthUtc);
  const tm  = kst.m - 1 + addMonths + addYears * 12;
  const d   = new Date(Date.UTC(kst.y, tm, kst.d, kst.hour, kst.minute) - 9 * 3600000);
  d.setTime(d.getTime() + addDaysFloat * 86400000);
  return d;
}

function buildDaeunTimeline(fourPillars, birthUtc, gender) {
  const D         = _D();
  const yearStem  = fourPillars.year.stem;
  const kstBirth  = utcDateToKSTParts(birthUtc);
  const forward   = getDaewoonDirection(yearStem, gender);
  const nearestJq = getNearestJieqi(birthUtc, forward, kstBirth.y);
  const deltaDays = Math.abs(diffDays(nearestJq.dt, birthUtc));
  const startAge  = Math.round(deltaDays / 3);

  const totalMonths = deltaDays * 4;
  const addY = Math.floor(totalMonths / 12);
  const addM = Math.floor(totalMonths % 12);
  const startDT = addYearsMonthsDays(birthUtc, addY, addM, (totalMonths - (addY * 12 + addM)) / 4);
  const sk = utcDateToKSTParts(startDT);
  const dateApprox = `${sk.y}-${String(sk.m).padStart(2,'0')}-${String(sk.d).padStart(2,'0')}`;

  const monthPillar = fourPillars.month.stem + fourPillars.month.branch;
  const monthIdx    = D.GANJI_60.indexOf(monthPillar);
  const step        = forward ? 1 : -1;

  const decades = [];
  for (let i = 0; i < 10; i++) {
    const gi    = (monthIdx + step * (i + 1) + 600) % 60;
    const ganji = D.GANJI_60[gi];
    const decStartDT = new Date(startDT.getTime());
    decStartDT.setFullYear(decStartDT.getFullYear() + i * 10);
    decades.push({
      index: i,
      startAge: startAge + i * 10,
      endAge:   startAge + i * 10 + 9,
      stem:   ganji[0],
      branch: ganji[1],
      ganji
    });
  }

  return {
    direction:    forward ? "순행" : "역행",
    daeunStart:   { age: startAge, ageYears: deltaDays / 3, dateApprox, dateExact: startDT },
    nearestJieqi: { name: nearestJq.name, dt: nearestJq.dt },
    deltaDays,
    decades
  };
}

/* =========================================================
   9) 지지 이벤트 (충/합 등) — engine에서도 사용
   ========================================================= */
function calcBranchEvents(natalBranches, periodBranch) {
  const D = _D();
  const ev = { hap:0, chung:0, hyeong:0, pa:0, hae:0 };
  const PA  = [["子","酉"],["丑","辰"],["寅","亥"],["卯","午"],["巳","申"],["未","戌"]];
  const HAE = [["子","未"],["丑","午"],["寅","巳"],["卯","辰"],["申","亥"],["酉","戌"]];
  const HYEONG = [["寅","巳","申"],["丑","未","戌"],["子","卯"]];

  for (const nb of natalBranches) {
    for (const [a,b] of D.EARTHLY_CLASHES) {
      if ((nb===a && periodBranch===b)||(nb===b && periodBranch===a)) ev.chung++;
    }
    for (const [a,b] of D.EARTHLY_SIX_COMBINATIONS) {
      if ((nb===a && periodBranch===b)||(nb===b && periodBranch===a)) ev.hap++;
    }
    for (const [a,b] of PA) {
      if ((nb===a && periodBranch===b)||(nb===b && periodBranch===a)) ev.pa++;
    }
    for (const [a,b] of HAE) {
      if ((nb===a && periodBranch===b)||(nb===b && periodBranch===a)) ev.hae++;
    }
    for (const g of HYEONG) {
      if (g.includes(nb) && g.includes(periodBranch) && nb !== periodBranch) ev.hyeong++;
    }
  }
  return ev;
}

console.log("✅ saju_core.js 로드 완료 (getShishen 공용 등록)");
