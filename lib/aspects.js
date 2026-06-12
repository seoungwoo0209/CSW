/* =========================================================
   lib/aspects.js
   에스펙트 계산 전용
   나중에 orb 커스터마이징, 마이너 에스펙트 추가 가능
   ========================================================= */

import { norm360 } from './astro-core.js';

export const PLANET_KEYS = [
  'sun','moon','mercury','venus','mars',
  'jupiter','saturn','uranus','neptune','pluto'
];

export const PLANET_KR = {
  sun:'태양', moon:'달', mercury:'수성', venus:'금성', mars:'화성',
  jupiter:'목성', saturn:'토성', uranus:'천왕성', neptune:'해왕성', pluto:'명왕성'
};

export const ASPECT_DEFS = [
  { name:'합',     angle:  0, orb:8, symbol:'☌' },
  { name:'육합',   angle: 60, orb:4, symbol:'⚹' },
  { name:'삼합',   angle:120, orb:6, symbol:'△' },
  { name:'스퀘어', angle: 90, orb:6, symbol:'□' },
  { name:'충',     angle:180, orb:8, symbol:'☍' },
];

function angularDistance(a, b) {
  const diff = Math.abs(norm360(a) - norm360(b));
  return diff > 180 ? 360 - diff : diff;
}
function signedDiff(lonA, lonB) {
  let d = norm360(lonB) - norm360(lonA);
  if (d > 180) d -= 360; if (d < -180) d += 360;
  return d;
}
function makeAspect(p1, p2, dist) {
  for (const asp of ASPECT_DEFS) {
    if (Math.abs(dist - asp.angle) <= asp.orb) {
      const signed   = signedDiff(p1.lon, p2.lon);
      const applying = signed > 0 ? dist < asp.angle : dist > asp.angle;
      return { aspect:asp.name, symbol:asp.symbol,
               orb:Math.round(Math.abs(dist - asp.angle) * 10) / 10, applying };
    }
  }
  return null;
}

/* ── 네이탈 간 에스펙트 ── */
export function calcAspects(planets) {
  const aspects = [];
  for (let i = 0; i < PLANET_KEYS.length; i++) {
    for (let j = i + 1; j < PLANET_KEYS.length; j++) {
      const p1 = PLANET_KEYS[i], p2 = PLANET_KEYS[j];
      const dist = angularDistance(planets[p1].lon, planets[p2].lon);
      const asp  = makeAspect(planets[p1], planets[p2], dist);
      if (asp) aspects.push({ planet1:PLANET_KR[p1], planet2:PLANET_KR[p2], ...asp });
    }
  }
  return aspects;
}

/* ── 프로그레션 → 네이탈 에스펙트 ── */
export function calcAspectsProgToNatal(progPlanets, natalPlanets) {
  const aspects  = [];
  const progKeys = ['sun','moon','mercury','venus','mars'];
  for (const pk of progKeys) {
    for (const nk of PLANET_KEYS) {
      const dist = angularDistance(progPlanets[pk].lon, natalPlanets[nk].lon);
      const asp  = makeAspect(progPlanets[pk], natalPlanets[nk], dist);
      if (asp) aspects.push({
        progPlanet:`프로그레션 ${PLANET_KR[pk]}`,
        natalPlanet:`네이탈 ${PLANET_KR[nk]}`, ...asp
      });
    }
  }
  return aspects;
}

/* ── 트랜짓 → 네이탈 에스펙트 (나중에 사용) ── */
export function calcAspectsTransitToNatal(transitPlanets, natalPlanets) {
  const aspects = [];
  for (const tk of PLANET_KEYS) {
    for (const nk of PLANET_KEYS) {
      const dist = angularDistance(transitPlanets[tk].lon, natalPlanets[nk].lon);
      const asp  = makeAspect(transitPlanets[tk], natalPlanets[nk], dist);
      if (asp) aspects.push({
        transitPlanet:`트랜짓 ${PLANET_KR[tk]}`,
        natalPlanet:`네이탈 ${PLANET_KR[nk]}`, ...asp
      });
    }
  }
  return aspects;
}
