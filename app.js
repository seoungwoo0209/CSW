/* =========================================================
   앱 초기화 (app.js)  v2.0
   변경 사항:
   - birthCity 입력 이벤트 바인딩 추가
   - 차트 미리계산: 출생 정보 바뀔 때마다 /api/astro-calc 호출 → window.AstroResult 저장
   - requestAstroReading(): 계산 건너뛰고 Gemini 해석만 호출 (속도 개선)
   - 출생도시 → select 드롭다운 (지역별 optgroup)
   - window.AstroResult 캐시로 탭 전환 시 재계산 없음
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

// 화면별 전용 알림창(예: jobHuntingAlert) — 실제 백엔드 오류 메시지를 그대로 보여줌
function _setInlineAlert(elId, msg) {
  const el = _$(elId);
  if (!el) return;
  if (!msg) { el.textContent = ""; el.classList.add("hidden"); }
  else      { el.textContent = msg; el.classList.remove("hidden"); }
}

// 연애운/재회운/직업 4종 — 결과 화면을 인트로(버튼 누르는) 상태로 되돌림.
// 출생 정보가 바뀌는 모든 지점(프로필 전환/수정/삭제, 생년월일 입력 변경 등)에서 호출해야
// 이전 사람의 결과 HTML이 화면에 남아있는 일이 없다.
function _resetCareerLikeResultScreens() {
  ['loveFortune', 'reunionFortune', 'jobHunting', 'promotion', 'jobChange', 'startup', 'business'].forEach(idPrefix => {
    const introCard  = _$(idPrefix + 'InputCard');
    const resultArea = _$(idPrefix + 'ResultArea');
    if (resultArea) { resultArea.style.display = 'none'; resultArea.innerHTML = ''; }
    if (introCard)  introCard.style.display = '';
    _setInlineAlert(idPrefix + 'Alert', '');
  });
}

function _invalidateAstroResult() {
  window.AstroResult = null;
  window.TodayResult = null;
  if (typeof _setLoveRelationshipStatus === 'function') _setLoveRelationshipStatus('solo');
  _resetCareerLikeResultScreens();
}

/* =========================================================
   다중 프로필 / 사람별·화면별 현재 위치 — localStorage 영구 저장
   - profiles: { id, name, gender, birthDate, calendarType, isLeapMonth,
                 birthTime, timeUnknown, birthPlace } 배열
   - activeProfileId: 지금 보고 있는 프로필 id
   - 화면별 위치: sajuCafe.location.{profileId}.{today|astro} — 사람별+화면별 분리
   ========================================================= */
const PROFILES_KEY    = "sajuCafe.profiles";
const ACTIVE_ID_KEY   = "sajuCafe.activeProfileId";
const LEGACY_PROFILE_KEY = "sajuCafe.profile"; // v1/v2 단일 프로필(마이그레이션 대상)

function _genProfileId() {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function _loadProfilesRaw() {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY)) || []; } catch (e) { return []; }
}
function _saveProfilesRaw(list) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); } catch (e) {}
}
function getActiveProfileId() {
  return localStorage.getItem(ACTIVE_ID_KEY) || null;
}
function setActiveProfileId(id) {
  try { localStorage.setItem(ACTIVE_ID_KEY, id || ""); } catch (e) {}
}

// 기존 단일 프로필(v1/v2)이 있으면 1회만 목록 구조로 옮긴다. 유실 방지.
function _migrateLegacyProfile() {
  if (localStorage.getItem(PROFILES_KEY) != null) return; // 이미 마이그레이션됨(빈 배열 "[]" 포함)
  const legacyRaw = localStorage.getItem(LEGACY_PROFILE_KEY);
  if (legacyRaw) {
    try {
      const legacy = JSON.parse(legacyRaw);
      if (legacy && legacy.birthDate) {
        const id = _genProfileId();
        _saveProfilesRaw([{ ...legacy, id }]);
        setActiveProfileId(id);
      } else {
        _saveProfilesRaw([]);
      }
    } catch (e) {
      _saveProfilesRaw([]);
    }
  } else {
    _saveProfilesRaw([]);
  }
  localStorage.removeItem(LEGACY_PROFILE_KEY);
}

function getProfiles() {
  _migrateLegacyProfile();
  return _loadProfilesRaw();
}
// 활성 프로필 객체(없으면 null) — 기존 호출부와의 호환을 위해 이름 유지
function getProfile() {
  const list = getProfiles();
  const activeId = getActiveProfileId();
  return list.find(p => p.id === activeId) || list[0] || null;
}
function hasProfile() {
  return !!getProfile();
}
function addProfile(data) {
  const list = getProfiles();
  const profile = { ...data, id: _genProfileId() };
  list.push(profile);
  _saveProfilesRaw(list);
  setActiveProfileId(profile.id);
  return profile;
}
function updateProfile(id, data) {
  const list = getProfiles();
  const idx = list.findIndex(p => p.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...data, id };
  _saveProfilesRaw(list);
  return list[idx];
}
function deleteProfile(id) {
  const list = getProfiles().filter(p => p.id !== id);
  _saveProfilesRaw(list);
  try {
    localStorage.removeItem(`sajuCafe.location.${id}.today`);
    localStorage.removeItem(`sajuCafe.location.${id}.astro`);
  } catch (e) {}
  if (getActiveProfileId() === id) {
    setActiveProfileId(list.length > 0 ? list[0].id : null);
  }
}

function getScreenLocation(screenKey) {
  const profile = getProfile();
  if (!profile) return null;
  try {
    const raw = localStorage.getItem(`sajuCafe.location.${profile.id}.${screenKey}`);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && v.city) return v.city;
    }
  } catch (e) {}
  return profile.birthPlace || null;
}
function setScreenLocation(screenKey, city) {
  const profile = getProfile();
  if (!profile) return;
  try { localStorage.setItem(`sajuCafe.location.${profile.id}.${screenKey}`, JSON.stringify({ city })); } catch (e) {}
}

// 활성 프로필이 바뀔 때마다 폼/캐시/위치 변수를 그 사람 기준으로 다시 맞춘다.
function syncFormFromProfile(p) {
  if (!p) return;
  if (_$("name"))           _$("name").value           = p.name || "";
  if (_$("gender"))         _$("gender").value          = p.gender || "M";
  if (_$("birthDate"))      _$("birthDate").value      = p.solarBirthDate || p.birthDate || "";
  if (_$("birthTime"))      _$("birthTime").value      = p.timeUnknown ? "12:00" : (p.birthTime || "");
  if (_$("birthCityInput")) _$("birthCityInput").value = p.birthPlace || "서울";
  if (_$("birthCity"))      _$("birthCity").value      = p.birthPlace || "서울";
}
function refreshLocationVars() {
  _todayCity       = getScreenLocation('today');
  _solarReturnCity = getScreenLocation('astro');
}

/* =========================================================
   스크린 내비게이션 (모바일 앱 구조)
   ========================================================= */
function enterScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + id);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);

  // 연간 운세 진입 시: 사주 데이터 있으면 패널 즉시 세팅
  if (id === 'annual') {
    const panel = document.getElementById('lifeGraphPanel');
    const hasDefault = panel && panel.querySelector('[data-default-msg]');
    const birthDate = _$('birthDate')?.value;
    if (birthDate && window.AstroResult) {
      renderAnnualEventsPanel(window.AstroResult);
    } else if (birthDate && !window.AstroResult) {
      if (panel) panel.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:20px;text-align:center;">🔄 점성술 데이터 계산 중...</div>';
    }
  }

  // 오늘의 운세 진입 시: 화면별로 보관된 현재 위치(기본값 출생지)를 입력칸에 채움
  if (id === 'today') {
    const input = _$('todayCityInput');
    if (input) input.value = _todayCity || getCitySelectValue();
  }
}

/* =========================================================
   홈 카드 탭 분기 — 활성 프로필 있으면 화면 이동, 없으면 입력 시트
   ========================================================= */
function onCardTap(feature) {
  if (hasProfile()) {
    enterScreen(feature);
  } else {
    openProfileSheetForNew(feature, "home");
  }
}

/* =========================================================
   프로필 목록 화면 — 전환 / 추가 / 수정 / 삭제
   ========================================================= */
function openProfileListScreen() {
  renderProfileListScreen();
  enterScreen("profileList");
}

function renderProfileListScreen() {
  const container = _$("profileListContainer");
  if (!container) return;

  const list     = getProfiles();
  const activeId = getActiveProfileId();

  const itemsHtml = list.map(p => {
    const isActive = p.id === activeId;
    const calLabel = p.calendarType === "lunar" ? "음력" : "양력";
    const parts    = (p.birthDate || "").split("-");
    const dateStr  = parts.length === 3 ? `${calLabel} ${parts[0]}. ${Number(parts[1])}. ${Number(parts[2])}` : "";
    return `
      <div onclick="selectActiveProfile('${p.id}')" style="
        display:flex;align-items:center;gap:10px;padding:14px 16px;margin-bottom:10px;border-radius:14px;cursor:pointer;
        background:${isActive ? "radial-gradient(120% 90% at 50% -10%, #241c4c 0%, #15103a 55%, #0b0a1e 100%)" : "rgba(255,255,255,.03)"};
        border:1px solid ${isActive ? "rgba(200,168,96,.4)" : "rgba(200,168,96,.16)"};">
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;color:#efe8d6;font-weight:600;">
            ${p.name || "이름 없음"}${isActive ? ' <span style="color:#dfba6b;font-size:11px;">(선택됨)</span>' : ""}
          </div>
          <div style="font-size:11.5px;color:#9b8f74;margin-top:2px;">${dateStr}${p.birthPlace ? " · " + p.birthPlace : ""}</div>
        </div>
        <button type="button" onclick="event.stopPropagation();openProfileSheetForEdit('${p.id}','list')" aria-label="수정" style="
          background:none;border:1px solid rgba(200,168,96,.3);border-radius:8px;width:30px;height:30px;flex-shrink:0;
          display:flex;align-items:center;justify-content:center;cursor:pointer;color:#c8a860;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1"/>
            <path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z"/>
          </svg>
        </button>
        <button type="button" onclick="event.stopPropagation();deleteProfileFromList('${p.id}')" aria-label="삭제" style="
          background:none;border:1px solid rgba(200,100,100,.3);border-radius:8px;width:30px;height:30px;flex-shrink:0;
          display:flex;align-items:center;justify-content:center;cursor:pointer;color:#c98a7a;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>
          </svg>
        </button>
      </div>
    `;
  }).join("");

  const addHtml = `
    <div onclick="openProfileSheetForNew(null,'list')" style="
      display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;
      padding:14px 16px;border-radius:14px;border:1px dashed rgba(200,168,96,.3);color:#c8a860;font-size:14px;font-weight:600;">
      + 새 프로필 추가
    </div>
  `;

  container.innerHTML = itemsHtml + addHtml;
}

function selectActiveProfile(id) {
  if (id === getActiveProfileId()) { goHome(); return; }
  setActiveProfileId(id);
  _invalidateAstroResult();
  refreshLocationVars();
  const p = getProfile();
  if (p) { syncFormFromProfile(p); setCalendarType("solar"); }
  renderHomeProfileStatus();
  goHome();
}

function deleteProfileFromList(id) {
  if (!confirm("정말 삭제할까요?")) return;
  deleteProfile(id);
  _invalidateAstroResult();
  refreshLocationVars();
  const p = getProfile();
  if (p) { syncFormFromProfile(p); setCalendarType("solar"); }
  renderHomeProfileStatus();
  if (!hasProfile()) {
    goHome();
  } else {
    renderProfileListScreen();
  }
}

function goHome() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const home = document.getElementById('screen-home');
  if (home) home.classList.add('active');
  window.scrollTo(0, 0);
}

// 하위 호환: 기존 setTabs() 호출 대비
function setTabs() {}

/* =========================================================
   양력/음력 토글
   ========================================================= */
function setCalendarType(type) {
  const hidden = _$("calendarType");
  if (hidden) hidden.value = type;

  const activeStyle   = "background:linear-gradient(135deg,#c8a860,#e0c684);color:#1a1530;font-weight:700;";
  const inactiveStyle = "background:transparent;color:#9b8f74;font-weight:600;";
  const baseStyle     = "padding:13px 14px;font-size:13px;border:none;cursor:pointer;font-family:inherit;";

  const solarBtn = _$("calTypeSolarBtn");
  const lunarBtn = _$("calTypeLunarBtn");
  if (solarBtn) solarBtn.style.cssText = baseStyle + (type === "solar" ? activeStyle : inactiveStyle);
  if (lunarBtn) lunarBtn.style.cssText = baseStyle + (type === "lunar" ? activeStyle : inactiveStyle);

  const leapRow = _$("leapMonthRow");
  if (leapRow) leapRow.style.display = type === "lunar" ? "flex" : "none";
  if (type === "solar") {
    const cb = _$("isLeapMonth");
    if (cb) cb.checked = false;
    const noteEl = _$("lunarConvertNote");
    if (noteEl) noteEl.textContent = "";
  }

  _invalidateAstroResult();
  runAll();
}

/* =========================================================
   프로필 입력 시트 (bottom sheet)
   ========================================================= */
const PROFILE_SHEET_COPY = {
  saju:   { title: "정통 사주를 보려면",   ctaSuffix: "정통 사주 보기" },
  today:  { title: "오늘의 운세를 보려면", ctaSuffix: "오늘의 운세 보기" },
  annual: { title: "연간 리포트를 보려면", ctaSuffix: "연간 리포트 보기" },
  astro:  { title: "나의 차트를 보려면",   ctaSuffix: "나의 차트 보기" },
  love:   { title: "연애운을 보려면",     ctaSuffix: "연애 보기" },
};

// mode: 'new' | 'edit'. editingId: 수정 대상 프로필 id. enteredFrom: 새 프로필 저장 후 이동할 feature.
// returnTo: 'home' | 'list' — 저장/삭제 후 어디로 돌아갈지.
let _profileSheetContext = { mode: "new", editingId: null, enteredFrom: null, returnTo: "home" };

function setProfileSheetCalType(type) {
  const hidden = _$("psCalendarType");
  if (hidden) hidden.value = type;

  const activeStyle   = "background:linear-gradient(135deg,#c8a860,#e0c684);color:#1a1530;font-weight:700;";
  const inactiveStyle = "background:transparent;color:#9b8f74;font-weight:600;";
  const baseStyle     = "padding:13px 14px;font-size:13px;border:none;cursor:pointer;font-family:inherit;";

  const solarBtn = _$("psCalSolarBtn");
  const lunarBtn = _$("psCalLunarBtn");
  if (solarBtn) solarBtn.style.cssText = baseStyle + (type === "solar" ? activeStyle : inactiveStyle);
  if (lunarBtn) lunarBtn.style.cssText = baseStyle + (type === "lunar" ? activeStyle : inactiveStyle);

  const leapRow = _$("psLeapMonthRow");
  if (leapRow) leapRow.style.display = type === "lunar" ? "flex" : "none";
  if (type === "solar") {
    const cb = _$("psIsLeapMonth");
    if (cb) cb.checked = false;
  }
}

function toggleProfileSheetTimeUnknown() {
  const cb        = _$("psTimeUnknown");
  const timeInput = _$("psBirthTime");
  if (!cb || !timeInput) return;
  timeInput.disabled = cb.checked;
  if (cb.checked) timeInput.value = "";
}

function filterPsCityList(val) {
  const dropdown = _$('psCityDropdown');
  if (!dropdown) return;
  const q = val.trim().toLowerCase();
  const matched = Object.keys(CITY_COORDS).filter(c => c.toLowerCase().includes(q)).slice(0, 30);
  if (matched.length === 0 || q === '') { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = matched.map(c =>
    '<div onclick="selectPsCity(\'' + c + '\')" style="padding:8px 12px;font-size:13px;color:#e2e8f0;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);" onmouseover="this.style.background=\'rgba(255,255,255,.08)\'" onmouseout="this.style.background=\'\'">' + c + '</div>'
  ).join('');
  dropdown.style.display = 'block';
}
function showPsCityList() {
  const input = _$('psCityInput');
  if (input) filterPsCityList(input.value);
}
function hidePsCityList() {
  const d = _$('psCityDropdown');
  if (d) d.style.display = 'none';
}
function selectPsCity(cityName) {
  const input  = _$('psCityInput');
  const hidden = _$('psCity');
  if (input)  input.value  = cityName;
  if (hidden) hidden.value = cityName;
  hidePsCityList();
}

function _resetProfileSheetFields() {
  if (_$("psName"))   _$("psName").value   = "";
  if (_$("psGender")) _$("psGender").value = "M";
  setProfileSheetCalType("solar");
  if (_$("psBirthDate"))   _$("psBirthDate").value   = "";
  if (_$("psIsLeapMonth")) _$("psIsLeapMonth").checked = false;
  if (_$("psTimeUnknown")) _$("psTimeUnknown").checked = false;
  if (_$("psBirthTime")) { _$("psBirthTime").value = ""; _$("psBirthTime").disabled = false; }
  if (_$("psCityInput")) _$("psCityInput").value = "";
  if (_$("psCity"))      _$("psCity").value      = "";
}

function _fillProfileSheetFields(p) {
  if (_$("psName"))   _$("psName").value   = p.name || "";
  if (_$("psGender")) _$("psGender").value = p.gender || "M";
  setProfileSheetCalType(p.calendarType || "solar");
  if (_$("psBirthDate"))   _$("psBirthDate").value   = p.birthDate || "";
  if (_$("psIsLeapMonth")) _$("psIsLeapMonth").checked = !!p.isLeapMonth;
  if (_$("psTimeUnknown")) _$("psTimeUnknown").checked = !!p.timeUnknown;
  if (_$("psBirthTime")) {
    _$("psBirthTime").value    = p.timeUnknown ? "" : (p.birthTime || "");
    _$("psBirthTime").disabled = !!p.timeUnknown;
  }
  if (_$("psCityInput")) _$("psCityInput").value = p.birthPlace || "";
  if (_$("psCity"))      _$("psCity").value      = p.birthPlace || "";
}

function _showProfileSheet() {
  const alertEl = _$("psAlert");
  if (alertEl) { alertEl.style.display = "none"; alertEl.textContent = ""; }
  const overlay = _$("profileSheetOverlay");
  if (overlay) overlay.style.display = "block";
}

// feature: 카드 탭으로 진입했을 때만 전달(시트 문구/이동 대상 결정). returnTo: 저장 후 'home' | 'list'.
function openProfileSheetForNew(feature, returnTo) {
  _profileSheetContext = { mode: "new", editingId: null, enteredFrom: feature || null, returnTo: returnTo || "home" };

  const copy    = feature ? (PROFILE_SHEET_COPY[feature] || PROFILE_SHEET_COPY.saju) : null;
  const titleEl = _$("profileSheetTitle");
  const ctaEl   = _$("profileSheetSubmitLabel");
  if (titleEl) titleEl.textContent = copy ? copy.title : "새 프로필 추가";
  if (ctaEl)   ctaEl.textContent   = copy ? ("저장하고 " + copy.ctaSuffix) : "저장하기";

  _resetProfileSheetFields();
  const delBtn = _$("psDeleteBtn");
  if (delBtn) delBtn.style.display = "none";
  _showProfileSheet();
}

// id: 수정할 프로필 id. returnTo: 저장/삭제 후 'home' | 'list'.
function openProfileSheetForEdit(id, returnTo) {
  const p = getProfiles().find(x => x.id === id);
  if (!p) return;
  _profileSheetContext = { mode: "edit", editingId: id, enteredFrom: null, returnTo: returnTo || "home" };

  const titleEl = _$("profileSheetTitle");
  const ctaEl   = _$("profileSheetSubmitLabel");
  if (titleEl) titleEl.textContent = "내 사주 정보 수정";
  if (ctaEl)   ctaEl.textContent   = "저장하기";

  _fillProfileSheetFields(p);
  const delBtn = _$("psDeleteBtn");
  if (delBtn) delBtn.style.display = "block";
  _showProfileSheet();
}

function closeProfileSheet() {
  const overlay = _$("profileSheetOverlay");
  if (overlay) overlay.style.display = "none";
}

function submitProfileSheet() {
  const alertEl = _$("psAlert");
  function showErr(msg) {
    if (alertEl) { alertEl.textContent = msg; alertEl.style.display = "block"; }
  }
  if (alertEl) alertEl.style.display = "none";

  const name         = (_$("psName")?.value || "").trim();
  const gender       = _$("psGender")?.value || "M";
  const calendarType = _$("psCalendarType")?.value || "solar";
  const rawDate      = _$("psBirthDate")?.value || "";
  const isLeapMonth  = !!_$("psIsLeapMonth")?.checked;
  const timeUnknown  = !!_$("psTimeUnknown")?.checked;
  const birthTime    = timeUnknown ? null : (_$("psBirthTime")?.value || "");
  const birthPlace   = (_$("psCity")?.value || _$("psCityInput")?.value || "").trim();

  if (!name)                      { showErr("이름을 입력해주세요."); return; }
  if (!rawDate)                   { showErr("생년월일을 입력해주세요."); return; }
  if (!birthPlace)                { showErr("출생지를 입력해주세요."); return; }
  if (!timeUnknown && !birthTime) { showErr("출생 시각을 입력하거나 '시간 모름'을 선택해주세요."); return; }

  // 음력 입력은 항상 양력으로 변환해 저장 (계산 엔진은 항상 양력 기준 날짜를 받음)
  let solarBirthDate = rawDate;
  if (calendarType === "lunar") {
    const [ly, lm, ld] = rawDate.split("-").map(Number);
    try {
      const solar = window.LunarCalendar.lunarToSolar(ly, lm, ld, isLeapMonth);
      solarBirthDate = `${solar.year}-${String(solar.month).padStart(2, "0")}-${String(solar.day).padStart(2, "0")}`;
    } catch (e) {
      showErr("음력 날짜 변환 오류: " + (e.message || e));
      return;
    }
  }

  const data = { name, gender, birthDate: rawDate, solarBirthDate, calendarType, isLeapMonth, birthTime, timeUnknown, birthPlace };

  if (_profileSheetContext.mode === "edit" && _profileSheetContext.editingId) {
    updateProfile(_profileSheetContext.editingId, data);
  } else {
    addProfile(data);
  }

  closeProfileSheet();

  const p = getProfile();
  syncFormFromProfile(p);
  _invalidateAstroResult();
  refreshLocationVars();
  setCalendarType("solar"); // 폼 토글 동기화 + 내부적으로 runAll() 실행

  renderHomeProfileStatus();

  if (_profileSheetContext.returnTo === "list") {
    renderProfileListScreen();
    enterScreen("profileList");
  } else if (_profileSheetContext.mode === "new" && _profileSheetContext.enteredFrom) {
    enterScreen(_profileSheetContext.enteredFrom);
  }

  _profileSheetContext = { mode: "new", editingId: null, enteredFrom: null, returnTo: "home" };
}

function deleteProfileFromSheet() {
  if (!_profileSheetContext.editingId) return;
  if (!confirm("정말 삭제할까요?")) return;

  const returnTo = _profileSheetContext.returnTo;
  deleteProfile(_profileSheetContext.editingId);
  closeProfileSheet();

  _invalidateAstroResult();
  refreshLocationVars();
  const p = getProfile();
  if (p) { syncFormFromProfile(p); setCalendarType("solar"); }
  renderHomeProfileStatus();

  if (!hasProfile()) {
    goHome();
  } else if (returnTo === "list") {
    renderProfileListScreen();
    enterScreen("profileList");
  } else {
    goHome();
  }

  _profileSheetContext = { mode: "new", editingId: null, enteredFrom: null, returnTo: "home" };
}

/* =========================================================
   메인 화면 상단 — 프로필 상태(두 모습) 렌더링
   ========================================================= */
function renderHomeProfileStatus() {
  // 히어로 문구·4카드는 프로필 유무와 무관하게 항상 동일하다.
  // 히어로 바로 아래 "프로필 만들기" 카드 ↔ 프로필 카드만 상태에 따라 바뀐다.
  const emptyEl = _$("homeProfileEmpty");
  const cardEl  = _$("homeProfileCard");
  const profile = getProfile();

  if (!profile) {
    if (emptyEl) emptyEl.style.display = "flex";
    if (cardEl)  cardEl.style.display  = "none";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";
  if (cardEl)  cardEl.style.display  = "block";

  const labelEl = _$("homeProfileLabel");
  if (labelEl) labelEl.textContent = profile.name ? `${profile.name}님의 사주` : "내 사주";

  const dateLine = _$("homeProfileDateLine");
  if (dateLine && profile.birthDate) {
    const calLabel  = profile.calendarType === "lunar" ? "음력" : "양력";
    const [y, m, d] = profile.birthDate.split("-");
    const timeLabel = profile.timeUnknown ? "시간 모름" : (profile.birthTime || "");
    dateLine.textContent = `${calLabel} ${y}. ${Number(m)}. ${Number(d)}`
      + (timeLabel ? ` · ${timeLabel}` : "")
      + (profile.birthPlace ? ` · ${profile.birthPlace}` : "");
  }

  const chipsEl = _$("homeProfileChips");
  const pc = window.SajuResult?.personalityCard;
  if (chipsEl) {
    if (pc) {
      const pillStyle = "font-size:11px;padding:4px 11px;border-radius:20px;border:1px solid rgba(200,168,96,.35);color:#dfba6b;background:rgba(200,168,96,.08);";
      chipsEl.innerHTML = [pc.ilju, pc.strengthLabel, pc.geokKr].filter(Boolean)
        .map(t => `<span style="${pillStyle}">${t}</span>`).join("");
    } else {
      chipsEl.innerHTML = "";
    }
  }
}

/* =========================================================
   메인 사주 계산 및 렌더링
   ========================================================= */
/* runAll(): 사주 데이터 "조용히 미리 계산"만 담당.
   프로필 로드/입력값 변경 시마다 자동 실행되어 다른 탭(점성술·오늘의
   운세·연간운세)이 쓸 window.SajuResult를 준비해둔다. 화면 공개나
   AI 호출은 절대 하지 않음 — 그건 revealSajuResults()(버튼 클릭
   전용)의 책임. */
function runAll() {
  setAlert("");

  const name         = _$("name")?.value.trim() || "";
  const calendarType = _$("calendarType")?.value || "solar";
  let   birthDate    = _$("birthDate")?.value || "";
  const birthTime    = _$("birthTime")?.value || "";
  const gender       = _$("gender")?.value || "M";

  if (!birthDate || !birthTime) {
    setAlert("생년월일과 출생시각을 모두 입력해주세요.");
    return;
  }

  // ── 음력 입력 시 양력으로 변환 (이후 로직은 전부 양력 기준)
  let lunarInput = null;
  const noteEl = _$("lunarConvertNote");
  if (calendarType === "lunar") {
    const [ly, lm, ld] = birthDate.split("-").map(Number);
    const isLeap = !!_$("isLeapMonth")?.checked;
    try {
      const solar = window.LunarCalendar.lunarToSolar(ly, lm, ld, isLeap);
      lunarInput = { year: ly, month: lm, day: ld, isLeapMonth: isLeap };
      birthDate = `${solar.year}-${String(solar.month).padStart(2, "0")}-${String(solar.day).padStart(2, "0")}`;
      if (noteEl) noteEl.textContent = `→ 양력 ${solar.year}년 ${solar.month}월 ${solar.day}일로 변환되었습니다.`;
    } catch (e) {
      if (noteEl) noteEl.textContent = "";
      setAlert("음력 날짜 변환 오류: " + (e.message || e));
      return;
    }
  } else if (noteEl) {
    noteEl.textContent = "";
  }

  // 이전 사람의 AI 해설 블록이 남아있으면 제거(패널은 새로 그려지지만 형제 노드라 자동 제거되지 않음)
  document.querySelectorAll('[id^="aiBlock-"]').forEach(el => el.remove());

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

  // ── 12신살
  if (typeof calc12Shinsal === "function") {
    window.SajuUI.renderShinsalInfo(calc12Shinsal(fourPillars));
  }

  const hw = getWuxingCounts(fourPillars, true);
  const barsHidden = _$("barsHidden");
  if (barsHidden && hw?.withHidden) window.SajuUI.renderBars(barsHidden, hw.withHidden);

  if (approx) console.log("ℹ️ 절기 근사모드 사용");

  // ── SajuResult 저장
  const yinyang = getYinYangCounts(fourPillars, false);
  const yinyangWithHidden = getYinYangCounts(fourPillars, true);

  // ── 대운 타임라인 + 현재 진행 중인 대운 인덱스
  let daeunTimeline = null, currentDecadeIdx = -1;
  if (typeof buildDaeunTimeline === "function") {
    daeunTimeline = buildDaeunTimeline(fourPillars, birthUtc, gender);
    const ageNowYears = (Date.now() - birthUtc.getTime()) / (365.2425 * 86400000);
    currentDecadeIdx = daeunTimeline.decades.findIndex(
      d => ageNowYears >= d.startAge && ageNowYears < d.startAge + 10
    );
    if (window.SajuUI?.renderDaeunInfo) window.SajuUI.renderDaeunInfo(daeunTimeline, currentDecadeIdx);
  }

  window.SajuResult = {
    name, birthDate, birthTime, gender, lunarInput,
    fourPillars, birthUtc, approx,
    surface,
    yinyang,
    yinyangWithHidden: yinyangWithHidden.withHidden,
    natalBranches: [fourPillars.year.branch, fourPillars.month.branch, fourPillars.day.branch, fourPillars.hour.branch],
    shinsal: (typeof calc12Shinsal === "function") ? calc12Shinsal(fourPillars) : null,
    daeunTimeline, currentDecadeIdx,
  };

  // ── 연간 운세 탭: 로딩 상태 (정통사주 화면 공개와 무관하게 즉시 진행)
  const _lgp = document.getElementById('lifeGraphPanel');
  if (_lgp) _lgp.innerHTML = '<div style="color:#a5b4fc;font-size:13px;padding:30px;text-align:center;">⭐ 차트 계산 중...</div>';

  // ── 점성술 차트 미리 계산 (정통사주 화면 공개와 무관하게 즉시 진행)
  scheduleAstroCalc();
}

/* revealSajuResults(): "✨ 정통 사주 보기" 버튼 클릭 전용.
   여기서만 로딩 표시·AI 호출·결과 화면 공개가 일어난다. */
let _revealInFlight = false;

async function revealSajuResults() {
  if (_revealInFlight) return; // 중복 클릭 방지
  if (!window.SajuResult) {
    alert("생년월일과 출생시각을 먼저 입력해주세요.");
    return;
  }
  _revealInFlight = true;

  const resultArea = _$('saju-result-area');
  const runLoading  = _$('sajuRunLoading');
  const introCard   = _$('sajuInputCard');
  if (resultArea) resultArea.style.display = 'none';
  if (runLoading) runLoading.style.display = 'block';
  if (introCard)  introCard.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });

  let succeeded = false;
  try {
    // SajuEngine 로드 확인 후 분석 탭 렌더링 (personalityCard/resourcePanel/godsPanel + window.SajuResult.geok 등)
    await new Promise(resolve => {
      function attemptOnce(n) {
        if (window.SajuEngine?.buildState && window.SajuUI?.renderFullAnalysis) {
          window.SajuUI.renderFullAnalysis("overall");
          resolve();
        } else if (n < 10) {
          setTimeout(() => attemptOnce(n + 1), 150);
        } else {
          console.error("❌ SajuEngine 로드 타임아웃");
          resolve();
        }
      }
      setTimeout(() => attemptOnce(0), 50);
    });

    const aiOk = await fetchAndInjectSajuAI();
    if (!aiOk) throw new Error("사주 AI 해설 호출 실패");
    succeeded = true;

  } catch (err) {
    console.error("사주 분석 중 오류:", err);
    setAlert("사주 분석 중 오류가 발생했습니다. 입력값을 확인하고 다시 시도해주세요.");
  } finally {
    _revealInFlight = false;
    if (runLoading) runLoading.style.display = 'none';
    if (introCard)  introCard.querySelectorAll('button').forEach(b => { b.disabled = false; b.style.opacity = '1'; });
    if (succeeded) {
      if (resultArea) resultArea.style.display = 'block';
      if (introCard)  introCard.style.display = 'none';
    }
  }
}

/* =========================================================
   연애운 — "✨ 연애운 보기" 버튼 클릭 전용
   window.AstroResult(나탈+트랜짓+프로그레션, 이미 백그라운드에서
   계산되어 있음)에서 연애 관련 포인트만 골라 AI에 전달
   ========================================================= */
let _loveRevealInFlight = false;
let _loveRelationshipStatus = 'solo'; // 'solo' | 'taken' — 연애운 timing 섹션 해석 관점 분기용 (계산 로직은 동일, 문구만 달라짐)
function _setLoveRelationshipStatus(status) {
  _loveRelationshipStatus = status;
  const soloBtn = _$('loveStatusSolo'), takenBtn = _$('loveStatusTaken');
  if (soloBtn)  soloBtn.classList.toggle('active', status === 'solo');
  if (takenBtn) takenBtn.classList.toggle('active', status === 'taken');
}

const _LOVE_PLANET_KR = {
  sun:'태양', moon:'달', mercury:'수성', venus:'금성', mars:'화성',
  jupiter:'목성', saturn:'토성', uranus:'천왕성', neptune:'해왕성', pluto:'명왕성'
};
const _SIGN_RULER = {
  '양자리':'mars', '황소자리':'venus', '쌍둥이자리':'mercury', '게자리':'moon',
  '사자자리':'sun', '처녀자리':'mercury', '천칭자리':'venus', '전갈자리':'pluto',
  '사수자리':'jupiter', '염소자리':'saturn', '물병자리':'uranus', '물고기자리':'neptune'
};

