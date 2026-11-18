/* =====================================================================
   EARTH: dotted globe → India → Nagpur (orthographic projection)
   ===================================================================== */
import { D2R, clamp, lerp, sstep } from '../util';
import { view, clock, ctx } from '../view';
import { LK, rotAt, scale } from '../timeline';
import { layers, type Layer } from '../geo/layers';
import { INDIA, NAG, TOWNS } from '../geo/data';
import { SPR } from './sprites';
import { EARTH_W, TILT } from './solar';

/* brightness buckets → colour + size, so each bucket is one fillStyle */
const NB = 8; const BCOL: string[] = []; const BSZ: number[] = [];
for (let k = 0; k < NB; k++) {
  const t = (k + .5) / NB, u = Math.pow(t, 1.15);
  BCOL.push(`rgba(${Math.round(lerp(118, 255, u))},${Math.round(lerp(136, 216, u))},${Math.round(lerp(186, 152, u))},${(.5 + .5 * t).toFixed(2)})`);
  BSZ.push(.78 + .55 * t);
}

function drawDots(Ly: Layer, lam0: number, phi0: number, Rpx: number, alpha: number, size: number, limb: boolean) {
  if (alpha <= .002) return;
  const { W, H, CX, CY } = view;
  const sl0 = Math.sin(lam0 * D2R), cl0 = Math.cos(lam0 * D2R), sp0 = Math.sin(phi0 * D2R), cp0 = Math.cos(phi0 * D2R);
  const { n, sl, cl, sp, cp, b, px, py, pb } = Ly;
  const m = size * 2;
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    const cdl = cl[i] * cl0 + sl[i] * sl0;
    const cosc = sp0 * sp[i] + cp0 * cp[i] * cdl;
    if (cosc <= 0) { pb[i] = 255; continue; }
    const sdl = sl[i] * cl0 - cl[i] * sl0;
    const x = CX + Rpx * cp[i] * sdl, y = CY - Rpx * (cp0 * sp[i] - sp0 * cp[i] * cdl);
    if (x < -m || y < -m || x > W + m || y > H + m) { pb[i] = 255; continue; }
    let bb = b[i]; if (limb) bb *= .3 + .7 * Math.min(1, cosc * 1.7);
    px[i] = x; py[i] = y; pb[i] = Math.min(NB - 1, (bb * NB) | 0); cnt++;
  }
  if (!cnt) return;
  ctx.globalAlpha = alpha;
  for (let k = 0; k < NB; k++) {
    ctx.fillStyle = BCOL[k]; const s = size * BSZ[k], h = s / 2;
    for (let i = 0; i < n; i++) if (pb[i] === k) ctx.fillRect(px[i] - h, py[i] - h, s, s);
  }
  ctx.globalAlpha = 1;
}

function project(lon: number, lat: number, lam0: number, phi0: number, Rpx: number): [number, number, number] {
  const { CX, CY } = view;
  const l = lon * D2R, f = lat * D2R, l0 = lam0 * D2R, f0 = phi0 * D2R;
  const cosc = Math.sin(f0) * Math.sin(f) + Math.cos(f0) * Math.cos(f) * Math.cos(l - l0);
  return [CX + Rpx * Math.cos(f) * Math.sin(l - l0), CY - Rpx * (Math.cos(f0) * Math.sin(f) - Math.sin(f0) * Math.cos(f) * Math.cos(l - l0)), cosc];
}

