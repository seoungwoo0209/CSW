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

function renderShishenPillars(container, fourPillars) {
  const shishen = getFourPillarsShishen(fourPillars);
  const items   = [
    { label:"년간", data: shishen.year  },
    { label:"월간", data: shishen.month },
    { label:"일간", data: shishen.day   },
    { label:"시간", data: shishen.hour  }
  ];
  const grid = document.createElement("div");
  grid.className = "pillars";
  items.forEach(p => {
    const el = document.createElement("div");
    el.className = "pillar";
    el.innerHTML = `
      <div class="p-label">${p.label}</div>
      <div class="p-ganji">${p.data.stem}</div>
      <div class="p-shishen">${getShishenDisplay(p.data.shishen)}</div>
    `;
    grid.appendChild(el);
  });
  container.innerHTML = "";
  container.appendChild(grid);
}

function renderShishenHidden(container, fourPillars) {
  const hs = getHiddenStemsShishen(fourPillars);
  container.innerHTML = "";
  hs.forEach(data => {
    const row = document.createElement("div");
    row.className = "hiddenrow";
    const roleClass = r => r === "여기" ? "role-yeogi" : r === "중기" ? "role-junggi" : "role-jeonggi";
    row.innerHTML = `
      <div class="k">${data.label} (${data.branch})</div>
      <div class="v">${data.stems.map(item =>
        `${item.stem}<span class="${roleClass(item.role)}">${item.role}</span>
         <span class="shishen-label">${getShishenDisplay(item.shishen)}</span>`
      ).join(" ")}</div>
    `;
    container.appendChild(row);
  });
}

function renderDaeunList(container, decades) {
  container.innerHTML = "";
  const dayStem = window.SajuResult?.fourPillars?.day?.stem;
  const D = window.SajuData;

  decades.forEach(dec => {
    const card = document.createElement("div");
    card.className = "daeun-card";

    const stemSS = dayStem ? getShishen(dayStem, dec.stem) : null;
    const hiddenStems = D.HIDDEN_STEMS_BRANCH[dec.branch] || [];

    const hiddenHtml = dayStem ? hiddenStems.map(item => {
      const ss = getShishen(dayStem, item.stem);
      const rc = item.role === "여기" ? "role-yeogi" : item.role === "중기" ? "role-junggi" : "role-jeonggi";
      return `<span class="daeun-hidden-item">${item.stem}<span class="${rc}">(${item.role})</span>
              <span class="shishen-mini">${getShishenDisplay(ss)}</span></span>`;
    }).join("") : "";

    card.innerHTML = `
      <div class="daeun-header">
        <div class="daeun-num">${dec.index + 1}대운 (${dec.startAge}~${dec.endAge}세)</div>
        <div class="daeun-ganji">${dec.stem}${dec.branch}</div>
      </div>
      <div class="daeun-info">
        ${stemSS ? `<div class="daeun-stem-info">천간: <strong>${dec.stem}</strong> ${getShishenDisplay(stemSS)}</div>` : ""}
        ${hiddenStems.length ? `<div class="daeun-branch-info">
          <div class="daeun-branch-label">지지 (${dec.branch}) 지장간:</div>
          <div class="daeun-hidden-list">${hiddenHtml}</div>
        </div>` : ""}
      </div>
    `;
    container.appendChild(card);
  });
}

/* =========================================================
   PART 2: 분석 탭 렌더링 (격/신강/용희기한/점수)
   ========================================================= */

function renderGeokInfo(geok) {
  const c = _$("geokInfo");
  if (!c) return;
  c.innerHTML = `
    <div class="geok-card">
      <div class="geok-main">
        <span class="geok-label">격(格):</span>
        <span class="geok-name">${geok.main}</span>
        <span class="geok-purity">순도 ${(geok.purity * 100).toFixed(0)}%</span>
        ${geok.broken ? '<span class="geok-broken">⚠️ 파격</span>' : ''}
      </div>
      <div class="geok-notes">
        ${geok.notes.map(n => `<div class="geok-note">• ${n}</div>`).join('')}
      </div>
    </div>
  `;
}