function _findHouseOccupants(astroData, houseNum) {
  return Object.keys(_LOVE_PLANET_KR)
    .filter(k => astroData.natal[k]?.house === houseNum)
    .map(k => _LOVE_PLANET_KR[k]);
}

function _findAspectBetween(aspectsFull, labelA, labelB) {
  if (!aspectsFull) return null;
  return aspectsFull.find(a => (a.point1 === labelA && a.point2 === labelB) || (a.point1 === labelB && a.point2 === labelA)) || null;
}

// 연애운/재회운 보강 — 차트 지배행성, 5하우스 지배행성, 8하우스, 프로그레션 금성,
// 북노드, 목성-금성 어스펙트 (직업 탭 보강과 동일한 기준으로 추가)
function _buildLoveEnhancedFields(astroData) {
  const ascRulerKey = _SIGN_RULER[astroData.angles.asc.sign];
  const ascRuler = ascRulerKey ? { key: ascRulerKey, label: _LOVE_PLANET_KR[ascRulerKey], ...astroData.natal[ascRulerKey] } : null;

  const house5RulerKey = _SIGN_RULER[astroData.houses?.[4]?.sign];
  const house5Ruler = house5RulerKey ? { key: house5RulerKey, label: _LOVE_PLANET_KR[house5RulerKey], ...astroData.natal[house5RulerKey] } : null;

  const house8 = _findHouseOccupants(astroData, 8);

  return {
    ascSign: astroData.angles.asc.sign,
    ascRuler,
    house5Ruler,
    house8Sign: astroData.houses?.[7]?.sign,
    house8Occupants: house8,
    progVenusSign:  astroData.progression?.planets?.venus?.sign,
    progVenusHouse: astroData.progression?.planets?.venus?.house,
    northNodeSign:  astroData.nodes?.north?.sign,
    northNodeHouse: astroData.nodes?.north?.house,
    jupiterVenusAspect: _findAspectBetween(astroData.natalAspectsFull, '목성', '금성'),
  };
}

async function revealLoveFortune() {
  if (_loveRevealInFlight) return;
  if (!window.AstroResult) {
    alert("생년월일과 출생시각을 먼저 입력해주세요. (정통 사주 또는 점성술 탭에서 한 번 계산되면 자동으로 준비됩니다)");
    return;
  }
  _loveRevealInFlight = true;

  const introCard  = _$('loveFortuneInputCard');
  const loading    = _$('loveFortuneLoading');
  const resultArea = _$('loveFortuneResultArea');
  _setInlineAlert('loveFortuneAlert', '');
  if (resultArea) resultArea.style.display = 'none';
  if (loading)    loading.style.display = 'block';
  if (introCard)  introCard.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });

  let succeeded = false;
  try {
    const astroData  = window.AstroResult;
    const house5      = _findHouseOccupants(astroData, 5);
    const house7      = _findHouseOccupants(astroData, 7);
    const nowMonthIdx = new Date().getMonth(); // 0~11, transits 배열은 1월부터 순서대로
    const transitNow  = astroData.transits?.[nowMonthIdx] || null;

    // 결혼/지속적 관계 신호 — 7하우스 지배행성 + 토성 다이내믹 (기존 natalAspectsFull 재사용, 새 계산 없음)
    const house7RulerKey = _SIGN_RULER[astroData.houses?.[6]?.sign];
    const house7Ruler = house7RulerKey ? {
      key: house7RulerKey, label: _LOVE_PLANET_KR[house7RulerKey],
      ...astroData.natal[house7RulerKey]
    } : null;
    const satVenusAspect = _findAspectBetween(astroData.natalAspectsFull, '토성', '금성');
    const satRulerAspect = (house7Ruler && house7RulerKey !== 'saturn')
      ? _findAspectBetween(astroData.natalAspectsFull, '토성', house7Ruler.label)
      : null;
    const eclipseSignal = await _getEclipseLoveSignal(astroData);

    const payload = {
      type:   'love',
      name:   window.SajuResult?.name || '',
      gender: window.SajuResult?.gender || 'M',
      venus:  astroData.natal.venus,
      mars:   astroData.natal.mars,
      moon:   astroData.natal.moon,
      saturn: astroData.natal.saturn,
      house5Sign: astroData.houses?.[4]?.sign,
      house7Sign: astroData.houses?.[6]?.sign,
      house5Occupants: house5,
      house7Occupants: house7,
      house7Ruler,
      satVenusAspect,
      satRulerAspect,
      transitNow,
      progMoonHouse: astroData.progression?.planets?.moon?.house,
      progMoonSign:  astroData.progression?.planets?.moon?.sign,
      ..._buildLoveEnhancedFields(astroData),
      eclipseSignal,
      isInRelationship: _loveRelationshipStatus === 'taken',
    };

    const res = await fetch("/api/gemini-love", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "서버 오류가 발생했습니다.");

    if (resultArea) resultArea.innerHTML = _renderLoveFortuneHtml(payload, data.result || '', data.venusRetrograde);
    succeeded = true;

  } catch (err) {
    console.error("연애운 분석 중 오류:", err);
    _setInlineAlert('loveFortuneAlert', err.message || "연애운 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  } finally {
    _loveRevealInFlight = false;
    if (loading)   loading.style.display = 'none';
    if (introCard) introCard.querySelectorAll('button').forEach(b => { b.disabled = false; b.style.opacity = '1'; });
    if (succeeded) {
      if (resultArea) resultArea.style.display = 'block';
      if (introCard)  introCard.style.display = 'none';
    }
  }
}

function _renderLoveFortuneHtml(payload, raw, venusRetrograde) {
  const markerRe = /===SECTION:(\w+)===/g;
  const hits = [];
  let m;
  while ((m = markerRe.exec(raw)) !== null) {
    hits.push({ key: m[1], contentStart: m.index + m[0].length, markerStart: m.index });
  }
  const sections = {};
  hits.forEach((hit, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].markerStart : raw.length;
    sections[hit.key] = raw.slice(hit.contentStart, end).trim();
  });

  function toParas(text) {
    if (!text) return '<p style="margin:0;color:#9b8f74;">해설을 불러오지 못했습니다.</p>';
    return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p =>
      `<p style="margin:0 0 12px;">${p.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f4ecd8;">$1</strong>').replace(/\n/g, '<br>')}</p>`
    ).join('');
  }

  const panelStyle = `border-radius:20px;background:radial-gradient(120% 50% at 50% -6%, #1a1540 0%, #0e0b24 55%, #08060f 100%);
    border:1px solid rgba(200,168,96,.2);box-shadow:0 24px 60px -30px rgba(0,0,0,.92);padding:20px 18px 16px;margin-bottom:6px;`;
  const eyebrowStyle = `font-size:11px;letter-spacing:.26em;color:#9f93c0;margin-bottom:10px;`;
  const titleStyle = `font-size:18px;font-weight:700;margin-bottom:14px;
    background:linear-gradient(100deg,#f6e9c1 0%,#e0c684 45%,#caa74e 100%);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;`;
  const aiEyebrowStyle = `font-size:10.5px;letter-spacing:.18em;color:#9b8f74;margin:0 0 8px 0;`;
  const aiTextStyle = `font-size:13px;color:#beb39a;line-height:1.85;font-weight:300;`;

  return `
    <div style="${panelStyle}">
      <div style="${eyebrowStyle}">命 盤</div>
      <div style="${titleStyle}">타고난 연애 기질</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#e8b9ad;border:1px solid rgba(221,155,136,.4);background:rgba(221,155,136,.1);">금성 · ${payload.venus.sign} ${payload.venus.house}하우스</span>
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#e8b9ad;border:1px solid rgba(221,155,136,.4);background:rgba(221,155,136,.1);">화성 · ${payload.mars.sign} ${payload.mars.house}하우스</span>
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bdeede;border:1px solid rgba(120,210,180,.4);background:rgba(60,180,140,.1);">달 · ${payload.moon.sign} ${payload.moon.house}하우스</span>
      </div>
      <div style="margin-top:10px;font-size:12px;color:#8d8268;">
        5하우스(${payload.house5Sign}) ${payload.house5Occupants.length ? '· ' + payload.house5Occupants.join(', ') : ''} ·
        7하우스(${payload.house7Sign}) ${payload.house7Occupants.length ? '· ' + payload.house7Occupants.join(', ') : ''} ·
        8하우스(${payload.house8Sign || '?'}) ${payload.house8Occupants?.length ? '· ' + payload.house8Occupants.join(', ') : ''}
      </div>
      ${payload.ascRuler || payload.jupiterVenusAspect ? `
      <div style="margin-top:6px;font-size:12px;color:#8d8268;">
        ${payload.ascRuler ? `차트 지배행성 · ${payload.ascRuler.label} ${payload.ascRuler.sign}` : ''}
        ${payload.jupiterVenusAspect ? ` · 목성-금성 ${payload.jupiterVenusAspect.aspect} (행운의 사랑 지표)` : ''}
      </div>` : ''}
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${aiEyebrowStyle}">— 기질 해설</div>
      <div style="${aiTextStyle}">${toParas(sections.nature)}</div>
    </div>

    <div style="${panelStyle}">
      <div style="${eyebrowStyle}">結 婚</div>
      <div style="${titleStyle}">결혼·지속적 관계</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bcd9ee;border:1px solid rgba(120,180,210,.4);background:rgba(60,140,180,.1);">토성 · ${payload.saturn.sign} ${payload.saturn.house}하우스</span>
        ${payload.house7Ruler ? `<span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bcd9ee;border:1px solid rgba(120,180,210,.4);background:rgba(60,140,180,.1);">7하우스 지배행성 · ${payload.house7Ruler.label} ${payload.house7Ruler.sign} ${payload.house7Ruler.house}하우스</span>` : ''}
        ${payload.northNodeSign ? `<span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bcd9ee;border:1px solid rgba(120,180,210,.4);background:rgba(60,140,180,.1);">북노드 · ${payload.northNodeSign} ${payload.northNodeHouse}하우스</span>` : ''}
      </div>
      <div style="margin-top:10px;font-size:12px;color:#8d8268;">
        ${payload.satVenusAspect ? `토성-금성 ${payload.satVenusAspect.aspect}` : '토성-금성 어스펙트 없음'}
        ${payload.satRulerAspect ? ` · 토성-7하우스지배행성 ${payload.satRulerAspect.aspect}` : ''}
      </div>
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${aiEyebrowStyle}">— 결혼운 해설</div>
      <div style="${aiTextStyle}">${toParas(sections.marriage)}</div>
    </div>

    <div style="${panelStyle}">
      <div style="${eyebrowStyle}">今 年</div>
      <div style="${titleStyle}">올해의 연애 흐름</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${payload.transitNow ? `
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#e8b9ad;border:1px solid rgba(221,155,136,.4);background:rgba(221,155,136,.1);">트랜짓 금성 · ${payload.transitNow.planets.venus.sign}</span>
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#e8b9ad;border:1px solid rgba(221,155,136,.4);background:rgba(221,155,136,.1);">트랜짓 화성 · ${payload.transitNow.planets.mars.sign}</span>
        ` : ''}
        ${payload.progMoonSign ? `<span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bdeede;border:1px solid rgba(120,210,180,.4);background:rgba(60,180,140,.1);">프로그레션 달 · ${payload.progMoonSign} ${payload.progMoonHouse}하우스</span>` : ''}
        ${payload.progVenusSign ? `<span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bdeede;border:1px solid rgba(120,210,180,.4);background:rgba(60,180,140,.1);">프로그레션 금성 · ${payload.progVenusSign} ${payload.progVenusHouse}하우스</span>` : ''}
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;${venusRetrograde ? 'color:#f6c177;border:1px solid rgba(246,193,119,.5);background:rgba(246,193,119,.12);' : 'color:#8d8268;border:1px solid rgba(200,168,96,.18);background:transparent;'}">금성 ${venusRetrograde ? '역행 중' : '순행 중'}</span>
        ${payload.eclipseSignal ? `<span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#f6c177;border:1px solid rgba(246,193,119,.5);background:rgba(246,193,119,.12);">${payload.eclipseSignal.type} · ${payload.eclipseSignal.conjunctPoint} 근접</span>` : ''}
      </div>
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${aiEyebrowStyle}">— 올해 흐름 해설</div>
      <div style="${aiTextStyle}">${toParas(sections.timing)}</div>
    </div>
  `;
}

/* =========================================================
   재회운 — "✨ 재회운 보기" 버튼 클릭 전용
   연애운과 같은 window.AstroResult 재사용 + 금성 역행 여부(서버에서
   계산)만 추가로 받아 타이밍 신호 위주로 AI에 전달
   ========================================================= */
let _reunionRevealInFlight = false;

async function revealReunionFortune() {
  if (_reunionRevealInFlight) return;
  if (!window.AstroResult) {
    alert("생년월일과 출생시각을 먼저 입력해주세요. (정통 사주 또는 점성술 탭에서 한 번 계산되면 자동으로 준비됩니다)");
    return;
  }
  _reunionRevealInFlight = true;

  const introCard  = _$('reunionFortuneInputCard');
  const loading    = _$('reunionFortuneLoading');
  const resultArea = _$('reunionFortuneResultArea');
  _setInlineAlert('reunionFortuneAlert', '');
  if (resultArea) resultArea.style.display = 'none';
  if (loading)    loading.style.display = 'block';
  if (introCard)  introCard.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });

  let succeeded = false;
  try {
    const astroData  = window.AstroResult;
    const house7      = _findHouseOccupants(astroData, 7);
    const nowMonthIdx = new Date().getMonth();
    const transitNow  = astroData.transits?.[nowMonthIdx] || null;

    const house7RulerKey = _SIGN_RULER[astroData.houses?.[6]?.sign];
    const house7Ruler = house7RulerKey ? {
      key: house7RulerKey, label: _LOVE_PLANET_KR[house7RulerKey],
      ...astroData.natal[house7RulerKey]
    } : null;
    const satVenusAspect = _findAspectBetween(astroData.natalAspectsFull, '토성', '금성');
    const satRulerAspect = (house7Ruler && house7RulerKey !== 'saturn')
      ? _findAspectBetween(astroData.natalAspectsFull, '토성', house7Ruler.label)
      : null;
    const eclipseSignal = await _getEclipseLoveSignal(astroData);

    const payload = {
      type:   'reunion',
      name:   window.SajuResult?.name || '',
      gender: window.SajuResult?.gender || 'M',
      venus:  astroData.natal.venus,
      mars:   astroData.natal.mars,
      moon:   astroData.natal.moon,
      saturn: astroData.natal.saturn,
      house7Sign: astroData.houses?.[6]?.sign,
      house7Occupants: house7,
      house7Ruler,
      satVenusAspect,
      satRulerAspect,
      transitNow,
      progMoonHouse: astroData.progression?.planets?.moon?.house,
      progMoonSign:  astroData.progression?.planets?.moon?.sign,
      ..._buildLoveEnhancedFields(astroData),
      eclipseSignal,
    };

    const res = await fetch("/api/gemini-love", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "서버 오류가 발생했습니다.");

    if (resultArea) resultArea.innerHTML = _renderReunionFortuneHtml(payload, data.result || '', data.venusRetrograde);
    succeeded = true;

  } catch (err) {
    console.error("재회운 분석 중 오류:", err);
    _setInlineAlert('reunionFortuneAlert', err.message || "재회운 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  } finally {
    _reunionRevealInFlight = false;
    if (loading)   loading.style.display = 'none';
    if (introCard) introCard.querySelectorAll('button').forEach(b => { b.disabled = false; b.style.opacity = '1'; });
    if (succeeded) {
      if (resultArea) resultArea.style.display = 'block';
      if (introCard)  introCard.style.display = 'none';
    }
  }
}

function _renderReunionFortuneHtml(payload, raw, venusRetrograde) {
  const markerRe = /===SECTION:(\w+)===/g;
  const hits = [];
  let m;
  while ((m = markerRe.exec(raw)) !== null) {
    hits.push({ key: m[1], contentStart: m.index + m[0].length, markerStart: m.index });
  }
  const sections = {};
  hits.forEach((hit, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].markerStart : raw.length;
    sections[hit.key] = raw.slice(hit.contentStart, end).trim();
  });

  function toParas(text) {
    if (!text) return '<p style="margin:0;color:#9b8f74;">해설을 불러오지 못했습니다.</p>';
    return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p =>
      `<p style="margin:0 0 12px;">${p.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f4ecd8;">$1</strong>').replace(/\n/g, '<br>')}</p>`
    ).join('');
  }

  const panelStyle = `border-radius:20px;background:radial-gradient(120% 50% at 50% -6%, #1a1540 0%, #0e0b24 55%, #08060f 100%);
    border:1px solid rgba(200,168,96,.2);box-shadow:0 24px 60px -30px rgba(0,0,0,.92);padding:20px 18px 16px;margin-bottom:6px;`;
  const eyebrowStyle = `font-size:11px;letter-spacing:.26em;color:#9f93c0;margin-bottom:10px;`;
  const titleStyle = `font-size:18px;font-weight:700;margin-bottom:14px;
    background:linear-gradient(100deg,#f6e9c1 0%,#e0c684 45%,#caa74e 100%);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;`;
  const aiEyebrowStyle = `font-size:10.5px;letter-spacing:.18em;color:#9b8f74;margin:0 0 8px 0;`;
  const aiTextStyle = `font-size:13px;color:#beb39a;line-height:1.85;font-weight:300;`;

  const transitSaturnHouse = payload.transitNow?.planets?.saturn?.house;
  const saturnIn78 = transitSaturnHouse === 7 || transitSaturnHouse === 8;

  return `
    <div style="${panelStyle}">
      <div style="${eyebrowStyle}">緣 分</div>
      <div style="${titleStyle}">재회와 관련된 나의 패턴</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#e8b9ad;border:1px solid rgba(221,155,136,.4);background:rgba(221,155,136,.1);">금성 · ${payload.venus.sign} ${payload.venus.house}하우스</span>
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bcd9ee;border:1px solid rgba(120,180,210,.4);background:rgba(60,140,180,.1);">토성 · ${payload.saturn.sign} ${payload.saturn.house}하우스</span>
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bdeede;border:1px solid rgba(120,210,180,.4);background:rgba(60,180,140,.1);">달 · ${payload.moon.sign} ${payload.moon.house}하우스</span>
      </div>
      <div style="margin-top:10px;font-size:12px;color:#8d8268;">
        7하우스(${payload.house7Sign}) ${payload.house7Occupants.length ? '· ' + payload.house7Occupants.join(', ') : ''} ·
        8하우스(${payload.house8Sign || '?'}) ${payload.house8Occupants?.length ? '· ' + payload.house8Occupants.join(', ') : ''}
      </div>
      ${payload.northNodeSign ? `
      <div style="margin-top:6px;font-size:12px;color:#8d8268;">
        북노드 · ${payload.northNodeSign} ${payload.northNodeHouse}하우스 (운명적·카르마적 재회 지표)
      </div>` : ''}
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${aiEyebrowStyle}">— 패턴 해설</div>
      <div style="${aiTextStyle}">${toParas(sections.pattern)}</div>
    </div>

    <div style="${panelStyle}">
      <div style="${eyebrowStyle}">時 期</div>
      <div style="${titleStyle}">지금의 재회 타이밍</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;${venusRetrograde ? 'color:#f6c177;border:1px solid rgba(246,193,119,.5);background:rgba(246,193,119,.12);' : 'color:#8d8268;border:1px solid rgba(200,168,96,.18);background:transparent;'}">금성 ${venusRetrograde ? '역행 중' : '순행 중'}</span>
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;${saturnIn78 ? 'color:#f6c177;border:1px solid rgba(246,193,119,.5);background:rgba(246,193,119,.12);' : 'color:#8d8268;border:1px solid rgba(200,168,96,.18);background:transparent;'}">트랜짓 토성 · ${payload.transitNow?.planets?.saturn?.sign || ''} ${transitSaturnHouse ? transitSaturnHouse + '하우스' : ''}</span>
        ${payload.progMoonSign ? `<span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bdeede;border:1px solid rgba(120,210,180,.4);background:rgba(60,180,140,.1);">프로그레션 달 · ${payload.progMoonSign} ${payload.progMoonHouse}하우스</span>` : ''}
        ${payload.progVenusSign ? `<span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bdeede;border:1px solid rgba(120,210,180,.4);background:rgba(60,180,140,.1);">프로그레션 금성 · ${payload.progVenusSign} ${payload.progVenusHouse}하우스</span>` : ''}
        ${payload.eclipseSignal ? `<span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#f6c177;border:1px solid rgba(246,193,119,.5);background:rgba(246,193,119,.12);">${payload.eclipseSignal.type} · ${payload.eclipseSignal.conjunctPoint} 근접</span>` : ''}
      </div>
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${aiEyebrowStyle}">— 타이밍 해설</div>
      <div style="${aiTextStyle}">${toParas(sections.timing)}</div>
    </div>
  `;
}

/* =========================================================
   궁합 — 상대방 정보 입력 + "✨ 궁합 보기" 버튼 클릭 전용
   ========================================================= */
function setPartnerCalType(type) {
  const hidden = _$("partnerCalendarType");
  if (hidden) hidden.value = type;

  const activeStyle   = "background:linear-gradient(135deg,#c8a860,#e0c684);color:#1a1530;font-weight:700;";
  const inactiveStyle = "background:transparent;color:#9b8f74;font-weight:600;";
  const baseStyle     = "padding:13px 14px;font-size:13px;border:none;cursor:pointer;font-family:inherit;";

  const solarBtn = _$("partnerCalSolarBtn");
  const lunarBtn = _$("partnerCalLunarBtn");
  if (solarBtn) solarBtn.style.cssText = baseStyle + (type === "solar" ? activeStyle : inactiveStyle);
  if (lunarBtn) lunarBtn.style.cssText = baseStyle + (type === "lunar" ? activeStyle : inactiveStyle);

  const leapRow = _$("partnerLeapMonthRow");
  if (leapRow) leapRow.style.display = type === "lunar" ? "flex" : "none";
  if (type === "solar") {
    const cb = _$("partnerIsLeapMonth");
    if (cb) cb.checked = false;
  }
}

function togglePartnerTimeUnknown() {
  const cb        = _$("partnerTimeUnknown");
  const timeInput = _$("partnerBirthTime");
  if (!cb || !timeInput) return;
  timeInput.disabled = cb.checked;
  if (cb.checked) timeInput.value = "";
}

function filterPartnerCityList(val) {
  const dropdown = _$('partnerCityDropdown');
  if (!dropdown) return;
  const q = val.trim().toLowerCase();
  const matched = Object.keys(CITY_COORDS).filter(c => c.toLowerCase().includes(q)).slice(0, 30);
  if (matched.length === 0 || q === '') { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = matched.map(c =>
    '<div onclick="selectPartnerCity(\'' + c + '\')" style="padding:8px 12px;font-size:13px;color:#e2e8f0;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);" onmouseover="this.style.background=\'rgba(255,255,255,.08)\'" onmouseout="this.style.background=\'\'">' + c + '</div>'
  ).join('');
  dropdown.style.display = 'block';
}
function showPartnerCityList() {
  const input = _$('partnerCityInput');
  if (input) filterPartnerCityList(input.value);
}
function hidePartnerCityList() {
  const d = _$('partnerCityDropdown');
  if (d) d.style.display = 'none';
}
function selectPartnerCity(cityName) {
  const input  = _$('partnerCityInput');
  const hidden = _$('partnerCity');
  if (input)  input.value  = cityName;
  if (hidden) hidden.value = cityName;
  hidePartnerCityList();
}

// 궁합/재회운 화면 진입 시, 활성 프로필을 제외한 저장된 프로필 목록으로 "상대방 불러오기" 드롭다운을 채운다.
function _populatePartnerProfileSelect() {
  const select = _$('partnerProfileSelect');
  if (!select) return;
  const activeId = getActiveProfileId();
  const others = getProfiles().filter(p => p.id !== activeId);
  select.innerHTML = '<option value="">직접 입력</option>' + others.map(p => {
    const parts   = (p.birthDate || '').split('-');
    const dateStr = parts.length === 3 ? `${parts[0]}.${Number(parts[1])}.${Number(parts[2])}` : '';
    return `<option value="${p.id}">${p.name || '이름 없음'}${dateStr ? ' (' + dateStr + ')' : ''}</option>`;
  }).join('');
}

// 드롭다운에서 저장된 프로필을 선택하면 상대방 입력 필드를 자동으로 채운다.
function loadPartnerFromProfile(id) {
  if (!id) return;
  const p = getProfiles().find(x => x.id === id);
  if (!p) return;

  if (_$('partnerName')) _$('partnerName').value = p.name || '';
  setPartnerCalType(p.calendarType || 'solar');
  if (_$('partnerBirthDate'))   _$('partnerBirthDate').value   = p.birthDate || '';
  if (_$('partnerIsLeapMonth')) _$('partnerIsLeapMonth').checked = !!p.isLeapMonth;
  if (_$('partnerBirthTime'))   _$('partnerBirthTime').value   = p.timeUnknown ? '' : (p.birthTime || '');
  if (_$('partnerTimeUnknown')) _$('partnerTimeUnknown').checked = !!p.timeUnknown;
  togglePartnerTimeUnknown();
  if (_$('partnerGender')) _$('partnerGender').value = p.gender || 'M';
  if (_$('partnerCityInput')) _$('partnerCityInput').value = p.birthPlace || '';
  if (_$('partnerCity'))      _$('partnerCity').value      = p.birthPlace || '';
  if (_$('partnerSaveAsProfile')) _$('partnerSaveAsProfile').checked = false;
}

let _compatRevealInFlight = false;
let _compatMode = 'compatibility'; // 'compatibility' | 'reunion'

// 재회운 화면의 "알아요/몰라요" 토글
function setReunionKnowPartner(knows) {
  const activeStyle   = "background:linear-gradient(135deg,#c8a860,#e0c684);color:#1a1530;font-weight:700;";
  const inactiveStyle = "background:transparent;color:#9b8f74;font-weight:600;";
  const baseStyle     = "padding:11px 18px;font-size:13px;border:none;cursor:pointer;font-family:inherit;";

  const noBtn  = _$('reunionKnowNoBtn');
  const yesBtn = _$('reunionKnowYesBtn');
  if (noBtn)  noBtn.style.cssText  = baseStyle + (!knows ? activeStyle : inactiveStyle);
  if (yesBtn) yesBtn.style.cssText = baseStyle + (knows ? activeStyle : inactiveStyle);

  const unknownCard = _$('reunionFortuneInputCard');
  const knownCard   = _$('reunionKnowPartnerCard');
  if (unknownCard) unknownCard.style.display = knows ? 'none' : 'block';
  if (knownCard)    knownCard.style.display  = knows ? 'block' : 'none';
}

// 재회운(알 때) → 궁합 화면을 "재회운 모드"로 열기 (새 화면/폼 없이 그대로 재사용)
function goToReunionPartnerForm() {
  _compatMode = 'reunion';
  const titleEl    = _$('compatibilityScreenTitle');
  const eyebrowEl  = _$('compatibilityEyebrowLabel');
  const headlineEl = _$('compatibilityHeadline');
  const tagsEl     = _$('compatibilityTags');
  const ctaEl      = _$('compatibilityCtaLabel');
  if (titleEl)    titleEl.textContent   = '재회운';
  if (eyebrowEl)  eyebrowEl.textContent = '재회운';
  if (headlineEl) headlineEl.innerHTML  = '두 사람의 차트를 겹쳐 시너지를 보고,<br>금성 역행·토성 흐름까지 더해 재회 타이밍을 짚어드립니다.';
  if (tagsEl)     tagsEl.innerHTML      = '관계의 패턴<span class="dot">·</span>지금의 시기<span class="dot">·</span>재회 가능성';
  if (ctaEl)      ctaEl.textContent     = '✨ 재회운 보기';
  _populatePartnerProfileSelect();
  enterScreen('compatibility');
}

// 궁합 카드를 직접 탭했을 때는 항상 기본(궁합) 모드로 초기화
function enterCompatibilityFresh() {
  _compatMode = 'compatibility';
  const titleEl    = _$('compatibilityScreenTitle');
  const eyebrowEl  = _$('compatibilityEyebrowLabel');
  const headlineEl = _$('compatibilityHeadline');
  const tagsEl     = _$('compatibilityTags');
  const ctaEl      = _$('compatibilityCtaLabel');
  if (titleEl)    titleEl.textContent   = '궁합';
  if (eyebrowEl)  eyebrowEl.textContent = '궁합';
  if (headlineEl) headlineEl.innerHTML  = '두 사람의 차트를 겹쳐 끌림과 어긋남의 지점을 찾고,<br>이 관계가 어떤 결을 가지고 있는지 풀어드립니다.';
  if (tagsEl)     tagsEl.innerHTML      = '끌림과 케미<span class="dot">·</span>관계의 결<span class="dot">·</span>오래 갈 수 있는지';
  if (ctaEl)      ctaEl.textContent     = '✨ 궁합 보기';
  _populatePartnerProfileSelect();
  enterScreen('compatibility');
}

function goBackFromCompatibility() {
  if (_compatMode === 'reunion') {
    enterScreen('reunionFortune');
  } else {
    enterScreen('love');
  }
}

async function revealCompatibility() {
  if (_compatRevealInFlight) return;

  function showCompatErr(msg) {
    const el = _$("compatibilityAlert");
    if (el) { el.textContent = msg; el.classList.remove("hidden"); }
  }
  const alertEl = _$("compatibilityAlert");
  if (alertEl) alertEl.classList.add("hidden");

  if (!window.AstroResult?.meta) {
    showCompatErr("내 정보가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  const partnerName        = (_$("partnerName")?.value || "").trim();
  const partnerCalType     = _$("partnerCalendarType")?.value || "solar";
  const partnerRawDate     = _$("partnerBirthDate")?.value || "";
  const partnerIsLeap      = !!_$("partnerIsLeapMonth")?.checked;
  const partnerTimeUnknown = !!_$("partnerTimeUnknown")?.checked;
  const partnerBirthTime   = partnerTimeUnknown ? "12:00" : (_$("partnerBirthTime")?.value || "");
  const partnerCity        = (_$("partnerCity")?.value || _$("partnerCityInput")?.value || "").trim();
  const partnerGender      = _$("partnerGender")?.value || "M";
  const saveAsProfile      = !!_$("partnerSaveAsProfile")?.checked;

  if (!partnerRawDate)                       { showCompatErr("상대방 생년월일을 입력해주세요."); return; }
  if (!partnerCity)                          { showCompatErr("상대방 출생도시를 입력해주세요."); return; }
  if (!partnerTimeUnknown && !partnerBirthTime) { showCompatErr("상대방 출생시각을 입력하거나 '출생시각 모름'을 선택해주세요."); return; }

  let partnerSolarDate = partnerRawDate;
  if (partnerCalType === "lunar") {
    const [ly, lm, ld] = partnerRawDate.split("-").map(Number);
    try {
      const solar = window.LunarCalendar.lunarToSolar(ly, lm, ld, partnerIsLeap);
      partnerSolarDate = `${solar.year}-${String(solar.month).padStart(2, "0")}-${String(solar.day).padStart(2, "0")}`;
    } catch (e) {
      showCompatErr("상대방 음력 날짜 변환 오류: " + (e.message || e));
      return;
    }
  }

  _compatRevealInFlight = true;
  const introCard  = _$('compatibilityInputCard');
  const loading    = _$('compatibilityLoading');
  const resultArea = _$('compatibilityResultArea');
  if (resultArea) resultArea.style.display = 'none';
  if (loading)    loading.style.display = 'block';
  if (introCard)  introCard.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });

  let succeeded = false;
  try {
    const { lat: pLat, lng: pLng, utcOffset: pUtcOffset } = getCityCoords(partnerCity);

    if (saveAsProfile) {
      const originalActiveId = getActiveProfileId();
      addProfile({
        name: partnerName, gender: partnerGender,
        birthDate: partnerRawDate, solarBirthDate: partnerSolarDate,
        calendarType: partnerCalType, isLeapMonth: partnerIsLeap,
        birthTime: partnerTimeUnknown ? null : partnerBirthTime, timeUnknown: partnerTimeUnknown,
        birthPlace: partnerCity
      });
      setActiveProfileId(originalActiveId); // 상대방 저장이 내 활성 프로필을 바꾸지 않도록 즉시 복원
    }

    const myMeta = window.AstroResult.meta;
    const calcRes = await fetch("/api/astro-calc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        birthDate: myMeta.birthDate, birthTime: myMeta.birthTime,
        lat: myMeta.lat, lng: myMeta.lng, utcOffset: myMeta.utcOffset,
        name: myMeta.name, gender: myMeta.gender,
        partner: {
          birthDate: partnerSolarDate, birthTime: partnerBirthTime,
          lat: pLat, lng: pLng, utcOffset: pUtcOffset,
          name: partnerName, gender: partnerGender, timeUnknown: partnerTimeUnknown
        }
      })
    });
    const calcData = await calcRes.json();
    if (!calcRes.ok || calcData.error) throw new Error(calcData.error || "궁합 계산 중 오류가 발생했습니다.");
    if (!calcData.synastry) throw new Error("궁합 데이터를 계산하지 못했습니다.");

    const synastry = calcData.synastry;
    const topAspects = (synastry.synastryAspects || []).slice(0, 10);
    const isReunionMode = _compatMode === 'reunion';

    const aiPayload = {
      type: isReunionMode ? 'reunion-known' : 'compatibility',
      myName: myMeta.name || '',
      myGender: myMeta.gender || 'M',
      partnerName: partnerName || '',
      partnerGender,
      myPlanets: {
        sun: calcData.natal.sun, moon: calcData.natal.moon,
        venus: calcData.natal.venus, mars: calcData.natal.mars
      },
      partnerPlanets: {
        sun: synastry.partnerNatal.planets.sun, moon: synastry.partnerNatal.planets.moon,
        venus: synastry.partnerNatal.planets.venus, mars: synastry.partnerNatal.planets.mars
      },
      partnerTimeUnknown: synastry.partnerNatal.meta.timeUnknown,
      topAspects,
      houseOverlay: synastry.houseOverlay,
      composite: {
        sun: synastry.composite.planets.sun, moon: synastry.composite.planets.moon,
        asc: synastry.composite.angles.asc
      }
    };

    if (isReunionMode) {
      const nowMonthIdx = new Date().getMonth();
      const myTransitNow = window.AstroResult?.transits?.[nowMonthIdx] || null;
      aiPayload.transitSaturnHouse = myTransitNow?.planets?.saturn?.house ?? null;
    }

    const aiRes = await fetch("/api/gemini-love", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aiPayload)
    });
    const aiData = await aiRes.json();
    if (!aiRes.ok || aiData.error) throw new Error(aiData.error || "서버 오류가 발생했습니다.");

    if (resultArea) resultArea.innerHTML = _renderCompatibilityHtml(aiPayload, aiData.result || '', aiData.venusRetrograde);
    succeeded = true;

  } catch (err) {
    console.error("궁합 분석 중 오류:", err);
    showCompatErr(err.message || "궁합 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  } finally {
    _compatRevealInFlight = false;
    if (loading)   loading.style.display = 'none';
    if (introCard) introCard.querySelectorAll('button').forEach(b => { b.disabled = false; b.style.opacity = '1'; });
    if (succeeded) {
      if (resultArea) resultArea.style.display = 'block';
      if (introCard)  introCard.style.display = 'none';
    }
  }
}

function _renderCompatibilityHtml(payload, raw, venusRetrograde) {
  const markerRe = /===SECTION:(\w+)===/g;
  const hits = [];
  let m;
  while ((m = markerRe.exec(raw)) !== null) {
    hits.push({ key: m[1], contentStart: m.index + m[0].length, markerStart: m.index });
  }
  const sections = {};
  hits.forEach((hit, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].markerStart : raw.length;
    sections[hit.key] = raw.slice(hit.contentStart, end).trim();
  });

  function toParas(text) {
    if (!text) return '<p style="margin:0;color:#9b8f74;">해설을 불러오지 못했습니다.</p>';
    return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p =>
      `<p style="margin:0 0 12px;">${p.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f4ecd8;">$1</strong>').replace(/\n/g, '<br>')}</p>`
    ).join('');
  }

  const panelStyle = `border-radius:20px;background:radial-gradient(120% 50% at 50% -6%, #1a1540 0%, #0e0b24 55%, #08060f 100%);
    border:1px solid rgba(200,168,96,.2);box-shadow:0 24px 60px -30px rgba(0,0,0,.92);padding:20px 18px 16px;margin-bottom:6px;`;
  const eyebrowStyle = `font-size:11px;letter-spacing:.26em;color:#9f93c0;margin-bottom:10px;`;
  const titleStyle = `font-size:18px;font-weight:700;margin-bottom:14px;
    background:linear-gradient(100deg,#f6e9c1 0%,#e0c684 45%,#caa74e 100%);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;`;
  const aiEyebrowStyle = `font-size:10.5px;letter-spacing:.18em;color:#9b8f74;margin:0 0 8px 0;`;
  const aiTextStyle = `font-size:13px;color:#beb39a;line-height:1.85;font-weight:300;`;

  const myLabel = payload.myName || '나';
  const partnerLabel = payload.partnerName || '상대방';
  const isReunion = payload.type === 'reunion-known';

  if (isReunion) {
    const saturnIn78 = payload.transitSaturnHouse === 7 || payload.transitSaturnHouse === 8;
    return `
      <div style="${panelStyle}">
        <div style="${eyebrowStyle}">緣 의 比 較</div>
        <div style="${titleStyle}">${myLabel} · ${partnerLabel}의 차트</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#e8b9ad;border:1px solid rgba(221,155,136,.4);background:rgba(221,155,136,.1);">나의 금성 · ${payload.myPlanets.venus.sign}</span>
          <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#e8b9ad;border:1px solid rgba(221,155,136,.4);background:rgba(221,155,136,.1);">상대 금성 · ${payload.partnerPlanets.venus.sign}</span>
        </div>
        <div style="font-size:12px;color:#8d8268;">
          주요 어스펙트 ${payload.topAspects.length}개 발견${payload.partnerTimeUnknown ? ' · 상대방 출생시각 미상으로 상승점·하우스 정보는 제외됨' : ''}
        </div>
      </div>
      <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
        <div style="${aiEyebrowStyle}">— 관계 패턴 해설</div>
        <div style="${aiTextStyle}">${toParas(sections.bond)}</div>
      </div>

      <div style="${panelStyle}">
        <div style="${eyebrowStyle}">時 期</div>
        <div style="${titleStyle}">지금의 재회 타이밍</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <span style="font-size:12px;padding:5px 13px;border-radius:999px;${venusRetrograde ? 'color:#f6c177;border:1px solid rgba(246,193,119,.5);background:rgba(246,193,119,.12);' : 'color:#8d8268;border:1px solid rgba(200,168,96,.18);background:transparent;'}">금성 ${venusRetrograde ? '역행 중' : '순행 중'}</span>
          <span style="font-size:12px;padding:5px 13px;border-radius:999px;${saturnIn78 ? 'color:#f6c177;border:1px solid rgba(246,193,119,.5);background:rgba(246,193,119,.12);' : 'color:#8d8268;border:1px solid rgba(200,168,96,.18);background:transparent;'}">나의 트랜짓 토성 · ${payload.transitSaturnHouse ? payload.transitSaturnHouse + '하우스' : '정보 없음'}</span>
          <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bdeede;border:1px solid rgba(120,210,180,.4);background:rgba(60,180,140,.1);">컴포지트 ASC · ${payload.composite.asc.sign}</span>
        </div>
      </div>
      <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
        <div style="${aiEyebrowStyle}">— 재회 타이밍 해설</div>
        <div style="${aiTextStyle}">${toParas(sections.timing)}</div>
      </div>
    `;
  }

  return `
    <div style="${panelStyle}">
      <div style="${eyebrowStyle}">緣 의 比 較</div>
      <div style="${titleStyle}">${myLabel} · ${partnerLabel}의 차트</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#e8b9ad;border:1px solid rgba(221,155,136,.4);background:rgba(221,155,136,.1);">나의 금성 · ${payload.myPlanets.venus.sign}</span>
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#e8b9ad;border:1px solid rgba(221,155,136,.4);background:rgba(221,155,136,.1);">상대 금성 · ${payload.partnerPlanets.venus.sign}</span>
      </div>
      <div style="font-size:12px;color:#8d8268;">
        주요 어스펙트 ${payload.topAspects.length}개 발견${payload.partnerTimeUnknown ? ' · 상대방 출생시각 미상으로 상승점·하우스 정보는 제외됨' : ''}
      </div>
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${aiEyebrowStyle}">— 끌림과 케미 해설</div>
      <div style="${aiTextStyle}">${toParas(sections.chemistry)}</div>
    </div>

    <div style="${panelStyle}">
      <div style="${eyebrowStyle}">複 合 盤</div>
      <div style="${titleStyle}">관계의 결 — 컴포지트</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bdeede;border:1px solid rgba(120,210,180,.4);background:rgba(60,180,140,.1);">컴포지트 태양 · ${payload.composite.sun.sign}</span>
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bdeede;border:1px solid rgba(120,210,180,.4);background:rgba(60,180,140,.1);">컴포지트 달 · ${payload.composite.moon.sign}</span>
        <span style="font-size:12px;padding:5px 13px;border-radius:999px;color:#bdeede;border:1px solid rgba(120,210,180,.4);background:rgba(60,180,140,.1);">컴포지트 ASC · ${payload.composite.asc.sign}</span>
      </div>
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${aiEyebrowStyle}">— 관계의 결 해설</div>
      <div style="${aiTextStyle}">${toParas(sections.dynamics)}</div>
    </div>
  `;
}

