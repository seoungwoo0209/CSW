/* =========================================================
   앱 초기화 (app.js)
   ⚠️ DOM 조작, 이벤트 바인딩, runAll 전담
   ⚠️ saju_core.js에서 분리됨
   ========================================================= */

console.log("🔥 app.js 로드 시작");

/* =========================================================
   유틸
   ========================================================= */
function _$(id) { return document.getElementById(id); }

function setAlert(msg) {
  const el = _$("alert");
  if (!el) return;
  if (!msg) { el.textContent = ""; el.classList.add("hidden"); }
  else      { el.textContent = msg; el.classList.remove("hidden"); }
}

/* =========================================================
   탭 전환
   ========================================================= */
function setTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const targetId = tab.getAttribute("data-tab");
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tabpane").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const pane = document.getElementById(targetId);
      if (pane) pane.classList.add("active");
    });
  });
}

/* =========================================================
   메인 계산 및 렌더링
   ========================================================= */
function runAll() {
  setAlert("");

  const name      = _$("name")?.value.trim() || "";
  const birthDate = _$("birthDate")?.value || "";
  const birthTime = _$("birthTime")?.value || "";
  const gender    = _$("gender")?.value || "M";

  if (!birthDate || !birthTime) {
    setAlert("생년월일과 출생시각을 모두 입력해주세요.");
    scheduleAstroRefresh();
    return;
  }

  // ── 사주 계산
  const { fourPillars, birthUtc, approx } = getFourPillars({ birthDate, birthTime });

  // ── 사주 탭
  window.SajuUI.renderPillars(fourPillars);
  const dm = _$("dayMaster");
  if (dm) dm.textContent = `일간: ${fourPillars.day.stem}`;

  const surface = getWuxingCounts(fourPillars, false);
  const top2El  = _$("top2");
  if (top2El) top2El.textContent = full5Summary(surface);
  const barsSurface = _$("barsSurface");
  if (barsSurface) window.SajuUI.renderBars(barsSurface, surface);

  // ── 지장간 탭
  const hiddenEl = _$("hiddenList");
  if (hiddenEl) window.SajuUI.renderHiddenList(hiddenEl, fourPillars);

  const hw = getWuxingCounts(fourPillars, true);
  const barsHidden = _$("barsHidden");
  if (barsHidden && hw?.withHidden) window.SajuUI.renderBars(barsHidden, hw.withHidden);

  // ── 십신 탭
  const shishenPillarsEl = _$("shishenPillars");
  if (shishenPillarsEl) window.SajuUI.renderShishenPillars(shishenPillarsEl, fourPillars);

  const shishenHiddenEl = _$("shishenHidden");
  if (shishenHiddenEl) window.SajuUI.renderShishenHidden(shishenHiddenEl, fourPillars);

  if (approx) console.log("ℹ️ 절기 근사모드 사용");

  // ── 대운 계산
  try {
    const dt = buildDaeunTimeline(fourPillars, birthUtc, gender);

    const metaEl = _$("daeunMeta");
    if (metaEl) {
      metaEl.innerHTML = `
        <strong>방향:</strong> ${dt.direction} |
        <strong>대운 시작:</strong> ${dt.daeunStart.age}세 (정확: ${dt.daeunStart.ageYears.toFixed(2)}세) |
        <strong>시작일:</strong> ${dt.daeunStart.dateApprox} |
        <strong>절기 차이:</strong> ${dt.deltaDays.toFixed(1)}일
      `;
    }

    const daeunListEl = _$("daeunList");
    if (daeunListEl) window.SajuUI.renderDaeunList(daeunListEl, dt.decades);

    // ── SajuResult 저장
    const yinyang = getYinYangCounts(fourPillars, false);
    const yinyangWithHidden = getYinYangCounts(fourPillars, true);

    window.SajuResult = {
      name, birthDate, birthTime, gender,
      fourPillars, birthUtc, approx,
      surface,
      yinyang,
      yinyangWithHidden: yinyangWithHidden.withHidden,
      natalBranches: [fourPillars.year.branch, fourPillars.month.branch, fourPillars.day.branch, fourPillars.hour.branch],
      daeunTimeline: dt
    };

    // ── 분석 탭 렌더링 (DOM 구성 후 실행)
    setTimeout(() => {
      if (window.SajuUI?.renderFullAnalysis) {
        window.SajuUI.renderFullAnalysis("overall");
      } else {
        console.error("❌ SajuUI.renderFullAnalysis 없음");
      }
    }, 50);

  } catch (e) {
    console.error("대운 계산 오류:", e);
  }

  scheduleAstroRefresh();
}

