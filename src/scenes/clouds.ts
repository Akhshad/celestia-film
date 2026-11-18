/* =====================================================================
   CLOUDS: fly-through between Nagpur and the building
   ===================================================================== */
import { R, gauss, seed, mk, ctx2d, clamp, sstep } from '../util';
import { view, ctx } from '../view';

interface Cloud { x: number; y: number; z: number; s: number; a: number; k: number }
let CLOUDS: Cloud[] = [];
let CSPR: HTMLCanvasElement[] = [];
let CLOUDCV: HTMLCanvasElement | null = null, CLOUDCTX: CanvasRenderingContext2D | null = null;

export function buildClouds() {
  seed(5);
  CSPR = [];
  for (let s = 0; s < 6; s++) {
    const N = 512, c = mk(N, N), g = ctx2d(c);
    const puffs: [number, number, number][] = [];
    for (let i = 0; i < 70; i++) {
      const x = N / 2 + gauss() * 70, y = N / 2 + gauss() * 46;
      const dc = Math.hypot((x - N / 2) / 1.5, y - N / 2) / 150;
      if (dc > 1.05) continue;
      puffs.push([x, y, (16 + R() * 40) * (1.15 - dc * .6)]);
    }
    for (const [x, y, r] of puffs) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.55, 'rgba(255,255,255,.8)'); gr.addColorStop(.85, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-atop';
    for (const [x, y, r] of puffs) {
      const gr = g.createRadialGradient(x + r * .45, y + r * .55, 0, x + r * .45, y + r * .55, r * .9);
      gr.addColorStop(0, 'rgba(118,132,165,.42)'); gr.addColorStop(1, 'rgba(118,132,165,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x + r * .45, y + r * .55, r * .9, 0, Math.PI * 2); g.fill();
    }
    for (const [x, y, r] of puffs) {
      const gr = g.createRadialGradient(x - r * .3, y - r * .35, 0, x - r * .3, y - r * .35, r * .55);
      gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x - r * .3, y - r * .35, r * .55, 0, Math.PI * 2); g.fill();
    }
    CSPR.push(c);
  }
  CLOUDS = [];
  for (let i = 0; i < 38; i++) {
    const z = .06 + (i / 38) * .96 + (R() - .5) * .03;
    const centre = R() < .22;
    CLOUDS.push({ x: centre ? gauss() * .25 : (R() - .5) * 2.8, y: centre ? gauss() * .25 : (R() - .5) * 2.8, z, s: .7 + R() * 1.0, a: .65 + R() * .35, k: (R() * 6) | 0 });
  }
  CLOUDS.sort((a, b) => b.z - a.z);
}

/** @param warm3D true when the 3D golden-hour finale follows (tints the clouds). */
export function drawClouds(p: number, warm3D: boolean) {
  const { W, H, CX, CY, MAX } = view;
  const u = clamp((p - .675) / (.805 - .675), 0, 1);
  const camZ = u * 1.04;
  const gA = sstep(.675, .695, p) * (1 - sstep(.765, .80, p));
  if (gA <= 0) return;
  const night = 1 - sstep(.70, .735, p);
  // clouds are soft, so render them at half resolution to save fill-rate
  const cw = Math.max(2, W >> 1), ch = Math.max(2, H >> 1);
  if (!CLOUDCV || CLOUDCV.width !== cw || CLOUDCV.height !== ch) { CLOUDCV = mk(cw, ch); CLOUDCTX = ctx2d(CLOUDCV); }
  const g = CLOUDCTX!; g.clearRect(0, 0, cw, ch);
  let drawn = 0;
  for (const c of CLOUDS) {
    const dz = c.z - camZ; if (dz <= .004) continue;
    const k = .2 / dz;
    const sz = c.s * k * MAX;
    if (sz > 3.2 * MAX) continue;
    const x = CX + c.x * k * MAX * .5, y = CY + c.y * k * MAX * .5;
    if (x + sz / 2 < 0 || x - sz / 2 > W || y + sz / 2 < 0 || y - sz / 2 > H) continue;
    const a = gA * c.a * sstep(0, .09, dz) * (1 - sstep(.7, 1.05, dz)) * (1 - sstep(2.2 * MAX, 3.2 * MAX, sz));
    if (a <= 0) continue;
    g.globalAlpha = a * (1 - .35 * night);
    g.drawImage(CSPR[c.k], (x - sz / 2) / 2, (y - sz / 2) / 2, sz / 2, sz / 2);
    drawn++;
  }
  const warm = warm3D ? sstep(.70, .75, p) : 0;
  if (drawn && warm > 0) {
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `rgba(255,168,118,${(.32 * warm).toFixed(3)})`; g.fillRect(0, 0, cw, ch);
    g.globalCompositeOperation = 'source-over';
  }
  if (drawn) ctx.drawImage(CLOUDCV, 0, 0, W, H);
}
