/* =========================================================
   앱 초기화 (app.js)  v2.0
   변경 사항:
   - birthCity 입력 이벤트 바인딩 추가
   - 차트 미리계산: 출생 정보 바뀔 때마다 /api/astro-calc 호출 → window.AstroResult 저장
   - requestAstroReading(): 계산 건너뛰고 Gemini 해석만 호출 (속도 개선)
   - 출생도시 → select 드롭다운 (지역별 optgroup)
   - window.AstroResult 캐시로 탭 전환 시 재계산 없음
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
   메인 사주 계산 및 렌더링
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

    // ── 분석 탭 렌더링 (SajuEngine 로드 확인 후 실행)
    function _tryRenderAnalysis(attempt) {
      if (window.SajuEngine?.buildState && window.SajuUI?.renderFullAnalysis) {
        window.SajuUI.renderFullAnalysis("overall");
      } else if (attempt < 10) {
        setTimeout(() => _tryRenderAnalysis(attempt + 1), 150);
      } else {
        console.error("❌ SajuEngine 로드 타임아웃");
      }
    }
    setTimeout(() => _tryRenderAnalysis(0), 50);

    // ── 점성술 차트 미리 계산
    scheduleAstroCalc();

  } catch (e) {
    console.error("대운 계산 오류:", e);
  }
}

/* =========================================================
   점성술 차트 미리 계산
   출생 정보 바뀔 때마다 /api/astro-calc를 호출해
   window.AstroResult에 저장해 둠.
   AI 해석 버튼을 누를 때는 저장된 값만 사용.
   ========================================================= */
let _astroCalcTimer = null;

function scheduleAstroCalc() {
  // 300ms 디바운스 — 입력 중 과다 호출 방지
  clearTimeout(_astroCalcTimer);
  _astroCalcTimer = setTimeout(runAstroCalc, 300);
}

async function runAstroCalc() {
  if (!window.SajuResult) return;

  const { name, gender, birthDate, birthTime } = window.SajuResult;
  const cityName = getCitySelectValue();
  const { lat, lng, utcOffset } = getCityCoords(cityName);

  // 상태 표시
  const statusEl = _$("astroCalcStatus");
  if (statusEl) {
    statusEl.textContent = "⏳ 차트 계산 중...";
    statusEl.style.color = "#94a3b8";
  }

  try {
    const calcRes = await fetch("/api/astro-calc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate, birthTime, lat, lng, name, gender, utcOffset })
    });

    const astroData = await calcRes.json();
    if (!calcRes.ok || astroData.error) throw new Error(astroData.error || "천문 계산 오류");

    window.AstroResult = astroData;

    // 나탈 차트 그리드 표시
    renderAstroNatal(astroData);

    if (statusEl) {
      statusEl.textContent = "✅ 차트 계산 완료 — AI 해석 버튼을 눌러주세요.";
      statusEl.style.color = "#86efac";
    }

  } catch (err) {
    console.warn("astro-calc 미리계산 실패:", err.message);
    window.AstroResult = null;
    if (statusEl) {
      statusEl.textContent = "⚠️ 차트 계산 실패 (배포 환경에서 다시 시도)";
      statusEl.style.color = "#fca5a5";
    }
  }
}

/* =========================================================
   도시 Select 값 읽기
   ========================================================= */
function getCitySelectValue() {
  const el = _$("birthCity");
  if (!el) return "서울";
  return el.value || "서울";
}

/* =========================================================
   도시명 → 위도/경도/utcOffset
   ========================================================= */
