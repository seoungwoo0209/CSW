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
   PART 2: 5축 자원 분석 패널 렌더링 (신규)
   격/신강약/원국총점 카드 → 5개 자원 점수형 UI로 전면 교체
   ========================================================= */

function renderResourcePanel(resourceResult) {
  const c = _$("resourcePanel");
  if (!c) return;

  const { axes, strongest, weakest, summary } = resourceResult;

  // 역할 뱃지 색상
  const roleColor = {
    "용신": { bg:"rgba(120,255,168,.18)", border:"rgba(120,255,168,.55)", text:"#78ffa8" },
    "희신": { bg:"rgba(158,208,255,.18)", border:"rgba(158,208,255,.55)", text:"#9ed0ff" },
    "기신": { bg:"rgba(255,122,122,.18)", border:"rgba(255,122,122,.55)", text:"#ff7a7a" },
    "한신": { bg:"rgba(255,211,106,.18)", border:"rgba(255,211,106,.55)", text:"#ffd36a" },
    "중립": { bg:"rgba(255,255,255,.08)", border:"rgba(255,255,255,.20)", text:"#cbd3f0"  },
  };

  // 점수 → 바 색상
  function barColor(score) {
    if (score >= 82) return "linear-gradient(90deg,#78ffa8,#9ed0ff)";
    if (score >= 66) return "linear-gradient(90deg,#9ed0ff,#c084fc)";
    if (score >= 48) return "linear-gradient(90deg,#ffd36a,#9ed0ff)";
    if (score >= 32) return "linear-gradient(90deg,#ffb27a,#ffd36a)";
    return "linear-gradient(90deg,#ff7a7a,#ffb27a)";
  }

  // 점수 → 강/중/약 텍스트 색
  function statusColor(status) {
    if (status === "매우 강함") return "#78ffa8";
    if (status === "강한 편")   return "#9ed0ff";
    if (status === "보통")      return "#ffd36a";
    if (status === "약한 편")   return "#ffb27a";
    return "#ff7a7a";
  }

  // 아이콘
  const icons = { 비겁:"⚡", 식상:"✨", 재성:"💎", 관성:"🏛", 인성:"📚" };

  // 상단 요약 카드
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

  // 5개 축 카드
  const axesHtml = axes.map(axis => {
    const rc  = roleColor[axis.role] || roleColor["중립"];
    const barW = Math.round((axis.score / 100) * 100);
    return `
      <div style="
        background:rgba(18,22,42,.78);border:1px solid rgba(255,255,255,.10);
        border-radius:14px;padding:16px;margin-bottom:10px;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:20px;">${icons[axis.key]||"📊"}</span>
            <div>
              <div style="font-size:15px;font-weight:800;color:#f5f7ff;letter-spacing:.3px;">
                ${axis.key}
              </div>
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
          <span style="font-size:10px;color:#475569;">20</span>
          <span style="font-size:10px;color:#475569;">100</span>
        </div>
      </div>
    `;
  }).join("");

  // 하단 분포 요약
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

// 기존 함수들 — 내부적으로는 유지 (대운 점수 등 일부에서 참조 가능)
// tab-analysis에서는 더 이상 호출되지 않음
function renderGeokInfo(geok) {
  const c = _$("geokInfo"); if (c) c.innerHTML = "";
}
function renderStrengthInfo(strength) {
  const c = _$("strengthInfo"); if (c) c.innerHTML = "";
}
function renderGodsInfo(gods) {
  const c = _$("godsInfo"); if (c) c.innerHTML = "";
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
  // ── 대운 완전 재계산형: 원국 strength 복사 금지
  // buildExtendedStateWithExtraPillar()로 vectors/strength/geok/interactions/gods 전부 재산출
  const extraPillar = { stem: decade.stem, branch: decade.branch, label: "대운" };
  return window.SajuEngine.buildExtendedStateWithExtraPillar(baseState.pillars, extraPillar);
}

function _detectDaeunInteractions(pillars, decade) {
  const D = window.SajuData;
  const interactions = { 합:[], 충:[], 형:[], 파:[], 해:[], criticalHits:[] };
  const natalBranches = [pillars.year.branch, pillars.month.branch, pillars.day.branch, pillars.hour.branch];
  const db = decade.branch;
  const KEY = [pillars.month.branch, pillars.day.branch];

  function isCritical(b) { return KEY.includes(b); }

  // 충
  for (const [a,b] of D.EARTHLY_CLASHES) {
    if ((db === a && natalBranches.includes(b)) || (db === b && natalBranches.includes(a))) {
      const opp      = db === a ? b : a;
      const critical = isCritical(opp);
      interactions.충.push({ type:"충", branches:[db, opp], critical, source:"대운" });
      if (critical) interactions.criticalHits.push(`대운 ${db}이 ${opp} 충격`);
    }
  }
  // 육합
  for (const [a,b] of D.EARTHLY_SIX_COMBINATIONS) {
    if ((db === a && natalBranches.includes(b)) || (db === b && natalBranches.includes(a)))
      interactions.합.push({ type:"육합", branches:[a,b], source:"대운" });
  }
  // 삼합
  for (const g of D.EARTHLY_THREE_COMBINATIONS) {
    if (g.branches.includes(db)) {
      const cnt = natalBranches.filter(b => g.branches.includes(b)).length;
      if (cnt >= 1) interactions.합.push({
        type: cnt >= 2 ? "삼합완성" : "삼합반합",
        branches: g.branches, element: g.element, source:"대운"
      });
    }
  }
  // 형 (삼형: 寅巳申, 丑戌未 / 상형: 子卯 / 자형: 辰午酉亥)
  const SAMHYEONG = [["寅","巳","申"], ["丑","戌","未"]];
  for (const grp of SAMHYEONG) {
    if (grp.includes(db)) {
      const hits = grp.filter(b => b === db || natalBranches.includes(b));
      if (hits.length >= 2) {
        const critical = hits.some(b => b !== db && isCritical(b));
        interactions.형.push({ type:"삼형", branches:hits, critical, source:"대운" });
        if (critical) interactions.criticalHits.push(`대운 ${db} 삼형`);
      }
    }
  }
  for (const [a,b] of [["子","卯"]]) {
    if ((db === a && natalBranches.includes(b)) || (db === b && natalBranches.includes(a))) {
      const opp = db === a ? b : a;
      const critical = isCritical(opp);
      interactions.형.push({ type:"상형", branches:[db, opp], critical, source:"대운" });
      if (critical) interactions.criticalHits.push(`대운 ${db} 상형`);
    }
  }
  for (const jb of ["辰","午","酉","亥"]) {
    if (db === jb && natalBranches.includes(jb)) {
      const critical = isCritical(jb);
      interactions.형.push({ type:"자형", branches:[jb, jb], critical, source:"대운" });
      if (critical) interactions.criticalHits.push(`대운 ${db} 자형`);
    }
  }
  // 파 (子酉 卯午 辰丑 未戌 寅亥 巳申)
  const PA = [["子","酉"],["卯","午"],["辰","丑"],["未","戌"],["寅","亥"],["巳","申"]];
  for (const [a,b] of PA) {
    if ((db === a && natalBranches.includes(b)) || (db === b && natalBranches.includes(a))) {
      const opp = db === a ? b : a;
      const critical = isCritical(opp);
      interactions.파.push({ type:"파", branches:[db, opp], critical, source:"대운" });
      if (critical) interactions.criticalHits.push(`대운 ${db} 파`);
    }
  }
  // 해 (子未 丑午 寅巳 卯辰 申亥 酉戌)
  const HAE = [["子","未"],["丑","午"],["寅","巳"],["卯","辰"],["申","亥"],["酉","戌"]];
  for (const [a,b] of HAE) {
    if ((db === a && natalBranches.includes(b)) || (db === b && natalBranches.includes(a))) {
      const opp = db === a ? b : a;
      const critical = isCritical(opp);
      interactions.해.push({ type:"해", branches:[db, opp], critical, source:"대운" });
      if (critical) interactions.criticalHits.push(`대운 ${db} 해`);
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

  // 원국 strength.score — supportScore 델타 계산용
  const baseStrengthScore = baseState.strength?.score ?? 50;

  console.log(`\n🎯 대운 3축 점수 계산 (${profileName})`);

  decades.forEach((decade, idx) => {
    if (idx >= cards.length) return;
    const card       = cards[idx];
    const daeunState = _mergeDaeunState(baseState, decade);

    // ── 3축 점수 (범용형, 특정 명식/나이 예외 없음)
    // baseState: delta 계산용 / profileName: 가중치 조합용
    const daeunScore = window.SajuEngine.computeDaeunScore(daeunState, baseStrengthScore, baseState, profileName);
    const { overall, performance, friction, support } = daeunScore;
    const g = _grade(overall);

    const _raw   = daeunScore._raw   || {};
    const _debug = daeunScore._debug || {};
    console.log(`${decade.stem}${decade.branch}: 종합${overall} 성과${performance}(raw:${_raw.rawPerformance}) 기반${support}(raw:${_raw.rawSupport}) 마찰${friction}(raw:${_raw.rawFriction}) [${profileName}] (${g})`);
    console.debug(`  📊 [대운 debug] ${decade.stem}${decade.branch}`, {
      strength:    daeunState.strength?.score,
      label:       daeunState.strength?.label,
      geokMain:    daeunState.geok?.main,
      geokPurity:  daeunState.geok?.purity?.toFixed(2),
      geokBroken:  daeunState.geok?.broken,
      geokRecover: daeunState.geok?.recovery,
      yong:        daeunState.gods?.yong?.tenGods,
      gi:          daeunState.gods?.gi?.tenGods,
      rawPerformance:  _raw.rawPerformance,
      rawSupport:      _raw.rawSupport,
      rawFriction:     _raw.rawFriction,
      perfDelta:       _debug.perfDelta,
      purityDelta:     _debug.purityDelta,
      strengthDelta:   _debug.strengthDelta,
      closenessGain:   _debug.closenessGain,
      productive:      `${_debug.productiveCount}/${_debug.isProductive}`,
      profileName:     _debug.profileName,
      performance, support, friction, overall,
    });

    // ── 헤더: 종합 점수 + 등급
    const header = card.querySelector(".daeun-header");
    if (header) {
      const existing = header.querySelector(".daeun-score");
      if (existing) existing.remove();
      const scoreEl = document.createElement("div");
      scoreEl.className = `daeun-score grade-${g}`;
      scoreEl.innerHTML = `<div class="grade-letter">${g}</div><div class="grade-number">${overall}점</div>`;
      header.appendChild(scoreEl);
    }

    // ── 카드 본문: 3축 분리 표시
    const info = card.querySelector(".daeun-info");
    if (info) {
      const existing = info.querySelector(".daeun-breakdown");
      if (existing) existing.remove();
      const bEl = document.createElement("div");
      bEl.className = "daeun-breakdown";
      bEl.innerHTML = `
        <div class="breakdown-mini">
          <span title="현실 성과·실행력 (raw:${_raw.rawPerformance})">성과:${performance}</span>
          <span title="버티는 힘·기반 안정 (raw:${_raw.rawSupport})">기반:${support}</span>
          <span title="마찰·소모 낮을수록 편안 (raw:${_raw.rawFriction})">마찰:${friction}</span>
        </div>
        <div class="breakdown-mini" style="font-size:11px;opacity:0.65;margin-top:2px;">
          <span>신강약:${daeunState.strength?.score ?? "-"}</span>
          <span>${daeunState.strength?.label ?? ""}</span>
          <span>格순도:${daeunState.geok?.purity ? (daeunState.geok.purity * 100).toFixed(0) + "%" : "-"}</span>
        </div>
      `;
      info.appendChild(bEl);
    }
  });

  console.log("✅ 대운 3축 점수 렌더링 완료");
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
  const weights = ["40%","22%","38%"];
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

  const baseState = window.SajuEngine.buildState(window.SajuResult.fourPillars);

  // 5축 자원 분석 (메인 분석 탭)
  if (window.SajuEngine.computeResourceScores) {
    const resourceResult = window.SajuEngine.computeResourceScores(baseState);
    renderResourcePanel(resourceResult);
  }

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
  renderResourcePanel,
  renderDaeunScores,
  renderIntuitionPanel,
  renderFullAnalysis,
  onProfileChange
};

console.log("✅ saju_ui.js 로드 완료");
