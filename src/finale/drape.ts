/* Drape geometry: a satin sheet that falls over the building and hangs to just above the canopy,
   plus the gold lettering printed on it. Units are metres in the model's space. */
import * as THREE from 'three';
import { clamp, lerp, sstep, mk, ctx2d, spaced } from '../util';
import { DRAPE_TOP, DRAPE_MAIN, DRAPE_BOTTOM } from '../config';

export const DR = { HX: 34.25, ZB: -15.75, ZF: 17.1, R0: .6, HEM: 8.6, YH: 96 };

// x0, x1, z0, z1, top: rooftop structures and pavilion parapets the cloth must clear
const DR_BOXES = [
  [-30.5, -25.5, 7.5, 11.5, 34.6], [23.5, 29.0, -9.0, -4.5, 34.6], [-4.0, 4.0, 7.0, 11.0, 33.4],
  [24.9, 30.1, 7.4, 9.6, 33.2], [-30.6, -25.4, -7.1, -4.9, 33.2],
  [-33.8, -20.2, 14.6, 17.1, 33.0], [-8.8, 1.8, 14.6, 17.1, 32.8], [12.2, 33.8, 14.6, 17.1, 33.5]];

function drapeTop(x: number, z: number) {
  const sb = (v: number, a: number, b: number, w: number) => sstep(a, a + w, v) * (1 - sstep(b - w, b, v));
  let y = 32.6;
  y -= 9.0 * sb(x, -20.5, 12.5, 6) * sb(z, -26, 5.5, 6);           // sags over the lower hall between the wings
  for (const [x0, x1, z0, z1, top] of DR_BOXES) {
    const w = 2.2, h = top + .45 - 32.6;
    y = Math.max(y, 32.6 + h * sb(x, x0 - w - .3, x1 + w + .3, w) * sb(z, z0 - w - .3, z1 + w + 6, w));
  }
  return y;
}

type V3 = [number, number, number];

