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
