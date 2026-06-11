/* =========================================================
   인생 그래프 UI (life_graph_ui.js)
   ─────────────────────────────────────────────────────────
   SVG 기반 인생 운세 그래프 렌더링
   탭: tab-lifegraph
   ========================================================= */

console.log("🔥 life_graph_ui.js 로드 시작");

function renderLifeGraph(input) {
  const container = document.getElementById("lifeGraphPanel");
  if (!container) return;

  container.innerHTML = `
    <div style="color:#a5b4fc;font-size:13px;padding:20px;text-align:center;animation:pulse 1.2s infinite;">
      🪐 행성 위치 계산 중...
    </div>`;

  // 약간 딜레이 후 계산 (UI 블로킹 방지)
  setTimeout(() => {
    try {
      const result = window.LifeGraphEngine.computeLifeGraph(input);
      _drawLifeGraph(container, result, input);
    } catch(e) {
      console.error("인생 그래프 계산 오류:", e);
      container.innerHTML = `<div style="color:#ff7a7a;padding:20px;">그래프 계산 중 오류가 발생했습니다.</div>`;
    }
  }, 30);
}

function _drawLifeGraph(container, result, input) {
  const { scores, currentAge, currentYear, birthYear } = result;
  if (!scores || scores.length === 0) return;

  const W = 680, H = 300;
  const PL = 44, PR = 20, PT = 28, PB = 48;
  const gW = W - PL - PR;
  const gH = H - PT - PB;

  const minScore = 20, maxScore = 95;

  function xPos(i)     { return PL + (i / (scores.length - 1)) * gW; }
  function yPos(score) { return PT + gH - ((score - minScore) / (maxScore - minScore)) * gH; }

  // 현재 위치 인덱스
  const nowIdx = scores.findIndex(s => s.year === currentYear);

  // ── 선 경로 생성
  function makePath(key) {
    return scores.map((s, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(s[key]).toFixed(1)}`).join(' ');
  }

  // ── 영역 채우기 (메인 score)
  const areaPath = scores.map((s, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(s.score).toFixed(1)}`).join(' ')
    + ` L${xPos(scores.length-1).toFixed(1)},${(PT+gH).toFixed(1)} L${PL},${(PT+gH).toFixed(1)} Z`;

  // ── Y축 라벨
  const yLabels = [30, 45, 60, 75, 90].map(v => {
    const y = yPos(v).toFixed(1);
    return `<line x1="${PL-4}" y1="${y}" x2="${PL+gW}" y2="${y}" stroke="rgba(255,255,255,.05)" stroke-width="1"/>
            <text x="${PL-8}" y="${(parseFloat(y)+4).toFixed(1)}" fill="#475569" font-size="10" text-anchor="end">${v}</text>`;
  }).join('');

  // ── X축 라벨 (10년 단위 + 현재)
  const xLabels = scores
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.age % 10 === 0 || s.year === currentYear)
    .map(({ s, i }) => {
      const x = xPos(i).toFixed(1);
      const isNow = s.year === currentYear;
      const col = isNow ? "#a5b4fc" : "#475569";
      const label = isNow ? `현재(${s.age}세)` : `${s.age}세`;
      return `<line x1="${x}" y1="${PT}" x2="${x}" y2="${(PT+gH).toFixed(1)}" stroke="${isNow ? 'rgba(165,180,252,.3)' : 'rgba(255,255,255,.04)'}" stroke-width="${isNow?1.5:1}" stroke-dasharray="${isNow?'4,3':''}"/>
              <text x="${x}" y="${(PT+gH+16).toFixed(1)}" fill="${col}" font-size="${isNow?10:9}" text-anchor="middle" font-weight="${isNow?700:400}">${label}</text>`;
    }).join('');

  // ── 현재 포인트 강조
  const nowDot = nowIdx >= 0 ? `
    <circle cx="${xPos(nowIdx).toFixed(1)}" cy="${yPos(scores[nowIdx].score).toFixed(1)}" r="5" fill="#a5b4fc" stroke="#1e1b4b" stroke-width="2"/>
  ` : '';

  // ── 향후 영역 표시 (현재 이후)
  const futureOverlay = nowIdx >= 0 && nowIdx < scores.length - 1 ? `
    <rect x="${xPos(nowIdx).toFixed(1)}" y="${PT}" width="${(xPos(scores.length-1)-xPos(nowIdx)).toFixed(1)}" height="${gH}"
      fill="rgba(165,180,252,.04)" rx="2"/>
    <text x="${((xPos(nowIdx)+xPos(scores.length-1))/2).toFixed(1)}" y="${(PT+12).toFixed(1)}"
      fill="rgba(165,180,252,.35)" font-size="9" text-anchor="middle">예측</text>
  ` : '';

  // ── 점수 요약 계산
  const past   = scores.filter(s => s.year <= currentYear);
  const future = scores.filter(s => s.year > currentYear);
  const avgPast   = past.length   ? Math.round(past.reduce((a,b)=>a+b.score,0)/past.length)   : 0;
  const avgFuture = future.length ? Math.round(future.reduce((a,b)=>a+b.score,0)/future.length) : 0;
  const peakYear  = scores.reduce((a,b) => b.score > a.score ? b : a, scores[0]);
  const nowScore  = nowIdx >= 0 ? scores[nowIdx].score : 0;

  // ── 현재 운세 한줄 평
  function scoreComment(s) {
    if (s >= 75) return "상승기 · 확장과 기회의 시기";
    if (s >= 65) return "안정기 · 꾸준한 성장 지속";
    if (s >= 55) return "전환기 · 인내와 준비의 시기";
    return "정비기 · 내실을 다지는 시기";
  }
  function scoreColor(s) {
    if (s >= 75) return "#78ffa8";
    if (s >= 65) return "#9ed0ff";
    if (s >= 55) return "#ffd36a";
    return "#ffb27a";
  }

  // ── 향후 5년 스냅샷
  const next5 = future.slice(0, 5).map(s => `
    <div style="text-align:center;min-width:52px;">
      <div style="font-size:11px;color:#64748b;margin-bottom:3px;">${s.year}</div>
      <div style="font-size:16px;font-weight:800;color:${scoreColor(s.score)};">${s.score}</div>
      <div style="font-size:9px;color:#475569;">${s.age}세</div>
    </div>
  `).join('');

  container.innerHTML = `
    <div style="padding:4px 0 16px;">

      <!-- 상단 요약 -->
      <div style="
        background:linear-gradient(135deg,rgba(18,22,42,.95),rgba(30,20,70,.90));
        border:1px solid rgba(165,180,252,.22);border-radius:16px;
        padding:20px;margin-bottom:12px;
      ">
        <div style="font-size:12px;color:#a5b4fc;letter-spacing:2px;margin-bottom:14px;">🌌 인생 그래프</div>

        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
          <div style="flex:1;min-width:110px;background:rgba(255,255,255,.05);border-radius:12px;padding:12px 14px;">
            <div style="font-size:11px;color:#64748b;margin-bottom:4px;">현재 운세</div>
            <div style="font-size:28px;font-weight:900;color:${scoreColor(nowScore)};line-height:1;">${nowScore}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${scoreComment(nowScore)}</div>
          </div>
          <div style="flex:1;min-width:110px;background:rgba(255,255,255,.05);border-radius:12px;padding:12px 14px;">
            <div style="font-size:11px;color:#64748b;margin-bottom:4px;">최고점</div>
            <div style="font-size:28px;font-weight:900;color:#78ffa8;line-height:1;">${peakYear.score}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${peakYear.year}년 · ${peakYear.age}세</div>
          </div>
          <div style="flex:1;min-width:110px;background:rgba(255,255,255,.05);border-radius:12px;padding:12px 14px;">
            <div style="font-size:11px;color:#64748b;margin-bottom:4px;">향후 평균</div>
            <div style="font-size:28px;font-weight:900;color:${scoreColor(avgFuture)};line-height:1;">${avgFuture}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;">향후 ${future.length}년 예측</div>
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

            <!-- 배경 -->
            <rect width="${W}" height="${H}" fill="transparent"/>

            <!-- Y축 그리드 -->
            ${yLabels}

            <!-- X축 그리드 + 라벨 -->
            ${xLabels}

            <!-- 미래 영역 -->
            ${futureOverlay}

            <!-- 영역 채우기 -->
            <path d="${areaPath}" fill="url(#areaGrad)"/>

            <!-- Layer2 (솔라리턴) 보조선 -->
            <path d="${makePath('layer2')}" fill="none" stroke="rgba(251,191,36,.25)" stroke-width="1" stroke-dasharray="3,3"/>

            <!-- Layer3 (트랜짓) 보조선 -->
            <path d="${makePath('layer3')}" fill="none" stroke="rgba(167,139,250,.25)" stroke-width="1" stroke-dasharray="2,4"/>

            <!-- 메인 곡선 -->
            <path d="${makePath('score')}" fill="none" stroke="url(#lineGrad)" stroke-width="2.2" stroke-linejoin="round" filter="url(#glow)"/>

            <!-- 현재 포인트 -->
            ${nowDot}

            <!-- 기준선 60 -->
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
            <div style="width:20px;height:1px;background:rgba(251,191,36,.5);border-top:1px dashed rgba(251,191,36,.5);"></div>
            <span style="font-size:10px;color:#64748b;">연간(솔라리턴)</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:20px;height:1px;border-top:1px dashed rgba(167,139,250,.5);"></div>
            <span style="font-size:10px;color:#64748b;">트랜짓(목성·토성)</span>
          </div>
        </div>
      </div>

      <!-- 향후 5년 스냅샷 -->
      ${future.length > 0 ? `
      <div style="
        background:rgba(18,22,42,.78);border:1px solid rgba(255,255,255,.08);
        border-radius:14px;padding:16px;margin-bottom:12px;
      ">
        <div style="font-size:12px;color:#94a3b8;letter-spacing:1px;margin-bottom:12px;">⏩ 향후 5년</div>
        <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;">
          ${next5}
        </div>
      </div>
      ` : ''}

      <!-- 3층 설명 -->
      <div style="
        background:rgba(18,22,42,.60);border:1px solid rgba(255,255,255,.06);
        border-radius:14px;padding:14px 16px;
      ">
        <div style="font-size:12px;color:#64748b;margin-bottom:10px;letter-spacing:1px;">알고리즘 구성</div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:11px;color:#475569;line-height:1.7;">
          <div>🌊 <span style="color:#818cf8;">45%</span> 세컨더리 프로그레션 (태양·달) — 인생의 큰 흐름</div>
          <div>☀️ <span style="color:#fbbf24;">35%</span> 솔라 리턴 + 프로펙션 — 연간 테마·성취</div>
          <div>⚡ <span style="color:#a78bfa;">20%</span> 목성·토성·천왕성 트랜짓 — 상승/하락 타이밍</div>
        </div>
      </div>

    </div>
  `;
}

window.LifeGraphUI = { renderLifeGraph };
console.log("✅ life_graph_ui.js 로드 완료");