export function drawEarth(L: number, p: number) {
  const ga = sstep(LK.earth - .06, LK.earth + .12, L) * (1 - sstep(.735, .755, p));
  if (ga <= 0) return 0;
  const { W, H, CX, CY, DPR, MIN, MAX } = view;
  const time = clock.time;
  const Rpx = scale.KE * Math.exp(L), z = Rpx / MIN;
  const [lam, phi] = rotAt(L);
  ctx.globalAlpha = ga;
  // light direction (towards the sun)
  let hx = -EARTH_W[0], hy = -EARTH_W[1] * TILT; const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
  if (Rpx < 2.2 * MAX) {
    const atA = 1 - sstep(.9, 2.2, z);
    if (atA > 0) {
      const ag = ctx.createRadialGradient(CX, CY, Rpx * .97, CX, CY, Rpx * 1.12);
      ag.addColorStop(0, `rgba(95,165,255,${(.5 * atA).toFixed(3)})`); ag.addColorStop(1, 'rgba(95,165,255,0)');
      ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(CX, CY, Rpx * 1.12, 0, Math.PI * 2); ctx.fill();
    }
    const og = ctx.createRadialGradient(CX, CY, 0, CX, CY, Rpx);
    og.addColorStop(0, '#0d2456'); og.addColorStop(.72, '#0a1b45'); og.addColorStop(1, '#050d27');
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(CX, CY, Rpx, 0, Math.PI * 2); ctx.fill();
    const hg = ctx.createRadialGradient(CX + hx * Rpx * .5, CY + hy * Rpx * .5, 0, CX + hx * Rpx * .5, CY + hy * Rpx * .5, Rpx * 1.1);
    hg.addColorStop(0, 'rgba(120,175,255,.16)'); hg.addColorStop(1, 'rgba(120,175,255,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(CX, CY, Rpx, 0, Math.PI * 2); ctx.fill();
  } else { ctx.fillStyle = '#0d2456'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 1;
  const a0 = 1 - sstep(1.3, 2.7, z);
  const a1 = sstep(.9, 1.7, z) * (1 - sstep(9, 16, z));
  const a2 = sstep(.65, 1.4, z) * (1 - sstep(12, 24, z));
  const a3 = sstep(6, 13, z);
  const sz0 = clamp(Rpx / (.36 * MIN), .45, 1.15) * 1.6 * DPR;
  drawDots(layers.LAY0, lam, phi, Rpx, a0 * ga, sz0, true);
  drawDots(layers.LAY1, lam, phi, Rpx, a1 * ga, 1.7 * DPR, true);
  // India fill + outline
  const oa = sstep(1.0, 1.8, z) * (1 - sstep(6, 11, z)) * ga;
  if (oa > 0) {
    ctx.beginPath();
    for (let i = 0; i < INDIA.length; i += 2) { const [x, y] = project(INDIA[i], INDIA[i + 1], lam, phi, Rpx); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath();
    ctx.globalAlpha = oa; ctx.fillStyle = 'rgba(217,184,120,.07)'; ctx.fill();
    ctx.strokeStyle = 'rgba(232,201,138,.6)'; ctx.lineWidth = 1.1 * DPR; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  drawDots(layers.LAY2, lam, phi, Rpx, a2 * ga, 2.0 * DPR, false);
  if (a3 > 0) drawNagpurRoads(lam, phi, Rpx, a3 * ga);
  drawDots(layers.LAY3, lam, phi, Rpx, a3 * ga, 2.2 * DPR, false);
  // Nagpur pin
  const pa = sstep(1.0, 1.6, z) * ga * (1 - sstep(.69, .72, p));
  if (pa > 0) {
    const [x, y, c] = project(NAG[0], NAG[1], lam, phi, Rpx);
    if (c > 0) {
      const big = 1 + Math.min(2.2, Math.max(0, Math.log(z / 2)) * .45);
      ctx.strokeStyle = 'rgba(232,201,138,1)'; ctx.lineWidth = 1.2 * DPR;
      for (let k = 0; k < 3; k++) {
        const ph = (time * .45 + k / 3) % 1;
        ctx.globalAlpha = pa * (1 - ph) * .85; ctx.beginPath(); ctx.arc(x, y, (5 + ph * 30) * DPR * big, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = pa; ctx.globalCompositeOperation = 'lighter';
      const gr = 14 * DPR * big; ctx.drawImage(SPR.gold, x - gr, y - gr, gr * 2, gr * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff4dc'; ctx.beginPath(); ctx.arc(x, y, 2.6 * DPR * big, 0, Math.PI * 2); ctx.fill();
      const la = pa * (1 - sstep(LK.nag - 1.9, LK.nag - 1.0, L));
      if (la > 0) {
        ctx.globalAlpha = la; ctx.fillStyle = '#f3ecdf';
        ctx.font = `500 ${11 * DPR}px Jost, Helvetica, Arial, sans-serif`;
        const spacing = 'letterSpacing' in ctx;
        if (spacing) ctx.letterSpacing = `${3 * DPR}px`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 6 * DPR;
        ctx.fillText('NAGPUR', x + 14 * DPR * big, y);
        ctx.shadowBlur = 0; if (spacing) ctx.letterSpacing = '0px';
      }
    }
  }
  ctx.globalAlpha = 1;
  return ga;
}

function drawNagpurRoads(lam: number, phi: number, Rpx: number, a: number) {
  const DPR = view.DPR;
  const ppd = Rpx * D2R;
  const [nx, ny] = project(NAG[0], NAG[1], lam, phi, Rpx);
  ctx.globalCompositeOperation = 'lighter';
  // city glow
  const cr = .26 * ppd;
  if (cr > 2) { ctx.globalAlpha = a * .55; ctx.drawImage(SPR.gold, nx - cr, ny - cr, cr * 2, cr * 2); }
  ctx.lineCap = 'round';
  for (let i = 0; i < TOWNS.length; i++) {
    const t = TOWNS[i];
    const [tx, ty] = project(t[0], t[1], lam, phi, Rpx);
    const mx = (nx + tx) / 2 + (ty - ny) * .06 * Math.sin(i * 2.1), my = (ny + ty) / 2 - (tx - nx) * .06 * Math.sin(i * 2.1);
    const g = ctx.createLinearGradient(nx, ny, tx, ty);
    g.addColorStop(0, 'rgba(255,214,150,.75)'); g.addColorStop(1, 'rgba(255,214,150,.18)');
    ctx.strokeStyle = g; ctx.globalAlpha = a * .55; ctx.lineWidth = 1.3 * DPR;
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
    const tr = Math.max(4 * DPR, (.05 + t[2] * .1) * ppd);
    ctx.globalAlpha = a * (.35 + t[2]); ctx.drawImage(SPR.gold, tx - tr, ty - tr, tr * 2, tr * 2);
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