/* =========================================================
   직업 — "✨ OO운 보기" 버튼 클릭 전용
   window.AstroResult 재사용 (새 계산 없음). 천왕성/역행/목성회귀처럼
   "지금 이 순간"에 의존하는 값은 gemini-career.js가 서버에서 직접 계산.
   ========================================================= */
let _jobHuntingRevealInFlight = false;
let _promotionRevealInFlight  = false;
let _jobChangeRevealInFlight  = false;
let _startupRevealInFlight    = false;

// 일식/월식이 특정 포인트(MC·ASC·IC·DSC·태양·금성 등) 근처에 닿는 시점 — 직업/연애 공통 보너스 시그널
// (astro-extras.js의 신월만월 계산을 그대로 재사용, 새 계산 없음 / 화면당 1회만 호출되도록 이벤트 원본을 캐싱)
let _moonPhaseEventsCache = null;
async function _fetchMoonPhaseEventsCached(astroData) {
  if (_moonPhaseEventsCache !== null) return _moonPhaseEventsCache;
  try {
    const cityName = getCitySelectValue();
    const { lat, lng, utcOffset } = getCityCoords(cityName);
    const res = await fetch('/api/astro-extras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'moon-phases',
        natal: astroData.natal, angles: astroData.angles, nodes: astroData.nodes, houses: astroData.houses,
        appLat: lat, appLng: lng, appUtcOffset: utcOffset
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) { _moonPhaseEventsCache = []; return []; }
    _moonPhaseEventsCache = data.events || [];
    return _moonPhaseEventsCache;
  } catch (e) {
    console.warn('신월/만월 이벤트 조회 실패:', e.message);
    _moonPhaseEventsCache = [];
    return [];
  }
}

function _findNearestEclipseSignal(events, targetPoints) {
  const candidates = (events || [])
    .filter(ev => (ev.type === 'solarEclipse' || ev.type === 'lunarEclipse'))
    .map(ev => ({ ev, hit: (ev.conjunctions || []).find(c => targetPoints.includes(c.point)) }))
    .filter(x => x.hit);
  if (!candidates.length) return null;
  candidates.sort((a, b) => new Date(a.ev.dateLocal) - new Date(b.ev.dateLocal));
  const top = candidates[0];
  return {
    dateLocal: top.ev.dateLocal,
    type: top.ev.type === 'solarEclipse' ? '일식' : '월식',
    conjunctPoint: top.hit.point,
  };
}

// ── 직업 4종 공통 — "지금 머무는/진행 중인 구간이 몇 월부터 몇 월까지인지" 찾기 ──
// values: 12개월 치 비교 가능한 값 배열(하우스 번호, 역행 여부 등), nowIdx: 0~11(현재월 인덱스)
function _findContiguousMonthRange(values, nowIdx) {
  const cur = values[nowIdx];
  let start = nowIdx;
  while (start > 0 && values[start - 1] === cur) start--;
  let end = nowIdx;
  while (end < values.length - 1 && values[end + 1] === cur) end++;
  return { value: cur, startIdx: start, endIdx: end, knownStart: start > 0, knownEnd: end < values.length - 1 };
}

// 목성·토성처럼 느린 행성이 "지금 하우스"에 몇 월부터 머물렀고 몇 월까지 머무는지
function _houseTransitWindow(transits, planetKey, nowMonthIdx) {
  if (!Array.isArray(transits) || transits.length !== 12) return null;
  const houses = transits.map(t => t.planets?.[planetKey]?.house);
  if (houses[nowMonthIdx] == null) return null;
  const range = _findContiguousMonthRange(houses, nowMonthIdx);
  return {
    house: range.value,
    enterMonthLabel: range.knownStart ? transits[range.startIdx].month : null,
    exitMonthLabel:  range.knownEnd   ? transits[range.endIdx + 1].month : null,
    monthsInSoFar: nowMonthIdx - range.startIdx + 1,
    enterKnown: range.knownStart,
    exitKnown: range.knownEnd,
  };
}

// 화성·목성처럼 역행 구간이 있는 행성이 "지금" 역행 중이면, 그 구간이 몇 월부터 몇 월까지인지
function _retrogradeWindow(transits, planetKey, nowMonthIdx) {
  if (!Array.isArray(transits) || transits.length !== 12) return null;
  const lons = transits.map(t => t.planets?.[planetKey]?.longitude);
  if (lons.some(l => l == null)) return null;
  const flags = lons.map((lon, i) => {
    const a = i === 0 ? lons[0] : lons[i - 1];
    const b = i === 0 ? lons[1] : lons[i];
    let diff = b - a;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return diff < 0;
  });
  if (!flags[nowMonthIdx]) return null; // 지금 역행 중이 아니면 구간 정보 불필요
  const range = _findContiguousMonthRange(flags, nowMonthIdx);
  return {
    enterMonthLabel: range.knownStart ? transits[range.startIdx].month : null,
    exitMonthLabel:  range.knownEnd   ? transits[range.endIdx + 1].month : null,
  };
}

async function _getEclipseCareerSignal(astroData) {
  const events = await _fetchMoonPhaseEventsCached(astroData);
  return _findNearestEclipseSignal(events, ['MC', 'IC', 'ASC', 'DSC', '태양']);
}

async function _getEclipseLoveSignal(astroData) {
  const events = await _fetchMoonPhaseEventsCached(astroData);
  return _findNearestEclipseSignal(events, ['DSC', '금성', '태양']);
}

function _buildCareerCommonFields(astroData) {
  const ascRulerKey = _SIGN_RULER[astroData.angles.asc.sign];
  const mcRulerKey  = _SIGN_RULER[astroData.angles.mc.sign];
  const ascRuler = ascRulerKey ? { key: ascRulerKey, label: _LOVE_PLANET_KR[ascRulerKey], ...astroData.natal[ascRulerKey] } : null;
  const mcRuler  = mcRulerKey  ? { key: mcRulerKey,  label: _LOVE_PLANET_KR[mcRulerKey],  ...astroData.natal[mcRulerKey]  } : null;

  const nowMonthIdx = new Date().getMonth();
  const transitNow  = astroData.transits?.[nowMonthIdx] || null;
  const jupiterTransitWindow = _houseTransitWindow(astroData.transits, 'jupiter', nowMonthIdx);
  const saturnTransitWindow  = _houseTransitWindow(astroData.transits, 'saturn', nowMonthIdx);

  return {
    name:   window.SajuResult?.name || '',
    gender: window.SajuResult?.gender || 'M',
    ascSign: astroData.angles.asc.sign,
    ascRuler,
    mcSign:  astroData.angles.mc.sign,
    mcRuler,
    progMcSign: astroData.progression?.angles?.mc?.sign,
    houses: astroData.houses,
    jupiterTransitWindow,
    saturnTransitWindow,
    jupiter: astroData.natal.jupiter,
    transitNow,
    transits: astroData.transits,
    mcLon:  astroData.angles.mc.longitude,
    ascLon: astroData.angles.asc.longitude,
  };
}

async function _revealCareerScreen({ inFlightFlagName, idPrefix, type, buildExtraFields, renderFn, errorLabel }) {
  if (window[inFlightFlagName]) return;
  if (!window.AstroResult) {
    alert("생년월일과 출생시각을 먼저 입력해주세요. (정통 사주 또는 점성술 탭에서 한 번 계산되면 자동으로 준비됩니다)");
    return;
  }
  window[inFlightFlagName] = true;

  const introCard  = _$(idPrefix + 'InputCard');
  const loading    = _$(idPrefix + 'Loading');
  const resultArea = _$(idPrefix + 'ResultArea');
  _setInlineAlert(idPrefix + 'Alert', '');
  if (resultArea) resultArea.style.display = 'none';
  if (loading)    loading.style.display = 'block';
  if (introCard)  introCard.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });

  let succeeded = false;
  try {
    const astroData = window.AstroResult;
    const eclipseSignal = await _getEclipseCareerSignal(astroData);

    const payload = {
      type,
      ..._buildCareerCommonFields(astroData),
      eclipseSignal,
      ...buildExtraFields(astroData),
    };

    const res = await fetch("/api/gemini-career", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "서버 오류가 발생했습니다.");

    payload.monthlyStrength = data.monthlyStrength || null;
    payload.conclusion = data.conclusion || null;
    if (resultArea) resultArea.innerHTML = renderFn(payload, data.result || '');
    succeeded = true;

  } catch (err) {
    console.error(errorLabel + " 분석 중 오류:", err);
    _setInlineAlert(idPrefix + 'Alert', err.message || (errorLabel + " 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."));
  } finally {
    window[inFlightFlagName] = false;
    if (loading)   loading.style.display = 'none';
    if (introCard) introCard.querySelectorAll('button').forEach(b => { b.disabled = false; b.style.opacity = '1'; });
    if (succeeded) {
      if (resultArea) resultArea.style.display = 'block';
      if (introCard)  introCard.style.display = 'none';
    }
  }
}

function _careerPanelHtml(raw, sections) {
  const markerRe = /===SECTION:(\w+)===/g;
  const hits = [];
  let m;
  while ((m = markerRe.exec(raw)) !== null) {
    hits.push({ key: m[1], contentStart: m.index + m[0].length, markerStart: m.index });
  }
  hits.forEach((hit, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].markerStart : raw.length;
    sections[hit.key] = raw.slice(hit.contentStart, end).trim();
  });
  // AI가 마커 형식을 안 지켜서 마커가 하나도 안 잡힌 경우 — "해설을 불러오지 못했습니다"로 빈 화면을 보여주는
  // 대신, AI가 실제로 쓴 원문 전체를 그대로 보여준다(구조는 깨졌어도 내용은 사라지지 않게).
  if (hits.length === 0 && raw && raw.trim()) {
    console.warn('직업 AI 응답에서 섹션 마커를 찾지 못함 — 원문 그대로 표시:', raw.slice(0, 200));
    sections.nature = raw.trim();
    sections.timing = raw.trim();
  }
}

function _careerToParas(text) {
  if (!text) return '<p style="margin:0;color:#9b8f74;">해설을 불러오지 못했습니다.</p>';
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p =>
    `<p style="margin:0 0 12px;">${p.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f4ecd8;">$1</strong>').replace(/\n/g, '<br>')}</p>`
  ).join('');
}

const _CAREER_PANEL_STYLE = `border-radius:20px;background:radial-gradient(120% 50% at 50% -6%, #1a1540 0%, #0e0b24 55%, #08060f 100%);
  border:1px solid rgba(200,168,96,.2);box-shadow:0 24px 60px -30px rgba(0,0,0,.92);padding:20px 18px 16px;margin-bottom:6px;`;
const _CAREER_EYEBROW_STYLE = `font-size:11px;letter-spacing:.26em;color:#9f93c0;margin-bottom:10px;`;
const _CAREER_TITLE_STYLE = `font-size:18px;font-weight:700;margin-bottom:14px;
  background:linear-gradient(100deg,#f6e9c1 0%,#e0c684 45%,#caa74e 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;`;
const _CAREER_AI_EYEBROW_STYLE = `font-size:10.5px;font-weight:700;letter-spacing:.18em;color:#9b8f74;margin:0 0 8px 0;`;
const _CAREER_AI_TEXT_STYLE = `font-size:13px;color:#beb39a;line-height:1.85;font-weight:300;`;

// 직업 4종 — "타이밍 강도(강함/보통/약함)" → 달 모양 배지
const _STRENGTH_MOON = {
  '강함': { icon: '🌕', label: '만월 · 적극 추진기' },
  '보통': { icon: '🌓', label: '반달 · 균형 모색기' },
  '약함': { icon: '🌒', label: '초승달 · 내실 다지기' },
};
function _strengthBadgeHtml(strength) {
  const m = _STRENGTH_MOON[(strength || '').trim()];
  if (!m) return '';
  const nowMonth = new Date().getMonth() + 1;
  return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.07);">
      <div style="flex-shrink:0;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(200,168,96,.06);border:1px solid rgba(200,168,96,.25);">
        <div style="font-size:27px;line-height:1;filter:drop-shadow(0 0 10px rgba(232,196,120,.55));animation:moon-float 3.2s ease-in-out infinite;">${m.icon}</div>
      </div>
      <div style="display:inline-block;font-size:12.5px;font-weight:700;color:#f6e9c1;background:linear-gradient(90deg,rgba(200,168,96,.22),rgba(200,168,96,.05));border:1px solid rgba(200,168,96,.4);padding:4px 12px;border-radius:999px;">${nowMonth}월 · ${m.label}</div>
    </div>
  `;
}

// 직업 4종 — "올해의 흐름" 12개월 막대 타임라인.
// 막대 높이는 서버가 계산한 실제 강도 점수(monthlyStrength.scores)를 그 사람의 12개월 안에서
// 상대적으로(min~max) 정규화한 값이다 — 숫자·퍼센트는 절대 텍스트로 노출하지 않는다(법적 리스크 회피).
function _strengthTimelineHtml(monthlyStrength) {
  if (!monthlyStrength || !Array.isArray(monthlyStrength.scores) || monthlyStrength.scores.length !== 12) return '';
  const { scores, bestIndices } = monthlyStrength;
  const min = Math.min(...scores), max = Math.max(...scores);
  const hasRange = min !== max; // 막대 높이에 차이를 줄지 (점수가 1점이라도 다르면 true)
  const hasBest = (bestIndices || []).length > 0; // 그중 진짜 "골든타임"이라 부를 만한 양(+)의 달이 있는지
  const bestSet = new Set(hasBest ? bestIndices : []);
  const heightOf = (s) => hasRange ? Math.round(((s - min) / (max - min)) * 70 + 20) : 55;

  const bars = scores.map((s, i) => {
    const h = heightOf(s);
    const barStyle = bestSet.has(i)
      ? 'background:linear-gradient(180deg,#f6e9c1,#caa74e);box-shadow:0 0 10px rgba(232,196,120,.5);'
      : 'background:rgba(200,168,96,.18);';
    return `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:70px;">
        <div style="width:100%;border-radius:4px 4px 2px 2px;${barStyle}height:${h}%;"></div>
      </div>
    `;
  }).join('');
  const labels = scores.map((_, i) =>
    `<span style="flex:1;text-align:center;font-size:9px;color:#6b6253;">${i + 1}</span>`
  ).join('');

  const callout = hasBest
    ? `
      <span style="font-size:15px;">🌕</span>
      <span style="font-size:11.5px;color:#857a60;">올해의 골든타임</span>
      <span style="font-size:13px;font-weight:700;color:#f0e6cc;">${bestIndices.map(i => `${i + 1}월`).join('·')}</span>
    `
    : hasRange
    ? `
      <span style="font-size:15px;">🌓</span>
      <span style="font-size:11.5px;color:#857a60;">올해는 특별히 두드러지게 좋은 달은 없어요</span>
    `
    : `
      <span style="font-size:15px;">🌓</span>
      <span style="font-size:11.5px;color:#857a60;">올해는 달마다 큰 차이 없이 흐름이 비슷해요</span>
    `;

  return `
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:flex-end;gap:4px;margin-bottom:4px;">${bars}</div>
      <div style="display:flex;gap:4px;margin-bottom:10px;">${labels}</div>
      <div style="display:flex;align-items:center;gap:8px;background:rgba(200,168,96,.08);border:1px solid rgba(200,168,96,.3);border-radius:12px;padding:8px 12px;">
        ${callout}
      </div>
    </div>
  `;
}

// 직업 4종 — "이번 리포트 결론" 요약 박스. AI 호출 없이, 서버가 이미 계산해둔 monthlyStrength/conclusion
// 데이터만으로 만든다 — 추가 지연 없음. "~해라/하지마라" 같은 행동 지시나 근거 없는 비교는 절대 넣지 않고,
// 실제로 계산된 사실(지금 강도·상반기·하반기 흐름·골든타임과 그 이유)만 단정적으로 적는다.
function _conclusionHtml(conclusion, suggestion) {
  if (!conclusion) return '';
  const bullets = [];
  const moon = _STRENGTH_MOON[(conclusion.strengthFixed || '').trim()];

  if (moon) bullets.push(`지금은 ${moon.label} 시기예요`);

  if (conclusion.halfTrend === 'h2') bullets.push('하반기 전체적으로 흐름이 더 안정적이에요');
  else if (conclusion.halfTrend === 'h1') bullets.push('상반기 전체적으로 흐름이 더 안정적이에요');

  if (conclusion.hasVariation && conclusion.bestMonths?.length) {
    const months = conclusion.bestMonths.join('·');
    bullets.push(`특히 ${months}월에 신호가 집중돼요${conclusion.reason ? ` — ${conclusion.reason}` : ''}`);
  }

  if (!bullets.length && !suggestion) return '';

  const rows = bullets.map(b => `
    <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;">
      <span style="flex-shrink:0;font-size:14px;line-height:1.5;margin-top:1px;">🌕</span>
      <span style="font-size:13.5px;color:#e7e1f0;line-height:1.65;font-weight:600;">${b}</span>
    </div>
  `).join('');

  const suggestionHtml = suggestion ? `
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(159,147,192,.18);display:flex;align-items:flex-start;gap:10px;">
      <span style="flex-shrink:0;font-size:15px;color:#caa74e;line-height:1.7;">✧</span>
      <span style="font-size:13px;color:#cfc6a8;line-height:1.75;font-style:italic;">${suggestion}</span>
    </div>
  ` : '';

  return `
    <div style="${_CAREER_PANEL_STYLE}">
      <div style="${_CAREER_EYEBROW_STYLE}">結 論</div>
      <div style="${_CAREER_TITLE_STYLE}">이번 리포트 결론</div>
      ${rows}
      ${suggestionHtml}
    </div>
  `;
}

// 직업 4종 — 신호 리스트 (원형 심볼 아이콘 + 라벨/값), 한 줄에 최대 3개, items: [{icon,k,v}]
function _signalRowsHtml(items) {
  const rows = items.filter(it => it && it.v);
  if (!rows.length) return '';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px 8px;">` +
    rows.map(it => `
      <div style="display:flex;align-items:center;gap:7px;min-width:0;">
        <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:rgba(200,168,96,.07);border:1px solid rgba(200,168,96,.28);color:#e0c684;">${it.icon}</div>
        <div style="min-width:0;overflow:hidden;">
          <div style="font-size:10px;color:#857a60;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.k}</div>
          <div style="font-size:12px;color:#f0e6cc;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.v}</div>
        </div>
      </div>
    `).join('') +
  `</div>`;
}

// 1) 취업·합격운
async function revealJobHunting() {
  await _revealCareerScreen({
    inFlightFlagName: '_jobHuntingRevealInFlight',
    idPrefix: 'jobHunting',
    type: 'job-hunting',
    errorLabel: '취업·합격운',
    renderFn: _renderJobHuntingHtml,
    buildExtraFields: (astroData) => {
      const house6 = _findHouseOccupants(astroData, 6);
      const house10 = _findHouseOccupants(astroData, 10);
      const house6RulerKey = _SIGN_RULER[astroData.houses?.[5]?.sign];
      const house6Ruler = house6RulerKey ? { key: house6RulerKey, label: _LOVE_PLANET_KR[house6RulerKey], ...astroData.natal[house6RulerKey] } : null;
      return {
        house6Sign: astroData.houses?.[5]?.sign,
        house6Occupants: house6,
        house6Ruler,
        house10Sign: astroData.angles.mc.sign,
        house10Occupants: house10,
        mercury: astroData.natal.mercury,
        mars: astroData.natal.mars,
        jupiterSign: astroData.natal.jupiter.sign,
        saturn: astroData.natal.saturn,
      };
    }
  });
}

function _renderJobHuntingHtml(payload, raw) {
  const sections = {};
  _careerPanelHtml(raw, sections);
  const ecl = payload.eclipseSignal;
  return `
    <div style="${_CAREER_PANEL_STYLE}">
      <div style="${_CAREER_EYEBROW_STYLE}">求 職 之 運</div>
      <div style="${_CAREER_TITLE_STYLE}">${payload.name || '나'}의 취업 기질</div>
      ${_signalRowsHtml([
        { icon: '6H', k: '6하우스', v: payload.house6Sign },
        { icon: 'MC', k: '10하우스(MC)', v: payload.house10Sign },
        { icon: '☿', k: '수성', v: payload.mercury.sign },
      ])}
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${_CAREER_AI_EYEBROW_STYLE}">— 나의 취업 기질 해설</div>
      <div style="${_CAREER_AI_TEXT_STYLE}">${_careerToParas(sections.nature)}</div>
    </div>

    <div style="${_CAREER_PANEL_STYLE}">
      <div style="${_CAREER_EYEBROW_STYLE}">時 機</div>
      <div style="${_CAREER_TITLE_STYLE}">지금의 합격·면접 타이밍</div>
      ${_strengthBadgeHtml(sections.strength)}
      ${_strengthTimelineHtml(payload.monthlyStrength)}
      ${_signalRowsHtml([
        { icon: '♃', k: '트랜짓 목성', v: payload.transitNow?.planets?.jupiter?.house ? payload.transitNow.planets.jupiter.house + '하우스' : null },
        ecl ? { icon: ecl.type === '일식' ? '☉' : '☽', k: ecl.type + ' 근접', v: ecl.conjunctPoint } : null,
      ])}
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${_CAREER_AI_EYEBROW_STYLE}">— 지금의 타이밍 해설</div>
      <div style="${_CAREER_AI_TEXT_STYLE}">${_careerToParas(sections.timing)}</div>
    </div>
    ${_conclusionHtml(payload.conclusion, sections.suggestion)}
  `;
}

// 2) 직장·승진운
async function revealPromotion() {
  await _revealCareerScreen({
    inFlightFlagName: '_promotionRevealInFlight',
    idPrefix: 'promotion',
    type: 'promotion',
    errorLabel: '직장·승진운',
    renderFn: _renderPromotionHtml,
    buildExtraFields: (astroData) => {
      const house10 = _findHouseOccupants(astroData, 10);
      const house11 = _findHouseOccupants(astroData, 11);
      const house2  = _findHouseOccupants(astroData, 2);
      const house2RulerKey = _SIGN_RULER[astroData.houses?.[1]?.sign];
      const house2Ruler = house2RulerKey ? { key: house2RulerKey, label: _LOVE_PLANET_KR[house2RulerKey], ...astroData.natal[house2RulerKey] } : null;
      const marsRetroWindow = _retrogradeWindow(astroData.transits, 'mars', new Date().getMonth());
      return {
        house10Sign: astroData.angles.mc.sign,
        house10Occupants: house10,
        saturn: astroData.natal.saturn,
        sun: astroData.natal.sun,
        mars: astroData.natal.mars,
        venus: astroData.natal.venus,
        house11Sign: astroData.houses?.[10]?.sign,
        house11Occupants: house11,
        house12Sign: astroData.houses?.[11]?.sign,
        marsRetroWindow,
        house2Sign: astroData.houses?.[1]?.sign,
        house2Occupants: house2,
        house2Ruler,
        jupiterSign: astroData.natal.jupiter.sign,
      };
    }
  });
}

function _renderPromotionHtml(payload, raw) {
  const sections = {};
  _careerPanelHtml(raw, sections);
  const ecl = payload.eclipseSignal;
  return `
    <div style="${_CAREER_PANEL_STYLE}">
      <div style="${_CAREER_EYEBROW_STYLE}">職 場 之 運</div>
      <div style="${_CAREER_TITLE_STYLE}">${payload.name || '나'}의 직장 내 위치</div>
      ${_signalRowsHtml([
        { icon: 'MC', k: 'MC', v: payload.house10Sign },
        { icon: '♄', k: '토성', v: payload.saturn.sign },
        { icon: '11H', k: '11하우스(인맥)', v: payload.house11Sign },
      ])}
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${_CAREER_AI_EYEBROW_STYLE}">— 직장 스타일·인간관계 해설</div>
      <div style="${_CAREER_AI_TEXT_STYLE}">${_careerToParas(sections.nature)}</div>
    </div>

    <div style="${_CAREER_PANEL_STYLE}">
      <div style="${_CAREER_EYEBROW_STYLE}">時 機</div>
      <div style="${_CAREER_TITLE_STYLE}">지금의 승진·협상 흐름</div>
      ${_strengthBadgeHtml(sections.strength)}
      ${_strengthTimelineHtml(payload.monthlyStrength)}
      ${_signalRowsHtml([
        { icon: '♄', k: '트랜짓 토성', v: payload.transitNow?.planets?.saturn?.house ? payload.transitNow.planets.saturn.house + '하우스' : null },
        { icon: '♃', k: '트랜짓 목성', v: payload.transitNow?.planets?.jupiter?.house ? payload.transitNow.planets.jupiter.house + '하우스' : null },
        ecl ? { icon: ecl.type === '일식' ? '☉' : '☽', k: ecl.type + ' 근접', v: ecl.conjunctPoint } : null,
      ])}
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${_CAREER_AI_EYEBROW_STYLE}">— 지금의 흐름 해설</div>
      <div style="${_CAREER_AI_TEXT_STYLE}">${_careerToParas(sections.timing)}</div>
    </div>
    ${_conclusionHtml(payload.conclusion, sections.suggestion)}
  `;
}