/** Attributes: position = final draped shape, aI = start (high above), normal, uv, aQ = (v down the skirt, perimeter s, front flag). */
export function buildDrapeGeometry() {
  const { HX, ZB, ZF, R0, HEM, YH } = DR;
  const F: number[] = [], I: number[] = [], Nn: number[] = [], T: number[] = [], Q: number[] = [], idx: number[] = [];
  let count = 0;
  const push = (f: V3, i: V3, n: V3, t: [number, number], q: V3) => {
    F.push(...f); I.push(...i); Nn.push(...n); T.push(...t); Q.push(...q); return count++;
  };
  // top sheet
  const NX = 76, NZ = 36, e = .5;
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = -HX + 2 * HX * i / NX, z = ZB + (ZF - ZB) * j / NZ, y = drapeTop(x, z) + .05;
    const gx = (drapeTop(x + e, z) - drapeTop(x - e, z)) / (2 * e), gz = (drapeTop(x, z + e) - drapeTop(x, z - e)) / (2 * e), l = Math.hypot(gx, 1, gz);
    push([x, y, z], [x, YH + 1.2 * Math.sin(x * .09) * Math.cos(z * .13), z], [-gx / l, 1 / l, -gz / l], [(x + HX) / (2 * HX), .5 + .5 * (z - ZB) / (ZF - ZB)], [0, x, 0]);
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i; idx.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2); }

  // perimeter of the top (rounded rectangle), walked front-left -> front-right -> back-right -> back-left
  interface Pt { x: number; z: number; nx: number; nz: number; front: boolean; corner?: boolean; s: number }
  const per: Pt[] = [];
  const step = .45;
  const straight = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, front: boolean) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) { const t = k / n; per.push({ x: lerp(x0, x1, t), z: lerp(z0, z1, t), nx, nz, front, s: 0 }); }
  };
  const arcFrom = (cx: number, cz: number, a0: number, a1: number) => {
    for (let k = 0; k < 6; k++) { const a = lerp(a0, a1, k / 6); per.push({ x: cx + R0 * Math.cos(a), z: cz + R0 * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a), front: false, corner: true, s: 0 }); }
  };
  straight(-HX + R0, ZF, HX - R0, ZF, 0, 1, true);
  arcFrom(HX - R0, ZF - R0, Math.PI / 2, 0);
  straight(HX, ZF - R0, HX, ZB + R0, 1, 0, false);
  arcFrom(HX - R0, ZB + R0, 0, -Math.PI / 2);
  straight(HX - R0, ZB, -HX + R0, ZB, 0, -1, false);
  arcFrom(-HX + R0, ZB + R0, -Math.PI / 2, -Math.PI);
  straight(-HX, ZB + R0, -HX, ZF - R0, -1, 0, false);
  arcFrom(-HX + R0, ZF - R0, Math.PI, Math.PI / 2);
  let sAcc = 0; per.forEach((q, i) => { if (i) sAcc += Math.hypot(q.x - per[i - 1].x, q.z - per[i - 1].z); q.s = sAcc; });
  const P = sAcc + Math.hypot(per[0].x - per[per.length - 1].x, per[0].z - per[per.length - 1].z);
  const corners = per.filter(q => q.corner).map(q => q.s);
  const NS = per.length, NK = 32;

  // skirt: final positions per perimeter point, k = 0 at the roof edge … NK at the hem
  const fin: number[][][] = [];
  for (let i = 0; i < NS; i++) {
    const q = per[i]; fin.push([]);
    let cd = 1e9; for (const c of corners) cd = Math.min(cd, Math.abs(q.s - c), P - Math.abs(q.s - c));
    const cb = 1 + .9 * Math.exp(-((cd / 3.2) ** 2));
    const calm = q.front && Math.abs(q.x) < 27.5 ? .3 : 1;
    const ph = q.s * 2 * Math.PI / 4.4 + 1.7 * Math.sin(q.s * .23);
    const f = .6 * Math.sin(ph) + .4 * Math.sin(q.s * 2 * Math.PI / 1.85 + .8);
    const yE = drapeTop(q.x, q.z);
    const yHem = HEM + .45 * Math.sin(ph) * cb * (q.front ? .5 : 1);
    for (let k = 0; k <= NK; k++) {
      const v = k / NK;
      const A = (.12 + 1.5 * Math.pow(v, 1.25)) * cb * calm;
      const o = .3 + .45 * Math.sqrt(Math.min(1, v * 10)) + 1.1 * v * v * cb * (q.front ? .6 : 1) + A * (.5 + .5 * f);
      fin[i].push([q.x + q.nx * o, lerp(yE, yHem, v), q.z + q.nz * o, v, yE - yHem]);
    }
  }
  const base = count;
  for (let i = 0; i < NS; i++) {
    const q = per[i], ip = fin[(i + 1) % NS], im = fin[(i - 1 + NS) % NS];
    for (let k = 0; k <= NK; k++) {
      const p = fin[i][k], v = p[3];
      const Tg = [ip[k][0] - im[k][0], ip[k][1] - im[k][1], ip[k][2] - im[k][2]];
      const a = fin[i][Math.min(NK, k + 1)], b = fin[i][Math.max(0, k - 1)];
      const B = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      let n: V3 = [B[1] * Tg[2] - B[2] * Tg[1], B[2] * Tg[0] - B[0] * Tg[2], B[0] * Tg[1] - B[1] * Tg[0]];
      const nl = Math.hypot(...n) || 1; n = n.map(c => c / nl) as V3;
      if (n[0] * q.nx + n[2] * q.nz < 0) n = n.map(c => -c) as V3;
      const dist = v * p[4] * 1.02 + .3;
      const start: V3 = [q.x + q.nx * dist, YH - .6 * v + 1.2 * Math.sin(q.s * .3), q.z + q.nz * dist];
      const uv: [number, number] = q.front ? [(q.x + HX) / (2 * HX), .5 * clamp((33.9 - p[1]) / 24, 0, .999)] : [0, 0];
      push([p[0], p[1], p[2]], start, n, uv, [v, q.s, q.front ? 1 : 0]);
    }
  }
  for (let i = 0; i < NS; i++) {
    const i2 = (i + 1) % NS;
    for (let k = 0; k < NK; k++) {
      const a = base + i * (NK + 1) + k, b = base + i2 * (NK + 1) + k;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(F, 3));
  g.setAttribute('aI', new THREE.Float32BufferAttribute(I, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(T, 2));
  g.setAttribute('aQ', new THREE.Float32BufferAttribute(Q, 3));
  g.setIndex(idx);
  return g;
}

/** Gold lettering + ornaments printed on the drape (alpha only). Top half = front skirt, bottom half = top sheet. */
export function buildDrapeCanvas() {
  const N = 2048, c = mk(N, N), g = ctx2d(c);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  // ---- front skirt: 68.5 m wide x 24 m tall -> top half of the atlas
  const skW = 2 * DR.HX, skH = 24.0;
  g.save(); g.setTransform(N / skW, 0, 0, (N / 2) / skH, 0, 0);
  g.lineWidth = .16; g.strokeRect(8.4, 1.6, skW - 16.8, skH - 4.4);
  g.lineWidth = .07; g.strokeRect(8.95, 2.15, skW - 17.9, skH - 5.5);
  const dia = (x: number, y: number, s: number) => { g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath(); g.fill(); };
  for (const [x, y] of [[8.4, 1.6], [skW - 8.4, 1.6], [8.4, skH - 2.8], [skW - 8.4, skH - 2.8]]) dia(x, y, .55);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '500 1.75px Jost, Helvetica, Arial, sans-serif';
  spaced(g, DRAPE_TOP, skW / 2, 4.6, .95);
  g.font = 'italic 500 6.6px "Cormorant Garamond", Georgia, "Times New Roman", serif';
  g.fillText(DRAPE_MAIN, skW / 2, 10.4);
  const oy = 15.0;
  g.fillRect(skW / 2 - 9.5, oy - .06, 8.2, .12); g.fillRect(skW / 2 + 1.3, oy - .06, 8.2, .12);
  g.beginPath(); const st = .75, cx = skW / 2;
  g.moveTo(cx, oy - st); g.quadraticCurveTo(cx, oy, cx + st, oy); g.quadraticCurveTo(cx, oy, cx, oy + st); g.quadraticCurveTo(cx, oy, cx - st, oy); g.quadraticCurveTo(cx, oy, cx, oy - st); g.fill();
  g.font = '500 1.35px Jost, Helvetica, Arial, sans-serif';
  spaced(g, DRAPE_BOTTOM, skW / 2, 17.6, 1.0);
  g.restore();
  // ---- top sheet: 68.5 x 32.85 m -> bottom half; front edge at the bottom of the image
  const tW = 2 * DR.HX, tH = DR.ZF - DR.ZB;
  g.save(); g.setTransform(N / tW, 0, 0, (N / 2) / tH, 0, N / 2);
  g.lineWidth = .18; g.strokeRect(2.2, 2.2, tW - 4.4, tH - 4.4);
  g.lineWidth = .08; g.strokeRect(2.9, 2.9, tW - 5.8, tH - 5.8);
  const sx = tW / 2, sy = tH / 2;
  g.lineWidth = .14; g.beginPath(); g.arc(sx, sy, 7.4, 0, Math.PI * 2); g.stroke();
  g.lineWidth = .06; g.beginPath(); g.arc(sx, sy, 6.8, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 - Math.PI / 2, r = i % 2 ? 1.6 : (i % 4 ? 4.2 : 6.2); g.lineTo(sx + r * Math.cos(a), sy + r * Math.sin(a)); }
  g.closePath(); g.fill();
  g.restore();
  // keep the corner texels empty (used by sides without print)
  g.clearRect(0, 0, 8, 8);
  return c;
}
