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

  // 오행 색 — 천간 한자마다 해당 오행 색을 입혀 표시
  const WX_COLOR = { wood:'#92c4a8', fire:'#dd9b88', earth:'#d8bd80', metal:'#e8e1cf', water:'#90a8cd' };

  [
    { label:"년지", branch: fourPillars.year.branch  },
    { label:"월지", branch: fourPillars.month.branch },
    { label:"일지", branch: fourPillars.day.branch   },
    { label:"시지", branch: fourPillars.hour.branch  }
  ].forEach(p => {
    const hs = D.HIDDEN_STEMS_BRANCH[p.branch];
    if (!hs) return;

    const stemsHtml = hs.map(item => {
      const color = WX_COLOR[D.WUXING_STEM[item.stem]] || '#efe8d6';
      const isPrimary = item.role === '정기';
      return `
        <span style="display:flex;align-items:baseline;gap:5px;">
          <span style="font-size:23px;font-weight:500;line-height:1;font-family:Georgia,serif;color:${color};">${item.stem}</span>
          <span style="font-size:10px;letter-spacing:.02em;color:${isPrimary ? '#b8ab87' : '#8d8268'};">${item.role}</span>
        </span>
      `;
    }).join('');

    const row = document.createElement("div");
    row.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;gap:14px;
      padding:16px 18px;border-radius:13px;
      background:linear-gradient(158deg, rgba(44,36,82,.42) 0%, rgba(17,13,36,.6) 100%);
      border:1px solid rgba(200,168,96,.2);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
    `;
    row.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:7px;flex-shrink:0;">
        <span style="font-size:14px;color:#cabfa0;letter-spacing:.04em;">${p.label}</span>
        <span style="font-size:15px;color:#d6bf85;font-family:Georgia,serif;">(${p.branch})</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;justify-content:flex-end;">
        ${stemsHtml}
      </div>
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

  const { axes, strongest, weakest } = resourceResult;

  const COLOR = { 비겁:'#d8bd80', 식상:'#dd9b88', 재성:'#92c4a8', 관성:'#a695cf', 인성:'#90a8cd' };
  const ORDER = ['비겁','식상','재성','관성','인성'];
  const byKey = {};
  axes.forEach(a => { byKey[a.key] = a; });
  const data = ORDER.map(k => byKey[k]).filter(Boolean);

  const total = data.reduce((a, d) => a + d.score, 0);
  const MAX   = 210; // computeResourceScores 축 점수 상한과 동일

  const cx = 120, cy = 120, R = 92;
  const A = i => (-90 + 72 * i) * Math.PI / 180;
  const P = (i, r) => [(cx + r * Math.cos(A(i))).toFixed(2), (cy + r * Math.sin(A(i))).toFixed(2)];
  const poly = pts => pts.map(q => q.join(',')).join(' ');

  let svg = '';
  [0.25, 0.5, 0.75, 1].forEach(k => {
    svg += `<polygon points="${poly(data.map((d, i) => P(i, R * k)))}" fill="none" stroke="rgba(200,168,96,.16)" stroke-width="1"/>`;
  });
  data.forEach((d, i) => {
    const p = P(i, R);
    svg += `<line x1="${cx}" y1="${cy}" x2="${p[0]}" y2="${p[1]}" stroke="rgba(200,168,96,.16)" stroke-width="1"/>`;
  });
  const dp = data.map((d, i) => P(i, R * Math.min(d.score / MAX, 1)));
  svg += `<polygon points="${poly(dp)}" fill="rgba(216,189,128,.16)" stroke="#dcc185" stroke-width="2" stroke-linejoin="round"/>`;
  dp.forEach((p, i) => {
    svg += `<circle cx="${p[0]}" cy="${p[1]}" r="3.6" fill="${COLOR[data[i].key]}" stroke="#0c0a20" stroke-width="1"/>`;
  });
  data.forEach((d, i) => {
    const l = P(i, R + 22);
    const cos = Math.cos(A(i));
    const anc = Math.abs(cos) < 0.2 ? 'middle' : (cos > 0 ? 'start' : 'end');
    svg += `<text x="${l[0]}" y="${l[1]}" text-anchor="${anc}" font-family="Georgia,serif" font-size="13" fill="#e6ddc8">${d.key}</text>`;
    svg += `<text x="${l[0]}" y="${(parseFloat(l[1]) + 14).toFixed(2)}" text-anchor="${anc}" font-family="Georgia,serif" font-size="12" fill="#caa74e">${d.score}</text>`;
  });
  const radarSvg = `<svg viewBox="-26 -16 292 280" width="100%" role="img" aria-label="오각 균형도"><title>사주 자원 오각 균형도</title>${svg}</svg>`;

  const srOnly = '사주 자원 오각 균형도. ' +
    [...data].sort((a, b) => b.score - a.score)
      .map(d => `${d.key} ${d.score}(${(d.score / total * 100).toFixed(1)}%)`).join(', ') + '.';

  const legendHtml = data.map(d => {
    const pct = (d.score / total * 100).toFixed(1);
    return `
      <div style="display:flex;align-items:center;gap:11px;padding:11px 2px;border-bottom:1px solid rgba(200,168,96,.12);">
        <span style="width:11px;height:11px;border-radius:3px;flex:0 0 11px;background:${COLOR[d.key]};"></span>
        <div style="flex:1;min-width:0;">
          <span style="font-size:15px;color:#e6ddc8;font-family:Georgia,serif;">${d.key}</span>
          <div style="font-size:11.5px;color:#8d8268;margin-top:2px;letter-spacing:.01em;">${d.desc}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <span style="font-size:18px;font-weight:600;line-height:1;font-family:Georgia,serif;
            background:linear-gradient(100deg,#f6e9c1 0%,#e0c684 45%,#caa74e 100%);
            -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;">${d.score}</span>
          <div style="font-size:11px;color:#8d8268;margin-top:3px;">${pct}%</div>
        </div>
      </div>
    `;
  }).join('');

  c.innerHTML = `
    <style>@keyframes _rrTw{0%,100%{opacity:.2}50%{opacity:.75}}</style>

    <!-- 헤더 -->
    <div style="
      position:relative;overflow:hidden;border-radius:20px;
      background:radial-gradient(120% 80% at 50% -8%, #241c4c 0%, #15103a 55%, #0b0a1e 100%);
      border:1px solid rgba(200,168,96,.24);
      box-shadow:0 22px 60px -30px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.05);
      padding:24px 22px 22px;text-align:center;margin-bottom:14px;
    ">
      <span style="position:absolute;top:18px;right:28px;width:2px;height:2px;border-radius:50%;
        background:#f0e3b8;box-shadow:0 0 6px 1px rgba(240,227,184,.5);animation:_rrTw 3.6s ease-in-out infinite;"></span>
      <div style="font-size:11px;letter-spacing:.26em;color:#9f93c0;margin-bottom:10px;">사주 자원 분석</div>
      <div style="margin:0 0 16px;font-size:21px;line-height:1.45;font-weight:700;font-family:Georgia,serif;
        background:linear-gradient(100deg,#f6e9c1 0%,#e0c684 45%,#caa74e 100%);
        -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;">
        ${strongest.key} 중심 · ${weakest.key} 보완 필요
      </div>
      <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;font-family:Georgia,serif;
          color:#bdeede;border:1px solid rgba(120,210,180,.4);background:rgba(60,180,140,.1);">강점 · ${strongest.key} ${strongest.score}</span>
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;font-family:Georgia,serif;
          color:#e8b9ad;border:1px solid rgba(221,155,136,.4);background:rgba(221,155,136,.1);">보완 · ${weakest.key} ${weakest.score}</span>
      </div>
    </div>

    <!-- 레이더 차트 + 범례 -->
    <div style="
      border-radius:20px;
      background:radial-gradient(120% 50% at 50% -6%, #1a1540 0%, #0e0b24 55%, #08060f 100%);
      border:1px solid rgba(200,168,96,.2);
      box-shadow:0 24px 60px -30px rgba(0,0,0,.92);
      padding:20px 18px 16px;
    ">
      <h3 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);">${srOnly}</h3>
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c8a860" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 6.5l-3.5 10.5h-11l-3.5 -10.5z"/></svg>
        <span style="font-size:11px;letter-spacing:.2em;color:#8d8268;">오각 균형도</span>
      </div>
      <div style="width:100%;max-width:300px;margin:0 auto;">${radarSvg}</div>
      <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,168,96,.3),transparent);margin:14px 0 4px;"></div>
      <div>${legendHtml}</div>
    </div>
  `;
}

/* =========================================================
   PART 3: 유형 카드 + 점수 렌더링 (참조 리포트 스타일)
   ========================================================= */
function renderPersonalityCard(cardData) {
  const c = _$('personalityCard');
  if (!c) return;

  const { typeName, typeDesc, ilju, geokKr, strengthLabel, scores } = cardData;

  // 점수 높은 순 정렬
  const sorted = [...scores].sort((a, b) => b.score - a.score);

  const goldText = 'background:linear-gradient(100deg,#f6e9c1 0%,#e0c684 45%,#caa74e 100%);' +
    '-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;';
  const pillStyle = 'font-size:12px;letter-spacing:.1em;color:#ead9a6;border:1px solid rgba(200,168,96,.45);' +
    'background:rgba(200,168,96,.07);padding:6px 15px;border-radius:999px;font-family:Georgia,serif;';

  c.innerHTML = `
    <style>@keyframes _pcTw{0%,100%{opacity:.2}50%{opacity:.75}}</style>

    <!-- 유형 헤더 -->
    <div style="
      position:relative;overflow:hidden;border-radius:20px;
      background:radial-gradient(120% 90% at 50% -10%, #241c4c 0%, #15103a 55%, #0b0a1e 100%);
      border:1px solid rgba(200,168,96,.26);
      box-shadow:0 22px 60px -30px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.05);
      padding:26px 22px 24px;text-align:center;margin-bottom:14px;
    ">
      <span style="position:absolute;top:20px;right:30px;width:2px;height:2px;border-radius:50%;
        background:#f0e3b8;box-shadow:0 0 6px 1px rgba(240,227,184,.5);animation:_pcTw 3.6s ease-in-out infinite;"></span>

      <div style="font-size:11px;letter-spacing:.26em;color:#9f93c0;margin-bottom:12px;">당신이 타고난 잠재력</div>

      <div style="margin:0 0 10px;font-size:24px;line-height:1.4;font-weight:700;letter-spacing:.01em;font-family:Georgia,serif;${goldText}">
        ${typeName}
      </div>
      <div style="margin:0 0 20px;font-size:13px;color:#bcb1d4;font-weight:300;letter-spacing:.02em;font-family:Georgia,serif;">
        ${typeDesc}
      </div>

      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
        <span style="${pillStyle}">${ilju}</span>
        <span style="${pillStyle}">${strengthLabel}</span>
        <span style="${pillStyle}">${geokKr}</span>
      </div>
    </div>

    <!-- 점수 카드 그리드 -->
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;">
      ${sorted.map(item => `
        <div style="
          display:flex;flex-direction:column;padding:16px;border-radius:14px;
          background:linear-gradient(158deg, rgba(44,36,82,.45) 0%, rgba(17,13,36,.6) 100%);
          border:1px solid rgba(200,168,96,.2);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
        ">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:11px;">
            <span style="font-size:13px;color:#bdb29a;letter-spacing:.02em;">${item.label}</span>
            ${item.rank ? `<span style="font-size:10px;letter-spacing:.04em;color:#d6bf85;
              border:1px solid rgba(200,168,96,.4);background:rgba(200,168,96,.08);
              padding:3px 8px;border-radius:999px;white-space:nowrap;">${item.rank}</span>` : ''}
          </div>
          <div style="height:1px;background:linear-gradient(90deg,rgba(200,168,96,.28),transparent);margin-bottom:11px;"></div>
          <div style="font-size:34px;font-weight:600;line-height:1;font-family:Georgia,serif;${item.rank ? goldText : 'color:#b0a487;'}">
            ${item.score}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/* =========================================================
   PART 3 (기존): stub 함수들
   ========================================================= */
function renderGeokInfo()     {}
function renderStrengthInfo() {}
function renderBaseScore()    {}

/* =========================================================
   PART 3.2: 12신살 렌더링 (년지/일지 기준 둘 다 표시)
   ========================================================= */
function renderShinsalInfo(shinsal) {
  const c = _$("shinsalPanel");
  if (!c || !shinsal) return;

  const POS_ORDER = ["year","month","day","hour"];
  const cellsHtml = POS_ORDER.map((key, i) => {
    const s = shinsal[key];
    if (!s) return "";
    const tagHtml = (tag, srcLabel) => tag
      ? `<span style="font-size:11px;padding:3px 9px;border-radius:999px;font-family:Georgia,serif;
           color:#e6ddc8;border:1px solid rgba(200,168,96,.35);background:rgba(200,168,96,.1);">${tag}<span style="color:#8d8268;font-size:9.5px;"> ${srcLabel}</span></span>`
      : `<span style="font-size:11px;color:#5c5644;">-</span>`;
    const borderRight = i < POS_ORDER.length - 1 ? "border-right:1px solid rgba(200,168,96,.12);" : "";
    return `
      <div style="flex:1;min-width:0;text-align:center;padding:10px 4px;${borderRight}">
        <div style="font-size:11px;color:#8d8268;margin-bottom:4px;">${s.label}</div>
        <div style="font-size:17px;color:#e6ddc8;font-family:Georgia,serif;margin-bottom:8px;">${s.branch}</div>
        <div style="display:flex;flex-direction:column;gap:5px;align-items:center;">
          ${tagHtml(s.byYear, "년")}
          ${tagHtml(s.byDay, "일")}
        </div>
      </div>
    `;
  }).join('');

  c.innerHTML = `
    <div class="result-card">
      <div class="card-title">12신살</div>
      <div class="tiny">년지 기준 · 일지 기준 두 가지로 표시</div>
      <div style="display:flex;margin-top:10px;border:1px solid rgba(200,168,96,.16);border-radius:12px;overflow:hidden;">
        ${cellsHtml}
      </div>
    </div>
  `;
}

/* =========================================================
   PART 3.5: 용신·희신·기신·한신 렌더링
   ========================================================= */
function renderGodsInfo(gods) {
  const c = _$("godsPanel");
  if (!c || !gods) return;
  const D = window.SajuData;

  const ROWS = [
    { key:"yong", label:"용신", hanja:"用神", desc:"가장 필요한 핵심 기운", color:"#bdeede", border:"rgba(120,210,180,.4)", bg:"rgba(60,180,140,.1)" },
    { key:"hee",  label:"희신", hanja:"喜神", desc:"용신을 돕는 보조 기운", color:"#bcd9ee", border:"rgba(120,180,210,.4)", bg:"rgba(60,140,180,.1)" },
    { key:"gi",   label:"기신", hanja:"忌神", desc:"피하면 좋은 기운",     color:"#e8b9ad", border:"rgba(221,155,136,.4)", bg:"rgba(221,155,136,.1)" },
    { key:"han",  label:"한신", hanja:"閑神", desc:"중립적인 기운",        color:"#cbc4ad", border:"rgba(180,170,140,.4)", bg:"rgba(140,130,100,.1)" },
  ];

  const rowsHtml = ROWS.map(r => {
    const grp = gods[r.key];
    if (!grp || !grp.tenGods || !grp.tenGods.length) return "";
    const pills = grp.tenGods.map(tg => {
      const disp = (typeof getShishenDisplay === "function") ? getShishenDisplay(tg) : tg;
      return `<span style="font-size:12.5px;padding:4px 11px;border-radius:999px;font-family:Georgia,serif;
        color:${r.color};border:1px solid ${r.border};background:${r.bg};">${disp}</span>`;
    }).join('');
    const elKr = (grp.elements || []).map(e => D.WUXING_LABEL[e] || e).join('·');
    return `
      <div style="display:flex;align-items:flex-start;gap:13px;padding:13px 2px;border-bottom:1px solid rgba(200,168,96,.12);">
        <div style="flex:0 0 64px;">
          <div style="font-size:15px;color:#e6ddc8;font-family:Georgia,serif;">${r.label}</div>
          <div style="font-size:10.5px;color:#8d8268;margin-top:1px;">${r.hanja}</div>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:5px;">${pills}</div>
          <div style="font-size:11.5px;color:#8d8268;">${r.desc}${elKr ? ` · ${elKr}` : ''}</div>
        </div>
      </div>
    `;
  }).join('');

  c.innerHTML = `
    <div style="
      border-radius:20px;
      background:radial-gradient(120% 50% at 50% -6%, #1a1540 0%, #0e0b24 55%, #08060f 100%);
      border:1px solid rgba(200,168,96,.2);
      box-shadow:0 24px 60px -30px rgba(0,0,0,.92);
      padding:20px 18px 8px;margin-bottom:14px;
    ">
      <div style="font-size:11px;letter-spacing:.26em;color:#9f93c0;margin-bottom:10px;">사주 자원 분석</div>
      <div style="margin:0 0 14px;font-size:18px;font-weight:700;font-family:Georgia,serif;
        background:linear-gradient(100deg,#f6e9c1 0%,#e0c684 45%,#caa74e 100%);
        -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;">
        용신 · 희신 · 기신 · 한신
      </div>
      <div>${rowsHtml}</div>
    </div>
  `;
}

/* =========================================================
   PART 4: 전체 분석 렌더링
   ========================================================= */

function renderFullAnalysis() {
  if (!window.SajuResult) return;
  if (!window.SajuEngine?.buildState) return;

  const baseState = window.SajuEngine.buildState(window.SajuResult.fourPillars);

  renderGodsInfo(baseState.gods);
  if (window.SajuResult) {
    window.SajuResult.gods         = baseState.gods;
    window.SajuResult.geok         = baseState.geok;
    window.SajuResult.strength     = baseState.strength;
    window.SajuResult.interactions = baseState.interactions;
  }

  if (window.SajuEngine.computeResourceScores) {
    const resourceResult = window.SajuEngine.computeResourceScores(baseState);
    renderResourcePanel(resourceResult);
    if (window.SajuResult) window.SajuResult.resourceResult = resourceResult;

    // 유형 카드 + 점수
    if (window.SajuEngine.computePersonalityCard) {
      const cardData = window.SajuEngine.computePersonalityCard(baseState, resourceResult);
      renderPersonalityCard(cardData);
      if (window.SajuResult) window.SajuResult.personalityCard = cardData;
    }
  }

  // 메인 화면 상단 프로필 카드(일주·격 칩)도 갱신
  if (typeof renderHomeProfileStatus === "function") renderHomeProfileStatus();
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
  renderShinsalInfo,
  renderBaseScore,
  renderResourcePanel,
  renderPersonalityCard,
  renderFullAnalysis,
};

console.log("✅ saju_ui.js 로드 완료");