// 3) 이직·스카웃운
async function revealJobChange() {
  await _revealCareerScreen({
    inFlightFlagName: '_jobChangeRevealInFlight',
    idPrefix: 'jobChange',
    type: 'job-change',
    errorLabel: '이직·스카웃운',
    renderFn: _renderJobChangeHtml,
    buildExtraFields: (astroData) => {
      const uranusTransitWindow = _houseTransitWindow(astroData.transits, 'uranus', new Date().getMonth());
      return {
        uranus: astroData.natal.uranus,
        northNodeSign: astroData.nodes?.north?.sign,
        northNodeHouse: astroData.nodes?.north?.house,
        house9Sign: astroData.houses?.[8]?.sign,
        uranusTransitWindow,
        jupiterSign: astroData.natal.jupiter.sign,
      };
    }
  });
}

function _renderJobChangeHtml(payload, raw) {
  const sections = {};
  _careerPanelHtml(raw, sections);
  const ecl = payload.eclipseSignal;
  const mcChanged = payload.progMcSign && payload.progMcSign !== payload.mcSign;
  return `
    <div style="${_CAREER_PANEL_STYLE}">
      <div style="${_CAREER_EYEBROW_STYLE}">移 職 之 運</div>
      <div style="${_CAREER_TITLE_STYLE}">${payload.name || '나'}의 커리어 점프 패턴</div>
      ${_signalRowsHtml([
        { icon: '♅', k: '천왕성', v: payload.uranus.sign },
        { icon: '☊', k: '북노드', v: `${payload.northNodeSign}(${payload.northNodeHouse}하우스)` },
      ])}
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${_CAREER_AI_EYEBROW_STYLE}">— 이직 패턴 해설</div>
      <div style="${_CAREER_AI_TEXT_STYLE}">${_careerToParas(sections.nature)}</div>
    </div>

    <div style="${_CAREER_PANEL_STYLE}">
      <div style="${_CAREER_EYEBROW_STYLE}">時 機</div>
      <div style="${_CAREER_TITLE_STYLE}">지금의 이직·스카웃 타이밍</div>
      ${_strengthBadgeHtml(sections.strength)}
      ${_strengthTimelineHtml(payload.monthlyStrength)}
      ${_signalRowsHtml([
        mcChanged ? { icon: 'MC', k: '프로그레션 MC 전환', v: payload.progMcSign } : null,
        ecl ? { icon: ecl.type === '일식' ? '☉' : '☽', k: ecl.type + ' 근접', v: ecl.conjunctPoint } : null,
      ])}
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${_CAREER_AI_EYEBROW_STYLE}">— 지금의 타이밍 해설</div>
      <div style="${_CAREER_AI_TEXT_STYLE}">${_careerToParas(sections.timing)}</div>
    </div>
    ${_conclusionHtml(payload.conclusion, sections.suggestion)}
  `;
}

// 4) 창업·부업운
async function revealStartup() {
  await _revealCareerScreen({
    inFlightFlagName: '_startupRevealInFlight',
    idPrefix: 'startup',
    type: 'startup',
    errorLabel: '창업·부업운',
    renderFn: _renderStartupHtml,
    buildExtraFields: (astroData) => {
      const house2 = _findHouseOccupants(astroData, 2);
      const house8 = _findHouseOccupants(astroData, 8);
      const house2RulerKey = _SIGN_RULER[astroData.houses?.[1]?.sign];
      const house8RulerKey = _SIGN_RULER[astroData.houses?.[7]?.sign];
      const house2Ruler = house2RulerKey ? { key: house2RulerKey, label: _LOVE_PLANET_KR[house2RulerKey], ...astroData.natal[house2RulerKey] } : null;
      const house8Ruler = house8RulerKey ? { key: house8RulerKey, label: _LOVE_PLANET_KR[house8RulerKey], ...astroData.natal[house8RulerKey] } : null;
      const jupiterRetroWindow = _retrogradeWindow(astroData.transits, 'jupiter', new Date().getMonth());
      return {
        house2Sign: astroData.houses?.[1]?.sign,
        house2Occupants: house2,
        house2Ruler,
        house8Sign: astroData.houses?.[7]?.sign,
        house8Occupants: house8,
        house8Ruler,
        mars: astroData.natal.mars,
        jupiterSign: astroData.natal.jupiter.sign,
        sun: astroData.natal.sun,
        house5Sign: astroData.houses?.[4]?.sign,
        jupiterRetroWindow,
        saturn: astroData.natal.saturn,
      };
    }
  });
}

// 5) 기업가·CEO 비즈니스운
async function revealBusiness() {
  await _revealCareerScreen({
    inFlightFlagName: '_businessRevealInFlight',
    idPrefix: 'business',
    type: 'business',
    errorLabel: '기업가·CEO 비즈니스운',
    renderFn: _renderBusinessHtml,
    buildExtraFields: (astroData) => {
      const house6 = _findHouseOccupants(astroData, 6);
      const house7 = _findHouseOccupants(astroData, 7);
      const house6RulerKey = _SIGN_RULER[astroData.houses?.[5]?.sign];
      const house7RulerKey = _SIGN_RULER[astroData.houses?.[6]?.sign];
      const house6Ruler = house6RulerKey ? { key: house6RulerKey, label: _LOVE_PLANET_KR[house6RulerKey], ...astroData.natal[house6RulerKey] } : null;
      const house7Ruler = house7RulerKey ? { key: house7RulerKey, label: _LOVE_PLANET_KR[house7RulerKey], ...astroData.natal[house7RulerKey] } : null;
      return {
        house6Sign: astroData.houses?.[5]?.sign,
        house6Occupants: house6,
        house6Ruler,
        house7Sign: astroData.houses?.[6]?.sign,
        house7Occupants: house7,
        house7Ruler,
        saturn: astroData.natal.saturn,
        mars: astroData.natal.mars,
        mercury: astroData.natal.mercury,
      };
    }
  });
}

function _renderStartupHtml(payload, raw) {
  const sections = {};
  _careerPanelHtml(raw, sections);
  const ecl = payload.eclipseSignal;
  return `
    <div style="${_CAREER_PANEL_STYLE}">
      <div style="${_CAREER_EYEBROW_STYLE}">創 業 之 運</div>
      <div style="${_CAREER_TITLE_STYLE}">${payload.name || '나'}의 사업가 기질</div>
      ${_signalRowsHtml([
        { icon: '2H', k: '2하우스(자기자본)', v: payload.house2Sign },
        { icon: '8H', k: '8하우스(투자)', v: payload.house8Sign },
        { icon: '♂', k: '화성', v: payload.mars.sign },
      ])}
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${_CAREER_AI_EYEBROW_STYLE}">— 사업가 기질 해설</div>
      <div style="${_CAREER_AI_TEXT_STYLE}">${_careerToParas(sections.nature)}</div>
    </div>

    <div style="${_CAREER_PANEL_STYLE}">
      <div style="${_CAREER_EYEBROW_STYLE}">時 機</div>
      <div style="${_CAREER_TITLE_STYLE}">지금이 시작하기 좋은 시기인지</div>
      ${_strengthBadgeHtml(sections.strength)}
      ${_strengthTimelineHtml(payload.monthlyStrength)}
      ${_signalRowsHtml([
        { icon: '♃', k: '트랜짓 목성', v: payload.transitNow?.planets?.jupiter?.house ? payload.transitNow.planets.jupiter.house + '하우스' : null },
        ecl ? { icon: ecl.type === '일식' ? '☉' : '☽', k: ecl.type + ' 근접', v: ecl.conjunctPoint } : null,
      ])}
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${_CAREER_AI_EYEBROW_STYLE}">— 지금의 시기 해설</div>
      <div style="${_CAREER_AI_TEXT_STYLE}">${_careerToParas(sections.timing)}</div>
    </div>
    ${_conclusionHtml(payload.conclusion, sections.suggestion)}
  `;
}

function _renderBusinessHtml(payload, raw) {
  const sections = {};
  _careerPanelHtml(raw, sections);
  const ecl = payload.eclipseSignal;
  return `
    <div style="${_CAREER_PANEL_STYLE}">
      <div style="${_CAREER_EYEBROW_STYLE}">經 營 之 運</div>
      <div style="${_CAREER_TITLE_STYLE}">${payload.name || '나'}의 비즈니스 리더십 기질</div>
      ${_signalRowsHtml([
        { icon: '6H', k: '6하우스(조직·직원)', v: payload.house6Sign },
        { icon: '7H', k: '7하우스(계약·파트너십)', v: payload.house7Sign },
        { icon: 'MC', k: 'MC(명성)', v: payload.mcSign },
      ])}
    </div>
    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${_CAREER_AI_EYEBROW_STYLE}">— 경영 스타일 해설</div>
      <div style="${_CAREER_AI_TEXT_STYLE}">${_careerToParas(sections.nature)}</div>
    </div>

    <div style="${_CAREER_PANEL_STYLE}">
      <div style="${_CAREER_EYEBROW_STYLE}">時 機</div>
      <div style="${_CAREER_TITLE_STYLE}">지금의 비즈니스 스케일업 타이밍</div>
      ${_strengthBadgeHtml(sections.strength)}
      ${_strengthTimelineHtml(payload.monthlyStrength)}
      ${_signalRowsHtml([
        { icon: '♃', k: '트랜짓 목성', v: payload.transitNow?.planets?.jupiter?.house ? payload.transitNow.planets.jupiter.house + '하우스' : null },
        { icon: '♄', k: '트랜짓 토성', v: payload.transitNow?.planets?.saturn?.house ? payload.transitNow.planets.saturn.house + '하우스' : null },
        ecl ? { icon: ecl.type === '일식' ? '☉' : '☽', k: ecl.type + ' 근접', v: ecl.conjunctPoint } : null,
      ])}
    </div>

    <div style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
      <div style="${_CAREER_AI_EYEBROW_STYLE}">— 조직·직원 운</div>
      <div style="${_CAREER_AI_TEXT_STYLE}">${_careerToParas(sections.organization)}</div>
    </div>
    <div style="position:relative;padding:0 6px 24px 0;margin-bottom:4px;">
      <div style="${_CAREER_AI_EYEBROW_STYLE}">— 계약·파트너십 운</div>
      <div style="${_CAREER_AI_TEXT_STYLE}">${_careerToParas(sections.contract)}</div>
    </div>
    <div style="position:relative;padding:0 6px 24px 0;margin-bottom:4px;">
      <div style="${_CAREER_AI_EYEBROW_STYLE}">— 브랜드·명성 운</div>
      <div style="${_CAREER_AI_TEXT_STYLE}">${_careerToParas(sections.reputation)}</div>
    </div>
    ${_conclusionHtml(payload.conclusion, sections.suggestion)}
  `;
}

/* =========================================================
   점성술 차트 미리 계산
   출생 정보 바뀔 때마다 /api/astro-calc를 호출해
   window.AstroResult에 저장해 둠.
   AI 해석 버튼을 누를 때는 저장된 값만 사용.
   ========================================================= */
let _astroCalcTimer = null;

function scheduleAstroCalc() {
  // 300ms 디바운스 — 입력 중 과다 호출 방지
  clearTimeout(_astroCalcTimer);
  _astroCalcTimer = setTimeout(runAstroCalc, 300);
}

async function runAstroCalc() {
  if (!window.SajuResult) return;

  const { name, gender, birthDate, birthTime } = window.SajuResult;
  const cityName = getCitySelectValue();
  const { lat, lng, utcOffset } = getCityCoords(cityName);

  // 상태 표시
  const statusEl = _$("astroCalcStatus");
  if (statusEl) {
    statusEl.textContent = "⏳ 차트 계산 중...";
    statusEl.style.color = "#94a3b8";
  }

  try {
    const calcRes = await fetch("/api/astro-calc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate, birthTime, lat, lng, name, gender, utcOffset })
    });

    const astroData = await calcRes.json();
    if (!calcRes.ok || astroData.error) throw new Error(astroData.error || "천문 계산 오류");

    window.AstroResult = astroData;

    // 나탈 차트 그리드 표시
    renderAstroNatal(astroData);

    // 연간 운세 패널 초기화
    renderAnnualEventsPanel(astroData);

    if (statusEl) {
      statusEl.textContent = "✅ 차트 계산 완료 — AI 해석 버튼을 눌러주세요.";
      statusEl.style.color = "#86efac";
    }

  } catch (err) {
    console.warn("astro-calc 미리계산 실패:", err.message);
    _invalidateAstroResult();
    if (statusEl) {
      statusEl.textContent = "⚠️ 차트 계산 실패 (배포 환경에서 다시 시도)";
      statusEl.style.color = "#fca5a5";
    }
  }
}

/* =========================================================
   도시명 → 위도/경도/utcOffset
   ========================================================= */
const CITY_COORDS = {
  // ── 서울 자치구
  "서울":         { lat: 37.5665, lng: 126.9780, utcOffset: 9 },
  "종로구":       { lat: 37.5730, lng: 126.9794, utcOffset: 9 },
  "중구(서울)":   { lat: 37.5640, lng: 126.9975, utcOffset: 9 },
  "용산구":       { lat: 37.5384, lng: 126.9654, utcOffset: 9 },
  "성동구":       { lat: 37.5636, lng: 127.0369, utcOffset: 9 },
  "광진구":       { lat: 37.5385, lng: 127.0823, utcOffset: 9 },
  "동대문구":     { lat: 37.5744, lng: 127.0396, utcOffset: 9 },
  "중랑구":       { lat: 37.6063, lng: 127.0927, utcOffset: 9 },
  "성북구":       { lat: 37.5894, lng: 127.0167, utcOffset: 9 },
  "강북구":       { lat: 37.6397, lng: 127.0257, utcOffset: 9 },
  "도봉구":       { lat: 37.6688, lng: 127.0471, utcOffset: 9 },
  "노원구":       { lat: 37.6541, lng: 127.0568, utcOffset: 9 },
  "은평구":       { lat: 37.6176, lng: 126.9227, utcOffset: 9 },
  "서대문구":     { lat: 37.5791, lng: 126.9368, utcOffset: 9 },
  "마포구":       { lat: 37.5663, lng: 126.9014, utcOffset: 9 },
  "양천구":       { lat: 37.5170, lng: 126.8666, utcOffset: 9 },
  "강서구(서울)": { lat: 37.5509, lng: 126.8495, utcOffset: 9 },
  "구로구":       { lat: 37.4954, lng: 126.8874, utcOffset: 9 },
  "금천구":       { lat: 37.4601, lng: 126.9001, utcOffset: 9 },
  "영등포구":     { lat: 37.5264, lng: 126.8963, utcOffset: 9 },
  "동작구":       { lat: 37.5124, lng: 126.9393, utcOffset: 9 },
  "관악구":       { lat: 37.4784, lng: 126.9516, utcOffset: 9 },
  "서초구":       { lat: 37.4837, lng: 127.0324, utcOffset: 9 },
  "강남구":       { lat: 37.5172, lng: 127.0473, utcOffset: 9 },
  "송파구":       { lat: 37.5145, lng: 127.1059, utcOffset: 9 },
  "강동구":       { lat: 37.5301, lng: 127.1238, utcOffset: 9 },
  // ── 경기도
  "수원":         { lat: 37.2636, lng: 127.0286, utcOffset: 9 },
  "성남":         { lat: 37.4449, lng: 127.1388, utcOffset: 9 },
  "고양":         { lat: 37.6584, lng: 126.8320, utcOffset: 9 },
  "용인":         { lat: 37.2411, lng: 127.1775, utcOffset: 9 },
  "부천":         { lat: 37.5034, lng: 126.7660, utcOffset: 9 },
  "안산":         { lat: 37.3219, lng: 126.8309, utcOffset: 9 },
  "안양":         { lat: 37.3943, lng: 126.9568, utcOffset: 9 },
  "남양주":       { lat: 37.6360, lng: 127.2165, utcOffset: 9 },
  "화성":         { lat: 37.1994, lng: 126.8317, utcOffset: 9 },
  "평택":         { lat: 36.9921, lng: 127.1126, utcOffset: 9 },
  "의정부":       { lat: 37.7381, lng: 127.0337, utcOffset: 9 },
  "파주":         { lat: 37.7600, lng: 126.7800, utcOffset: 9 },
  "김포":         { lat: 37.6152, lng: 126.7156, utcOffset: 9 },
  "광주(경기)":   { lat: 37.4296, lng: 127.2550, utcOffset: 9 },
  "시흥":         { lat: 37.3800, lng: 126.8029, utcOffset: 9 },
  "군포":         { lat: 37.3616, lng: 126.9352, utcOffset: 9 },
  "하남":         { lat: 37.5392, lng: 127.2148, utcOffset: 9 },
  "오산":         { lat: 37.1498, lng: 127.0770, utcOffset: 9 },
  "이천":         { lat: 37.2723, lng: 127.4350, utcOffset: 9 },
  "안성":         { lat: 37.0078, lng: 127.2797, utcOffset: 9 },
  "의왕":         { lat: 37.3448, lng: 126.9685, utcOffset: 9 },
  "양주":         { lat: 37.7854, lng: 127.0457, utcOffset: 9 },
  "구리":         { lat: 37.5943, lng: 127.1295, utcOffset: 9 },
  "포천":         { lat: 37.8948, lng: 127.2003, utcOffset: 9 },
  "양평":         { lat: 37.4916, lng: 127.4877, utcOffset: 9 },
  "동두천":       { lat: 37.9035, lng: 127.0607, utcOffset: 9 },
  "과천":         { lat: 37.4292, lng: 126.9877, utcOffset: 9 },
  "가평":         { lat: 37.8315, lng: 127.5107, utcOffset: 9 },
  "연천":         { lat: 38.0962, lng: 127.0749, utcOffset: 9 },
  "여주":         { lat: 37.2982, lng: 127.6375, utcOffset: 9 },
  // ── 인천
  "인천":         { lat: 37.4563, lng: 126.7052, utcOffset: 9 },
  "부평구":       { lat: 37.5069, lng: 126.7218, utcOffset: 9 },
  "남동구":       { lat: 37.4469, lng: 126.7314, utcOffset: 9 },
  "서구(인천)":   { lat: 37.5456, lng: 126.6757, utcOffset: 9 },
  "연수구":       { lat: 37.4100, lng: 126.6789, utcOffset: 9 },
  "미추홀구":     { lat: 37.4640, lng: 126.6505, utcOffset: 9 },
  "계양구":       { lat: 37.5374, lng: 126.7377, utcOffset: 9 },
  "강화":         { lat: 37.7473, lng: 126.4880, utcOffset: 9 },
  // ── 강원도
  "춘천":         { lat: 37.8813, lng: 127.7298, utcOffset: 9 },
  "원주":         { lat: 37.3422, lng: 127.9202, utcOffset: 9 },
  "강릉":         { lat: 37.7519, lng: 128.8761, utcOffset: 9 },
  "동해":         { lat: 37.5247, lng: 129.1144, utcOffset: 9 },
  "태백":         { lat: 37.1641, lng: 128.9856, utcOffset: 9 },
  "속초":         { lat: 38.2070, lng: 128.5919, utcOffset: 9 },
  "삼척":         { lat: 37.4497, lng: 129.1650, utcOffset: 9 },
  "홍천":         { lat: 37.6971, lng: 127.8882, utcOffset: 9 },
  "횡성":         { lat: 37.4916, lng: 127.9842, utcOffset: 9 },
  "영월":         { lat: 37.1836, lng: 128.4614, utcOffset: 9 },
  "평창":         { lat: 37.3703, lng: 128.3908, utcOffset: 9 },
  "정선":         { lat: 37.3798, lng: 128.6600, utcOffset: 9 },
  "철원":         { lat: 38.1463, lng: 127.3136, utcOffset: 9 },
  "화천":         { lat: 38.1063, lng: 127.7080, utcOffset: 9 },
  "양구":         { lat: 38.1062, lng: 127.9898, utcOffset: 9 },
  "인제":         { lat: 38.0693, lng: 128.1706, utcOffset: 9 },
  "고성(강원)":   { lat: 38.3806, lng: 128.4678, utcOffset: 9 },
  "양양":         { lat: 38.0748, lng: 128.6189, utcOffset: 9 },
  // ── 충청북도
  "청주":         { lat: 36.6424, lng: 127.4890, utcOffset: 9 },
  "충주":         { lat: 36.9910, lng: 127.9259, utcOffset: 9 },
  "제천":         { lat: 37.1325, lng: 128.1909, utcOffset: 9 },
  "보은":         { lat: 36.4896, lng: 127.7298, utcOffset: 9 },
  "옥천":         { lat: 36.3062, lng: 127.5706, utcOffset: 9 },
  "영동":         { lat: 36.1749, lng: 127.7762, utcOffset: 9 },
  "증평":         { lat: 36.7854, lng: 127.5816, utcOffset: 9 },
  "진천":         { lat: 36.8554, lng: 127.4356, utcOffset: 9 },
  "괴산":         { lat: 36.8154, lng: 127.7871, utcOffset: 9 },
  "음성":         { lat: 36.9399, lng: 127.6903, utcOffset: 9 },
  "단양":         { lat: 36.9848, lng: 128.3655, utcOffset: 9 },
  // ── 충청남도
  "천안":         { lat: 36.8151, lng: 127.1139, utcOffset: 9 },
  "공주":         { lat: 36.4465, lng: 127.1190, utcOffset: 9 },
  "보령":         { lat: 36.3332, lng: 126.6128, utcOffset: 9 },
  "아산":         { lat: 36.7898, lng: 127.0017, utcOffset: 9 },
  "서산":         { lat: 36.7848, lng: 126.4503, utcOffset: 9 },
  "논산":         { lat: 36.1870, lng: 127.0987, utcOffset: 9 },
  "계룡":         { lat: 36.2742, lng: 127.2491, utcOffset: 9 },
  "당진":         { lat: 36.8895, lng: 126.6458, utcOffset: 9 },
  "금산":         { lat: 36.1087, lng: 127.4882, utcOffset: 9 },
  "부여":         { lat: 36.2754, lng: 126.9099, utcOffset: 9 },
  "서천":         { lat: 36.0779, lng: 126.6913, utcOffset: 9 },
  "청양":         { lat: 36.4594, lng: 126.8026, utcOffset: 9 },
  "홍성":         { lat: 36.6012, lng: 126.6606, utcOffset: 9 },
  "예산":         { lat: 36.6804, lng: 126.8494, utcOffset: 9 },
  "태안":         { lat: 36.7453, lng: 126.2979, utcOffset: 9 },
  // ── 대전
  "대전":         { lat: 36.3504, lng: 127.3845, utcOffset: 9 },
  "유성구":       { lat: 36.3624, lng: 127.3566, utcOffset: 9 },
  "서구(대전)":   { lat: 36.3550, lng: 127.3830, utcOffset: 9 },
  // ── 세종
  "세종":         { lat: 36.4801, lng: 127.2890, utcOffset: 9 },
  // ── 전라북도
  "전주":         { lat: 35.8242, lng: 127.1480, utcOffset: 9 },
  "군산":         { lat: 35.9677, lng: 126.7368, utcOffset: 9 },
  "익산":         { lat: 35.9483, lng: 126.9577, utcOffset: 9 },
  "정읍":         { lat: 35.5699, lng: 126.8556, utcOffset: 9 },
  "남원":         { lat: 35.4162, lng: 127.3903, utcOffset: 9 },
  "김제":         { lat: 35.8033, lng: 126.8806, utcOffset: 9 },
  "완주":         { lat: 35.9049, lng: 127.1619, utcOffset: 9 },
  "진안":         { lat: 35.7913, lng: 127.4247, utcOffset: 9 },
  "무주":         { lat: 36.0073, lng: 127.6614, utcOffset: 9 },
  "장수":         { lat: 35.6471, lng: 127.5209, utcOffset: 9 },
  "임실":         { lat: 35.6175, lng: 127.2891, utcOffset: 9 },
  "순창":         { lat: 35.3745, lng: 127.1378, utcOffset: 9 },
  "고창":         { lat: 35.4356, lng: 126.7022, utcOffset: 9 },
  "부안":         { lat: 35.7318, lng: 126.7332, utcOffset: 9 },
  // ── 광주
  "광주":         { lat: 35.1595, lng: 126.8526, utcOffset: 9 },
  "광산구":       { lat: 35.1396, lng: 126.7936, utcOffset: 9 },
  "북구(광주)":   { lat: 35.1745, lng: 126.9119, utcOffset: 9 },
  // ── 전라남도
  "목포":         { lat: 34.8118, lng: 126.3922, utcOffset: 9 },
  "여수":         { lat: 34.7604, lng: 127.6622, utcOffset: 9 },
  "순천":         { lat: 34.9506, lng: 127.4872, utcOffset: 9 },
  "나주":         { lat: 35.0160, lng: 126.7108, utcOffset: 9 },
  "광양":         { lat: 34.9407, lng: 127.6956, utcOffset: 9 },
  "담양":         { lat: 35.3212, lng: 126.9885, utcOffset: 9 },
  "곡성":         { lat: 35.2818, lng: 127.2920, utcOffset: 9 },
  "구례":         { lat: 35.2026, lng: 127.4625, utcOffset: 9 },
  "고흥":         { lat: 34.6076, lng: 127.2774, utcOffset: 9 },
  "보성":         { lat: 34.7714, lng: 127.0802, utcOffset: 9 },
  "화순":         { lat: 35.0643, lng: 126.9869, utcOffset: 9 },
  "장흥":         { lat: 34.6815, lng: 126.9072, utcOffset: 9 },
  "강진":         { lat: 34.6424, lng: 126.7667, utcOffset: 9 },
  "해남":         { lat: 34.5735, lng: 126.5994, utcOffset: 9 },
  "영암":         { lat: 34.8002, lng: 126.6967, utcOffset: 9 },
  "무안":         { lat: 34.9904, lng: 126.4817, utcOffset: 9 },
  "함평":         { lat: 35.0647, lng: 126.5178, utcOffset: 9 },
  "영광":         { lat: 35.2771, lng: 126.5119, utcOffset: 9 },
  "장성":         { lat: 35.3020, lng: 126.7858, utcOffset: 9 },
  "완도":         { lat: 34.3108, lng: 126.7551, utcOffset: 9 },
  "진도":         { lat: 34.4867, lng: 126.2636, utcOffset: 9 },
  "신안":         { lat: 34.8280, lng: 126.1070, utcOffset: 9 },
  // ── 경상북도
  "포항":         { lat: 36.0190, lng: 129.3435, utcOffset: 9 },
  "경주":         { lat: 35.8562, lng: 129.2247, utcOffset: 9 },
  "김천":         { lat: 36.1398, lng: 128.1136, utcOffset: 9 },
  "안동":         { lat: 36.5684, lng: 128.7294, utcOffset: 9 },
  "구미":         { lat: 36.1194, lng: 128.3444, utcOffset: 9 },
  "영주":         { lat: 36.8059, lng: 128.6236, utcOffset: 9 },
  "영천":         { lat: 35.9737, lng: 128.9381, utcOffset: 9 },
  "상주":         { lat: 36.4109, lng: 128.1591, utcOffset: 9 },
  "문경":         { lat: 36.5860, lng: 128.1862, utcOffset: 9 },
  "경산":         { lat: 35.8252, lng: 128.7414, utcOffset: 9 },
  "의성":         { lat: 36.3527, lng: 128.6970, utcOffset: 9 },
  "청송":         { lat: 36.4356, lng: 129.0570, utcOffset: 9 },
  "영양":         { lat: 36.6672, lng: 129.1128, utcOffset: 9 },
  "영덕":         { lat: 36.4153, lng: 129.3652, utcOffset: 9 },
  "청도":         { lat: 35.6477, lng: 128.7338, utcOffset: 9 },
  "고령":         { lat: 35.7277, lng: 128.2635, utcOffset: 9 },
  "성주":         { lat: 35.9196, lng: 128.2829, utcOffset: 9 },
  "칠곡":         { lat: 35.9960, lng: 128.4016, utcOffset: 9 },
  "예천":         { lat: 36.6576, lng: 128.4513, utcOffset: 9 },
  "봉화":         { lat: 36.8933, lng: 128.7327, utcOffset: 9 },
  "울진":         { lat: 36.9933, lng: 129.4001, utcOffset: 9 },
  "울릉":         { lat: 37.4840, lng: 130.9057, utcOffset: 9 },
  // ── 대구
  "대구":         { lat: 35.8714, lng: 128.6014, utcOffset: 9 },
  "달서구":       { lat: 35.8298, lng: 128.5326, utcOffset: 9 },
  "북구(대구)":   { lat: 35.8860, lng: 128.5824, utcOffset: 9 },
  "수성구":       { lat: 35.8581, lng: 128.6308, utcOffset: 9 },
  "동구(대구)":   { lat: 35.8868, lng: 128.6354, utcOffset: 9 },
  "달성":         { lat: 35.7746, lng: 128.4313, utcOffset: 9 },
  // ── 경상남도
  "창원":         { lat: 35.2280, lng: 128.6811, utcOffset: 9 },
  "진주":         { lat: 35.1799, lng: 128.1076, utcOffset: 9 },
  "통영":         { lat: 34.8544, lng: 128.4332, utcOffset: 9 },
  "사천":         { lat: 35.0039, lng: 128.0642, utcOffset: 9 },
  "김해":         { lat: 35.2284, lng: 128.8891, utcOffset: 9 },
  "밀양":         { lat: 35.5036, lng: 128.7463, utcOffset: 9 },
  "거제":         { lat: 34.8804, lng: 128.6211, utcOffset: 9 },
  "양산":         { lat: 35.3350, lng: 129.0370, utcOffset: 9 },
  "의령":         { lat: 35.3222, lng: 128.2614, utcOffset: 9 },
  "함안":         { lat: 35.2726, lng: 128.4063, utcOffset: 9 },
  "창녕":         { lat: 35.5444, lng: 128.4922, utcOffset: 9 },
  "고성(경남)":   { lat: 34.9739, lng: 128.3225, utcOffset: 9 },
  "남해":         { lat: 34.8374, lng: 127.8924, utcOffset: 9 },
  "하동":         { lat: 35.0671, lng: 127.7516, utcOffset: 9 },
  "산청":         { lat: 35.4154, lng: 127.8742, utcOffset: 9 },
  "함양":         { lat: 35.5198, lng: 127.7256, utcOffset: 9 },
  "거창":         { lat: 35.6872, lng: 127.9094, utcOffset: 9 },
  "합천":         { lat: 35.5665, lng: 128.1653, utcOffset: 9 },
  // ── 울산
  "울산":         { lat: 35.5384, lng: 129.3114, utcOffset: 9 },
  "울주":         { lat: 35.5219, lng: 129.2430, utcOffset: 9 },
  // ── 부산
  "부산":         { lat: 35.1796, lng: 129.0756, utcOffset: 9 },
  "해운대구":     { lat: 35.1631, lng: 129.1638, utcOffset: 9 },
  "사상구":       { lat: 35.1499, lng: 128.9932, utcOffset: 9 },
  "금정구":       { lat: 35.2427, lng: 129.0919, utcOffset: 9 },
  "북구(부산)":   { lat: 35.1978, lng: 128.9957, utcOffset: 9 },
  "강서구(부산)": { lat: 35.2120, lng: 128.9810, utcOffset: 9 },
  "기장":         { lat: 35.2447, lng: 129.2224, utcOffset: 9 },
  // ── 제주
  "제주":         { lat: 33.4996, lng: 126.5312, utcOffset: 9 },
  "서귀포":       { lat: 33.2541, lng: 126.5600, utcOffset: 9 },
  // ── 아시아
  "도쿄":         { lat: 35.6762, lng: 139.6503, utcOffset: 9 },
  "오사카":       { lat: 34.6937, lng: 135.5023, utcOffset: 9 },
  "베이징":       { lat: 39.9042, lng: 116.4074, utcOffset: 8 },
  "상하이":       { lat: 31.2304, lng: 121.4737, utcOffset: 8 },
  "홍콩":         { lat: 22.3193, lng: 114.1694, utcOffset: 8 },
  "타이베이":     { lat: 25.0330, lng: 121.5654, utcOffset: 8 },
  "싱가포르":     { lat:  1.3521, lng: 103.8198, utcOffset: 8 },
  "방콕":         { lat: 13.7563, lng: 100.5018, utcOffset: 7 },
  "하노이":       { lat: 21.0285, lng: 105.8542, utcOffset: 7 },
  "호치민":       { lat: 10.8231, lng: 106.6297, utcOffset: 7 },
  "자카르타":     { lat: -6.2088, lng: 106.8456, utcOffset: 7 },
  "마닐라":       { lat: 14.5995, lng: 120.9842, utcOffset: 8 },
  "쿠알라룸푸르": { lat:  3.1390, lng: 101.6869, utcOffset: 8 },
  "뭄바이":       { lat: 19.0760, lng:  72.8777, utcOffset: 5.5 },
  "델리":         { lat: 28.7041, lng:  77.1025, utcOffset: 5.5 },
  // ── 유럽
  "런던":         { lat: 51.5074, lng:  -0.1278, utcOffset: 0 },
  "파리":         { lat: 48.8566, lng:   2.3522, utcOffset: 1 },
  "베를린":       { lat: 52.5200, lng:  13.4050, utcOffset: 1 },
  "로마":         { lat: 41.9028, lng:  12.4964, utcOffset: 1 },
  "마드리드":     { lat: 40.4168, lng:  -3.7038, utcOffset: 1 },
  "암스테르담":   { lat: 52.3676, lng:   4.9041, utcOffset: 1 },
  "취리히":       { lat: 47.3769, lng:   8.5417, utcOffset: 1 },
  "빈":           { lat: 48.2082, lng:  16.3738, utcOffset: 1 },
  "모스크바":     { lat: 55.7558, lng:  37.6173, utcOffset: 3 },
  // ── 북미
  "뉴욕":         { lat: 40.7128, lng: -74.0060, utcOffset: -5 },
  "LA":           { lat: 34.0522, lng:-118.2437, utcOffset: -8 },
  "시카고":       { lat: 41.8781, lng: -87.6298, utcOffset: -6 },
  "샌프란시스코": { lat: 37.7749, lng:-122.4194, utcOffset: -8 },
  "시애틀":       { lat: 47.6062, lng:-122.3321, utcOffset: -8 },
  "라스베이거스": { lat: 36.1699, lng:-115.1398, utcOffset: -8 },
  "달라스":       { lat: 32.7767, lng: -96.7970, utcOffset: -6 },
  "마이애미":     { lat: 25.7617, lng: -80.1918, utcOffset: -5 },
  "워싱턴DC":     { lat: 38.9072, lng: -77.0369, utcOffset: -5 },
  "토론토":       { lat: 43.6532, lng: -79.3832, utcOffset: -5 },
  "밴쿠버":       { lat: 49.2827, lng:-123.1207, utcOffset: -8 },
  // ── 오세아니아/기타
  "시드니":       { lat:-33.8688, lng: 151.2093, utcOffset: 10 },
  "멜버른":       { lat:-37.8136, lng: 144.9631, utcOffset: 10 },
  "오클랜드":     { lat:-36.8509, lng: 174.7645, utcOffset: 12 },
  "두바이":       { lat: 25.2048, lng:  55.2708, utcOffset:  4 },
  "상파울루":     { lat:-23.5505, lng: -46.6333, utcOffset: -3 },
};

