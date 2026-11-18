/* =====================================================================
   GALAXY + streaming background stars
   ===================================================================== */
import { R, gauss, seed, swapRng, newRng, mk, ctx2d, sstep } from '../util';
import { view, clock, ctx } from '../view';
import { SPR } from './sprites';

const GEXT = 1.15, GK = 0.24, GR0 = 0.07;
let GALTEX: HTMLCanvasElement, GALHAZE: HTMLCanvasElement, GN = 2048;
let gStars: { n: number; loc: number; x: Float32Array; y: Float32Array; b: Float32Array; c: Uint8Array };

/** Position of our Sun in galaxy units. */
const SUN_G = (() => { const r = 0.56, th = Math.log(r / GR0) / GK, a = th + Math.PI / 2 + 0.06; return [r * Math.cos(a), r * Math.sin(a)]; })();

function armXY(r: number, arm: number, spreadMul: number): [number, number] {
  const th = Math.log(r / GR0) / GK, a = th + arm * Math.PI / 2;
  const sp = (0.016 + 0.05 * r) * spreadMul;
  return [r * Math.cos(a) + gauss() * sp, r * Math.sin(a) + gauss() * sp];
}

export function buildGalaxy() {
  GN = view.SMALL ? 1280 : 2048;
  seed(7); GALTEX = paintGalaxy(true);
  seed(7); GALHAZE = paintGalaxy(false);
  buildGalaxyStars();
}

