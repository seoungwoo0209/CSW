/* =========================================================
   api/astro-natal.js  v1.0
   네이탈 차트 전용 — 행성 위치 + Placidus 하우스 + 에스펙트
   공통 계산: astro-core.js
   ========================================================= */

import Ephemeris from 'ephemeris';
import {
  birthToUTC, calcJulianDay, extractPlanets,
  calcHousesPlacidus, assignHouses,
  calcAspects, toSignInfo, PLANET_KEYS
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

    // ── 행성 위치
    const natalRaw = Ephemeris.getAllPlanets(birthUTC, lng, lat, 0);
    const planets  = extractPlanets(natalRaw.observed);

    // ── 하우스 (Placidus)
    const jd = calcJulianDay(bY, bM, bD, bHr);
    const { asc, mc, houses } = calcHousesPlacidus(jd, lat, lng);
    const planetsWithHouse    = assignHouses(planets, houses);

    // ── 에스펙트
    const natalAspects = calcAspects(planets);

    // ── 응답 조립
    const natalResult = {};
    PLANET_KEYS.forEach(k => {
      natalResult[k] = {
        ...toSignInfo(planetsWithHouse[k].lon),
        house: planetsWithHouse[k].house
      };
    });

    return res.status(200).json({
      natal:       natalResult,
      angles:      { asc: toSignInfo(asc), mc: toSignInfo(mc) },
      houses:      houses.map((h, i) => ({ house: i + 1, ...toSignInfo(h) })),
      natalAspects,
      meta: {
        name:        name || '',
        gender:      gender || 'M',
        birthDate,   birthTime,
        lat,         lng,
        utcOffset:   offsetHours,
        houseSystem: 'Placidus'
      }
    });

  } catch (error) {
    console.error('astro-natal error:', error);
    return res.status(500).json({ error: '네이탈 계산 중 오류: ' + error.message });
  }
}