/* =========================================================
   이벤트 바인딩 및 초기화
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  try {
    setTabs();
    initBirthCitySelect();
    ["name","birthDate","birthTime","gender","birthCity"].forEach(id => {
      const el = _$(id);
      if (!el) return;
      el.addEventListener("input",  () => runAll());
      el.addEventListener("change", () => runAll());
    });
    runAll();
  } catch (e) {
    console.error("앱 초기화 오류:", e);
    try { setAlert("오류 발생: " + (e?.message || e)); } catch (_) {}
  }
});

console.log("✅ app.js 로드 완료");

/* =========================================================
   Gemini AI 운세 호출
   ========================================================= */
async function requestGeminiFortune() {
  if (!window.SajuResult) {
    alert("생년월일과 출생시각을 먼저 입력해주세요.");
    return;
  }

  const btn      = _$("geminiBtn");
  const loading  = _$("geminiLoading");
  const resultEl = _$("geminiResult");
  const errorEl  = _$("geminiError");

  // UI 초기화
  btn.disabled          = true;
  btn.style.opacity     = "0.5";
  loading.style.display = "block";
  resultEl.style.display = "none";
  errorEl.style.display  = "none";

  try {
    const { name, gender, fourPillars } = window.SajuResult;

    const res = await fetch("/api/gemini-saju", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gender, fourPillars })
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || "서버 오류가 발생했습니다.");
    }

    // **text** → <strong>, 줄바꿈 처리
    const formatted = (data.result || "")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");

    resultEl.innerHTML = `
      <div style="
        font-size:13px;color:#cbd3f0;line-height:1.9;
        border-top:1px solid rgba(255,255,255,.08);padding-top:14px;
      ">${formatted}</div>
      <div style="margin-top:12px;text-align:right;">
        <button onclick="requestGeminiFortune()" style="
          background:rgba(99,102,241,.2);border:1px solid rgba(99,102,241,.4);
          color:#a5b4fc;font-size:11px;border-radius:8px;
          padding:5px 12px;cursor:pointer;
        ">🔄 다시 보기</button>
      </div>
    `;
    resultEl.style.display = "block";

  } catch (err) {
    errorEl.textContent   = "⚠️ " + (err.message || "운세를 불러오지 못했습니다.");
    errorEl.style.display = "block";
  } finally {
    btn.disabled          = false;
    btn.style.opacity     = "1";
    loading.style.display = "none";
  }
}

/* =========================================================
   점성술 — 출생도시 / 차트 선계산 / AI 해석
   ========================================================= */

