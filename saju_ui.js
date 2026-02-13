/* =========================================================
   사주 UI 렌더링 (saju_ui.js)
   - 격/용희기한 표시
   - 점수 breakdown 렌더링
   - 대운 점수 표시
   ========================================================= */

console.log("🔥 saju_ui.js 로드");

/* =========================================================
   PART 1: 원국 분석 렌더링
   ========================================================= */

/**
 * 격 정보 렌더링
 */
function renderGeokInfo(geok) {
  const container = document.getElementById("geokInfo");
  if (!container) return;
  
  container.innerHTML = `
    <div class="geok-card">
      <div class="geok-main">
        <span class="geok-label">격(格):</span>
        <span class="geok-name">${geok.main}</span>
        <span class="geok-purity">순도 ${(geok.purity * 100).toFixed(0)}%</span>
        ${geok.broken ? '<span class="geok-broken">⚠️ 파격</span>' : ''}
      </div>
      <div class="geok-notes">
        ${geok.notes.map(note => `<div class="geok-note">• ${note}</div>`).join('')}
      </div>
    </div>
  `;
}

/**
 * 신강/신약 렌더링
 */
function renderStrengthInfo(strength) {
  const container = document.getElementById("strengthInfo");
  if (!container) return;
  
  const color = strength.label === "신강" ? "#78ffa8" : 
                strength.label === "신약" ? "#ff7a7a" : "#ffd36a";
  
  container.innerHTML = `
    <div class="strength-card">
      <div class="strength-score" style="color: ${color}">
        <span class="strength-label">${strength.label}</span>
        <span class="strength-number">${strength.score.toFixed(1)}</span>
      </div>
      <div class="strength-breakdown">
        <div class="strength-item">
          <span>월령:</span>
          <span>${strength.breakdown.season > 0 ? '+' : ''}${strength.breakdown.season}</span>
        </div>
        <div class="strength-item">
          <span>통근:</span>
          <span>${strength.breakdown.root > 0 ? '+' : ''}${strength.breakdown.root.toFixed(1)}</span>
        </div>
        <div class="strength-item">
          <span>천간:</span>
          <span>${strength.breakdown.stem > 0 ? '+' : ''}${strength.breakdown.stem}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * 용희기한 렌더링
 */
function renderGodsInfo(gods) {
  const container = document.getElementById("godsInfo");
  if (!container) return;
  
  const formatTenGods = (list) => {
    return list.map(tg => window.SajuData.TEN_GODS_KR[tg] || tg).join(", ");
  };
  
  container.innerHTML = `
    <div class="gods-grid">
      <div class="god-card yong">
        <div class="god-label">용신(用神)</div>
        <div class="god-content">${formatTenGods(gods.yong.tenGods)}</div>
        <div class="god-elements">${gods.yong.elements.join(", ")}</div>
      </div>
      
      <div class="god-card hee">
        <div class="god-label">희신(喜神)</div>
        <div class="god-content">${formatTenGods(gods.hee.tenGods)}</div>
        <div class="god-elements">${gods.hee.elements.join(", ")}</div>
      </div>
      
      <div class="god-card gi">
        <div class="god-label">기신(忌神)</div>
        <div class="god-content">${formatTenGods(gods.gi.tenGods)}</div>
        <div class="god-elements">${gods.gi.elements.join(", ")}</div>
      </div>
      
      <div class="god-card han">
        <div class="god-label">한신(閑神)</div>
        <div class="god-content">${formatTenGods(gods.han.tenGods)}</div>
        <div class="god-elements">${gods.han.elements.join(", ")}</div>
      </div>
    </div>
  `;
}

/**
 * 원국 총점 렌더링
 */
function renderBaseScore(scoreResult) {
  const container = document.getElementById("baseScore");
  if (!container) return;
  
  const { total, breakdown, helpRisk, presetDelta } = scoreResult;
  
  let gradeLabel = "";
  let gradeColor = "";
  if (total >= 80) {
    gradeLabel = "매우 좋음";
    gradeColor = "#78ffa8";
  } else if (total >= 70) {
    gradeLabel = "좋음";
    gradeColor = "#9ed0ff";
  } else if (total >= 60) {
    gradeLabel = "평범";
    gradeColor = "#ffd36a";
  } else if (total >= 50) {
    gradeLabel = "주의";
    gradeColor = "#ffb27a";
  } else {
    gradeLabel = "어려움";
    gradeColor = "#ff7a7a";
  }
  
  // help/risk 상위 3개 추출
  let helpRiskHtml = "";
  if (helpRisk && helpRisk.tenGod) {
    const topHelp = Object.entries(helpRisk.tenGod.help)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const topRisk = Object.entries(helpRisk.tenGod.risk)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    helpRiskHtml = `
      <div class="help-risk-summary">
        <div class="help-section">
          <div class="help-label">도움 요소</div>
          ${topHelp.map(([tg, val]) => 
            `<span class="help-item">${window.SajuData.TEN_GODS_KR[tg]}(${(val * 100).toFixed(0)}%)</span>`
          ).join('')}
        </div>
        <div class="risk-section">
          <div class="risk-label">주의 요소</div>
          ${topRisk.map(([tg, val]) => 
            `<span class="risk-item">${window.SajuData.TEN_GODS_KR[tg]}(${(val * 100).toFixed(0)}%)</span>`
          ).join('')}
        </div>
      </div>
    `;
  }
  
  // 프리셋 영향 표시
  let presetHtml = "";
  if (presetDelta !== undefined && presetDelta !== 0) {
    const sign = presetDelta > 0 ? '+' : '';
    presetHtml = `
      <div class="preset-impact">
        <span>프리셋 영향: ${sign}${presetDelta.toFixed(1)}점</span>
      </div>
    `;
  }
  
  container.innerHTML = `
    <div class="base-score-card">
      <div class="score-main">
        <div class="score-number" style="color: ${gradeColor}">${total}</div>
        <div class="score-label">${gradeLabel}</div>
      </div>
      
      ${presetHtml}
      ${helpRiskHtml}
      
      <div class="score-breakdown">
        <div class="breakdown-title">점수 상세</div>
        <div class="breakdown-grid">
          <div class="breakdown-item">
            <span class="breakdown-label">오행 균형</span>
            <span class="breakdown-value">${breakdown.balance}</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label">신강약</span>
            <span class="breakdown-value">${breakdown.strength}</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label">격 유지</span>
            <span class="breakdown-value">${breakdown.geok}</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label">용희기한</span>
            <span class="breakdown-value">${breakdown.yhgh}</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label">합충</span>
            <span class="breakdown-value">${breakdown.interaction}</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label">프로파일</span>
            <span class="breakdown-value">${breakdown.profile}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   PART 2: 대운 렌더링
   ========================================================= */

/**
 * 대운 점수 렌더링 (기존 카드에 점수 추가)
 */
function renderDaeunScores(baseState, profileName = "overall") {
  const daeunListEl = document.getElementById("daeunList");
  if (!daeunListEl) return;
  
  const cards = daeunListEl.querySelectorAll(".daeun-card");
  const decades = window.SajuResult?.daeunTimeline?.decades;
  
  if (!decades) return;
  
  console.log(`\n🎯 대운 점수 계산 시작 (${profileName} 프로파일)`);
  
  decades.forEach((decade, idx) => {
    if (idx >= cards.length) return;
    
    const card = cards[idx];
    
    // 대운 합성 상태 생성 (원국 + 대운)
    const daeunState = mergeDaeunState(baseState, decade);
    
    // 점수 계산
    const scoreResult = window.SajuEngine.computeTotalScore(daeunState, profileName);
    
    // 등급 산출
    let grade;
    if (scoreResult.total >= 88) grade = "S";
    else if (scoreResult.total >= 75) grade = "A";
    else if (scoreResult.total >= 65) grade = "B";
    else if (scoreResult.total >= 55) grade = "C";
    else if (scoreResult.total >= 45) grade = "D";
    else grade = "F";
    
    console.log(`${decade.stem}${decade.branch}: ${scoreResult.total}점 (${grade})`);
    
    // UI 업데이트
    const header = card.querySelector(".daeun-header");
    if (header) {
      // 기존 점수 제거
      const existingScore = header.querySelector(".daeun-score");
      if (existingScore) existingScore.remove();
      
      // 새 점수 추가
      const scoreEl = document.createElement("div");
      scoreEl.className = `daeun-score grade-${grade}`;
      scoreEl.innerHTML = `
        <div class="grade-letter">${grade}</div>
        <div class="grade-number">${scoreResult.total}점</div>
      `;
      header.appendChild(scoreEl);
    }
    
    // breakdown 추가
    const info = card.querySelector(".daeun-info");
    if (info) {
      // 기존 breakdown 제거
      const existingBreakdown = info.querySelector(".daeun-breakdown");
      if (existingBreakdown) existingBreakdown.remove();
      
      // 새 breakdown 추가
      const breakdownEl = document.createElement("div");
      breakdownEl.className = "daeun-breakdown";
      breakdownEl.innerHTML = `
        <div class="breakdown-mini">
          <span>균형:${scoreResult.breakdown.balance}</span>
          <span>신강:${scoreResult.breakdown.strength}</span>
          <span>격:${scoreResult.breakdown.geok}</span>
          <span>용희기한:${scoreResult.breakdown.yhgh}</span>
          <span>합충:${scoreResult.breakdown.interaction}</span>
        </div>
      `;
      info.appendChild(breakdownEl);
    }
  });
  
  console.log("✅ 대운 점수 렌더링 완료\n");
}

/**
 * 대운 상태 합성 (🔥 수정: mergedPillars 사용)
 */
function mergeDaeunState(baseState, decade) {
  // 대운 기둥 추가 (가중치 1.0)
  const mergedPillars = {
    year: baseState.pillars.year,
    month: baseState.pillars.month,
    day: baseState.pillars.day,
    hour: baseState.pillars.hour,
    daeun: { stem: decade.stem, branch: decade.branch } // 추가
  };
  
  // 벡터 재계산 (대운 포함)
  const dayStem = baseState.pillars.day.stem;
  const vectors = { ...baseState.vectors };
  
  // 대운 천간
  const daeunStemElement = window.SajuData.WUXING_STEM[decade.stem];
  if (daeunStemElement) vectors.elements[daeunStemElement] += 1.0;
  
  const daeunStemShishen = window.SajuEngine.getShishen(dayStem, decade.stem);
  if (daeunStemShishen) vectors.tenGods[daeunStemShishen] += 1.0;
  
  // 대운 지지 (지장간)
  const hiddenStems = window.SajuData.HIDDEN_STEMS_RATIO[decade.branch];
  if (hiddenStems) {
    hiddenStems.forEach(({ stem, ratio }) => {
      const element = window.SajuData.WUXING_STEM[stem];
      if (element) vectors.elements[element] += ratio * 1.0;
      
      const shishen = window.SajuEngine.getShishen(dayStem, stem);
      if (shishen) vectors.tenGods[shishen] += ratio * 1.0;
    });
  }
  
  // 신강도 재계산 (대운은 신강도에 영향 적음, 원국 기반 유지)
  const strength = baseState.strength;
  
  // 🔥 FIX: 격 재판정에 mergedPillars 사용
  const geok = window.SajuEngine.determineGeok(mergedPillars, vectors);
  
  // 🔥 FIX: 용희기한 재분류에 mergedPillars 사용
  const gods = window.SajuEngine.classifyYongHeeGiHan({
    pillars: mergedPillars,  // ← 수정됨!
    vectors,
    strength,
    geok
  });
  
  // 합충 재판정 (원국 + 대운)
  const interactions = detectDaeunInteractions(baseState.pillars, decade);
  
  return {
    pillars: mergedPillars,
    vectors,
    strength,
    geok,
    gods,
    interactions
  };
}

/**
 * 대운 합충 판정
 */
function detectDaeunInteractions(pillars, decade) {
  const interactions = {
    합: [],
    충: [],
    형: [],
    criticalHits: []
  };
  
  const natalBranches = [
    pillars.year.branch,
    pillars.month.branch,
    pillars.day.branch,
    pillars.hour.branch
  ];
  
  const daeunBranch = decade.branch;
  
  // 대운 충
  const { EARTHLY_CLASHES } = window.SajuData;
  for (const [a, b] of EARTHLY_CLASHES) {
    if (daeunBranch === a && natalBranches.includes(b)) {
      const critical = (pillars.month.branch === b || pillars.day.branch === b);
      interactions.충.push({ branches: [a, b], critical, source: "대운" });
      if (critical) {
        interactions.criticalHits.push(`대운 ${a}이 ${b} 충격`);
      }
    } else if (daeunBranch === b && natalBranches.includes(a)) {
      const critical = (pillars.month.branch === a || pillars.day.branch === a);
      interactions.충.push({ branches: [b, a], critical, source: "대운" });
      if (critical) {
        interactions.criticalHits.push(`대운 ${b}이 ${a} 충격`);
      }
    }
  }
  
  // 대운 합
  const { EARTHLY_SIX_COMBINATIONS, EARTHLY_THREE_COMBINATIONS } = window.SajuData;
  
  for (const [a, b] of EARTHLY_SIX_COMBINATIONS) {
    if ((daeunBranch === a && natalBranches.includes(b)) ||
        (daeunBranch === b && natalBranches.includes(a))) {
      interactions.합.push({ type: "육합", branches: [a, b], source: "대운" });
    }
  }
  
  for (const group of EARTHLY_THREE_COMBINATIONS) {
    if (group.branches.includes(daeunBranch)) {
      const matchCount = natalBranches.filter(b => group.branches.includes(b)).length;
      if (matchCount >= 1) {
        interactions.합.push({
          type: matchCount >= 2 ? "삼합완성" : "삼합반합",
          branches: group.branches,
          element: group.element,
          source: "대운"
        });
      }
    }
  }
  
  return interactions;
}

/* =========================================================
   PART 3: 프로파일 선택
   ========================================================= */

/**
 * 프로파일 변경 시 재계산
 */
function onProfileChange(profileName) {
  console.log(`\n🔄 프로파일 변경: ${profileName}`);
  
  if (!window.SajuResult) return;
  
  const baseState = window.SajuEngine.buildState(window.SajuResult.fourPillars);
  
  // 원국 점수 재계산
  const baseScore = window.SajuEngine.computeTotalScore(baseState, profileName);
  renderBaseScore(baseScore);
  
  // 대운 점수 재계산
  renderDaeunScores(baseState, profileName);
}

/* =========================================================
   PART 4: 메인 렌더링 함수
   ========================================================= */

/**
 * 전체 분석 렌더링
 */
function renderFullAnalysis(profileName = "overall") {
  console.log("\n🎯 전체 분석 렌더링 시작");
  
  if (!window.SajuResult) {
    console.log("⚠️ SajuResult 없음");
    return;
  }
  
  // 원국 상태 빌드
  const baseState = window.SajuEngine.buildState(window.SajuResult.fourPillars);
  
  console.log("📊 원국 상태:", baseState);
  
  // 원국 정보 렌더링
  renderGeokInfo(baseState.geok);
  renderStrengthInfo(baseState.strength);
  renderGodsInfo(baseState.gods);
  
  // 원국 점수 계산 및 렌더링
  const baseScore = window.SajuEngine.computeTotalScore(baseState, profileName);
  console.log("💯 원국 점수:", baseScore);
  renderBaseScore(baseScore);
  
  // 대운 점수 렌더링
  renderDaeunScores(baseState, profileName);
  
  // 🔥 직관 능력 분석 렌더링 (새로 추가!)
  if (window.IntuitionEngine) {
    console.log("🔮 직관 능력 분석 시작");
    const intuitionResult = window.IntuitionEngine.compute(baseState);
    console.log("📊 직관 능력 결과:", intuitionResult);
    renderIntuitionPanel(intuitionResult);
  }
  
  console.log("✅ 전체 분석 렌더링 완료\n");
}

/* =========================================================
   PART 5: 직관 능력 패널 렌더링
   ========================================================= */

/**
 * 직관 능력 분석 패널 렌더링
 */
function renderIntuitionPanel(result) {
  const container = document.getElementById("intuitionPanel");
  if (!container) return;
  
  const { categories, subs, overall, overloadRisk } = result;
  
  // 대분류 카드
  const categoriesHtml = `
    <div class="intuition-categories">
      <div class="category-card">
        <div class="category-name">통찰력 (Insight)</div>
        <div class="category-score grade-${categories.Insight.grade}">${categories.Insight.score}</div>
        <div class="category-meta">${categories.Insight.grade}등급 · ${categories.Insight.percent}</div>
      </div>
      
      <div class="category-card">
        <div class="category-name">기회 타이밍</div>
        <div class="category-score grade-${categories.Timing.grade}">${categories.Timing.score}</div>
        <div class="category-meta">${categories.Timing.grade}등급 · ${categories.Timing.percent}</div>
      </div>
      
      <div class="category-card">
        <div class="category-name">감응력 (Sensitivity)</div>
        <div class="category-score grade-${categories.Sensitivity.grade}">${categories.Sensitivity.score}</div>
        <div class="category-meta">${categories.Sensitivity.grade}등급 · ${categories.Sensitivity.percent}</div>
      </div>
      
      <div class="category-card">
        <div class="category-name">예지력 (Premonition)</div>
        <div class="category-score grade-${categories.Premonition.grade}">${categories.Premonition.score}</div>
        <div class="category-meta">${categories.Premonition.grade}등급 · ${categories.Premonition.percent}</div>
      </div>
    </div>
  `;
  
  // 중분류 리스트 (20개)
  const subsHtml = `
    <div class="intuition-subs">
      <div class="subs-title">세부 능력 (20개 지표)</div>
      
      <div class="subs-category">
        <div class="subs-category-title">📊 통찰력 (Insight)</div>
        ${subs.slice(0, 5).map(sub => renderSubItem(sub)).join('')}
      </div>
      
      <div class="subs-category">
        <div class="subs-category-title">⏰ 기회 타이밍</div>
        ${subs.slice(5, 10).map(sub => renderSubItem(sub)).join('')}
      </div>
      
      <div class="subs-category">
        <div class="subs-category-title">💫 감응력 (Sensitivity)</div>
        ${subs.slice(10, 15).map(sub => renderSubItem(sub)).join('')}
      </div>
      
      <div class="subs-category">
        <div class="subs-category-title">🔮 예지력 (Premonition)</div>
        ${subs.slice(15, 20).map(sub => renderSubItem(sub)).join('')}
      </div>
    </div>
  `;
  
  // 종합 결과는 제거 (사용자 요청)
  const overallHtml = '';
  
  // 과부하 위험 (주의 지표)
  const overloadHtml = `
    <div class="overload-warning ${overloadRisk >= 70 ? 'high-risk' : ''}">
      <div class="overload-icon">⚠️</div>
      <div class="overload-content">
        <div class="overload-title">감응 과부하 위험</div>
        <div class="overload-score">${overloadRisk}점</div>
        <div class="overload-desc">
          ${overloadRisk >= 70 ? '높음 - 감정 과부하에 주의하세요' : 
            overloadRisk >= 50 ? '보통 - 적절한 거리 유지 필요' : 
            '낮음 - 안정적 수준'}
        </div>
      </div>
    </div>
  `;
  
  container.innerHTML = `
    ${categoriesHtml}
    ${overallHtml}
    ${overloadHtml}
    ${subsHtml}
  `;
}

/**
 * 중분류 아이템 렌더링
 */
function renderSubItem(sub) {
  const bonusText = sub.bonus !== 0 ? `(${sub.bonus > 0 ? '+' : ''}${sub.bonus})` : '';
  const firedText = sub.fired.length > 0 ? `<div class="sub-fired">${sub.fired.join(', ')}</div>` : '';
  const styleText = sub.style ? `<div class="sub-style">📌 스타일: ${sub.style}</div>` : '';
  
  return `
    <div class="sub-item">
      <div class="sub-header">
        <div class="sub-name">${sub.id}. ${sub.name}</div>
        <div class="sub-score grade-${sub.grade}">
          ${sub.score} ${bonusText}
        </div>
      </div>
      <div class="sub-meta">
        ${sub.grade}등급 · ${sub.percent}
        ${styleText}
        ${firedText}
      </div>
    </div>
  `;
}

/* =========================================================
   Export
   ========================================================= */
window.SajuUI = {
  renderGeokInfo,
  renderStrengthInfo,
  renderGodsInfo,
  renderBaseScore,
  renderDaeunScores,
  renderFullAnalysis,
  renderIntuitionPanel,  // 새로 추가
  onProfileChange
};

console.log("✅ SajuUI 로드 완료");
