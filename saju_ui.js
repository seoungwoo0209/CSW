/* =========================================================
   사주 UI (saju_ui.js) — 렌더링 전담
   ⚠️ getShishen 정의 없음 → saju_core.js 전역 사용
   ⚠️ window.SajuEngine.getShishen 참조 제거
   ⚠️ 능력분석(직관)은 원국 고정 — 프로파일 변경과 무관
   ========================================================= */

console.log("🔥 saju_ui.js 로드 시작");

/* =========================================================
   내부 유틸
   ========================================================= */
function _$(id) { return document.getElementById(id); }

function _grade(total) {
  if (total >= 88) return "S";
  if (total >= 75) return "A";
  if (total >= 65) return "B";
  if (total >= 55) return "C";
  if (total >= 45) return "D";
  return "F";
}

/* =========================================================
   PART 1: 원국 기본 렌더링 (사주/지장간/십신 탭)
   ========================================================= */

function renderPillars(fourPillars) {
  const ids = ["p-year","p-month","p-day","p-hour"];
  [fourPillars.year, fourPillars.month, fourPillars.day, fourPillars.hour].forEach((p, i) => {
    const el = _$(ids[i]);
    if (!el) return;
    el.textContent = p.stem + p.branch;
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    setTimeout(() => {
      el.style.transition = "opacity 0.4s ease, transform 0.4s ease";
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    }, i * 100);
  });
}

function renderBars(container, counts) {
  const D   = window.SajuData;
  const max = Math.max(...Object.values(counts), 1);
  container.innerHTML = "";
  for (const wx of ["wood","fire","earth","metal","water"]) {
    const val = counts[wx];
    const pct = (val / max) * 100;
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.innerHTML = `
      <div class="name">${D.WUXING_LABEL[wx]}</div>
      <div class="track"><div class="fill" style="width:0%"></div></div>
      <div class="val">${val}</div>
    `;
    container.appendChild(bar);
    setTimeout(() => {
      const fill = bar.querySelector(".fill");
      if (fill) { fill.style.transition = "width 0.8s ease"; fill.style.width = pct + "%"; }
    }, 50);
  }
}

function renderHiddenList(container, fourPillars) {
  const D = window.SajuData;
  container.innerHTML = "";
  [
    { label:"년지", branch: fourPillars.year.branch  },
    { label:"월지", branch: fourPillars.month.branch },
    { label:"일지", branch: fourPillars.day.branch   },
    { label:"시지", branch: fourPillars.hour.branch  }
  ].forEach(p => {
    const hs = D.HIDDEN_STEMS_BRANCH[p.branch];
    if (!hs) return;
    const row = document.createElement("div");
    row.className = "hiddenrow";
    const roleClass = r => r === "여기" ? "role-yeogi" : r === "중기" ? "role-junggi" : "role-jeonggi";
    row.innerHTML = `
      <div class="k">${p.label} (${p.branch})</div>
      <div class="v">${hs.map(item => `${item.stem}<span class="${roleClass(item.role)}">${item.role}</span>`).join(" ")}</div>
    `;
    container.appendChild(row);
  });
}


/* =========================================================
   PART 5: 프로파일 변경 핸들러
   ========================================================= */

function onProfileChange(profileName) {
  console.log(`\n🔄 프로파일 변경: ${profileName}`);
  if (!window.SajuResult) return;
  const baseState = window.SajuEngine.buildState(window.SajuResult.fourPillars);
  renderDaeunScores(baseState, profileName);
  // 능력분석·5축 자원은 프로파일 무관 (원국 고정)
}

/* =========================================================
   PART 6: 전체 분석 렌더링 (앱 진입점에서 호출)
   ========================================================= */

function renderFullAnalysis(profileName = "overall") {
  console.log("\n🎯 전체 분석 렌더링 시작");
  if (!window.SajuResult) { console.warn("⚠️ SajuResult 없음"); return; }
  if (!window.SajuEngine?.buildState) { console.warn("⚠️ SajuEngine 미로드"); return; }

  const baseState = window.SajuEngine.buildState(window.SajuResult.fourPillars);

  // 5축 자원 분석
  if (window.SajuEngine.computeResourceScores) {
    const resourceResult = window.SajuEngine.computeResourceScores(baseState);
    renderResourcePanel(resourceResult);
  }

  console.log("✅ 전체 분석 렌더링 완료\n");
}

/* =========================================================
   Export
   ========================================================= */
window.SajuUI = {
  renderPillars,
  renderBars,
  renderHiddenList,
  renderGeokInfo,
  renderStrengthInfo,
  renderGodsInfo,
  renderBaseScore,
  renderResourcePanel,
  renderFullAnalysis,
};

console.log("✅ saju_ui.js 로드 완료");
