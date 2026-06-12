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

  const groups = [
    { label: "서울 자치구", cities: ["서울","종로구","중구(서울)","용산구","성동구","광진구","동대문구","중랑구","성북구","강북구","도봉구","노원구","은평구","서대문구","마포구","양천구","강서구(서울)","구로구","금천구","영등포구","동작구","관악구","서초구","강남구","송파구","강동구"] },
    { label: "경기도", cities: ["수원","성남","고양","용인","부천","안산","안양","남양주","화성","평택","의정부","파주","김포","광주(경기)","시흥","군포","하남","오산","이천","안성","의왕","양주","구리","포천","양평","동두천","과천","가평","연천","여주"] },
    { label: "인천", cities: ["인천","부평구","남동구","서구(인천)","연수구","미추홀구","계양구","강화"] },
    { label: "강원도", cities: ["춘천","원주","강릉","동해","태백","속초","삼척","홍천","횡성","영월","평창","정선","철원","화천","양구","인제","고성(강원)","양양"] },
    { label: "충청북도", cities: ["청주","충주","제천","보은","옥천","영동","증평","진천","괴산","음성","단양"] },
    { label: "충청남도/대전/세종", cities: ["대전","세종","천안","공주","보령","아산","서산","논산","계룡","당진","금산","부여","서천","청양","홍성","예산","태안","유성구","서구(대전)"] },
    { label: "전라북도", cities: ["전주","군산","익산","정읍","남원","김제","완주","진안","무주","장수","임실","순창","고창","부안"] },
    { label: "광주/전라남도", cities: ["광주","광산구","북구(광주)","목포","여수","순천","나주","광양","담양","곡성","구례","고흥","보성","화순","장흥","강진","해남","영암","무안","함평","영광","장성","완도","진도","신안"] },
    { label: "경상북도/대구", cities: ["대구","포항","경주","김천","안동","구미","영주","영천","상주","문경","경산","의성","청송","영양","영덕","청도","고령","성주","칠곡","예천","봉화","울진","울릉","달서구","북구(대구)","수성구","동구(대구)","달성"] },
    { label: "경상남도/울산/부산", cities: ["부산","울산","창원","진주","통영","사천","김해","밀양","거제","양산","의령","함안","창녕","고성(경남)","남해","하동","산청","함양","거창","합천","울주","해운대구","사상구","금정구","북구(부산)","강서구(부산)","기장"] },
    { label: "제주", cities: ["제주","서귀포"] },
    { label: "아시아", cities: ["도쿄","오사카","베이징","상하이","홍콩","타이베이","싱가포르","방콕","하노이","호치민","자카르타","마닐라","쿠알라룸푸르","뭄바이","델리"] },
    { label: "유럽", cities: ["런던","파리","베를린","로마","마드리드","암스테르담","취리히","빈","모스크바"] },
    { label: "북미", cities: ["뉴욕","LA","시카고","샌프란시스코","시애틀","라스베이거스","달라스","마이애미","워싱턴DC","토론토","밴쿠버"] },
    { label: "오세아니아/기타", cities: ["시드니","멜버른","오클랜드","두바이","상파울루"] },
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

  // 세컨더리 프로그레션 차트도 함께 렌더링
  renderAstroProgression(astroData);
}

/* =========================================================
   세컨더리 프로그레션 차트 렌더링
   ========================================================= */
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

  // 프로그레션↔나탈 주요 에스펙트
  const aspects = prog.aspectsToNatal || [];
  const aspectsHtml = aspects.length > 0
    ? aspects.map(a => `
        <div style="
          background:rgba(255,255,255,.04);border-radius:6px;
          padding:6px 10px;font-size:11px;color:#94a3b8;
          border-left:2px solid rgba(165,180,252,.4);
        ">
          <span style="color:#c4b5fd;">${a.progPlanet}</span>
          <span style="color:#64748b;margin:0 4px;">${a.aspect}</span>
          <span style="color:#94a3b8;">${a.natalPlanet}</span>
          <span style="color:#475569;margin-left:6px;">orb ${a.orb > 0 ? '+' : ''}${a.orb}°</span>
        </div>
      `).join("")
    : `<div style="color:#475569;font-size:12px;">현재 주요 에스펙트 없음</div>`;

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

      <!-- ASC/MC -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
        <div style="background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.2);border-radius:8px;padding:8px 10px;">
          <div style="font-size:10px;color:#a78bfa;margin-bottom:3px;">프로그레션 ASC</div>
          <div style="font-size:12px;color:#e2e8f0;font-weight:600;">${prog.angles.asc.sign}</div>
          <div style="font-size:10px;color:#64748b;">${prog.angles.asc.degree}°${prog.angles.asc.minute}'</div>
        </div>
        <div style="background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.2);border-radius:8px;padding:8px 10px;">
          <div style="font-size:10px;color:#a78bfa;margin-bottom:3px;">프로그레션 MC</div>
          <div style="font-size:12px;color:#e2e8f0;font-weight:600;">${prog.angles.mc.sign}</div>
          <div style="font-size:10px;color:#64748b;">${prog.angles.mc.degree}°${prog.angles.mc.minute}'</div>
        </div>
      </div>

      <!-- 에스펙트 -->
      <div style="margin-top:14px;">
        <div style="font-size:11px;color:#64748b;letter-spacing:1px;margin-bottom:8px;">프로그레션 → 나탈 에스펙트</div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          ${aspectsHtml}
        </div>
      </div>
    </div>
  `;

  // 나탈 패널 바로 아래에 삽입
  const natalPanel = document.getElementById("astroNatalPanel");
  if (natalPanel) {
    natalPanel.after(panel);
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
