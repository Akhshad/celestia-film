/* =====================================================================
   ZOOM TIMELINE: scroll progress p (0–1) → log-zoom L and globe rotation
   ===================================================================== */
import { easeIn2, easeInOut, easeOut3, lerp, sstep } from './util';
import { view } from './view';
import { NAG } from './geo/data';
import { SITE } from './config';

/** Scale constants: KS = solar px per unit at L = 0, KE = earth radius per e^L. */
export const scale = { KS: 1, KE: 1 };
/** Log-zoom of each stop on the journey. */
export const LK = { sun: 0, sys: 0, earth: 0, globe: 0, ind: 0, nag: 0 };

// [p, L, easing]  easing: 0 linear, 1 in-out, 2 in, 3 out
let KEYS: number[][] = [];
// [L, lon, lat]
let ROTK: number[][] = [];

export function buildKeys() {
  const { DPR, MIN, W, H, PORTRAIT } = view;
  const KS = (scale.KS = 6 * DPR / 70);
  const KE = (scale.KE = 0.0075 * KS);
  const Lsun = Math.log(70);
  const Lsys = Math.log((PORTRAIT ? .46 : .44) * MIN / KS);
  const Learth = Math.log(.032 * MIN / KE);
  const Lglobe = Math.log((PORTRAIT ? .42 : .36) * MIN / KE);
  const Lind = Math.log(Math.min(1.5 * H, 1.8 * W) / KE);
  const Lnag = Math.log(30 * MIN / KE);
  Object.assign(LK, { sun: Lsun, sys: Lsys, earth: Learth, globe: Lglobe, ind: Lind, nag: Lnag });
  KEYS = [[0, 0], [.03, 0, 2], [.17, Lsun, 0], [.22, Lsys, 3], [.265, Lsys + .16, 1], [.335, Learth, 2], [.41, Lglobe, 3], [.47, Lglobe + .12, 1], [.545, Lind, 1], [.58, Lind + .08, 1], [.645, Lnag, 1],
    // the dive keeps going (satellite imagery sharpens) until the clouds take over
    [.70, Lnag + 1.5, 1], [.74, Lnag + 2.9, 0], [.80, Lnag + 3.5, 0], [1, Lnag + 3.9, 0]];
  ROTK = [[Learth - .1, 30, 6], [Lglobe, 80.5, 22], [Lind, 82, 22.6], [Lnag, NAG[0], NAG[1]], [Lnag + 2.5, SITE[0], SITE[1]]];
}

export function Lat(p: number) {
  for (let i = 1; i < KEYS.length; i++) {
    if (p <= KEYS[i][0]) {
      const a = KEYS[i - 1], b = KEYS[i]; let t = (p - a[0]) / (b[0] - a[0]);
      const e = b[2] || 0; t = e === 1 ? easeInOut(t) : e === 2 ? easeIn2(t) : e === 3 ? easeOut3(t) : t;
      return lerp(a[1], b[1], t);
    }
  }
  return KEYS[KEYS.length - 1][1];
}

export function rotAt(L: number): [number, number] {
  if (L <= ROTK[0][0]) return [ROTK[0][1], ROTK[0][2]];
  for (let i = 1; i < ROTK.length; i++) {
    if (L <= ROTK[i][0]) { const a = ROTK[i - 1], b = ROTK[i]; const t = sstep(a[0], b[0], L); return [lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  }
  const z = ROTK[ROTK.length - 1]; return [z[1], z[2]];
}