const CITY_GROUPS = {
  '서울·경기': {
    '서울': { lat: 37.5665, lng: 126.9780 },
    '수원': { lat: 37.2636, lng: 127.0286 },
    '성남': { lat: 37.4449, lng: 127.1388 },
    '고양': { lat: 37.6584, lng: 126.8320 },
    '용인': { lat: 37.2411, lng: 127.1775 },
    '부천': { lat: 37.5034, lng: 126.7660 },
    '안산': { lat: 37.3219, lng: 126.8309 },
    '안양': { lat: 37.3943, lng: 126.9568 },
    '남양주': { lat: 37.6360, lng: 127.2165 },
    '화성': { lat: 37.1994, lng: 126.8317 },
    '평택': { lat: 36.9921, lng: 127.1126 },
    '의정부': { lat: 37.7381, lng: 127.0337 },
    '시흥': { lat: 37.3800, lng: 126.8030 },
    '파주': { lat: 37.7600, lng: 126.7800 },
    '광명': { lat: 37.4786, lng: 126.8640 },
    '김포': { lat: 37.6152, lng: 126.7156 },
    '군포': { lat: 37.3616, lng: 126.9353 },
    '광주(경기)': { lat: 37.4296, lng: 127.2550 },
    '이천': { lat: 37.2720, lng: 127.4350 },
    '구리': { lat: 37.5943, lng: 127.1296 },
  },
  '인천': { '인천': { lat: 37.4563, lng: 126.7052 } },
  '강원': {
    '춘천': { lat: 37.8813, lng: 127.7298 },
    '원주': { lat: 37.3422, lng: 127.9202 },
    '강릉': { lat: 37.7519, lng: 128.8761 },
    '동해': { lat: 37.5244, lng: 129.1144 },
    '속초': { lat: 38.2070, lng: 128.5919 },
    '태백': { lat: 37.1641, lng: 128.9855 },
  },
  '충청': {
    '대전': { lat: 36.3504, lng: 127.3845 },
    '청주': { lat: 36.6424, lng: 127.4890 },
    '천안': { lat: 36.8151, lng: 127.1139 },
    '아산': { lat: 36.7898, lng: 127.0020 },
    '충주': { lat: 36.9910, lng: 127.9259 },
    '공주': { lat: 36.4465, lng: 127.1190 },
    '보령': { lat: 36.3332, lng: 126.6128 },
    '서산': { lat: 36.7848, lng: 126.4503 },
    '논산': { lat: 36.1870, lng: 127.0990 },
    '제천': { lat: 37.1326, lng: 128.1909 },
  },
  '전라': {
    '광주': { lat: 35.1595, lng: 126.8526 },
    '전주': { lat: 35.8242, lng: 127.1480 },
    '익산': { lat: 35.9483, lng: 126.9577 },
    '군산': { lat: 35.9676, lng: 126.7368 },
    '목포': { lat: 34.8118, lng: 126.3922 },
    '여수': { lat: 34.7604, lng: 127.6622 },
    '순천': { lat: 34.9506, lng: 127.4872 },
    '나주': { lat: 35.0160, lng: 126.7107 },
  },
  '경상': {
    '부산': { lat: 35.1796, lng: 129.0756 },
    '대구': { lat: 35.8714, lng: 128.6014 },
    '울산': { lat: 35.5384, lng: 129.3114 },
    '창원': { lat: 35.2280, lng: 128.6811 },
    '포항': { lat: 36.0190, lng: 129.3435 },
    '경주': { lat: 35.8562, lng: 129.2247 },
    '김해': { lat: 35.2285, lng: 128.8893 },
    '구미': { lat: 36.1197, lng: 128.3444 },
    '진주': { lat: 35.1799, lng: 128.1076 },
    '안동': { lat: 36.5684, lng: 128.7294 },
    '거제': { lat: 34.8799, lng: 128.6211 },
    '통영': { lat: 34.8544, lng: 128.4333 },
  },
  '제주': {
    '제주': { lat: 33.4996, lng: 126.5312 },
    '서귀포': { lat: 33.2541, lng: 126.5600 },
  },
  '아시아': {
    '도쿄': { lat: 35.6762, lng: 139.6503 },
    '오사카': { lat: 34.6937, lng: 135.5023 },
    '베이징': { lat: 39.9042, lng: 116.4074 },
    '상하이': { lat: 31.2304, lng: 121.4737 },
    '홍콩': { lat: 22.3193, lng: 114.1694 },
    '타이베이': { lat: 25.0330, lng: 121.5654 },
    '싱가포르': { lat: 1.3521, lng: 103.8198 },
    '방콕': { lat: 13.7563, lng: 100.5018 },
    '하노이': { lat: 21.0285, lng: 105.8542 },
    '호치민': { lat: 10.8231, lng: 106.6297 },
    '자카르타': { lat: -6.2088, lng: 106.8456 },
    '마닐라': { lat: 14.5995, lng: 120.9842 },
    '쿠알라룸푸르': { lat: 3.1390, lng: 101.6869 },
    '뭄바이': { lat: 19.0760, lng: 72.8777 },
    '델리': { lat: 28.7041, lng: 77.1025 },
  },
  '유럽': {
    '런던': { lat: 51.5074, lng: -0.1278 },
    '파리': { lat: 48.8566, lng: 2.3522 },
    '베를린': { lat: 52.5200, lng: 13.4050 },
    '로마': { lat: 41.9028, lng: 12.4964 },
    '마드리드': { lat: 40.4168, lng: -3.7038 },
    '암스테르담': { lat: 52.3676, lng: 4.9041 },
    '취리히': { lat: 47.3769, lng: 8.5417 },
    '빈': { lat: 48.2082, lng: 16.3738 },
    '모스크바': { lat: 55.7558, lng: 37.6173 },
  },
  '북미': {
    '뉴욕': { lat: 40.7128, lng: -74.0060 },
    'LA': { lat: 34.0522, lng: -118.2437 },
    '시카고': { lat: 41.8781, lng: -87.6298 },
    '샌프란시스코': { lat: 37.7749, lng: -122.4194 },
    '시애틀': { lat: 47.6062, lng: -122.3321 },
    '라스베이거스': { lat: 36.1699, lng: -115.1398 },
    '달라스': { lat: 32.7767, lng: -96.7970 },
    '마이애미': { lat: 25.7617, lng: -80.1918 },
    '워싱턴DC': { lat: 38.9072, lng: -77.0369 },
    '토론토': { lat: 43.6532, lng: -79.3832 },
    '밴쿠버': { lat: 49.2827, lng: -123.1207 },
  },
  '오세아니아·기타': {
    '시드니': { lat: -33.8688, lng: 151.2093 },
    '멜버른': { lat: -37.8136, lng: 144.9631 },
    '오클랜드': { lat: -36.8509, lng: 174.7645 },
    '두바이': { lat: 25.2048, lng: 55.2708 },
    '상파울루': { lat: -23.5505, lng: -46.6333 },
  },
};