const CITY_COORDS = {
  // 서울/경기
  "서울":        { lat: 37.5665, lng: 126.9780, utcOffset: 9 },
  "수원":        { lat: 37.2636, lng: 127.0286, utcOffset: 9 },
  "성남":        { lat: 37.4449, lng: 127.1388, utcOffset: 9 },
  "고양":        { lat: 37.6584, lng: 126.8320, utcOffset: 9 },
  "용인":        { lat: 37.2411, lng: 127.1775, utcOffset: 9 },
  "부천":        { lat: 37.5034, lng: 126.7660, utcOffset: 9 },
  "안산":        { lat: 37.3219, lng: 126.8309, utcOffset: 9 },
  "안양":        { lat: 37.3943, lng: 126.9568, utcOffset: 9 },
  "남양주":      { lat: 37.6360, lng: 127.2165, utcOffset: 9 },
  "화성":        { lat: 37.1994, lng: 126.8317, utcOffset: 9 },
  "평택":        { lat: 36.9921, lng: 127.1126, utcOffset: 9 },
  "의정부":      { lat: 37.7381, lng: 127.0337, utcOffset: 9 },
  "파주":        { lat: 37.7600, lng: 126.7800, utcOffset: 9 },
  "김포":        { lat: 37.6152, lng: 126.7156, utcOffset: 9 },
  "광주(경기)":  { lat: 37.4296, lng: 127.2550, utcOffset: 9 },
  // 인천
  "인천":        { lat: 37.4563, lng: 126.7052, utcOffset: 9 },
  // 강원
  "춘천":        { lat: 37.8813, lng: 127.7298, utcOffset: 9 },
  "원주":        { lat: 37.3422, lng: 127.9202, utcOffset: 9 },
  "강릉":        { lat: 37.7519, lng: 128.8761, utcOffset: 9 },
  "속초":        { lat: 38.2070, lng: 128.5919, utcOffset: 9 },
  // 충청
  "대전":        { lat: 36.3504, lng: 127.3845, utcOffset: 9 },
  "청주":        { lat: 36.6424, lng: 127.4890, utcOffset: 9 },
  "천안":        { lat: 36.8151, lng: 127.1139, utcOffset: 9 },
  "충주":        { lat: 36.9910, lng: 127.9259, utcOffset: 9 },
  // 전라
  "광주":        { lat: 35.1595, lng: 126.8526, utcOffset: 9 },
  "전주":        { lat: 35.8242, lng: 127.1480, utcOffset: 9 },
  "목포":        { lat: 34.8118, lng: 126.3922, utcOffset: 9 },
  "여수":        { lat: 34.7604, lng: 127.6622, utcOffset: 9 },
  "순천":        { lat: 34.9506, lng: 127.4872, utcOffset: 9 },
  // 경상
  "부산":        { lat: 35.1796, lng: 129.0756, utcOffset: 9 },
  "대구":        { lat: 35.8714, lng: 128.6014, utcOffset: 9 },
  "울산":        { lat: 35.5384, lng: 129.3114, utcOffset: 9 },
  "창원":        { lat: 35.2280, lng: 128.6811, utcOffset: 9 },
  "포항":        { lat: 36.0190, lng: 129.3435, utcOffset: 9 },
  "경주":        { lat: 35.8562, lng: 129.2247, utcOffset: 9 },
  "진주":        { lat: 35.1799, lng: 128.1076, utcOffset: 9 },
  "안동":        { lat: 36.5684, lng: 128.7294, utcOffset: 9 },
  // 제주
  "제주":        { lat: 33.4996, lng: 126.5312, utcOffset: 9 },
  "서귀포":      { lat: 33.2541, lng: 126.5600, utcOffset: 9 },
  // 아시아
  "도쿄":        { lat: 35.6762, lng: 139.6503, utcOffset: 9 },
  "오사카":      { lat: 34.6937, lng: 135.5023, utcOffset: 9 },
  "베이징":      { lat: 39.9042, lng: 116.4074, utcOffset: 8 },
  "상하이":      { lat: 31.2304, lng: 121.4737, utcOffset: 8 },
  "홍콩":        { lat: 22.3193, lng: 114.1694, utcOffset: 8 },
  "타이베이":    { lat: 25.0330, lng: 121.5654, utcOffset: 8 },
  "싱가포르":    { lat: 1.3521,  lng: 103.8198, utcOffset: 8 },
  "방콕":        { lat: 13.7563, lng: 100.5018, utcOffset: 7 },
  "하노이":      { lat: 21.0285, lng: 105.8542, utcOffset: 7 },
  "호치민":      { lat: 10.8231, lng: 106.6297, utcOffset: 7 },
  "자카르타":    { lat: -6.2088, lng: 106.8456, utcOffset: 7 },
  "마닐라":      { lat: 14.5995, lng: 120.9842, utcOffset: 8 },
  "쿠알라룸푸르":{ lat: 3.1390,  lng: 101.6869, utcOffset: 8 },
  "뭄바이":      { lat: 19.0760, lng: 72.8777,  utcOffset: 5.5 },
  "델리":        { lat: 28.7041, lng: 77.1025,  utcOffset: 5.5 },
  // 유럽
  "런던":        { lat: 51.5074, lng: -0.1278,  utcOffset: 0 },
  "파리":        { lat: 48.8566, lng: 2.3522,   utcOffset: 1 },
  "베를린":      { lat: 52.5200, lng: 13.4050,  utcOffset: 1 },
  "로마":        { lat: 41.9028, lng: 12.4964,  utcOffset: 1 },
  "마드리드":    { lat: 40.4168, lng: -3.7038,  utcOffset: 1 },
  "암스테르담":  { lat: 52.3676, lng: 4.9041,   utcOffset: 1 },
  "취리히":      { lat: 47.3769, lng: 8.5417,   utcOffset: 1 },
  "빈":          { lat: 48.2082, lng: 16.3738,  utcOffset: 1 },
  "모스크바":    { lat: 55.7558, lng: 37.6173,  utcOffset: 3 },
  // 북미
  "뉴욕":        { lat: 40.7128, lng: -74.0060, utcOffset: -5 },
  "LA":          { lat: 34.0522, lng: -118.2437,utcOffset: -8 },
  "시카고":      { lat: 41.8781, lng: -87.6298, utcOffset: -6 },
  "샌프란시스코":{ lat: 37.7749, lng: -122.4194,utcOffset: -8 },
  "시애틀":      { lat: 47.6062, lng: -122.3321,utcOffset: -8 },
  "라스베이거스":{ lat: 36.1699, lng: -115.1398,utcOffset: -8 },
  "달라스":      { lat: 32.7767, lng: -96.7970, utcOffset: -6 },
  "마이애미":    { lat: 25.7617, lng: -80.1918, utcOffset: -5 },
  "워싱턴DC":    { lat: 38.9072, lng: -77.0369, utcOffset: -5 },
  "토론토":      { lat: 43.6532, lng: -79.3832, utcOffset: -5 },
  "밴쿠버":      { lat: 49.2827, lng: -123.1207,utcOffset: -8 },
  // 오세아니아/기타
  "시드니":      { lat: -33.8688,lng: 151.2093, utcOffset: 10 },
  "멜버른":      { lat: -37.8136,lng: 144.9631, utcOffset: 10 },
  "오클랜드":    { lat: -36.8509,lng: 174.7645, utcOffset: 12 },
  "두바이":      { lat: 25.2048, lng: 55.2708,  utcOffset: 4 },
  "상파울루":    { lat: -23.5505,lng: -46.6333, utcOffset: -3 },
};