function paintGalaxy(withStars: boolean) {
  const c = mk(GN, GN), g = ctx2d(c), half = GN / 2, k = half / GEXT;
  const P = (x: number, y: number) => [half + x * k, half + y * k];
  // transparent background, so it can also sit over the 3D layer
  g.globalCompositeOperation = 'lighter';
  let gr = g.createRadialGradient(half, half, 0, half, half, k * 1.05);
  gr.addColorStop(0, 'rgba(150,140,190,.30)'); gr.addColorStop(.5, 'rgba(70,72,125,.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, GN, GN);
  const s = GN / 2048;
  // arm haze
  for (let arm = 0; arm < 4; arm++) {
    const major = arm % 2 === 0;
    for (let i = 0; i < (major ? 1100 : 650); i++) {
      const r = GR0 + (1.02 - GR0) * Math.pow(R(), 0.85);
      const [x, y] = armXY(r, arm, 1.1); const [px, py] = P(x, y);
      const sz = (26 + R() * 70) * s * (1.2 - r * .5);
      g.globalAlpha = (major ? .06 : .04) * (1.15 - r * .7);
      g.drawImage(R() < .25 ? SPR.white : SPR.blue, px - sz / 2, py - sz / 2, sz, sz);
    }
  }
  // stars (own RNG so both textures share identical haze/dust)
  const cols = ['rgba(205,220,255,', 'rgba(255,255,255,', 'rgba(255,226,190,'];
  const keep = swapRng(newRng(1234));
  for (let i = 0; withStars && i < (view.SMALL ? 42000 : 70000); i++) {
    let x: number, y: number, ci: number;
    const t = R();
    if (t < .58) { const arm = (R() * 4) | 0; const r = GR0 + (1.05 - GR0) * Math.pow(R(), .9); [x, y] = armXY(r, arm, arm % 2 ? 1.4 : 1); ci = R() < .7 ? 0 : 1; }
    else if (t < .86) { const r = -Math.log(1 - R() * .98) * .3; const a = R() * Math.PI * 2; x = r * Math.cos(a); y = r * Math.sin(a); ci = R() < .5 ? 1 : 2; }
    else { x = gauss() * .12; y = gauss() * .055; const ba = .5, cx = x * Math.cos(ba) - y * Math.sin(ba); y = x * Math.sin(ba) + y * Math.cos(ba); x = cx; ci = 2; }
    const [px, py] = P(x, y); const b = .25 + R() * .75; const sz = (R() < .03 ? 2.2 : 1.1) * Math.max(1, s * 1.2);
    g.globalAlpha = 1; g.fillStyle = cols[ci] + (b * .9).toFixed(2) + ')'; g.fillRect(px, py, sz, sz);
  }
  swapRng(keep);
  // pink star-forming regions
  for (let i = 0; i < 260; i++) {
    const arm = (R() * 2 | 0) * 2; const r = .2 + R() * .8; const [x, y] = armXY(r, arm, .7); const [px, py] = P(x, y);
    const sz = (4 + R() * 10) * s; g.globalAlpha = .16 + R() * .16; g.drawImage(SPR.pink, px - sz / 2, py - sz / 2, sz, sz);
  }
  // bulge + bar
  g.globalAlpha = 1;
  g.save(); g.translate(half, half); g.rotate(.5); g.scale(1, .55);
  gr = g.createRadialGradient(0, 0, 0, 0, 0, k * .42);
  gr.addColorStop(0, 'rgba(255,244,222,1)'); gr.addColorStop(.12, 'rgba(255,222,170,.85)'); gr.addColorStop(.35, 'rgba(255,190,130,.28)'); gr.addColorStop(1, 'rgba(255,170,110,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, k * .42, 0, Math.PI * 2); g.fill(); g.restore();
  gr = g.createRadialGradient(half, half, 0, half, half, k * .2);
  gr.addColorStop(0, 'rgba(255,250,235,.9)'); gr.addColorStop(1, 'rgba(255,230,190,0)');
  g.fillStyle = gr; g.fillRect(half - k * .2, half - k * .2, k * .4, k * .4);
  // dust lanes
  g.globalCompositeOperation = 'source-over';
  for (let arm = 0; arm < 4; arm++) {
    for (let i = 0; i < (arm % 2 ? 500 : 900); i++) {
      const r = .1 + .9 * Math.pow(R(), .9);
      const th = Math.log(r / GR0) / GK, a = th + arm * Math.PI / 2 - .22;
      const sp = .012 + .02 * r;
      const x = r * Math.cos(a) + gauss() * sp, y = r * Math.sin(a) + gauss() * sp; const [px, py] = P(x, y);
      const sz = (10 + R() * 26) * s; g.globalAlpha = .16; g.drawImage(SPR.dark, px - sz / 2, py - sz / 2, sz, sz);
    }
  }
  g.globalAlpha = 1;
  return c;
}

function buildGalaxyStars() {
  seed(77);
  const N = view.SMALL ? 3600 : 6500, NL = 700, T = N + NL;
  gStars = { n: T, loc: N, x: new Float32Array(T), y: new Float32Array(T), b: new Float32Array(T), c: new Uint8Array(T) };
  for (let i = 0; i < T; i++) {
    let x: number, y: number;
    if (i < N) {
      if (R() < .65) { const r = GR0 + (1.05 - GR0) * Math.pow(R(), .9); [x, y] = armXY(r, (R() * 4) | 0, 1.2); }
      else { const r = -Math.log(1 - R() * .98) * .28; const a = R() * Math.PI * 2; x = r * Math.cos(a); y = r * Math.sin(a); }
    } else { x = SUN_G[0] + gauss() * .045; y = SUN_G[1] + gauss() * .045; }
    gStars.x[i] = x; gStars.y[i] = y; gStars.b[i] = .3 + Math.pow(R(), 2.2) * .7; gStars.c[i] = R() < .55 ? 0 : R() < .7 ? 1 : 2;
  }
}

/* background stars (stream outward as we zoom) */
let BG: { n: number; x: Float32Array; y: Float32Array; z: Float32Array; b: Float32Array };
export function buildBG() {
  seed(99); const n = view.SMALL ? 450 : 750;
  BG = { n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), b: new Float32Array(n) };
  for (let i = 0; i < n; i++) { BG.x[i] = (R() - .5) * 9; BG.y[i] = (R() - .5) * 9; BG.z[i] = R(); BG.b[i] = .3 + R() * .7; }
}

export function drawBG(L: number, alpha: number) {
  if (alpha <= 0) return;
  const { W, H, CX, CY, MAX, DPR } = view;
  const zo = (L * .16) % 1;
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff';
  for (let i = 0; i < BG.n; i++) {
    let z = BG.z[i] - zo; if (z <= 0) z += 1;
    const k = .085 / (.03 + z);
    const x = CX + BG.x[i] * k * MAX * .5, y = CY + BG.y[i] * k * MAX * .5;
    if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
    const s = (.7 + (1 - z) * 1.3) * DPR;
    ctx.globalAlpha = alpha * BG.b[i] * (1 - sstep(.8, 1, z)) * .85;
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

function galaxyMatrix() {
  const spin = clock.time * .006;
  const va = view.PORTRAIT ? 1.12 : -.42, ti = view.PORTRAIT ? .56 : .46;
  const cs = Math.cos(spin), ss = Math.sin(spin), cv = Math.cos(va), sv = Math.sin(va);
  // M = Rv * T * Rs
  const a = cs, b = -ss, c = ss * ti, d = cs * ti;
  return [cv * a - sv * c, cv * b - sv * d, sv * a + cv * c, sv * b + cv * d];
}

export function drawGalaxy(L: number) {
  const texA = 1 - sstep(2.9, 5.0, L), starA = 1 - sstep(4.6, 6.6, L), fineA = 1 - sstep(.25, 1.0, L), locA = sstep(1.2, 2.6, L);
  if (texA <= 0 && starA <= 0) return;
  const { W, H, CX, CY, DPR, PORTRAIT } = view;
  const time = clock.time;
  const S0 = PORTRAIT ? .62 * H : .58 * W;
  const S = S0 * Math.exp(L);
  const M = galaxyMatrix();
  const e = sstep(.15, 2.8, L);
  const fx = SUN_G[0] * e, fy = SUN_G[1] * e;
  const tx = CX - S * (M[0] * fx + M[1] * fy), ty = CY - S * (M[2] * fx + M[3] * fy);
  if (texA > 0) {
    const A = 2 * GEXT / GN, SA = S * A;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = texA;
    ctx.setTransform(SA * M[0], SA * M[2], SA * M[1], SA * M[3], tx + S * (M[0] * -GEXT + M[1] * -GEXT), ty + S * (M[2] * -GEXT + M[3] * -GEXT));
    if (fineA > 0) { ctx.globalAlpha = texA * fineA; ctx.drawImage(GALTEX, 0, 0); }
    if (fineA < 1) { ctx.globalAlpha = texA * (1 - fineA); ctx.drawImage(GALHAZE, 0, 0); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (starA > 0) {
    ctx.globalCompositeOperation = 'lighter';
    const fills = ['#d4e2ff', '#ffffff', '#ffe4c2'];
    for (let col = 0; col < 3; col++) {
      ctx.fillStyle = fills[col];
      for (let i = 0; i < gStars.n; i++) {
        if (gStars.c[i] !== col) continue;
        const la = i >= gStars.loc ? locA : 1; if (la <= 0) continue;
        const gx = gStars.x[i], gy = gStars.y[i];
        const x = tx + S * (M[0] * gx + M[1] * gy), y = ty + S * (M[2] * gx + M[3] * gy);
        if (x < -3 || y < -3 || x > W + 3 || y > H + 3) continue;
        const s = (.7 + gStars.b[i] * 1.5) * DPR;
        ctx.globalAlpha = starA * gStars.b[i] * la * (.55 + .45 * (1 - fineA));
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
  }
  // our sun + marker
  const sx = tx + S * (M[0] * SUN_G[0] + M[1] * SUN_G[1]), sy = ty + S * (M[2] * SUN_G[0] + M[3] * SUN_G[1]);
  const sunA = sstep(.4, 1.3, L) * (1 - sstep(5.6, 6.6, L));
  if (sunA > 0) {
    const r = (10 + Math.max(0, L - 2) * 9) * DPR;
    ctx.globalAlpha = sunA; ctx.drawImage(SPR.gold, sx - r, sy - r, 2 * r, 2 * r);
    ctx.drawImage(SPR.white, sx - r * .25, sy - r * .25, r * .5, r * .5);
  }
  ctx.globalCompositeOperation = 'source-over';
  const ringA = sstep(.6, 1.4, L) * (1 - sstep(2.8, 3.7, L));
  if (ringA > 0) {
    const pulse = (time * .6) % 1;
    ctx.strokeStyle = 'rgba(217,184,120,1)'; ctx.lineWidth = 1 * DPR;
    ctx.globalAlpha = ringA * .9; ctx.beginPath(); ctx.arc(sx, sy, 20 * DPR, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = ringA * (1 - pulse) * .7; ctx.beginPath(); ctx.arc(sx, sy, (20 + pulse * 26) * DPR, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
