/* =====================================================================
   SOLAR SYSTEM
   ===================================================================== */
import { clamp, sstep } from '../util';
import { view, clock, ctx } from '../view';
import { LK, scale } from '../timeline';

type Planet = [orbit: number, radius: number, colours: [string, string, string], phase: number, speed: number];
const PLANETS: Planet[] = [
  [.10, .004, ['#e2dcd2', '#8d877e', '#2a2724'], 2.1, .16],
  [.15, .0068, ['#fff1d6', '#d9b27a', '#4a3519'], 4.0, .12],
  [.21, .0075, ['#cfe9ff', '#2f6fd6', '#081a45'], .62, .08],
  [.28, .005, ['#ffc9a8', '#c1552c', '#3a1408'], 5.2, .06],
  [.45, .022, ['#f5e2c4', '#c79a68', '#3b2a1a'], 3.1, .03],
  [.60, .018, ['#fbeec8', '#d8bd84', '#3f331e'], 1.25, .022],
  [.78, .011, ['#d8fbff', '#7ccfd9', '#173a40'], 4.6, .015],
  [.95, .011, ['#c8d6ff', '#3d63d9', '#0d1a4a'], 2.5, .011],
];
export const TILT = .42;
/** Earth's position in the solar plane this frame (used to light the globe). */
export const EARTH_W: [number, number] = [0, 0];

function planetPos(i: number): [number, number] {
  const p = PLANETS[i], a = p[3] + clock.time * p[4];
  return [p[0] * Math.cos(a), p[0] * Math.sin(a)];
}

export function drawSolar(L: number, globeA: number) {
  const a = sstep(LK.sun - .7, LK.sun + .45, L) * (1 - sstep(LK.earth + .25, LK.earth + 1.7, L));
  if (a <= 0) return;
  const { W, H, CX, CY, DPR, MAX } = view;
  const S = scale.KS * Math.exp(L);
  const ep = planetPos(2); EARTH_W[0] = ep[0]; EARTH_W[1] = ep[1];
  const e = sstep(LK.sys + .3, LK.earth - .08, L);
  const cwx = ep[0] * e, cwy = ep[1] * e;
  const toS = (x: number, y: number) => [CX + (x - cwx) * S, CY + (y - cwy) * S * TILT];
  const [sx, sy] = toS(0, 0);
  ctx.globalAlpha = a;
  // orbits
  ctx.strokeStyle = 'rgba(217,184,120,.22)'; ctx.lineWidth = DPR;
  for (const p of PLANETS) { const rr = p[0] * S; if (rr > 40 * MAX || rr < 1) continue; ctx.beginPath(); ctx.ellipse(sx, sy, rr, rr * TILT, 0, 0, Math.PI * 2); ctx.stroke(); }
  // sun
  ctx.globalCompositeOperation = 'lighter';
  const sr = .035 * S, gr = Math.max(sr * 4.5, 26 * DPR);
  if (sx + gr > 0 && sx - gr < W && sy + gr > 0 && sy - gr < H) {
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, gr);
    g.addColorStop(0, 'rgba(255,252,240,1)'); g.addColorStop(clamp(sr / gr, .02, .5), 'rgba(255,224,160,.9)'); g.addColorStop(.5, 'rgba(255,170,80,.13)'); g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g; ctx.fillRect(sx - gr, sy - gr, 2 * gr, 2 * gr);
  }
  ctx.globalCompositeOperation = 'source-over';
  // planets
  for (let i = 0; i < PLANETS.length; i++) {
    const p = PLANETS[i], w = planetPos(i), [x, y] = toS(w[0], w[1]);
    const pr = Math.max(1.3 * DPR, p[1] * S);
    if (x + pr * 3 < 0 || x - pr * 3 > W || y + pr * 3 < 0 || y - pr * 3 > H) continue;
    let pa = a; if (i === 2) pa *= (1 - globeA);
    if (pa <= 0) continue;
    ctx.globalAlpha = pa;
    const lx = sx - x, ly = sy - y, ll = Math.hypot(lx, ly) || 1;
    const g = ctx.createRadialGradient(x + lx / ll * pr * .45, y + ly / ll * pr * .45, pr * .05, x, y, pr * 1.02);
    g.addColorStop(0, p[2][0]); g.addColorStop(.55, p[2][1]); g.addColorStop(1, p[2][2]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2); ctx.fill();
    if (i === 5) { ctx.strokeStyle = 'rgba(230,210,160,.75)'; ctx.lineWidth = Math.max(DPR, pr * .22); ctx.beginPath(); ctx.ellipse(x, y, pr * 2.1, pr * 2.1 * TILT, -.12, 0, Math.PI * 2); ctx.stroke(); }
    if (i === 2) { const ag = ctx.createRadialGradient(x, y, pr, x, y, pr * 1.35); ag.addColorStop(0, 'rgba(110,170,255,.45)'); ag.addColorStop(1, 'rgba(110,170,255,0)'); ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(x, y, pr * 1.35, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}
