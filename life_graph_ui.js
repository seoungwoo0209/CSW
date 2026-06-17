/* =========================================================
   인생 그래프 UI (life_graph_ui.js) v3.0
   v4.0 엔진 대응: 3-도메인(직업·재물·관계) + 시련강도
   ========================================================= */

console.log("🔥 life_graph_ui.js 로드 시작");

function renderLifeGraph(input, astroResult) {
  const container = document.getElementById("lifeGraphPanel");
  if (!container) return;

  container.innerHTML = `
    <div style="color:#a5b4fc;font-size:13px;padding:20px;text-align:center;animation:pulse 1.2s infinite;">
      🪐 인생 그래프 계산 중...
    </div>`;

  setTimeout(() => {
    try {
      const result = window.LifeGraphEngine.computeLifeGraph(input, astroResult);
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
  const minScore = 50, maxScore = 100;

  function xPos(i)     { return PL + (i / (scores.length - 1)) * gW; }
  function yPos(score) { return PT + gH - ((score - minScore) / (maxScore - minScore)) * gH; }

  const nowIdx = scores.findIndex(s => s.year === currentYear);

  function makePath(key) {
    return scores.map((s, i) =>
      `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(s[key]).toFixed(1)}`
    ).join(' ');
  }

  // 면적 채우기: score 기준
  const areaPath = scores.map((s, i) =>
    `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(s.score).toFixed(1)}`
  ).join(' ')
    + ` L${xPos(scores.length-1).toFixed(1)},${(PT+gH).toFixed(1)} L${PL},${(PT+gH).toFixed(1)} Z`;

  const yLabels = [60, 65, 70, 75, 80, 85, 90].map(v => {
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

  // 현재 연도 도메인 점수
  const nowData     = nowIdx >= 0 ? scores[nowIdx] : null;
  const nowScore    = nowData?.score       ?? 0;
  const nowCareer   = nowData?.career      ?? 0;
  const nowWealth   = nowData?.wealth      ?? 0;
  const nowRel      = nowData?.relationship ?? 0;
  const nowIntensity = nowData?.intensity  ?? 0;

  function scoreColor(s) {
    if (s >= 78) return "#78ffa8";
    if (s >= 65) return "#9ed0ff";
    if (s >= 55) return "#ffd36a";
    return "#ffb27a";
  }
  function scoreComment(s) {
    if (s >= 78) return "상승기 · 확장과 기회";
    if (s >= 65) return "안정기 · 꾸준한 성장";
    if (s >= 55) return "전환기 · 인내의 시기";
    return "정비기 · 내실 다지기";
  }
  function intensityLabel(v) {
    if (v >= 70) return "매우 강함";
    if (v >= 45) return "강함";
    if (v >= 20) return "보통";
    return "잔잔함";
  }
  function intensityColor(v) {
    if (v >= 70) return "#ff9a7a";
    if (v >= 45) return "#ffd36a";
    if (v >= 20) return "#9ed0ff";
    return "#78ffa8";
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
        <div style="font-size:12px;color:#a5b4fc;letter-spacing:2px;margin-bottom:14px;">🌌 인생 그래프 · ${currentYear}년 기준</div>

        <!-- 3-도메인 카드 (직업·재물·관계) -->
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
          <div style="flex:1;min-width:100px;background:rgba(129,140,252,.10);border:1px solid rgba(129,140,252,.25);border-radius:12px;padding:12px 14px;">
            <div style="font-size:10px;color:#818cf8;margin-bottom:3px;letter-spacing:1px;">💼 직업 운세</div>
            <div style="font-size:28px;font-weight:900;color:${scoreColor(nowCareer)};line-height:1;">${nowCareer}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:4px;">${scoreComment(nowCareer)}</div>
          </div>
          <div style="flex:1;min-width:100px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.22);border-radius:12px;padding:12px 14px;">
            <div style="font-size:10px;color:#fcd34d;margin-bottom:3px;letter-spacing:1px;">💰 재물 운세</div>
            <div style="font-size:28px;font-weight:900;color:${scoreColor(nowWealth)};line-height:1;">${nowWealth}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:4px;">${scoreComment(nowWealth)}</div>
          </div>
          <div style="flex:1;min-width:100px;background:rgba(244,114,182,.08);border:1px solid rgba(244,114,182,.22);border-radius:12px;padding:12px 14px;">
            <div style="font-size:10px;color:#f9a8d4;margin-bottom:3px;letter-spacing:1px;">💕 관계 운세</div>
            <div style="font-size:28px;font-weight:900;color:${scoreColor(nowRel)};line-height:1;">${nowRel}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:4px;">${scoreComment(nowRel)}</div>
          </div>
        </div>

        <!-- 시련강도 바 -->
        <div style="background:rgba(255,255,255,.04);border-radius:10px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:12px;">
          <div style="font-size:10px;color:#64748b;white-space:nowrap;">⚡ 시련강도</div>
          <div style="flex:1;background:rgba(255,255,255,.08);border-radius:4px;height:6px;overflow:hidden;">
            <div style="width:${nowIntensity}%;height:100%;background:${intensityColor(nowIntensity)};border-radius:4px;transition:width .5s;"></div>
          </div>
          <div style="font-size:11px;color:${intensityColor(nowIntensity)};white-space:nowrap;font-weight:700;">${intensityLabel(nowIntensity)}</div>
          <div style="font-size:10px;color:#475569;">${todayStr}</div>
        </div>

        <!-- SVG 그래프 -->
        <div style="overflow-x:auto;">
          <svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:320px;height:auto;display:block;">
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stop-color="#818cf8" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="#818cf8" stop-opacity="0.01"/>
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="1.5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <rect width="${W}" height="${H}" fill="transparent"/>
            ${yLabels}
            ${xLabels}
            ${futureOverlay}

            <!-- 면적 채우기 (종합 점수 기준) -->
            <path d="${areaPath}" fill="url(#areaGrad)"/>

            <!-- 3-도메인 라인 -->
            <path d="${makePath('career')}" fill="none" stroke="rgba(129,140,252,.70)" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="${makePath('wealth')}" fill="none" stroke="rgba(251,191,36,.70)"  stroke-width="1.5" stroke-linejoin="round"/>
            <path d="${makePath('relationship')}" fill="none" stroke="rgba(244,114,182,.70)" stroke-width="1.5" stroke-linejoin="round"/>

            <!-- 종합 점수 라인 (가장 위) -->
            <path d="${makePath('score')}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-dasharray="4,3" stroke-linejoin="round"/>

            ${nowDot}

            <!-- 기준선 60pt -->
            <line x1="${PL}" y1="${yPos(60).toFixed(1)}" x2="${PL+gW}" y2="${yPos(60).toFixed(1)}"
              stroke="rgba(255,255,255,.12)" stroke-width="1" stroke-dasharray="5,4"/>
            <text x="${(PL+gW+4).toFixed(1)}" y="${(yPos(60)+4).toFixed(1)}" fill="rgba(255,255,255,.2)" font-size="9">기준</text>
          </svg>
        </div>

        <!-- 범례 -->
        <div style="display:flex;gap:14px;margin-top:8px;flex-wrap:wrap;align-items:center;">
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:18px;height:2px;background:rgba(129,140,252,.9);border-radius:2px;"></div>
            <span style="font-size:10px;color:#818cf8;">직업</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:18px;height:2px;background:rgba(251,191,36,.9);border-radius:2px;"></div>
            <span style="font-size:10px;color:#fcd34d;">재물</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:18px;height:2px;background:rgba(244,114,182,.9);border-radius:2px;"></div>
            <span style="font-size:10px;color:#f9a8d4;">관계</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:18px;border-top:1px dashed rgba(255,255,255,.35);"></div>
            <span style="font-size:10px;color:#64748b;">종합</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.LifeGraphUI = { renderLifeGraph };
console.log("✅ life_graph_ui.js v3.0 로드 완료");
