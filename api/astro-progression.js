/* =========================================================
   api/astro-progression.js  v1.0
   세컨더리 프로그레션 전용
   - 행성: 태양 실제 이동 기반 이분법 탐색
   - ASC/MC: Naibod key 방식 (네이탈 RAMC + 경과년수 × 0.9856°)
   공통 계산: astro-core.js
   ========================================================= */

import Ephemeris from 'ephemeris';
import {
  birthToUTC, calcJulianDay, extractPlanets,
  calcProgAnglesNaibod, assignHouses,
  calcAspectsProgToNatal, toSignInfo, PLANET_KEYS
} from './astro-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const { birthDate, birthTime, lat, lng, name, gender, utcOffset } = req.body;

    if (!birthDate || !birthTime || lat == null || lng == null)
      return res.status(400).json({ error: '생년월일, 출생시각, 출생지(위도/경도)가 필요합니다.' });

    // ── UTC 변환
    const { birthUTC, bY, bM, bD, bHr, offsetHours } =
      birthToUTC(birthDate, birthTime, utcOffset, lng);

    // ── 네이탈 태양 위치 (프로그레션 기준점)
    const natalRaw    = Ephemeris.getAllPlanets(birthUTC, lng, lat, 0);
    const natalPlanets = extractPlanets(natalRaw.observed);

    // ── 경과 년수
    const now      = new Date();
    const ageYears = (now.getTime() - birthUTC.getTime()) / (365.25 * 86400000);

    // ── 프로그레션 날짜 탐색 (태양 실제 이동 기반 이분법)
    const birthSunLon  = natalPlanets.sun.lon;
    const targetSunLon = ((birthSunLon + ageYears) % 360 + 360) % 360;

    let lo = new Date(birthUTC.getTime() + (ageYears - 3) * 86400000);
    let hi = new Date(birthUTC.getTime() + (ageYears + 3) * 86400000);
    for (let i = 0; i < 60; i++) {
      const mid    = new Date((lo.getTime() + hi.getTime()) / 2);
      const midRes = Ephemeris.getAllPlanets(mid, lng, lat, 0);
      const midSun = ((midRes.observed.sun.apparentLongitudeDd % 360) + 360) % 360;
      let diff = targetSunLon - midSun;
      if (diff > 180)  diff -= 360;
      if (diff < -180) diff += 360;
      if (diff > 0) lo = mid; else hi = mid;
    }
    const progUTC = new Date((lo.getTime() + hi.getTime()) / 2);

    // ── 프로그레션 행성 위치
    const progRaw     = Ephemeris.getAllPlanets(progUTC, lng, lat, 0);
    const progPlanets = extractPlanets(progRaw.observed);

    // ── 프로그레션 ASC/MC (Naibod key)
    const natalJD = calcJulianDay(bY, bM, bD, bHr);
    const { asc: progAsc, mc: progMc, houses: progHouses } =
      calcProgAnglesNaibod(natalJD, ageYears, lat, lng);

    const progPlanetsWithHouse  = assignHouses(progPlanets, progHouses);
    const progToNatalAspects    = calcAspectsProgToNatal(progPlanets, natalPlanets);

    // ── 응답 조립
    const progResult = {};
    PLANET_KEYS.forEach(k => {
      progResult[k] = {
        ...toSignInfo(progPlanetsWithHouse[k].lon),
        house: progPlanetsWithHouse[k].house
      };
    });

    return res.status(200).json({
      planets:        progResult,
      angles:         { asc: toSignInfo(progAsc), mc: toSignInfo(progMc) },
      houses:         progHouses.map((h, i) => ({ house: i + 1, ...toSignInfo(h) })),
      aspectsToNatal: progToNatalAspects,
      meta: {
        name:        name || '',
        gender:      gender || 'M',
        birthDate,   birthTime,
        lat,         lng,
        utcOffset:   offsetHours,
        progDate:    progUTC.toISOString().slice(0, 10),
        ageYears:    Math.round(ageYears * 100) / 100,
        method:      'Secondary Progression — Naibod key ASC/MC'
      }
    });

  } catch (error) {
    console.error('astro-progression error:', error);
    return res.status(500).json({ error: '프로그레션 계산 중 오류: ' + error.message });
  }
}