function renderStrengthInfo(strength) {
  const c = _$("strengthInfo");
  if (!c) return;
  const color = strength.label === "신강" ? "#78ffa8"
              : strength.label === "신약" ? "#ff7a7a" : "#ffd36a";
  c.innerHTML = `
    <div class="strength-card">
      <div class="strength-score" style="color:${color}">
        <span class="strength-label">${strength.label}</span>
        <span class="strength-number">${strength.score.toFixed(1)}</span>
      </div>
      <div class="strength-breakdown">
        <div class="strength-item"><span>월령:</span><span>${strength.breakdown.season > 0 ? '+' : ''}${strength.breakdown.season}</span></div>
        <div class="strength-item"><span>통근:</span><span>${strength.breakdown.root > 0 ? '+' : ''}${strength.breakdown.root.toFixed(1)}</span></div>
        <div class="strength-item"><span>천간:</span><span>${strength.breakdown.stem > 0 ? '+' : ''}${strength.breakdown.stem}</span></div>
      </div>
    </div>
  `;
}

function renderGodsInfo(gods) {
  const c = _$("godsInfo");
  if (!c) return;
  const D  = window.SajuData;
  const fmt = list => list.map(tg => D.TEN_GODS_KR[tg] || tg).join(", ");
  c.innerHTML = `
    <div class="gods-grid">
      <div class="god-card yong">
        <div class="god-label">용신(用神)</div>
        <div class="god-content">${fmt(gods.yong.tenGods)}</div>
        <div class="god-elements">${gods.yong.elements.join(", ")}</div>
      </div>
      <div class="god-card hee">
        <div class="god-label">희신(喜神)</div>
        <div class="god-content">${fmt(gods.hee.tenGods)}</div>
        <div class="god-elements">${gods.hee.elements.join(", ")}</div>
      </div>
      <div class="god-card gi">
        <div class="god-label">기신(忌神)</div>
        <div class="god-content">${fmt(gods.gi.tenGods)}</div>
        <div class="god-elements">${gods.gi.elements.join(", ")}</div>
      </div>
      <div class="god-card han">
        <div class="god-label">한신(閑神)</div>
        <div class="god-content">${fmt(gods.han.tenGods)}</div>
        <div class="god-elements">${gods.han.elements.join(", ")}</div>
      </div>
    </div>
  `;
}

