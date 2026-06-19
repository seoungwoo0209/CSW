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
   스크린 내비게이션 (모바일 앱 구조)
   ========================================================= */
function enterScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + id);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);

  // 연간 운세 진입 시: 사주 데이터 있으면 패널 즉시 세팅
  if (id === 'annual') {
    const panel = document.getElementById('lifeGraphPanel');
    const hasDefault = panel && panel.querySelector('[data-default-msg]');
    const birthDate = _$('birthDate')?.value;
    if (birthDate && window.AstroResult) {
      renderAnnualEventsPanel(window.AstroResult);
    } else if (birthDate && !window.AstroResult) {
      if (panel) panel.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:20px;text-align:center;">🔄 점성술 데이터 계산 중...</div>';
    }
  }
}

function goHome() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const home = document.getElementById('screen-home');
  if (home) home.classList.add('active');
  window.scrollTo(0, 0);
}

// 하위 호환: 기존 setTabs() 호출 대비
function setTabs() {}

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

  // 결과 영역 표시
  const resultArea = _$('saju-result-area');
  if (resultArea) resultArea.style.display = 'block';

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

    // ── 연간 운세 탭: 로딩 상태
    const _lgp = document.getElementById('lifeGraphPanel');
    if (_lgp) _lgp.innerHTML = '<div style="color:#a5b4fc;font-size:13px;padding:30px;text-align:center;">⭐ 차트 계산 중...</div>';

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

    // 연간 운세 패널 초기화
    renderAnnualEventsPanel(astroData);

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

  if (typeof renderTransitPanel === 'function') renderTransitPanel(astroData);
}

/* =========================================================
   트랜짓 차트 패널 렌더링
   ========================================================= */
let _transitCity = null;

