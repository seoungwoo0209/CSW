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

    // ── 인생 그래프 렌더링
    if (window.LifeGraphUI) {
      const cityName = getCitySelectValue();
      const { lat, lng, utcOffset } = getCityCoords(cityName);
      window.LifeGraphUI.renderLifeGraph({ birthDate, birthTime, lat, lng, utcOffset });
    }

    // ── 점성술 차트 미리 계산
    scheduleAstroCalc();
}

/* =========================================================
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
   도시명 → 위도/경도/utcOffset
   ========================================================= */
const CITY_COORDS = {
  // ── 서울 자치구
  "서울":         { lat: 37.5665, lng: 126.9780, utcOffset: 9 },
  "종로구":       { lat: 37.5730, lng: 126.9794, utcOffset: 9 },
  "중구(서울)":   { lat: 37.5640, lng: 126.9975, utcOffset: 9 },
  "용산구":       { lat: 37.5384, lng: 126.9654, utcOffset: 9 },
  "성동구":       { lat: 37.5636, lng: 127.0369, utcOffset: 9 },
  "광진구":       { lat: 37.5385, lng: 127.0823, utcOffset: 9 },
  "동대문구":     { lat: 37.5744, lng: 127.0396, utcOffset: 9 },
  "중랑구":       { lat: 37.6063, lng: 127.0927, utcOffset: 9 },
  "성북구":       { lat: 37.5894, lng: 127.0167, utcOffset: 9 },
  "강북구":       { lat: 37.6397, lng: 127.0257, utcOffset: 9 },
  "도봉구":       { lat: 37.6688, lng: 127.0471, utcOffset: 9 },
  "노원구":       { lat: 37.6541, lng: 127.0568, utcOffset: 9 },
  "은평구":       { lat: 37.6176, lng: 126.9227, utcOffset: 9 },
  "서대문구":     { lat: 37.5791, lng: 126.9368, utcOffset: 9 },
  "마포구":       { lat: 37.5663, lng: 126.9014, utcOffset: 9 },
  "양천구":       { lat: 37.5170, lng: 126.8666, utcOffset: 9 },
  "강서구(서울)": { lat: 37.5509, lng: 126.8495, utcOffset: 9 },
  "구로구":       { lat: 37.4954, lng: 126.8874, utcOffset: 9 },
  "금천구":       { lat: 37.4601, lng: 126.9001, utcOffset: 9 },
  "영등포구":     { lat: 37.5264, lng: 126.8963, utcOffset: 9 },
  "동작구":       { lat: 37.5124, lng: 126.9393, utcOffset: 9 },
  "관악구":       { lat: 37.4784, lng: 126.9516, utcOffset: 9 },
  "서초구":       { lat: 37.4837, lng: 127.0324, utcOffset: 9 },
  "강남구":       { lat: 37.5172, lng: 127.0473, utcOffset: 9 },
  "송파구":       { lat: 37.5145, lng: 127.1059, utcOffset: 9 },
  "강동구":       { lat: 37.5301, lng: 127.1238, utcOffset: 9 },
  // ── 경기도
  "수원":         { lat: 37.2636, lng: 127.0286, utcOffset: 9 },
  "성남":         { lat: 37.4449, lng: 127.1388, utcOffset: 9 },
  "고양":         { lat: 37.6584, lng: 126.8320, utcOffset: 9 },
  "용인":         { lat: 37.2411, lng: 127.1775, utcOffset: 9 },
  "부천":         { lat: 37.5034, lng: 126.7660, utcOffset: 9 },
  "안산":         { lat: 37.3219, lng: 126.8309, utcOffset: 9 },
  "안양":         { lat: 37.3943, lng: 126.9568, utcOffset: 9 },
  "남양주":       { lat: 37.6360, lng: 127.2165, utcOffset: 9 },
  "화성":         { lat: 37.1994, lng: 126.8317, utcOffset: 9 },
  "평택":         { lat: 36.9921, lng: 127.1126, utcOffset: 9 },
  "의정부":       { lat: 37.7381, lng: 127.0337, utcOffset: 9 },
  "파주":         { lat: 37.7600, lng: 126.7800, utcOffset: 9 },
  "김포":         { lat: 37.6152, lng: 126.7156, utcOffset: 9 },
  "광주(경기)":   { lat: 37.4296, lng: 127.2550, utcOffset: 9 },
  "시흥":         { lat: 37.3800, lng: 126.8029, utcOffset: 9 },
  "군포":         { lat: 37.3616, lng: 126.9352, utcOffset: 9 },
  "하남":         { lat: 37.5392, lng: 127.2148, utcOffset: 9 },
  "오산":         { lat: 37.1498, lng: 127.0770, utcOffset: 9 },
  "이천":         { lat: 37.2723, lng: 127.4350, utcOffset: 9 },
  "안성":         { lat: 37.0078, lng: 127.2797, utcOffset: 9 },
  "의왕":         { lat: 37.3448, lng: 126.9685, utcOffset: 9 },
  "양주":         { lat: 37.7854, lng: 127.0457, utcOffset: 9 },
  "구리":         { lat: 37.5943, lng: 127.1295, utcOffset: 9 },
  "포천":         { lat: 37.8948, lng: 127.2003, utcOffset: 9 },
  "양평":         { lat: 37.4916, lng: 127.4877, utcOffset: 9 },
  "동두천":       { lat: 37.9035, lng: 127.0607, utcOffset: 9 },
  "과천":         { lat: 37.4292, lng: 126.9877, utcOffset: 9 },
  "가평":         { lat: 37.8315, lng: 127.5107, utcOffset: 9 },
  "연천":         { lat: 38.0962, lng: 127.0749, utcOffset: 9 },
  "여주":         { lat: 37.2982, lng: 127.6375, utcOffset: 9 },
  // ── 인천
  "인천":         { lat: 37.4563, lng: 126.7052, utcOffset: 9 },
  "부평구":       { lat: 37.5069, lng: 126.7218, utcOffset: 9 },
  "남동구":       { lat: 37.4469, lng: 126.7314, utcOffset: 9 },
  "서구(인천)":   { lat: 37.5456, lng: 126.6757, utcOffset: 9 },
  "연수구":       { lat: 37.4100, lng: 126.6789, utcOffset: 9 },
  "미추홀구":     { lat: 37.4640, lng: 126.6505, utcOffset: 9 },
  "계양구":       { lat: 37.5374, lng: 126.7377, utcOffset: 9 },
  "강화":         { lat: 37.7473, lng: 126.4880, utcOffset: 9 },
  // ── 강원도
  "춘천":         { lat: 37.8813, lng: 127.7298, utcOffset: 9 },
  "원주":         { lat: 37.3422, lng: 127.9202, utcOffset: 9 },
  "강릉":         { lat: 37.7519, lng: 128.8761, utcOffset: 9 },
  "동해":         { lat: 37.5247, lng: 129.1144, utcOffset: 9 },
  "태백":         { lat: 37.1641, lng: 128.9856, utcOffset: 9 },
  "속초":         { lat: 38.2070, lng: 128.5919, utcOffset: 9 },
  "삼척":         { lat: 37.4497, lng: 129.1650, utcOffset: 9 },
  "홍천":         { lat: 37.6971, lng: 127.8882, utcOffset: 9 },
  "횡성":         { lat: 37.4916, lng: 127.9842, utcOffset: 9 },
  "영월":         { lat: 37.1836, lng: 128.4614, utcOffset: 9 },
  "평창":         { lat: 37.3703, lng: 128.3908, utcOffset: 9 },
  "정선":         { lat: 37.3798, lng: 128.6600, utcOffset: 9 },
  "철원":         { lat: 38.1463, lng: 127.3136, utcOffset: 9 },
  "화천":         { lat: 38.1063, lng: 127.7080, utcOffset: 9 },
  "양구":         { lat: 38.1062, lng: 127.9898, utcOffset: 9 },
  "인제":         { lat: 38.0693, lng: 128.1706, utcOffset: 9 },
  "고성(강원)":   { lat: 38.3806, lng: 128.4678, utcOffset: 9 },
  "양양":         { lat: 38.0748, lng: 128.6189, utcOffset: 9 },
  // ── 충청북도
  "청주":         { lat: 36.6424, lng: 127.4890, utcOffset: 9 },
  "충주":         { lat: 36.9910, lng: 127.9259, utcOffset: 9 },
  "제천":         { lat: 37.1325, lng: 128.1909, utcOffset: 9 },
  "보은":         { lat: 36.4896, lng: 127.7298, utcOffset: 9 },
  "옥천":         { lat: 36.3062, lng: 127.5706, utcOffset: 9 },
  "영동":         { lat: 36.1749, lng: 127.7762, utcOffset: 9 },
  "증평":         { lat: 36.7854, lng: 127.5816, utcOffset: 9 },
  "진천":         { lat: 36.8554, lng: 127.4356, utcOffset: 9 },
  "괴산":         { lat: 36.8154, lng: 127.7871, utcOffset: 9 },
  "음성":         { lat: 36.9399, lng: 127.6903, utcOffset: 9 },
  "단양":         { lat: 36.9848, lng: 128.3655, utcOffset: 9 },
  // ── 충청남도
  "천안":         { lat: 36.8151, lng: 127.1139, utcOffset: 9 },
  "공주":         { lat: 36.4465, lng: 127.1190, utcOffset: 9 },
  "보령":         { lat: 36.3332, lng: 126.6128, utcOffset: 9 },
  "아산":         { lat: 36.7898, lng: 127.0017, utcOffset: 9 },
  "서산":         { lat: 36.7848, lng: 126.4503, utcOffset: 9 },
  "논산":         { lat: 36.1870, lng: 127.0987, utcOffset: 9 },
  "계룡":         { lat: 36.2742, lng: 127.2491, utcOffset: 9 },
  "당진":         { lat: 36.8895, lng: 126.6458, utcOffset: 9 },
  "금산":         { lat: 36.1087, lng: 127.4882, utcOffset: 9 },
  "부여":         { lat: 36.2754, lng: 126.9099, utcOffset: 9 },
  "서천":         { lat: 36.0779, lng: 126.6913, utcOffset: 9 },
  "청양":         { lat: 36.4594, lng: 126.8026, utcOffset: 9 },
  "홍성":         { lat: 36.6012, lng: 126.6606, utcOffset: 9 },
  "예산":         { lat: 36.6804, lng: 126.8494, utcOffset: 9 },
  "태안":         { lat: 36.7453, lng: 126.2979, utcOffset: 9 },
  // ── 대전
  "대전":         { lat: 36.3504, lng: 127.3845, utcOffset: 9 },
  "유성구":       { lat: 36.3624, lng: 127.3566, utcOffset: 9 },
  "서구(대전)":   { lat: 36.3550, lng: 127.3830, utcOffset: 9 },
  // ── 세종
  "세종":         { lat: 36.4801, lng: 127.2890, utcOffset: 9 },
  // ── 전라북도
  "전주":         { lat: 35.8242, lng: 127.1480, utcOffset: 9 },
  "군산":         { lat: 35.9677, lng: 126.7368, utcOffset: 9 },
  "익산":         { lat: 35.9483, lng: 126.9577, utcOffset: 9 },
  "정읍":         { lat: 35.5699, lng: 126.8556, utcOffset: 9 },
  "남원":         { lat: 35.4162, lng: 127.3903, utcOffset: 9 },
  "김제":         { lat: 35.8033, lng: 126.8806, utcOffset: 9 },
  "완주":         { lat: 35.9049, lng: 127.1619, utcOffset: 9 },
  "진안":         { lat: 35.7913, lng: 127.4247, utcOffset: 9 },
  "무주":         { lat: 36.0073, lng: 127.6614, utcOffset: 9 },
  "장수":         { lat: 35.6471, lng: 127.5209, utcOffset: 9 },
  "임실":         { lat: 35.6175, lng: 127.2891, utcOffset: 9 },
  "순창":         { lat: 35.3745, lng: 127.1378, utcOffset: 9 },
  "고창":         { lat: 35.4356, lng: 126.7022, utcOffset: 9 },
  "부안":         { lat: 35.7318, lng: 126.7332, utcOffset: 9 },
  // ── 광주
  "광주":         { lat: 35.1595, lng: 126.8526, utcOffset: 9 },
  "광산구":       { lat: 35.1396, lng: 126.7936, utcOffset: 9 },
  "북구(광주)":   { lat: 35.1745, lng: 126.9119, utcOffset: 9 },
  // ── 전라남도
  "목포":         { lat: 34.8118, lng: 126.3922, utcOffset: 9 },
  "여수":         { lat: 34.7604, lng: 127.6622, utcOffset: 9 },
  "순천":         { lat: 34.9506, lng: 127.4872, utcOffset: 9 },
  "나주":         { lat: 35.0160, lng: 126.7108, utcOffset: 9 },
  "광양":         { lat: 34.9407, lng: 127.6956, utcOffset: 9 },
  "담양":         { lat: 35.3212, lng: 126.9885, utcOffset: 9 },
  "곡성":         { lat: 35.2818, lng: 127.2920, utcOffset: 9 },
  "구례":         { lat: 35.2026, lng: 127.4625, utcOffset: 9 },
  "고흥":         { lat: 34.6076, lng: 127.2774, utcOffset: 9 },
  "보성":         { lat: 34.7714, lng: 127.0802, utcOffset: 9 },
  "화순":         { lat: 35.0643, lng: 126.9869, utcOffset: 9 },
  "장흥":         { lat: 34.6815, lng: 126.9072, utcOffset: 9 },
  "강진":         { lat: 34.6424, lng: 126.7667, utcOffset: 9 },
  "해남":         { lat: 34.5735, lng: 126.5994, utcOffset: 9 },
  "영암":         { lat: 34.8002, lng: 126.6967, utcOffset: 9 },
  "무안":         { lat: 34.9904, lng: 126.4817, utcOffset: 9 },
  "함평":         { lat: 35.0647, lng: 126.5178, utcOffset: 9 },
  "영광":         { lat: 35.2771, lng: 126.5119, utcOffset: 9 },
  "장성":         { lat: 35.3020, lng: 126.7858, utcOffset: 9 },
  "완도":         { lat: 34.3108, lng: 126.7551, utcOffset: 9 },
  "진도":         { lat: 34.4867, lng: 126.2636, utcOffset: 9 },
  "신안":         { lat: 34.8280, lng: 126.1070, utcOffset: 9 },
  // ── 경상북도
  "포항":         { lat: 36.0190, lng: 129.3435, utcOffset: 9 },
  "경주":         { lat: 35.8562, lng: 129.2247, utcOffset: 9 },
  "김천":         { lat: 36.1398, lng: 128.1136, utcOffset: 9 },
  "안동":         { lat: 36.5684, lng: 128.7294, utcOffset: 9 },
  "구미":         { lat: 36.1194, lng: 128.3444, utcOffset: 9 },
  "영주":         { lat: 36.8059, lng: 128.6236, utcOffset: 9 },
  "영천":         { lat: 35.9737, lng: 128.9381, utcOffset: 9 },
  "상주":         { lat: 36.4109, lng: 128.1591, utcOffset: 9 },
  "문경":         { lat: 36.5860, lng: 128.1862, utcOffset: 9 },
  "경산":         { lat: 35.8252, lng: 128.7414, utcOffset: 9 },
  "의성":         { lat: 36.3527, lng: 128.6970, utcOffset: 9 },
  "청송":         { lat: 36.4356, lng: 129.0570, utcOffset: 9 },
  "영양":         { lat: 36.6672, lng: 129.1128, utcOffset: 9 },
  "영덕":         { lat: 36.4153, lng: 129.3652, utcOffset: 9 },
  "청도":         { lat: 35.6477, lng: 128.7338, utcOffset: 9 },
  "고령":         { lat: 35.7277, lng: 128.2635, utcOffset: 9 },
  "성주":         { lat: 35.9196, lng: 128.2829, utcOffset: 9 },
  "칠곡":         { lat: 35.9960, lng: 128.4016, utcOffset: 9 },
  "예천":         { lat: 36.6576, lng: 128.4513, utcOffset: 9 },
  "봉화":         { lat: 36.8933, lng: 128.7327, utcOffset: 9 },
  "울진":         { lat: 36.9933, lng: 129.4001, utcOffset: 9 },
  "울릉":         { lat: 37.4840, lng: 130.9057, utcOffset: 9 },
  // ── 대구
  "대구":         { lat: 35.8714, lng: 128.6014, utcOffset: 9 },
  "달서구":       { lat: 35.8298, lng: 128.5326, utcOffset: 9 },
  "북구(대구)":   { lat: 35.8860, lng: 128.5824, utcOffset: 9 },
  "수성구":       { lat: 35.8581, lng: 128.6308, utcOffset: 9 },
  "동구(대구)":   { lat: 35.8868, lng: 128.6354, utcOffset: 9 },
  "달성":         { lat: 35.7746, lng: 128.4313, utcOffset: 9 },
  // ── 경상남도
  "창원":         { lat: 35.2280, lng: 128.6811, utcOffset: 9 },
  "진주":         { lat: 35.1799, lng: 128.1076, utcOffset: 9 },
  "통영":         { lat: 34.8544, lng: 128.4332, utcOffset: 9 },
  "사천":         { lat: 35.0039, lng: 128.0642, utcOffset: 9 },
  "김해":         { lat: 35.2284, lng: 128.8891, utcOffset: 9 },
  "밀양":         { lat: 35.5036, lng: 128.7463, utcOffset: 9 },
  "거제":         { lat: 34.8804, lng: 128.6211, utcOffset: 9 },
  "양산":         { lat: 35.3350, lng: 129.0370, utcOffset: 9 },
  "의령":         { lat: 35.3222, lng: 128.2614, utcOffset: 9 },
  "함안":         { lat: 35.2726, lng: 128.4063, utcOffset: 9 },
  "창녕":         { lat: 35.5444, lng: 128.4922, utcOffset: 9 },
  "고성(경남)":   { lat: 34.9739, lng: 128.3225, utcOffset: 9 },
  "남해":         { lat: 34.8374, lng: 127.8924, utcOffset: 9 },
  "하동":         { lat: 35.0671, lng: 127.7516, utcOffset: 9 },
  "산청":         { lat: 35.4154, lng: 127.8742, utcOffset: 9 },
  "함양":         { lat: 35.5198, lng: 127.7256, utcOffset: 9 },
  "거창":         { lat: 35.6872, lng: 127.9094, utcOffset: 9 },
  "합천":         { lat: 35.5665, lng: 128.1653, utcOffset: 9 },
  // ── 울산
  "울산":         { lat: 35.5384, lng: 129.3114, utcOffset: 9 },
  "울주":         { lat: 35.5219, lng: 129.2430, utcOffset: 9 },
  // ── 부산
  "부산":         { lat: 35.1796, lng: 129.0756, utcOffset: 9 },
  "해운대구":     { lat: 35.1631, lng: 129.1638, utcOffset: 9 },
  "사상구":       { lat: 35.1499, lng: 128.9932, utcOffset: 9 },
  "금정구":       { lat: 35.2427, lng: 129.0919, utcOffset: 9 },
  "북구(부산)":   { lat: 35.1978, lng: 128.9957, utcOffset: 9 },
  "강서구(부산)": { lat: 35.2120, lng: 128.9810, utcOffset: 9 },
  "기장":         { lat: 35.2447, lng: 129.2224, utcOffset: 9 },
  // ── 제주
  "제주":         { lat: 33.4996, lng: 126.5312, utcOffset: 9 },
  "서귀포":       { lat: 33.2541, lng: 126.5600, utcOffset: 9 },
  // ── 아시아
  "도쿄":         { lat: 35.6762, lng: 139.6503, utcOffset: 9 },
  "오사카":       { lat: 34.6937, lng: 135.5023, utcOffset: 9 },
  "베이징":       { lat: 39.9042, lng: 116.4074, utcOffset: 8 },
  "상하이":       { lat: 31.2304, lng: 121.4737, utcOffset: 8 },
  "홍콩":         { lat: 22.3193, lng: 114.1694, utcOffset: 8 },
  "타이베이":     { lat: 25.0330, lng: 121.5654, utcOffset: 8 },
  "싱가포르":     { lat:  1.3521, lng: 103.8198, utcOffset: 8 },
  "방콕":         { lat: 13.7563, lng: 100.5018, utcOffset: 7 },
  "하노이":       { lat: 21.0285, lng: 105.8542, utcOffset: 7 },
  "호치민":       { lat: 10.8231, lng: 106.6297, utcOffset: 7 },
  "자카르타":     { lat: -6.2088, lng: 106.8456, utcOffset: 7 },
  "마닐라":       { lat: 14.5995, lng: 120.9842, utcOffset: 8 },
  "쿠알라룸푸르": { lat:  3.1390, lng: 101.6869, utcOffset: 8 },
  "뭄바이":       { lat: 19.0760, lng:  72.8777, utcOffset: 5.5 },
  "델리":         { lat: 28.7041, lng:  77.1025, utcOffset: 5.5 },
  // ── 유럽
  "런던":         { lat: 51.5074, lng:  -0.1278, utcOffset: 0 },
  "파리":         { lat: 48.8566, lng:   2.3522, utcOffset: 1 },
  "베를린":       { lat: 52.5200, lng:  13.4050, utcOffset: 1 },
  "로마":         { lat: 41.9028, lng:  12.4964, utcOffset: 1 },
  "마드리드":     { lat: 40.4168, lng:  -3.7038, utcOffset: 1 },
  "암스테르담":   { lat: 52.3676, lng:   4.9041, utcOffset: 1 },
  "취리히":       { lat: 47.3769, lng:   8.5417, utcOffset: 1 },
  "빈":           { lat: 48.2082, lng:  16.3738, utcOffset: 1 },
  "모스크바":     { lat: 55.7558, lng:  37.6173, utcOffset: 3 },
  // ── 북미
  "뉴욕":         { lat: 40.7128, lng: -74.0060, utcOffset: -5 },
  "LA":           { lat: 34.0522, lng:-118.2437, utcOffset: -8 },
  "시카고":       { lat: 41.8781, lng: -87.6298, utcOffset: -6 },
  "샌프란시스코": { lat: 37.7749, lng:-122.4194, utcOffset: -8 },
  "시애틀":       { lat: 47.6062, lng:-122.3321, utcOffset: -8 },
  "라스베이거스": { lat: 36.1699, lng:-115.1398, utcOffset: -8 },
  "달라스":       { lat: 32.7767, lng: -96.7970, utcOffset: -6 },
  "마이애미":     { lat: 25.7617, lng: -80.1918, utcOffset: -5 },
  "워싱턴DC":     { lat: 38.9072, lng: -77.0369, utcOffset: -5 },
  "토론토":       { lat: 43.6532, lng: -79.3832, utcOffset: -5 },
  "밴쿠버":       { lat: 49.2827, lng:-123.1207, utcOffset: -8 },
  // ── 오세아니아/기타
  "시드니":       { lat:-33.8688, lng: 151.2093, utcOffset: 10 },
  "멜버른":       { lat:-37.8136, lng: 144.9631, utcOffset: 10 },
  "오클랜드":     { lat:-36.8509, lng: 174.7645, utcOffset: 12 },
  "두바이":       { lat: 25.2048, lng:  55.2708, utcOffset:  4 },
  "상파울루":     { lat:-23.5505, lng: -46.6333, utcOffset: -3 },
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
function filterCityList(val) {
  const dropdown = _$('cityDropdown');
  if (!dropdown) return;
  const q = val.trim().toLowerCase();
  const matched = Object.keys(CITY_COORDS).filter(c => c.toLowerCase().includes(q)).slice(0, 30);
  if (matched.length === 0 || q === '') { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = matched.map(c =>
    '<div onclick="selectCity(\'' + c + '\')" style="padding:8px 12px;font-size:13px;color:#e2e8f0;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);" onmouseover="this.style.background=\'rgba(255,255,255,.08)\'" onmouseout="this.style.background=\'\'">' + c + '</div>'
  ).join('');
  dropdown.style.display = 'block';
}
function showCityList() {
  const input = _$('birthCityInput');
  if (input) filterCityList(input.value);
}
function hideCityList() {
  const d = _$('cityDropdown');
  if (d) d.style.display = 'none';
}
function selectCity(cityName) {
  const input  = _$('birthCityInput');
  const hidden = _$('birthCity');
  if (input)  input.value  = cityName;
  if (hidden) { hidden.value = cityName; window.AstroResult = null; runAll(); }
  hideCityList();
}
function getCitySelectValue() {
  const el = _$('birthCity');
  return el ? el.value || '서울' : '서울';
}
function buildCitySelect() {
  const input = _$('birthCityInput');
  if (input) input.value = '서울';
  const hidden = _$('birthCity');
  if (hidden) hidden.value = '서울';
  // select 엘리먼트는 현재 HTML에 없으므로 더 이상 조작하지 않음
}

/* =========================================================
   에스펙트 아코디언 (클릭하면 펼쳐지는 형태)
   aspects: [{ point1, point2, aspect, symbol, orb, applying }]
   ========================================================= */
function renderAspectAccordion(aspects, title, icon, accentColor) {
  const list = aspects || [];
  const itemsHtml = list.length > 0
    ? list.map(a => `
        <div style="
          display:grid;grid-template-columns:1fr auto 1fr auto;gap:8px;align-items:center;
          background:rgba(255,255,255,.04);border-radius:6px;
          padding:6px 10px;font-size:11px;color:#94a3b8;
          border-left:2px solid ${accentColor}66;
        ">
          <span style="color:${accentColor};">${a.point1}</span>
          <span style="color:#64748b;white-space:nowrap;">${a.symbol} ${a.aspect}</span>
          <span style="color:#e2e8f0;text-align:right;">${a.point2}</span>
          <span style="color:#475569;white-space:nowrap;">orb ${a.orb}°</span>
        </div>
      `).join('')
    : `<div style="color:#475569;font-size:12px;">에스펙트 없음</div>`;

  return `
    <details style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid ${accentColor}33;border-radius:16px;padding:16px 20px;margin-top:12px;
    ">
      <summary style="cursor:pointer;font-size:12px;color:${accentColor};letter-spacing:2px;">
        ${icon} ${title} (${list.length}개) — 클릭하여 펼치기
      </summary>
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:12px;">
        ${itemsHtml}
      </div>
    </details>
  `;
}

/* =========================================================
   네이탈 차트 렌더링 (나탈만 표시 — 데이터는 풀 패키지)
   ========================================================= */
function renderAstroNatal(astroData) {
  const panel = _$("astroNatalPanel");
  const grid  = _$("astroNatalGrid");
  if (!panel || !grid) return;

  // 중복 렌더링 방지 — grid 초기화
  grid.innerHTML = "";

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

  // 북노드/릴리스 표시
  if (astroData.nodes) {
    const { north, south } = astroData.nodes;
    grid.innerHTML += `
      <div style="
        background:rgba(251,191,36,.08);border-radius:8px;padding:8px 10px;
        border:1px solid rgba(251,191,36,.3);
      ">
        <div style="color:#fcd34d;font-size:11px;margin-bottom:3px;">☊ 북노드 (카르마 방향)</div>
        <div style="color:#e2e8f0;font-size:12px;font-weight:600;">${north.sign}</div>
        <div style="color:#94a3b8;font-size:11px;">${north.degree}°${north.minute}'${north.house != null ? ' · '+north.house+'하우스' : ''}</div>
      </div>
      <div style="
        background:rgba(148,163,184,.08);border-radius:8px;padding:8px 10px;
        border:1px solid rgba(148,163,184,.25);
      ">
        <div style="color:#94a3b8;font-size:11px;margin-bottom:3px;">☋ 릴리스 (전생 패턴)</div>
        <div style="color:#e2e8f0;font-size:12px;font-weight:600;">${south.sign}</div>
        <div style="color:#94a3b8;font-size:11px;">${south.degree}°${south.minute}'${south.house != null ? ' · '+south.house+'하우스' : ''}</div>
      </div>
    `;
  }

  panel.style.display = "block";

  // 세컨더리 프로그레션 차트도 함께 렌더링
  renderAstroProgression(astroData);

  // 나탈-나탈 에스펙트 (행성10 + ASC/MC + 북노드/릴리스 전체) — 아코디언
  // (renderAstroProgression 이후에 삽입해야 나탈 패널 바로 아래에 위치함)
  {
    const existingNatalAspectPanel = document.getElementById('astroNatalAspectPanel');
    if (existingNatalAspectPanel) existingNatalAspectPanel.remove();

    const aspectPanel = document.createElement('div');
    aspectPanel.id = 'astroNatalAspectPanel';
    aspectPanel.innerHTML = renderAspectAccordion(
      astroData.natalAspectsFull, '나탈-나탈 에스펙트', '🔯', '#c4b5fd'
    );
    panel.after(aspectPanel);
  }
}

/* =========================================================
   세컨더리 프로그레션 차트 렌더링
   ========================================================= */
function calcMidpoint(lonA, lonB) {
  if (lonA == null || lonB == null) return '-';
  const SIGNS = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
  const a = ((lonA % 360) + 360) % 360;
  const b = ((lonB % 360) + 360) % 360;
  let diff = b - a;
  if (diff > 180)  diff -= 360;
  if (diff < -180) diff += 360;
  const mid = ((a + diff / 2) + 360) % 360;
  const signIdx = Math.floor(mid / 30);
  const deg = mid % 30;
  const d = Math.floor(deg);
  const m = Math.floor((deg - d) * 60);
  return `${SIGNS[signIdx]} ${d}°${String(m).padStart(2,'0')}'`;
}

function renderAstroProgression(astroData) {
  const prog = astroData.progression;
  if (!prog) return;

  // 기존 패널 있으면 제거 후 재생성
  const existing = document.getElementById("astroProgPanel");
  if (existing) existing.remove();

  const PLANET_KR = {
    sun:"☀️ 태양", moon:"🌙 달", mercury:"☿ 수성", venus:"♀ 금성",
    mars:"♂ 화성", jupiter:"♃ 목성", saturn:"♄ 토성",
    uranus:"⛢ 천왕성", neptune:"♆ 해왕성", pluto:"♇ 명왕성"
  };

  const natal = astroData.natal;

  // 나탈 vs 프로그레션 비교 그리드
  const rowsHtml = Object.entries(PLANET_KR).map(([key, label]) => {
    const n = natal[key];
    const p = prog.planets[key];
    if (!n || !p) return "";

    // 사인이 바뀌었으면 강조
    const changed = n.signIndex !== p.signIndex;
    return `
      <div style="
        display:grid;grid-template-columns:1fr 1fr 1fr;
        gap:6px;align-items:center;
        background:${changed ? 'rgba(165,180,252,.08)' : 'rgba(255,255,255,.03)'};
        border:1px solid ${changed ? 'rgba(165,180,252,.25)' : 'rgba(255,255,255,.06)'};
        border-radius:8px;padding:7px 10px;margin-bottom:4px;
      ">
        <div style="color:#c4b5fd;font-size:11px;">${label}</div>
        <div>
          <div style="color:#94a3b8;font-size:11px;">${n.sign}</div>
          <div style="color:#64748b;font-size:10px;">${n.degree}°${n.minute}' · ${n.house}H</div>
        </div>
        <div>
          <div style="color:${changed ? '#a5b4fc' : '#e2e8f0'};font-size:11px;font-weight:${changed ? 700 : 400};">
            ${p.sign}${changed ? ' ✦' : ''}
          </div>
          <div style="color:#64748b;font-size:10px;">${p.degree}°${p.minute}' · ${p.house}H</div>
        </div>
      </div>
    `;
  }).join("");

  const panel = document.createElement("div");
  panel.id = "astroProgPanel";
  panel.style.cssText = "margin-top:12px;";
  panel.innerHTML = `
    <div style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(165,180,252,.2);border-radius:16px;padding:20px;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-size:12px;color:#a5b4fc;letter-spacing:2px;">🔭 세컨더리 프로그레션</div>
        <div style="font-size:11px;color:#475569;">
          기준일 ${prog.meta.progDate} · 나이 ${prog.meta.ageYears}세
        </div>
      </div>

      <!-- 헤더 -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px;padding:0 10px;">
        <div style="font-size:10px;color:#475569;">행성</div>
        <div style="font-size:10px;color:#475569;">나탈</div>
        <div style="font-size:10px;color:#a5b4fc;">프로그레션 ✦변화</div>
      </div>

      <!-- 행성 비교 -->
      ${rowsHtml}

      <!-- ASC / MC / 북노드 / 릴리스 비교 행 -->
      ${(() => {
        const nAsc  = astroData.angles?.asc;
        const nMc   = astroData.angles?.mc;
        const pAsc  = prog.angles?.asc;
        const pMc   = prog.angles?.mc;
        const north = astroData.nodes?.north;
        const south = astroData.nodes?.south;
        const ascChanged = nAsc && pAsc && nAsc.signIndex !== pAsc.signIndex;
        const mcChanged  = nMc  && pMc  && nMc.signIndex  !== pMc.signIndex;
        function row(icon, label, nObj, pObj, changed, color) {
          const nText = nObj ? nObj.sign : '-';
          const nSub  = nObj ? `${nObj.degree}°${nObj.minute}'` : '';
          const nH    = nObj?.house != null ? ` · ${nObj.house}H` : '';
          const pText = pObj ? `${pObj.sign}${changed ? ' ✦' : ''}` : '-';
          const pSub  = pObj ? `${pObj.degree}°${pObj.minute}'` : '';
          const pH    = pObj?.house != null ? ` · ${pObj.house}H` : '';
          return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;align-items:center;background:${changed?'rgba(165,180,252,.08)':'rgba(255,255,255,.03)'};border:1px solid ${changed?'rgba(165,180,252,.25)':'rgba(255,255,255,.06)'};border-radius:8px;padding:7px 10px;margin-bottom:4px;">
            <div style="color:${color};font-size:11px;">${icon} ${label}</div>
            <div><div style="color:#94a3b8;font-size:11px;">${nText}</div><div style="color:#64748b;font-size:10px;">${nSub}${nH}</div></div>
            <div><div style="color:${changed?'#a5b4fc':'#e2e8f0'};font-size:11px;font-weight:${changed?700:400};">${pText}</div><div style="color:#64748b;font-size:10px;">${pSub}${pH}</div></div>
          </div>`;
        }
        const pNorth = prog.nodes?.north;
        const pSouth = prog.nodes?.south;
        const northChanged = north && pNorth && north.signIndex !== pNorth.signIndex;
        const southChanged = south && pSouth && south.signIndex !== pSouth.signIndex;
        return row('↑','ASC',nAsc,pAsc,ascChanged,'#a78bfa')
              +row('⊕','MC',nMc,pMc,mcChanged,'#a78bfa')
              +row('☊','북노드',north,pNorth,northChanged,'#fcd34d')
              +row('☋','릴리스',south,pSouth,southChanged,'#94a3b8');
      })()}

      <!-- 미드포인트 -->
      <div style="margin-top:12px;">
        <div style="font-size:11px;color:#64748b;letter-spacing:1px;margin-bottom:8px;">미드 포인트</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px 12px;">
            <div style="font-size:10px;color:#94a3b8;letter-spacing:1px;margin-bottom:8px;">네이탈 행성</div>
            <div style="margin-bottom:6px;">
              <div style="font-size:10px;color:#64748b;margin-bottom:2px;">ASC/MC</div>
              <div style="font-size:12px;color:#e2e8f0;font-weight:600;">${calcMidpoint(astroData.angles?.asc?.longitude, astroData.angles?.mc?.longitude)}</div>
            </div>
            <div>
              <div style="font-size:10px;color:#64748b;margin-bottom:2px;">태양/달</div>
              <div style="font-size:12px;color:#e2e8f0;font-weight:600;">${calcMidpoint(natal.sun?.longitude, natal.moon?.longitude)}</div>
            </div>
          </div>
          <div style="background:rgba(167,139,250,.06);border:1px solid rgba(167,139,250,.18);border-radius:8px;padding:10px 12px;">
            <div style="font-size:10px;color:#a78bfa;letter-spacing:1px;margin-bottom:8px;">프로그레션</div>
            <div style="margin-bottom:6px;">
              <div style="font-size:10px;color:#64748b;margin-bottom:2px;">ASC/MC</div>
              <div style="font-size:12px;color:#e2e8f0;font-weight:600;">${calcMidpoint(prog.angles?.asc?.longitude, prog.angles?.mc?.longitude)}</div>
            </div>
            <div>
              <div style="font-size:10px;color:#64748b;margin-bottom:2px;">태양/달</div>
              <div style="font-size:12px;color:#e2e8f0;font-weight:600;">${calcMidpoint(prog.planets?.sun?.longitude, prog.planets?.moon?.longitude)}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 에스펙트 -->
      ${renderAspectAccordion(prog.aspectsFull, '나탈-프로그레션 에스펙트', '🔭', '#a5b4fc')}
    </div>
  `;

  // 나탈 패널 바로 아래에 삽입
  const natalPanel = document.getElementById("astroNatalPanel");
  if (natalPanel) {
    natalPanel.after(panel);
  }

  // 타임라인 렌더링
  renderProgTimeline(astroData);
  renderProgMoonTimeline(astroData);
  renderSaturnReturnPanel(astroData);
  renderSolarReturnPanel(astroData);
}

/* =========================================================
   프로그레션 태양 타임라인 계산
   A방식: 프로그레션 태양 위치를 나탈 하우스 커스프에 올려서 계산
   ========================================================= */
function calcProgTimeline(astroData) {
  const meta   = astroData.meta;
  const houses = astroData.houses; // 나탈 하우스 커스프 12개

  if (!meta?.birthDate || !meta?.birthTime || !houses) return null;

  const [yyyy, mm, dd] = meta.birthDate.split('-').map(Number);
  const [hh, mi]       = meta.birthTime.split(':').map(Number);
  const offsetHours    = meta.utcOffset ?? 9;
  const utcH           = hh + mi / 60 - offsetHours;
  const birthUTC       = new Date(Date.UTC(yyyy, mm - 1, dd, Math.floor(utcH), Math.round((utcH % 1) * 60)));

  const bY  = birthUTC.getUTCFullYear();
  const bM  = birthUTC.getUTCMonth() + 1;
  const bD  = birthUTC.getUTCDate();
  const bHr = birthUTC.getUTCHours() + birthUTC.getUTCMinutes() / 60;

  // 율리우스일
  function calcJD(y, m, d, h = 0) {
    if (m <= 2) { y--; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + h / 24 + B - 1524.5;
  }
  function norm360(a) { return ((a % 360) + 360) % 360; }
  function rad(d)     { return d * Math.PI / 180; }

  // VSOP87 축약 태양 황경
  function calcSun(T) {
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    const M  = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    const mr = rad(M);
    const C  = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(mr)
             + (0.019993 - 0.000101 * T) * Math.sin(2 * mr)
             + 0.000289 * Math.sin(3 * mr);
    return norm360(L0 + C);
  }

  // 나탈 하우스 커스프 (절대 경도 배열)
  const natalCusps = houses.map(h => h.longitude);

  function getHouse(lon) {
    const n = norm360(lon);
    for (let i = 0; i < 12; i++) {
      const s = natalCusps[i], e = natalCusps[(i + 1) % 12];
      if (s > e) { if (n >= s || n < e) return i + 1; }
      else       { if (n >= s && n < e) return i + 1; }
    }
    return 12;
  }

  const SIGNS = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                 '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];

  const natalJD   = calcJD(bY, bM, bD, bHr);
  const birthYear = bY;

  // 현재 나이
  const now        = new Date();
  const currentAge = (now - birthUTC) / (365.25 * 86400000);

  // 0~90세 0.1년 단위 스캔 → 사인/하우스 변화 시점 기록
  const chapters = [];
  let prevSign = -1, prevHouse = -1;

  for (let age = 0; age <= 90; age = Math.round((age + 0.1) * 10) / 10) {
    const progJD  = natalJD + age;
    const T       = (progJD - 2451545.0) / 36525.0;
    const sunLon  = calcSun(T);
    const signIdx = Math.floor(sunLon / 30);
    const house   = getHouse(sunLon);

    if (signIdx !== prevSign || house !== prevHouse) {
      // 이분법으로 정확한 시점 탐색
      let lo = Math.max(0, age - 0.1), hi = age;
      for (let i = 0; i < 60; i++) {
        const mid   = (lo + hi) / 2;
        const pT    = (natalJD + mid - 2451545.0) / 36525.0;
        const pLon  = calcSun(pT);
        const pSign = Math.floor(pLon / 30);
        const pH    = getHouse(pLon);
        if (pSign === signIdx && pH === house) hi = mid;
        else lo = mid;
        if (hi - lo < 0.001) break;
      }
      const exactAge  = hi; // hi는 항상 새 사인/하우스(signIdx, house) 쪽 경계 — degInSign과 sign 라벨의 일치를 보장
      const exactYear = Math.floor(birthYear + exactAge);
      const sunAtAge  = calcSun((natalJD + exactAge - 2451545.0) / 36525.0);
      const degInSign = sunAtAge % 30;

      if (chapters.length > 0) {
        chapters[chapters.length - 1].endAge  = Math.floor(exactAge);
        chapters[chapters.length - 1].endYear = exactYear;
      }

      chapters.push({
        startAge:  Math.floor(exactAge),
        startYear: exactYear,
        endAge:    90,
        endYear:   birthYear + 90,
        sign:      SIGNS[signIdx],
        signIndex: signIdx,
        house,
        degree:    Math.floor(degInSign),
        minute:    Math.floor((degInSign % 1) * 60),
        isCurrent: false,
      });

      prevSign  = signIdx;
      prevHouse = house;
    }
  }

  // 현재 챕터 표시
  chapters.forEach(c => {
    c.isCurrent = currentAge >= c.startAge && currentAge < c.endAge;
  });

  return { chapters, birthYear, currentAge: Math.floor(currentAge) };
}

/* =========================================================
   프로그레션 타임라인 UI 렌더링
   ========================================================= */
function renderProgTimeline(astroData) {
  // 기존 패널 제거
  const existing = document.getElementById("astroTimelinePanel");
  if (existing) existing.remove();

  const data = calcProgTimeline(astroData);
  if (!data) return;

  const { chapters, birthYear, currentAge } = data;

  const HOUSE_THEME = {
    1:  { label:"자아·외모·시작",     color:"#f87171" },
    2:  { label:"재물·가치관",        color:"#fb923c" },
    3:  { label:"지식·소통·학습",     color:"#facc15" },
    4:  { label:"기반·가정·정체성",   color:"#4ade80" },
    5:  { label:"창작·표현·즐거움",   color:"#34d399" },
    6:  { label:"건강·일과·봉사",     color:"#22d3ee" },
    7:  { label:"관계·파트너십",      color:"#60a5fa" },
    8:  { label:"변환·심층·공유",     color:"#818cf8" },
    9:  { label:"탐구·철학·확장",     color:"#a78bfa" },
    10: { label:"사회·직업·명예",     color:"#c084fc" },
    11: { label:"이상·공동체·미래",   color:"#e879f9" },
    12: { label:"은둔·무의식·영성",   color:"#94a3b8" },
  };

  const rowsHtml = chapters.map((c, i) => {
    const theme    = HOUSE_THEME[c.house] || { label:"", color:"#94a3b8" };
    const isCur    = c.isCurrent;
    const duration = c.endAge - c.startAge;
    const chapterNum = i + 1;
    return `
      <tr style="
        background:${isCur ? 'rgba(165,180,252,.12)' : 'transparent'};
        border-bottom:1px solid rgba(255,255,255,.05);
      ">
        <td style="padding:10px 12px;font-size:12px;color:${isCur ? '#a5b4fc' : '#64748b'};font-weight:${isCur ? 700 : 400};white-space:nowrap;">
          제${chapterNum}장${isCur ? ' <span style="font-size:10px;background:rgba(165,180,252,.25);border-radius:4px;padding:1px 5px;">현재</span>' : ''}
        </td>
        <td style="padding:10px 12px;font-size:12px;color:${isCur ? '#e2e8f0' : '#94a3b8'};white-space:nowrap;">
          ${c.startAge}~${c.endAge < 90 ? c.endAge : c.endAge + ''}세
        </td>
        <td style="padding:10px 12px;font-size:12px;color:${isCur ? '#e2e8f0' : '#94a3b8'};white-space:nowrap;">
          ${c.startYear}~${c.endYear}
        </td>
        <td style="padding:10px 12px;font-size:12px;white-space:nowrap;">
          <span style="color:${theme.color};font-weight:600;">${c.sign} ${c.degree}°${c.minute}'</span>
          <span style="color:#475569;"> · </span>
          <span style="color:${isCur ? '#a5b4fc' : '#64748b'};">${c.house}H</span>
        </td>
        <td style="padding:10px 12px;font-size:11px;color:#64748b;">
          ${theme.label}
        </td>
      </tr>
    `;
  }).join('');

  const panel = document.createElement('div');
  panel.id = 'astroTimelinePanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <div style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(165,180,252,.2);border-radius:16px;padding:20px;
    ">
      <div style="font-size:12px;color:#a5b4fc;letter-spacing:2px;margin-bottom:4px;">🗺️ 프로그레션 태양 타임라인</div>
      <div style="font-size:11px;color:#475569;margin-bottom:16px;">나탈 하우스 기준 · A방식</div>

      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:420px;">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,.1);">
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;">챕터</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;">나이</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;">연도</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;">위치</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;">핵심 주제</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>

      <div style="margin-top:12px;font-size:10px;color:#334155;text-align:right;">
        프로그레스드 태양 1년 ≈ 1° 이동 · Placidus 나탈 하우스 고정
      </div>
    </div>
  `;

  // 프로그레션 패널 바로 아래 삽입
  const progPanel = document.getElementById("astroProgPanel");
  if (progPanel) progPanel.after(panel);
}

/* =========================================================
   프로그레션 타임라인 공통 빌더 (사인/하우스 이동 시점 스캔)
   lonFn(T): 율리우스세기 T → 황경(0~360)
   ========================================================= */
function buildProgressionTimeline(astroData, lonFn, stepYears = 0.1) {
  const meta   = astroData.meta;
  const houses = astroData.houses; // 나탈 하우스 커스프 12개

  if (!meta?.birthDate || !meta?.birthTime || !houses) return null;

  const [yyyy, mm, dd] = meta.birthDate.split('-').map(Number);
  const [hh, mi]       = meta.birthTime.split(':').map(Number);
  const offsetHours    = meta.utcOffset ?? 9;
  const utcH           = hh + mi / 60 - offsetHours;
  const birthUTC       = new Date(Date.UTC(yyyy, mm - 1, dd, Math.floor(utcH), Math.round((utcH % 1) * 60)));

  const bY  = birthUTC.getUTCFullYear();
  const bM  = birthUTC.getUTCMonth() + 1;
  const bD  = birthUTC.getUTCDate();
  const bHr = birthUTC.getUTCHours() + birthUTC.getUTCMinutes() / 60;

  function calcJD(y, m, d, h = 0) {
    if (m <= 2) { y--; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + h / 24 + B - 1524.5;
  }
  function norm360(a) { return ((a % 360) + 360) % 360; }

  // 나탈 하우스 커스프 (절대 경도 배열)
  const natalCusps = houses.map(h => h.longitude);

  function getHouse(lon) {
    const n = norm360(lon);
    for (let i = 0; i < 12; i++) {
      const s = natalCusps[i], e = natalCusps[(i + 1) % 12];
      if (s > e) { if (n >= s || n < e) return i + 1; }
      else       { if (n >= s && n < e) return i + 1; }
    }
    return 12;
  }

  const SIGNS = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                 '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];

  const natalJD   = calcJD(bY, bM, bD, bHr);
  const birthYear = bY;

  // 현재 나이
  const now        = new Date();
  const currentAge = (now - birthUTC) / (365.25 * 86400000);

  // 0~90세 스캔 → 사인/하우스 변화 시점 기록
  const chapters = [];
  let prevSign = -1, prevHouse = -1;

  for (let age = 0; age <= 90; age = Math.round((age + stepYears) * 1000) / 1000) {
    const progJD  = natalJD + age;
    const T       = (progJD - 2451545.0) / 36525.0;
    const lon     = norm360(lonFn(T));
    const signIdx = Math.floor(lon / 30);
    const house   = getHouse(lon);

    if (signIdx !== prevSign || house !== prevHouse) {
      // 이분법으로 정확한 시점 탐색
      let lo = Math.max(0, age - stepYears), hi = age;
      for (let i = 0; i < 60; i++) {
        const mid   = (lo + hi) / 2;
        const pT    = (natalJD + mid - 2451545.0) / 36525.0;
        const pLon  = norm360(lonFn(pT));
        const pSign = Math.floor(pLon / 30);
        const pH    = getHouse(pLon);
        if (pSign === signIdx && pH === house) hi = mid;
        else lo = mid;
        if (hi - lo < 0.0005) break;
      }
      const exactAge  = hi; // hi는 항상 새 사인/하우스(signIdx, house) 쪽 경계 — degInSign과 sign 라벨의 일치를 보장
      const exactYear = Math.floor(birthYear + exactAge);
      const lonAtAge  = norm360(lonFn((natalJD + exactAge - 2451545.0) / 36525.0));
      const degInSign = lonAtAge % 30;

      if (chapters.length > 0) {
        chapters[chapters.length - 1].endAge  = Math.floor(exactAge);
        chapters[chapters.length - 1].endYear = exactYear;
      }

      chapters.push({
        startAge:  Math.floor(exactAge),
        startYear: exactYear,
        endAge:    90,
        endYear:   birthYear + 90,
        sign:      SIGNS[signIdx],
        signIndex: signIdx,
        house,
        degree:    Math.floor(degInSign),
        minute:    Math.floor((degInSign % 1) * 60),
        isCurrent: false,
      });

      prevSign  = signIdx;
      prevHouse = house;
    }
  }

  // 현재 챕터 표시
  chapters.forEach(c => {
    c.isCurrent = currentAge >= c.startAge && currentAge < c.endAge;
  });

  return { chapters, birthYear, currentAge: Math.floor(currentAge) };
}

/* =========================================================
   달의 황경 근사 계산 (truncated lunar theory, 오차 약 0.3도 이내)
   ========================================================= */
function calcMoonLon(T) {
  const rad     = d => d * Math.PI / 180;
  const norm360 = a => ((a % 360) + 360) % 360;

  const Lp = 218.3164591 + 481267.88134236 * T;
  const D  = 297.8502042 + 445267.1115168  * T;
  const M  = 357.5291092 + 35999.0503      * T;
  const Mp = 134.9634114 + 477198.8676313  * T;
  const F  = 93.2720993  + 483202.0175273  * T;

  const lon = Lp
    + 6.2888 * Math.sin(rad(Mp))
    + 1.2740 * Math.sin(rad(2 * D - Mp))
    + 0.6583 * Math.sin(rad(2 * D))
    + 0.2136 * Math.sin(rad(2 * Mp))
    - 0.1851 * Math.sin(rad(M))
    - 0.1143 * Math.sin(rad(2 * F))
    + 0.0588 * Math.sin(rad(2 * D - 2 * Mp))
    + 0.0572 * Math.sin(rad(2 * D - M - Mp))
    + 0.0533 * Math.sin(rad(2 * D + Mp));

  return norm360(lon);
}

/* =========================================================
   프로그레션 달 타임라인 계산
   ========================================================= */
function calcProgMoonTimeline(astroData) {
  // 달은 1년에 약 13°씩 이동 → 더 촘촘한 스텝으로 스캔
  return buildProgressionTimeline(astroData, calcMoonLon, 0.02);
}

/* =========================================================
   프로그레션 달 타임라인 UI 렌더링
   ========================================================= */
function renderProgMoonTimeline(astroData) {
  // 기존 패널 제거
  const existing = document.getElementById("astroMoonTimelinePanel");
  if (existing) existing.remove();

  const data = calcProgMoonTimeline(astroData);
  if (!data) return;

  const { chapters, currentAge } = data;

  const HOUSE_THEME = {
    1:  { label:"자아·외모·시작",     color:"#f87171" },
    2:  { label:"재물·가치관",        color:"#fb923c" },
    3:  { label:"지식·소통·학습",     color:"#facc15" },
    4:  { label:"기반·가정·정체성",   color:"#4ade80" },
    5:  { label:"창작·표현·즐거움",   color:"#34d399" },
    6:  { label:"건강·일과·봉사",     color:"#22d3ee" },
    7:  { label:"관계·파트너십",      color:"#60a5fa" },
    8:  { label:"변환·심층·공유",     color:"#818cf8" },
    9:  { label:"탐구·철학·확장",     color:"#a78bfa" },
    10: { label:"사회·직업·명예",     color:"#c084fc" },
    11: { label:"이상·공동체·미래",   color:"#e879f9" },
    12: { label:"은둔·무의식·영성",   color:"#94a3b8" },
  };

  const rowsHtml = chapters.map((c, i) => {
    const theme    = HOUSE_THEME[c.house] || { label:"", color:"#94a3b8" };
    const isCur    = c.isCurrent;
    const chapterNum = i + 1;
    return `
      <tr style="
        background:${isCur ? 'rgba(165,180,252,.12)' : 'transparent'};
        border-bottom:1px solid rgba(255,255,255,.05);
      ">
        <td style="padding:10px 12px;font-size:12px;color:${isCur ? '#a5b4fc' : '#64748b'};font-weight:${isCur ? 700 : 400};white-space:nowrap;">
          제${chapterNum}장${isCur ? ' <span style="font-size:10px;background:rgba(165,180,252,.25);border-radius:4px;padding:1px 5px;">현재</span>' : ''}
        </td>
        <td style="padding:10px 12px;font-size:12px;color:${isCur ? '#e2e8f0' : '#94a3b8'};white-space:nowrap;">
          ${c.startAge}~${c.endAge}세
        </td>
        <td style="padding:10px 12px;font-size:12px;color:${isCur ? '#e2e8f0' : '#94a3b8'};white-space:nowrap;">
          ${c.startYear}~${c.endYear}
        </td>
        <td style="padding:10px 12px;font-size:12px;white-space:nowrap;">
          <span style="color:${theme.color};font-weight:600;">${c.sign} ${c.degree}°${c.minute}'</span>
          <span style="color:#475569;"> · </span>
          <span style="color:${isCur ? '#a5b4fc' : '#64748b'};">${c.house}H</span>
        </td>
        <td style="padding:10px 12px;font-size:11px;color:#64748b;">
          ${theme.label}
        </td>
      </tr>
    `;
  }).join('');

  const panel = document.createElement('div');
  panel.id = 'astroMoonTimelinePanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <details style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(165,180,252,.2);border-radius:16px;padding:20px;
    ">
      <summary style="cursor:pointer;font-size:12px;color:#a5b4fc;letter-spacing:2px;">
        🌙 프로그레션 달 타임라인 (${chapters.length}개) — 클릭하여 펼치기
      </summary>
      <div style="font-size:11px;color:#475569;margin:8px 0 16px;">나탈 하우스 기준 · A방식</div>

      <div style="overflow-x:auto;overflow-y:auto;max-height:420px;">
        <table style="width:100%;border-collapse:collapse;min-width:420px;">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,.1);">
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;position:sticky;top:0;background:rgba(15,15,35,.95);">챕터</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;position:sticky;top:0;background:rgba(15,15,35,.95);">나이</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;position:sticky;top:0;background:rgba(15,15,35,.95);">연도</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;position:sticky;top:0;background:rgba(15,15,35,.95);">위치</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;position:sticky;top:0;background:rgba(15,15,35,.95);">핵심 주제</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>

      <div style="margin-top:12px;font-size:10px;color:#334155;text-align:right;">
        프로그레스드 달 1년 ≈ 13° 이동 · Placidus 나탈 하우스 고정
      </div>
    </details>
  `;

  // 태양 타임라인 패널 바로 아래 삽입 (없으면 프로그레션 패널 아래)
  const sunTimelinePanel = document.getElementById("astroTimelinePanel");
  if (sunTimelinePanel) {
    sunTimelinePanel.after(panel);
  } else {
    const progPanel = document.getElementById("astroProgPanel");
    if (progPanel) progPanel.after(panel);
  }
}

/* =========================================================
   토성의 황경 근사 계산 (평균 + 근점이각 보정, 트랜짓용)
   ========================================================= */
function calcSaturnLonApprox(T) {
  const rad     = d => d * Math.PI / 180;
  const norm360 = a => ((a % 360) + 360) % 360;
  const L = 50.077444 + 1223.5110686 * T;
  const M = 317.9     + 1222.114     * T;
  return norm360(L + 6.393 * Math.sin(rad(M)) + 0.120 * Math.sin(rad(2 * M)));
}

/* =========================================================
   토성 리턴(Saturn Return) 계산 — 실제 시간 기준(1년=1년)으로
   트랜짓 토성이 나탈 토성 위치로 돌아오는 시점을 탐색
   ========================================================= */
function calcSaturnReturns(astroData) {
  const meta        = astroData.meta;
  const natalSaturn = astroData.natal?.saturn;
  if (!meta?.birthDate || !meta?.birthTime || !natalSaturn) return null;

  const [yyyy, mm, dd] = meta.birthDate.split('-').map(Number);
  const [hh, mi]       = meta.birthTime.split(':').map(Number);
  const offsetHours    = meta.utcOffset ?? 9;
  const utcH           = hh + mi / 60 - offsetHours;
  const birthUTC       = new Date(Date.UTC(yyyy, mm - 1, dd, Math.floor(utcH), Math.round((utcH % 1) * 60)));

  function calcJD(y, m, d, h = 0) {
    if (m <= 2) { y--; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + h / 24 + B - 1524.5;
  }
  function signedDiff(a, b) {
    let d = (a - b) % 360;
    if (d <= -180) d += 360;
    if (d > 180)   d -= 360;
    return d;
  }

  const bY  = birthUTC.getUTCFullYear();
  const bM  = birthUTC.getUTCMonth() + 1;
  const bD  = birthUTC.getUTCDate();
  const bHr = birthUTC.getUTCHours() + birthUTC.getUTCMinutes() / 60;

  const natalJD   = calcJD(bY, bM, bD, bHr);
  const birthYear = bY;

  const T0       = (natalJD - 2451545.0) / 36525.0;
  const natalLon = calcSaturnLonApprox(T0);

  const now        = new Date();
  const currentAge = (now - birthUTC) / (365.25 * 86400000);

  // 0~90세(실제 연수) 스캔하며 트랜짓 토성이 나탈 토성 위치를 통과하는 시점 탐색
  const returns = [];
  const step = 0.05;
  let prevDiff = null;

  for (let age = 0; age <= 90; age += step) {
    const T    = ((natalJD + age * 365.25) - 2451545.0) / 36525.0;
    const diff = signedDiff(calcSaturnLonApprox(T), natalLon);

    if (prevDiff !== null && prevDiff < 0 && diff >= 0) {
      let lo = age - step, hi = age;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const Tm  = ((natalJD + mid * 365.25) - 2451545.0) / 36525.0;
        const dm  = signedDiff(calcSaturnLonApprox(Tm), natalLon);
        if (dm < 0) lo = mid; else hi = mid;
      }
      const exactAge = (lo + hi) / 2;
      returns.push({
        age:  Math.round(exactAge),
        year: birthYear + Math.round(exactAge),
      });
    }
    prevDiff = diff;
  }

  return { returns, natalSaturn, currentAge };
}

/* =========================================================
   토성 리턴 패널 렌더링
   ========================================================= */
function renderSaturnReturnPanel(astroData) {
  const existing = document.getElementById("astroSaturnReturnPanel");
  if (existing) existing.remove();

  const data = calcSaturnReturns(astroData);
  if (!data) return;

  const { returns, natalSaturn, currentAge } = data;
  if (!returns.length) return;

  const THEMES = [
    '성인기의 시작 — 책임과 인생의 구조를 처음으로 다잡는 시기',
    '중년의 전환 — 그동안 쌓아온 것을 점검하고 새로운 안정을 다지는 시기',
    '인생 후반의 결실 — 지혜를 정리하고 마무리해가는 시기',
  ];

  const rowsHtml = returns.map((r, i) => {
    const isCur = Math.abs(currentAge - r.age) < 1;
    return `
      <div style="
        display:flex;justify-content:space-between;align-items:center;gap:12px;
        background:${isCur ? 'rgba(251,191,36,.12)' : 'rgba(255,255,255,.03)'};
        border:1px solid ${isCur ? 'rgba(251,191,36,.3)' : 'rgba(255,255,255,.06)'};
        border-radius:8px;padding:10px 14px;margin-bottom:6px;
      ">
        <div>
          <div style="font-size:12px;color:${isCur ? '#fbbf24' : '#e2e8f0'};font-weight:${isCur ? 700 : 600};">
            ${i + 1}차 토성 리턴${isCur ? ' <span style="font-size:10px;background:rgba(251,191,36,.25);border-radius:4px;padding:1px 5px;">현재</span>' : ''}
          </div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">${THEMES[i] || ''}</div>
        </div>
        <div style="text-align:right;white-space:nowrap;">
          <div style="font-size:13px;color:#fbbf24;font-weight:700;">만 ${r.age}세</div>
          <div style="font-size:11px;color:#64748b;">${r.year}년</div>
        </div>
      </div>
    `;
  }).join('');

  const panel = document.createElement('div');
  panel.id = 'astroSaturnReturnPanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <div style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(251,191,36,.2);border-radius:16px;padding:20px;
    ">
      <div style="font-size:12px;color:#fbbf24;letter-spacing:2px;margin-bottom:4px;">🪐 토성 리턴</div>
      <div style="font-size:11px;color:#475569;margin-bottom:14px;">
        트랜짓 토성이 나탈 토성(${natalSaturn.sign} ${natalSaturn.degree}°${natalSaturn.minute}' · ${natalSaturn.house}H) 위치로 돌아오는 시기
      </div>
      ${rowsHtml}
    </div>
  `;

  // 프로그레션 타임라인(달 → 태양 → 프로그레션 패널 순) 바로 아래 삽입
  const moonTimelinePanel = document.getElementById("astroMoonTimelinePanel");
  const sunTimelinePanel  = document.getElementById("astroTimelinePanel");
  const progPanel         = document.getElementById("astroProgPanel");
  const anchor = moonTimelinePanel || sunTimelinePanel || progPanel;
  if (anchor) anchor.after(panel);
}

/* =========================================================
   솔라리턴 적용 도시 선택 (기본값: 출생 도시)
   ========================================================= */
let _solarReturnCity = null;

function filterSolarCityList(val) {
  const dropdown = _$('solarReturnCityDropdown');
  if (!dropdown) return;
  const q = val.trim().toLowerCase();
  const matched = Object.keys(CITY_COORDS).filter(c => c.toLowerCase().includes(q)).slice(0, 30);
  if (matched.length === 0 || q === '') { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = matched.map(c =>
    '<div onclick="selectSolarCity(\'' + c + '\')" style="padding:8px 12px;font-size:13px;color:#e2e8f0;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);" onmouseover="this.style.background=\'rgba(255,255,255,.08)\'" onmouseout="this.style.background=\'\'">' + c + '</div>'
  ).join('');
  dropdown.style.display = 'block';
}
function showSolarCityList() {
  const input = _$('solarReturnCityInput');
  if (input) filterSolarCityList(input.value);
}
function hideSolarCityList() {
  const d = _$('solarReturnCityDropdown');
  if (d) d.style.display = 'none';
}
function selectSolarCity(cityName) {
  _solarReturnCity = cityName;
  hideSolarCityList();
  if (window.AstroResult) renderSolarReturnPanel(window.AstroResult);
}

/* =========================================================
   솔라리턴 패널 렌더링
   ========================================================= */
/* =========================================================
   솔라리턴 차트 1건(현재/다음) 렌더링 — 나탈 비교 그리드 + 에스펙트 아코디언
   ========================================================= */
function renderReturnChart(item, natal, angles, nodes, label, tag, opts) {
  const {
    accentColor = '#fde047',
    headerLabel = '솔라리턴',
    aspectTitle1 = '솔라리턴-솔라리턴 에스펙트',
    aspectTitle2 = '솔라리턴-나탈 에스펙트',
    aspectIcon1 = '☀️',
    aspectIcon2 = '🔗',
  } = opts || {};
  const PLANET_KR = {
    sun:"☀️ 태양", moon:"🌙 달", mercury:"☿ 수성", venus:"♀ 금성",
    mars:"♂ 화성", jupiter:"♃ 목성", saturn:"♄ 토성",
    uranus:"⛢ 천왕성", neptune:"♆ 해왕성", pluto:"♇ 명왕성"
  };

  const rowStyle = (changed) => `
    display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;align-items:center;
    background:${changed ? accentColor + '14' : 'rgba(255,255,255,.03)'};
    border:1px solid ${changed ? accentColor + '40' : 'rgba(255,255,255,.06)'};
    border-radius:8px;padding:7px 10px;margin-bottom:4px;
  `;

  const planetRowsHtml = Object.entries(PLANET_KR).map(([key, plabel]) => {
    const n = natal[key];
    const s = item.planets[key];
    if (!n || !s) return "";
    const changed = n.signIndex !== s.signIndex;
    return `
      <div style="${rowStyle(changed)}">
        <div style="color:#c4b5fd;font-size:11px;">${plabel}</div>
        <div>
          <div style="color:#94a3b8;font-size:11px;">${n.sign}</div>
          <div style="color:#64748b;font-size:10px;">${n.degree}°${n.minute}' · ${n.house}H</div>
        </div>
        <div>
          <div style="color:${changed ? accentColor : '#e2e8f0'};font-size:11px;font-weight:${changed ? 700 : 400};">
            ${s.sign}${changed ? ' ✦' : ''}
          </div>
          <div style="color:#64748b;font-size:10px;">${s.degree}°${s.minute}' · ${s.house}H</div>
        </div>
      </div>
    `;
  }).join("");

  function angleRow(icon, rowLabel, nObj, sObj, color) {
    const changed = !!(nObj && sObj && nObj.signIndex !== sObj.signIndex);
    const nH = nObj?.house != null ? ` · ${nObj.house}H` : '';
    const sH = sObj?.house != null ? ` · ${sObj.house}H` : '';
    return `
      <div style="${rowStyle(changed)}">
        <div style="color:${color};font-size:11px;">${icon} ${rowLabel}</div>
        <div>
          <div style="color:#94a3b8;font-size:11px;">${nObj ? nObj.sign : '-'}</div>
          <div style="color:#64748b;font-size:10px;">${nObj ? `${nObj.degree}°${nObj.minute}'${nH}` : ''}</div>
        </div>
        <div>
          <div style="color:${changed ? accentColor : '#e2e8f0'};font-size:11px;font-weight:${changed ? 700 : 400};">
            ${sObj ? sObj.sign : '-'}${changed ? ' ✦' : ''}
          </div>
          <div style="color:#64748b;font-size:10px;">${sObj ? `${sObj.degree}°${sObj.minute}'${sH}` : ''}</div>
        </div>
      </div>
    `;
  }

  const anglesHtml =
    angleRow('↑','ASC',   angles.asc,  item.angles.asc, '#fcd34d') +
    angleRow('⊕','MC',    angles.mc,   item.angles.mc,  '#fcd34d') +
    angleRow('☊','북노드', nodes.north, item.nodes.north, '#fcd34d') +
    angleRow('☋','릴리스', nodes.south, item.nodes.south, '#94a3b8');

  const pad2 = n => String(n).padStart(2, '0');
  const d = new Date(item.dateLocal);
  const dateStr = `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  const asc = item.angles.asc;

  const ageStr = item.age != null ? `만 ${item.age}세 · ` : '';

  return `
    <details style="margin-top:10px;background:rgba(255,255,255,.03);border:1px solid ${accentColor}26;border-radius:12px;padding:14px 16px;">
      <summary style="cursor:pointer;font-size:12px;color:${accentColor};letter-spacing:1px;">
        ${label}${tag ? ` <span style="font-size:10px;background:${accentColor}40;border-radius:4px;padding:1px 5px;">${tag}</span>` : ''}
        — ${ageStr}${dateStr} · ASC ${asc.sign} ${asc.degree}°${asc.minute}' — 클릭하여 펼치기
      </summary>
      <div style="margin-top:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px;padding:0 10px;">
          <div style="font-size:10px;color:#475569;">행성</div>
          <div style="font-size:10px;color:#475569;">나탈</div>
          <div style="font-size:10px;color:${accentColor};">${headerLabel} ✦변화</div>
        </div>
        ${planetRowsHtml}
        ${anglesHtml}
        ${renderAspectAccordion(item.aspectsFull, aspectTitle1, aspectIcon1, accentColor)}
        ${renderAspectAccordion(item.aspectsToNatal, aspectTitle2, aspectIcon2, accentColor)}
      </div>
    </details>
  `;
}

async function renderSolarReturnPanel(astroData) {
  const existing = document.getElementById("astroSolarReturnPanel");
  if (existing) existing.remove();

  const meta = astroData.meta;
  if (!meta?.birthDate || !meta?.birthTime || meta.lat == null || meta.lng == null) return;

  const cityName = _solarReturnCity || getCitySelectValue();
  const { lat: srLat, lng: srLng, utcOffset: srUtcOffset } = getCityCoords(cityName);

  const panel = document.createElement('div');
  panel.id = 'astroSolarReturnPanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <div style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(253,224,71,.2);border-radius:16px;padding:20px;
    ">
      <div style="font-size:12px;color:#fde047;letter-spacing:2px;margin-bottom:4px;">☀️ 솔라리턴</div>
      <div style="font-size:11px;color:#475569;margin-bottom:12px;">
        트랜짓 태양이 나탈 태양 위치로 돌아오는 시점의 어센던트
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:10px;color:#94a3b8;display:block;margin-bottom:4px;">솔라리턴에 적용할 도시</label>
        <div style="position:relative;">
          <input id="solarReturnCityInput" type="text" value="${cityName}" placeholder="도시 검색..." autocomplete="off"
            style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.07);color:#e2e8f0;font-size:13px;box-sizing:border-box;"
            oninput="filterSolarCityList(this.value)"
            onfocus="showSolarCityList()"
            onblur="setTimeout(hideSolarCityList,200)"
          />
          <div id="solarReturnCityDropdown" style="display:none;position:absolute;z-index:999;width:100%;max-height:200px;
            overflow-y:auto;background:#1e2340;border:1px solid rgba(255,255,255,.15);border-radius:8px;
            margin-top:2px;box-shadow:0 4px 20px rgba(0,0,0,.5);"></div>
        </div>
      </div>
      <div id="astroSolarReturnRows" style="font-size:12px;color:#94a3b8;">⏳ 솔라리턴 계산 중...</div>
    </div>
  `;

  // 토성 리턴 패널 바로 아래 삽입 (없으면 달 → 태양 타임라인 → 프로그레션 패널 순)
  const saturnPanel       = document.getElementById("astroSaturnReturnPanel");
  const moonTimelinePanel = document.getElementById("astroMoonTimelinePanel");
  const sunTimelinePanel  = document.getElementById("astroTimelinePanel");
  const progPanel         = document.getElementById("astroProgPanel");
  const anchor = saturnPanel || moonTimelinePanel || sunTimelinePanel || progPanel;
  if (anchor) anchor.after(panel);

  const rowsEl = panel.querySelector('#astroSolarReturnRows');
  try {
    const res = await fetch("/api/astro-solar-return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        birthDate: meta.birthDate,
        birthTime: meta.birthTime,
        lat: meta.lat,
        lng: meta.lng,
        utcOffset: meta.utcOffset,
        srLat, srLng, srUtcOffset,
        natal: astroData.natal,
        angles: astroData.angles,
        nodes: astroData.nodes,
        houses: astroData.houses
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "솔라리턴 계산 오류");

    const srOpts = {
      accentColor: '#fde047',
      headerLabel: '솔라리턴',
      aspectTitle1: '솔라리턴-솔라리턴 에스펙트',
      aspectTitle2: '솔라리턴-나탈 에스펙트',
      aspectIcon1: '☀️',
      aspectIcon2: '🔗',
    };
    if (rowsEl) {
      rowsEl.innerHTML =
        renderReturnChart(data.current, astroData.natal, astroData.angles, astroData.nodes, '현재 솔라리턴', '현재', srOpts) +
        renderReturnChart(data.next,    astroData.natal, astroData.angles, astroData.nodes, '다음 솔라리턴', null, srOpts);
    }
  } catch (err) {
    console.warn("솔라리턴 계산 실패:", err.message);
    if (rowsEl) rowsEl.innerHTML = `<div style="font-size:12px;color:#fca5a5;">⚠️ 솔라리턴 계산 실패: ${err.message}</div>`;
  }

  // 솔라리턴 패널이 갱신되면 루나리턴 패널도 같은 도시 기준으로 다시 그림
  if (typeof renderLunarReturnPanel === 'function') renderLunarReturnPanel(astroData);
}

/* =========================================================
   루나리턴 패널 렌더링 (솔라리턴과 같은 적용 도시 사용, 별도 도시 선택기 없음)
   ========================================================= */
async function renderLunarReturnPanel(astroData) {
  const existing = document.getElementById("astroLunarReturnPanel");
  if (existing) existing.remove();

  const meta = astroData.meta;
  if (!meta?.birthDate || !meta?.birthTime || meta.lat == null || meta.lng == null) return;

  const cityName = _solarReturnCity || getCitySelectValue();
  const { lat: appLat, lng: appLng, utcOffset: appUtcOffset } = getCityCoords(cityName);

  const panel = document.createElement('div');
  panel.id = 'astroLunarReturnPanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <div style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(165,180,252,.2);border-radius:16px;padding:20px;
    ">
      <div style="font-size:12px;color:#a5b4fc;letter-spacing:2px;margin-bottom:4px;">🌙 루나리턴</div>
      <div style="font-size:11px;color:#475569;margin-bottom:12px;">
        트랜짓 달이 나탈 달 위치로 돌아오는 시점의 어센던트 (${cityName} 기준, 솔라리턴과 동일 도시)
      </div>
      <div id="astroLunarReturnRows" style="font-size:12px;color:#94a3b8;">⏳ 루나리턴 계산 중...</div>
    </div>
  `;

  // 솔라리턴 패널 바로 아래 삽입
  const solarPanel = document.getElementById("astroSolarReturnPanel");
  if (solarPanel) solarPanel.after(panel);
  else return;

  const rowsEl = panel.querySelector('#astroLunarReturnRows');
  try {
    const res = await fetch("/api/astro-lunar-return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        birthDate: meta.birthDate,
        birthTime: meta.birthTime,
        lat: meta.lat,
        lng: meta.lng,
        utcOffset: meta.utcOffset,
        appLat, appLng, appUtcOffset,
        natal: astroData.natal,
        angles: astroData.angles,
        nodes: astroData.nodes,
        houses: astroData.houses
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "루나리턴 계산 오류");

    const lrOpts = {
      accentColor: '#a5b4fc',
      headerLabel: '루나리턴',
      aspectTitle1: '루나리턴-루나리턴 에스펙트',
      aspectTitle2: '루나리턴-나탈 에스펙트',
      aspectIcon1: '🌙',
      aspectIcon2: '🔗',
    };
    if (rowsEl) {
      rowsEl.innerHTML =
        renderReturnChart(data.current, astroData.natal, astroData.angles, astroData.nodes, '현재 루나리턴', '현재', lrOpts) +
        renderReturnChart(data.next,    astroData.natal, astroData.angles, astroData.nodes, '다음 루나리턴', null, lrOpts);
    }
  } catch (err) {
    console.warn("루나리턴 계산 실패:", err.message);
    if (rowsEl) rowsEl.innerHTML = `<div style="font-size:12px;color:#fca5a5;">⚠️ 루나리턴 계산 실패: ${err.message}</div>`;
  }

  // 루나리턴 패널이 갱신되면 신월/만월 캘린더 패널도 같은 도시 기준으로 다시 그림
  if (typeof renderMoonPhasesPanel === 'function') renderMoonPhasesPanel(astroData);
}

/* =========================================================
   2026 신월/만월 캘린더 패널 렌더링 (루나리턴과 같은 적용 도시 사용)
   ========================================================= */
const MOON_PHASE_TYPE_META = {
  newMoon:      { icon: '🌑', label: '신월', color: '#94a3b8' },
  fullMoon:     { icon: '🌕', label: '만월', color: '#fcd34d' },
  solarEclipse: { icon: '🌑', label: '일식', color: '#f87171' },
  lunarEclipse: { icon: '🌕', label: '월식', color: '#f87171' },
};

function renderMoonPhaseEventRow(ev, astroData, opts) {
  const meta = MOON_PHASE_TYPE_META[ev.type] || MOON_PHASE_TYPE_META.newMoon;
  const d = new Date(ev.dateLocal);
  const pad2 = n => String(n).padStart(2, '0');
  const dateStr = `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  const moon = ev.moon;

  const conjHtml = ev.conjunctions.length
    ? ev.conjunctions.map(c => `${c.point} ${c.degree}°${c.minute}'`).join(' · ')
    : `<span style="color:#475569;">-</span>`;

  return `
    <div style="
      background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);
      border-radius:10px;padding:10px 12px;margin-bottom:8px;
    ">
      <div style="display:grid;grid-template-columns:auto 1.3fr 1.4fr;gap:8px;align-items:center;font-size:12px;">
        <div style="color:${meta.color};font-weight:700;white-space:nowrap;">${meta.icon} ${dateStr}</div>
        <div style="color:#e2e8f0;">
          ${meta.label} · ${moon.sign} ${moon.degree}°${moon.minute}' <span style="color:#64748b;font-size:10px;">${moon.house}H</span>
        </div>
        <div style="color:#a5b4fc;font-size:11px;">${conjHtml}</div>
      </div>
      ${renderReturnChart(ev, astroData.natal, astroData.angles, astroData.nodes, dateStr, meta.label, opts)}
    </div>
  `;
}

async function renderMoonPhasesPanel(astroData) {
  const existing = document.getElementById("astroMoonPhasesPanel");
  if (existing) existing.remove();

  const meta = astroData.meta;
  if (!meta?.birthDate || !meta?.birthTime || meta.lat == null || meta.lng == null) return;

  const cityName = _solarReturnCity || getCitySelectValue();
  const { lat: appLat, lng: appLng, utcOffset: appUtcOffset } = getCityCoords(cityName);

  const panel = document.createElement('div');
  panel.id = 'astroMoonPhasesPanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <details style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(196,181,253,.2);border-radius:16px;padding:20px;
    ">
      <summary id="astroMoonPhasesTitle" style="cursor:pointer;font-size:12px;color:#c4b5fd;letter-spacing:2px;">
        🌑🌕 신월·만월 캘린더 — 클릭하여 펼치기
      </summary>
      <div style="margin-top:12px;">
        <div id="astroMoonPhasesDesc" style="font-size:11px;color:#475569;margin-bottom:12px;">
          신월/만월(및 일식/월식) — 나의 나탈 차트 기준 하우스 · 행성 애스펙트 (${cityName} 기준)
        </div>
        <div id="astroMoonPhasesRows" style="font-size:12px;color:#94a3b8;">⏳ 신월/만월 계산 중...</div>
      </div>
    </details>
  `;

  // 루나리턴 패널 바로 아래 삽입
  const lunarPanel = document.getElementById("astroLunarReturnPanel");
  if (lunarPanel) lunarPanel.after(panel);
  else return;

  const rowsEl = panel.querySelector('#astroMoonPhasesRows');
  try {
    const res = await fetch("/api/astro-moon-phases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        natal: astroData.natal,
        angles: astroData.angles,
        nodes: astroData.nodes,
        houses: astroData.houses,
        appLat, appLng, appUtcOffset
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "신월/만월 계산 오류");

    const mpOpts = {
      accentColor: '#c4b5fd',
      headerLabel: '트랜짓',
      aspectTitle1: '트랜짓-트랜짓 에스펙트',
      aspectTitle2: '트랜짓-나탈 에스펙트',
      aspectIcon1: '🌑',
      aspectIcon2: '🔗',
    };

    const titleEl = panel.querySelector('#astroMoonPhasesTitle');
    const descEl  = panel.querySelector('#astroMoonPhasesDesc');
    if (titleEl) titleEl.textContent = `🌑🌕 ${data.year} 신월·만월 캘린더 — 클릭하여 펼치기`;
    if (descEl) descEl.textContent = `${data.year}년 신월/만월(및 일식/월식) ${data.events.length}회 — 나의 나탈 차트 기준 하우스 · 행성 애스펙트 (${cityName} 기준)`;

    if (rowsEl) {
      rowsEl.innerHTML = data.events.map(ev => renderMoonPhaseEventRow(ev, astroData, mpOpts)).join("");
    }
  } catch (err) {
    console.warn("신월/만월 계산 실패:", err.message);
    if (rowsEl) rowsEl.innerHTML = `<div style="font-size:12px;color:#fca5a5;">⚠️ 신월/만월 계산 실패: ${err.message}</div>`;
  }
}

/* =========================================================
   오늘의 운세 — 행성 현황 렌더링
   ========================================================= */
function renderTodayPlanetPanel(todayData) {
  const panel     = _$("todayPlanetPanel");
  const grid      = _$("todayPlanetGrid");
  const dateLabel = _$("todayDateLabel");
  if (!panel || !grid) return;

  if (dateLabel) dateLabel.textContent = todayData.todayDate + " 기준";

  const PLANET_KR = {
    sun:"☀️ 태양", moon:"🌙 달", mercury:"☿ 수성", venus:"♀ 금성",
    mars:"♂ 화성", jupiter:"♃ 목성", saturn:"♄ 토성",
  };

  const natal   = todayData.natal;
  const transit = todayData.todayTransit;

  grid.innerHTML = Object.entries(PLANET_KR).map(([key, label]) => {
    const n = natal[key];
    const t = transit[key];
    if (!n || !t) return "";
    const changed = n.signIndex !== t.signIndex;
    return `
      <div style="
        background:rgba(255,255,255,.04);border-radius:8px;padding:8px 10px;
        border:1px solid rgba(250,200,100,.12);
      ">
        <div style="color:#fcd34d;font-size:11px;margin-bottom:2px;">${label}</div>
        <div style="color:#e2e8f0;font-size:12px;font-weight:600;">${t.sign} ${t.degree}°</div>
        <div style="color:#64748b;font-size:10px;margin-top:2px;">
          네이탈: ${n.sign}${changed ? ' <span style="color:#fbbf24;">→변화</span>' : ''}
        </div>
      </div>
    `;
  }).join("");

  panel.style.display = "block";

  // 트랜짓-나탈 에스펙트 (행성10 + ASC/MC + 북노드/릴리스 전체) — 아코디언
  {
    const existingTodayAspectPanel = document.getElementById('todayAspectPanel');
    if (existingTodayAspectPanel) existingTodayAspectPanel.remove();

    const aspectPanel = document.createElement('div');
    aspectPanel.id = 'todayAspectPanel';
    aspectPanel.innerHTML = renderAspectAccordion(
      todayData.todayAspectsFull, '트랜짓-나탈 에스펙트', '🌅', '#fcd34d'
    );
    panel.after(aspectPanel);
  }
}

/* =========================================================
   오늘의 운세 — AI 호출
   ========================================================= */
async function requestTodayFortune() {
  if (!window.SajuResult) {
    alert("생년월일과 출생시각을 먼저 입력해주세요.");
    return;
  }

  const btn      = _$("todayBtn");
  const loading  = _$("todayLoading");
  const resultEl = _$("todayResult");
  const errorEl  = _$("todayError");
  const statusEl = _$("todayCalcStatus");

  btn.disabled           = true;
  btn.style.opacity      = "0.5";
  loading.style.display  = "block";
  resultEl.style.display = "none";
  errorEl.style.display  = "none";

  try {
    // 캐시 없으면 오늘 트랜짓 계산
    if (!window.TodayResult) {
      if (statusEl) statusEl.textContent = "⏳ 오늘 행성 위치 계산 중...";

      const { name, gender, birthDate, birthTime } = window.SajuResult;
      const cityName = getCitySelectValue();
      const { lat, lng, utcOffset } = getCityCoords(cityName);

      const calcRes = await fetch("/api/astro-today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate, birthTime, lat, lng, name, gender, utcOffset })
      });

      const todayData = await calcRes.json();
      if (!calcRes.ok || todayData.error) throw new Error(todayData.error || "오늘 운세 계산 오류");

      window.TodayResult = todayData;
      renderTodayPlanetPanel(todayData);

      if (statusEl) statusEl.textContent = "✅ 행성 위치 계산 완료";
    }

    // Gemini 호출
    if (statusEl) statusEl.textContent = "✨ AI가 오늘 운세를 읽고 있습니다...";

    const geminiRes = await fetch("/api/gemini-today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todayData: window.TodayResult })
    });

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok || geminiData.error) throw new Error(geminiData.error || "AI 분석 오류");

    const formatted = (geminiData.result || "")
      .replace(/## (.+)/g, '<h3 style="color:#fcd34d;margin:16px 0 8px;font-size:14px;">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#e2e8f0;'>$1</strong>")
      .replace(/\n/g, "<br>");

    window.TodayReadingResult = geminiData.result || "";

    resultEl.innerHTML = `
      <div style="font-size:13px;color:#cbd3f0;line-height:1.9;border-top:1px solid rgba(255,255,255,.08);padding-top:14px;">
        ${formatted}
      </div>

      <!-- 질문 섹션 -->
      <div id="todayQuestionSection" style="margin-top:20px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px;">
        <div style="font-size:12px;color:#fcd34d;letter-spacing:1px;margin-bottom:10px;">💬 추가 질문 (최대 3회)</div>
        <div style="display:flex;gap:8px;">
          <input id="todayQuestionInput" type="text" placeholder="오늘 운세에 대해 질문하세요..."
            style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.07);color:#e2e8f0;font-size:13px;"
            onkeydown="if(event.key==='Enter')askTodayQuestion()"
          />
          <button onclick="askTodayQuestion()" style="
            background:linear-gradient(135deg,#d97706,#b45309);
            color:#fff;font-size:12px;font-weight:700;
            border:none;border-radius:8px;padding:8px 14px;cursor:pointer;
          ">전송</button>
        </div>
        <div style="font-size:10px;color:#475569;margin-top:4px;" id="todayQuestionCount">남은 질문: 3회</div>
        <div id="todayQuestionResult" style="margin-top:12px;"></div>
      </div>

      <div style="margin-top:12px;text-align:right;">
        <button onclick="window.TodayResult=null;window.TodayQuestionCount=0;requestTodayFortune();" style="
          background:rgba(217,119,6,.2);border:1px solid rgba(217,119,6,.4);
          color:#fcd34d;font-size:11px;border-radius:8px;padding:5px 12px;cursor:pointer;
        ">🔄 다시 보기</button>
      </div>
    `;
    window.TodayQuestionCount = 0;
    resultEl.style.display = "block";
    if (statusEl) statusEl.textContent = "";

  } catch (err) {
    errorEl.textContent   = "⚠️ " + (err.message || "오늘 운세를 불러오지 못했습니다.");
    errorEl.style.display = "block";
    if (statusEl) statusEl.textContent = "";
  } finally {
    btn.disabled           = false;
    btn.style.opacity      = "1";
    loading.style.display  = "none";
  }
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
   오늘의 운세 추가 질문
   ========================================================= */
async function askTodayQuestion() {
  if ((window.TodayQuestionCount || 0) >= 3) {
    alert("질문은 최대 3회까지만 가능합니다.");
    return;
  }
  const input    = _$("todayQuestionInput");
  const resultEl = _$("todayQuestionResult");
  const countEl  = _$("todayQuestionCount");
  if (!input || !input.value.trim()) return;

  const question = input.value.trim();
  input.value = "";
  input.disabled = true;

  const qIdx = window.TodayQuestionCount || 0;
  resultEl.innerHTML += `
    <div style="margin-bottom:8px;padding:8px 12px;background:rgba(255,255,255,.05);border-radius:8px;font-size:12px;color:#fcd34d;">
      Q: ${question}
    </div>
    <div id="tqAnswer${qIdx}" style="margin-bottom:16px;font-size:13px;color:#cbd3f0;padding:0 4px;">
      <span style="color:#64748b;">답변 생성 중...</span>
    </div>`;

  try {
    const res = await fetch("/api/gemini-today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        todayData: window.TodayResult,
        question,
        previousReading: window.TodayReadingResult
      })
    });
    const data   = await res.json();
    const answer = data.result || "답변을 가져오지 못했습니다.";
    const answerEl = document.getElementById(`tqAnswer${qIdx}`);
    if (answerEl) answerEl.innerHTML = answer.replace(/\n/g, "<br>");

    window.TodayQuestionCount = qIdx + 1;
    const remaining = 3 - window.TodayQuestionCount;
    if (countEl) countEl.textContent = remaining > 0 ? `남은 질문: ${remaining}회` : "질문 횟수를 모두 사용했습니다.";
    if (remaining === 0 && input) input.disabled = true;

  } catch(e) {
    const answerEl = document.getElementById(`tqAnswer${qIdx}`);
    if (answerEl) answerEl.textContent = "오류가 발생했습니다.";
  } finally {
    if ((window.TodayQuestionCount || 0) < 3) input.disabled = false;
  }
}

/* =========================================================
   점성술 AI 해석 호출
   계산은 이미 window.AstroResult에 있으므로 Gemini만 호출
   ========================================================= */
async function askAstroQuestion() {
  if ((window.AstroQuestionCount || 0) >= 3) {
    alert("질문은 최대 3회까지만 가능합니다.");
    return;
  }
  const input    = _$("astroQuestionInput");
  const resultEl = _$("astroQuestionResult");
  const countEl  = _$("astroQuestionCount");
  if (!input || !input.value.trim()) return;

  const question = input.value.trim();
  input.value = "";
  input.disabled = true;

  resultEl.innerHTML += `
    <div style="margin-bottom:8px;padding:8px 12px;background:rgba(255,255,255,.05);border-radius:8px;font-size:12px;color:#a5b4fc;">
      Q: ${question}
    </div>
    <div id="qAnswer${window.AstroQuestionCount}" style="margin-bottom:16px;font-size:13px;color:#cbd3f0;padding:0 4px;">
      <span style="color:#64748b;">답변 생성 중...</span>
    </div>`;

  try {
    const res = await fetch("/api/gemini-astro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        astroData: window.AstroResult,
        question,
        previousReading: window.AstroReadingResult
      })
    });
    const data = await res.json();
    const answer = data.result || "답변을 가져오지 못했습니다.";
    const answerEl = document.getElementById(`qAnswer${window.AstroQuestionCount}`);
    if (answerEl) answerEl.innerHTML = answer.replace(/\n/g,"<br>");

    window.AstroQuestionCount = (window.AstroQuestionCount || 0) + 1;
    const remaining = 3 - window.AstroQuestionCount;
    if (countEl) countEl.textContent = remaining > 0 ? `남은 질문: ${remaining}회` : "질문 횟수를 모두 사용했습니다.";
    if (remaining === 0 && input) input.disabled = true;

  } catch(e) {
    const answerEl = document.getElementById(`qAnswer${window.AstroQuestionCount}`);
    if (answerEl) answerEl.textContent = "오류가 발생했습니다.";
  } finally {
    if ((window.AstroQuestionCount || 0) < 3) input.disabled = false;
  }
}

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

    // 리딩 결과 저장 (질문에 활용)
    window.AstroReadingResult = geminiData.result || "";

    resultEl.innerHTML = `
      <div style="font-size:13px;color:#cbd3f0;line-height:1.9;border-top:1px solid rgba(255,255,255,.08);padding-top:14px;">${formatted}</div>

      <!-- 질문 섹션 -->
      <div id="astroQuestionSection" style="margin-top:20px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px;">
        <div style="font-size:12px;color:#a5b4fc;letter-spacing:1px;margin-bottom:10px;">💬 추가 질문 (최대 3회)</div>
        <div style="display:flex;gap:8px;">
          <input id="astroQuestionInput" type="text" placeholder="질문을 입력하세요..."
            style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.07);color:#e2e8f0;font-size:13px;"
            onkeydown="if(event.key==='Enter')askAstroQuestion()"
          />
          <button onclick="askAstroQuestion()" style="
            background:linear-gradient(135deg,#7c3aed,#4f46e5);
            color:#fff;font-size:12px;font-weight:700;
            border:none;border-radius:8px;padding:8px 14px;cursor:pointer;
          ">전송</button>
        </div>
        <div style="font-size:10px;color:#475569;margin-top:4px;" id="astroQuestionCount">남은 질문: 3회</div>
        <div id="astroQuestionResult" style="margin-top:12px;"></div>
      </div>

      <div style="margin-top:12px;text-align:right;">
        <button onclick="requestAstroReading()" style="
          background:rgba(124,58,237,.2);border:1px solid rgba(124,58,237,.4);
          color:#c4b5fd;font-size:11px;border-radius:8px;padding:5px 12px;cursor:pointer;
        ">🔄 다시 보기</button>
      </div>
    `;
    window.AstroQuestionCount = 0;
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
        if (["birthDate","birthTime","birthCity","gender"].includes(id)) { window.AstroResult = null; window.TodayResult = null; }
      });
      el.addEventListener("change", () => {
        runAll();
        if (["birthDate","birthTime","birthCity","gender"].includes(id)) { window.AstroResult = null; window.TodayResult = null; }
      });
    });

    runAll();
  } catch (e) {
    console.error("앱 초기화 오류:", e);
    try { setAlert("오류 발생: " + (e?.message || e)); } catch (_) {}
  }
});

console.log("✅ app.js 로드 완료");