let astroCalcTimer = null;
let astroCalcAbort = null;

function initBirthCitySelect() {
  const sel = _$("birthCity");
  if (!sel) return;

  sel.innerHTML = "";
  for (const [group, cities] of Object.entries(CITY_GROUPS)) {
    const og = document.createElement("optgroup");
    og.label = group;
    for (const [name] of Object.entries(cities)) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === "서울") opt.selected = true;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }
}

function getCityCoords(cityName) {
  for (const cities of Object.values(CITY_GROUPS)) {
    if (cities[cityName]) return cities[cityName];
  }
  return CITY_GROUPS['서울·경기']['서울'];
}

function setAstroCalcStatus(text, tone = "muted") {
  const el = _$("astroCalcStatus");
  if (!el) return;
  const colors = { muted: "#64748b", ok: "#86efac", warn: "#fbbf24", err: "#ff7a7a" };
  el.style.color = colors[tone] || colors.muted;
  el.textContent = text || "";
}

function scheduleAstroRefresh() {
  clearTimeout(astroCalcTimer);
  astroCalcTimer = setTimeout(refreshAstroChart, 400);
}

async function refreshAstroChart() {
  const birthDate = _$("birthDate")?.value;
  const birthTime = _$("birthTime")?.value;
  if (!birthDate || !birthTime) {
    window.AstroResult = null;
    setAstroCalcStatus("");
    return;
  }

  const name = _$("name")?.value.trim() || "";
  const gender = _$("gender")?.value || "M";
  const cityName = _$("birthCity")?.value || "서울";
  const { lat, lng } = getCityCoords(cityName);

  if (astroCalcAbort) astroCalcAbort.abort();
  astroCalcAbort = new AbortController();

  setAstroCalcStatus("🪐 차트 계산 중...", "warn");

  try {
    const calcRes = await fetch("/api/astro-calc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate, birthTime, lat, lng, name, gender }),
      signal: astroCalcAbort.signal
    });

    const astroData = await calcRes.json();
    if (!calcRes.ok || astroData.error) throw new Error(astroData.error || "천문 계산 오류");

    window.AstroResult = astroData;
    renderAstroNatal(astroData);
    setAstroCalcStatus("✅ 차트 계산 완료 — AI 해석 버튼을 눌러주세요.", "ok");
  } catch (err) {
    if (err.name === "AbortError") return;
    window.AstroResult = null;
    setAstroCalcStatus("⚠️ 차트 계산 실패: " + (err.message || err), "err");
  }
}