function getCityCoords(cityName) {
  if (!cityName) return { lat: 37.5665, lng: 126.9780, utcOffset: 9 };
  // 정확 매칭 우선
  if (CITY_COORDS[cityName]) return CITY_COORDS[cityName];
  // 부분 매칭 (소문자)
  const key = cityName.trim().toLowerCase();
  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    if (name.toLowerCase() === key) return coords;
  }
  return { lat: 37.5665, lng: 126.9780, utcOffset: 9 }; // 기본값: 서울
}

/* =========================================================
   출생도시 Select 렌더링
   ========================================================= */
function filterCityList(val) {
  const dropdown = _$('cityDropdown');
  if (!dropdown) return;
  const q = val.trim().toLowerCase();
  const matched = Object.keys(CITY_COORDS).filter(c => c.toLowerCase().includes(q)).slice(0, 30);
  if (matched.length === 0 || q === '') { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = matched.map(c =>
    '<div onclick="selectCity(\'' + c + '\')" style="padding:8px 12px;font-size:13px;color:#e2e8f0;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);" onmouseover="this.style.background=\'rgba(255,255,255,.08)\'" onmouseout="this.style.background=\'\'">' + c + '</div>'
  ).join('');
  dropdown.style.display = 'block';
}
function showCityList() {
  const input = _$('birthCityInput');
  if (input) filterCityList(input.value);
}
function hideCityList() {
  const d = _$('cityDropdown');
  if (d) d.style.display = 'none';
}
function selectCity(cityName) {
  const input  = _$('birthCityInput');
  const hidden = _$('birthCity');
  if (input)  input.value  = cityName;
  if (hidden) { hidden.value = cityName; _invalidateAstroResult(); runAll(); }
  hideCityList();
}
function getCitySelectValue() {
  const el = _$('birthCity');
  return el ? el.value || '서울' : '서울';
}
function buildCitySelect() {
  const input = _$('birthCityInput');
  if (input) input.value = '서울';
  const hidden = _$('birthCity');
  if (hidden) hidden.value = '서울';
  // select 엘리먼트는 현재 HTML에 없으므로 더 이상 조작하지 않음
}

/* =========================================================
   에스펙트 아코디언 (클릭하면 펼쳐지는 형태)
   aspects: [{ point1, point2, aspect, symbol, orb, applying }]
   ========================================================= */
function renderAspectAccordion(aspects, title, icon, accentColor) {
  const gold = accentColor || '#dfba6b';
  const list = aspects || [];
  const itemsHtml = list.length > 0
    ? list.map(a => `
        <div style="
          display:grid;grid-template-columns:1fr auto 1fr auto;gap:8px;align-items:center;
          background:rgba(200,168,96,.05);border-radius:8px;
          padding:8px 12px;font-size:11px;color:#9b8f74;
          border-left:2px solid ${gold}55;
        ">
          <span style="color:${gold};">${a.point1}</span>
          <span style="color:#7d7257;white-space:nowrap;">${a.symbol} ${a.aspect}</span>
          <span style="color:#cabfa0;text-align:right;">${a.point2}</span>
          <span style="color:#5c5440;white-space:nowrap;">orb ${a.orb}°</span>
        </div>
      `).join('')
    : `<div style="color:#5c5440;font-size:12px;">에스펙트 없음</div>`;

  return `
    <details style="
      position:relative;
      background:radial-gradient(115% 80% at 50% -10%,#171232 0%,#0c0a20 55%,#07060f 100%);
      border:1px solid ${gold}40;border-radius:16px;padding:16px 20px;margin-top:12px;
      box-shadow:0 14px 36px -18px rgba(0,0,0,.75),inset 0 1px 0 rgba(255,255,255,.04);
    ">
      <summary style="cursor:pointer;font-size:12px;color:${gold};letter-spacing:.1em;font-family:Georgia,serif;">
        ${icon} ${title} <span style="color:#7d7257;">(${list.length}개)</span> — 클릭하여 펼치기
      </summary>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:14px;">
        ${itemsHtml}
      </div>
    </details>
  `;
}

/* =========================================================
   네이탈 차트 렌더링 (나탈만 표시 — 데이터는 풀 패키지)
   ========================================================= */
function renderAstroNatal(astroData) {
  const panel = _$("astroNatalPanel");
  const grid  = _$("astroNatalGrid");
  if (!panel || !grid) return;

  // 중복 렌더링 방지 — grid 초기화
  grid.innerHTML = "";

  const PLANET_KR = {
    sun:"☀️ 태양", moon:"🌙 달", mercury:"☿ 수성", venus:"♀ 금성",
    mars:"♂ 화성", jupiter:"♃ 목성", saturn:"♄ 토성",
    uranus:"⛢ 천왕성", neptune:"♆ 해왕성", pluto:"♇ 명왕성"
  };

  const natal = astroData.natal;
  grid.innerHTML = Object.entries(PLANET_KR).map(([key, label]) => {
    const p = natal[key];
    if (!p) return "";
    return `
      <div style="
        background:rgba(255,255,255,.04);border-radius:8px;padding:8px 10px;
        border:1px solid rgba(200,170,255,.1);
      ">
        <div style="color:#c4b5fd;font-size:11px;margin-bottom:3px;">${label}</div>
        <div style="color:#e2e8f0;font-size:12px;font-weight:600;">${p.sign}</div>
        <div style="color:#94a3b8;font-size:11px;">${p.degree}°${p.minute}' · ${p.house}하우스</div>
      </div>
    `;
  }).join("") + `
    <div style="
      background:rgba(167,139,250,.1);border-radius:8px;padding:8px 10px;
      border:1px solid rgba(167,139,250,.3);
    ">
      <div style="color:#c4b5fd;font-size:11px;margin-bottom:3px;">↑ ASC</div>
      <div style="color:#e2e8f0;font-size:12px;font-weight:600;">${astroData.angles.asc.sign}</div>
      <div style="color:#94a3b8;font-size:11px;">${astroData.angles.asc.degree}°${astroData.angles.asc.minute}'</div>
    </div>
    <div style="
      background:rgba(167,139,250,.1);border-radius:8px;padding:8px 10px;
      border:1px solid rgba(167,139,250,.3);
    ">
      <div style="color:#c4b5fd;font-size:11px;margin-bottom:3px;">MC 천정</div>
      <div style="color:#e2e8f0;font-size:12px;font-weight:600;">${astroData.angles.mc.sign}</div>
      <div style="color:#94a3b8;font-size:11px;">${astroData.angles.mc.degree}°${astroData.angles.mc.minute}'</div>
    </div>
  `;

  // 북노드/릴리스 표시
  if (astroData.nodes) {
    const { north, south } = astroData.nodes;
    grid.innerHTML += `
      <div style="
        background:rgba(251,191,36,.08);border-radius:8px;padding:8px 10px;
        border:1px solid rgba(251,191,36,.3);
      ">
        <div style="color:#fcd34d;font-size:11px;margin-bottom:3px;">☊ 북노드 (카르마 방향)</div>
        <div style="color:#e2e8f0;font-size:12px;font-weight:600;">${north.sign}</div>
        <div style="color:#94a3b8;font-size:11px;">${north.degree}°${north.minute}'${north.house != null ? ' · '+north.house+'하우스' : ''}</div>
      </div>
      <div style="
        background:rgba(148,163,184,.08);border-radius:8px;padding:8px 10px;
        border:1px solid rgba(148,163,184,.25);
      ">
        <div style="color:#94a3b8;font-size:11px;margin-bottom:3px;">☋ 릴리스 (전생 패턴)</div>
        <div style="color:#e2e8f0;font-size:12px;font-weight:600;">${south.sign}</div>
        <div style="color:#94a3b8;font-size:11px;">${south.degree}°${south.minute}'${south.house != null ? ' · '+south.house+'하우스' : ''}</div>
      </div>
    `;
  }

  panel.style.display = "block";

  // 세컨더리 프로그레션 차트도 함께 렌더링
  renderAstroProgression(astroData);

  // 나탈-나탈 에스펙트 (행성10 + ASC/MC + 북노드/릴리스 전체) — 아코디언
  // (renderAstroProgression 이후에 삽입해야 나탈 패널 바로 아래에 위치함)
  {
    const existingNatalAspectPanel = document.getElementById('astroNatalAspectPanel');
    if (existingNatalAspectPanel) existingNatalAspectPanel.remove();

    const aspectPanel = document.createElement('div');
    aspectPanel.id = 'astroNatalAspectPanel';
    aspectPanel.innerHTML = renderAspectAccordion(
      astroData.natalAspectsFull, '나탈-나탈 에스펙트', '🔯', '#c4b5fd'
    );
    panel.after(aspectPanel);
  }
}

/* =========================================================
   세컨더리 프로그레션 차트 렌더링
   ========================================================= */
function calcMidpoint(lonA, lonB) {
  if (lonA == null || lonB == null) return '-';
  const SIGNS = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
  const a = ((lonA % 360) + 360) % 360;
  const b = ((lonB % 360) + 360) % 360;
  let diff = b - a;
  if (diff > 180)  diff -= 360;
  if (diff < -180) diff += 360;
  const mid = ((a + diff / 2) + 360) % 360;
  const signIdx = Math.floor(mid / 30);
  const deg = mid % 30;
  const d = Math.floor(deg);
  const m = Math.floor((deg - d) * 60);
  return `${SIGNS[signIdx]} ${d}°${String(m).padStart(2,'0')}'`;
}

function renderAstroProgression(astroData) {
  const prog = astroData.progression;
  if (!prog) return;

  // 기존 패널 있으면 제거 후 재생성
  const existing = document.getElementById("astroProgPanel");
  if (existing) existing.remove();

  const PLANET_KR = {
    sun:"☀️ 태양", moon:"🌙 달", mercury:"☿ 수성", venus:"♀ 금성",
    mars:"♂ 화성", jupiter:"♃ 목성", saturn:"♄ 토성",
    uranus:"⛢ 천왕성", neptune:"♆ 해왕성", pluto:"♇ 명왕성"
  };

  const natal = astroData.natal;

  // 나탈 vs 프로그레션 비교 그리드
  const rowsHtml = Object.entries(PLANET_KR).map(([key, label]) => {
    const n = natal[key];
    const p = prog.planets[key];
    if (!n || !p) return "";

    // 사인이 바뀌었으면 강조
    const changed = n.signIndex !== p.signIndex;
    return `
      <div style="
        display:grid;grid-template-columns:1fr 1fr 1fr;
        gap:6px;align-items:center;
        background:${changed ? 'rgba(165,180,252,.08)' : 'rgba(255,255,255,.03)'};
        border:1px solid ${changed ? 'rgba(165,180,252,.25)' : 'rgba(255,255,255,.06)'};
        border-radius:8px;padding:7px 10px;margin-bottom:4px;
      ">
        <div style="color:#c4b5fd;font-size:11px;">${label}</div>
        <div>
          <div style="color:#94a3b8;font-size:11px;">${n.sign}</div>
          <div style="color:#64748b;font-size:10px;">${n.degree}°${n.minute}' · ${n.house}H</div>
        </div>
        <div>
          <div style="color:${changed ? '#a5b4fc' : '#e2e8f0'};font-size:11px;font-weight:${changed ? 700 : 400};">
            ${p.sign}${changed ? ' ✦' : ''}
          </div>
          <div style="color:#64748b;font-size:10px;">${p.degree}°${p.minute}' · ${p.house}H</div>
        </div>
      </div>
    `;
  }).join("");

  const panel = document.createElement("div");
  panel.id = "astroProgPanel";
  panel.style.cssText = "margin-top:12px;";
  panel.innerHTML = `
    <div style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(165,180,252,.2);border-radius:16px;padding:20px;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-size:12px;color:#a5b4fc;letter-spacing:2px;">🔭 세컨더리 프로그레션</div>
        <div style="font-size:11px;color:#475569;">
          기준일 ${prog.meta.progDate} · 나이 ${prog.meta.ageYears}세
        </div>
      </div>

      <!-- 헤더 -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px;padding:0 10px;">
        <div style="font-size:10px;color:#475569;">행성</div>
        <div style="font-size:10px;color:#475569;">나탈</div>
        <div style="font-size:10px;color:#a5b4fc;">프로그레션 ✦변화</div>
      </div>

      <!-- 행성 비교 -->
      ${rowsHtml}

      <!-- ASC / MC / 북노드 / 릴리스 비교 행 -->
      ${(() => {
        const nAsc  = astroData.angles?.asc;
        const nMc   = astroData.angles?.mc;
        const pAsc  = prog.angles?.asc;
        const pMc   = prog.angles?.mc;
        const north = astroData.nodes?.north;
        const south = astroData.nodes?.south;
        const ascChanged = nAsc && pAsc && nAsc.signIndex !== pAsc.signIndex;
        const mcChanged  = nMc  && pMc  && nMc.signIndex  !== pMc.signIndex;
        function row(icon, label, nObj, pObj, changed, color) {
          const nText = nObj ? nObj.sign : '-';
          const nSub  = nObj ? `${nObj.degree}°${nObj.minute}'` : '';
          const nH    = nObj?.house != null ? ` · ${nObj.house}H` : '';
          const pText = pObj ? `${pObj.sign}${changed ? ' ✦' : ''}` : '-';
          const pSub  = pObj ? `${pObj.degree}°${pObj.minute}'` : '';
          const pH    = pObj?.house != null ? ` · ${pObj.house}H` : '';
          return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;align-items:center;background:${changed?'rgba(165,180,252,.08)':'rgba(255,255,255,.03)'};border:1px solid ${changed?'rgba(165,180,252,.25)':'rgba(255,255,255,.06)'};border-radius:8px;padding:7px 10px;margin-bottom:4px;">
            <div style="color:${color};font-size:11px;">${icon} ${label}</div>
            <div><div style="color:#94a3b8;font-size:11px;">${nText}</div><div style="color:#64748b;font-size:10px;">${nSub}${nH}</div></div>
            <div><div style="color:${changed?'#a5b4fc':'#e2e8f0'};font-size:11px;font-weight:${changed?700:400};">${pText}</div><div style="color:#64748b;font-size:10px;">${pSub}${pH}</div></div>
          </div>`;
        }
        const pNorth = prog.nodes?.north;
        const pSouth = prog.nodes?.south;
        const northChanged = north && pNorth && north.signIndex !== pNorth.signIndex;
        const southChanged = south && pSouth && south.signIndex !== pSouth.signIndex;
        return row('↑','ASC',nAsc,pAsc,ascChanged,'#a78bfa')
              +row('⊕','MC',nMc,pMc,mcChanged,'#a78bfa')
              +row('☊','북노드',north,pNorth,northChanged,'#fcd34d')
              +row('☋','릴리스',south,pSouth,southChanged,'#94a3b8');
      })()}

      <!-- 미드포인트 -->
      <div style="margin-top:12px;">
        <div style="font-size:11px;color:#64748b;letter-spacing:1px;margin-bottom:8px;">미드 포인트</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px 12px;">
            <div style="font-size:10px;color:#94a3b8;letter-spacing:1px;margin-bottom:8px;">네이탈 행성</div>
            <div style="margin-bottom:6px;">
              <div style="font-size:10px;color:#64748b;margin-bottom:2px;">ASC/MC</div>
              <div style="font-size:12px;color:#e2e8f0;font-weight:600;">${calcMidpoint(astroData.angles?.asc?.longitude, astroData.angles?.mc?.longitude)}</div>
            </div>
            <div>
              <div style="font-size:10px;color:#64748b;margin-bottom:2px;">태양/달</div>
              <div style="font-size:12px;color:#e2e8f0;font-weight:600;">${calcMidpoint(natal.sun?.longitude, natal.moon?.longitude)}</div>
            </div>
          </div>
          <div style="background:rgba(167,139,250,.06);border:1px solid rgba(167,139,250,.18);border-radius:8px;padding:10px 12px;">
            <div style="font-size:10px;color:#a78bfa;letter-spacing:1px;margin-bottom:8px;">프로그레션</div>
            <div style="margin-bottom:6px;">
              <div style="font-size:10px;color:#64748b;margin-bottom:2px;">ASC/MC</div>
              <div style="font-size:12px;color:#e2e8f0;font-weight:600;">${calcMidpoint(prog.angles?.asc?.longitude, prog.angles?.mc?.longitude)}</div>
            </div>
            <div>
              <div style="font-size:10px;color:#64748b;margin-bottom:2px;">태양/달</div>
              <div style="font-size:12px;color:#e2e8f0;font-weight:600;">${calcMidpoint(prog.planets?.sun?.longitude, prog.planets?.moon?.longitude)}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 에스펙트 -->
      ${renderAspectAccordion(prog.aspectsFull, '나탈-프로그레션 에스펙트', '🔭', '#a5b4fc')}
    </div>
  `;

  // 나탈 패널 바로 아래에 삽입
  const natalPanel = document.getElementById("astroNatalPanel");
  if (natalPanel) {
    natalPanel.after(panel);
  }

  // 타임라인 렌더링
  renderProgTimeline(astroData);
  renderProgMoonTimeline(astroData);
  renderSaturnReturnPanel(astroData);
  renderSolarReturnPanel(astroData);
}

/* =========================================================
   프로그레션 태양 타임라인 계산
   A방식: 프로그레션 태양 위치를 나탈 하우스 커스프에 올려서 계산
   ========================================================= */
function calcProgTimeline(astroData) {
  const meta   = astroData.meta;
  const houses = astroData.houses; // 나탈 하우스 커스프 12개

  if (!meta?.birthDate || !meta?.birthTime || !houses) return null;

  const [yyyy, mm, dd] = meta.birthDate.split('-').map(Number);
  const [hh, mi]       = meta.birthTime.split(':').map(Number);
  const offsetHours    = meta.utcOffset ?? 9;
  const utcH           = hh + mi / 60 - offsetHours;
  const birthUTC       = new Date(Date.UTC(yyyy, mm - 1, dd, Math.floor(utcH), Math.round((utcH % 1) * 60)));

  const bY  = birthUTC.getUTCFullYear();
  const bM  = birthUTC.getUTCMonth() + 1;
  const bD  = birthUTC.getUTCDate();
  const bHr = birthUTC.getUTCHours() + birthUTC.getUTCMinutes() / 60;

  // 율리우스일
  function calcJD(y, m, d, h = 0) {
    if (m <= 2) { y--; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + h / 24 + B - 1524.5;
  }
  function norm360(a) { return ((a % 360) + 360) % 360; }
  function rad(d)     { return d * Math.PI / 180; }

  // VSOP87 축약 태양 황경
  function calcSun(T) {
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    const M  = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    const mr = rad(M);
    const C  = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(mr)
             + (0.019993 - 0.000101 * T) * Math.sin(2 * mr)
             + 0.000289 * Math.sin(3 * mr);
    return norm360(L0 + C);
  }

  // 나탈 하우스 커스프 (절대 경도 배열)
  const natalCusps = houses.map(h => h.longitude);

  function getHouse(lon) {
    const n = norm360(lon);
    for (let i = 0; i < 12; i++) {
      const s = natalCusps[i], e = natalCusps[(i + 1) % 12];
      if (s > e) { if (n >= s || n < e) return i + 1; }
      else       { if (n >= s && n < e) return i + 1; }
    }
    return 12;
  }

  const SIGNS = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                 '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];

  const natalJD   = calcJD(bY, bM, bD, bHr);
  const birthYear = bY;

  // 현재 나이
  const now        = new Date();
  const currentAge = (now - birthUTC) / (365.25 * 86400000);

  // 0~90세 0.1년 단위 스캔 → 사인/하우스 변화 시점 기록
  const chapters = [];
  let prevSign = -1, prevHouse = -1;

  for (let age = 0; age <= 90; age = Math.round((age + 0.1) * 10) / 10) {
    const progJD  = natalJD + age;
    const T       = (progJD - 2451545.0) / 36525.0;
    const sunLon  = calcSun(T);
    const signIdx = Math.floor(sunLon / 30);
    const house   = getHouse(sunLon);

    if (signIdx !== prevSign || house !== prevHouse) {
      // 이분법으로 정확한 시점 탐색
      let lo = Math.max(0, age - 0.1), hi = age;
      for (let i = 0; i < 60; i++) {
        const mid   = (lo + hi) / 2;
        const pT    = (natalJD + mid - 2451545.0) / 36525.0;
        const pLon  = calcSun(pT);
        const pSign = Math.floor(pLon / 30);
        const pH    = getHouse(pLon);
        if (pSign === signIdx && pH === house) hi = mid;
        else lo = mid;
        if (hi - lo < 0.001) break;
      }
      const exactAge  = hi; // hi는 항상 새 사인/하우스(signIdx, house) 쪽 경계 — degInSign과 sign 라벨의 일치를 보장
      const exactYear = Math.floor(birthYear + exactAge);
      const sunAtAge  = calcSun((natalJD + exactAge - 2451545.0) / 36525.0);
      const degInSign = sunAtAge % 30;

      if (chapters.length > 0) {
        chapters[chapters.length - 1].endAge  = Math.floor(exactAge);
        chapters[chapters.length - 1].endYear = exactYear;
      }

      chapters.push({
        startAge:  Math.floor(exactAge),
        startYear: exactYear,
        endAge:    90,
        endYear:   birthYear + 90,
        sign:      SIGNS[signIdx],
        signIndex: signIdx,
        house,
        degree:    Math.floor(degInSign),
        minute:    Math.floor((degInSign % 1) * 60),
        isCurrent: false,
      });

      prevSign  = signIdx;
      prevHouse = house;
    }
  }

  // 현재 챕터 표시
  chapters.forEach(c => {
    c.isCurrent = currentAge >= c.startAge && currentAge < c.endAge;
  });

  return { chapters, birthYear, currentAge: Math.floor(currentAge) };
}

/* =========================================================
   프로그레션 타임라인 UI 렌더링
   ========================================================= */
function renderProgTimeline(astroData) {
  // 기존 패널 제거
  const existing = document.getElementById("astroTimelinePanel");
  if (existing) existing.remove();

  const data = calcProgTimeline(astroData);
  if (!data) return;

  const { chapters, birthYear, currentAge } = data;

  const HOUSE_THEME = {
    1:  { label:"자아·외모·시작",     color:"#f87171" },
    2:  { label:"재물·가치관",        color:"#fb923c" },
    3:  { label:"지식·소통·학습",     color:"#facc15" },
    4:  { label:"기반·가정·정체성",   color:"#4ade80" },
    5:  { label:"창작·표현·즐거움",   color:"#34d399" },
    6:  { label:"건강·일과·봉사",     color:"#22d3ee" },
    7:  { label:"관계·파트너십",      color:"#60a5fa" },
    8:  { label:"변환·심층·공유",     color:"#818cf8" },
    9:  { label:"탐구·철학·확장",     color:"#a78bfa" },
    10: { label:"사회·직업·명예",     color:"#c084fc" },
    11: { label:"이상·공동체·미래",   color:"#e879f9" },
    12: { label:"은둔·무의식·영성",   color:"#94a3b8" },
  };

  const rowsHtml = chapters.map((c, i) => {
    const theme    = HOUSE_THEME[c.house] || { label:"", color:"#94a3b8" };
    const isCur    = c.isCurrent;
    const duration = c.endAge - c.startAge;
    const chapterNum = i + 1;
    return `
      <tr style="
        background:${isCur ? 'rgba(165,180,252,.12)' : 'transparent'};
        border-bottom:1px solid rgba(255,255,255,.05);
      ">
        <td style="padding:10px 12px;font-size:12px;color:${isCur ? '#a5b4fc' : '#64748b'};font-weight:${isCur ? 700 : 400};white-space:nowrap;">
          제${chapterNum}장${isCur ? ' <span style="font-size:10px;background:rgba(165,180,252,.25);border-radius:4px;padding:1px 5px;">현재</span>' : ''}
        </td>
        <td style="padding:10px 12px;font-size:12px;color:${isCur ? '#e2e8f0' : '#94a3b8'};white-space:nowrap;">
          ${c.startAge}~${c.endAge < 90 ? c.endAge : c.endAge + ''}세
        </td>
        <td style="padding:10px 12px;font-size:12px;color:${isCur ? '#e2e8f0' : '#94a3b8'};white-space:nowrap;">
          ${c.startYear}~${c.endYear}
        </td>
        <td style="padding:10px 12px;font-size:12px;white-space:nowrap;">
          <span style="color:${theme.color};font-weight:600;">${c.sign} ${c.degree}°${c.minute}'</span>
          <span style="color:#475569;"> · </span>
          <span style="color:${isCur ? '#a5b4fc' : '#64748b'};">${c.house}H</span>
        </td>
        <td style="padding:10px 12px;font-size:11px;color:#64748b;">
          ${theme.label}
        </td>
      </tr>
    `;
  }).join('');

  const panel = document.createElement('div');
  panel.id = 'astroTimelinePanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <div style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(165,180,252,.2);border-radius:16px;padding:20px;
    ">
      <div style="font-size:12px;color:#a5b4fc;letter-spacing:2px;margin-bottom:4px;">🗺️ 프로그레션 태양 타임라인</div>
      <div style="font-size:11px;color:#475569;margin-bottom:16px;">나탈 하우스 기준 · A방식</div>

      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:420px;">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,.1);">
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;">챕터</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;">나이</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;">연도</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;">위치</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;">핵심 주제</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>

      <div style="margin-top:12px;font-size:10px;color:#334155;text-align:right;">
        프로그레스드 태양 1년 ≈ 1° 이동 · Placidus 나탈 하우스 고정
      </div>
    </div>
  `;

  // 프로그레션 패널 바로 아래 삽입
  const progPanel = document.getElementById("astroProgPanel");
  if (progPanel) progPanel.after(panel);
}

/* =========================================================
   프로그레션 타임라인 공통 빌더 (사인/하우스 이동 시점 스캔)
   lonFn(T): 율리우스세기 T → 황경(0~360)
   ========================================================= */
function buildProgressionTimeline(astroData, lonFn, stepYears = 0.1) {
  const meta   = astroData.meta;
  const houses = astroData.houses; // 나탈 하우스 커스프 12개

  if (!meta?.birthDate || !meta?.birthTime || !houses) return null;

  const [yyyy, mm, dd] = meta.birthDate.split('-').map(Number);
  const [hh, mi]       = meta.birthTime.split(':').map(Number);
  const offsetHours    = meta.utcOffset ?? 9;
  const utcH           = hh + mi / 60 - offsetHours;
  const birthUTC       = new Date(Date.UTC(yyyy, mm - 1, dd, Math.floor(utcH), Math.round((utcH % 1) * 60)));

  const bY  = birthUTC.getUTCFullYear();
  const bM  = birthUTC.getUTCMonth() + 1;
  const bD  = birthUTC.getUTCDate();
  const bHr = birthUTC.getUTCHours() + birthUTC.getUTCMinutes() / 60;

  function calcJD(y, m, d, h = 0) {
    if (m <= 2) { y--; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + h / 24 + B - 1524.5;
  }
  function norm360(a) { return ((a % 360) + 360) % 360; }

  // 나탈 하우스 커스프 (절대 경도 배열)
  const natalCusps = houses.map(h => h.longitude);

  function getHouse(lon) {
    const n = norm360(lon);
    for (let i = 0; i < 12; i++) {
      const s = natalCusps[i], e = natalCusps[(i + 1) % 12];
      if (s > e) { if (n >= s || n < e) return i + 1; }
      else       { if (n >= s && n < e) return i + 1; }
    }
    return 12;
  }

  const SIGNS = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                 '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];

  const natalJD   = calcJD(bY, bM, bD, bHr);
  const birthYear = bY;

  // 현재 나이
  const now        = new Date();
  const currentAge = (now - birthUTC) / (365.25 * 86400000);

  // 0~90세 스캔 → 사인/하우스 변화 시점 기록
  const chapters = [];
  let prevSign = -1, prevHouse = -1;

  for (let age = 0; age <= 90; age = Math.round((age + stepYears) * 1000) / 1000) {
    const progJD  = natalJD + age;
    const T       = (progJD - 2451545.0) / 36525.0;
    const lon     = norm360(lonFn(T));
    const signIdx = Math.floor(lon / 30);
    const house   = getHouse(lon);

    if (signIdx !== prevSign || house !== prevHouse) {
      // 이분법으로 정확한 시점 탐색
      let lo = Math.max(0, age - stepYears), hi = age;
      for (let i = 0; i < 60; i++) {
        const mid   = (lo + hi) / 2;
        const pT    = (natalJD + mid - 2451545.0) / 36525.0;
        const pLon  = norm360(lonFn(pT));
        const pSign = Math.floor(pLon / 30);
        const pH    = getHouse(pLon);
        if (pSign === signIdx && pH === house) hi = mid;
        else lo = mid;
        if (hi - lo < 0.0005) break;
      }
      const exactAge  = hi; // hi는 항상 새 사인/하우스(signIdx, house) 쪽 경계 — degInSign과 sign 라벨의 일치를 보장
      const exactYear = Math.floor(birthYear + exactAge);
      const lonAtAge  = norm360(lonFn((natalJD + exactAge - 2451545.0) / 36525.0));
      const degInSign = lonAtAge % 30;

      if (chapters.length > 0) {
        chapters[chapters.length - 1].endAge  = Math.floor(exactAge);
        chapters[chapters.length - 1].endYear = exactYear;
      }

      chapters.push({
        startAge:  Math.floor(exactAge),
        startYear: exactYear,
        endAge:    90,
        endYear:   birthYear + 90,
        sign:      SIGNS[signIdx],
        signIndex: signIdx,
        house,
        degree:    Math.floor(degInSign),
        minute:    Math.floor((degInSign % 1) * 60),
        isCurrent: false,
      });

      prevSign  = signIdx;
      prevHouse = house;
    }
  }

  // 현재 챕터 표시
  chapters.forEach(c => {
    c.isCurrent = currentAge >= c.startAge && currentAge < c.endAge;
  });

  return { chapters, birthYear, currentAge: Math.floor(currentAge) };
}

/* =========================================================
   달의 황경 근사 계산 (truncated lunar theory, 오차 약 0.3도 이내)
   ========================================================= */
function calcMoonLon(T) {
  const rad     = d => d * Math.PI / 180;
  const norm360 = a => ((a % 360) + 360) % 360;

  const Lp = 218.3164591 + 481267.88134236 * T;
  const D  = 297.8502042 + 445267.1115168  * T;
  const M  = 357.5291092 + 35999.0503      * T;
  const Mp = 134.9634114 + 477198.8676313  * T;
  const F  = 93.2720993  + 483202.0175273  * T;

  const lon = Lp
    + 6.2888 * Math.sin(rad(Mp))
    + 1.2740 * Math.sin(rad(2 * D - Mp))
    + 0.6583 * Math.sin(rad(2 * D))
    + 0.2136 * Math.sin(rad(2 * Mp))
    - 0.1851 * Math.sin(rad(M))
    - 0.1143 * Math.sin(rad(2 * F))
    + 0.0588 * Math.sin(rad(2 * D - 2 * Mp))
    + 0.0572 * Math.sin(rad(2 * D - M - Mp))
    + 0.0533 * Math.sin(rad(2 * D + Mp));

  return norm360(lon);
}

/* =========================================================
   프로그레션 달 타임라인 계산
   ========================================================= */
function calcProgMoonTimeline(astroData) {
  // 달은 1년에 약 13°씩 이동 → 더 촘촘한 스텝으로 스캔
  return buildProgressionTimeline(astroData, calcMoonLon, 0.02);
}

/* =========================================================
   프로그레션 달 타임라인 UI 렌더링
   ========================================================= */
function renderProgMoonTimeline(astroData) {
  // 기존 패널 제거
  const existing = document.getElementById("astroMoonTimelinePanel");
  if (existing) existing.remove();

  const data = calcProgMoonTimeline(astroData);
  if (!data) return;

  const { chapters, currentAge } = data;

  const HOUSE_THEME = {
    1:  { label:"자아·외모·시작",     color:"#f87171" },
    2:  { label:"재물·가치관",        color:"#fb923c" },
    3:  { label:"지식·소통·학습",     color:"#facc15" },
    4:  { label:"기반·가정·정체성",   color:"#4ade80" },
    5:  { label:"창작·표현·즐거움",   color:"#34d399" },
    6:  { label:"건강·일과·봉사",     color:"#22d3ee" },
    7:  { label:"관계·파트너십",      color:"#60a5fa" },
    8:  { label:"변환·심층·공유",     color:"#818cf8" },
    9:  { label:"탐구·철학·확장",     color:"#a78bfa" },
    10: { label:"사회·직업·명예",     color:"#c084fc" },
    11: { label:"이상·공동체·미래",   color:"#e879f9" },
    12: { label:"은둔·무의식·영성",   color:"#94a3b8" },
  };

  const rowsHtml = chapters.map((c, i) => {
    const theme    = HOUSE_THEME[c.house] || { label:"", color:"#94a3b8" };
    const isCur    = c.isCurrent;
    const chapterNum = i + 1;
    return `
      <tr style="
        background:${isCur ? 'rgba(165,180,252,.12)' : 'transparent'};
        border-bottom:1px solid rgba(255,255,255,.05);
      ">
        <td style="padding:10px 12px;font-size:12px;color:${isCur ? '#a5b4fc' : '#64748b'};font-weight:${isCur ? 700 : 400};white-space:nowrap;">
          제${chapterNum}장${isCur ? ' <span style="font-size:10px;background:rgba(165,180,252,.25);border-radius:4px;padding:1px 5px;">현재</span>' : ''}
        </td>
        <td style="padding:10px 12px;font-size:12px;color:${isCur ? '#e2e8f0' : '#94a3b8'};white-space:nowrap;">
          ${c.startAge}~${c.endAge}세
        </td>
        <td style="padding:10px 12px;font-size:12px;color:${isCur ? '#e2e8f0' : '#94a3b8'};white-space:nowrap;">
          ${c.startYear}~${c.endYear}
        </td>
        <td style="padding:10px 12px;font-size:12px;white-space:nowrap;">
          <span style="color:${theme.color};font-weight:600;">${c.sign} ${c.degree}°${c.minute}'</span>
          <span style="color:#475569;"> · </span>
          <span style="color:${isCur ? '#a5b4fc' : '#64748b'};">${c.house}H</span>
        </td>
        <td style="padding:10px 12px;font-size:11px;color:#64748b;">
          ${theme.label}
        </td>
      </tr>
    `;
  }).join('');

  const panel = document.createElement('div');
  panel.id = 'astroMoonTimelinePanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <details style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(165,180,252,.2);border-radius:16px;padding:20px;
    ">
      <summary style="cursor:pointer;font-size:12px;color:#a5b4fc;letter-spacing:2px;">
        🌙 프로그레션 달 타임라인 (${chapters.length}개) — 클릭하여 펼치기
      </summary>
      <div style="font-size:11px;color:#475569;margin:8px 0 16px;">나탈 하우스 기준 · A방식</div>

      <div style="overflow-x:auto;overflow-y:auto;max-height:420px;">
        <table style="width:100%;border-collapse:collapse;min-width:420px;">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,.1);">
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;position:sticky;top:0;background:rgba(15,15,35,.95);">챕터</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;position:sticky;top:0;background:rgba(15,15,35,.95);">나이</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;position:sticky;top:0;background:rgba(15,15,35,.95);">연도</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;position:sticky;top:0;background:rgba(15,15,35,.95);">위치</th>
              <th style="padding:6px 12px;font-size:10px;color:#475569;text-align:left;font-weight:400;position:sticky;top:0;background:rgba(15,15,35,.95);">핵심 주제</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>

      <div style="margin-top:12px;font-size:10px;color:#334155;text-align:right;">
        프로그레스드 달 1년 ≈ 13° 이동 · Placidus 나탈 하우스 고정
      </div>
    </details>
  `;

  // 태양 타임라인 패널 바로 아래 삽입 (없으면 프로그레션 패널 아래)
  const sunTimelinePanel = document.getElementById("astroTimelinePanel");
  if (sunTimelinePanel) {
    sunTimelinePanel.after(panel);
  } else {
    const progPanel = document.getElementById("astroProgPanel");
    if (progPanel) progPanel.after(panel);
  }
}

/* =========================================================
   토성의 황경 근사 계산 (평균 + 근점이각 보정, 트랜짓용)
   ========================================================= */
function calcSaturnLonApprox(T) {
  const rad     = d => d * Math.PI / 180;
  const norm360 = a => ((a % 360) + 360) % 360;
  const L = 50.077444 + 1223.5110686 * T;
  const M = 317.9     + 1222.114     * T;
  return norm360(L + 6.393 * Math.sin(rad(M)) + 0.120 * Math.sin(rad(2 * M)));
}

/* =========================================================
   토성 리턴(Saturn Return) 계산 — 실제 시간 기준(1년=1년)으로
   트랜짓 토성이 나탈 토성 위치로 돌아오는 시점을 탐색
   ========================================================= */
function calcSaturnReturns(astroData) {
  const meta        = astroData.meta;
  const natalSaturn = astroData.natal?.saturn;
  if (!meta?.birthDate || !meta?.birthTime || !natalSaturn) return null;

  const [yyyy, mm, dd] = meta.birthDate.split('-').map(Number);
  const [hh, mi]       = meta.birthTime.split(':').map(Number);
  const offsetHours    = meta.utcOffset ?? 9;
  const utcH           = hh + mi / 60 - offsetHours;
  const birthUTC       = new Date(Date.UTC(yyyy, mm - 1, dd, Math.floor(utcH), Math.round((utcH % 1) * 60)));

  function calcJD(y, m, d, h = 0) {
    if (m <= 2) { y--; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + h / 24 + B - 1524.5;
  }
  function signedDiff(a, b) {
    let d = (a - b) % 360;
    if (d <= -180) d += 360;
    if (d > 180)   d -= 360;
    return d;
  }

  const bY  = birthUTC.getUTCFullYear();
  const bM  = birthUTC.getUTCMonth() + 1;
  const bD  = birthUTC.getUTCDate();
  const bHr = birthUTC.getUTCHours() + birthUTC.getUTCMinutes() / 60;

  const natalJD   = calcJD(bY, bM, bD, bHr);
  const birthYear = bY;

  const T0       = (natalJD - 2451545.0) / 36525.0;
  const natalLon = calcSaturnLonApprox(T0);

  const now        = new Date();
  const currentAge = (now - birthUTC) / (365.25 * 86400000);

  // 0~90세(실제 연수) 스캔하며 트랜짓 토성이 나탈 토성 위치를 통과하는 시점 탐색
  const returns = [];
  const step = 0.05;
  let prevDiff = null;

  for (let age = 0; age <= 90; age += step) {
    const T    = ((natalJD + age * 365.25) - 2451545.0) / 36525.0;
    const diff = signedDiff(calcSaturnLonApprox(T), natalLon);

    if (prevDiff !== null && prevDiff < 0 && diff >= 0) {
      let lo = age - step, hi = age;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const Tm  = ((natalJD + mid * 365.25) - 2451545.0) / 36525.0;
        const dm  = signedDiff(calcSaturnLonApprox(Tm), natalLon);
        if (dm < 0) lo = mid; else hi = mid;
      }
      const exactAge = (lo + hi) / 2;
      returns.push({
        age:  Math.round(exactAge),
        year: birthYear + Math.round(exactAge),
      });
    }
    prevDiff = diff;
  }

  return { returns, natalSaturn, currentAge };
}

/* =========================================================
   토성 리턴 패널 렌더링
   ========================================================= */
function renderSaturnReturnPanel(astroData) {
  const existing = document.getElementById("astroSaturnReturnPanel");
  if (existing) existing.remove();

  const data = calcSaturnReturns(astroData);
  if (!data) return;

  const { returns, natalSaturn, currentAge } = data;
  if (!returns.length) return;

  const THEMES = [
    '성인기의 시작 — 책임과 인생의 구조를 처음으로 다잡는 시기',
    '중년의 전환 — 그동안 쌓아온 것을 점검하고 새로운 안정을 다지는 시기',
    '인생 후반의 결실 — 지혜를 정리하고 마무리해가는 시기',
  ];

  const rowsHtml = returns.map((r, i) => {
    const isCur = Math.abs(currentAge - r.age) < 1;
    return `
      <div style="
        display:flex;justify-content:space-between;align-items:center;gap:12px;
        background:${isCur ? 'rgba(251,191,36,.12)' : 'rgba(255,255,255,.03)'};
        border:1px solid ${isCur ? 'rgba(251,191,36,.3)' : 'rgba(255,255,255,.06)'};
        border-radius:8px;padding:10px 14px;margin-bottom:6px;
      ">
        <div>
          <div style="font-size:12px;color:${isCur ? '#fbbf24' : '#e2e8f0'};font-weight:${isCur ? 700 : 600};">
            ${i + 1}차 토성 리턴${isCur ? ' <span style="font-size:10px;background:rgba(251,191,36,.25);border-radius:4px;padding:1px 5px;">현재</span>' : ''}
          </div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">${THEMES[i] || ''}</div>
        </div>
        <div style="text-align:right;white-space:nowrap;">
          <div style="font-size:13px;color:#fbbf24;font-weight:700;">만 ${r.age}세</div>
          <div style="font-size:11px;color:#64748b;">${r.year}년</div>
        </div>
      </div>
    `;
  }).join('');

  const panel = document.createElement('div');
  panel.id = 'astroSaturnReturnPanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <div style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(251,191,36,.2);border-radius:16px;padding:20px;
    ">
      <div style="font-size:12px;color:#fbbf24;letter-spacing:2px;margin-bottom:4px;">🪐 토성 리턴</div>
      <div style="font-size:11px;color:#475569;margin-bottom:14px;">
        트랜짓 토성이 나탈 토성(${natalSaturn.sign} ${natalSaturn.degree}°${natalSaturn.minute}' · ${natalSaturn.house}H) 위치로 돌아오는 시기
      </div>
      ${rowsHtml}
    </div>
  `;

  // 프로그레션 타임라인(달 → 태양 → 프로그레션 패널 순) 바로 아래 삽입
  const moonTimelinePanel = document.getElementById("astroMoonTimelinePanel");
  const sunTimelinePanel  = document.getElementById("astroTimelinePanel");
  const progPanel         = document.getElementById("astroProgPanel");
  const anchor = moonTimelinePanel || sunTimelinePanel || progPanel;
  if (anchor) anchor.after(panel);
}

/* =========================================================
   솔라리턴 적용 도시 선택 (기본값: 출생 도시)
   ========================================================= */
let _solarReturnCity = getScreenLocation('astro');

function filterSolarCityList(val) {
  const dropdown = _$('solarReturnCityDropdown');
  if (!dropdown) return;
  const q = val.trim().toLowerCase();
  const matched = Object.keys(CITY_COORDS).filter(c => c.toLowerCase().includes(q)).slice(0, 30);
  if (matched.length === 0 || q === '') { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = matched.map(c =>
    '<div onclick="selectSolarCity(\'' + c + '\')" style="padding:8px 12px;font-size:13px;color:#e2e8f0;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);" onmouseover="this.style.background=\'rgba(255,255,255,.08)\'" onmouseout="this.style.background=\'\'">' + c + '</div>'
  ).join('');
  dropdown.style.display = 'block';
}
function showSolarCityList() {
  const input = _$('solarReturnCityInput');
  if (input) filterSolarCityList(input.value);
}
function hideSolarCityList() {
  const d = _$('solarReturnCityDropdown');
  if (d) d.style.display = 'none';
}
function selectSolarCity(cityName) {
  _solarReturnCity = cityName;
  setScreenLocation('astro', cityName);
  hideSolarCityList();
  if (window.AstroResult) renderSolarReturnPanel(window.AstroResult);
}

/* =========================================================
   솔라리턴 패널 렌더링
   ========================================================= */
/* =========================================================
   솔라리턴 차트 1건(현재/다음) 렌더링 — 나탈 비교 그리드 + 에스펙트 아코디언
   ========================================================= */
function renderReturnChart(item, natal, angles, nodes, label, tag, opts) {
  const {
    accentColor = '#fde047',
    headerLabel = '솔라리턴',
    aspectTitle1 = '솔라리턴-솔라리턴 에스펙트',
    aspectTitle2 = '솔라리턴-나탈 에스펙트',
    aspectIcon1 = '☀️',
    aspectIcon2 = '🔗',
  } = opts || {};
  const PLANET_KR = {
    sun:"☀️ 태양", moon:"🌙 달", mercury:"☿ 수성", venus:"♀ 금성",
    mars:"♂ 화성", jupiter:"♃ 목성", saturn:"♄ 토성",
    uranus:"⛢ 천왕성", neptune:"♆ 해왕성", pluto:"♇ 명왕성"
  };

  const rowStyle = (changed) => `
    display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;align-items:center;
    background:${changed ? accentColor + '14' : 'rgba(255,255,255,.03)'};
    border:1px solid ${changed ? accentColor + '40' : 'rgba(255,255,255,.06)'};
    border-radius:8px;padding:7px 10px;margin-bottom:4px;
  `;

  const planetRowsHtml = Object.entries(PLANET_KR).map(([key, plabel]) => {
    const n = natal[key];
    const s = item.planets[key];
    if (!n || !s) return "";
    const changed = n.signIndex !== s.signIndex;
    return `
      <div style="${rowStyle(changed)}">
        <div style="color:#c4b5fd;font-size:11px;">${plabel}</div>
        <div>
          <div style="color:#94a3b8;font-size:11px;">${n.sign}</div>
          <div style="color:#64748b;font-size:10px;">${n.degree}°${n.minute}' · ${n.house}H</div>
        </div>
        <div>
          <div style="color:${changed ? accentColor : '#e2e8f0'};font-size:11px;font-weight:${changed ? 700 : 400};">
            ${s.sign}${changed ? ' ✦' : ''}
          </div>
          <div style="color:#64748b;font-size:10px;">${s.degree}°${s.minute}' · ${s.house}H</div>
        </div>
      </div>
    `;
  }).join("");

  function angleRow(icon, rowLabel, nObj, sObj, color) {
    const changed = !!(nObj && sObj && nObj.signIndex !== sObj.signIndex);
    const nH = nObj?.house != null ? ` · ${nObj.house}H` : '';
    const sH = sObj?.house != null ? ` · ${sObj.house}H` : '';
    return `
      <div style="${rowStyle(changed)}">
        <div style="color:${color};font-size:11px;">${icon} ${rowLabel}</div>
        <div>
          <div style="color:#94a3b8;font-size:11px;">${nObj ? nObj.sign : '-'}</div>
          <div style="color:#64748b;font-size:10px;">${nObj ? `${nObj.degree}°${nObj.minute}'${nH}` : ''}</div>
        </div>
        <div>
          <div style="color:${changed ? accentColor : '#e2e8f0'};font-size:11px;font-weight:${changed ? 700 : 400};">
            ${sObj ? sObj.sign : '-'}${changed ? ' ✦' : ''}
          </div>
          <div style="color:#64748b;font-size:10px;">${sObj ? `${sObj.degree}°${sObj.minute}'${sH}` : ''}</div>
        </div>
      </div>
    `;
  }

  const anglesHtml =
    angleRow('↑','ASC',   angles.asc,  item.angles.asc, '#fcd34d') +
    angleRow('⊕','MC',    angles.mc,   item.angles.mc,  '#fcd34d') +
    angleRow('☊','북노드', nodes.north, item.nodes.north, '#fcd34d') +
    angleRow('☋','릴리스', nodes.south, item.nodes.south, '#94a3b8');

  const pad2 = n => String(n).padStart(2, '0');
  const d = new Date(item.dateLocal);
  const dateStr = `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  const asc = item.angles.asc;

  const ageStr = item.age != null ? `만 ${item.age}세 · ` : '';

  return `
    <details style="margin-top:10px;background:rgba(255,255,255,.03);border:1px solid ${accentColor}26;border-radius:12px;padding:14px 16px;">
      <summary style="cursor:pointer;font-size:12px;color:${accentColor};letter-spacing:1px;">
        ${label}${tag ? ` <span style="font-size:10px;background:${accentColor}40;border-radius:4px;padding:1px 5px;">${tag}</span>` : ''}
        — ${ageStr}${dateStr} · ASC ${asc.sign} ${asc.degree}°${asc.minute}' — 클릭하여 펼치기
      </summary>
      <div style="margin-top:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px;padding:0 10px;">
          <div style="font-size:10px;color:#475569;">행성</div>
          <div style="font-size:10px;color:#475569;">나탈</div>
          <div style="font-size:10px;color:${accentColor};">${headerLabel} ✦변화</div>
        </div>
        ${planetRowsHtml}
        ${anglesHtml}
        ${renderAspectAccordion(item.aspectsFull, aspectTitle1, aspectIcon1, accentColor)}
        ${renderAspectAccordion(item.aspectsToNatal, aspectTitle2, aspectIcon2, accentColor)}
      </div>
    </details>
  `;
}

async function renderSolarReturnPanel(astroData) {
  const existing = document.getElementById("astroSolarReturnPanel");
  if (existing) existing.remove();

  const meta = astroData.meta;
  if (!meta?.birthDate || !meta?.birthTime || meta.lat == null || meta.lng == null) return;

  const cityName = _solarReturnCity || getCitySelectValue();
  const { lat: srLat, lng: srLng, utcOffset: srUtcOffset } = getCityCoords(cityName);

  const panel = document.createElement('div');
  panel.id = 'astroSolarReturnPanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <div style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(253,224,71,.2);border-radius:16px;padding:20px;
    ">
      <div style="font-size:12px;color:#fde047;letter-spacing:2px;margin-bottom:4px;">☀️ 솔라리턴</div>
      <div style="font-size:11px;color:#475569;margin-bottom:12px;">
        트랜짓 태양이 나탈 태양 위치로 돌아오는 시점의 어센던트
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:10px;color:#94a3b8;display:block;margin-bottom:4px;">솔라리턴에 적용할 도시</label>
        <div style="position:relative;">
          <input id="solarReturnCityInput" type="text" value="${cityName}" placeholder="도시 검색..." autocomplete="off"
            style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.07);color:#e2e8f0;font-size:13px;box-sizing:border-box;"
            oninput="filterSolarCityList(this.value)"
            onfocus="showSolarCityList()"
            onblur="setTimeout(hideSolarCityList,200)"
          />
          <div id="solarReturnCityDropdown" style="display:none;position:absolute;z-index:999;width:100%;max-height:200px;
            overflow-y:auto;background:#1e2340;border:1px solid rgba(255,255,255,.15);border-radius:8px;
            margin-top:2px;box-shadow:0 4px 20px rgba(0,0,0,.5);"></div>
        </div>
      </div>
      <div id="astroSolarReturnRows" style="font-size:12px;color:#94a3b8;">⏳ 솔라리턴 계산 중...</div>
    </div>
  `;

  // 토성 리턴 패널 바로 아래 삽입 (없으면 달 → 태양 타임라인 → 프로그레션 패널 순)
  const saturnPanel       = document.getElementById("astroSaturnReturnPanel");
  const moonTimelinePanel = document.getElementById("astroMoonTimelinePanel");
  const sunTimelinePanel  = document.getElementById("astroTimelinePanel");
  const progPanel         = document.getElementById("astroProgPanel");
  const anchor = saturnPanel || moonTimelinePanel || sunTimelinePanel || progPanel;
  if (anchor) anchor.after(panel);

  const rowsEl = panel.querySelector('#astroSolarReturnRows');
  try {
    const res = await fetch("/api/astro-extras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: 'solar-return',
        birthDate: meta.birthDate,
        birthTime: meta.birthTime,
        lat: meta.lat,
        lng: meta.lng,
        utcOffset: meta.utcOffset,
        srLat, srLng, srUtcOffset,
        natal: astroData.natal,
        angles: astroData.angles,
        nodes: astroData.nodes,
        houses: astroData.houses
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "솔라리턴 계산 오류");

    const srOpts = {
      accentColor: '#fde047',
      headerLabel: '솔라리턴',
      aspectTitle1: '솔라리턴-솔라리턴 에스펙트',
      aspectTitle2: '솔라리턴-나탈 에스펙트',
      aspectIcon1: '☀️',
      aspectIcon2: '🔗',
    };
    if (rowsEl) {
      rowsEl.innerHTML =
        renderReturnChart(data.current, astroData.natal, astroData.angles, astroData.nodes, '현재 솔라리턴', '현재', srOpts) +
        renderReturnChart(data.next,    astroData.natal, astroData.angles, astroData.nodes, '다음 솔라리턴', null, srOpts);
    }
  } catch (err) {
    console.warn("솔라리턴 계산 실패:", err.message);
    if (rowsEl) rowsEl.innerHTML = `<div style="font-size:12px;color:#fca5a5;">⚠️ 솔라리턴 계산 실패: ${err.message}</div>`;
  }

  // 솔라리턴 패널이 갱신되면 루나리턴 패널도 같은 도시 기준으로 다시 그림
  if (typeof renderLunarReturnPanel === 'function') renderLunarReturnPanel(astroData);
}

/* =========================================================
   루나리턴 패널 렌더링 (솔라리턴과 같은 적용 도시 사용, 별도 도시 선택기 없음)
   ========================================================= */
async function renderLunarReturnPanel(astroData) {
  const existing = document.getElementById("astroLunarReturnPanel");
  if (existing) existing.remove();

  const meta = astroData.meta;
  if (!meta?.birthDate || !meta?.birthTime || meta.lat == null || meta.lng == null) return;

  const cityName = _solarReturnCity || getCitySelectValue();
  const { lat: appLat, lng: appLng, utcOffset: appUtcOffset } = getCityCoords(cityName);

  const panel = document.createElement('div');
  panel.id = 'astroLunarReturnPanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <div style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(165,180,252,.2);border-radius:16px;padding:20px;
    ">
      <div style="font-size:12px;color:#a5b4fc;letter-spacing:2px;margin-bottom:4px;">🌙 루나리턴</div>
      <div style="font-size:11px;color:#475569;margin-bottom:12px;">
        트랜짓 달이 나탈 달 위치로 돌아오는 시점의 어센던트 (${cityName} 기준, 솔라리턴과 동일 도시)
      </div>
      <div id="astroLunarReturnRows" style="font-size:12px;color:#94a3b8;">⏳ 루나리턴 계산 중...</div>
    </div>
  `;

  // 솔라리턴 패널 바로 아래 삽입
  const solarPanel = document.getElementById("astroSolarReturnPanel");
  if (solarPanel) solarPanel.after(panel);
  else return;

  const rowsEl = panel.querySelector('#astroLunarReturnRows');
  try {
    const res = await fetch("/api/astro-extras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: 'lunar-return',
        birthDate: meta.birthDate,
        birthTime: meta.birthTime,
        lat: meta.lat,
        lng: meta.lng,
        utcOffset: meta.utcOffset,
        appLat, appLng, appUtcOffset,
        natal: astroData.natal,
        angles: astroData.angles,
        nodes: astroData.nodes,
        houses: astroData.houses
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "루나리턴 계산 오류");

    const lrOpts = {
      accentColor: '#a5b4fc',
      headerLabel: '루나리턴',
      aspectTitle1: '루나리턴-루나리턴 에스펙트',
      aspectTitle2: '루나리턴-나탈 에스펙트',
      aspectIcon1: '🌙',
      aspectIcon2: '🔗',
    };
    if (rowsEl) {
      rowsEl.innerHTML =
        renderReturnChart(data.current, astroData.natal, astroData.angles, astroData.nodes, '현재 루나리턴', '현재', lrOpts) +
        renderReturnChart(data.next,    astroData.natal, astroData.angles, astroData.nodes, '다음 루나리턴', null, lrOpts);
    }
  } catch (err) {
    console.warn("루나리턴 계산 실패:", err.message);
    if (rowsEl) rowsEl.innerHTML = `<div style="font-size:12px;color:#fca5a5;">⚠️ 루나리턴 계산 실패: ${err.message}</div>`;
  }

  // 루나리턴 패널이 갱신되면 신월/만월 캘린더 패널도 같은 도시 기준으로 다시 그림
  if (typeof renderMoonPhasesPanel === 'function') renderMoonPhasesPanel(astroData);
}

/* =========================================================
   2026 신월/만월 캘린더 패널 렌더링 (루나리턴과 같은 적용 도시 사용)
   ========================================================= */
const MOON_PHASE_TYPE_META = {
  newMoon:      { icon: '🌑', label: '신월', color: '#94a3b8' },
  fullMoon:     { icon: '🌕', label: '만월', color: '#fcd34d' },
  solarEclipse: { icon: '🌑', label: '일식', color: '#f87171' },
  lunarEclipse: { icon: '🌕', label: '월식', color: '#f87171' },
};

function renderMoonPhaseEventRow(ev, astroData, opts) {
  const meta = MOON_PHASE_TYPE_META[ev.type] || MOON_PHASE_TYPE_META.newMoon;
  const d = new Date(ev.dateLocal);
  const pad2 = n => String(n).padStart(2, '0');
  const dateStr = `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  const moon = ev.moon;

  const conjHtml = ev.conjunctions.length
    ? ev.conjunctions.map(c => `${c.point} ${c.degree}°${c.minute}'`).join(' · ')
    : `<span style="color:#475569;">-</span>`;

  return `
    <div style="
      background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);
      border-radius:10px;padding:10px 12px;margin-bottom:8px;
    ">
      <div style="display:grid;grid-template-columns:auto 1.3fr 1.4fr;gap:8px;align-items:center;font-size:12px;">
        <div style="color:${meta.color};font-weight:700;white-space:nowrap;">${meta.icon} ${dateStr}</div>
        <div style="color:#e2e8f0;">
          ${meta.label} · ${moon.sign} ${moon.degree}°${moon.minute}' <span style="color:#64748b;font-size:10px;">${moon.house}H</span>
        </div>
        <div style="color:#a5b4fc;font-size:11px;">${conjHtml}</div>
      </div>
      ${renderReturnChart(ev, astroData.natal, astroData.angles, astroData.nodes, dateStr, meta.label, opts)}
    </div>
  `;
}

async function renderMoonPhasesPanel(astroData) {
  const existing = document.getElementById("astroMoonPhasesPanel");
  if (existing) existing.remove();

  const meta = astroData.meta;
  if (!meta?.birthDate || !meta?.birthTime || meta.lat == null || meta.lng == null) return;

  const cityName = _solarReturnCity || getCitySelectValue();
  const { lat: appLat, lng: appLng, utcOffset: appUtcOffset } = getCityCoords(cityName);

  const panel = document.createElement('div');
  panel.id = 'astroMoonPhasesPanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <details style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(196,181,253,.2);border-radius:16px;padding:20px;
    ">
      <summary id="astroMoonPhasesTitle" style="cursor:pointer;font-size:12px;color:#c4b5fd;letter-spacing:2px;">
        🌑🌕 신월·만월 캘린더 — 클릭하여 펼치기
      </summary>
      <div style="margin-top:12px;">
        <div id="astroMoonPhasesDesc" style="font-size:11px;color:#475569;margin-bottom:12px;">
          신월/만월(및 일식/월식) — 나의 나탈 차트 기준 하우스 · 행성 애스펙트 (${cityName} 기준)
        </div>
        <div id="astroMoonPhasesRows" style="font-size:12px;color:#94a3b8;">⏳ 신월/만월 계산 중...</div>
      </div>
    </details>
  `;

  // 루나리턴 패널 바로 아래 삽입
  const lunarPanel = document.getElementById("astroLunarReturnPanel");
  if (lunarPanel) lunarPanel.after(panel);
  else return;

  const rowsEl = panel.querySelector('#astroMoonPhasesRows');
  try {
    const res = await fetch("/api/astro-extras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: 'moon-phases',
        natal: astroData.natal,
        angles: astroData.angles,
        nodes: astroData.nodes,
        houses: astroData.houses,
        appLat, appLng, appUtcOffset
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "신월/만월 계산 오류");

    const mpOpts = {
      accentColor: '#c4b5fd',
      headerLabel: '트랜짓',
      aspectTitle1: '트랜짓-트랜짓 에스펙트',
      aspectTitle2: '트랜짓-나탈 에스펙트',
      aspectIcon1: '🌑',
      aspectIcon2: '🔗',
    };

    const titleEl = panel.querySelector('#astroMoonPhasesTitle');
    const descEl  = panel.querySelector('#astroMoonPhasesDesc');
    if (titleEl) titleEl.textContent = `🌑🌕 ${data.year} 신월·만월 캘린더 — 클릭하여 펼치기`;
    if (descEl) descEl.textContent = `${data.year}년 신월/만월(및 일식/월식) ${data.events.length}회 — 나의 나탈 차트 기준 하우스 · 행성 애스펙트 (${cityName} 기준)`;

    if (rowsEl) {
      rowsEl.innerHTML = data.events.map(ev => renderMoonPhaseEventRow(ev, astroData, mpOpts)).join("");
    }
  } catch (err) {
    console.warn("신월/만월 계산 실패:", err.message);
    if (rowsEl) rowsEl.innerHTML = `<div style="font-size:12px;color:#fca5a5;">⚠️ 신월/만월 계산 실패: ${err.message}</div>`;
  }

  if (typeof renderTransitPanel === 'function') renderTransitPanel(astroData);
}

/* =========================================================
   트랜짓 차트 패널 렌더링
   ========================================================= */
let _transitCity = null;

function filterTransitCityList(val) {
  const dropdown = _$('transitCityDropdown');
  if (!dropdown) return;
  const q = val.trim().toLowerCase();
  const matched = Object.keys(CITY_COORDS).filter(c => c.toLowerCase().includes(q)).slice(0, 30);
  if (matched.length === 0 || q === '') { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = matched.map(c =>
    '<div onclick="selectTransitCity(\'' + c + '\')" style="padding:8px 12px;font-size:13px;color:#e2e8f0;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);" onmouseover="this.style.background=\'rgba(255,255,255,.08)\'" onmouseout="this.style.background=\'\'">' + c + '</div>'
  ).join('');
  dropdown.style.display = 'block';
}
function showTransitCityList() {
  const input = _$('transitCityInput');
  if (input) filterTransitCityList(input.value);
}
function hideTransitCityList() {
  const d = _$('transitCityDropdown');
  if (d) d.style.display = 'none';
}
function selectTransitCity(cityName) {
  _transitCity = cityName;
  const input = _$('transitCityInput');
  if (input) input.value = cityName;
  hideTransitCityList();
}

/* =========================================================
   오늘의 운세 현재 위치 도시 선택
   ========================================================= */
let _todayCity = getScreenLocation('today');

function filterTodayCityList(val) {
  const dropdown = _$('todayCityDropdown');
  if (!dropdown) return;
  const q = val.trim().toLowerCase();
  const matched = Object.keys(CITY_COORDS).filter(c => c.toLowerCase().includes(q)).slice(0, 30);
  if (matched.length === 0 || q === '') { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = matched.map(c =>
    '<div onclick="selectTodayCity(\'' + c + '\')" style="padding:8px 12px;font-size:13px;color:#e2e8f0;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);" onmouseover="this.style.background=\'rgba(255,255,255,.08)\'" onmouseout="this.style.background=\'\'">' + c + '</div>'
  ).join('');
  dropdown.style.display = 'block';
}
function showTodayCityList() {
  const input = _$('todayCityInput');
  if (input) filterTodayCityList(input.value);
}
function hideTodayCityList() {
  const d = _$('todayCityDropdown');
  if (d) d.style.display = 'none';
}
function selectTodayCity(cityName) {
  _todayCity = cityName;
  setScreenLocation('today', cityName);
  const input = _$('todayCityInput');
  if (input) input.value = cityName;
  hideTodayCityList();
  window.TodayResult = null;
}

async function renderTransitPanel(astroData) {
  const existing = document.getElementById('astroTransitPanel');
  if (existing) existing.remove();

  const meta = astroData.meta;
  if (!meta?.birthDate || !meta?.birthTime || meta.lat == null || meta.lng == null) return;

  const nowKST = new Date(Date.now() + 9 * 3600000);
  const defaultDate = nowKST.toISOString().slice(0, 10);
  const defaultTime = nowKST.toISOString().slice(11, 16);
  const cityName = _transitCity || getCitySelectValue();

  const panel = document.createElement('div');
  panel.id = 'astroTransitPanel';
  panel.style.cssText = 'margin-top:12px;';
  panel.innerHTML = `
    <div style="
      background:linear-gradient(135deg,rgba(10,15,40,.95),rgba(20,10,50,.90));
      border:1px solid rgba(52,211,153,.2);border-radius:16px;padding:20px;
    ">
      <div style="font-size:12px;color:#34d399;letter-spacing:2px;margin-bottom:4px;">🪐 트랜짓 차트</div>
      <div style="font-size:11px;color:#475569;margin-bottom:14px;">
        특정 날짜/시각의 트랜짓 행성을 나탈 차트와 바이휠 비교 — ASC/MC/하우스/애스펙트 완전 계산
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div>
          <label style="font-size:10px;color:#94a3b8;display:block;margin-bottom:4px;">트랜짓 날짜</label>
          <input id="transitDateInput" type="date" value="${defaultDate}"
            style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.07);color:#e2e8f0;font-size:13px;box-sizing:border-box;" />
        </div>
        <div>
          <label style="font-size:10px;color:#94a3b8;display:block;margin-bottom:4px;">트랜짓 시각</label>
          <input id="transitTimeInput" type="time" value="${defaultTime}"
            style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.07);color:#e2e8f0;font-size:13px;box-sizing:border-box;" />
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:10px;color:#94a3b8;display:block;margin-bottom:4px;">트랜짓 적용 도시</label>
        <div style="position:relative;">
          <input id="transitCityInput" type="text" value="${cityName}" placeholder="도시 검색..." autocomplete="off"
            style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.07);color:#e2e8f0;font-size:13px;box-sizing:border-box;"
            oninput="filterTransitCityList(this.value)"
            onfocus="showTransitCityList()"
            onblur="setTimeout(hideTransitCityList,200)"
          />
          <div id="transitCityDropdown" style="display:none;position:absolute;z-index:999;width:100%;max-height:200px;
            overflow-y:auto;background:#1e2340;border:1px solid rgba(255,255,255,.15);border-radius:8px;
            margin-top:2px;box-shadow:0 4px 20px rgba(0,0,0,.5);"></div>
        </div>
      </div>
      <button onclick="calcTransitChart()" style="
        background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.4);color:#34d399;
        border-radius:8px;padding:8px 18px;font-size:12px;cursor:pointer;margin-bottom:14px;letter-spacing:1px;
      ">🪐 트랜짓 차트 계산하기</button>
      <div id="astroTransitRows" style="font-size:12px;color:#94a3b8;">⏳ 트랜짓 계산 중...</div>
    </div>
  `;

  const moonPanel = document.getElementById('astroMoonPhasesPanel');
  if (moonPanel) moonPanel.after(panel);
  else return;

  await calcTransitChart();
}

async function calcTransitChart() {
  if (!window.AstroResult) return;
  const astroData = window.AstroResult;
  const meta = astroData.meta;
  const rowsEl = document.getElementById('astroTransitRows');

  const transitDate = _$('transitDateInput')?.value || '';
  const transitTime = _$('transitTimeInput')?.value || '00:00';
  const cityInputVal = _$('transitCityInput')?.value || getCitySelectValue();
  const { lat: appLat, lng: appLng, utcOffset: appUtcOffset } = getCityCoords(cityInputVal);

  if (!transitDate) {
    if (rowsEl) rowsEl.innerHTML = '<div style="font-size:12px;color:#fca5a5;">⚠️ 날짜를 입력해 주세요.</div>';
    return;
  }
  if (rowsEl) rowsEl.innerHTML = '⏳ 트랜짓 계산 중...';

  try {
    const res = await fetch('/api/astro-extras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'transit',
        transitDate,
        transitTime,
        appLat, appLng, appUtcOffset,
        natal: astroData.natal,
        angles: astroData.angles,
        nodes: astroData.nodes,
        houses: astroData.houses
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || '트랜짓 계산 오류');

    const trOpts = {
      accentColor: '#34d399',
      headerLabel: '트랜짓',
      aspectTitle1: '트랜짓-트랜짓 에스펙트',
      aspectTitle2: '트랜짓-나탈 에스펙트',
      aspectIcon1: '🪐',
      aspectIcon2: '🔗',
    };
    if (rowsEl) {
      rowsEl.innerHTML = renderReturnChart(data, astroData.natal, astroData.angles, astroData.nodes, '트랜짓 차트', '결과', trOpts);
    }
  } catch (err) {
    console.warn('트랜짓 계산 실패:', err.message);
    if (rowsEl) rowsEl.innerHTML = `<div style="font-size:12px;color:#fca5a5;">⚠️ 트랜짓 계산 실패: ${err.message}</div>`;
  }
}

/* =========================================================
   연간 운세 패널 (🔮 연간 운세 탭 — lifeGraphPanel에 렌더)
   ========================================================= */
function renderAnnualEventsPanel(astroData) {
  const container = document.getElementById('lifeGraphPanel');
  if (!container || !astroData?.meta) return;

  const curY = new Date().getFullYear();
  const opts = [];
  for (let y = curY - 1; y <= curY + 5; y++) {
    opts.push(`<option value="${y}"${y === curY ? ' selected' : ''}>${y}년</option>`);
  }

  container.innerHTML = `
    <style>
      #annualInputCard select#annualReportYear{appearance:none;-webkit-appearance:none;-moz-appearance:none;outline:none;}
      #annualInputCard select#annualReportYear::-ms-expand{display:none;}
    </style>
    <div style="padding:4px 0 16px;">
      <div id="annualInputCard" class="intro-card">
        <div class="intro-card-frame"></div>
        <span class="intro-card-corner tl"></span>
        <span class="intro-card-corner tr"></span>
        <span class="intro-card-corner bl"></span>
        <span class="intro-card-corner br"></span>
        <span class="intro-card-twinkle" style="top:36px;right:38px;"></span>
        <span class="intro-card-twinkle" style="top:86px;left:32px;background:#cdbef0;animation-delay:1s;"></span>

        <div class="intro-card-eyebrow">
          <span class="line"></span>
          <span class="label">연간 점성술 운세</span>
          <span class="line r"></span>
        </div>

        <p class="intro-card-headline">
          한 해 동안 별이 그려낼 흐름을 읽어,<br>당신의 삶에 닿는 언어로 들려드립니다.
        </p>

        <p class="intro-card-tags">
          한 해의 흐름<span class="dot">·</span>인생의 전환점<span class="dot">·</span>삶의 주기
        </p>

        <span class="intro-card-section-label">기준 연도</span>
        <div class="intro-card-section">
          <select id="annualReportYear" style="
            background:transparent;border:none;cursor:pointer;
            font-family:Georgia,serif;font-size:22px;font-weight:500;letter-spacing:.04em;
            color:#d8bd80;padding-right:20px;
            background-image:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23b39d63' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6l6 -6'/%3E%3C/svg%3E&quot;);
            background-repeat:no-repeat;background-position:right center;
          ">${opts.join('')}</select>
        </div>

        <button onclick="generateAnnualReport()" id="annualReportBtn" class="intro-card-cta">
          <span class="cta-sheen"></span>
          <span class="intro-card-cta-label">
            <img src="/img/loader-icon-star.png" width="18" height="18" style="object-fit:contain;display:block;">리포트 생성
          </span>
        </button>

        <div id="annualReportStatus" style="display:none;font-size:12px;color:#64748b;margin-top:14px;"></div>
      </div>
      <div id="annualReportResult" style="margin-top:16px;"></div>
    </div>
  `;
}

/* ─── 연간 리포트 프리미엄 로딩 오버레이 ───────────────────────────── */

function showAnnualLoader(numEvents) {
  const old = document.getElementById('annualLoader');
  if (old) old.remove();
  clearInterval(window._alProgressInterval);
  (window._alStepTimeouts || []).forEach(clearTimeout);
  window._alStepTimeouts = [];

  const ICONS = [
    '<img src="/img/loader-icon-star.png" width="32" height="32" style="object-fit:contain;display:block;">',
    '<div style="width:28px;height:28px;border-radius:50%;border:1.5px solid #D4AF37;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 35% 30%,rgba(212,175,55,.3),rgba(20,16,8,.5));"><span style="color:#f4d98a;font-size:14px;font-weight:700;line-height:1;">✓</span></div>',
    '<img src="/img/loader-icon-crescent.png" width="32" height="32" style="object-fit:contain;display:block;">',
    '<img src="/img/loader-icon-ring.png" width="32" height="32" style="object-fit:contain;display:block;">',
  ];
  const ICON_PLACEHOLDER = '';

  const STEPS = [
    '당신의 출생 차트 천체 위치 확인 중...',
    '프로펙션 및 트랜짓 주기 계산 완료',
    numEvents + '개의 주요 운명 전환점 분석 중...',
    '별의 언어를 삶의 조언으로 해석 중...',
  ];

  const stepsHtml = STEPS.map((txt, i) => {
    const on = i === 0;
    return '<div id="alStep' + i + '" style="display:flex;align-items:center;gap:14px;padding:10px 0;opacity:' + (on ? '1' : '.3') + ';transition:opacity .5s;">' +
      // 아직 도달하지 않은 단계는 아이콘도 미리 노출하지 않음(자리표시자만 표시), 활성화 시점에 JS로 채움
      '<div id="alStepIco' + i + '" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .5s;' + (on ? 'filter:drop-shadow(0 0 6px rgba(212,175,55,.5));' : 'filter:opacity(.4);') + '">' + (on ? ICONS[i] : ICON_PLACEHOLDER) + '</div>' +
      // 아직 도달하지 않은 단계는 문구를 미리 노출하지 않음(자리표시자만 표시), 활성화 시점에 JS로 채움
      '<span id="alStepTxt' + i + '" style="font-size:14px;font-weight:' + (on ? '600' : '400') + ';color:' + (on ? '#e8d9b0' : '#3a4a5a') + ';transition:all .5s;font-family:Helvetica Neue,sans-serif;letter-spacing:.01em;">' + (on ? txt : '') + '</span>' +
      '</div>';
  }).join('');

  const waxBtn =
    '<div id="alWaxBtn" style="width:100%;max-width:380px;margin:18px 0 0;border-radius:12px;overflow:hidden;display:flex;align-items:center;background:linear-gradient(135deg,#3b0f0f 0%,#6a1e1e 45%,#3b0f0f 100%);border:1px solid rgba(150,65,45,.4);box-shadow:0 4px 24px rgba(80,10,10,.5);">' +
    '<div style="width:72px;height:72px;border-right:1px solid rgba(150,65,45,.35);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
    '<img src="/img/loader-waxseal.png" width="58" height="58" style="object-fit:contain;display:block;">' +
    '</div>' +
    '<span style="flex:1;text-align:center;font-size:14.5px;font-weight:700;color:#D4AF37;letter-spacing:.06em;text-shadow:0 0 14px rgba(212,175,55,.4);font-family:Helvetica Neue,sans-serif;">깊은 지혜의 리포트 잠금 해제</span>' +
    '</div>';

  // ── 행성 궤도 [색, 글로우RGB, 반지름px, 공전초, 시작각, 크기px] ──
  // 300px 컨테이너 기준, 각 행성 div는 컨테이너 중심(top50%,left50%)에 배치
  const PL = [
    {col:'#D8D2C4',g:'216,210,196',r:165,d:26,a:15, s:18},
    {col:'#C89640',g:'200,150,64', r:137,d:44,a:138,s:17},
    {col:'#3A7FAA',g:'58,127,170', r:110,d:32,a:252,s:16},
    {col:'#C87844',g:'200,120,68', r:82, d:18,a:62, s:13},
    {col:'#4A8C72',g:'74,140,114', r:56, d:58,a:178,s:12},
  ];
  const orbitCss = PL.map((p,i)=>
    '@keyframes _oP'+i+'{from{transform:rotate('+p.a+'deg) translateX('+p.r+'px)}to{transform:rotate('+(p.a+360)+'deg) translateX('+p.r+'px)}}'
  ).join('');
  const orbitHtml = PL.map((p,i)=>{
    const h=p.s/2;
    return '<div style="position:absolute;top:50%;left:50%;width:'+p.s+'px;height:'+p.s+'px;'+
      'margin-top:-'+h+'px;margin-left:-'+h+'px;border-radius:50%;'+
      'background:radial-gradient(circle at 35% 30%,'+p.col+',rgba(10,8,30,.55));'+
      'box-shadow:0 0 5px rgba('+p.g+',.65),inset 0 1px 2px rgba(255,255,255,.25);'+
      'animation:_oP'+i+' '+p.d+'s linear infinite;will-change:transform;"></div>';
  }).join('');

  const loaderHtml =
    '<div id="annualLoader" style="position:fixed;inset:0;z-index:9999;background:#060310;display:flex;flex-direction:column;align-items:center;overflow:hidden;">' +

    '<style>' +
    orbitCss +
    '@keyframes _alGemP{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:.9;transform:scale(1.18)}}' +
    '@keyframes _alBS{from{background-position:200% center}to{background-position:-200% center}}' +
    '@keyframes _alWP{0%,100%{box-shadow:0 4px 20px rgba(80,10,10,.5)}50%{box-shadow:0 6px 34px rgba(140,30,30,.8),0 0 16px rgba(212,175,55,.12)}}' +
    '@keyframes _alFI{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}' +
    '.al-bf{background:linear-gradient(90deg,#b8942a 0%,#D4AF37 30%,#fff5c0 50%,#D4AF37 70%,#b8942a 100%);background-size:300% auto;animation:_alBS 2s linear infinite}' +
    '#alWaxBtn{animation:_alWP 3.5s ease-in-out infinite}' +
    '.al-bot{animation:_alFI .6s ease .25s both}' +
    '</style>' +

    '<div style="margin-top:16px;letter-spacing:.42em;font-size:9px;color:rgba(212,175,55,.5);text-transform:uppercase;font-family:Helvetica Neue,sans-serif;flex-shrink:0;">Annual Cosmos Report</div>' +

    // 아스트롤라베: 정적 이미지 + 그 위에 개별 행성 div (이미지 자체는 transform 없음)
    // 하단 텍스트 줄(al-bot, padding 22px + max-width:390px)과 가로 폭을 정확히 맞춤
    '<div style="flex-shrink:0;margin-top:10px;width:100%;padding:0 22px;box-sizing:border-box;">' +
    '<div style="position:relative;width:100%;max-width:390px;aspect-ratio:520/582;margin:0 auto;">' +
    '<img src="/img/astrolabe-loader.png" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;" alt=""/>' +
    '<div style="position:absolute;inset:0;pointer-events:none;">' + orbitHtml +
    '<div style="position:absolute;top:50%;left:50%;width:24px;height:24px;margin:-12px;border-radius:50%;background:radial-gradient(circle,rgba(255,240,200,.4),transparent);animation:_alGemP 3.5s ease-in-out infinite;"></div>' +
    '</div>' +
    '</div>' +
    '</div>' +

    // 하단 UI (정적, transform 없음)
    '<div class="al-bot" style="flex:1;padding:6px 22px 16px;display:flex;flex-direction:column;align-items:center;overflow:hidden;width:100%;">' +

    '<div style="width:100%;max-width:390px;margin-bottom:10px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:7px;align-items:center;">' +
    '<span id="alStatusText" style="font-size:11.5px;color:rgba(180,160,100,.8);font-style:italic;font-family:Helvetica Neue,sans-serif;">' + STEPS[0] + '</span>' +
    '<span id="alPct" style="font-size:11.5px;color:#D4AF37;font-weight:700;font-family:Helvetica Neue,sans-serif;letter-spacing:.06em;min-width:40px;text-align:right;">0%</span>' +
    '</div>' +
    '<div style="height:2px;background:rgba(255,255,255,.07);border-radius:1px;overflow:hidden;"><div id="alBarFill" class="al-bf" style="height:100%;width:0%;border-radius:1px;transition:width 1s cubic-bezier(.25,.46,.45,.94);"></div></div>' +
    '</div>' +

    '<div style="width:100%;max-width:390px;">' + stepsHtml + '</div>' +
    waxBtn +
    '<p style="font-size:10.5px;font-style:italic;color:rgba(160,140,90,.5);line-height:1.8;font-family:Georgia,serif;margin:12px 0 0;text-align:center;">"우주의 속삭임을 해독하여, 당신만의 삶의<br>길을 안내합니다. 잠시만 기다려 주세요."</p>' +
    '</div>' +
    '</div>';

  document.body.insertAdjacentHTML('beforeend', loaderHtml);

  // 진행률 (지수 감속 0→90%)
  let pct = 0;
  window._alProgressInterval = setInterval(() => {
    pct += (90 - pct) * 0.032 + Math.random() * 0.35;
    if (pct > 89.5) pct = 89.5;
    const barEl = document.getElementById('alBarFill');
    const pctEl = document.getElementById('alPct');
    if (barEl) barEl.style.width = pct.toFixed(1) + '%';
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
  }, 700);

  // 단계 순차 활성화
  const stepTimings = [0, 2800, 7500, 14000];
  stepTimings.forEach((t, i) => {
    const tid = setTimeout(() => {
      if (!document.getElementById('annualLoader')) return;
      // 이전 단계들은 그대로 유지(사라지지 않음) — 현재 단계만 강조
      const cur    = document.getElementById('alStep' + i);
      const curIco = document.getElementById('alStepIco' + i);
      const curTxt = document.getElementById('alStepTxt' + i);
      const stEl   = document.getElementById('alStatusText');
      if (cur)    cur.style.opacity = '1';
      if (curIco) { curIco.innerHTML = ICONS[i]; curIco.style.filter = 'drop-shadow(0 0 8px rgba(212,175,55,.6))'; }
      if (curTxt) { curTxt.textContent = STEPS[i]; curTxt.style.color = '#e8d9b0'; curTxt.style.fontWeight = '600'; }
      if (stEl)   stEl.textContent = STEPS[i];
    }, t);
    window._alStepTimeouts.push(tid);
  });
}

function hideAnnualLoader() {
  clearInterval(window._alProgressInterval);
  (window._alStepTimeouts || []).forEach(clearTimeout);
  window._alStepTimeouts = [];
  const barEl = document.getElementById('alBarFill');
  const pctEl = document.getElementById('alPct');
  if (barEl) { barEl.style.transition = 'width .45s ease'; barEl.style.width = '100%'; }
  if (pctEl) pctEl.textContent = '100%';
  setTimeout(() => {
    const loader = document.getElementById('annualLoader');
    if (!loader) return;
    loader.style.transition = 'opacity .6s ease';
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 650);
  }, 500);
}

/* ─── 연간 리포트 생성 ──────────────────────────────────────────────── */

function closeAnnualReport() {
  const resultEl  = document.getElementById('annualReportResult');
  const inputCard = document.getElementById('annualInputCard');
  if (resultEl)  resultEl.innerHTML = '';
  if (inputCard) inputCard.style.display = '';
}

async function generateAnnualReport() {
  if (!window.AstroResult) { alert('차트 계산 완료 후 사용 가능합니다.'); return; }

  const yearEl   = document.getElementById('annualReportYear');
  const statusEl = document.getElementById('annualReportStatus');
  const resultEl = document.getElementById('annualReportResult');
  const btn      = document.getElementById('annualReportBtn');
  if (!yearEl || !statusEl || !resultEl) return;

  const year      = parseInt(yearEl.value, 10);
  const astroData = window.AstroResult;
  const meta      = astroData.meta || {};

  if (btn) { btn.disabled = true; btn.style.opacity = '0.55'; }
  statusEl.style.display = 'none';
  resultEl.innerHTML     = '';

  let engineData;
  try {
    const engRes = await fetch('/api/annual-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meta:             astroData.meta,
        natal:            astroData.natal,
        angles:           astroData.angles,
        nodes:            astroData.nodes,
        houses:           astroData.houses,
        targetYear:       year,
        natalAspectsFull: astroData.natalAspectsFull,
        progAspectsFull:  astroData.progression?.aspectsFull,
      }),
    });
    engineData = await engRes.json();
    if (!engRes.ok || engineData.error) throw new Error(engineData.error || '이벤트 계산 실패');
  } catch (e) {
    statusEl.style.display = 'block';
    statusEl.textContent = '⚠️ 엔진 오류: ' + e.message;
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    return;
  }

  showAnnualLoader(engineData.events.filter(ev => ev.importance === 'major').length);

  try {
    const res = await fetch('/api/gemini-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engineData,
        meta: { name: meta.name || '', birthDate: meta.birthDate, gender: meta.gender },
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'AI 해석 오류');

    hideAnnualLoader();
    const userName = _$('name')?.value?.trim() || '';
    resultEl.innerHTML = _buildAnnualHTML(engineData, data.result || '', userName, meta);
    resultEl.querySelectorAll('script').forEach(s => {
      const ns = document.createElement('script');
      ns.textContent = s.textContent;
      document.body.appendChild(ns);
      s.remove();
    });
    const inputCard = document.getElementById('annualInputCard');
    if (inputCard) inputCard.style.display = 'none';
  } catch (err) {
    hideAnnualLoader();
    statusEl.style.display = 'block';
    statusEl.textContent = '⚠️ ' + err.message;
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

function _buildTimeline(events) {
  function parseMonth(when) {
    if (!when) return null;
    if (/^\d{4}$/.test(when)) return null;
    const rangeM = when.match(/(\d{2})~(\d{2})$/);
    if (rangeM) return (parseInt(rangeM[1]) + parseInt(rangeM[2])) / 2;
    const fullDate = when.match(/^\d{4}-(\d{2})-\d{2}$/);
    if (fullDate) return parseInt(fullDate[1]);
    const monthOnly = when.match(/^\d{4}-(\d{2})$/);
    if (monthOnly) return parseInt(monthOnly[1]);
    const qm = when.match(/Q([1-4])/i);
    if (qm) return [2, 5, 8, 11][parseInt(qm[1]) - 1];
    const rng = when.match(/(\d+)[~\-](\d+)월/);
    if (rng) return (parseInt(rng[1]) + parseInt(rng[2])) / 2;
    const sm = when.match(/(\d+)월/);
    if (sm) return parseInt(sm[1]);
    return null;
  }

  function toLeft(month) {
    return Math.min(93, Math.max(5, ((month - 0.5) / 12) * 100));
  }

  /* ── 이벤트 선택: major 우선, 최소 12% 간격 유지, 최대 6개 ── */
  const allTimed = events
    .filter(e => parseMonth(e.when) !== null)
    .map(e => ({ ...e, _m: parseMonth(e.when) }))
    .sort((a, b) => {
      // major 먼저, 같으면 월 순
      if (a.importance === 'major' && b.importance !== 'major') return -1;
      if (b.importance === 'major' && a.importance !== 'major') return 1;
      return a._m - b._m;
    });

  const MIN_GAP = 13; // % 단위 최소 간격
  const selected = [];
  const usedLefts = [];

  for (const e of allTimed) {
    const left = toLeft(e._m);
    const tooClose = usedLefts.some(l => Math.abs(l - left) < MIN_GAP);
    if (tooClose) continue;
    selected.push({ ...e, _left: left });
    usedLefts.push(left);
    if (selected.length >= 6) break;
  }

  // 렌더링 순서는 월 순으로
  selected.sort((a, b) => a._m - b._m);

  if (selected.length === 0) return '';

  const iconFor = e => {
    if (e.layer === 'lifecycle')      return '🌱';
    if (e.valence === 'double_edged') return '⚡';
    if (e.valence === 'supportive')   return '⭐';
    if (e.valence === 'challenging')  return '🔴';
    return '·';
  };

  // 월 레이블 간략화: "2026-03" → "3월", "2026-03-15" → "3/15"
  function shortWhen(when) {
    const fd = when.match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (fd) return `${parseInt(fd[1])}/${parseInt(fd[2])}`;
    const mo = when.match(/^\d{4}-(\d{2})$/);
    if (mo) return `${parseInt(mo[1])}월`;
    const rg = when.match(/(\d{2})~(\d{2})$/);
    if (rg) return `${parseInt(rg[1])}~${parseInt(rg[2])}월`;
    return when;
  }

  /* ── 핀 HTML ── */
  // 컨테이너 높이 240px, 축은 top:120px(50%)
  // up핀: top:0 ~ 120px, 라벨 위 / 점 아래
  // down핀: top:120px ~ 240px, 점 위 / 라벨 아래
  const AXIS = 120;

  const pinsHtml = selected.map((e, idx) => {
    const left    = e._left;
    const isMajor = e.importance === 'major';
    const isDE    = e.valence === 'double_edged';
    const isUp    = idx % 2 === 0;
    const dotSize = isMajor ? 18 : 11;
    const half    = dotSize / 2;

    const dotBg = (isMajor && isDE) ? 'radial-gradient(circle,#fff 30%,#b79cff)'
      : isMajor                     ? 'radial-gradient(circle,#fff,#e8c069)'
      : (e.layer === 'lifecycle')   ? 'transparent' : '#7e87ad';
    const dotShadow = (isMajor && isDE)
      ? '0 0 0 3px rgba(183,156,255,.25),0 0 18px rgba(183,156,255,.6)'
      : isMajor ? '0 0 0 3px rgba(232,192,105,.2),0 0 18px rgba(232,192,105,.6)' : 'none';
    const dotBorder = (e.layer === 'lifecycle' && !isMajor)
      ? '2px dashed rgba(183,156,255,.7)' : '2px solid #070a14';

    const shortF = (e.fact || '').length > 18 ? (e.fact || '').slice(0, 18) + '…' : (e.fact || '');

    // 점의 절대 위치: 축 위/아래 half px
    const dotTop = isUp ? AXIS - half : AXIS - half;

    // 라벨: up이면 점 위, down이면 점 아래
    // up: top=4, height → dot top까지 (= AXIS-half-4-4 = 103px), flex-end → 내용이 107px에 위치
    // down: top=dot bottom+6, height = 남은 공간, flex-start → 내용이 135px에 위치
    const labPosStyle = isUp
      ? `top:4px;height:${AXIS - half - 4 - 4}px;`
      : `top:${AXIS + half + 6}px;height:${240 - (AXIS + half + 6) - 4}px;`;

    return `
      <div style="position:absolute;left:${left}%;transform:translateX(-50%);top:0;width:90px;height:240px;">
        <!-- 라벨 -->
        <div style="position:absolute;${labPosStyle}left:0;right:0;
          display:flex;flex-direction:column;${isUp ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}
          align-items:center;text-align:center;gap:1px;">
          <span style="font-size:13px;line-height:1;">${iconFor(e)}</span>
          <b style="color:#f3f5ff;font-size:9px;display:block;line-height:1.2;">${shortWhen(e.when)}</b>
          <span style="font-size:9px;color:#aab2d6;line-height:1.2;">${shortF}</span>
        </div>
        <!-- 점 -->
        <div style="position:absolute;left:50%;top:${dotTop}px;transform:translateX(-50%);
          width:${dotSize}px;height:${dotSize}px;border-radius:50%;
          background:${dotBg};border:${dotBorder};box-shadow:${dotShadow};"></div>
      </div>`;
  }).join('');

  return `
    <div style="margin:24px 0 6px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <span style="font-size:11px;letter-spacing:3px;color:#7e87ad;font-weight:700;">YEAR TIMELINE</span>
      <span style="font-size:10px;color:#7e87ad;">⭐ 핵심 · 일반 · 미래</span>
    </div>
    <div style="position:relative;height:240px;overflow:hidden;border-radius:12px;">
      <!-- 축 -->
      <div style="position:absolute;left:0;right:0;top:${AXIS}px;height:2px;
        background:linear-gradient(90deg,transparent 2%,rgba(232,192,105,.55) 15%,rgba(183,156,255,.55) 80%,transparent 98%);"></div>
      <!-- Q 라벨 -->
      <div style="position:absolute;left:0;right:0;top:${AXIS + 10}px;
        display:grid;grid-template-columns:repeat(4,1fr);">
        ${['Q1','Q2','Q3','Q4'].map(q =>
          `<span style="font-size:10px;color:#475569;text-align:center;letter-spacing:1px;">${q}</span>`
        ).join('')}
      </div>
      <!-- 핀 -->
      ${pinsHtml}
    </div>`;
}

function _buildAnnualHTML(engineData, aiText, userName = '', meta = {}) {
  const { year, profection, events = [], background } = engineData;
  const did = 'adeck' + year; // 고유 컨테이너 ID 접두사

  /* ── AI 섹션 파싱 ── */
  const sections = {};
  for (const part of aiText.split(/\n(?=## )/)) {
    const m = part.match(/^## (.+)\n([\s\S]*)/);
    if (m) sections[m[1].trim()] = m[2].trim();
  }

  /* ── 유틸 ── */
  const V_KR = { supportive:'기회·상승', challenging:'도전·긴장', double_edged:'기회·전환', neutral:'안정기' };
  const V_COL = { supportive:'#dfba6b', challenging:'#e07a6b', double_edged:'#c8a860', neutral:'#9b8f74' };

  /* ── NASA 공개 이미지 — 로컬 /img/ 폴더 (퍼블릭 도메인, NASA Image Library 원본) ──
     같은 카테고리가 반복돼도 중복 느낌이 없도록 카테고리별 여러 변형을 두고 순환 사용 */
  const NASA_IMGS = {
    '목성':   [{ url:'/img/jupiter.jpg',  cap:'Jupiter · Hubble / NASA' },
               { url:'/img/jupiter2.jpg', cap:'Great Red Spot · Juno / NASA' }],
    '토성':   [{ url:'/img/saturn.jpg',   cap:'Saturn · Cassini / NASA' },
               { url:'/img/saturn2.jpg',  cap:'Saturn Portrait · Cassini / NASA' }],
    '화성':   [{ url:'/img/mars.jpg',     cap:'Mars · ESA / NASA' },
               { url:'/img/mars2.jpg',    cap:'Mars · Hubble / NASA' }],
    '금성':   [{ url:'/img/venus.jpg',    cap:'Venus · Magellan / NASA' },
               { url:'/img/venus2.jpg',   cap:'Venus Radar Map · Magellan / NASA' }],
    '수성':   [{ url:'/img/mercury.jpg',  cap:'Mercury · MESSENGER / NASA' },
               { url:'/img/mercury2.jpg', cap:'Mercury False Color · MESSENGER / NASA' }],
    '천왕성': [{ url:'/img/uranus.jpg',   cap:'Uranus · Voyager 2 / NASA' },
               { url:'/img/uranus2.jpg',  cap:'Uranus · Voyager 2 / NASA' }],
    '해왕성': [{ url:'/img/neptune.jpg',  cap:'Neptune · Voyager 2 / NASA' },
               { url:'/img/neptune2.jpg', cap:'Neptune · Voyager 2 / NASA' }],
    '명왕성': [{ url:'/img/pluto.jpg',    cap:'Pluto · New Horizons / NASA' },
               { url:'/img/pluto2.jpg',   cap:'Pluto True Color · New Horizons / NASA' }],
    '달':     [{ url:'/img/moon.jpg',     cap:'Moon · NASA' },
               { url:'/img/moon2.jpg',    cap:'Moonrise · NASA' }],
    '태양':   [{ url:'/img/sun.jpg',      cap:'Sun · SDO / NASA' },
               { url:'/img/sun2.jpg',     cap:'Solar Prominence · SDO / NASA' }],
    cosmos:   [{ url:'/img/cosmos.jpg',   cap:'Cosmos · NASA / WISE' },
               { url:'/img/cosmos2.jpg',  cap:'Hubble Deep Field · NASA' },
               { url:'/img/cosmos3.jpg',  cap:'Pillars of Creation · Hubble / NASA' }],
    nebula:   [{ url:'/img/nebula.jpg',   cap:'Nebula · Hubble / NASA' },
               { url:'/img/nebula2.jpg',  cap:'Eagle Nebula · NASA' },
               { url:'/img/nebula3.jpg',  cap:'Orion Nebula · Hubble / NASA' }],
    galaxy:   [{ url:'/img/galaxy.jpg',   cap:'Galaxy · NASA' },
               { url:'/img/galaxy2.jpg',  cap:'Andromeda Galaxy · NASA' },
               { url:'/img/galaxy3.jpg',  cap:'Spiral Galaxy · Hubble / NASA' }],
  };
  const _imgUseCount = {};
  function pickImg(key) {
    const variants = NASA_IMGS[key] || NASA_IMGS.cosmos;
    const i = _imgUseCount[key] || 0;
    _imgUseCount[key] = i + 1;
    return variants[i % variants.length];
  }

  function fmt(t) {
    if (!t) return '';
    return t
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f4ecd8;">$1</strong>')
      .split(/\n\n+/).map(p => `<p style="margin:0 0 12px;">${p.replace(/\n/g, '<br>')}</p>`).join('');
  }

  function sWhen(w) {
    if (!w) return '';
    const fd = w.match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (fd) return `${+fd[1]}월 ${+fd[2]}일`;
    const mo = w.match(/^\d{4}-(\d{2})$/);
    if (mo) return `${+mo[1]}월`;
    const rg = w.match(/(\d{2})~(\d{2})$/);
    if (rg) return `${+rg[1]}~${+rg[2]}월`;
    return w;
  }

  /* ── 큰 흐름: 첫 문장(쉬운 한 줄 결론) / 나머지(설명) 분리 ── */
  function splitTakeaway(text) {
    const m = (text || '').match(/^([^\n]+?[.!?])\s*([\s\S]*)$/);
    if (m) return { takeaway: m[1].trim(), body: m[2].trim() };
    return { takeaway: (text || '').trim(), body: '' };
  }

  /* ── "### 제목" 하위섹션 파싱(영역별 흐름의 직업/재물/관계 등) ── */
  function parseSubsections(text) {
    const out = [];
    if (!text) return out;
    for (const part of text.split(/\n(?=### )/)) {
      const m = part.match(/^### (.+)\n([\s\S]*)/);
      if (m) out.push({ title: m[1].trim(), body: m[2].trim() });
    }
    return out;
  }

  const flowText = sections['올해의 큰 흐름'] || '';
  const { takeaway, body: flowBody } = splitTakeaway(flowText);
  const domainSections = parseSubsections(sections['영역별 흐름'] || '');
  const depthText  = sections['당신이라는 사람'] || '';
  const focusText  = sections['주목할 포인트'] || '';
  const closingText = sections['마무리'] || '';

  /* ── 이벤트 개별 해석 파싱 (### E1, E2, ...) ── */
  const eventInterps = {};
  const interpSection = sections['이벤트 개별 해석'] || '';
  if (interpSection) {
    for (const part of interpSection.split(/\n(?=### E\d)/)) {
      const m = part.match(/^### E(\d+)\n?([\s\S]*)/);
      if (m) eventInterps[parseInt(m[1]) - 1] = m[2].trim();
    }
  }

  // 선별(중요도)과 화면 표시 순서(날짜순)를 분리 — gemini-events.js의 E번호와 동일한
  // 선별+정렬을 써야 카드와 해석이 어긋나지 않는다.
  const majorEvents = events.filter(e => e.importance === 'major').slice(0, 6)
    .sort((a, b) => (a.when || '').localeCompare(b.when || ''));

  const retroEvents = events.filter(e => e.technique?.includes('retrograde'));

  /* ── 챕터 전환 디바이더(풀와이드 사진) ── */
  function divider(key) {
    const img = pickImg(key);
    return `
    <div style="position:relative;height:190px;overflow:hidden;">
      <img src="${img.url}" alt="${img.cap}" style="width:100%;height:100%;object-fit:cover;display:block;"
        onerror="this.style.display='none'">
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,#0e0b1c 0%,transparent 22%,transparent 78%,#0e0b1c 100%);"></div>
      <div style="position:absolute;bottom:14px;left:24px;font-size:10px;letter-spacing:.12em;color:#dfba6b;">${img.cap.toUpperCase()}</div>
    </div>`;
  }

  /* ── 섹션 빌더들 ── */
  function sectionTitle(label) {
    return `<div style="font-size:11px;letter-spacing:.2em;color:#9b8f74;margin-bottom:22px;display:flex;align-items:center;gap:10px;">
      <span style="width:16px;height:1px;background:#c8a860;display:inline-block;"></span>${label}
    </div>`;
  }

  const coverImg = pickImg('nebula');
  const coverHtml = `
    <div style="position:relative;min-height:420px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;text-align:center;padding:0 24px 40px;overflow:hidden;">
      <img src="${coverImg.url}" alt="${coverImg.cap}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55;" onerror="this.style.display='none'">
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,11,28,.15) 0%,rgba(14,11,28,.6) 55%,rgba(14,11,28,.97) 100%);"></div>
      <div style="position:relative;z-index:1;">
        <div style="font-size:11px;letter-spacing:.3em;color:#c8a860;margin-bottom:14px;">${year} ANNUAL REPORT</div>
        <h1 style="font-size:clamp(20px,6vw,27px);font-weight:600;line-height:1.4;color:#f8f1dc;margin:0 0 14px;font-family:Georgia,serif;">
          ${userName ? userName + ' 님의' : '당신의'} ${year}년
        </h1>
        <div style="font-size:12.5px;color:#beb39a;">
          ${meta.birthDate || ''}${profection?.age != null ? ` · 만 ${profection.age}세` : ''}
        </div>
      </div>
    </div>`;

  const flowHtml = flowText ? `
    <div style="padding:48px 24px;">
      ${sectionTitle('CHAPTER 01 · 올해의 큰 흐름')}
      ${takeaway ? `<div style="font-size:20px;font-weight:600;color:#f6e9c1;line-height:1.55;margin-bottom:20px;">${takeaway}</div>` : ''}
      <div style="font-size:14px;font-weight:300;color:#beb39a;line-height:1.9;border-left:2px solid rgba(200,168,96,.4);padding-left:16px;">
        ${fmt(flowBody || flowText)}
      </div>
      <div style="display:flex;gap:8px;margin-top:22px;flex-wrap:wrap;">
        <span style="font-size:11px;padding:6px 12px;border:1px solid rgba(200,168,96,.3);border-radius:20px;color:#dfba6b;">만 ${profection.age}세 · ${profection.house}하우스 연도 · ${profection.theme}</span>
        <span style="font-size:11px;padding:6px 12px;border:1px solid rgba(200,168,96,.3);border-radius:20px;color:#dfba6b;">올해의 지배성 · ${profection.lord}</span>
      </div>
    </div>` : '';

  const eventsHtml = majorEvents.length ? `
    <div style="padding:48px 24px;">
      ${sectionTitle('CHAPTER 02 · 올해의 사건들')}
      ${majorEvents.map((e, i) => {
        const interp = eventInterps[i] || '';
        return `
        <div style="display:flex;gap:16px;padding:20px 0;border-bottom:1px solid rgba(200,168,96,.1);">
          <div style="flex:0 0 40px;font-size:12px;color:#dfba6b;font-weight:600;padding-top:3px;">${sWhen(e.when)}</div>
          <div style="flex:1;min-width:0;">
            <p style="font-size:13.5px;color:#beb39a;line-height:1.85;margin:0;">${interp || e.fact || ''}</p>
            <span style="display:inline-block;margin-top:8px;font-size:10.5px;color:${V_COL[e.valence]||'#9b8f74'};letter-spacing:.04em;">${V_KR[e.valence]||''}</span>
          </div>
        </div>`;
      }).join('')}
    </div>` : '';

  const domainsHtml = domainSections.length ? `
    <div style="padding:48px 24px;">
      ${sectionTitle('CHAPTER 03 · 영역별 흐름')}
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${domainSections.map(d => `
        <div style="background:rgba(200,168,96,.05);border:1px solid rgba(200,168,96,.18);border-radius:14px;padding:20px 18px;">
          <div style="font-size:13.5px;color:#f4ecd8;letter-spacing:.05em;margin-bottom:8px;font-weight:600;">${d.title}</div>
          <div style="font-size:13px;color:#beb39a;line-height:1.85;">${fmt(d.body)}</div>
        </div>`).join('')}
      </div>
    </div>` : '';

  const retroHtml = retroEvents.length ? `
    <div style="margin-top:32px;padding:18px 18px;border-radius:12px;background:rgba(200,168,96,.05);border:1px solid rgba(200,168,96,.2);">
      <div style="font-size:12.5px;color:#cdb98a;font-weight:600;margin-bottom:6px;">새 일보다 점검·재검토가 잘 맞는 시기</div>
      <div style="font-size:11.5px;color:#8a7f68;line-height:1.7;margin-bottom:14px;">이 구간엔 일이 더디게 풀리거나, 이미 정한 결정을 다시 들여다보게 되는 경우가 잦습니다. 새로 시작하기보다 마무리·점검·재정비에 쓰면 더 수월합니다.</div>
      ${retroEvents.map(e => `
        <div style="margin-bottom:10px;font-size:12px;color:#cdb98a;">
          <b style="color:#dfba6b;">${e.bodies[0]} 역행</b> <span style="color:#8a7f68;font-size:11.5px;">· ${sWhen(e.retroStart)} ~ ${sWhen(e.retroEnd)}</span>
        </div>`).join('')}
    </div>` : '';

  const depthHtml = depthText ? `
    <div style="padding:48px 24px;">
      ${sectionTitle('CHAPTER 04 · 당신이라는 사람')}
      <div style="font-size:13.5px;color:#beb39a;line-height:1.9;">${fmt(depthText)}</div>
      ${retroHtml}
    </div>` : '';

  const focusHtml = focusText ? `
    <div style="padding:48px 24px;">
      ${sectionTitle('CHAPTER 05 · 주목할 포인트')}
      <div style="font-size:13.5px;color:#cabfa0;line-height:1.9;">${fmt(focusText)}</div>
    </div>` : '';

  /* ── 마무리 ── */
  const closingImg = pickImg('cosmos');
  let closingHtml = '';
  if (closingText) {
    const lines = closingText.split('\n').map(l => l.trim()).filter(Boolean);
    const bulletLines = lines.filter(l => /^✓/.test(l));
    const quoteLines  = lines.filter(l => !/^✓/.test(l));
    const quoteHtml = quoteLines.map(l => l.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f4ecd8;">$1</strong>')).join('<br>');
    const bullets = bulletLines.map(l => {
      const m = l.match(/^✓\s*\[?([^\]:：]+)\]?\s*[:：]\s*(.*)/);
      return m ? { label: m[1].trim(), content: m[2].trim() } : { label:'', content: l.replace(/^✓\s*/, '') };
    });
    closingHtml = `
    <div style="position:relative;min-height:340px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:50px 26px;overflow:hidden;">
      <img src="${closingImg.url}" alt="${closingImg.cap}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.35;" onerror="this.style.display='none'">
      <div style="position:absolute;inset:0;background:rgba(14,11,28,.75);"></div>
      <div style="position:relative;z-index:1;">
        <div style="font-size:17px;font-style:italic;color:#f4ecd8;max-width:420px;margin:0 auto 30px;line-height:1.85;">${quoteHtml}</div>
        ${bullets.length ? `<div style="display:flex;flex-direction:column;gap:11px;align-items:flex-start;text-align:left;">
          ${bullets.map(b => `
          <div style="font-size:13px;color:#cabfa0;">✓ ${b.label ? `<strong style="color:#dfba6b;">${b.label}:</strong> ` : ''}${b.content}</div>`).join('')}
        </div>` : ''}
      </div>
    </div>`;
  }

  /* ── 전체 조립 (연속 스크롤, 슬라이드 페이징 없음) ── */
  return `
    <div id="${did}" style="max-width:480px;width:100%;margin:8px auto;background:#0e0b1c;border:1px solid rgba(200,168,96,.18);border-radius:20px;overflow:hidden;font-family:Georgia,serif;color:#efe8d6;line-height:1.7;box-shadow:0 24px 60px rgba(0,0,0,.6);">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;">
        <span style="font-size:9px;font-weight:700;letter-spacing:.2em;color:#dfba6b;">ANNUAL REPORT</span>
        <button onclick="closeAnnualReport()" title="닫기" style="width:22px;height:22px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:rgba(10,7,24,.9);color:#64748b;cursor:pointer;font-size:12px;">✕</button>
      </div>
      ${coverHtml}
      ${flowHtml}
      ${eventsHtml ? divider('galaxy') : ''}
      ${eventsHtml}
      ${domainsHtml ? divider('토성') : ''}
      ${domainsHtml}
      ${depthHtml ? divider('달') : ''}
      ${depthHtml}
      ${focusHtml}
      ${closingHtml}
    </div>`;
}

/* =========================================================
   오늘의 운세 — 행성 현황 렌더링
   ========================================================= */
function renderTodayPlanetPanel(todayData) {
  const panel     = _$("todayPlanetPanel");
  const dateLabel = _$("todayDateLabel");
  if (!panel) return;

  if (dateLabel) {
    const timeStr = todayData.currentTime ? ` ${todayData.currentTime}` : '';
    dateLabel.textContent = todayData.todayDate + timeStr + " KST 기준";
  }

  // 달의 위상 뱃지
  let moonPhaseEl = document.getElementById('todayMoonPhaseEl');
  if (!moonPhaseEl && dateLabel) {
    moonPhaseEl = document.createElement('div');
    moonPhaseEl.id = 'todayMoonPhaseEl';
    moonPhaseEl.style.cssText = 'margin:8px 0 12px;font-size:12px;padding:10px 14px;background:rgba(200,168,96,.06);border-radius:10px;border:1px solid rgba(200,168,96,.22);font-family:Georgia,serif;';
    dateLabel.after(moonPhaseEl);
  }
  if (moonPhaseEl && todayData.moonPhase) {
    const mp = todayData.moonPhase;
    moonPhaseEl.innerHTML =
      `${mp.phaseIcon} <span style="color:#dfba6b;font-weight:600;">${mp.phaseName}</span>` +
      `<span style="color:#7d7257;font-size:10px;margin-left:6px;">조도 ${mp.illumination}%</span>` +
      `<span style="color:#9b8f74;font-size:11px;margin-left:8px;">— ${mp.energy}</span>`;
  }

  // 프로그레션 태양/달 뱃지
  let progEl = document.getElementById('todayProgEl');
  if (!progEl && moonPhaseEl) {
    progEl = document.createElement('div');
    progEl.id = 'todayProgEl';
    progEl.style.cssText = 'margin-bottom:14px;font-size:11px;padding:10px 14px;background:rgba(200,168,96,.04);border-radius:10px;border:1px solid rgba(200,168,96,.16);display:flex;gap:16px;flex-wrap:wrap;font-family:Georgia,serif;';
    moonPhaseEl.after(progEl);
  }
  if (progEl && todayData.progression) {
    const pg = todayData.progression;
    progEl.innerHTML =
      `<span><span style="color:#c8a860;font-size:10px;">☀ 프로그 태양</span> <span style="color:#cabfa0;">${pg.sun.sign} ${pg.sun.degree}° · ${pg.sun.house}H</span></span>` +
      `<span><span style="color:#c8a860;font-size:10px;">🌙 프로그 달</span> <span style="color:#cabfa0;">${pg.moon.sign} ${pg.moon.degree}° · ${pg.moon.house}H</span></span>` +
      `<span><span style="color:#c8a860;font-size:10px;">☿ 프로그 수성</span> <span style="color:#cabfa0;">${pg.mercury.sign} ${pg.mercury.degree}° · ${pg.mercury.house}H</span></span>` +
      `<span><span style="color:#c8a860;font-size:10px;">♀ 프로그 금성</span> <span style="color:#cabfa0;">${pg.venus.sign} ${pg.venus.degree}° · ${pg.venus.house}H</span></span>` +
      `<span><span style="color:#c8a860;font-size:10px;">♂ 프로그 화성</span> <span style="color:#cabfa0;">${pg.mars.sign} ${pg.mars.degree}° · ${pg.mars.house}H</span></span>` +
      `<span><span style="color:#c8a860;font-size:10px;">↑ 프로그 ASC</span> <span style="color:#cabfa0;">${pg.asc.sign} ${pg.asc.degree}°</span></span>` +
      `<span><span style="color:#c8a860;font-size:10px;">⟂ 프로그 MC</span> <span style="color:#cabfa0;">${pg.mc.sign} ${pg.mc.degree}°</span></span>`;
  }

  panel.style.display = "block";

  // 트랜짓-나탈 에스펙트 (행성10 + ASC/MC + 북노드/릴리스 전체) — 아코디언
  {
    const existingTodayAspectPanel = document.getElementById('todayAspectPanel');
    if (existingTodayAspectPanel) existingTodayAspectPanel.remove();

    const aspectPanel = document.createElement('div');
    aspectPanel.id = 'todayAspectPanel';
    aspectPanel.innerHTML = renderAspectAccordion(
      todayData.todayAspectsFull, '트랜짓-나탈 에스펙트', '🌅', '#dfba6b'
    );
    panel.after(aspectPanel);
  }

  // 프로그레션 → 트랜짓 에스펙트 아코디언
  {
    const existing = document.getElementById('todayProgTransitAspectPanel');
    if (existing) existing.remove();

    const progAspPanel = document.createElement('div');
    progAspPanel.id = 'todayProgTransitAspectPanel';
    progAspPanel.innerHTML = renderAspectAccordion(
      todayData.progTransitAspects, '프로그레션→트랜짓 에스펙트', '🔭', '#c8a860'
    );
    const transitAspPanel = document.getElementById('todayAspectPanel');
    if (transitAspPanel) transitAspPanel.after(progAspPanel);
    else panel.after(progAspPanel);
  }
}

function closeTodayFortune() {
  const resultEl  = _$("todayResult");
  const inputCard = document.getElementById('todayInputCard');
  if (resultEl)  { resultEl.innerHTML = ''; resultEl.style.display = 'none'; }
  if (inputCard) inputCard.style.display = '';
  // 닫고 다시 열 때 도시를 바꿔서 새로 생성할 수 있도록, 캐시된 계산 결과를 비운다.
  window.TodayResult = null;
  window.TodayQuestionCount = 0;
}

/* =========================================================
   오늘의 운세 — AI 호출
   ========================================================= */
async function requestTodayFortune() {
  if (!window.SajuResult) {
    alert("생년월일과 출생시각을 먼저 입력해주세요.");
    return;
  }

  const btn      = _$("todayBtn");
  const loading  = _$("todayLoading");
  const resultEl = _$("todayResult");
  const errorEl  = _$("todayError");
  const statusEl = _$("todayCalcStatus");

  btn.disabled           = true;
  btn.style.opacity      = "0.5";
  loading.style.display  = "block";
  resultEl.style.display = "none";
  errorEl.style.display  = "none";

  try {
    // 캐시 없으면 오늘 트랜짓 계산
    if (!window.TodayResult) {
      if (statusEl) statusEl.textContent = "⏳ 오늘 행성 위치 계산 중...";

      const { name, gender, birthDate, birthTime } = window.SajuResult;
      const birthCityName = getCitySelectValue();
      const { lat, lng, utcOffset } = getCityCoords(birthCityName);
      const todayCityName = _todayCity || birthCityName;
      const { lat: appLat, lng: appLng, utcOffset: appUtcOffset } = getCityCoords(todayCityName);

      const calcRes = await fetch("/api/astro-today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate, birthTime, lat, lng, name, gender, utcOffset, appLat, appLng, appUtcOffset })
      });

      const todayData = await calcRes.json();
      if (!calcRes.ok || todayData.error) throw new Error(todayData.error || "오늘 운세 계산 오류");

      window.TodayResult = todayData;
      renderTodayPlanetPanel(todayData);

      if (statusEl) statusEl.textContent = "✅ 행성 위치 계산 완료";
    }

    // Gemini 호출
    if (statusEl) statusEl.innerHTML = "✨ 셀레스코드 고유 알고리즘을 토대로<br>AI가 오늘의 운세를 정밀하게 해석 중입니다...";

    const geminiRes = await fetch("/api/gemini-today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todayData: window.TodayResult })
    });

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok || geminiData.error) throw new Error(geminiData.error || "AI 분석 오류");

    const sectionsHtml = (geminiData.result || "")
      .split(/\n(?=## )/).filter(Boolean)
      .map((sec, i) => {
        const m     = sec.match(/^## (.+?)\n([\s\S]*)$/);
        const title = m ? m[1].trim() : '';
        let   body  = (m ? m[2] : sec).trim();

        // 첫 섹션("오늘의 전체 에너지")의 첫 문장 = 오늘의 한 줄 결론.
        // 별도로 떼어내 굵게 강조하고, 나머지는 본문으로 이어서 보여준다.
        let takeawayHtml = '';
        if (i === 0) {
          const tm = body.match(/^([^\n]+?[.!?])\s*([\s\S]*)$/);
          if (tm) {
            takeawayHtml = `<div style="font-size:16px;font-weight:600;color:#f6e9c1;line-height:1.55;margin-bottom:14px;font-family:Georgia,serif;">${tm[1]}</div>`;
            body = tm[2].trim();
          }
        }

        const bodyHtml = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p =>
          `<p style="margin:0 0 12px;">${p.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f4ecd8;">$1</strong>').replace(/\n/g, '<br>')}</p>`
        ).join('');
        return `
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:600;letter-spacing:.1em;color:#9b8f74;font-family:Georgia,serif;margin-bottom:10px;">— ${title}</div>
          ${takeawayHtml}
          <div style="font-size:13.5px;color:#beb39a;line-height:1.9;font-weight:300;">${bodyHtml}</div>
        </div>`;
      }).join('');

    window.TodayReadingResult = geminiData.result || "";

    resultEl.innerHTML = `
      <div style="border-top:1px solid rgba(200,168,96,.18);padding-top:18px;">
        ${sectionsHtml}
      </div>

      <!-- 질문 섹션 -->
      <div id="todayQuestionSection" style="margin-top:8px;border-top:1px solid rgba(200,168,96,.18);padding-top:16px;">
        <div style="font-size:11px;letter-spacing:.2em;color:#9b8f74;margin-bottom:10px;">추가 질문 (최대 3회)</div>
        <div style="display:flex;gap:8px;">
          <input id="todayQuestionInput" type="text" placeholder="오늘 운세에 대해 질문하세요..."
            style="flex:1;padding:11px 14px;border-radius:10px;border:1px solid rgba(200,168,96,.28);
            background:rgba(255,255,255,.035);color:#efe8d6;font-size:13px;font-family:inherit;outline:none;"
            onkeydown="if(event.key==='Enter')askTodayQuestion()"
          />
          <button onclick="askTodayQuestion()" style="
            background:linear-gradient(165deg,#f8edc6 0%,#e8cd86 38%,#caa44f 72%,#e4cd92 100%);
            color:#3a2b07;font-size:12.5px;font-weight:600;font-family:Georgia,serif;
            border:none;border-radius:8px;padding:0 16px;cursor:pointer;
          ">전송</button>
        </div>
        <div style="font-size:10.5px;color:#7d7257;margin-top:6px;" id="todayQuestionCount">남은 질문: 3회</div>
        <div id="todayQuestionResult" style="margin-top:12px;"></div>
      </div>

      <div style="margin-top:18px;text-align:center;">
        <button onclick="closeTodayFortune()" style="
          background:transparent;border:1px solid rgba(200,168,96,.3);
          color:#9b8f74;font-size:11px;border-radius:20px;padding:7px 18px;cursor:pointer;font-family:Georgia,serif;letter-spacing:.05em;
        ">✕ 닫기</button>
      </div>
    `;
    window.TodayQuestionCount = 0;
    resultEl.style.display = "block";
    if (statusEl) statusEl.textContent = "";

    const todayInputCard = document.getElementById('todayInputCard');
    if (todayInputCard) todayInputCard.style.display = 'none';

  } catch (err) {
    errorEl.textContent   = "⚠️ " + (err.message || "오늘 운세를 불러오지 못했습니다.");
    errorEl.style.display = "block";
    if (statusEl) statusEl.textContent = "";
  } finally {
    btn.disabled           = false;
    btn.style.opacity      = "1";
    loading.style.display  = "none";
  }
}

