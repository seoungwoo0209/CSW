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
}

/* =========================================================
   이벤트 바인딩 및 초기화
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  try {
    setTabs();
    ["name","birthDate","birthTime","gender"].forEach(id => {
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
   점성술 리딩 호출
   ========================================================= */

// 도시명 → 위도/경도 변환 (주요 도시 내장)
const CITY_COORDS = {
  '서울': { lat: 37.5665, lng: 126.9780 },
  '부산': { lat: 35.1796, lng: 129.0756 },
  '대구': { lat: 35.8714, lng: 128.6014 },
  '인천': { lat: 37.4563, lng: 126.7052 },
  '광주': { lat: 35.1595, lng: 126.8526 },
  '대전': { lat: 36.3504, lng: 127.3845 },
  '울산': { lat: 35.5384, lng: 129.3114 },
  '수원': { lat: 37.2636, lng: 127.0286 },
  '도쿄': { lat: 35.6762, lng: 139.6503 },
  '뉴욕': { lat: 40.7128, lng: -74.0060 },
  '런던': { lat: 51.5074, lng: -0.1278 },
  '파리': { lat: 48.8566, lng: 2.3522 },
  '베이징': { lat: 39.9042, lng: 116.4074 },
  '상하이': { lat: 31.2304, lng: 121.4737 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'la': { lat: 34.0522, lng: -118.2437 },
};

function getCityCoords(cityName) {
  if (!cityName) return { lat: 37.5665, lng: 126.9780 }; // 기본값: 서울
  const key = cityName.trim().toLowerCase();
  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    if (name.toLowerCase() === key || key.includes(name.toLowerCase())) return coords;
  }
  return { lat: 37.5665, lng: 126.9780 }; // 못 찾으면 서울
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
  loading.style.display  = "block";
  resultEl.style.display = "none";
  errorEl.style.display  = "none";

  try {
    const { name, gender, birthDate, birthTime } = window.SajuResult;
    const cityName = _$("birthCity")?.value || "서울";
    const { lat, lng } = getCityCoords(cityName);

    // 1단계: 천문 계산
    loading.querySelector("div").textContent = "🪐 행성 위치를 계산하고 있습니다...";
    const calcRes = await fetch("/api/astro-calc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate, birthTime, lat, lng, name, gender })
    });

    const astroData = await calcRes.json();
    if (!calcRes.ok || astroData.error) throw new Error(astroData.error || "천문 계산 오류");

    // 네이탈 차트 표시
    renderAstroNatal(astroData);

    // 2단계: Gemini 해석
    loading.querySelector("div").textContent = "✨ AI가 점성술 리딩 중입니다...";
    const geminiRes = await fetch("/api/gemini-astro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ astroData })
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
