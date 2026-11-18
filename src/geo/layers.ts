import { D2R, clamp, sstep, R, seed } from '../util';
import { view } from '../view';
import { INDIA, INDIA_ISLES, EURASIA, AFRICA, ISLANDS, HOLES, NAG, CITIES, NEIGH_CITIES, TOWNS } from './data';

interface Poly { a: number[]; x0: number; x1: number; y0: number; y1: number }

function prepPoly(a: number[]): Poly {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]); }
  return { a, x0, x1, y0, y1 };
}
function inPoly(P: Poly, x: number, y: number) {
  if (x < P.x0 || x > P.x1 || y < P.y0 || y > P.y1) return false;
  const a = P.a; let c = false;
  for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
    const xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
const PI_IND = prepPoly(INDIA);
const P_LAND = [EURASIA, AFRICA, ...ISLANDS].map(prepPoly);
const P_HOLE = HOLES.map(prepPoly);
const isIndia = (x: number, y: number) => inPoly(PI_IND, x, y);
const isNeighbour = (x: number, y: number) => {
  if (isIndia(x, y)) return false;
  for (const P of P_LAND) if (inPoly(P, x, y)) { for (const Q of P_HOLE) if (inPoly(Q, x, y)) return false; return true; }
  return false;
};
const isLand = (x: number, y: number) => isIndia(x, y) || isNeighbour(x, y);
function lights(list: [number, number, number][], x: number, y: number, sig: number) {
  const cl = Math.cos(y * D2R); let s = 0;
  for (const c of list) { const dx = (x - c[0]) * cl, dy = y - c[1]; s += c[2] * Math.exp(-(dx * dx + dy * dy) / (sig * sig)); }
  return s;
}
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): [number, number] {
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy), 0, 1);
  const dx = wx - vx * t, dy = wy - vy * t;
  return [Math.sqrt(dx * dx + dy * dy), t];
}

/** A dot layer: sin/cos of lon/lat + brightness, plus per-frame projection scratch buffers. */
export interface Layer {
  n: number;
  sl: Float32Array; cl: Float32Array; sp: Float32Array; cp: Float32Array; b: Float32Array;
  px: Float32Array; py: Float32Array; pb: Uint8Array;
}

function makeLayer(lonA: number, lonB: number, latA: number, latB: number, step: number,
  test: (x: number, y: number) => boolean, bright: (x: number, y: number) => number, jitter: number) {
  const pts: number[] = [];
  let row = 0;
  for (let lat = latA; lat <= latB; lat += step, row++) {
    const ls = step / Math.max(0.15, Math.cos(lat * D2R));
    for (let lon = lonA + (row % 2) * ls * 0.5; lon <= lonB; lon += ls) {
      let x = lon, y = lat;
      if (jitter) { x += (R() - .5) * ls * jitter; y += (R() - .5) * step * jitter; }
      if (!test(x, y)) continue;
      pts.push(x, y, bright(x, y));
    }
  }
  return packLayer(pts);
}
function packLayer(pts: number[]): Layer {
  const n = pts.length / 3;
  const L: Layer = { n, sl: new Float32Array(n), cl: new Float32Array(n), sp: new Float32Array(n), cp: new Float32Array(n), b: new Float32Array(n), px: new Float32Array(n), py: new Float32Array(n), pb: new Uint8Array(n) };
  for (let i = 0; i < n; i++) {
    const lo = pts[i * 3] * D2R, la = pts[i * 3 + 1] * D2R;
    L.sl[i] = Math.sin(lo); L.cl[i] = Math.cos(lo); L.sp[i] = Math.sin(la); L.cp[i] = Math.cos(la); L.b[i] = pts[i * 3 + 2];
  }
  return L;
}

/** LAY0 world land, LAY1 neighbours, LAY2 India (city lights), LAY3 Nagpur close-up. */
export const layers = {} as { LAY0: Layer; LAY1: Layer; LAY2: Layer; LAY3: Layer };

export function buildLayers() {
  const SMALL = view.SMALL;
  seed(42);
  layers.LAY0 = makeLayer(-180, 180, -58, 82, SMALL ? 1.5 : 1.2, isLand, (x, y) => isIndia(x, y) ? 1 : .5 + R() * .15, 0);
  layers.LAY1 = makeLayer(48, 112, -11, 46, SMALL ? 0.75 : 0.6, isNeighbour, (x, y) => clamp(.24 + R() * .1 + .55 * lights(NEIGH_CITIES, x, y, .55), 0, .8), .35);
  const ind: number[] = [];
  const step = SMALL ? 0.36 : 0.3; let row = 0;
  for (let lat = 6; lat <= 37.5; lat += step, row++) {
    const ls = step / Math.cos(lat * D2R);
    for (let lon = 67.5 + (row % 2) * ls * .5; lon <= 98; lon += ls) {
      const x = lon + (R() - .5) * ls * .3, y = lat + (R() - .5) * step * .3;
      if (isIndia(x, y)) ind.push(x, y, clamp(.42 + R() * .12 + .7 * lights(CITIES, x, y, .55), 0, 1));
    }
  }
  for (const s of INDIA_ISLES) ind.push(s[0], s[1], .4);
  layers.LAY2 = packLayer(ind);
  const st = SMALL ? 0.034 : 0.027;
  const cl3 = Math.cos(NAG[1] * D2R);
  layers.LAY3 = makeLayer(NAG[0] - 2.0, NAG[0] + 2.0, NAG[1] - 1.9, NAG[1] + 1.9, st, (x, y) => Math.hypot((x - NAG[0]) * cl3, y - NAG[1]) < 1.85, (x, y) => {
    const dx = (x - NAG[0]) * cl3, dy = y - NAG[1], d2 = dx * dx + dy * dy, ang = Math.atan2(dy, dx);
    const urban = .13 * (1 + .28 * Math.sin(ang * 3 + 1) + .18 * Math.sin(ang * 5 + 2.3));
    let b = .1 + R() * .1 + .95 * Math.exp(-d2 / (urban * urban)) + .3 * Math.exp(-d2 / .06);
    for (const t of TOWNS) {
      const [d, u] = segDist(x * cl3, y, NAG[0] * cl3, NAG[1], t[0] * cl3, t[1]);
      b += .3 * Math.exp(-d * d / .0005) * (1 - .6 * u);
      const tx = (x - t[0]) * cl3, ty = y - t[1];
      b += t[2] * 1.4 * Math.exp(-(tx * tx + ty * ty) / .0022);
    }
    b *= 1 - sstep(1.3, 1.85, Math.sqrt(d2));
    return clamp(b, 0, 1);
  }, .75);
}
