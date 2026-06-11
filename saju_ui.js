/* =========================================================
   사주 UI (saju_ui.js) — 렌더링 전담
   ========================================================= */

console.log("🔥 saju_ui.js 로드 시작");

function _$(id) { return document.getElementById(id); }

/* =========================================================
   PART 1: 원국 기본 렌더링
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
   PART 2: 5축 자원 분석 패널
   ========================================================= */

function renderResourcePanel(resourceResult) {
  const c = _$("resourcePanel");
  if (!c) return;

  const { axes, strongest, weakest, summary } = resourceResult;

  const roleColor = {
    "용신": { bg:"rgba(120,255,168,.18)", border:"rgba(120,255,168,.55)", text:"#78ffa8" },
    "희신": { bg:"rgba(158,208,255,.18)", border:"rgba(158,208,255,.55)", text:"#9ed0ff" },
    "기신": { bg:"rgba(255,122,122,.18)", border:"rgba(255,122,122,.55)", text:"#ff7a7a" },
    "한신": { bg:"rgba(255,211,106,.18)", border:"rgba(255,211,106,.55)", text:"#ffd36a" },
    "중립": { bg:"rgba(255,255,255,.08)", border:"rgba(255,255,255,.20)", text:"#cbd3f0" },
  };

  const AXIS_SCORE_MIN = 25;
  const AXIS_SCORE_MAX = 210;

  function barColor(score) {
    if (score >= 160) return "linear-gradient(90deg,#78ffa8,#9ed0ff)";
    if (score >= 130) return "linear-gradient(90deg,#9ed0ff,#c084fc)";
    if (score >= 100) return "linear-gradient(90deg,#ffd36a,#9ed0ff)";
    if (score >=  70) return "linear-gradient(90deg,#ffb27a,#ffd36a)";
    return "linear-gradient(90deg,#ff7a7a,#ffb27a)";
  }

  function statusColor(status) {
    if (status === "매우 강함") return "#78ffa8";
    if (status === "강한 편")   return "#9ed0ff";
    if (status === "보통")      return "#ffd36a";
    if (status === "약한 편")   return "#ffb27a";
    return "#ff7a7a";
  }

  const icons = { 비겁:"⚡", 식상:"✨", 재성:"💎", 관성:"🏛", 인성:"📚" };

  const topCard = `
    <div style="
      background:linear-gradient(135deg,rgba(18,22,42,.92),rgba(30,27,75,.88));
      border:1px solid rgba(158,208,255,.25);border-radius:16px;
      padding:20px;margin-bottom:14px;
    ">
      <div style="font-size:12px;color:#a5b4fc;letter-spacing:2px;margin-bottom:10px;">사주 자원 분석</div>
      <div style="font-size:14px;color:#e2e8f0;margin-bottom:14px;line-height:1.6;">${summary}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div style="background:rgba(120,255,168,.12);border:1px solid rgba(120,255,168,.35);
             border-radius:10px;padding:6px 14px;font-size:12px;color:#78ffa8;">
          💪 강점 · ${strongest.key} ${strongest.score}점
        </div>
        <div style="background:rgba(255,122,122,.10);border:1px solid rgba(255,122,122,.35);
             border-radius:10px;padding:6px 14px;font-size:12px;color:#ff9999;">
          🔧 보완 · ${weakest.key} ${weakest.score}점
        </div>
      </div>
    </div>
  `;

  const axesHtml = axes.map(axis => {
    const rc  = roleColor[axis.role] || roleColor["중립"];
    const normalized = (axis.score - AXIS_SCORE_MIN) / (AXIS_SCORE_MAX - AXIS_SCORE_MIN);
    const barW = Math.round(Math.max(0, Math.min(1, normalized)) * 100);
    return `
      <div style="
        background:rgba(18,22,42,.78);border:1px solid rgba(255,255,255,.10);
        border-radius:14px;padding:16px;margin-bottom:10px;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:20px;">${icons[axis.key]||"📊"}</span>
            <div>
              <div style="font-size:15px;font-weight:800;color:#f5f7ff;">${axis.key}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${axis.desc}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <span style="
              background:${rc.bg};border:1px solid ${rc.border};
              color:${rc.text};font-size:11px;font-weight:700;
              padding:3px 10px;border-radius:20px;
            ">${axis.role}</span>
            <div style="text-align:right;">
              <div style="font-size:26px;font-weight:900;color:${statusColor(axis.status)};line-height:1;">
                ${axis.score}
              </div>
              <div style="font-size:11px;color:#94a3b8;">${axis.status}</div>
            </div>
          </div>
        </div>
        <div style="background:rgba(255,255,255,.08);border-radius:6px;height:7px;overflow:hidden;">
          <div style="
            background:${barColor(axis.score)};
            height:100%;width:${barW}%;border-radius:6px;
            transition:width .8s cubic-bezier(.4,0,.2,1);
          "></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;">
          <span style="font-size:10px;color:#475569;">25</span>
          <span style="font-size:10px;color:#475569;">210</span>
        </div>
      </div>
    `;
  }).join("");

  const sortedAxes = [...axes].sort((a, b) => b.score - a.score);
  const bottomCard = `
    <div style="
      background:rgba(18,22,42,.60);border:1px solid rgba(255,255,255,.08);
      border-radius:14px;padding:14px 16px;margin-top:4px;
    ">
      <div style="font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:10px;letter-spacing:1px;">분포 요약</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${sortedAxes.map((a, i) => `
          <div style="
            background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);
            border-radius:8px;padding:5px 10px;font-size:12px;
            color:${i === 0 ? '#78ffa8' : i === sortedAxes.length-1 ? '#ff9999' : '#cbd3f0'};
          ">
            ${a.key} <strong>${a.score}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  c.innerHTML = topCard + axesHtml + bottomCard;
}

/* =========================================================
   PART 3: stub 함수들 (export 에러 방지)
   ========================================================= */
function renderGeokInfo()     {}
function renderStrengthInfo() {}
function renderGodsInfo()     {}
function renderBaseScore()    {}

/* =========================================================
   PART 4: 전체 분석 렌더링
   ========================================================= */

function renderFullAnalysis() {
  if (!window.SajuResult) return;
  if (!window.SajuEngine?.buildState) return;

  const baseState = window.SajuEngine.buildState(window.SajuResult.fourPillars);

  if (window.SajuEngine.computeResourceScores) {
    const resourceResult = window.SajuEngine.computeResourceScores(baseState);
    renderResourcePanel(resourceResult);
  }
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