function getCityCoords(cityName) {
  if (!cityName) return { lat: 37.5665, lng: 126.9780, utcOffset: 9 };
  // 정확 매칭 우선
  if (CITY_COORDS[cityName]) return CITY_COORDS[cityName];
  // 부분 매칭 (소문자)
  const key = cityName.trim().toLowerCase();
  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    if (name.toLowerCase() === key) return coords;
  }
  return { lat: 37.5665, lng: 126.9780, utcOffset: 9 }; // 기본값: 서울
}

/* =========================================================
   출생도시 Select 렌더링
   ========================================================= */
function buildCitySelect() {
  const el = _$("birthCity");
  if (!el || el.tagName !== "SELECT") return;

  const groups = [
    { label: "서울/경기/인천", cities: ["서울","수원","성남","고양","용인","부천","안산","안양","남양주","화성","평택","의정부","파주","김포","광주(경기)","인천"] },
    { label: "강원",           cities: ["춘천","원주","강릉","속초"] },
    { label: "충청",           cities: ["대전","청주","천안","충주"] },
    { label: "전라",           cities: ["광주","전주","목포","여수","순천"] },
    { label: "경상",           cities: ["부산","대구","울산","창원","포항","경주","진주","안동"] },
    { label: "제주",           cities: ["제주","서귀포"] },
    { label: "아시아",         cities: ["도쿄","오사카","베이징","상하이","홍콩","타이베이","싱가포르","방콕","하노이","호치민","자카르타","마닐라","쿠알라룸푸르","뭄바이","델리"] },
    { label: "유럽",           cities: ["런던","파리","베를린","로마","마드리드","암스테르담","취리히","빈","모스크바"] },
    { label: "북미",           cities: ["뉴욕","LA","시카고","샌프란시스코","시애틀","라스베이거스","달라스","마이애미","워싱턴DC","토론토","밴쿠버"] },
    { label: "오세아니아/기타",cities: ["시드니","멜버른","오클랜드","두바이","상파울루"] },
  ];

  el.innerHTML = groups.map(g => `
    <optgroup label="${g.label}">
      ${g.cities.map(c => `<option value="${c}"${c === "서울" ? " selected" : ""}>${c}</option>`).join("")}
    </optgroup>
  `).join("");
}

/* =========================================================
   네이탈 차트 렌더링 (나탈만 표시 — 데이터는 풀 패키지)
   ========================================================= */