/* =========================================================
   Gemini AI 운세 호출 (사주)
   ========================================================= */
async function fetchAndInjectSajuAI() {
  if (!window.SajuResult) return false;

  const errorEl = _$("geminiError");
  const errorBox = _$("geminiSection");
  if (errorEl) errorEl.style.display = "none";
  if (errorBox) errorBox.style.display = "none";

  // 이전 해설 블록 제거 (재생성 대비)
  const SECTION_KEYS = ["essence", "talent", "resource", "yongsin", "daeun"];
  SECTION_KEYS.forEach(key => {
    const old = _$("aiBlock-" + key);
    if (old) old.remove();
  });

  try {
    const {
      name, gender, fourPillars,
      geok, strength, gods, interactions,
      resourceResult, personalityCard, shinsal,
      daeunTimeline, currentDecadeIdx
    } = window.SajuResult;

    const res = await fetch("/api/gemini-saju", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, gender, fourPillars,
        geok, strength, gods, interactions,
        resourceResult, personalityCard, shinsal,
        daeunTimeline, currentDecadeIdx
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "서버 오류가 발생했습니다.");

    // ── AI 응답을 ===SECTION:key=== 마커로 분리
    const raw = data.result || "";
    const markerRe = /===SECTION:(\w+)===/g;
    const hits = [];
    let m;
    while ((m = markerRe.exec(raw)) !== null) {
      hits.push({ key: m[1], contentStart: m.index + m[0].length, markerStart: m.index });
    }
    const sections = {};
    hits.forEach((hit, i) => {
      const end = i + 1 < hits.length ? hits[i + 1].markerStart : raw.length;
      sections[hit.key] = raw.slice(hit.contentStart, end).trim();
    });

    // ── 패널 바로 뒤에 해당 해설을 끼워넣기
    const ANCHOR_ID = {
      essence:  "shinsalPanel",
      talent:   "personalityCard",
      resource: "resourcePanel",
      yongsin:  "godsPanel",
      daeun:    "daeunPanel",
    };
    const EYEBROW = {
      essence:  "본질 해설",
      talent:   "재능 해설",
      resource: "재물 · 일 · 관계 해설",
      yongsin:  "용신 해설",
      daeun:    "대운 해설",
    };

    let insertedAny = false;
    SECTION_KEYS.forEach(key => {
      const text   = sections[key];
      const anchor = _$(ANCHOR_ID[key]);
      if (!text || !anchor) return;

      const bodyHtml = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p =>
        `<p style="margin:0 0 12px;">${p.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f4ecd8;">$1</strong>').replace(/\n/g, '<br>')}</p>`
      ).join('');

      const html = `
        <div id="aiBlock-${key}" style="position:relative;padding:16px 6px 24px 0;margin-bottom:4px;">
          <div style="font-size:10.5px;letter-spacing:.18em;color:#9b8f74;margin:0 0 8px 0;">— ${EYEBROW[key]}</div>
          <div style="font-size:13px;color:#beb39a;line-height:1.85;font-weight:300;">${bodyHtml}</div>
        </div>
      `;
      anchor.insertAdjacentHTML("afterend", html);
      insertedAny = true;
    });

    if (!insertedAny) throw new Error("AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.");

    return true;

  } catch (err) {
    if (errorBox) errorBox.style.display = "block";
    if (errorEl) {
      errorEl.textContent   = "⚠️ " + (err.message || "운세를 불러오지 못했습니다.");
      errorEl.style.display = "block";
    }
    return false;
  }
}