function renderBaseScore(scoreResult) {
  const c = _$("baseScore");
  if (!c) return;
  const { total, breakdown, helpRisk, presetDelta } = scoreResult;

  const gradeInfo = [
    { min:80, label:"매우 좋음", color:"#78ffa8" },
    { min:70, label:"좋음",      color:"#9ed0ff" },
    { min:60, label:"평범",      color:"#ffd36a" },
    { min:50, label:"주의",      color:"#ffb27a" },
    { min:0,  label:"어려움",    color:"#ff7a7a" },
  ].find(g => total >= g.min);

  let helpRiskHtml = "";
  if (helpRisk?.tenGod) {
    const topHelp = Object.entries(helpRisk.tenGod.help).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const topRisk = Object.entries(helpRisk.tenGod.risk).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const D = window.SajuData;
    helpRiskHtml = `
      <div class="help-risk-summary">
        <div class="help-section">
          <div class="help-label">도움 요소</div>
          ${topHelp.map(([tg,v]) => `<span class="help-item">${D.TEN_GODS_KR[tg]}(${(v*100).toFixed(0)}%)</span>`).join('')}
        </div>
        <div class="risk-section">
          <div class="risk-label">주의 요소</div>
          ${topRisk.map(([tg,v]) => `<span class="risk-item">${D.TEN_GODS_KR[tg]}(${(v*100).toFixed(0)}%)</span>`).join('')}
        </div>
      </div>
    `;
  }

  const presetHtml = (presetDelta !== undefined && presetDelta !== 0)
    ? `<div class="preset-impact"><span>프리셋 영향: ${presetDelta > 0 ? '+' : ''}${presetDelta.toFixed(1)}점</span></div>`
    : "";

  c.innerHTML = `
    <div class="base-score-card">
      <div class="score-main">
        <div class="score-number" style="color:${gradeInfo.color}">${total}</div>
        <div class="score-label">${gradeInfo.label}</div>
      </div>
      ${presetHtml}
      ${helpRiskHtml}
      <div class="score-breakdown">
        <div class="breakdown-title">점수 상세</div>
        <div class="breakdown-grid">
          <div class="breakdown-item"><span class="breakdown-label">오행 균형</span><span class="breakdown-value">${breakdown.balance}</span></div>
          <div class="breakdown-item"><span class="breakdown-label">신강약</span><span class="breakdown-value">${breakdown.strength}</span></div>
          <div class="breakdown-item"><span class="breakdown-label">격 유지</span><span class="breakdown-value">${breakdown.geok}</span></div>
          <div class="breakdown-item"><span class="breakdown-label">용희기한</span><span class="breakdown-value">${breakdown.yhgh}</span></div>
          <div class="breakdown-item"><span class="breakdown-label">합충</span><span class="breakdown-value">${breakdown.interaction}</span></div>
          <div class="breakdown-item"><span class="breakdown-label">프로파일</span><span class="breakdown-value">${breakdown.profile}</span></div>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   PART 3: 대운 점수 렌더링
   ========================================================= */

function _mergeDaeunState(baseState, decade) {
  const D = window.SajuData;
  const mergedPillars = {
    ...baseState.pillars,
    daeun: { stem: decade.stem, branch: decade.branch }
  };

  const dayStem = baseState.pillars.day.stem;
  const elements = { ...baseState.vectors.elements };
  const tenGods  = { ...baseState.vectors.tenGods };

  const dEl = D.WUXING_STEM[decade.stem];
  if (dEl) elements[dEl] = (elements[dEl] || 0) + 1.0;
  const dSS = getShishen(dayStem, decade.stem);
  if (dSS) tenGods[dSS] = (tenGods[dSS] || 0) + 1.0;

  (D.HIDDEN_STEMS_RATIO[decade.branch] || []).forEach(({ stem, ratio }) => {
    const el = D.WUXING_STEM[stem];
    if (el) elements[el] = (elements[el] || 0) + ratio;
    const ss = getShishen(dayStem, stem);
    if (ss) tenGods[ss] = (tenGods[ss] || 0) + ratio;
  });

  const vectors  = { ...baseState.vectors, elements, tenGods };
  const geok     = window.SajuEngine.determineGeok(mergedPillars, vectors);
  const gods     = window.SajuEngine.classifyYongHeeGiHan({ pillars: mergedPillars, vectors, strength: baseState.strength, geok });
  const interactions = _detectDaeunInteractions(baseState.pillars, decade);

  return { pillars: mergedPillars, vectors, strength: baseState.strength, geok, gods, interactions };
}

function _detectDaeunInteractions(pillars, decade) {
  const D = window.SajuData;
  const interactions = { 합:[], 충:[], 형:[], criticalHits:[] };
  const natalBranches = [pillars.year.branch, pillars.month.branch, pillars.day.branch, pillars.hour.branch];
  const db = decade.branch;

  for (const [a,b] of D.EARTHLY_CLASHES) {
    if ((db === a && natalBranches.includes(b)) || (db === b && natalBranches.includes(a))) {
      const opp     = db === a ? b : a;
      const critical = pillars.month.branch === opp || pillars.day.branch === opp;
      interactions.충.push({ branches:[db, opp], critical, source:"대운" });
      if (critical) interactions.criticalHits.push(`대운 ${db}이 ${opp} 충격`);
    }
  }
  for (const [a,b] of D.EARTHLY_SIX_COMBINATIONS) {
    if ((db === a && natalBranches.includes(b)) || (db === b && natalBranches.includes(a)))
      interactions.합.push({ type:"육합", branches:[a,b], source:"대운" });
  }
  for (const g of D.EARTHLY_THREE_COMBINATIONS) {
    if (g.branches.includes(db)) {
      const cnt = natalBranches.filter(b => g.branches.includes(b)).length;
      if (cnt >= 1) interactions.합.push({
        type: cnt >= 2 ? "삼합완성" : "삼합반합",
        branches: g.branches, element: g.element, source:"대운"
      });
    }
  }
  return interactions;
}

function renderDaeunScores(baseState, profileName = "overall") {
  const listEl  = _$("daeunList");
  if (!listEl) return;
  const cards   = listEl.querySelectorAll(".daeun-card");
  const decades = window.SajuResult?.daeunTimeline?.decades;
  if (!decades) return;

  console.log(`\n🎯 대운 점수 계산 (${profileName})`);

  decades.forEach((decade, idx) => {
    if (idx >= cards.length) return;
    const card         = cards[idx];
    const daeunState   = _mergeDaeunState(baseState, decade);
    const scoreResult  = window.SajuEngine.computeTotalScore(daeunState, profileName);
    const g            = _grade(scoreResult.total);

    console.log(`${decade.stem}${decade.branch}: ${scoreResult.total}점 (${g})`);

    const header = card.querySelector(".daeun-header");
    if (header) {
      const existing = header.querySelector(".daeun-score");
      if (existing) existing.remove();
      const scoreEl = document.createElement("div");
      scoreEl.className = `daeun-score grade-${g}`;
      scoreEl.innerHTML = `<div class="grade-letter">${g}</div><div class="grade-number">${scoreResult.total}점</div>`;
      header.appendChild(scoreEl);
    }

    const info = card.querySelector(".daeun-info");
    if (info) {
      const existing = info.querySelector(".daeun-breakdown");
      if (existing) existing.remove();
      const bEl = document.createElement("div");
      bEl.className = "daeun-breakdown";
      bEl.innerHTML = `
        <div class="breakdown-mini">
          <span>균형:${scoreResult.breakdown.balance}</span>
          <span>신강:${scoreResult.breakdown.strength}</span>
          <span>격:${scoreResult.breakdown.geok}</span>
          <span>용희기한:${scoreResult.breakdown.yhgh}</span>
          <span>합충:${scoreResult.breakdown.interaction}</span>
        </div>
      `;
      info.appendChild(bEl);
    }
  });

  console.log("✅ 대운 점수 렌더링 완료");
}

/* =========================================================
   PART 4: 능력 분석 렌더링 (원국 고정)
   ========================================================= */

function renderIntuitionPanel(result) {
  const c = _$("intuitionPanel");
  if (!c) return;

  const { insightTotal, typeName, typeDesc, comment, subs6 } = result;
  const gradeColor = { S:"#6c3fc4", A:"#2563eb", B:"#0891b2", C:"#65a30d", D:"#9ca3af" };
  const totalGrade = insightTotal >= 90 ? "S"
                   : insightTotal >= 80 ? "A"
                   : insightTotal >= 70 ? "B"
                   : insightTotal >= 60 ? "C" : "D";
  const gradeLabel = insightTotal >= 90 ? "최상위"
                   : insightTotal >= 80 ? "상위"
                   : insightTotal >= 70 ? "중상"
                   : insightTotal >= 60 ? "중위" : "하위";

  const mainHtml = `
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);border-radius:16px;padding:24px 20px;text-align:center;margin-bottom:16px;box-shadow:0 4px 20px rgba(99,60,196,.3);">
      <div style="font-size:13px;color:#a5b4fc;letter-spacing:2px;margin-bottom:8px;">직장 통찰력 분석</div>
      <div style="font-size:68px;font-weight:900;color:#fff;line-height:1;margin-bottom:6px;">${insightTotal}</div>
      <div style="display:inline-block;background:${gradeColor[totalGrade]};color:#fff;font-size:13px;font-weight:700;padding:3px 14px;border-radius:20px;margin-bottom:12px;">${totalGrade}등급 · ${gradeLabel}</div>
      <div style="font-size:16px;font-weight:700;color:#c7d2fe;margin-bottom:4px;">${typeName}</div>
      <div style="font-size:12px;color:#818cf8;margin-bottom:14px;">${typeDesc}</div>
      <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;font-size:12px;">
        <div style="background:rgba(165,180,252,.15);padding:5px 12px;border-radius:10px;color:#c7d2fe;">💡 ${comment.strength}</div>
        <div style="background:rgba(165,180,252,.10);padding:5px 12px;border-radius:10px;color:#a5b4fc;">🔧 ${comment.weakness}</div>
      </div>
    </div>
  `;

  const icons   = ["🏢","⚠️","🔍"];
  const weights = ["42%","34%","24%"];
  const subsHtml = `
    <div style="margin-bottom:8px;font-size:13px;font-weight:600;color:#6b7280;padding-left:2px;">세부 3지표</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${(subs6 || []).map((sub, i) => {
        const bc = sub.score >= 90 ? "#7c3aed"
                 : sub.score >= 80 ? "#2563eb"
                 : sub.score >= 70 ? "#0891b2"
                 : sub.score >= 60 ? "#65a30d" : "#9ca3af";
        return `
          <div style="background:#f9fafb;border-radius:10px;padding:10px 14px;border:1px solid #e5e7eb;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
              <div style="font-size:13px;font-weight:600;color:#374151;">
                ${icons[i]||"📊"} ${sub.name}
                <span style="font-size:11px;color:#9ca3af;font-weight:400;margin-left:4px;">(${weights[i]||""})</span>
              </div>
              <div style="font-size:18px;font-weight:800;color:${bc};">
                ${sub.score}<span style="font-size:11px;font-weight:500;color:#9ca3af;margin-left:2px;">${sub.grade}</span>
              </div>
            </div>
            <div style="background:#e5e7eb;border-radius:4px;height:5px;overflow:hidden;">
              <div style="background:${bc};height:100%;width:${sub.score}%;border-radius:4px;transition:width .6s;"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  c.innerHTML = mainHtml + subsHtml;
}

/* =========================================================
   PART 5: 프로파일 변경 핸들러
   ⚠️ 능력분석은 프로파일 무관, 원국 고정
   ========================================================= */

function onProfileChange(profileName) {
  console.log(`\n🔄 프로파일 변경: ${profileName}`);
  if (!window.SajuResult) return;

  const baseState = window.SajuEngine.buildState(window.SajuResult.fourPillars);
  const baseScore = window.SajuEngine.computeTotalScore(baseState, profileName);
  renderBaseScore(baseScore);
  renderDaeunScores(baseState, profileName);
  // ⚠️ 능력분석(직관)은 재렌더링 안 함 — 원국 고정
}

/* =========================================================
   PART 6: 전체 분석 렌더링 (앱 진입점에서 호출)
   ========================================================= */

function renderFullAnalysis(profileName = "overall") {
  console.log("\n🎯 전체 분석 렌더링 시작");
  if (!window.SajuResult) { console.warn("⚠️ SajuResult 없음"); return; }

  const baseState = window.SajuEngine.buildState(window.SajuResult.fourPillars);

  // 원국 분석 탭
  renderGeokInfo(baseState.geok);
  renderStrengthInfo(baseState.strength);
  renderGodsInfo(baseState.gods);

  const baseScore = window.SajuEngine.computeTotalScore(baseState, profileName);
  renderBaseScore(baseScore);

  // 대운 점수
  renderDaeunScores(baseState, profileName);

  // 능력분석 (원국 고정)
  if (window.IntuitionEngine) {
    const result = window.IntuitionEngine.compute(baseState);
    renderIntuitionPanel(result);
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
  renderShishenPillars,
  renderShishenHidden,
  renderDaeunList,
  renderGeokInfo,
  renderStrengthInfo,
  renderGodsInfo,
  renderBaseScore,
  renderDaeunScores,
  renderIntuitionPanel,
  renderFullAnalysis,
  onProfileChange
};

console.log("✅ saju_ui.js 로드 완료");