function renderAstroNatal(astroData) {
  const panel = _$("astroNatalPanel");
  const grid  = _$("astroNatalGrid");
  if (!panel || !grid) return;

  const PLANET_KR = {
    sun:"☀️ 태양", moon:"🌙 달", mercury:"☿ 수성", venus:"♀ 금성",
    mars:"♂ 화성", jupiter:"♃ 목성", saturn:"♄ 토성",
    uranus:"⛢ 천왕성", neptune:"♆ 해왕성", pluto:"♇ 명왕성"
  };

  const natal = astroData.natal;
  grid.innerHTML = Object.entries(PLANET_KR).map(([key, label]) => {
    const p = natal[key];
    if (!p) return "";
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
  }).join("") + `
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
  panel.style.display = "block";
}

/* =========================================================
   Gemini AI 운세 호출 (사주)
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

  btn.disabled           = true;
  btn.style.opacity      = "0.5";
  loading.style.display  = "block";
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
    if (!res.ok || data.error) throw new Error(data.error || "서버 오류가 발생했습니다.");

    const formatted = (data.result || "")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");

    resultEl.innerHTML = `
      <div style="font-size:13px;color:#cbd3f0;line-height:1.9;border-top:1px solid rgba(255,255,255,.08);padding-top:14px;">${formatted}</div>
      <div style="margin-top:12px;text-align:right;">
        <button onclick="requestGeminiFortune()" style="
          background:rgba(99,102,241,.2);border:1px solid rgba(99,102,241,.4);
          color:#a5b4fc;font-size:11px;border-radius:8px;padding:5px 12px;cursor:pointer;
        ">🔄 다시 보기</button>
      </div>
    `;
    resultEl.style.display = "block";

  } catch (err) {
    errorEl.textContent   = "⚠️ " + (err.message || "운세를 불러오지 못했습니다.");
    errorEl.style.display = "block";
  } finally {
    btn.disabled           = false;
    btn.style.opacity      = "1";
    loading.style.display  = "none";
  }
}

/* =========================================================
   점성술 AI 해석 호출
   계산은 이미 window.AstroResult에 있으므로 Gemini만 호출
   ========================================================= */
async function requestAstroReading() {
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
    // 캐시된 차트가 없으면 지금 계산
    if (!window.AstroResult) {
      if (!window.SajuResult) {
        throw new Error("생년월일과 출생시각을 먼저 입력해주세요.");
      }
      const loadingDiv = loading.querySelector("div");
      if (loadingDiv) loadingDiv.textContent = "🪐 행성 위치를 계산하고 있습니다...";

      const { name, gender, birthDate, birthTime } = window.SajuResult;
      const cityName = getCitySelectValue();
      const { lat, lng, utcOffset } = getCityCoords(cityName);

      const calcRes = await fetch("/api/astro-calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate, birthTime, lat, lng, name, gender, utcOffset })
      });

      const astroData = await calcRes.json();
      if (!calcRes.ok || astroData.error) throw new Error(astroData.error || "천문 계산 오류");
      window.AstroResult = astroData;
      renderAstroNatal(astroData);
    }

    // Gemini 해석
    const loadingDiv = loading.querySelector("div");
    if (loadingDiv) loadingDiv.textContent = "✨ AI가 점성술 리딩 중입니다...";

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
      <div style="font-size:13px;color:#cbd3f0;line-height:1.9;border-top:1px solid rgba(255,255,255,.08);padding-top:14px;">${formatted}</div>
      <div style="margin-top:12px;text-align:right;">
        <button onclick="requestAstroReading()" style="
          background:rgba(124,58,237,.2);border:1px solid rgba(124,58,237,.4);
          color:#c4b5fd;font-size:11px;border-radius:8px;padding:5px 12px;cursor:pointer;
        ">🔄 다시 보기</button>
      </div>
    `;
    resultEl.style.display = "block";

  } catch (err) {
    errorEl.textContent   = "⚠️ " + (err.message || "점성술 리딩을 불러오지 못했습니다.");
    errorEl.style.display = "block";
  } finally {
    btn.disabled           = false;
    btn.style.opacity      = "1";
    loading.style.display  = "none";
  }
}

/* =========================================================
   이벤트 바인딩 및 초기화
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  try {
    setTabs();
    buildCitySelect();

    // birthCity 포함 — 모든 입력 필드 이벤트 바인딩
    ["name", "birthDate", "birthTime", "gender", "birthCity"].forEach(id => {
      const el = _$(id);
      if (!el) return;
      el.addEventListener("input",  () => {
        runAll();
        // birthCity 변경 시 AstroResult 무효화 → 재계산
        if (id === "birthCity") window.AstroResult = null;
      });
      el.addEventListener("change", () => {
        runAll();
        if (id === "birthCity") window.AstroResult = null;
      });
    });

    runAll();
  } catch (e) {
    console.error("앱 초기화 오류:", e);
    try { setAlert("오류 발생: " + (e?.message || e)); } catch (_) {}
  }
});

console.log("✅ app.js 로드 완료");