/* =========================================================
   오늘의 운세 추가 질문
   ========================================================= */
async function askTodayQuestion() {
  if ((window.TodayQuestionCount || 0) >= 3) {
    alert("질문은 최대 3회까지만 가능합니다.");
    return;
  }
  const input    = _$("todayQuestionInput");
  const resultEl = _$("todayQuestionResult");
  const countEl  = _$("todayQuestionCount");
  if (!input || !input.value.trim()) return;

  const question = input.value.trim();
  input.value = "";
  input.disabled = true;

  const qIdx = window.TodayQuestionCount || 0;
  resultEl.innerHTML += `
    <div style="margin-bottom:8px;padding:8px 12px;background:rgba(200,168,96,.06);border-radius:8px;font-size:12px;color:#dfba6b;">
      Q: ${question}
    </div>
    <div id="tqAnswer${qIdx}" style="margin-bottom:16px;font-size:13px;color:#beb39a;padding:0 4px;">
      <span style="color:#7d7257;">답변 생성 중...</span>
    </div>`;

  try {
    const res = await fetch("/api/gemini-today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        todayData: window.TodayResult,
        question,
        previousReading: window.TodayReadingResult
      })
    });
    const data   = await res.json();
    const answer = data.result || "답변을 가져오지 못했습니다.";
    const answerEl = document.getElementById(`tqAnswer${qIdx}`);
    if (answerEl) answerEl.innerHTML = answer.replace(/\n/g, "<br>");

    window.TodayQuestionCount = qIdx + 1;
    const remaining = 3 - window.TodayQuestionCount;
    if (countEl) countEl.textContent = remaining > 0 ? `남은 질문: ${remaining}회` : "질문 횟수를 모두 사용했습니다.";
    if (remaining === 0 && input) input.disabled = true;

  } catch(e) {
    const answerEl = document.getElementById(`tqAnswer${qIdx}`);
    if (answerEl) answerEl.textContent = "오류가 발생했습니다.";
  } finally {
    if ((window.TodayQuestionCount || 0) < 3) input.disabled = false;
  }
}