function renderAstroNatal(astroData) {
  const panel = _$("astroNatalPanel");
  const grid  = _$("astroNatalGrid");
  if (!panel || !grid) return;

  const PLANET_KR = {
    sun:'☀️ 태양', moon:'🌙 달', mercury:'☿ 수성', venus:'♀ 금성',
    mars:'♂ 화성', jupiter:'♃ 목성', saturn:'♄ 토성',
    uranus:'⛢ 천왕성', neptune:'♆ 해왕성', pluto:'♇ 명왕성'
  };

  const natal = astroData.natal;
  grid.innerHTML = Object.entries(PLANET_KR).map(([key, label]) => {
    const p = natal[key];
    return `
      <div style="
        background:rgba(255,255,255,.04);border-radius:8px;padding:8px 10px;
        border:1px solid rgba(200,170,255,.1);
      ">
        <div style="color:#c4b5fd;font-size:11px;margin-bottom:3px;">${label}</div>
        <div style="color:#e2e8f0;font-size:12px;font-weight:600;">${p.sign}</div>
        <div style="color:#94a3b8;font-size:11px;">${p.degree}°${p.minute}' · ${p.house}하우스</div>
      </div>
    `;
  }).join('') + `
    <div style="
      background:rgba(167,139,250,.1);border-radius:8px;padding:8px 10px;
      border:1px solid rgba(167,139,250,.3);
    ">
      <div style="color:#c4b5fd;font-size:11px;margin-bottom:3px;">↑ ASC</div>
      <div style="color:#e2e8f0;font-size:12px;font-weight:600;">${astroData.angles.asc.sign}</div>
      <div style="color:#94a3b8;font-size:11px;">${astroData.angles.asc.degree}°${astroData.angles.asc.minute}'</div>
    </div>
    <div style="
      background:rgba(167,139,250,.1);border-radius:8px;padding:8px 10px;
      border:1px solid rgba(167,139,250,.3);
    ">
      <div style="color:#c4b5fd;font-size:11px;margin-bottom:3px;">MC 천정</div>
      <div style="color:#e2e8f0;font-size:12px;font-weight:600;">${astroData.angles.mc.sign}</div>
      <div style="color:#94a3b8;font-size:11px;">${astroData.angles.mc.degree}°${astroData.angles.mc.minute}'</div>
    </div>
  `;
  panel.style.display = 'block';
}

async function requestAstroReading() {
  if (!window.SajuResult) {
    alert("생년월일과 출생시각을 먼저 입력해주세요.");
    return;
  }

  const btn      = _$("astroBtn");
  const loading  = _$("astroLoading");
  const resultEl = _$("astroResult");
  const errorEl  = _$("astroError");

  btn.disabled           = true;
  btn.style.opacity      = "0.5";
  resultEl.style.display = "none";
  errorEl.style.display  = "none";

  try {
    if (!window.AstroResult) {
      setAstroCalcStatus("🪐 차트 계산 중...", "warn");
      await refreshAstroChart();
    }
    if (!window.AstroResult) {
      throw new Error("차트 데이터가 준비되지 않았습니다. 출생 정보를 확인해주세요.");
    }

    loading.style.display = "block";

    const geminiRes = await fetch("/api/gemini-astro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ astroData: window.AstroResult })
    });

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok || geminiData.error) throw new Error(geminiData.error || "AI 해석 오류");

    const formatted = (geminiData.result || "")
      .replace(/## (.+)/g, '<h3 style="color:#c4b5fd;margin:16px 0 8px;font-size:14px;">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#e2e8f0;'>$1</strong>")
      .replace(/\n/g, "<br>");

    resultEl.innerHTML = `
      <div style="
        font-size:13px;color:#cbd3f0;line-height:1.9;
        border-top:1px solid rgba(255,255,255,.08);padding-top:14px;
      ">${formatted}</div>
      <div style="margin-top:12px;text-align:right;">
        <button onclick="requestAstroReading()" style="
          background:rgba(124,58,237,.2);border:1px solid rgba(124,58,237,.4);
          color:#c4b5fd;font-size:11px;border-radius:8px;
          padding:5px 12px;cursor:pointer;
        ">🔄 다시 보기</button>
      </div>
    `;
    resultEl.style.display = "block";

  } catch (err) {
    errorEl.textContent   = "⚠️ " + (err.message || "점성술 리딩을 불러오지 못했습니다.");
    errorEl.style.display = "block";
  } finally {
    btn.disabled          = false;
    btn.style.opacity     = "1";
    loading.style.display = "none";
  }
}
