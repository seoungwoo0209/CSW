/* =========================================================
   인생 그래프 UI (life_graph_ui.js) v2.0
   ========================================================= */

console.log("🔥 life_graph_ui.js 로드 시작");

function renderLifeGraph(input) {
  const container = document.getElementById("lifeGraphPanel");
  if (!container) return;

  container.innerHTML = `
    <div style="color:#a5b4fc;font-size:13px;padding:20px;text-align:center;animation:pulse 1.2s infinite;">
      🪐 인생 그래프 계산 중...
    </div>`;

  setTimeout(() => {
    try {
      const result = window.LifeGraphEngine.computeLifeGraph(input);
      _drawLifeGraph(container, result);
    } catch(e) {
      console.error("인생 그래프 계산 오류:", e);
      container.innerHTML = `<div style="color:#ff7a7a;padding:20px;">그래프 계산 중 오류가 발생했습니다.</div>`;
    }
  }, 30);
}

function _drawLifeGraph(container, result) {
  const { scores, currentAge, currentYear, birthYear } = result;
  if (!scores || scores.length === 0) return;

  const W = 680, H = 300;
  const PL = 44, PR = 20, PT = 28, PB = 48;
  const gW = W - PL - PR;
  const gH = H - PT - PB;
  const minScore = 55, maxScore = 100;

  function xPos(i)     { return PL + (i / (scores.length - 1)) * gW; }
  function yPos(score) { return PT + gH - ((score - minScore) / (maxScore - minScore)) * gH; }

  const nowIdx = scores.findIndex(s => s.year === currentYear);

  function makePath(key) {
    return scores.map((s, i) =>
      `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(s[key]).toFixed(1)}`
    ).join(' ');
  }

  const areaPath = scores.map((s, i) =>
    `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(s.score).toFixed(1)}`
  ).join(' ')
    + ` L${xPos(scores.length-1).toFixed(1)},${(PT+gH).toFixed(1)} L${PL},${(PT+gH).toFixed(1)} Z`;

  const yLabels = [60, 65, 70, 75, 80, 85, 90, 95].map(v => {
    const y = yPos(v).toFixed(1);
    return `<line x1="${PL-4}" y1="${y}" x2="${PL+gW}" y2="${y}" stroke="rgba(255,255,255,.05)" stroke-width="1"/>
            <text x="${PL-8}" y="${(parseFloat(y)+4).toFixed(1)}" fill="#475569" font-size="10" text-anchor="end">${v}</text>`;
  }).join('');

  const xLabels = scores
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.age % 10 === 0 || s.year === currentYear)
    .map(({ s, i }) => {
      const x = xPos(i).toFixed(1);
      const isNow = s.year === currentYear;
      const col   = isNow ? "#a5b4fc" : "#475569";
      const label = isNow ? `현재(${s.age}세)` : `${s.age}세`;
      return `<line x1="${x}" y1="${PT}" x2="${x}" y2="${(PT+gH).toFixed(1)}"
                stroke="${isNow ? 'rgba(165,180,252,.3)' : 'rgba(255,255,255,.04)'}"
                stroke-width="${isNow?1.5:1}" stroke-dasharray="${isNow?'4,3':''}"/>
              <text x="${x}" y="${(PT+gH+16).toFixed(1)}" fill="${col}"
                font-size="${isNow?10:9}" text-anchor="middle" font-weight="${isNow?700:400}">${label}</text>`;
    }).join('');

  const nowDot = nowIdx >= 0 ? `
    <circle cx="${xPos(nowIdx).toFixed(1)}" cy="${yPos(scores[nowIdx].score).toFixed(1)}"
      r="5" fill="#a5b4fc" stroke="#1e1b4b" stroke-width="2"/>
  ` : '';

  const futureOverlay = nowIdx >= 0 && nowIdx < scores.length - 1 ? `
    <rect x="${xPos(nowIdx).toFixed(1)}" y="${PT}"
      width="${(xPos(scores.length-1)-xPos(nowIdx)).toFixed(1)}" height="${gH}"
      fill="rgba(165,180,252,.04)" rx="2"/>
    <text x="${((xPos(nowIdx)+xPos(scores.length-1))/2).toFixed(1)}" y="${(PT+12).toFixed(1)}"
      fill="rgba(165,180,252,.35)" font-size="9" text-anchor="middle">예측</text>
  ` : '';

  // 요약 점수 계산
  const past    = scores.filter(s => s.year < currentYear);
  const future  = scores.filter(s => s.year > currentYear);
  const nowScore = nowIdx >= 0 ? scores[nowIdx].score : 0;
  const avgPast  = past.length   ? Math.round(past.reduce((a,b)=>a+b.score,0)/past.length)   : 0;
  const avgFuture= future.length ? Math.round(future.reduce((a,b)=>a+b.score,0)/future.length) : 0;

  function scoreColor(s) {
    if (s >= 75) return "#78ffa8";
    if (s >= 65) return "#9ed0ff";
    if (s >= 55) return "#ffd36a";
    return "#ffb27a";
  }
  function scoreComment(s) {
    if (s >= 75) return "상승기 · 확장과 기회의 시기";
    if (s >= 65) return "안정기 · 꾸준한 성장 지속";
    if (s >= 55) return "전환기 · 인내와 준비의 시기";
    return "정비기 · 내실을 다지는 시기";
  }

  // 오늘 날짜 표시
  const nowRaw   = new Date();
  const todayKST = new Date(Date.UTC(
    nowRaw.getUTCFullYear(), nowRaw.getUTCMonth(),
    nowRaw.getUTCDate() + (nowRaw.getUTCHours() >= 15 ? 1 : 0), 0, 0, 0
  ));
  const todayStr = `${todayKST.getUTCFullYear()}년 ${todayKST.getUTCMonth()+1}월 ${todayKST.getUTCDate()}일`;

  container.innerHTML = `
    <div style="padding:4px 0 16px;">
      <div style="
        background:linear-gradient(135deg,rgba(18,22,42,.95),rgba(30,20,70,.90));
        border:1px solid rgba(165,180,252,.22);border-radius:16px;
        padding:20px;margin-bottom:12px;
      ">
        <div style="font-size:12px;color:#a5b4fc;letter-spacing:2px;margin-bottom:14px;">🌌 인생 그래프</div>

        <!-- 3개 요약 카드 -->
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
          <div style="flex:1;min-width:110px;background:rgba(255,255,255,.05);border-radius:12px;padding:12px 14px;">
            <div style="font-size:11px;color:#64748b;margin-bottom:4px;">출생 ~ 오늘 평균</div>
            <div style="font-size:28px;font-weight:900;color:${scoreColor(avgPast)};line-height:1;">${avgPast}</div>
            <div style="font-size:10px;color:#475569;margin-top:4px;">${birthYear}년 ~ ${currentYear}년</div>
          </div>
          <div style="flex:1;min-width:110px;background:rgba(255,255,255,.05);border-radius:12px;padding:12px 14px;">
            <div style="font-size:11px;color:#64748b;margin-bottom:4px;">현재 (${currentYear}년)</div>
            <div style="font-size:28px;font-weight:900;color:${scoreColor(nowScore)};line-height:1;">${nowScore}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${scoreComment(nowScore)}</div>
          </div>
          <div style="flex:1;min-width:110px;background:rgba(255,255,255,.05);border-radius:12px;padding:12px 14px;">
            <div style="font-size:11px;color:#64748b;margin-bottom:4px;">오늘 이후 평균</div>
            <div style="font-size:28px;font-weight:900;color:${scoreColor(avgFuture)};line-height:1;">${avgFuture}</div>
            <div style="font-size:10px;color:#475569;margin-top:4px;">${todayStr} 기준</div>
          </div>
        </div>

        <!-- SVG 그래프 -->
        <div style="overflow-x:auto;">
          <svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:320px;height:auto;display:block;">
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stop-color="#818cf8" stop-opacity="0.35"/>
                <stop offset="100%" stop-color="#818cf8" stop-opacity="0.02"/>
              </linearGradient>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stop-color="#6366f1"/>
                <stop offset="50%"  stop-color="#a5b4fc"/>
                <stop offset="100%" stop-color="#78ffa8"/>
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <rect width="${W}" height="${H}" fill="transparent"/>
            ${yLabels}
            ${xLabels}
            ${futureOverlay}
            <path d="${areaPath}" fill="url(#areaGrad)"/>
            <path d="${makePath('layer2')}" fill="none" stroke="rgba(251,191,36,.25)" stroke-width="1" stroke-dasharray="3,3"/>
            <path d="${makePath('layer3')}" fill="none" stroke="rgba(167,139,250,.25)" stroke-width="1" stroke-dasharray="2,4"/>
            <path d="${makePath('score')}" fill="none" stroke="url(#lineGrad)" stroke-width="2.2" stroke-linejoin="round" filter="url(#glow)"/>
            ${nowDot}
            <line x1="${PL}" y1="${yPos(60).toFixed(1)}" x2="${PL+gW}" y2="${yPos(60).toFixed(1)}"
              stroke="rgba(255,255,255,.12)" stroke-width="1" stroke-dasharray="5,4"/>
            <text x="${(PL+gW+4).toFixed(1)}" y="${(yPos(60)+4).toFixed(1)}" fill="rgba(255,255,255,.2)" font-size="9">기준</text>
          </svg>
        </div>

        <!-- 범례 -->
        <div style="display:flex;gap:14px;margin-top:8px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:20px;height:2px;background:linear-gradient(90deg,#6366f1,#78ffa8);border-radius:2px;"></div>
            <span style="font-size:10px;color:#64748b;">종합 운세</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:20px;border-top:1px dashed rgba(251,191,36,.5);"></div>
            <span style="font-size:10px;color:#64748b;">목성/토성 트랜짓</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:20px;border-top:1px dashed rgba(167,139,250,.5);"></div>
            <span style="font-size:10px;color:#64748b;">프로그레션 달</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.LifeGraphUI = { renderLifeGraph };
console.log("✅ life_graph_ui.js v2.0 로드 완료");