/* =========================================================
   점성술 AI 해석 호출
   계산은 이미 window.AstroResult에 있으므로 Gemini만 호출
   ========================================================= */
async function askAstroQuestion() {
  if ((window.AstroQuestionCount || 0) >= 3) {
    alert("질문은 최대 3회까지만 가능합니다.");
    return;
  }
  const input    = _$("astroQuestionInput");
  const resultEl = _$("astroQuestionResult");
  const countEl  = _$("astroQuestionCount");
  if (!input || !input.value.trim()) return;

  const question = input.value.trim();
  input.value = "";
  input.disabled = true;

  resultEl.innerHTML += `
    <div style="margin-bottom:8px;padding:8px 12px;background:rgba(255,255,255,.05);border-radius:8px;font-size:12px;color:#a5b4fc;">
      Q: ${question}
    </div>
    <div id="qAnswer${window.AstroQuestionCount}" style="margin-bottom:16px;font-size:13px;color:#cbd3f0;padding:0 4px;">
      <span style="color:#64748b;">답변 생성 중...</span>
    </div>`;

  try {
    const res = await fetch("/api/gemini-astro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        astroData: window.AstroResult,
        question,
        previousReading: window.AstroReadingResult
      })
    });
    const data = await res.json();
    const answer = data.result || "답변을 가져오지 못했습니다.";
    const answerEl = document.getElementById(`qAnswer${window.AstroQuestionCount}`);
    if (answerEl) answerEl.innerHTML = answer.replace(/\n/g,"<br>");

    window.AstroQuestionCount = (window.AstroQuestionCount || 0) + 1;
    const remaining = 3 - window.AstroQuestionCount;
    if (countEl) countEl.textContent = remaining > 0 ? `남은 질문: ${remaining}회` : "질문 횟수를 모두 사용했습니다.";
    if (remaining === 0 && input) input.disabled = true;

  } catch(e) {
    const answerEl = document.getElementById(`qAnswer${window.AstroQuestionCount}`);
    if (answerEl) answerEl.textContent = "오류가 발생했습니다.";
  } finally {
    if ((window.AstroQuestionCount || 0) < 3) input.disabled = false;
  }
}

async function requestAstroReading() {
  const btn      = _$("astroBtn");
  const loading  = _$("astroLoading");
  const resultEl = _$("astroResult");
  const errorEl  = _$("astroError");

  btn.disabled           = true;
  btn.style.opacity      = "0.5";
  loading.style.display  = "block";
  resultEl.style.display = "none";
  errorEl.style.display  = "none";

  try {
    // 캐시된 차트가 없으면 지금 계산
    if (!window.AstroResult) {
      if (!window.SajuResult) {
        throw new Error("생년월일과 출생시각을 먼저 입력해주세요.");
      }
      const loadingDiv = loading.querySelector("div");
      if (loadingDiv) loadingDiv.textContent = "🪐 행성 위치를 계산하고 있습니다...";

      const { name, gender, birthDate, birthTime } = window.SajuResult;
      const cityName = getCitySelectValue();
      const { lat, lng, utcOffset } = getCityCoords(cityName);

      const calcRes = await fetch("/api/astro-calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate, birthTime, lat, lng, name, gender, utcOffset })
      });

      const astroData = await calcRes.json();
      if (!calcRes.ok || astroData.error) throw new Error(astroData.error || "천문 계산 오류");

      window.AstroResult = astroData;
      renderAstroNatal(astroData);
    }

    // Gemini 해석
    const loadingDiv = loading.querySelector("div");
    if (loadingDiv) loadingDiv.innerHTML = "✨ 셀레스코드 고유 알고리즘을 토대로<br>AI가 점성술 차트를 정밀하게 해석 중입니다...";

    const geminiRes = await fetch("/api/gemini-astro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ astroData: window.AstroResult })
    });

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok || geminiData.error) throw new Error(geminiData.error || "AI 해석 오류");

    const formatted = (geminiData.result || "")
      .replace(/## (.+)/g, '<h3 style="color:#c4b5fd;margin:16px 0 8px;font-size:14px;">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#e2e8f0;'>$1</strong>")
      .replace(/\n/g, "<br>");

    // 리딩 결과 저장 (질문에 활용)
    window.AstroReadingResult = geminiData.result || "";

    resultEl.innerHTML = `
      <div style="font-size:13px;color:#cbd3f0;line-height:1.9;border-top:1px solid rgba(255,255,255,.08);padding-top:14px;">${formatted}</div>

      <!-- 질문 섹션 -->
      <div id="astroQuestionSection" style="margin-top:20px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px;">
        <div style="font-size:12px;color:#a5b4fc;letter-spacing:1px;margin-bottom:10px;">💬 추가 질문 (최대 3회)</div>
        <div style="display:flex;gap:8px;">
          <input id="astroQuestionInput" type="text" placeholder="질문을 입력하세요..."
            style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.07);color:#e2e8f0;font-size:13px;"
            onkeydown="if(event.key==='Enter')askAstroQuestion()"
          />
          <button onclick="askAstroQuestion()" style="
            background:linear-gradient(135deg,#7c3aed,#4f46e5);
            color:#fff;font-size:12px;font-weight:700;
            border:none;border-radius:8px;padding:8px 14px;cursor:pointer;
          ">전송</button>
        </div>
        <div style="font-size:10px;color:#475569;margin-top:4px;" id="astroQuestionCount">남은 질문: 3회</div>
        <div id="astroQuestionResult" style="margin-top:12px;"></div>
      </div>

      <div style="margin-top:12px;text-align:right;">
        <button onclick="requestAstroReading()" style="
          background:rgba(124,58,237,.2);border:1px solid rgba(124,58,237,.4);
          color:#c4b5fd;font-size:11px;border-radius:8px;padding:5px 12px;cursor:pointer;
        ">🔄 다시 보기</button>
      </div>
    `;
    window.AstroQuestionCount = 0;
    resultEl.style.display = "block";

  } catch (err) {
    errorEl.textContent   = "⚠️ " + (err.message || "점성술 리딩을 불러오지 못했습니다.");
    errorEl.style.display = "block";
  } finally {
    btn.disabled           = false;
    btn.style.opacity      = "1";
    loading.style.display  = "none";
  }
}

/* =========================================================
   이벤트 바인딩 및 초기화
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  try {
    setTabs();
    buildCitySelect();

    // 홈 화면 날짜 라벨
    const homeDateLabel = _$('homeDateLabel');
    if (homeDateLabel) {
      const now = new Date();
      homeDateLabel.textContent = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일`;
    }

    // birthCity 포함 — 모든 입력 필드 이벤트 바인딩
    ["name", "birthDate", "birthTime", "gender", "birthCity", "isLeapMonth"].forEach(id => {
      const el = _$(id);
      if (!el) return;
      el.addEventListener("input",  () => {
        runAll();
        if (["birthDate","birthTime","birthCity","gender","isLeapMonth"].includes(id)) { _invalidateAstroResult(); }
      });
      el.addEventListener("change", () => {
        runAll();
        if (["birthDate","birthTime","birthCity","gender","isLeapMonth"].includes(id)) { _invalidateAstroResult(); }
      });
    });

    // 활성 프로필이 있으면 사주 폼에 채워서 그대로 계산, 없으면 빈 상태로 둠
    if (hasProfile()) {
      syncFormFromProfile(getProfile());
      setCalendarType("solar"); // 내부적으로 runAll() 실행
    } else {
      runAll();
    }
    renderHomeProfileStatus();
  } catch (e) {
    console.error("앱 초기화 오류:", e);
    try { alert("초기화 중 오류가 발생했습니다: " + (e?.message || e)); } catch (_) {}
  }
});

console.log("✅ app.js 로드 완료");