function filterTransitCityList(val) {
  const dropdown = _$('transitCityDropdown');
  if (!dropdown) return;
  const q = val.trim().toLowerCase();
  const matched = Object.keys(CITY_COORDS).filter(c => c.toLowerCase().includes(q)).slice(0, 30);
  if (matched.length === 0 || q === '') { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = matched.map(c =>
    '<div onclick="selectTransitCity(\'' + c + '\')" style="padding:8px 12px;font-size:13px;color:#e2e8f0;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);" onmouseover="this.style.background=\'rgba(255,255,255,.08)\'" onmouseout="this.style.background=\'\'">' + c + '</div>'
  ).join('');
  dropdown.style.display = 'block';
}
function showTransitCityList() {
  const input = _$('transitCityInput');
  if (input) filterTransitCityList(input.value);
}
function hideTransitCityList() {
  const d = _$('transitCityDropdown');
  if (d) d.style.display = 'none';
}
function selectTransitCity(cityName) {
  _transitCity = cityName;
  const input = _$('transitCityInput');
  if (input) input.value = cityName;
  hideTransitCityList();
}

/* =========================================================
   오늘의 운세 현재 위치 도시 선택
   ========================================================= */
let _todayCity = null;

function filterTodayCityList(val) {
  const dropdown = _$('todayCityDropdown');
  if (!dropdown) return;
  const q = val.trim().toLowerCase();
  const matched = Object.keys(CITY_COORDS).filter(c => c.toLowerCase().includes(q)).slice(0, 30);
  if (matched.length === 0 || q === '') { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = matched.map(c =>
    '<div onclick="selectTodayCity(\'' + c + '\')" style="padding:8px 12px;font-size:13px;color:#e2e8f0;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);" onmouseover="this.style.background=\'rgba(255,255,255,.08)\'" onmouseout="this.style.background=\'\'">' + c + '</div>'
  ).join('');
  dropdown.style.display = 'block';
}
function showTodayCityList() {
  const input = _$('todayCityInput');
  if (input) filterTodayCityList(input.value);
}
function hideTodayCityList() {
  const d = _$('todayCityDropdown');
  if (d) d.style.display = 'none';
}
function selectTodayCity(cityName) {
  _todayCity = cityName;
  const input = _$('todayCityInput');
  if (input) input.value = cityName;
  hideTodayCityList();
  window.TodayResult = null;
}

async function renderTransitPanel(astroData) {
  const existing = document.getElementById('astroTransitPanel');
  if (existing) existing.remove();

  const meta = astroData.meta;
  if (!meta?.birthDate || !meta?.birthTime || meta.lat == null || meta.lng == null) return;

  const nowKST = new Date(Date.now() + 9 * 3600000);
  const defaultDate = nowKST.toISOString().slice(0, 10);
  const defaultTime = nowKST.toISOString().slice(11, 16);
  const cityName = _transitCity || getCitySelectValue();

  const panel = document.createElement('div');
  panel.id = 'astroTransitPanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <div style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(52,211,153,.2);border-radius:16px;padding:20px;
    ">
      <div style="font-size:12px;color:#34d399;letter-spacing:2px;margin-bottom:4px;">🪐 트랜짓 차트</div>
      <div style="font-size:11px;color:#475569;margin-bottom:14px;">
        특정 날짜/시각의 트랜짓 행성을 나탈 차트와 바이휠 비교 — ASC/MC/하우스/애스펙트 완전 계산
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div>
          <label style="font-size:10px;color:#94a3b8;display:block;margin-bottom:4px;">트랜짓 날짜</label>
          <input id="transitDateInput" type="date" value="${defaultDate}"
            style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.07);color:#e2e8f0;font-size:13px;box-sizing:border-box;" />
        </div>
        <div>
          <label style="font-size:10px;color:#94a3b8;display:block;margin-bottom:4px;">트랜짓 시각</label>
          <input id="transitTimeInput" type="time" value="${defaultTime}"
            style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.07);color:#e2e8f0;font-size:13px;box-sizing:border-box;" />
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:10px;color:#94a3b8;display:block;margin-bottom:4px;">트랜짓 적용 도시</label>
        <div style="position:relative;">
          <input id="transitCityInput" type="text" value="${cityName}" placeholder="도시 검색..." autocomplete="off"
            style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.07);color:#e2e8f0;font-size:13px;box-sizing:border-box;"
            oninput="filterTransitCityList(this.value)"
            onfocus="showTransitCityList()"
            onblur="setTimeout(hideTransitCityList,200)"
          />
          <div id="transitCityDropdown" style="display:none;position:absolute;z-index:999;width:100%;max-height:200px;
            overflow-y:auto;background:#1e2340;border:1px solid rgba(255,255,255,.15);border-radius:8px;
            margin-top:2px;box-shadow:0 4px 20px rgba(0,0,0,.5);"></div>
        </div>
      </div>
      <button onclick="calcTransitChart()" style="
        background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.4);color:#34d399;
        border-radius:8px;padding:8px 18px;font-size:12px;cursor:pointer;margin-bottom:14px;letter-spacing:1px;
      ">🪐 트랜짓 차트 계산하기</button>
      <div id="astroTransitRows" style="font-size:12px;color:#94a3b8;">⏳ 트랜짓 계산 중...</div>
    </div>
  `;

  const moonPanel = document.getElementById('astroMoonPhasesPanel');
  if (moonPanel) moonPanel.after(panel);
  else return;

  await calcTransitChart();
}

async function calcTransitChart() {
  if (!window.AstroResult) return;
  const astroData = window.AstroResult;
  const meta = astroData.meta;
  const rowsEl = document.getElementById('astroTransitRows');

  const transitDate = _$('transitDateInput')?.value || '';
  const transitTime = _$('transitTimeInput')?.value || '00:00';
  const cityInputVal = _$('transitCityInput')?.value || getCitySelectValue();
  const { lat: appLat, lng: appLng, utcOffset: appUtcOffset } = getCityCoords(cityInputVal);

  if (!transitDate) {
    if (rowsEl) rowsEl.innerHTML = '<div style="font-size:12px;color:#fca5a5;">⚠️ 날짜를 입력해 주세요.</div>';
    return;
  }
  if (rowsEl) rowsEl.innerHTML = '⏳ 트랜짓 계산 중...';

  try {
    const res = await fetch('/api/astro-transit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transitDate,
        transitTime,
        appLat, appLng, appUtcOffset,
        natal: astroData.natal,
        angles: astroData.angles,
        nodes: astroData.nodes,
        houses: astroData.houses
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || '트랜짓 계산 오류');

    const trOpts = {
      accentColor: '#34d399',
      headerLabel: '트랜짓',
      aspectTitle1: '트랜짓-트랜짓 에스펙트',
      aspectTitle2: '트랜짓-나탈 에스펙트',
      aspectIcon1: '🪐',
      aspectIcon2: '🔗',
    };
    if (rowsEl) {
      rowsEl.innerHTML = renderReturnChart(data, astroData.natal, astroData.angles, astroData.nodes, '트랜짓 차트', '결과', trOpts);
    }
  } catch (err) {
    console.warn('트랜짓 계산 실패:', err.message);
    if (rowsEl) rowsEl.innerHTML = `<div style="font-size:12px;color:#fca5a5;">⚠️ 트랜짓 계산 실패: ${err.message}</div>`;
  }
}

/* =========================================================
   연간 운세 패널 (🔮 연간 운세 탭 — lifeGraphPanel에 렌더)
   ========================================================= */
function renderAnnualEventsPanel(astroData) {
  const container = document.getElementById('lifeGraphPanel');
  if (!container || !astroData?.meta) return;

  const curY = new Date().getFullYear();
  const opts = [];
  for (let y = curY - 1; y <= curY + 5; y++) {
    opts.push(`<option value="${y}"${y === curY ? ' selected' : ''}>${y}년</option>`);
  }

  container.innerHTML = `
    <style>
      @keyframes _aicPulse{0%,100%{opacity:.55;box-shadow:0 0 5px #dfba6b}50%{opacity:1;box-shadow:0 0 10px #dfba6b}}
      @keyframes _aicSheen{from{background-position:200% center}to{background-position:-200% center}}
      #annualInputCard select#annualReportYear{
        appearance:none;-webkit-appearance:none;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23dfba6b' stroke-width='1.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat:no-repeat;background-position:right 14px center;
      }
      #annualInputCard select#annualReportYear:focus{outline:none;border-color:rgba(232,192,105,.7);}
      #annualReportBtn{transition:transform .15s ease,box-shadow .15s ease;}
      #annualReportBtn:active{transform:scale(.97);}
      #annualReportBtn .aic-sheen{
        position:absolute;inset:0;border-radius:inherit;pointer-events:none;
        background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.22) 48%,transparent 66%);
        background-size:250% auto;animation:_aicSheen 3.2s linear infinite;
      }
    </style>
    <div style="padding:4px 0 16px;">
      <div id="annualInputCard" style="
        position:relative;overflow:hidden;
        background:radial-gradient(circle at 18% -10%,rgba(183,156,255,.16),transparent 55%),
                    linear-gradient(150deg,rgba(13,10,34,.98) 0%,rgba(22,12,46,.97) 55%,rgba(12,9,28,.98) 100%);
        border:1px solid rgba(232,192,105,.3);border-radius:22px;padding:26px 24px;
        box-shadow:0 18px 48px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.05);
      ">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;
          background:linear-gradient(90deg,transparent,rgba(223,186,107,.75),transparent);"></div>

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <div style="width:7px;height:7px;border-radius:50%;background:#dfba6b;animation:_aicPulse 2.2s ease-in-out infinite;"></div>
          <span style="font-size:11px;color:#e8c069;letter-spacing:.28em;font-weight:700;font-family:Georgia,serif;">연간 점성술 운세</span>
        </div>
        <div style="font-size:13px;color:#aab2d6;margin-bottom:20px;line-height:1.7;">
          점성술 엔진이 계산한 연간 이벤트를 AI가 삶의 언어로 해석해드립니다.<br>
          <span style="color:#7e87ad;font-size:11px;letter-spacing:.02em;">프로펙션 · 트랜짓 임팩트 · 생애주기 · 일식 기준</span>
        </div>

        <div style="display:flex;flex-direction:column;gap:12px;">
          <select id="annualReportYear" style="
            width:100%;box-sizing:border-box;padding:13px 38px 13px 16px;border-radius:12px;
            border:1px solid rgba(232,192,105,.35);background-color:rgba(232,192,105,.07);
            color:#f4d98a;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:.02em;
            font-family:Georgia,serif;
          ">${opts.join('')}</select>
          <button onclick="generateAnnualReport()" id="annualReportBtn" style="
            position:relative;overflow:hidden;width:100%;box-sizing:border-box;
            background:linear-gradient(135deg,#3b2a0f 0%,#caa244 45%,#3b2a0f 100%);
            border:1px solid rgba(232,192,105,.5);color:#241404;
            border-radius:12px;padding:14px 22px;font-size:14.5px;font-weight:700;
            cursor:pointer;letter-spacing:.06em;display:flex;align-items:center;justify-content:center;gap:8px;
            box-shadow:0 6px 22px rgba(180,140,40,.25),inset 0 1px 0 rgba(255,255,255,.3);
          "><img src="/img/loader-icon-star.png" width="18" height="18" style="object-fit:contain;display:block;filter:drop-shadow(0 0 3px rgba(0,0,0,.3));">리포트 생성<span class="aic-sheen"></span></button>
        </div>
        <div id="annualReportStatus" style="display:none;font-size:12px;color:#64748b;margin-top:12px;"></div>
      </div>
      <div id="annualReportResult" style="margin-top:16px;"></div>
    </div>
  `;
}

/* ─── 연간 리포트 프리미엄 로딩 오버레이 ───────────────────────────── */

function showAnnualLoader(numEvents) {
  const old = document.getElementById('annualLoader');
  if (old) old.remove();
  clearInterval(window._alProgressInterval);
  (window._alStepTimeouts || []).forEach(clearTimeout);
  window._alStepTimeouts = [];

  const ICONS = [
    '<img src="/img/loader-icon-star.png" width="32" height="32" style="object-fit:contain;display:block;">',
    '<img src="/img/loader-icon-star.png" width="32" height="32" style="object-fit:contain;display:block;filter:brightness(1.3) saturate(1.2);">',
    '<img src="/img/loader-icon-crescent.png" width="32" height="32" style="object-fit:contain;display:block;">',
    '<img src="/img/loader-icon-ring.png" width="32" height="32" style="object-fit:contain;display:block;">',
  ];

  const STEPS = [
    '당신의 출생 차트 천체 위치 확인 중...',
    '프로펙션 및 트랜짓 주기 계산 완료',
    numEvents + '개의 주요 운명 전환점 분석 중...',
    '별의 언어를 삶의 조언으로 해석 중...',
  ];

  const stepsHtml = STEPS.map((txt, i) => {
    const on = i === 0;
    return '<div id="alStep' + i + '" style="display:flex;align-items:center;gap:14px;padding:10px 0;opacity:' + (on ? '1' : '.3') + ';transition:opacity .5s;">' +
      '<div id="alStepIco' + i + '" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .5s;' + (on ? 'filter:drop-shadow(0 0 6px rgba(212,175,55,.5));' : 'filter:opacity(.4);') + '">' + ICONS[i] + '</div>' +
      '<span id="alStepTxt' + i + '" style="font-size:14px;font-weight:' + (on ? '600' : '400') + ';color:' + (on ? '#e8d9b0' : '#3a4a5a') + ';transition:all .5s;font-family:Helvetica Neue,sans-serif;letter-spacing:.01em;">' + txt + '</span>' +
      '</div>';
  }).join('');

  const waxBtn =
    '<div id="alWaxBtn" style="width:100%;max-width:380px;margin:18px 0 0;border-radius:12px;overflow:hidden;display:flex;align-items:center;background:linear-gradient(135deg,#3b0f0f 0%,#6a1e1e 45%,#3b0f0f 100%);border:1px solid rgba(150,65,45,.4);box-shadow:0 4px 24px rgba(80,10,10,.5);">' +
    '<div style="width:72px;height:72px;border-right:1px solid rgba(150,65,45,.35);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
    '<img src="/img/loader-waxseal.png" width="58" height="58" style="object-fit:contain;display:block;">' +
    '</div>' +
    '<span style="flex:1;text-align:center;font-size:14.5px;font-weight:700;color:#D4AF37;letter-spacing:.06em;text-shadow:0 0 14px rgba(212,175,55,.4);font-family:Helvetica Neue,sans-serif;">깊은 지혜의 리포트 잠금 해제</span>' +
    '</div>';

  // ── 행성 궤도 [색, 글로우RGB, 반지름px, 공전초, 시작각, 크기px] ──
  // 300px 컨테이너 기준, 각 행성 div는 컨테이너 중심(top50%,left50%)에 배치
  const PL = [
    {col:'#D8D2C4',g:'216,210,196',r:165,d:26,a:15, s:18},
    {col:'#C89640',g:'200,150,64', r:137,d:44,a:138,s:17},
    {col:'#3A7FAA',g:'58,127,170', r:110,d:32,a:252,s:16},
    {col:'#C87844',g:'200,120,68', r:82, d:18,a:62, s:13},
    {col:'#4A8C72',g:'74,140,114', r:56, d:58,a:178,s:12},
  ];
  const orbitCss = PL.map((p,i)=>
    '@keyframes _oP'+i+'{from{transform:rotate('+p.a+'deg) translateX('+p.r+'px)}to{transform:rotate('+(p.a+360)+'deg) translateX('+p.r+'px)}}'
  ).join('');
  const orbitHtml = PL.map((p,i)=>{
    const h=p.s/2;
    return '<div style="position:absolute;top:50%;left:50%;width:'+p.s+'px;height:'+p.s+'px;'+
      'margin-top:-'+h+'px;margin-left:-'+h+'px;border-radius:50%;'+
      'background:radial-gradient(circle at 35% 30%,'+p.col+',rgba(10,8,30,.55));'+
      'box-shadow:0 0 5px rgba('+p.g+',.65),inset 0 1px 2px rgba(255,255,255,.25);'+
      'animation:_oP'+i+' '+p.d+'s linear infinite;will-change:transform;"></div>';
  }).join('');

  const loaderHtml =
    '<div id="annualLoader" style="position:fixed;inset:0;z-index:9999;background:#060310;display:flex;flex-direction:column;align-items:center;overflow:hidden;">' +

    '<style>' +
    orbitCss +
    '@keyframes _alGemP{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:.9;transform:scale(1.18)}}' +
    '@keyframes _alBS{from{background-position:200% center}to{background-position:-200% center}}' +
    '@keyframes _alWP{0%,100%{box-shadow:0 4px 20px rgba(80,10,10,.5)}50%{box-shadow:0 6px 34px rgba(140,30,30,.8),0 0 16px rgba(212,175,55,.12)}}' +
    '@keyframes _alFI{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}' +
    '.al-bf{background:linear-gradient(90deg,#b8942a 0%,#D4AF37 30%,#fff5c0 50%,#D4AF37 70%,#b8942a 100%);background-size:300% auto;animation:_alBS 2s linear infinite}' +
    '#alWaxBtn{animation:_alWP 3.5s ease-in-out infinite}' +
    '.al-bot{animation:_alFI .6s ease .25s both}' +
    '</style>' +

    '<div style="margin-top:16px;letter-spacing:.42em;font-size:9px;color:rgba(212,175,55,.5);text-transform:uppercase;font-family:Helvetica Neue,sans-serif;flex-shrink:0;">Annual Cosmos Report</div>' +

    // 아스트롤라베: 정적 이미지 + 그 위에 개별 행성 div (이미지 자체는 transform 없음)
    // 하단 텍스트 줄(al-bot, padding 22px + max-width:390px)과 가로 폭을 정확히 맞춤
    '<div style="flex-shrink:0;margin-top:10px;width:100%;padding:0 22px;box-sizing:border-box;">' +
    '<div style="position:relative;width:100%;max-width:390px;aspect-ratio:520/582;margin:0 auto;">' +
    '<img src="/img/astrolabe-loader.png" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;" alt=""/>' +
    '<div style="position:absolute;inset:0;pointer-events:none;">' + orbitHtml +
    '<div style="position:absolute;top:50%;left:50%;width:24px;height:24px;margin:-12px;border-radius:50%;background:radial-gradient(circle,rgba(255,240,200,.4),transparent);animation:_alGemP 3.5s ease-in-out infinite;"></div>' +
    '</div>' +
    '</div>' +
    '</div>' +

    // 하단 UI (정적, transform 없음)
    '<div class="al-bot" style="flex:1;padding:6px 22px 16px;display:flex;flex-direction:column;align-items:center;overflow:hidden;width:100%;">' +

    '<div style="width:100%;max-width:390px;margin-bottom:10px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:7px;align-items:center;">' +
    '<span id="alStatusText" style="font-size:11.5px;color:rgba(180,160,100,.8);font-style:italic;font-family:Helvetica Neue,sans-serif;">' + STEPS[0] + '</span>' +
    '<span id="alPct" style="font-size:11.5px;color:#D4AF37;font-weight:700;font-family:Helvetica Neue,sans-serif;letter-spacing:.06em;min-width:40px;text-align:right;">0%</span>' +
    '</div>' +
    '<div style="height:2px;background:rgba(255,255,255,.07);border-radius:1px;overflow:hidden;"><div id="alBarFill" class="al-bf" style="height:100%;width:0%;border-radius:1px;transition:width 1s cubic-bezier(.25,.46,.45,.94);"></div></div>' +
    '</div>' +

    '<div style="width:100%;max-width:390px;">' + stepsHtml + '</div>' +
    waxBtn +
    '<p style="font-size:10.5px;font-style:italic;color:rgba(160,140,90,.5);line-height:1.8;font-family:Georgia,serif;margin:12px 0 0;text-align:center;">"우주의 속삭임을 해독하여, 당신만의 삶의<br>길을 안내합니다. 잠시만 기다려 주세요."</p>' +
    '</div>' +
    '</div>';

  document.body.insertAdjacentHTML('beforeend', loaderHtml);

  // 진행률 (지수 감속 0→90%)
  let pct = 0;
  window._alProgressInterval = setInterval(() => {
    pct += (90 - pct) * 0.032 + Math.random() * 0.35;
    if (pct > 89.5) pct = 89.5;
    const barEl = document.getElementById('alBarFill');
    const pctEl = document.getElementById('alPct');
    if (barEl) barEl.style.width = pct.toFixed(1) + '%';
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
  }, 700);

  // 단계 순차 활성화
  const stepTimings = [0, 2800, 7500, 14000];
  stepTimings.forEach((t, i) => {
    const tid = setTimeout(() => {
      if (!document.getElementById('annualLoader')) return;
      // 이전 단계들은 그대로 유지(사라지지 않음) — 현재 단계만 강조
      const cur    = document.getElementById('alStep' + i);
      const curIco = document.getElementById('alStepIco' + i);
      const curTxt = document.getElementById('alStepTxt' + i);
      const stEl   = document.getElementById('alStatusText');
      if (cur)    cur.style.opacity = '1';
      if (curIco) curIco.style.filter = 'drop-shadow(0 0 8px rgba(212,175,55,.6))';
      if (curTxt) { curTxt.style.color = '#e8d9b0'; curTxt.style.fontWeight = '600'; }
      if (stEl)   stEl.textContent = STEPS[i];
    }, t);
    window._alStepTimeouts.push(tid);
  });
}

function hideAnnualLoader() {
  clearInterval(window._alProgressInterval);
  (window._alStepTimeouts || []).forEach(clearTimeout);
  window._alStepTimeouts = [];
  const barEl = document.getElementById('alBarFill');
  const pctEl = document.getElementById('alPct');
  if (barEl) { barEl.style.transition = 'width .45s ease'; barEl.style.width = '100%'; }
  if (pctEl) pctEl.textContent = '100%';
  setTimeout(() => {
    const loader = document.getElementById('annualLoader');
    if (!loader) return;
    loader.style.transition = 'opacity .6s ease';
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 650);
  }, 500);
}

/* ─── 연간 리포트 생성 ──────────────────────────────────────────────── */

function closeAnnualReport() {
  const resultEl  = document.getElementById('annualReportResult');
  const inputCard = document.getElementById('annualInputCard');
  if (resultEl)  resultEl.innerHTML = '';
  if (inputCard) inputCard.style.display = '';
}

async function generateAnnualReport() {
  if (!window.AstroResult)       { alert('차트 계산 완료 후 사용 가능합니다.'); return; }
  if (!window.AstroEventsEngine) { alert('astro-events-engine.js가 로드되지 않았습니다.'); return; }

  const yearEl   = document.getElementById('annualReportYear');
  const statusEl = document.getElementById('annualReportStatus');
  const resultEl = document.getElementById('annualReportResult');
  const btn      = document.getElementById('annualReportBtn');
  if (!yearEl || !statusEl || !resultEl) return;

  const year      = parseInt(yearEl.value, 10);
  const astroData = window.AstroResult;
  const meta      = astroData.meta || {};
  const input     = {
    birthDate: meta.birthDate, birthTime: meta.birthTime,
    lat: meta.lat, lng: meta.lng, utcOffset: meta.utcOffset,
  };

  if (btn) { btn.disabled = true; btn.style.opacity = '0.55'; }
  statusEl.style.display = 'none';
  resultEl.innerHTML     = '';

  let engineData;
  try {
    engineData = window.AstroEventsEngine.computeYearEvents(input, astroData, year);
    if (!engineData) throw new Error('이벤트 계산 실패');
  } catch (e) {
    statusEl.style.display = 'block';
    statusEl.textContent = '⚠️ 엔진 오류: ' + e.message;
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    return;
  }

  showAnnualLoader(engineData.events.filter(ev => ev.importance === 'major').length);

  try {
    const res = await fetch('/api/gemini-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engineData,
        meta: { name: meta.name || '', birthDate: meta.birthDate, gender: meta.gender },
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'AI 해석 오류');

    hideAnnualLoader();
    const userName = _$('name')?.value?.trim() || '';
    resultEl.innerHTML = _buildAnnualHTML(engineData, data.result || '', userName);
    resultEl.querySelectorAll('script').forEach(s => {
      const ns = document.createElement('script');
      ns.textContent = s.textContent;
      document.body.appendChild(ns);
      s.remove();
    });
    const inputCard = document.getElementById('annualInputCard');
    if (inputCard) inputCard.style.display = 'none';
  } catch (err) {
    hideAnnualLoader();
    statusEl.style.display = 'block';
    statusEl.textContent = '⚠️ ' + err.message;
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

function _buildTimeline(events) {
  function parseMonth(when) {
    if (!when) return null;
    if (/^\d{4}$/.test(when)) return null;
    const rangeM = when.match(/(\d{2})~(\d{2})$/);
    if (rangeM) return (parseInt(rangeM[1]) + parseInt(rangeM[2])) / 2;
    const fullDate = when.match(/^\d{4}-(\d{2})-\d{2}$/);
    if (fullDate) return parseInt(fullDate[1]);
    const monthOnly = when.match(/^\d{4}-(\d{2})$/);
    if (monthOnly) return parseInt(monthOnly[1]);
    const qm = when.match(/Q([1-4])/i);
    if (qm) return [2, 5, 8, 11][parseInt(qm[1]) - 1];
    const rng = when.match(/(\d+)[~\-](\d+)월/);
    if (rng) return (parseInt(rng[1]) + parseInt(rng[2])) / 2;
    const sm = when.match(/(\d+)월/);
    if (sm) return parseInt(sm[1]);
    return null;
  }

  function toLeft(month) {
    return Math.min(93, Math.max(5, ((month - 0.5) / 12) * 100));
  }

  /* ── 이벤트 선택: major 우선, 최소 12% 간격 유지, 최대 6개 ── */
  const allTimed = events
    .filter(e => parseMonth(e.when) !== null)
    .map(e => ({ ...e, _m: parseMonth(e.when) }))
    .sort((a, b) => {
      // major 먼저, 같으면 월 순
      if (a.importance === 'major' && b.importance !== 'major') return -1;
      if (b.importance === 'major' && a.importance !== 'major') return 1;
      return a._m - b._m;
    });

  const MIN_GAP = 13; // % 단위 최소 간격
  const selected = [];
  const usedLefts = [];

  for (const e of allTimed) {
    const left = toLeft(e._m);
    const tooClose = usedLefts.some(l => Math.abs(l - left) < MIN_GAP);
    if (tooClose) continue;
    selected.push({ ...e, _left: left });
    usedLefts.push(left);
    if (selected.length >= 6) break;
  }

  // 렌더링 순서는 월 순으로
  selected.sort((a, b) => a._m - b._m);

  if (selected.length === 0) return '';

  const iconFor = e => {
    if (e.layer === 'lifecycle')      return '🌱';
    if (e.valence === 'double_edged') return '⚡';
    if (e.valence === 'supportive')   return '⭐';
    if (e.valence === 'challenging')  return '🔴';
    return '·';
  };

  // 월 레이블 간략화: "2026-03" → "3월", "2026-03-15" → "3/15"
  function shortWhen(when) {
    const fd = when.match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (fd) return `${parseInt(fd[1])}/${parseInt(fd[2])}`;
    const mo = when.match(/^\d{4}-(\d{2})$/);
    if (mo) return `${parseInt(mo[1])}월`;
    const rg = when.match(/(\d{2})~(\d{2})$/);
    if (rg) return `${parseInt(rg[1])}~${parseInt(rg[2])}월`;
    return when;
  }

  /* ── 핀 HTML ── */
  // 컨테이너 높이 240px, 축은 top:120px(50%)
  // up핀: top:0 ~ 120px, 라벨 위 / 점 아래
  // down핀: top:120px ~ 240px, 점 위 / 라벨 아래
  const AXIS = 120;

  const pinsHtml = selected.map((e, idx) => {
    const left    = e._left;
    const isMajor = e.importance === 'major';
    const isDE    = e.valence === 'double_edged';
    const isUp    = idx % 2 === 0;
    const dotSize = isMajor ? 18 : 11;
    const half    = dotSize / 2;

    const dotBg = (isMajor && isDE) ? 'radial-gradient(circle,#fff 30%,#b79cff)'
      : isMajor                     ? 'radial-gradient(circle,#fff,#e8c069)'
      : (e.layer === 'lifecycle')   ? 'transparent' : '#7e87ad';
    const dotShadow = (isMajor && isDE)
      ? '0 0 0 3px rgba(183,156,255,.25),0 0 18px rgba(183,156,255,.6)'
      : isMajor ? '0 0 0 3px rgba(232,192,105,.2),0 0 18px rgba(232,192,105,.6)' : 'none';
    const dotBorder = (e.layer === 'lifecycle' && !isMajor)
      ? '2px dashed rgba(183,156,255,.7)' : '2px solid #070a14';

    const shortF = (e.fact || '').length > 18 ? (e.fact || '').slice(0, 18) + '…' : (e.fact || '');

    // 점의 절대 위치: 축 위/아래 half px
    const dotTop = isUp ? AXIS - half : AXIS - half;

    // 라벨: up이면 점 위, down이면 점 아래
    // up: top=4, height → dot top까지 (= AXIS-half-4-4 = 103px), flex-end → 내용이 107px에 위치
    // down: top=dot bottom+6, height = 남은 공간, flex-start → 내용이 135px에 위치
    const labPosStyle = isUp
      ? `top:4px;height:${AXIS - half - 4 - 4}px;`
      : `top:${AXIS + half + 6}px;height:${240 - (AXIS + half + 6) - 4}px;`;

    return `
      <div style="position:absolute;left:${left}%;transform:translateX(-50%);top:0;width:90px;height:240px;">
        <!-- 라벨 -->
        <div style="position:absolute;${labPosStyle}left:0;right:0;
          display:flex;flex-direction:column;${isUp ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}
          align-items:center;text-align:center;gap:1px;">
          <span style="font-size:13px;line-height:1;">${iconFor(e)}</span>
          <b style="color:#f3f5ff;font-size:9px;display:block;line-height:1.2;">${shortWhen(e.when)}</b>
          <span style="font-size:9px;color:#aab2d6;line-height:1.2;">${shortF}</span>
        </div>
        <!-- 점 -->
        <div style="position:absolute;left:50%;top:${dotTop}px;transform:translateX(-50%);
          width:${dotSize}px;height:${dotSize}px;border-radius:50%;
          background:${dotBg};border:${dotBorder};box-shadow:${dotShadow};"></div>
      </div>`;
  }).join('');

  return `
    <div style="margin:24px 0 6px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <span style="font-size:11px;letter-spacing:3px;color:#7e87ad;font-weight:700;">YEAR TIMELINE</span>
      <span style="font-size:10px;color:#7e87ad;">⭐ 핵심 · 일반 · 미래</span>
    </div>
    <div style="position:relative;height:240px;overflow:hidden;border-radius:12px;">
      <!-- 축 -->
      <div style="position:absolute;left:0;right:0;top:${AXIS}px;height:2px;
        background:linear-gradient(90deg,transparent 2%,rgba(232,192,105,.55) 15%,rgba(183,156,255,.55) 80%,transparent 98%);"></div>
      <!-- Q 라벨 -->
      <div style="position:absolute;left:0;right:0;top:${AXIS + 10}px;
        display:grid;grid-template-columns:repeat(4,1fr);">
        ${['Q1','Q2','Q3','Q4'].map(q =>
          `<span style="font-size:10px;color:#475569;text-align:center;letter-spacing:1px;">${q}</span>`
        ).join('')}
      </div>
      <!-- 핀 -->
      ${pinsHtml}
    </div>`;
}

function _buildAnnualHTML(engineData, aiText, userName = '') {
  const { year, profection, events = [] } = engineData;
  const did = 'adeck' + year; // 고유 덱 ID — 함수명·요소 ID 모두 이 접두사 사용

  /* ── AI 섹션 파싱 ── */
  const sections = {};
  for (const part of aiText.split(/\n(?=## )/)) {
    const m = part.match(/^## (.+)\n([\s\S]*)/);
    if (m) sections[m[1].trim()] = m[2].trim();
  }

  /* ── 유틸 ── */
  const V_COL  = { supportive:'#dfba6b', challenging:'#f87171', double_edged:'#a78bfa', neutral:'#94a3b8' };
  const V_BADG = { supportive:'OPPORTUNITY', challenging:'CHALLENGE', double_edged:'DUAL FORCE', neutral:'TRANSIT' };
  const V_KR   = { supportive:'기회·상승', challenging:'도전·긴장', double_edged:'양면 에너지', neutral:'중립' };

  /* ── NASA 공개 이미지 — 로컬 /img/ 폴더 (퍼블릭 도메인, Wikimedia/NASA CDN 원본) ── */
  const NASA_IMGS = {
    '목성':   { url:'/img/jupiter.jpg', cap:'Jupiter · Hubble / NASA' },
    '토성':   { url:'/img/saturn.jpg',  cap:'Saturn · Cassini / NASA' },
    '화성':   { url:'/img/mars.jpg',    cap:'Mars · ESA / NASA' },
    '금성':   { url:'/img/venus.jpg',   cap:'Venus · Magellan / NASA' },
    '수성':   { url:'/img/mercury.jpg', cap:'Mercury · MESSENGER / NASA' },
    '천왕성': { url:'/img/uranus.jpg',  cap:'Uranus · Voyager 2 / NASA' },
    '해왕성': { url:'/img/neptune.jpg', cap:'Neptune · Voyager 2 / NASA' },
    '명왕성': { url:'/img/pluto.jpg',   cap:'Pluto · New Horizons / NASA' },
    '달':     { url:'/img/moon.jpg',    cap:'Moon · NASA' },
    '태양':   { url:'/img/sun.jpg',     cap:'Sun · SDO / NASA' },
    cosmos:   { url:'/img/cosmos.jpg',  cap:'Cosmos · NASA / WISE' },
    nebula:   { url:'/img/nebula.jpg',  cap:'Nebula · Hubble / NASA' },
    galaxy:   { url:'/img/galaxy.jpg',  cap:'Galaxy · NASA' },
  };

  /* 하우스 번호 → 테마 이미지 매핑 */
  const HOUSE_IMGS = {
    1:  NASA_IMGS['태양'],    // 자아·정체성
    2:  NASA_IMGS.galaxy,    // 재물·소유
    3:  NASA_IMGS['수성'],   // 소통·이동
    4:  NASA_IMGS['달'],     // 가정·뿌리
    5:  NASA_IMGS['금성'],   // 창조·연애
    6:  NASA_IMGS['화성'],   // 건강·일상
    7:  NASA_IMGS.nebula,    // 파트너십
    8:  NASA_IMGS.cosmos,    // 변환·심층
    9:  NASA_IMGS['목성'],   // 철학·여행·확장
    10: NASA_IMGS['토성'],   // 커리어·사회적 위치
    11: NASA_IMGS.galaxy,    // 공동체·미래
    12: NASA_IMGS.cosmos,    // 영성·무의식
  };

  function getSlideImg(s) {
    if (s.t === 'event') {
      const e = s.e;
      const bodies = Array.isArray(e.bodies) ? e.bodies : [];
      // 1순위: 행성 매칭
      for (const b of bodies) {
        const found = Object.entries(NASA_IMGS).find(([k]) =>
          k !== 'cosmos' && k !== 'nebula' && k !== 'galaxy' && b.includes(k)
        );
        if (found) return found[1];
      }
      // 2순위: 하우스 기반 테마 이미지
      if (e.house && HOUSE_IMGS[e.house]) return HOUSE_IMGS[e.house];
      return NASA_IMGS.cosmos;
    }
    if (/MOOD/.test(s.badge || '')) return NASA_IMGS.nebula;
    if (/FLOW/.test(s.badge || '')) return NASA_IMGS.galaxy;
    return NASA_IMGS.cosmos;
  }

  function fmt(t) {
    if (!t) return '';
    return t
      .replace(/### (.+)/g, '<div style="font-size:12px;font-weight:800;color:#f1f5f9;margin:10px 0 3px;">$1</div>')
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f1f5f9;">$1</strong>')
      .replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  }

  function sWhen(w) {
    if (!w) return '';
    const fd = w.match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (fd) return `${+fd[1]}월 ${+fd[2]}일`;
    const mo = w.match(/^\d{4}-(\d{2})$/);
    if (mo) return `${+mo[1]}월`;
    const rg = w.match(/(\d{2})~(\d{2})$/);
    if (rg) return `${+rg[1]}~${+rg[2]}월`;
    return w;
  }

  /* ── 섹션 키 찾기 ── */
  const flowKey  = Object.keys(sections).find(k => k === '올해의 큰 흐름') || '';
  const moodKey  = Object.keys(sections).find(k => /무드|심리/.test(k)) || '';
  const flowText = sections[flowKey] || '';
  const moodText = sections[moodKey] || '';
  const flowLines = flowText.split('\n');
  const fni = flowLines.findIndex(l => l.trim());
  const thesis = fni >= 0 ? flowLines[fni].replace(/\*\*(.+?)\*\*/g, '$1') : '';

  /* ── 이벤트 개별 해석 파싱 (### E1, E2, ...) ── */
  const eventInterps = {};
  const interpSection = sections['이벤트 개별 해석'] || '';
  if (interpSection) {
    for (const part of interpSection.split(/\n(?=### E\d)/)) {
      const m = part.match(/^### E(\d+)\n?([\s\S]*)/);
      if (m) eventInterps[parseInt(m[1]) - 1] = m[2].trim(); // 0-indexed
    }
  }

  const majorEvents = events.filter(e => e.importance === 'major').slice(0, 6);
  const aiExtras = ['핵심 사건과 시기', '영역별 흐름', '주목할 포인트'];
  const extBadge = ['KEY EVENTS', 'DOMAIN FLOW', 'FOCUS POINTS'];

  /* ── 슬라이드 배열 ── */
  const slides = [];

  // 슬라이드 1: 커버
  slides.push({ t: 'cover' });
  // 슬라이드 2: 큰흐름
  if (flowText) slides.push({ t:'text', badge:'THE BIG FLOW', title:'올해의 큰 흐름', body:fmt(flowText), col:'#dfba6b' });
  // 슬라이드 3: 무드
  if (moodText) slides.push({ t:'text', badge:'THE MOOD', title: moodKey||'올해의 무드', body:fmt(moodText), col:'#a78bfa' });
  // 슬라이드 4~N: 주요 이벤트 (각 1슬라이드)
  majorEvents.forEach(e => {
    slides.push({ t:'event', e, col: V_COL[e.valence]||'#94a3b8' });
  });
  // 나머지 AI 섹션
  aiExtras.forEach((k, i) => {
    if (sections[k]) slides.push({ t:'text', badge:extBadge[i], title:k, body:fmt(sections[k]), col:'#64748b' });
  });
  // 마무리
  if (sections['마무리']) slides.push({ t:'closing', text:sections['마무리'] });

  const TOTAL = slides.length;

  /* ── 슬라이드 HTML 빌더 ── */
  const BASE = 'position:absolute;top:0;left:0;width:100%;height:100%;display:none;flex-direction:column;';

  function buildSlide(s, n) {
    if (s.t === 'cover') return `
      <div id="${did}_s${n}" style="${BASE}align-items:center;justify-content:center;text-align:center;padding:0 28px;gap:0;">
        <!-- 연도 원형 -->
        <div style="width:70px;height:70px;border-radius:50%;
          border:1px solid rgba(223,186,107,.55);
          display:flex;align-items:center;justify-content:center;
          flex-shrink:0;margin-bottom:22px;">
          <span style="font-family:Georgia,serif;font-size:19px;color:#dfba6b;font-weight:300;letter-spacing:.06em;">${year}</span>
        </div>
        <!-- 메인 타이틀 -->
        <div style="flex-shrink:0;margin-bottom:12px;">
          <h1 style="font-size:clamp(17px,5vw,24px);font-weight:900;color:#fff;
            letter-spacing:.06em;margin:0;line-height:1.15;
            font-family:Georgia,serif;text-transform:uppercase;white-space:nowrap;">
            THE <span style="color:#dfba6b;">SOVEREIGN</span> CYCLE
          </h1>
        </div>
        <!-- 구분선 -->
        <div style="width:36px;height:1px;flex-shrink:0;margin-bottom:13px;
          background:linear-gradient(90deg,transparent,rgba(223,186,107,.6),transparent);"></div>
        <!-- 서브타이틀 -->
        <p style="font-size:10.5px;color:#94a3b8;letter-spacing:.14em;
          margin:0 0 10px;flex-shrink:0;font-family:Georgia,serif;">
          ${userName ? `${userName} 님 · ` : ''}프리미엄 ${TOTAL}단계 마스터 플랜
        </p>
        <!-- 태그라인 -->
        <p style="font-size:11px;color:#475569;line-height:1.7;
          max-width:250px;margin:0 0 24px;flex-shrink:0;">
          실제 행성의 궤도와 정밀한 각도가<br>만들어내는 당신만의 천문학적 서사.
        </p>
        <!-- 프로펙션 필 -->
        <div style="display:flex;flex-direction:column;gap:7px;align-items:center;flex-shrink:0;">
          <span style="font-size:11px;color:#fbbf24;
            border:1px solid rgba(251,191,36,.28);background:rgba(251,191,36,.06);
            padding:5px 14px;border-radius:999px;white-space:nowrap;">
            만 ${profection.age}세 · ${profection.house}하우스 연도 · ${profection.theme}
          </span>
          <span style="font-size:11px;color:#94a3b8;
            border:1px solid rgba(148,163,184,.16);background:rgba(148,163,184,.04);
            padding:5px 14px;border-radius:999px;white-space:nowrap;">
            올해의 지배성 · ${profection.lord}
          </span>
        </div>
        <p style="font-size:9px;color:#1e293b;letter-spacing:.1em;margin-top:18px;flex-shrink:0;">
          ← 좌우로 넘기세요 →
        </p>
      </div>`;

    if (s.t === 'text') {
      const img = getSlideImg(s);
      return `
      <div id="${did}_s${n}" style="${BASE}flex-direction:row;overflow:hidden;">
        <div style="flex:1;display:flex;flex-direction:column;padding:14px 16px 12px;gap:8px;overflow:hidden;min-width:0;">
          <div style="flex-shrink:0;">
            <span style="display:inline-block;padding:2px 9px;border-radius:999px;
              background:${s.col}18;border:1px solid ${s.col}38;
              font-size:9px;font-weight:700;color:${s.col};letter-spacing:.18em;font-family:Georgia,serif;">
              ${String(n-1).padStart(2,'0')}. ${s.badge}
            </span>
          </div>
          <h2 style="flex-shrink:0;font-size:15px;font-weight:800;color:#f1f5f9;margin:0;line-height:1.2;">${s.title}</h2>
          <div style="flex:1;overflow-y:auto;font-size:11.5px;line-height:1.85;color:#94a3b8;
            -webkit-overflow-scrolling:touch;padding-right:3px;">
            ${s.body}
          </div>
        </div>
        <div style="width:38%;flex-shrink:0;position:relative;overflow:hidden;
          border-left:1px solid rgba(255,255,255,.04);">
          <img src="${img.url}" alt="${img.cap}"
            style="width:100%;height:100%;object-fit:cover;display:block;opacity:.82;"
            onerror="this.style.display='none';this.parentElement.style.background='linear-gradient(160deg,rgba(20,15,50,.9),rgba(5,3,15,1))'">
          <div style="position:absolute;bottom:0;left:0;right:0;
            background:linear-gradient(transparent,rgba(0,0,0,.85));
            padding:28px 7px 10px;text-align:center;">
            <span style="font-size:8px;color:${s.col};letter-spacing:.1em;font-family:Georgia,serif;line-height:1.3;">${img.cap}</span>
          </div>
        </div>
      </div>`;
    }

    if (s.t === 'event') {
      const e = s.e; const col = s.col;
      const img = getSlideImg(s);
      const bodies = Array.isArray(e.bodies) ? e.bodies : [];
      const eventIdx = majorEvents.indexOf(e);
      const interp = eventInterps[eventIdx] || '';
      return `
        <div id="${did}_s${n}" style="${BASE}flex-direction:row;overflow:hidden;">
          <div style="flex:1;display:flex;flex-direction:column;padding:14px 16px 12px;gap:7px;overflow:hidden;min-width:0;">
            <div style="flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:6px;">
              <span style="display:inline-block;padding:2px 9px;border-radius:999px;
                background:${col}18;border:1px solid ${col}38;
                font-size:9px;font-weight:700;color:${col};letter-spacing:.15em;font-family:Georgia,serif;">
                EVENT · ${V_BADG[e.valence]||'TRANSIT'}
              </span>
              <span style="font-size:10px;color:#475569;flex-shrink:0;">${sWhen(e.when)}</span>
            </div>
            <div style="flex-shrink:0;">
              <p style="font-size:13px;font-weight:800;color:#f1f5f9;margin:0 0 5px;line-height:1.3;">${e.fact||''}</p>
              <div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${e.technique ? `<span style="font-size:9px;padding:2px 7px;border-radius:6px;background:rgba(255,255,255,.07);color:#64748b;">${e.technique}</span>` : ''}
                ${bodies.map(b=>`<span style="font-size:9px;padding:2px 7px;border-radius:6px;background:rgba(255,255,255,.07);color:#64748b;">${b}</span>`).join('')}
              </div>
            </div>
            <div style="flex-shrink:0;height:1px;background:linear-gradient(90deg,${col}55,transparent);"></div>
            <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-right:2px;">
              ${interp
                ? `<p style="font-size:11.5px;line-height:1.82;color:#cbd5e1;margin:0 0 8px;">${fmt(interp)}</p>`
                : `<p style="font-size:11px;font-weight:700;color:${col};letter-spacing:.06em;margin:0 0 5px;">${V_KR[e.valence]||e.valence}</p>`
              }
              ${e.house ? `<p style="font-size:10px;color:#475569;margin:0;">${e.house}하우스 영역</p>` : ''}
            </div>
          </div>
          <div style="width:37%;flex-shrink:0;position:relative;overflow:hidden;
            border-left:1px solid rgba(255,255,255,.04);">
            <img src="${img.url}" alt="${img.cap}"
              style="width:100%;height:100%;object-fit:cover;display:block;opacity:.82;"
              onerror="this.style.display='none';this.parentElement.style.background='linear-gradient(160deg,rgba(20,15,50,.9),rgba(5,3,15,1))'">
            <div style="position:absolute;bottom:0;left:0;right:0;
              background:linear-gradient(transparent,rgba(0,0,0,.85));
              padding:28px 7px 10px;text-align:center;">
              <span style="font-size:8px;color:${col};letter-spacing:.1em;font-family:Georgia,serif;">${img.cap}</span>
            </div>
          </div>
        </div>`;
    }

    if (s.t === 'closing') {
      const text = s.text || '';
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const bulletLines  = lines.filter(l => /^✓/.test(l));
      const quoteLines   = lines.filter(l => !/^✓/.test(l));
      const quoteHtml    = quoteLines
        .map(l => l.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f1f5f9;">$1</strong>'))
        .join('<br>');
      const bullets = bulletLines.map(l => {
        const m = l.match(/^✓\s*\[?([^\]:：\]]+)\]?\s*[:：]\s*(.*)/);
        return m ? { label: m[1].trim(), content: m[2].trim() }
                 : { label: '', content: l.replace(/^✓\s*/, '') };
      });
      return `
        <div id="${did}_s${n}" style="${BASE}align-items:center;justify-content:center;
          padding:16px 24px 18px;gap:0;overflow:hidden;">
          <div style="font-size:52px;color:rgba(223,186,107,.38);font-family:Georgia,serif;
            line-height:1;flex-shrink:0;text-align:center;width:100%;margin-bottom:10px;">&ldquo;</div>
          <div style="flex-shrink:0;text-align:center;width:100%;
            ${bullets.length > 0 ? 'padding-bottom:18px;' : 'padding-bottom:0;flex:1;display:flex;align-items:center;justify-content:center;'}">
            <p style="font-size:14px;font-style:italic;color:#e2e8f0;line-height:1.85;margin:0;">${quoteHtml}</p>
          </div>
          ${bullets.length > 0 ? `
          <div style="flex-shrink:0;width:48px;height:1px;margin-bottom:16px;
            background:linear-gradient(90deg,transparent,rgba(223,186,107,.65),transparent);"></div>
          <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;width:100%;">
            ${bullets.map(b=>`
              <div style="display:flex;gap:8px;margin-bottom:11px;align-items:flex-start;">
                <span style="color:#dfba6b;flex-shrink:0;font-size:12px;margin-top:1px;">✓</span>
                <p style="font-size:12px;color:#94a3b8;line-height:1.65;margin:0;">
                  ${b.label ? `<strong style="color:#dfba6b;">${b.label}:</strong> ` : ''}${b.content}
                </p>
              </div>`).join('')}
          </div>` : ''}
        </div>`;
    }
    return '';
  }

  /* ── 도트 · 슬라이드 HTML ── */
  const dotsHtml = slides.map((_,i)=>`
    <div id="${did}_d${i+1}" onclick="${did}_go(${i+1})"
      style="width:8px;height:8px;border-radius:50%;cursor:pointer;transition:all .3s ease;flex-shrink:0;
      ${i===0?`background:#dfba6b;box-shadow:0 0 7px #dfba6b;width:18px;border-radius:4px;`:`background:rgba(255,255,255,.13);`}">
    </div>`).join('');

  const slidesHtml = slides.map((s,i)=>buildSlide(s,i+1)).join('');

  /* ── 전체 조립 ── */
  return `
    <style>
      #${did} ::-webkit-scrollbar{width:3px;}
      #${did} ::-webkit-scrollbar-track{background:transparent;}
      #${did} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:2px;}
      @keyframes ${did}_pulse{0%,100%{opacity:1}50%{opacity:.45}}
    </style>

    <div id="${did}" style="
      max-width:440px;width:100%;height:660px;margin:8px auto;
      background:rgba(8,6,20,.96);
      border:1px solid rgba(223,186,107,.18);border-radius:30px;overflow:hidden;
      display:flex;flex-direction:column;position:relative;
      box-shadow:0 24px 72px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.06),0 0 44px rgba(124,58,237,.05);">

      <!-- 상단 골드 라인 -->
      <div style="position:absolute;top:0;left:0;right:0;height:2.5px;z-index:20;
        background:linear-gradient(90deg,transparent,rgba(223,186,107,.72),transparent);"></div>

      <!-- 헤더 -->
      <header style="display:flex;justify-content:space-between;align-items:center;
        padding:20px 22px 10px;flex-shrink:0;z-index:10;">
        <div style="display:flex;align-items:center;gap:7px;">
          <div style="width:7px;height:7px;border-radius:50%;background:#dfba6b;
            box-shadow:0 0 7px #dfba6b;animation:${did}_pulse 2s ease-in-out infinite;"></div>
          <span style="font-size:9px;font-weight:700;letter-spacing:.22em;color:#dfba6b;font-family:Georgia,serif;">ANNUAL MASTER REPORT</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="font-size:9px;color:#334155;letter-spacing:.12em;font-family:Georgia,serif;">
            ${year} · <span id="${did}_idx" style="color:#dfba6b;font-weight:700;">1</span>&thinsp;/&thinsp;${TOTAL}
          </div>
          <button onclick="closeAnnualReport()" title="닫기" style="
            width:22px;height:22px;border-radius:50%;border:1px solid rgba(255,255,255,.12);
            background:rgba(10,7,24,.9);color:#64748b;cursor:pointer;font-size:12px;
            display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>
        </div>
      </header>

      <!-- 슬라이드 뷰포트 -->
      <main id="${did}_vp" style="position:relative;flex:1;overflow:hidden;">
        ${slidesHtml}
      </main>

      <!-- 푸터 -->
      <footer style="display:flex;justify-content:space-between;align-items:center;
        padding:10px 22px 18px;flex-shrink:0;z-index:10;">
        <button onclick="${did}_go(Math.max(1,${did}_cur-1))" style="
          width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.1);
          background:rgba(10,7,24,.9);color:#64748b;cursor:pointer;font-size:16px;
          display:flex;align-items:center;justify-content:center;">‹</button>
        <div style="display:flex;gap:5px;align-items:center;overflow-x:auto;max-width:220px;
          padding:3px 0;scrollbar-width:none;-ms-overflow-style:none;">
          ${dotsHtml}
        </div>
        <button onclick="${did}_go(Math.min(${TOTAL},${did}_cur+1))" style="
          width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.1);
          background:rgba(10,7,24,.9);color:#64748b;cursor:pointer;font-size:16px;
          display:flex;align-items:center;justify-content:center;">›</button>
      </footer>
    </div>

    <script>
    (function(){
      const D='${did}', N=${TOTAL};
      window[D+'_cur']=1;

      window[D+'_go']=function(n){
        n=Math.max(1,Math.min(N,n));
        for(let i=1;i<=N;i++){
          const el=document.getElementById(D+'_s'+i);
          if(!el)continue;
          if(i===n){
            el.style.display='flex';
            el.style.opacity='0';
            el.style.transform='scale(0.97) translateY(10px)';
            void el.offsetHeight;
            el.style.transition='opacity .6s cubic-bezier(.16,1,.3,1),transform .6s cubic-bezier(.16,1,.3,1)';
            el.style.opacity='1';
            el.style.transform='scale(1) translateY(0)';
          } else {
            el.style.display='none';
          }
        }
        const idx=document.getElementById(D+'_idx');
        if(idx)idx.textContent=n;
        for(let i=1;i<=N;i++){
          const dot=document.getElementById(D+'_d'+i);
          if(!dot)continue;
          if(i===n){dot.style.cssText+='background:#dfba6b;box-shadow:0 0 7px #dfba6b;width:18px;border-radius:4px;';}
          else{dot.style.background='rgba(255,255,255,.13)';dot.style.boxShadow='none';dot.style.width='8px';dot.style.borderRadius='50%';}
        }
        window[D+'_cur']=n;
      };

      // 터치 스와이프
      const vp=document.getElementById(D+'_vp');
      if(vp){
        let tx=0;
        vp.addEventListener('touchstart',e=>{tx=e.changedTouches[0].screenX;},{passive:true});
        vp.addEventListener('touchend',e=>{
          const dx=e.changedTouches[0].screenX-tx;
          if(dx<-45)window[D+'_go'](window[D+'_cur']+1);
          if(dx>45) window[D+'_go'](window[D+'_cur']-1);
        },{passive:true});
      }

      window[D+'_go'](1);
    })();
    </script>`;
}

/* =========================================================
   오늘의 운세 — 행성 현황 렌더링
   ========================================================= */
function renderTodayPlanetPanel(todayData) {
  const panel     = _$("todayPlanetPanel");
  const dateLabel = _$("todayDateLabel");
  if (!panel) return;

  if (dateLabel) {
    const timeStr = todayData.currentTime ? ` ${todayData.currentTime}` : '';
    dateLabel.textContent = todayData.todayDate + timeStr + " KST 기준";
  }

  // 달의 위상 뱃지
  let moonPhaseEl = document.getElementById('todayMoonPhaseEl');
  if (!moonPhaseEl && dateLabel) {
    moonPhaseEl = document.createElement('div');
    moonPhaseEl.id = 'todayMoonPhaseEl';
    moonPhaseEl.style.cssText = 'margin:6px 0 10px;font-size:12px;padding:7px 12px;background:rgba(165,180,252,.07);border-radius:8px;border:1px solid rgba(165,180,252,.15);';
    dateLabel.after(moonPhaseEl);
  }
  if (moonPhaseEl && todayData.moonPhase) {
    const mp = todayData.moonPhase;
    moonPhaseEl.innerHTML =
      `${mp.phaseIcon} <span style="color:#a5b4fc;font-weight:600;">${mp.phaseName}</span>` +
      `<span style="color:#64748b;font-size:10px;margin-left:6px;">조도 ${mp.illumination}%</span>` +
      `<span style="color:#94a3b8;font-size:11px;margin-left:8px;">— ${mp.energy}</span>`;
  }

  // 프로그레션 태양/달 뱃지
  let progEl = document.getElementById('todayProgEl');
  if (!progEl && moonPhaseEl) {
    progEl = document.createElement('div');
    progEl.id = 'todayProgEl';
    progEl.style.cssText = 'margin-bottom:10px;font-size:11px;padding:7px 12px;background:rgba(52,211,153,.05);border-radius:8px;border:1px solid rgba(52,211,153,.12);display:flex;gap:16px;flex-wrap:wrap;';
    moonPhaseEl.after(progEl);
  }
  if (progEl && todayData.progression) {
    const pg = todayData.progression;
    progEl.innerHTML =
      `<span><span style="color:#34d399;font-size:10px;">☀ 프로그 태양</span> <span style="color:#e2e8f0;">${pg.sun.sign} ${pg.sun.degree}° · ${pg.sun.house}H</span></span>` +
      `<span><span style="color:#34d399;font-size:10px;">🌙 프로그 달</span> <span style="color:#e2e8f0;">${pg.moon.sign} ${pg.moon.degree}° · ${pg.moon.house}H</span></span>` +
      `<span><span style="color:#34d399;font-size:10px;">↑ 프로그 ASC</span> <span style="color:#e2e8f0;">${pg.asc.sign} ${pg.asc.degree}°</span></span>`;
  }

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

  // 프로그레션 → 트랜짓 에스펙트 아코디언
  {
    const existing = document.getElementById('todayProgTransitAspectPanel');
    if (existing) existing.remove();

    const progAspPanel = document.createElement('div');
    progAspPanel.id = 'todayProgTransitAspectPanel';
    progAspPanel.innerHTML = renderAspectAccordion(
      todayData.progTransitAspects, '프로그레션→트랜짓 에스펙트', '🔭', '#34d399'
    );
    const transitAspPanel = document.getElementById('todayAspectPanel');
    if (transitAspPanel) transitAspPanel.after(progAspPanel);
    else panel.after(progAspPanel);
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
      const birthCityName = getCitySelectValue();
      const { lat, lng, utcOffset } = getCityCoords(birthCityName);
      const todayCityName = _todayCity || birthCityName;
      const { lat: appLat, lng: appLng, utcOffset: appUtcOffset } = getCityCoords(todayCityName);

      const calcRes = await fetch("/api/astro-today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate, birthTime, lat, lng, name, gender, utcOffset, appLat, appLng, appUtcOffset })
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

    // 홈 화면 날짜 라벨
    const homeDateLabel = _$('homeDateLabel');
    if (homeDateLabel) {
      const now = new Date();
      homeDateLabel.textContent = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일`;
    }

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
